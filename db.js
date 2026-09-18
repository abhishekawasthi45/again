// ============================================================
// SIMPLE FILE-BASED ORDER STORE
// ------------------------------------------------------------
// This is a real, working data store (orders.json) so the demo
// runs with zero extra setup. It is intentionally simple.
//
// FOR PRODUCTION: swap this file for a real database
// (Postgres/MySQL/MongoDB). Every function below (createOrder,
// getOrder, updateOrder, listOrders) has a single job and a
// single call site elsewhere in the app — replacing the body of
// each function to talk to a real DB is all that's needed;
// nothing else in the codebase has to change.
// ============================================================

const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'data', 'orders.json');

function readAll() {
  if (!fs.existsSync(DB_FILE)) return [];
  const raw = fs.readFileSync(DB_FILE, 'utf-8').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('orders.json is corrupted, starting fresh. Back it up before this happens again.', e);
    return [];
  }
}

function writeAll(orders) {
  fs.writeFileSync(DB_FILE, JSON.stringify(orders, null, 2), 'utf-8');
}

function nextOrderId(orders) {
  const n = orders.length + 1024; // start IDs at a less obviously-sequential number
  return `TW${n}`;
}

function createOrder(orderData) {
  const orders = readAll();
  const id = nextOrderId(orders);
  const order = {
    id,
    razorpayOrderId: null,
    razorpayPaymentId: null,
    paymentStatus: 'pending', // pending | payment_initiated | paid | payment_failed | cancelled | refunded
    orderStatus: 'order_received', // order_received | payment_confirmed | preparing | packed | shipped | delivered | cancelled | refunded
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...orderData,
  };
  orders.push(order);
  writeAll(orders);
  return order;
}

function getOrder(id) {
  return readAll().find(o => o.id === id) || null;
}

function getOrderByRazorpayOrderId(razorpayOrderId) {
  return readAll().find(o => o.razorpayOrderId === razorpayOrderId) || null;
}

function updateOrder(id, patch) {
  const orders = readAll();
  const idx = orders.findIndex(o => o.id === id);
  if (idx === -1) return null;
  orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
  writeAll(orders);
  return orders[idx];
}

function listOrders() {
  return readAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

// Very simple check used for "first order only" coupons — matched by mobile number.
function hasPriorPaidOrder(mobile) {
  return readAll().some(o => o.customer && o.customer.mobile === mobile && o.paymentStatus === 'paid');
}

module.exports = {
  createOrder,
  getOrder,
  getOrderByRazorpayOrderId,
  updateOrder,
  listOrders,
  hasPriorPaidOrder,
};
