const router = require('express').Router();
const { body } = require('express-validator');
const store = require('../store');
const { protect, allow } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const eventBus = require('../events/eventBus');

// All admin routes require authentication and admin role
router.use(protect, allow('admin'));

// GET /api/admin/stats (Overview metrics)
router.get('/stats', (req, res) => {
  const users = store.db.users || [];
  const courses = store.db.courses || [];
  const enrollments = store.db.enrollments || [];
  const payments = (store.db.payments || []).filter((p) => p.status === 'success');

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const platformRevenue = totalRevenue * 0.2;
  const instructorShare = totalRevenue * 0.8;

  res.json({
    totalUsers: users.length,
    studentsCount: users.filter((u) => u.role === 'student').length,
    instructorsCount: users.filter((u) => u.role === 'instructor').length,
    totalCourses: courses.length,
    pendingCoursesCount: courses.filter((c) => c.status === 'pending').length,
    approvedCoursesCount: courses.filter((c) => c.status === 'approved').length,
    totalEnrollments: enrollments.length,
    totalRevenue,
    platformRevenue,
    instructorShare
  });
});

// GET /api/admin/courses
router.get('/courses', (req, res) => {
  const courses = store.db.courses || [];
  const enriched = courses.map((c) => {
    const lessons = (store.db.lessons || []).filter((l) => l.courseId === c.id);
    const enrollments = (store.db.enrollments || []).filter((e) => e.courseId === c.id);
    return {
      ...c,
      lessonsCount: lessons.length,
      realEnrollCount: enrollments.length
    };
  });
  res.json(enriched);
});

// PATCH /api/admin/courses/:id/status
router.patch(
  '/courses/:id/status',
  body('status').isIn(['approved', 'rejected', 'pending']).withMessage('Status must be approved, rejected, or pending'),
  body('feedback').optional().trim().escape(),
  validate,
  (req, res) => {
    const courseId = Number(req.params.id);
    const course = store.db.courses.find((c) => c.id === courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const oldStatus = course.status;
    course.status = req.body.status;
    if (req.body.feedback) {
      course.adminFeedback = req.body.feedback;
    }
    course.updatedAt = new Date().toISOString();

    store.save();

    eventBus.emit('course:status_changed', {
      course,
      oldStatus,
      newStatus: course.status
    });

    res.json(course);
  }
);

// GET /api/admin/users
router.get('/users', (req, res) => {
  const users = (store.db.users || []).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status || 'active',
    createdAt: u.createdAt || null
  }));
  res.json(users);
});

// PATCH /api/admin/users/:id/status (Block / Unblock user)
router.patch(
  '/users/:id/status',
  body('status').isIn(['active', 'blocked']).withMessage('Status must be active or blocked'),
  validate,
  (req, res) => {
    const userId = Number(req.params.id);
    const user = (store.db.users || []).find((u) => u.id === userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin' && user.id === req.user.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own admin account' });
    }

    user.status = req.body.status;
    store.save();

    res.json({ id: user.id, name: user.name, status: user.status });
  }
);

// GET /api/admin/reports/revenue (Platform 20%, Instructor 80%)
router.get('/reports/revenue', (req, res) => {
  const payments = (store.db.payments || []).filter((p) => p.status === 'success');
  const payouts = store.db.payouts || [];

  const byInstructor = {};
  let totalRevenue = 0;

  payments.forEach((p) => {
    const course = store.db.courses.find((c) => c.id === p.courseId);
    if (course) {
      totalRevenue += p.amount;
      const instName = course.instructorName || 'Unknown Instructor';
      const instId = course.instructorId;

      if (!byInstructor[instId]) {
        byInstructor[instId] = {
          instructorId: instId,
          instructorName: instName,
          grossSales: 0,
          earnedPayout: 0,
          alreadyPaid: 0,
          balanceDue: 0
        };
      }

      byInstructor[instId].grossSales += p.amount;
      byInstructor[instId].earnedPayout += p.amount * 0.8;
    }
  });

  // Calculate already paid from payouts table
  payouts.forEach((po) => {
    if (byInstructor[po.instructorId]) {
      byInstructor[po.instructorId].alreadyPaid += po.amount;
    }
  });

  // Compute balance due
  Object.values(byInstructor).forEach((item) => {
    item.balanceDue = Math.max(0, item.earnedPayout - item.alreadyPaid);
  });

  const platformFee = totalRevenue * 0.2;

  res.json({
    totalRevenue,
    platformFee,
    instructorPayouts: byInstructor,
    recentPayments: payments.slice(-10).reverse(),
    recentPayouts: payouts.slice(-10).reverse()
  });
});

// POST /api/admin/payouts (Process payout to instructor)
router.post(
  '/payouts',
  body('instructorId').isInt({ min: 1 }).withMessage('Valid instructorId required'),
  body('amount').isFloat({ min: 1 }).withMessage('Payout amount must be greater than 0'),
  body('reference').trim().notEmpty().withMessage('Payment reference required').escape(),
  validate,
  (req, res) => {
    const instructorId = Number(req.body.instructorId);
    const instructor = (store.db.users || []).find((u) => u.id === instructorId && u.role === 'instructor');
    if (!instructor) return res.status(404).json({ error: 'Instructor not found' });

    if (!store.db.payouts) store.db.payouts = [];

    const payout = {
      id: store.newId(),
      instructorId,
      instructorName: instructor.name,
      amount: Number(req.body.amount),
      reference: req.body.reference,
      status: 'processed',
      processedAt: new Date().toISOString()
    };

    store.db.payouts.push(payout);
    store.save();

    eventBus.emit('payout:processed', { payout });

    res.status(201).json(payout);
  }
);

module.exports = router;
