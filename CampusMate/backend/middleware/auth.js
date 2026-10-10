const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function auth(req, res, next) {
  try {
    const token = getToken(req);
    if (!token) return res.status(401).json({ message: 'Login required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);   // password is select:false
    if (!user) return res.status(401).json({ message: 'Invalid user' });
    req.user = user;
    next();
  } catch (e) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

module.exports = { auth, adminOnly };
