   const dns = require('node:dns');
   dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');

async function connectDB() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing in .env');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected');
}
module.exports = connectDB;
