/**
 * npm run seed          -> creates the admin account (and 2 demo students) if missing
 * npm run seed -- --demo -> also adds demo complaints + parcels so dashboards are not empty
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Complaint = require('../models/Complaint');
const Parcel = require('../models/Parcel');
const ai = require('../services/ai');

async function ensureUser(data) {
  let u = await User.findOne({ email: data.email });
  if (!u) { u = await User.create({ ...data, password: await bcrypt.hash(data.password, 10) }); console.log('created', data.role, data.email); }
  return u;
}

(async () => {
  await connectDB();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@campus.edu').toLowerCase();
  await ensureUser({ name: 'Campus Admin', email: adminEmail, password: process.env.ADMIN_PASSWORD || 'Admin@12345', role: 'admin' });

  if (process.argv.includes('--demo')) {
    const s1 = await ensureUser({ name: 'Priya Sharma', email: 'priya@student.edu', password: 'Student@123', role: 'student', studentId: 'CSE2301', department: 'CSE', year: '3', hostelBlock: 'Block B', roomNo: '204' });
    const s2 = await ensureUser({ name: 'Arun Kumar', email: 'arun@student.edu', password: 'Student@123', role: 'student', studentId: 'CSE2302', department: 'CSE', year: '3', hostelBlock: 'Block A', roomNo: '110' });
    if (!(await Complaint.countDocuments())) {
      const demo = [
        [s1, 'Classroom', 'CSE Block, Room 12', 'Ceiling fan not working and sparks seen near the switch board'],
        [s2, 'Hostel', 'Hostel Block B', 'Water leakage from bathroom pipe, floor is slippery'],
        [s1, 'Canteen', 'Main Canteen', 'Dustbins overflowing and bad smell near the serving area'],
        [s2, 'Washroom', 'Library Block', 'Washroom is very dirty, no water in taps']
      ];
      for (const [u, area, location, description] of demo) {
        const c = ai.classify(description); const a = ai.assess({ text: `${c.category} ${description}`, area });
        await Complaint.create({ userId: u._id, module: c.module, category: c.category, area, location, description, priority: a.priority, severityScore: a.score, aiReason: a.reason, aiKeywords: c.keywords, statusHistory: [{ status: 'Reported', note: 'Complaint submitted', by: u._id }] });
      }
      console.log('demo complaints added');
    }
    if (!(await Parcel.countDocuments())) {
      await Parcel.create({ studentId: s1._id, parcelName: 'Amazon package', courierName: 'Amazon Logistics', trackingNumber: 'AMZ123456', otp: '482913' });
      console.log('demo parcel added (OTP 482913)');
    }
  }
  await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
