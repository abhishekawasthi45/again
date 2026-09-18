// ============================================================
// PRICING LOGIC — single source of truth for totals.
// The frontend shows a preview of these numbers, but the
// backend recalculates everything from scratch before creating
// a Razorpay order. NEVER trust a total sent from the browser.
// ============================================================

const products = require('./data/products.json');
const coupons = require('./data/coupons.json');
const config = require('./config');
const db = require('./db');

function getProduct(productId) {
  return products.find(p => p.id === productId) || null;
}

function findCoupon(code) {
  if (!code) return null;
  return coupons.find(c => c.code.toUpperCase() === String(code).toUpperCase() && c.active) || null;
}

/**
 * items: [{ productId, quantity }]
 * couponCode: string | null
 * mobile: string | null (used to check firstOrderOnly coupons)
 *
 * Throws an Error with a user-safe .message if something is invalid
 * (bad product id, out of stock, invalid coupon, etc.)
 */
function calculateOrderTotals({ items, couponCode, mobile }) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Cart is empty.');
  }

  let subtotal = 0;
  const lineItems = items.map(({ productId, quantity }) => {
    const product = getProduct(productId);
    if (!product) throw new Error(`Unknown product: ${productId}`);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      throw new Error(`Invalid quantity for ${product.name}.`);
    }
    if (product.stockStatus === 'out_of_stock') {
      throw new Error(`${product.name} is currently out of stock.`);
    }
    const lineTotal = product.price * quantity;
    subtotal += lineTotal;
    return { productId: product.id, name: product.name, unitPrice: product.price, quantity, lineTotal };
  });

  let discount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const coupon = findCoupon(couponCode);
    if (!coupon) throw new Error('This coupon code is not valid.');
    if (subtotal < coupon.minOrderValueInr) {
      throw new Error(`${coupon.code} needs a minimum order of ₹${coupon.minOrderValueInr}.`);
    }
    if (coupon.firstOrderOnly && mobile && db.hasPriorPaidOrder(mobile)) {
      throw new Error(`${coupon.code} is only valid on your first order.`);
    }
    if (coupon.type === 'percent') {
      discount = Math.round(subtotal * (coupon.value / 100));
    } else {
      discount = coupon.value;
    }
    discount = Math.min(discount, coupon.maxDiscountInr, subtotal);
    appliedCoupon = { code: coupon.code, description: coupon.description, discount };
  }

  const afterDiscount = subtotal - discount;
  const deliveryCharge = afterDiscount >= config.delivery.freeAbove ? 0 : config.delivery.charge;
  const total = afterDiscount + deliveryCharge;

  return {
    lineItems,
    subtotal,
    discount,
    appliedCoupon,
    deliveryCharge,
    total, // in rupees
  };
}

module.exports = { calculateOrderTotals, getProduct, findCoupon };
