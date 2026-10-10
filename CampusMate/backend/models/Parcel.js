const mongoose = require('mongoose');

const parcelSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parcelName: { type: String, required: true, trim: true, maxlength: 100 },
  courierName: { type: String, required: true, trim: true, maxlength: 60 },
  trackingNumber: { type: String, default: '', trim: true },
  receivedDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['Ready for Pickup', 'Collected'], default: 'Ready for Pickup', index: true },
  // OTP is never returned unless a route explicitly asks for it (+otp)
  otp: { type: String, default: '', select: false },
  otpAttempts: { type: Number, default: 0, select: false },
  collectedDate: { type: Date, default: null },
  handedOverBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Parcel', parcelSchema);
