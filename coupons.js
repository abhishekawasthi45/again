const express = require('express');
const router = express.Router();
const { calculateOrderTotals } = require('../pricing');

// POST /api/coupons/validate
// body: { items: [{productId, quantity}], couponCode, mobile }
// Returns the full recalculated total so the frontend cart always shows
// server-verified numbers, never a client-side guess.
router.post('/validate', (req, res) => {
  const { items, couponCode, mobile } = req.body;
  try {
    const totals = calculateOrderTotals({ items, couponCode, mobile });
    if (couponCode && !totals.appliedCoupon) {
      // Shouldn't happen (calculateOrderTotals throws instead), kept as a safety net.
      return res.status(400).json({ error: 'Coupon could not be applied.' });
    }
    res.json(totals);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
