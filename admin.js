const express = require('express');
const router = express.Router();
const config = require('../config');
const db = require('../db');

// Very simple bearer-token protection — good enough for a one-person
// admin view. Replace with real auth (login + sessions) before this
// business has more than one person looking at orders.
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.replace('Bearer ', '');
  if (!config.adminToken || token !== config.adminToken) {
    return res.status(401).json({ error: 'Unauthorized. Provide the correct admin token.' });
  }
  next();
}

// GET /api/admin/orders — list all orders, most recent first
router.get('/orders', requireAdmin, (req, res) => {
  res.json(db.listOrders());
});

// GET /api/admin/orders/:id
router.get('/orders/:id', requireAdmin, (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json(order);
});

// PATCH /api/admin/orders/:id/status — move an order through fulfilment states
// body: { orderStatus: "preparing" | "packed" | "shipped" | "delivered" | "cancelled" | "refunded" }
router.patch('/orders/:id/status', requireAdmin, (req, res) => {
  const allowed = ['order_received', 'payment_confirmed', 'preparing', 'packed', 'shipped', 'delivered', 'cancelled', 'refunded'];
  const { orderStatus } = req.body;
  if (!allowed.includes(orderStatus)) {
    return res.status(400).json({ error: `orderStatus must be one of: ${allowed.join(', ')}` });
  }
  const updated = db.updateOrder(req.params.id, { orderStatus });
  if (!updated) return res.status(404).json({ error: 'Order not found.' });
  res.json(updated);
});

module.exports = router;
