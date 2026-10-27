const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { body } = require('express-validator');
const store = require('../store');
const { protect, allow } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const eventBus = require('../events/eventBus');

const STREAM_SECRET = process.env.STREAM_SECRET || 'lms_stream_secure_token_secret_key_2026';

// Helper: check if user is enrolled
const isEnrolled = (userId, courseId) =>
  (store.db.enrollments || []).some((e) => e.userId === userId && e.courseId === courseId);

// Helper: calculate course completion percentage
function getCourseProgress(userId, courseId) {
  const lessons = (store.db.lessons || []).filter((l) => l.courseId === courseId);
  if (!lessons.length) return 0;
  const completedCount = (store.db.progress || []).filter(
    (p) => p.userId === userId && p.isCompleted && lessons.some((l) => l.id === p.lessonId)
  ).length;
  return Math.round((completedCount / lessons.length) * 100);
}

// Mock payment gateway: checks test card number or allows free course
function mockPaymentGateway(cardNumber, amount) {
  if (amount === 0) {
    return { ok: true, paymentId: 'FREE-' + Date.now() + '-' + Math.floor(Math.random() * 1000) };
  }
  const cleanCard = String(cardNumber || '').replace(/[\s-]/g, '');
  if (cleanCard === '4242424242424242') {
    return { ok: true, paymentId: 'PAY-' + Date.now() + '-' + Math.floor(Math.random() * 1000) };
  }
  return { ok: false, error: 'Invalid card details. For testing, please use card number: 4242 4242 4242 4242' };
}

// -------------------------------------------------------------
// Enrollments & Payments
// -------------------------------------------------------------

// POST /api/enrollments
router.post(
  '/enrollments',
  protect,
  allow('student'),
  body('courseId').isInt({ min: 1 }).withMessage('Valid courseId is required'),
  validate,
  (req, res) => {
    const courseId = Number(req.body.courseId);
    const course = store.db.courses.find((c) => c.id === courseId && c.status === 'approved');
    if (!course) return res.status(404).json({ error: 'Course not found or not approved' });

    if (isEnrolled(req.user.id, course.id)) {
      return res.status(409).json({ error: 'You are already enrolled in this course' });
    }

    const paymentResult = mockPaymentGateway(req.body.cardNumber, course.price);
    if (!paymentResult.ok) {
      return res.status(402).json({ error: paymentResult.error });
    }

    const enrollment = {
      id: store.newId(),
      courseId: course.id,
      userId: req.user.id,
      paymentId: paymentResult.paymentId,
      amount: course.price,
      enrolledAt: new Date().toISOString(),
      completedAt: null
    };

    if (!store.db.enrollments) store.db.enrollments = [];
    store.db.enrollments.push(enrollment);

    if (!store.db.payments) store.db.payments = [];
    store.db.payments.push({
      id: store.newId(),
      paymentId: paymentResult.paymentId,
      userId: req.user.id,
      courseId: course.id,
      amount: course.price,
      status: 'success',
      createdAt: new Date().toISOString()
    });

    course.enrollCount = (course.enrollCount || 0) + 1;
    store.save();

    // Trigger Node.js EventEmitter for audit & notification
    eventBus.emit('enrollment:created', {
      user: req.user,
      course,
      paymentId: paymentResult.paymentId,
      amount: course.price
    });

    res.status(201).json({
      message: 'Successfully enrolled!',
      enrollment
    });
  }
);

// GET /api/my-courses (Student's enrolled courses with progress)
router.get('/my-courses', protect, allow('student'), (req, res) => {
  const userEnrollments = (store.db.enrollments || []).filter((e) => e.userId === req.user.id);
  const result = userEnrollments.map((e) => {
    const course = store.db.courses.find((c) => c.id === e.courseId);
    const progressPercent = getCourseProgress(req.user.id, e.courseId);
    return {
      ...e,
      course,
      progressPercent
    };
  });

  res.json(result);
});

// -------------------------------------------------------------
// Course Learning Room (Enrolment Gated)
// -------------------------------------------------------------

