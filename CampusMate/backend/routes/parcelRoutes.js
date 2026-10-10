const express = require('express');
const crypto = require('crypto');
const Parcel = require('../models/Parcel');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { wrap } = require('../middleware/error');
const { notify } = require('../services/notify');
const realtime = require('../services/realtime');

const router = express.Router();
const MAX_OTP_TRIES = 5;
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const makeOtp = () => String(crypto.randomInt(100000, 1000000));   // cryptographically random 6 digits

// Admin (hostel warden / desk) registers an incoming parcel for a student.
// Student can be given by _id, roll number (studentId) or email.
router.post('/', auth, adminOnly, wrap(async (req, res) => {
  const { student, parcelName, courierName, trackingNumber = '' } = req.body;
  if (!student || !parcelName || !courierName) return res.status(400).json({ message: 'Student, parcel name and courier are required' });

  const key = String(student).trim();
  const user = await User.findOne({ role: 'student', $or: [
    { studentId: key }, { email: key.toLowerCase() }, ...(/^[a-f0-9]{24}$/i.test(key) ? [{ _id: key }] : [])
  ] });
  if (!user) return res.status(404).json({ message: 'No student found with that roll number / email' });

  const otp = makeOtp();
  const p = await Parcel.create({ studentId: user._id, parcelName, courierName, trackingNumber, otp });
  await notify(user._id, { type: 'parcel', title: 'Parcel arrived 📦',
    message: `${parcelName} (${courierName}) is ready for pickup. Show your OTP at the hostel desk.`, link: 'student.html#parcels' });
  const full = await Parcel.findById(p._id).populate('studentId', 'name email studentId hostelBlock roomNo');
  realtime.toUser(user._id, 'parcel:updated', { id: p._id });
  res.status(201).json(full);       // OTP is NOT sent to the admin - only the student sees it
}));

// Student: own parcels incl. OTP (only while waiting).  Admin: all parcels, no OTP.
router.get('/', auth, wrap(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const filter = isAdmin ? {} : { studentId: req.user._id };
  if (req.query.status) filter.status = req.query.status;
  let q = Parcel.find(filter).populate('studentId', 'name email studentId hostelBlock roomNo').sort({ createdAt: -1 }).limit(200);
  if (!isAdmin) q = q.select('+otp');
  let items = await q;
  if (isAdmin && req.query.q) {
    const r = new RegExp(escRe(String(req.query.q).slice(0, 60)), 'i');
    items = items.filter(p => r.test(p.parcelName) || r.test(p.courierName) || r.test(p.trackingNumber) ||
      r.test(p.studentId?.name || '') || r.test(p.studentId?.studentId || ''));
  }
  res.json({ items: items.map(p => { const o = p.toObject(); if (o.status === 'Collected') delete o.otp; return o; }) });
}));

// Admin: hand the parcel over after the student tells the OTP
router.put('/:id/verify-otp', auth, adminOnly, wrap(async (req, res) => {
  const p = await Parcel.findById(req.params.id).select('+otp +otpAttempts');
  if (!p) return res.status(404).json({ message: 'Parcel not found' });
  if (p.status === 'Collected') return res.status(400).json({ message: 'Parcel already collected' });
  if (p.otpAttempts >= MAX_OTP_TRIES) return res.status(429).json({ message: 'Too many wrong OTPs. Ask the student to contact the warden.' });

  const given = String(req.body.otp || '').trim();
  const ok = given.length === p.otp.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(p.otp));
  if (!ok) {
    p.otpAttempts += 1; await p.save();
    return res.status(400).json({ message: `Invalid OTP (${MAX_OTP_TRIES - p.otpAttempts} attempts left)` });
  }
  p.status = 'Collected'; p.collectedDate = new Date(); p.handedOverBy = req.user._id; p.otp = '';
  await p.save();
  await notify(p.studentId, { type: 'parcel', title: 'Parcel collected ✅', message: `${p.parcelName} was handed over to you.`, link: 'student.html#parcels' });
  realtime.toUser(p.studentId, 'parcel:updated', { id: p._id });
  const full = await Parcel.findById(p._id).populate('studentId', 'name email studentId');
  res.json(full);
}));

router.delete('/:id', auth, adminOnly, wrap(async (req, res) => {
  const p = await Parcel.findByIdAndDelete(req.params.id);
  if (!p) return res.status(404).json({ message: 'Parcel not found' });
  res.json({ message: 'Parcel entry removed' });
}));

module.exports = router;
