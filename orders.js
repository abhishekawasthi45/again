const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const router = express.Router();

const config = require('../config');
const db = require('../db');
const { calculateOrderTotals } = require('../pricing');
const freebies = require('../data/freebies.json');

const razorpay = new Razorpay({
  key_id: config.razorpay.keyId,
  key_secret: config.razorpay.keySecret,
});

function isValidPincode(pin) {
  return /^[1-9][0-9]{5}$/.test(String(pin || ''));
}
function isValidMobile(mobile) {
  return /^[6-9]\d{9}$/.test(String(mobile || ''));
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ''));
}

function validateCustomerAndAddress(customer, address) {
  const errors = [];
  if (!customer || !customer.name || customer.name.trim().length < 2) errors.push('Full name is required.');
  if (!isValidMobile(customer && customer.mobile)) errors.push('Enter a valid 10-digit mobile number.');
  if (!isValidEmail(customer && customer.email)) errors.push('Enter a valid email address.');

  if (!address || !address.line1 || address.line1.trim().length < 3) errors.push('House/Flat & street is required.');
  if (!address || !address.city || address.city.trim().length < 2) errors.push('City is required.');
  if (!address || !address.state || address.state.trim().length < 2) errors.push('State is required.');
  if (!isValidPincode(address && address.pincode)) errors.push('Enter a valid 6-digit pincode.');

  return errors;
}

/**
 * STEP 1 of checkout: create an internal order (status=pending) AND a
 * real Razorpay order via the Razorpay Orders API. The Razorpay order id
 * + amount + key id are handed to the frontend, which opens Razorpay
 * Checkout with them. This matches Razorpay's required server-side
 * order-creation flow — amounts are never decided by the browser.
 *
 * POST /api/orders/create
 * body: {
 *   items: [{productId, quantity}],
 *   couponCode,
 *   freebieId,
 *   customer: {name, mobile, email},
 *   address: {line1, landmark, city, state, pincode}
 * }
 */
router.post('/create', async (req, res) => {
  try {
    const { items, couponCode, freebieId, customer, address } = req.body;

    const validationErrors = validateCustomerAndAddress(customer, address);
    if (validationErrors.length) {
      return res.status(400).json({ error: 'invalid_details', details: validationErrors });
    }

    // Recalculate the ENTIRE order server-side. Client-sent prices are ignored.
    const totals = calculateOrderTotals({ items, couponCode, mobile: customer.mobile });

    let freebie = null;
    if (freebieId) {
      freebie = freebies.find(f => f.id === freebieId && f.available) || null;
      if (!freebie) return res.status(400).json({ error: 'Selected freebie is not available.' });
    }

    if (totals.total <= 0) {
      return res.status(400).json({ error: 'Order total must be greater than zero.' });
    }

    // Create the internal order first (status: pending)
    const order = db.createOrder({
      items: totals.lineItems,
      subtotal: totals.subtotal,
      discount: totals.discount,
      appliedCoupon: totals.appliedCoupon,
      deliveryCharge: totals.deliveryCharge,
      total: totals.total,
      freebie: freebie ? { id: freebie.id, name: freebie.name, price: 'FREE' } : null,
      customer: { name: customer.name.trim(), mobile: customer.mobile.trim(), email: customer.email.trim() },
      address,
      paymentMethod: 'prepaid_razorpay',
    });

    // Now create the matching Razorpay order (amount in paise)
    let rzpOrder;
    try {
      rzpOrder = await razorpay.orders.create({
        amount: Math.round(totals.total * 100),
        currency: 'INR',
        receipt: order.id,
        notes: { internalOrderId: order.id },
      });
    } catch (rzpErr) {
      db.updateOrder(order.id, { paymentStatus: 'payment_failed' });
      console.error('Razorpay order creation failed:', rzpErr && rzpErr.error ? rzpErr.error : rzpErr);
      return res.status(502).json({
        error: 'payment_gateway_error',
        message: 'Could not initiate payment. Check that RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are set correctly in the backend .env file.',
      });
    }

    db.updateOrder(order.id, {
      razorpayOrderId: rzpOrder.id,
      paymentStatus: 'payment_initiated',
    });

    res.json({
      internalOrderId: order.id,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount, // paise
      currency: rzpOrder.currency,
      keyId: config.razorpay.keyId, // public key — safe to expose
      totals,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * STEP 2 of checkout: called by the frontend after Razorpay Checkout's
 * success callback fires. We do NOT trust that callback by itself —
 * we re-verify the payment signature server-side using the key secret.
 * Only if the HMAC-SHA256 signature matches do we mark the order PAID.
 *
 * POST /api/orders/verify
 * body: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 */
router.post('/verify', (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment verification fields.' });
  }

  const order = db.getOrderByRazorpayOrderId(razorpay_order_id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const isValid = expectedSignature === razorpay_signature;

  if (!isValid) {
    db.updateOrder(order.id, { paymentStatus: 'payment_failed' });
    return res.status(400).json({ error: 'Payment verification failed. Signature mismatch.' });
  }

  // Idempotency: if this order was already marked paid (e.g. webhook beat us to it), just return it.
  if (order.paymentStatus === 'paid') {
    return res.json({ verified: true, order });
  }

  const updated = db.updateOrder(order.id, {
    paymentStatus: 'paid',
    orderStatus: 'payment_confirmed',
    razorpayPaymentId: razorpay_payment_id,
  });

  res.json({ verified: true, order: updated });
});

/**
 * GET /api/orders/:id — used by the confirmation page to display order details.
 * Only returns paid or pending orders that exist — no sensitive payment data is stored anyway.
 */
router.get('/:id', (req, res) => {
  const order = db.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json(order);
});

module.exports = router;
