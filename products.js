const express = require('express');
const router = express.Router();
const products = require('../data/products.json');
const freebies = require('../data/freebies.json');

// GET /api/products — full catalogue
router.get('/', (req, res) => {
  res.json(products);
});

// GET /api/products/:id — single product
router.get('/:id', (req, res) => {
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json(product);
});

module.exports = router;

// Freebies are simple enough to export from the same file's router root at /api/freebies instead —
// see server.js where this list is mounted separately.
module.exports.freebiesList = freebies;
