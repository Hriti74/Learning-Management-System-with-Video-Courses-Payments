const router = require('express').Router();
const { body, query } = require('express-validator');
const store = require('../store');
const { protect, allow } = require('../middleware/auth');
const { validate } = require('../middleware/errorHandler');
const { videoUpload, resourceUpload } = require('../middleware/upload');
const eventBus = require('../events/eventBus');

// -------------------------------------------------------------
// Public Course Catalogue & Details
// -------------------------------------------------------------

// GET /api/courses?category=&level=&price=&search=&page=&limit=
router.get('/courses', (req, res) => {
  const { category, level, price, search, page = 1, limit = 6 } = req.query;

  let list = store.db.courses.filter((c) => c.status === 'approved');

  if (category) {
    list = list.filter((c) => c.category.toLowerCase() === category.toLowerCase());
  }

  if (level) {
    list = list.filter((c) => c.level.toLowerCase() === level.toLowerCase());
  }

  if (price === 'free') {
    list = list.filter((c) => c.price === 0);
  } else if (price === 'paid') {
    list = list.filter((c) => c.price > 0);
  }

  if (search) {
    const q = search.toLowerCase();
    list = list.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.category && c.category.toLowerCase().includes(q))
    );
  }

  // Calculate review stats for each course
  const coursesWithStats = list.map((c) => {
    const courseReviews = (store.db.reviews || []).filter((r) => r.courseId === c.id);
    const avgRating =
      courseReviews.length > 0
        ? Number((courseReviews.reduce((sum, r) => sum + r.rating, 0) / courseReviews.length).toFixed(1))
        : c.avgRating || 5.0;

    const sections = (store.db.sections || []).filter((s) => s.courseId === c.id);
    const lessons = (store.db.lessons || []).filter((l) => l.courseId === c.id);

    return {
      ...c,
      avgRating,
      reviewCount: courseReviews.length,
      totalLessons: lessons.length,
      totalSections: sections.length
    };
  });

  const total = coursesWithStats.length;
  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, parseInt(limit, 10));
  const start = (pageNum - 1) * limitNum;
  const paginated = coursesWithStats.slice(start, start + limitNum);

  // Available categories for filter buttons
  const allApproved = store.db.courses.filter((c) => c.status === 'approved');
  const categories = [...new Set(allApproved.map((c) => c.category).filter(Boolean))];

  res.json({
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum) || 1,
    limit: limitNum,
    categories,
    courses: paginated
  });
});

