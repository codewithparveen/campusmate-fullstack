const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const dir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(dir, { recursive: true });

const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: dir,
    // random name + extension taken from the verified mime type, never from the user's file name
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + TYPES[file.mimetype])
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => TYPES[file.mimetype] ? cb(null, true) : cb(new Error('Only JPG, PNG, WEBP or GIF images are allowed'))
});

module.exports = upload;
