const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io = null;

function init(server) {
  const { Server } = require('socket.io');
  io = new Server(server);

  // only logged-in users may connect
  io.use(async (socket, next) => {
    try {
      const decoded = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('Invalid user'));
      socket.data.user = user;
      next();
    } catch { next(new Error('Unauthorized')); }
  });

  io.on('connection', socket => {
    const u = socket.data.user;
    socket.join(`user:${u._id}`);
    if (u.role === 'admin') socket.join('admins');
  });
  return io;
}

const toUser = (userId, event, payload) => io && io.to(`user:${userId}`).emit(event, payload);
const toAdmins = (event, payload) => io && io.to('admins').emit(event, payload);

module.exports = { init, toUser, toAdmins };
