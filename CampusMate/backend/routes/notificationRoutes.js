const express = require('express');
const Notification = require('../models/Notification');
const { auth } = require('../middleware/auth');
const { wrap } = require('../middleware/error');

const router = express.Router();

router.get('/', auth, wrap(async (req, res) => {
  const [items, unread] = await Promise.all([
    Notification.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(30),
    Notification.countDocuments({ userId: req.user._id, read: false })
  ]);
  res.json({ items, unread });
}));

router.put('/read-all', auth, wrap(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  res.json({ message: 'All marked as read' });
}));

router.put('/:id/read', auth, wrap(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.user._id }, { read: true });
  res.json({ message: 'Marked as read' });
}));

module.exports = router;