// GET /api/learn/:courseId
router.get('/learn/:courseId', protect, (req, res) => {
  const courseId = Number(req.params.courseId);
  const course = store.db.courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  const isInstructorOwner = req.user.role === 'instructor' && course.instructorId === req.user.id;
  const isAdmin = req.user.role === 'admin';
  const enrolled = isEnrolled(req.user.id, courseId);

  if (!isInstructorOwner && !isAdmin && !enrolled) {
    return res.status(403).json({ error: 'Please enrol to access full course content and lessons' });
  }

  const sections = (store.db.sections || [])
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => a.order - b.order);

  const lessons = (store.db.lessons || [])
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => a.order - b.order)
    .map((l) => {
      const userProgress = (store.db.progress || []).find(
        (x) => x.userId === req.user.id && x.lessonId === l.id
      );

      // Sanitize: do not send quiz answers to client
      const safeQuestions =
        l.type === 'quiz' && l.questions
          ? l.questions.map((q) => ({ q: q.q, options: q.options }))
          : undefined;

      return {
        id: l.id,
        sectionId: l.sectionId,
        title: l.title,
        type: l.type,
        order: l.order,
        durationSec: l.durationSec || 0,
        isPreview: !!l.isPreview,
        lastPosition: userProgress ? userProgress.lastPosition : 0,
        isCompleted: userProgress ? userProgress.isCompleted : false,
        questions: safeQuestions,
        instructions: l.instructions,
        transcript: l.transcript || '',
        resources: (l.resources || []).map((r) => ({ id: r.id, title: r.title, originalName: r.originalName }))
      };
    });

  const progressPercent = getCourseProgress(req.user.id, courseId);

  res.json({
    course,
    sections,
    lessons,
    progressPercent
  });
});

// -------------------------------------------------------------
// Secure Video Delivery with Signed URL & HTTP Range Streaming
// -------------------------------------------------------------

// GET /api/lessons/:id/stream-url -> Short-lived signed URL (2 minutes expiry)
router.get('/lessons/:id/stream-url', protect, (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = (store.db.lessons || []).find((l) => l.id === lessonId && l.type === 'video');
  if (!lesson) return res.status(404).json({ error: 'Video lesson not found' });

  // Verification: enrolled or preview
  const enrolled = isEnrolled(req.user.id, lesson.courseId);
  const isInstructor = req.user.role === 'instructor';
  const isAdmin = req.user.role === 'admin';

  if (!lesson.isPreview && !enrolled && !isInstructor && !isAdmin) {
    return res.status(403).json({ error: 'Access denied: Please enrol to watch this video lesson' });
  }

  // Issue temporary signed streaming token (expires in 2 minutes)
  const streamToken = jwt.sign(
    {
      lessonId: lesson.id,
      userId: req.user.id,
      nonce: crypto.randomBytes(8).toString('hex')
    },
    STREAM_SECRET,
    { expiresIn: '2m' }
  );

  res.json({
    url: `/api/stream/${streamToken}`,
    expiresInSeconds: 120
  });
});

// GET /api/stream/:token -> Streams video with HTTP 206 Partial Content using Node.js Core Streams & Buffers
router.get('/stream/:token', (req, res) => {
  let decoded;
  try {
    decoded = jwt.verify(req.params.token, STREAM_SECRET);
  } catch (e) {
    return res.status(403).json({ error: 'Streaming token has expired or is invalid. Please refresh the lesson.' });
  }

  const lesson = (store.db.lessons || []).find((l) => l.id === decoded.lessonId);
  if (!lesson || !lesson.videoFile) {
    return res.status(404).json({ error: 'Video source not found' });
  }

  const filePath = path.join(__dirname, '..', '..', 'uploads', lesson.videoFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Video file is not available on server storage' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  // Node.js Core: HTTP 206 Range Stream
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize) {
      res.status(416).send(`Requested range not satisfiable\n${start} >= ${fileSize}`);
      return;
    }

    const chunksize = end - start + 1;
    const stream = fs.createReadStream(filePath, { start, end });

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    });

    stream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(filePath).pipe(res);
  }
});

// -------------------------------------------------------------
// Throttled Progress Tracking
// -------------------------------------------------------------

