const express = require('express');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { wrap } = require('../middleware/error');

const router = express.Router();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Admin: search students (used by the "add parcel" form)
router.get('/students', auth, adminOnly, wrap(async (req, res) => {
  const filter = { role: 'student' };
  if (req.query.q) {
    const r = new RegExp(escRe(String(req.query.q).slice(0, 40)), 'i');
    filter.$or = [{ name: r }, { email: r }, { studentId: r }];
  }
  res.json({ items: await User.find(filter).select('name email studentId department year hostelBlock roomNo').sort({ name: 1 }).limit(20) });
}));

module.exports = router;
