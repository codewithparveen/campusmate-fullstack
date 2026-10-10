const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { auth } = require('../middleware/auth');
const { wrap } = require('../middleware/error');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 50, standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many attempts, try again in a few minutes' } });

const tokenFor = u => jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const publicUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, studentId: u.studentId,
  department: u.department, year: u.year, hostelBlock: u.hostelBlock, roomNo: u.roomNo, phone: u.phone });

// Anyone who registers is a STUDENT. Admins are created by the seed script only.
router.post('/register', limiter, wrap(async (req, res) => {
  const { name, email, password, studentId, department, year, hostelBlock, roomNo, phone } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Name, email and password are required' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  if (String(password).length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
  if (await User.findOne({ email: String(email).toLowerCase() })) return res.status(409).json({ message: 'Email already registered' });
  const u = await User.create({ name, email, password: await bcrypt.hash(password, 10), role: 'student',
    studentId, department, year, hostelBlock, roomNo, phone });
  res.status(201).json({ token: tokenFor(u), user: publicUser(u) });
}));

router.post('/login', limiter, wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const u = await User.findOne({ email: String(email).toLowerCase() }).select('+password');
  if (!u || !(await bcrypt.compare(password, u.password))) return res.status(401).json({ message: 'Invalid email or password' });
  res.json({ token: tokenFor(u), user: publicUser(u) });
}));

router.get('/profile', auth, (req, res) => res.json({ user: publicUser(req.user) }));

router.put('/profile', auth, wrap(async (req, res) => {
  ['name', 'department', 'year', 'hostelBlock', 'roomNo', 'phone', 'studentId'].forEach(k => {
    if (req.body[k] !== undefined) req.user[k] = req.body[k];
  });
  await req.user.save();
  res.json({ user: publicUser(req.user) });
}));

router.put('/password', auth, wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ message: 'New password must be at least 6 characters' });
  const u = await User.findById(req.user._id).select('+password');
  if (!(await bcrypt.compare(oldPassword || '', u.password))) return res.status(400).json({ message: 'Old password is wrong' });
  u.password = await bcrypt.hash(newPassword, 10);
  await u.save();
  res.json({ message: 'Password updated' });
}));

module.exports = router;
