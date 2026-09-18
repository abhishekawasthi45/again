const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const config = require('../config');
const db = require('../db');

/**
 * POST /api/webhook/razorpay
 *
 * OPTIONAL but recommended: Razorpay also calls this endpoint directly
 * (server-to-server) when a payment succeeds or fails, independent of
 * whether the customer's browser stayed open. This is what protects you
 * if the customer closes the tab right after paying, before the frontend
 * gets to call /api/orders/verify.
 *
 * Configure this URL in Razorpay Dashboard > Settings > Webhooks, and
 * set the same secret in RAZORPAY_WEBHOOK_SECRET.
 *
 * IMPORTANT: this route needs the RAW request body to verify the
 * signature, so it's mounted with express.raw() in server.js — not
 * express.json() like the rest of the API.
 */
router.post('/razorpay', (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.body; // Buffer, thanks to express.raw() in server.js

  if (!config.razorpay.webhookSecret) {
    console.warn('RAZORPAY_WEBHOOK_SECRET not set — skipping webhook, relying on client-triggered verification only.');
    return res.status(200).json({ received: true, note: 'webhook secret not configured' });
  }

  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (expected !== signature) {
    console.error('Webhook signature mismatch — ignoring event.');
    return res.status(400).json({ error: 'invalid signature' });
  }

  const event = JSON.parse(rawBody.toString('utf-8'));

  if (event.event === 'payment.captured') {
    const payment = event.payload.payment.entity;
    const order = db.getOrderByRazorpayOrderId(payment.order_id);
    if (order && order.paymentStatus !== 'paid') {
      db.updateOrder(order.id, {
        paymentStatus: 'paid',
        orderStatus: 'payment_confirmed',
        razorpayPaymentId: payment.id,
      });
      console.log(`Order ${order.id} marked PAID via webhook.`);
    }
  }

  if (event.event === 'payment.failed') {
    const payment = event.payload.payment.entity;
    const order = db.getOrderByRazorpayOrderId(payment.order_id);
    if (order && order.paymentStatus !== 'paid') {
      db.updateOrder(order.id, { paymentStatus: 'payment_failed' });
    }
  }

  res.status(200).json({ received: true });
});

module.exports = router;
