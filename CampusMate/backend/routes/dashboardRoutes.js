const express = require('express');
const Complaint = require('../models/Complaint');
const Parcel = require('../models/Parcel');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');
const { wrap } = require('../middleware/error');

const router = express.Router();
const countBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); m[k] = (m[k] || 0) + 1; return m; }, {});
const dayKey = d => new Date(d).toISOString().slice(0, 10);

/** Public numbers for the landing page (no personal data). */
router.get('/public', wrap(async (req, res) => {
  const [complaints, pendingParcels] = await Promise.all([
    Complaint.find({ duplicateOf: null }).select('module status priority category location area reportCount createdAt').sort({ createdAt: -1 }).lean(),
    Parcel.countDocuments({ status: 'Ready for Pickup' })
  ]);
  const open = complaints.filter(c => c.status !== 'Resolved');
  // "AI insight": the place with most open reports
  const byLoc = countBy(open, c => c.location.trim().toLowerCase());
  const topKey = Object.keys(byLoc).sort((a, b) => byLoc[b] - byLoc[a])[0];
  const top = open.find(c => c.location.trim().toLowerCase() === topKey);
  res.json({
    maintenance: complaints.filter(c => c.module === 'FIXORA').length,
    cleanliness: complaints.filter(c => c.module === 'CLEANWISE').length,
    pendingParcels,
    resolved: complaints.filter(c => c.status === 'Resolved').length,
    insight: top ? `${byLoc[topKey]} open issue${byLoc[topKey] > 1 ? 's' : ''} reported at ${top.location} - most recent: ${top.category} (${top.priority}).` : 'No open issues right now. Campus looks great!',
    recent: complaints.slice(0, 6).map(c => ({ category: c.category, location: c.location, module: c.module, priority: c.priority, status: c.status, reports: c.reportCount }))
  });
}));

/** Student dashboard numbers. */
router.get('/student', auth, wrap(async (req, res) => {
  const [complaints, parcels] = await Promise.all([
    Complaint.find({ userId: req.user._id }).select('status priority module').lean(),
    Parcel.find({ studentId: req.user._id }).select('status').lean()
  ]);
  res.json({
    total: complaints.length,
    open: complaints.filter(c => c.status !== 'Resolved').length,
    resolved: complaints.filter(c => c.status === 'Resolved').length,
    byStatus: countBy(complaints, c => c.status),
    parcelsWaiting: parcels.filter(p => p.status === 'Ready for Pickup').length,
    parcelsCollected: parcels.filter(p => p.status === 'Collected').length
  });
}));

/** Admin dashboard + analytics (everything computed from the DB). */
router.get('/admin', auth, adminOnly, wrap(async (req, res) => {
  const [all, parcels, students] = await Promise.all([
    Complaint.find().lean(), Parcel.find().select('status createdAt collectedDate').lean(), User.countDocuments({ role: 'student' })
  ]);
  const open = all.filter(c => c.status !== 'Resolved');
  const resolved = all.filter(c => c.resolvedAt);
  const avgHours = resolved.length ? resolved.reduce((s, c) => s + (new Date(c.resolvedAt) - new Date(c.createdAt)), 0) / resolved.length / 36e5 : 0;

  // last 7 days trend
  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    trend.push({ date: k, reported: all.filter(c => dayKey(c.createdAt) === k).length, resolved: all.filter(c => c.resolvedAt && dayKey(c.resolvedAt) === k).length });
  }
  // group places case-insensitively ("Hostel Block B" == "hostel block b"), show the first spelling
  const label = {};
  const hot = countBy(open, c => { const k = `${c.area} - ${c.location.trim().replace(/\s+/g, ' ')}`; const lk = k.toLowerCase(); label[lk] = label[lk] || k; return lk; });
  res.json({
    totals: {
      complaints: all.length, open: open.length, resolved: all.length - open.length,
      critical: open.filter(c => c.priority === 'Critical').length,
      students, pendingParcels: parcels.filter(p => p.status === 'Ready for Pickup').length,
      collectedParcels: parcels.filter(p => p.status === 'Collected').length,
      avgResolutionHours: Number(avgHours.toFixed(1))
    },
    byModule: countBy(all, c => c.module),
    byStatus: countBy(all, c => c.status),
    byPriority: countBy(all, c => c.priority),
    byArea: countBy(all, c => c.area),
    byCategory: countBy(all, c => c.category),
    trend,
    hotspots: Object.entries(hot).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([place, count]) => ({ place: label[place], count })),
    repeated: all.filter(c => c.reportCount > 1 && c.status !== 'Resolved').sort((a, b) => b.reportCount - a.reportCount).slice(0, 5)
      .map(c => ({ id: c._id, category: c.category, location: c.location, reports: c.reportCount, priority: c.priority }))
  });
}));

module.exports = router;
