const mongoose = require('mongoose');

const AREAS = ['Classroom', 'Hostel', 'Library', 'Canteen', 'Washroom', 'Lab', 'Ground', 'Other'];
const STATUSES = ['Reported', 'Under Review', 'Assigned', 'In Progress', 'Resolved'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const complaintSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  module: { type: String, enum: ['FIXORA', 'CLEANWISE'], required: true },   // maintenance | cleanliness
  category: { type: String, required: true, trim: true },
  area: { type: String, enum: AREAS, default: 'Other' },                    // classroom / hostel / ...
  location: { type: String, required: true, trim: true, maxlength: 120 },   // "Block B, Room 204"
  description: { type: String, required: true, trim: true, maxlength: 1500 },
  image: { type: String, default: '' },

  // --- set by the AI engine (services/ai.js) ---
  priority: { type: String, enum: PRIORITIES, default: 'Medium' },
  severityScore: { type: Number, default: 0 },          // 0-100
  aiReason: { type: String, default: '' },              // human readable explanation
  aiKeywords: [String],
  duplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint', default: null },
  similarity: { type: Number, default: 0 },             // 0-1 text similarity with duplicateOf
  reportCount: { type: Number, default: 1 },            // 1 + number of similar reports merged into this one

  status: { type: String, enum: STATUSES, default: 'Reported', index: true },
  assignedTo: { type: String, default: '', trim: true }, // staff name / team
  adminNote: { type: String, default: '', trim: true },
  resolvedAt: { type: Date, default: null },
  statusHistory: [{
    status: String,
    note: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
    _id: false
  }]
}, { timestamps: true });

complaintSchema.statics.AREAS = AREAS;
complaintSchema.statics.STATUSES = STATUSES;
complaintSchema.statics.PRIORITIES = PRIORITIES;

module.exports = mongoose.model('Complaint', complaintSchema);
