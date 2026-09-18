const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const productsRouter = require('./routes/products');
const freebiesRouter = require('./routes/freebies');
const couponsRouter = require('./routes/coupons');
const ordersRouter = require('./routes/orders');
const webhookRouter = require('./routes/webhook');
const adminRouter = require('./routes/admin');

const app = express();

// CORS — only allow the frontend origins listed in .env (ALLOWED_ORIGINS)
app.use(cors({
  origin: function (origin, callback) {
    // allow tools like curl/postman (no origin) and any configured origin
    if (!origin || config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
}));

// Webhook route needs the RAW body for signature verification —
// must be registered BEFORE express.json() below.
app.use('/api/webhook', express.raw({ type: 'application/json' }), webhookRouter);

app.use(express.json());

// Startup sanity checks — fail loudly instead of silently taking fake payments
if (!config.razorpay.keyId || !config.razorpay.keySecret) {
  console.warn('\n⚠️  RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set in backend/.env');
  console.warn('   Payment creation will fail until you add your Razorpay TEST keys.\n');
}
if (!config.adminToken) {
  console.warn('⚠️  ADMIN_TOKEN is not set — /api/admin routes will reject all requests until you set one.\n');
}

app.use('/api/products', productsRouter);
app.use('/api/freebies', freebiesRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/admin', adminRouter);

app.get('/api/config/public', (req, res) => {
  // Only ever expose PUBLIC, non-secret config to the frontend.
  res.json({
    brand: config.brand,
    delivery: config.delivery,
    prepaidOnly: config.prepaidOnly,
  });
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(config.port, () => {
  console.log(`\n🌷 Tendril & Twine backend running on http://localhost:${config.port}`);
  console.log(`   Health check: http://localhost:${config.port}/health\n`);
});
