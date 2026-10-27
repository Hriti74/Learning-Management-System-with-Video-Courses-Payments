const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const store = require('../store');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');

const sign = (u) =>
  jwt.sign(
    { id: u.id, role: u.role, name: u.name, email: u.email },
    process.env.JWT_SECRET || 'lms_super_secret_jwt_key_2026',
    { expiresIn: '7d' }
  );

// POST /api/auth/register
router.post(
  '/register',
  body('name').trim().notEmpty().withMessage('Name is required').escape(),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['student', 'instructor']).withMessage('Role must be student or instructor'),
  validate,
  async (req, res, next) => {
    try {
      const { name, email, password, role } = req.body;
      const existing = store.db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return res.status(409).json({ error: 'Email already registered. Please log in.' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = {
        id: store.newId(),
        name,
        email,
        role,
        passwordHash,
        status: 'active',
        createdAt: new Date().toISOString()
      };

      store.db.users.push(user);
      store.save();

      res.status(201).json({
        message: 'Registration successful',
        token: sign(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      });
    } catch (e) {
      next(e);
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;
      const user = store.db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());

      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      if (user.status === 'blocked') {
        return res.status(403).json({ error: 'Account has been suspended by administrator' });
      }

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      res.json({
        message: 'Login successful',
        token: sign(user),
        user: { id: user.id, name: user.name, email: user.email, role: user.role }
      });
    } catch (e) {
      next(e);
    }
  }
);

// GET /api/auth/me (Get current user and unread notifications)
router.get('/me', protect, (req, res) => {
  const user = store.db.users.find((u) => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const notifications = (store.db.notifications || [])
    .filter((n) => n.userId === req.user.id)
    .slice(-10)
    .reverse();

  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status },
    notifications
  });
});

// PATCH /api/auth/notifications/read-all
router.patch('/notifications/read-all', protect, (req, res) => {
  (store.db.notifications || []).forEach((n) => {
    if (n.userId === req.user.id) n.read = true;
  });
  store.save();
  res.json({ success: true });
});

module.exports = router;
