const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  studentId: { type: String, trim: true, index: true },   // roll / register number
  department: { type: String, trim: true },
  year: { type: String, trim: true },
  hostelBlock: { type: String, trim: true },
  roomNo: { type: String, trim: true },
  phone: { type: String, trim: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