// POST /api/progress (Throttled: 1 write per 10s unless completed)
router.post(
  '/progress',
  protect,
  allow('student'),
  body('lessonId').isInt({ min: 1 }).withMessage('lessonId required'),
  body('position').isFloat({ min: 0 }).withMessage('position required'),
  validate,
  (req, res) => {
    const lessonId = Number(req.body.lessonId);
    const lesson = (store.db.lessons || []).find((l) => l.id === lessonId);
    if (!lesson || !isEnrolled(req.user.id, lesson.courseId)) {
      return res.status(403).json({ error: 'Enrolment required to record progress' });
    }

    if (!store.db.progress) store.db.progress = [];
    let p = store.db.progress.find((x) => x.userId === req.user.id && x.lessonId === lesson.id);

    const now = Date.now();
    // Throttle check: skip write if less than 10 seconds since last write and not completing
    if (p && !req.body.completed && now - (p.updatedAt || 0) < 10000) {
      return res.json({ skipped: true, lastPosition: p.lastPosition });
    }

    if (!p) {
      p = {
        userId: req.user.id,
        lessonId: lesson.id,
        lastPosition: 0,
        isCompleted: false,
        updatedAt: 0
      };
      store.db.progress.push(p);
    }

    p.lastPosition = Number(req.body.position);
    if (req.body.completed) {
      p.isCompleted = true;
    }
    p.updatedAt = now;

    const pct = getCourseProgress(req.user.id, lesson.courseId);

    // If 100% completed, set enrollment completedAt date
    if (pct === 100) {
      const en = (store.db.enrollments || []).find(
        (e) => e.userId === req.user.id && e.courseId === lesson.courseId
      );
      if (en && !en.completedAt) {
        en.completedAt = new Date().toISOString();
        const course = store.db.courses.find((c) => c.id === lesson.courseId);
        eventBus.emit('certificate:issued', {
          user: req.user,
          course,
          certificateId: `CERT-${lesson.courseId}-${req.user.id}`
        });
      }
    }

    store.save();
    res.json({ saved: true, progressPercent: pct, isCompleted: p.isCompleted });
  }
);

// -------------------------------------------------------------
// Auto-Graded Quizzes
// -------------------------------------------------------------

// POST /api/quizzes/:lessonId/attempt (Auto-graded assessment, max 3 attempts)
router.post(
  '/quizzes/:lessonId/attempt',
  protect,
  allow('student'),
  body('answers').isArray({ min: 1 }).withMessage('answers array required'),
  validate,
  (req, res) => {
    const lessonId = Number(req.params.lessonId);
    const lesson = (store.db.lessons || []).find((l) => l.id === lessonId && l.type === 'quiz');
    if (!lesson || !isEnrolled(req.user.id, lesson.courseId)) {
      return res.status(403).json({ error: 'Enrollment required to attempt this quiz' });
    }

    if (!store.db.attempts) store.db.attempts = [];
    const prevAttempts = store.db.attempts.filter((a) => a.userId === req.user.id && a.lessonId === lesson.id);

    if (prevAttempts.length >= 3) {
      return res.status(429).json({ error: 'Maximum limit of 3 quiz attempts has been reached' });
    }

    const answers = req.body.answers;
    let score = 0;
    lesson.questions.forEach((q, idx) => {
      if (Number(answers[idx]) === q.answer) {
        score++;
      }
    });

    const total = lesson.questions.length;
    const passed = score / total >= 0.5; // 50% pass mark

    const attempt = {
      id: store.newId(),
      userId: req.user.id,
      lessonId: lesson.id,
      score,
      total,
      passed,
      attemptNo: prevAttempts.length + 1,
      submittedAt: new Date().toISOString()
    };

    store.db.attempts.push(attempt);

    // If passed, mark lesson as completed
    if (passed) {
      if (!store.db.progress) store.db.progress = [];
      let p = store.db.progress.find((x) => x.userId === req.user.id && x.lessonId === lesson.id);
      if (!p) {
        p = {
          userId: req.user.id,
          lessonId: lesson.id,
          lastPosition: 0,
          isCompleted: true,
          updatedAt: Date.now()
        };
        store.db.progress.push(p);
      } else {
        p.isCompleted = true;
      }
    }

    store.save();

    eventBus.emit('quiz:completed', {
      user: req.user,
      lesson,
      score,
      total
    });

    res.json(attempt);
  }
);

// -------------------------------------------------------------
// Timestamped Notes
// -------------------------------------------------------------

