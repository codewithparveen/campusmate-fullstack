const multer = require('multer');

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : err.message });
  }
  if (err.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors).map(e => e.message).join(', ') });
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid id' });
  if (err.code === 11000) return res.status(409).json({ message: 'Already exists' });
  if (err.message && /allowed/.test(err.message)) return res.status(400).json({ message: err.message });
  console.error(err);
  res.status(500).json({ message: 'Something went wrong on the server' });
}

module.exports = { wrap, notFound, errorHandler };
