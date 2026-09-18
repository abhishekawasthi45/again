const express = require('express');
const router = express.Router();
const freebies = require('../data/freebies.json');

// GET /api/freebies — only ever returns freebies marked available
router.get('/', (req, res) => {
  res.json(freebies.filter(f => f.available));
});

module.exports = router;