// GET /api/lessons/:id/notes
router.get('/lessons/:id/notes', protect, (req, res) => {
  const lessonId = Number(req.params.id);
  const notes = (store.db.notes || [])
    .filter((n) => n.userId === req.user.id && n.lessonId === lessonId)
    .sort((a, b) => a.timestampSec - b.timestampSec);
  res.json(notes);
});

// POST /api/lessons/:id/notes
router.post(
  '/lessons/:id/notes',
  protect,
  body('text').trim().notEmpty().withMessage('Note text required').escape(),
  body('timestampSec').isFloat({ min: 0 }).withMessage('Valid timestamp required'),
  validate,
  (req, res) => {
    const lessonId = Number(req.params.id);
    const lesson = (store.db.lessons || []).find((l) => l.id === lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    if (!store.db.notes) store.db.notes = [];
    const note = {
      id: store.newId(),
      userId: req.user.id,
      lessonId,
      text: req.body.text,
      timestampSec: Number(req.body.timestampSec),
      createdAt: new Date().toISOString()
    };

    store.db.notes.push(note);
    store.save();
    res.status(201).json(note);
  }
);

// DELETE /api/notes/:id
router.delete('/notes/:id', protect, (req, res) => {
  const noteId = Number(req.params.id);
  const idx = (store.db.notes || []).findIndex((n) => n.id === noteId && n.userId === req.user.id);
  if (idx === -1) return res.status(404).json({ error: 'Note not found' });

  store.db.notes.splice(idx, 1);
  store.save();
  res.json({ message: 'Note deleted' });
});

// -------------------------------------------------------------
// Lesson Q&A Discussion
// -------------------------------------------------------------

// GET /api/lessons/:id/qa
router.get('/lessons/:id/qa', protect, (req, res) => {
  const lessonId = Number(req.params.id);
  const threads = (store.db.qa || [])
    .filter((q) => q.lessonId === lessonId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(threads);
});

// POST /api/lessons/:id/qa
router.post(
  '/lessons/:id/qa',
  protect,
  body('question').trim().notEmpty().withMessage('Question text is required').escape(),
  validate,
  (req, res) => {
    const lessonId = Number(req.params.id);
    const lesson = (store.db.lessons || []).find((l) => l.id === lessonId);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const course = store.db.courses.find((c) => c.id === lesson.courseId);

    if (!store.db.qa) store.db.qa = [];
    const thread = {
      id: store.newId(),
      lessonId,
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      question: req.body.question,
      replies: [],
      createdAt: new Date().toISOString()
    };

    store.db.qa.push(thread);
    store.save();

    eventBus.emit('qa:new_question', {
      user: req.user,
      course,
      lesson,
      questionText: req.body.question
    });

    res.status(201).json(thread);
  }
);

// POST /api/qa/:id/reply
router.post(
  '/qa/:id/reply',
  protect,
  body('reply').trim().notEmpty().withMessage('Reply text is required').escape(),
  validate,
  (req, res) => {
    const threadId = Number(req.params.id);
    const thread = (store.db.qa || []).find((q) => q.id === threadId);
    if (!thread) return res.status(404).json({ error: 'Question not found' });

    const reply = {
      id: store.newId(),
      userId: req.user.id,
      userName: req.user.name,
      userRole: req.user.role,
      text: req.body.reply,
      createdAt: new Date().toISOString()
    };

    thread.replies.push(reply);
    store.save();
    res.status(201).json(reply);
  }
);

// -------------------------------------------------------------
// Assignment Submissions
// -------------------------------------------------------------

// GET /api/lessons/:id/assignment
router.get('/lessons/:id/assignment', protect, (req, res) => {
  const lessonId = Number(req.params.id);
  const lesson = (store.db.lessons || []).find((l) => l.id === lessonId && l.type === 'assignment');
  if (!lesson) return res.status(404).json({ error: 'Assignment not found' });

  const submission = (store.db.assignmentSubmissions || []).find(
    (s) => s.lessonId === lessonId && s.userId === req.user.id
  );

  res.json({
    lesson,
    submission: submission || null
  });
});

// POST /api/lessons/:id/assignment-submit
router.post(
  '/lessons/:id/assignment-submit',
  protect,
  allow('student'),
  body('submissionUrl').trim().notEmpty().withMessage('Submission URL or Git repository link required'),
  body('comments').trim().optional().escape(),
  validate,
  (req, res) => {
    const lessonId = Number(req.params.id);
    const lesson = (store.db.lessons || []).find((l) => l.id === lessonId && l.type === 'assignment');
    if (!lesson || !isEnrolled(req.user.id, lesson.courseId)) {
      return res.status(403).json({ error: 'Enrolment required to submit assignment' });
    }

    if (!store.db.assignmentSubmissions) store.db.assignmentSubmissions = [];
    let sub = store.db.assignmentSubmissions.find(
      (s) => s.lessonId === lessonId && s.userId === req.user.id
    );

    if (sub) {
      sub.submissionUrl = req.body.submissionUrl;
      sub.comments = req.body.comments || '';
      sub.status = 'Submitted';
      sub.submittedAt = new Date().toISOString();
    } else {
      sub = {
        id: store.newId(),
        lessonId,
        userId: req.user.id,
        userName: req.user.name,
        submissionUrl: req.body.submissionUrl,
        comments: req.body.comments || '',
        status: 'Submitted',
        feedback: '',
        submittedAt: new Date().toISOString()
      };
      store.db.assignmentSubmissions.push(sub);
    }

    store.save();
    res.status(201).json(sub);
  }
);

// -------------------------------------------------------------
// Download Resource Material
// -------------------------------------------------------------

// GET /api/resources/:id/download
router.get('/resources/:id/download', protect, (req, res) => {
  const resourceId = Number(req.params.id);
  let foundResource = null;
  let foundLesson = null;

  for (const lesson of store.db.lessons || []) {
    const r = (lesson.resources || []).find((x) => x.id === resourceId);
    if (r) {
      foundResource = r;
      foundLesson = lesson;
      break;
    }
  }

  if (!foundResource) return res.status(404).json({ error: 'Resource not found' });

  // Verify enrollment
  if (!isEnrolled(req.user.id, foundLesson.courseId) && req.user.role === 'student') {
    return res.status(403).json({ error: 'Enrolment required to download resource' });
  }

  const filePath = path.join(__dirname, '..', '..', 'uploads', foundResource.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing on server' });
  }

  res.download(filePath, foundResource.originalName || foundResource.filename);
});

// -------------------------------------------------------------
// Certificates of Completion & Public Verification
// -------------------------------------------------------------

// GET /api/certificates/:courseId
router.get('/certificates/:courseId', protect, allow('student'), (req, res) => {
  const courseId = Number(req.params.courseId);
  const pct = getCourseProgress(req.user.id, courseId);
  if (pct < 100) {
    return res.status(403).json({ error: `Course is only ${pct}% complete. Please complete all lessons to earn your certificate.` });
  }

  const course = store.db.courses.find((c) => c.id === courseId);
  const enrollment = (store.db.enrollments || []).find(
    (e) => e.userId === req.user.id && e.courseId === courseId
  );

  const certId = `CERT-${courseId}-${req.user.id}`;
  const completedDate = enrollment ? enrollment.completedAt || new Date().toISOString() : new Date().toISOString();

  res.json({
    certificateId: certId,
    student: req.user.name,
    studentEmail: req.user.email,
    course: course.title,
    category: course.category,
    instructor: course.instructorName,
    completedAt: completedDate,
    verificationUrl: `/api/certificates/verify/${certId}`
  });
});

// GET /api/certificates/verify/:certId (Public verification)
router.get('/certificates/verify/:certId', (req, res) => {
  const parts = req.params.certId.split('-');
  if (parts.length < 3 || parts[0] !== 'CERT') {
    return res.status(400).json({ valid: false, error: 'Invalid certificate identifier format' });
  }

  const courseId = Number(parts[1]);
  const userId = Number(parts[2]);

  const course = store.db.courses.find((c) => c.id === courseId);
  const user = store.db.users.find((u) => u.id === userId);
  const enrollment = (store.db.enrollments || []).find((e) => e.userId === userId && e.courseId === courseId);

  if (!course || !user || !enrollment || !enrollment.completedAt) {
    return res.status(404).json({ valid: false, error: 'Certificate not found or not yet completed' });
  }

  res.json({
    valid: true,
    certificateId: req.params.certId,
    recipient: user.name,
    courseTitle: course.title,
    instructor: course.instructorName,
    issuedOn: enrollment.completedAt
  });
});

module.exports = router;
