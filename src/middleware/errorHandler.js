const { validationResult } = require('express-validator');

// Runs after validation rules; stops the request if any rule failed
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array().map(e => ({ field: e.path, message: e.msg })) });
  next();
}
function notFound(req, res) {
  res.status(404).json({ error: 'Route not found' });
}
// Central error handling middleware (4 arguments)
function errorHandler(err, req, res, next) {
  console.error('ERROR:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
}
module.exports = { validate, notFound, errorHandler };
