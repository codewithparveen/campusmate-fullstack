require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/db');
const realtime = require('./services/realtime');
const { notFound, errorHandler } = require('./middleware/error');

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
  console.error('JWT_SECRET is missing or too short (use at least 16 random characters) in .env');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

app.use(helmet({
  contentSecurityPolicy: false,                         // frontend uses CDN scripts (Chart.js, socket.io)
  crossOriginResourcePolicy: { policy: 'cross-origin' }  // lets the frontend show /uploads images
}));
app.use(cors({ origin: process.env.CLIENT_ORIGIN ? process.env.CLIENT_ORIGIN.split(',') : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ success: true, message: 'CampusMate backend is running' }));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/parcels', require('./routes/parcelRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api', notFound);

// uploaded complaint photos + the website itself (so one command runs everything)
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use(errorHandler);
realtime.init(server);

connectDB()
  .then(() => server.listen(PORT, () => console.log(`CampusMate running at http://localhost:${PORT}`)))
  .catch(e => { console.error('Database connection failed:', e.message); process.exit(1); });
