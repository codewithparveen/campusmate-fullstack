const express = require('express');
const fs = require('fs');
const path = require('path');
const Complaint = require('../models/Complaint');
const { auth, adminOnly } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { wrap } = require('../middleware/error');
const ai = require('../services/ai');
const { notify, notifyAdmins } = require('../services/notify');
const realtime = require('../services/realtime');

const router = express.Router();
const PRIORITY_ORDER = Complaint.PRIORITIES;
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const populate = q => q.populate('userId', 'name email studentId hostelBlock roomNo');

/**
 * AI preview (no saving) - lets the form show "AI thinks this is Plumbing / High"
 * before the student submits.
 */
router.post('/analyze', auth, wrap(async (req, res) => {
  const { description = '', area = 'Other', module: hint } = req.body;
  if (description.trim().length < 5) return res.json({});
  const c = ai.classify(description, hint);
  const a = ai.assess({ text: description, area });
  res.json({ module: c.module, category: c.category, priority: a.priority, severityScore: a.score, reason: a.reason, keywords: c.keywords });
}));

// Create complaint (multipart/form-data, optional field "image")
router.post('/', auth, upload.single('image'), wrap(async (req, res) => {
  const { description = '', location = '', area = 'Other' } = req.body;
  if (description.trim().length < 5 || !location.trim()) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ message: 'Location and a description (min 5 characters) are required' });
  }
  if (!Complaint.AREAS.includes(area)) return res.status(400).json({ message: 'Invalid area' });

  // 1) AI: module + category (student's choice is only a hint)
  const hint = ['FIXORA', 'CLEANWISE'].includes(req.body.module) ? req.body.module : undefined;
  const cls = ai.classify(`${req.body.category || ''} ${description}`, hint);
  const candidate = { module: cls.module, category: cls.category, area, location, description };

  // 2) AI: duplicate detection against open complaints in the same module + area
  const open = await Complaint.find({ module: cls.module, area, duplicateOf: null, status: { $ne: 'Resolved' } }).sort({ createdAt: -1 }).limit(200).lean();
  const dup = ai.findDuplicate(candidate, open);
  const parent = dup ? dup.complaint : null;   // only original (non-duplicate) complaints are candidates

  // 3) AI: severity / priority (repeated reports raise it)
  const reportCount = parent ? (parent.reportCount || 1) + 1 : 1;
  const a = ai.assess({ text: `${cls.category} ${description}`, area, reportCount });

  const complaint = await Complaint.create({
    userId: req.user._id, ...candidate,
    image: req.file ? `/uploads/${req.file.filename}` : '',
    priority: a.priority, severityScore: a.score, aiReason: a.reason, aiKeywords: cls.keywords,
    duplicateOf: parent ? parent._id : null, similarity: dup ? Number(dup.similarity.toFixed(2)) : 0,
    reportCount: 1,
    statusHistory: [{ status: 'Reported', note: 'Complaint submitted', by: req.user._id }]
  });

  // the original complaint collects the extra reports and may be escalated
  if (parent) {
    const upd = { reportCount };
    const bumped = ai.assess({ text: `${parent.category} ${parent.description}`, area, reportCount });
    if (PRIORITY_ORDER.indexOf(bumped.priority) > PRIORITY_ORDER.indexOf(parent.priority)) {
      upd.priority = bumped.priority; upd.severityScore = bumped.score; upd.aiReason = bumped.reason;
    }
    await Complaint.updateOne({ _id: parent._id }, upd);
    if (upd.priority) {
      await notify(parent.userId, { type: 'complaint', title: 'Your complaint was escalated',
        message: `${reportCount} students reported the same problem at ${parent.location}. Priority is now ${upd.priority}.`, link: 'student.html#overview' });
    }
  }

  await notifyAdmins({ type: 'complaint', title: `New ${a.priority} complaint`, message: `${cls.category} at ${location}`, link: 'admin.html#complaints' });
  const full = await populate(Complaint.findById(complaint._id));
  realtime.toAdmins('complaint:new', full);
  res.status(201).json({ ...full.toObject(), duplicateOfSummary: parent ? { id: parent._id, location: parent.location, category: parent.category } : null });
}));

// List: students see their own, admins see everything. Filters + search + paging.
router.get('/', auth, wrap(async (req, res) => {
  const { status, module, priority, area, q } = req.query;
  const filter = req.user.role === 'admin' ? {} : { userId: req.user._id };
  if (status) filter.status = status;
  if (module) filter.module = module;
  if (priority) filter.priority = priority;
  if (area) filter.area = area;
  if (q) { const r = new RegExp(escRe(String(q).slice(0, 60)), 'i'); filter.$or = [{ description: r }, { location: r }, { category: r }]; }

  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const [items, total] = await Promise.all([
    populate(Complaint.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)),
    Complaint.countDocuments(filter)
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/:id', auth, wrap(async (req, res) => {
  const c = await populate(Complaint.findById(req.params.id));
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  if (req.user.role !== 'admin' && String(c.userId._id) !== String(req.user._id)) return res.status(403).json({ message: 'Not allowed' });
  res.json(c);
}));

// Admin: change status / priority / assignment / note
router.put('/:id', auth, adminOnly, wrap(async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  const { status, priority, assignedTo, adminNote } = req.body;
  if (status && !Complaint.STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status' });
  if (priority && !Complaint.PRIORITIES.includes(priority)) return res.status(400).json({ message: 'Invalid priority' });

  const statusChanged = status && status !== c.status;
  if (priority) c.priority = priority;
  if (assignedTo !== undefined) c.assignedTo = assignedTo;
  if (adminNote !== undefined) c.adminNote = adminNote;
  if (statusChanged) {
    c.status = status;
    c.resolvedAt = status === 'Resolved' ? new Date() : null;
    c.statusHistory.push({ status, note: adminNote || '', by: req.user._id });
  }
  await c.save();

  // tell the student, and every student who reported the same problem
  if (statusChanged) {
    const reporters = [c.userId];
    if (c.reportCount > 1) {
      const dups = await Complaint.find({ duplicateOf: c._id }).select('userId');
      dups.forEach(d => reporters.push(d.userId));
      await Complaint.updateMany({ duplicateOf: c._id }, { status: c.status, resolvedAt: c.resolvedAt });
    }
    const unique = [...new Set(reporters.map(String))];
    await Promise.all(unique.map(uid => notify(uid, { type: 'complaint', title: `Complaint ${status}`,
      message: `${c.category} at ${c.location} is now "${status}".${adminNote ? ' Note: ' + adminNote : ''}`, link: 'student.html#overview' })));
  }
  const full = await populate(Complaint.findById(c._id));
  realtime.toUser(c.userId, 'complaint:updated', full);
  realtime.toAdmins('complaint:updated', full);
  res.json(full);
}));

// Student may delete their own complaint only while it is still "Reported"; admin may delete any
router.delete('/:id', auth, wrap(async (req, res) => {
  const c = await Complaint.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Complaint not found' });
  const isOwner = String(c.userId) === String(req.user._id);
  if (req.user.role !== 'admin') {
    if (!isOwner) return res.status(403).json({ message: 'Not allowed' });
    if (c.status !== 'Reported') return res.status(400).json({ message: 'Only complaints that are still "Reported" can be withdrawn' });
  }
  if (c.image) fs.unlink(path.join(__dirname, '..', c.image), () => {});
  await Complaint.updateMany({ duplicateOf: c._id }, { duplicateOf: null });
  await c.deleteOne();
  realtime.toAdmins('complaint:deleted', { id: c._id });
  res.json({ message: 'Complaint deleted' });
}));

module.exports = router;