// GET /api/courses/:id (Public course detail with curriculum preview)
router.get('/courses/:id', (req, res) => {
  const courseId = Number(req.params.id);
  const course = store.db.courses.find((c) => c.id === courseId);
  if (!course) return res.status(404).json({ error: 'Course not found' });

  // Get sections and lessons
  const sections = (store.db.sections || [])
    .filter((s) => s.courseId === courseId)
    .sort((a, b) => a.order - b.order);

  const lessons = (store.db.lessons || [])
    .filter((l) => l.courseId === courseId)
    .sort((a, b) => a.order - b.order)
    .map((l) => ({
      id: l.id,
      sectionId: l.sectionId,
      title: l.title,
      type: l.type,
      durationSec: l.durationSec || 0,
      isPreview: !!l.isPreview,
      order: l.order,
      resourcesCount: (l.resources || []).length
    }));

  const courseReviews = (store.db.reviews || [])
    .filter((r) => r.courseId === courseId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const avgRating =
    courseReviews.length > 0
      ? Number((courseReviews.reduce((sum, r) => sum + r.rating, 0) / courseReviews.length).toFixed(1))
      : course.avgRating || 5.0;

  res.json({
    ...course,
    avgRating,
    reviewCount: courseReviews.length,
    reviews: courseReviews.slice(0, 5),
    sections,
    lessons
  });
});

// POST /api/courses/:id/reviews (Students can leave rating and review)
router.post(
  '/courses/:id/reviews',
  protect,
  allow('student'),
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
  body('comment').trim().notEmpty().withMessage('Review comment is required').escape(),
  validate,
  (req, res) => {
    const courseId = Number(req.params.id);
    const course = store.db.courses.find((c) => c.id === courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    // Verify enrollment
    const isEnrolled = (store.db.enrollments || []).some(
      (e) => e.userId === req.user.id && e.courseId === courseId
    );
    if (!isEnrolled) {
      return res.status(403).json({ error: 'You must be enrolled to review this course' });
    }

    if (!store.db.reviews) store.db.reviews = [];
    const existing = store.db.reviews.find((r) => r.userId === req.user.id && r.courseId === courseId);

    const review = {
      id: existing ? existing.id : store.newId(),
      courseId,
      userId: req.user.id,
      userName: req.user.name,
      rating: Number(req.body.rating),
      comment: req.body.comment,
      createdAt: new Date().toISOString()
    };

    if (existing) {
      Object.assign(existing, review);
    } else {
      store.db.reviews.push(review);
    }

    // Update course avgRating
    const allCourseReviews = store.db.reviews.filter((r) => r.courseId === courseId);
    course.avgRating = Number(
      (allCourseReviews.reduce((sum, r) => sum + r.rating, 0) / allCourseReviews.length).toFixed(1)
    );

    store.save();
    res.status(201).json(review);
  }
);

// -------------------------------------------------------------
// Instructor Course Curriculum Builder
// -------------------------------------------------------------

// GET /api/instructor/courses (Instructor's courses with stats)
router.get('/instructor/courses', protect, allow('instructor'), (req, res) => {
  const myCourses = store.db.courses.filter((c) => c.instructorId === req.user.id);
  const coursesWithDetails = myCourses.map((c) => {
    const lessons = (store.db.lessons || []).filter((l) => l.courseId === c.id);
    const sections = (store.db.sections || []).filter((s) => s.courseId === c.id);
    const coursePayments = (store.db.payments || []).filter((p) => p.courseId === c.id && p.status === 'success');
    const totalEarned = coursePayments.reduce((acc, p) => acc + p.amount * 0.8, 0);

    return {
      ...c,
      lessonsCount: lessons.length,
      sectionsCount: sections.length,
      totalEarned,
      sections,
      lessons
    };
  });

  res.json(coursesWithDetails);
});

// POST /api/instructor/courses (Create new course)
router.post(
  '/instructor/courses',
  protect,
  allow('instructor'),
  body('title').trim().isLength({ min: 3 }).withMessage('Course title must be at least 3 characters').escape(),
  body('description').trim().notEmpty().withMessage('Description is required').escape(),
  body('price').isFloat({ min: 0 }).withMessage('Price must be 0 or more'),
  body('category').trim().notEmpty().withMessage('Category is required').escape(),
  body('level').isIn(['beginner', 'intermediate', 'advanced']).withMessage('Level must be beginner, intermediate, or advanced'),
  validate,
  (req, res) => {
    const { title, description, price, category, level, thumbnail } = req.body;
    const course = {
      id: store.newId(),
      instructorId: req.user.id,
      instructorName: req.user.name,
      title,
      description,
      price: Number(price),
      category,
      level,
      thumbnail: thumbnail || '',
      status: 'pending', // Pending admin approval
      avgRating: 5.0,
      enrollCount: 0,
      createdAt: new Date().toISOString()
    };

    store.db.courses.push(course);

    // Create default introductory section
    const section = {
      id: store.newId(),
      courseId: course.id,
      title: 'Module 1: Introduction & Fundamentals',
      order: 1
    };
    if (!store.db.sections) store.db.sections = [];
    store.db.sections.push(section);

    store.save();
    res.status(201).json({ ...course, sections: [section] });
  }
);

// POST /api/instructor/courses/:id/sections (Add section)
router.post(
  '/instructor/courses/:id/sections',
  protect,
  allow('instructor'),
  body('title').trim().notEmpty().withMessage('Section title is required').escape(),
  validate,
  (req, res) => {
    const course = store.db.courses.find((c) => c.id === Number(req.params.id));
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.instructorId !== req.user.id) return res.status(403).json({ error: 'Unauthorized: Not your course' });

    if (!store.db.sections) store.db.sections = [];
    const courseSections = store.db.sections.filter((s) => s.courseId === course.id);
    const order = courseSections.length + 1;

    const section = {
      id: store.newId(),
      courseId: course.id,
      title: req.body.title,
      order
    };

    store.db.sections.push(section);
    store.save();
    res.status(201).json(section);
  }
);

// POST /api/instructor/courses/:id/lessons (Upload video lesson via Multer)
router.post(
  '/instructor/courses/:id/lessons',
  protect,
  allow('instructor'),
  videoUpload.single('video'),
  body('title').trim().notEmpty().withMessage('Lesson title is required').escape(),
  validate,
  (req, res) => {
    const course = store.db.courses.find((c) => c.id === Number(req.params.id));
    if (!course) return res.status(404).json({ error: 'Course not found' });
    if (course.instructorId !== req.user.id) return res.status(403).json({ error: 'Unauthorized: Not your course' });

    if (!req.file) {
      return res.status(400).json({ error: 'A video file (MP4, WebM, etc.) is required' });
    }

    const courseLessons = (store.db.lessons || []).filter((l) => l.courseId === course.id);
    const order = courseLessons.length + 1;
    const sectionId = req.body.sectionId ? Number(req.body.sectionId) : null;

    const lesson = {
      id: store.newId(),
      courseId: course.id,
      sectionId,
      title: req.body.title,
      type: 'video',
      videoFile: req.file.filename,
      originalName: req.file.originalname,
      durationSec: Number(req.body.durationSec) || 300,
      isPreview: req.body.isPreview === 'true' || req.body.isPreview === true,
      order,
      resources: [],
      transcript: req.body.transcript || 'Welcome to this lesson! Follow along and try out the concepts covered.',
      createdAt: new Date().toISOString()
    };

    if (!store.db.lessons) store.db.lessons = [];
    store.db.lessons.push(lesson);
    store.save();

    res.status(201).json({
      id: lesson.id,
      title: lesson.title,
      type: lesson.type,
      order: lesson.order,
      videoFile: lesson.videoFile,
      isPreview: lesson.isPreview
    });
  }
);

// POST /api/instructor/courses/:id/quizzes (Add quiz with question bank)
router.post(
  '/instructor/courses/:id/quizzes',
  protect,
  allow('instructor'),
  body('title').trim().notEmpty().withMessage('Quiz title is required').escape(),
  body('questions').isArray({ min: 1 }).withMessage('At least one question is required'),
  validate,
  (req, res) => {
    const course = store.db.courses.find((c) => c.id === Number(req.params.id));
    if (!course || course.instructorId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this course' });
    }

    const courseLessons = (store.db.lessons || []).filter((l) => l.courseId === course.id);
    const order = courseLessons.length + 1;
    const sectionId = req.body.sectionId ? Number(req.body.sectionId) : null;

    const formattedQuestions = req.body.questions.map((q) => ({
      q: q.q,
      options: q.options || [],
      answer: parseInt(q.answer, 10)
    }));

    const lesson = {
      id: store.newId(),
      courseId: course.id,
      sectionId,
      title: req.body.title,
      type: 'quiz',
      questions: formattedQuestions,
      isPreview: false,
      order,
      createdAt: new Date().toISOString()
    };

    if (!store.db.lessons) store.db.lessons = [];
    store.db.lessons.push(lesson);
    store.save();

    res.status(201).json({ id: lesson.id, title: lesson.title, order: lesson.order });
  }
);

// POST /api/instructor/courses/:id/assignments (Add assignment)
router.post(
  '/instructor/courses/:id/assignments',
  protect,
  allow('instructor'),
  body('title').trim().notEmpty().withMessage('Assignment title is required').escape(),
  body('instructions').trim().notEmpty().withMessage('Instructions are required').escape(),
  validate,
  (req, res) => {
    const course = store.db.courses.find((c) => c.id === Number(req.params.id));
    if (!course || course.instructorId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized for this course' });
    }

    const courseLessons = (store.db.lessons || []).filter((l) => l.courseId === course.id);
    const order = courseLessons.length + 1;
    const sectionId = req.body.sectionId ? Number(req.body.sectionId) : null;

    const lesson = {
      id: store.newId(),
      courseId: course.id,
      sectionId,
      title: req.body.title,
      type: 'assignment',
      instructions: req.body.instructions,
      isPreview: false,
      order,
      createdAt: new Date().toISOString()
    };

    if (!store.db.lessons) store.db.lessons = [];
    store.db.lessons.push(lesson);
    store.save();

    res.status(201).json({ id: lesson.id, title: lesson.title, order: lesson.order });
  }
);

// POST /api/instructor/lessons/:id/resource (Upload lesson resource material)
router.post(
  '/instructor/lessons/:id/resource',
  protect,
  allow('instructor'),
  resourceUpload.single('file'),
  body('title').trim().notEmpty().withMessage('Resource title required').escape(),
  validate,
  (req, res) => {
    const lesson = (store.db.lessons || []).find((l) => l.id === Number(req.params.id));
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const course = store.db.courses.find((c) => c.id === lesson.courseId);
    if (!course || course.instructorId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized: Not your course' });
    }

    if (!req.file) return res.status(400).json({ error: 'File is required' });

    const resource = {
      id: store.newId(),
      title: req.body.title,
      filename: req.file.filename,
      originalName: req.file.originalname,
      sizeBytes: req.file.size
    };

    if (!lesson.resources) lesson.resources = [];
    lesson.resources.push(resource);
    store.save();

    res.status(201).json(resource);
  }
);

// DELETE /api/instructor/lessons/:id
router.delete('/instructor/lessons/:id', protect, allow('instructor'), (req, res) => {
  const lessonId = Number(req.params.id);
  const lessonIndex = (store.db.lessons || []).findIndex((l) => l.id === lessonId);
  if (lessonIndex === -1) return res.status(404).json({ error: 'Lesson not found' });

  const lesson = store.db.lessons[lessonIndex];
  const course = store.db.courses.find((c) => c.id === lesson.courseId);
  if (!course || course.instructorId !== req.user.id) {
    return res.status(403).json({ error: 'Unauthorized: Not your course' });
  }

  store.db.lessons.splice(lessonIndex, 1);
  store.save();
  res.json({ message: 'Lesson deleted successfully' });
});

// GET /api/instructor/submissions (View submissions across instructor courses)
router.get('/instructor/submissions', protect, allow('instructor'), (req, res) => {
  const myCourseIds = store.db.courses
    .filter((c) => c.instructorId === req.user.id)
    .map((c) => c.id);

  const myLessons = (store.db.lessons || []).filter((l) => myCourseIds.includes(l.courseId));
  const myLessonIds = myLessons.map((l) => l.id);

  const submissions = (store.db.assignmentSubmissions || [])
    .filter((s) => myLessonIds.includes(s.lessonId))
    .map((s) => {
      const lesson = myLessons.find((l) => l.id === s.lessonId);
      const course = store.db.courses.find((c) => c.id === (lesson ? lesson.courseId : 0));
      return {
        ...s,
        lessonTitle: lesson ? lesson.title : '',
        courseTitle: course ? course.title : ''
      };
    });

  res.json(submissions);
});

// POST /api/instructor/submissions/:id/grade (Grade student assignment)
router.post(
  '/instructor/submissions/:id/grade',
  protect,
  allow('instructor'),
  body('grade').isIn(['Passed', 'Needs Revision', 'Distinction']).withMessage('Invalid grade status'),
  body('feedback').trim().optional().escape(),
  validate,
  (req, res) => {
    const sub = (store.db.assignmentSubmissions || []).find((s) => s.id === Number(req.params.id));
    if (!sub) return res.status(404).json({ error: 'Submission not found' });

    sub.status = req.body.grade;
    sub.feedback = req.body.feedback || '';
    sub.gradedAt = new Date().toISOString();

    // Mark lesson as completed for student if passed
    if (req.body.grade === 'Passed' || req.body.grade === 'Distinction') {
      let p = store.db.progress.find((x) => x.userId === sub.userId && x.lessonId === sub.lessonId);
      if (!p) {
        p = {
          userId: sub.userId,
          lessonId: sub.lessonId,
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
    res.json(sub);
  }
);

module.exports = router;
