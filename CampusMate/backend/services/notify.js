const Notification = require('../models/Notification');
const User = require('../models/User');
const realtime = require('./realtime');

/** Save a notification and push it live to the user if they are online. */
async function notify(userId, { type = 'system', title, message = '', link = '' }) {
  const n = await Notification.create({ userId, type, title, message, link });
  realtime.toUser(userId, 'notification', n);
  return n;
}

/** Notify every admin. */
async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin' }).select('_id');
  return Promise.all(admins.map(a => notify(a._id, payload)));
}

module.exports = { notify, notifyAdmins };
