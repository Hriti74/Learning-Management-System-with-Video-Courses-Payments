require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const bcrypt = require('bcryptjs');
const store = require('./src/store');
const { notFound, errorHandler } = require('./src/middleware/errorHandler');

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev')); // HTTP request logger for debugging and development
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount modular REST API routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/admin', require('./src/routes/admin'));
app.use('/api', require('./src/routes/courses'));
app.use('/api', require('./src/routes/learn'));

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Seed comprehensive demo data covering CE1 syllabus & Project 15 requirements
function seed() {
  const db = store.db;
  if (!db.users || !db.users.find((u) => u.role === 'admin')) {
    console.log('Seeding initial LMS demo database...');

    // 1. Users
    const admin = {
      id: store.newId(),
      name: 'System Admin',
      email: 'admin@lms.com',
      role: 'admin',
      status: 'active',
      passwordHash: bcrypt.hashSync('Admin@123', 10),
      createdAt: new Date().toISOString()
    };

    const inst = {
      id: store.newId(),
      name: 'Dr. John Doe',
      email: 'teacher@lms.com',
      role: 'instructor',
      status: 'active',
      passwordHash: bcrypt.hashSync('Teacher@123', 10),
      createdAt: new Date().toISOString()
    };

    const student = {
      id: store.newId(),
      name: 'Rahul Sharma',
      email: 'student@lms.com',
      role: 'student',
      status: 'active',
      passwordHash: bcrypt.hashSync('Student@123', 10),
      createdAt: new Date().toISOString()
    };

    db.users.push(admin, inst, student);

    // 2. Courses
    const c1 = {
      id: store.newId(),
      instructorId: inst.id,
      instructorName: inst.name,
      title: 'Full-Stack Web Development & Modern Node.js',
      description: 'Master HTML5, CSS3, ES6+, Node.js core modules (Streams, Buffers, Events), Express.js REST APIs, JWT authentication, and secure video streaming.',
      price: 499,
      category: 'Web Development',
      level: 'beginner',
      status: 'approved',
      avgRating: 4.8,
      enrollCount: 1,
      createdAt: new Date().toISOString()
    };

    const c2 = {
      id: store.newId(),
      instructorId: inst.id,
      instructorName: inst.name,
      title: 'Node.js Backend Architecture & Core Modules',
      description: 'Deep dive into the Node.js event loop, streams, chunked buffering, custom middleware pipelines, and scalable microservice architectures.',
      price: 0,
      category: 'Backend Engineering',
      level: 'intermediate',
      status: 'approved',
      avgRating: 4.9,
      enrollCount: 0,
      createdAt: new Date().toISOString()
    };

    const c3 = {
      id: store.newId(),
      instructorId: inst.id,
      instructorName: inst.name,
      title: 'React 18 & Redux Toolkit Masterclass',
      description: 'Build enterprise-grade single-page applications with modern component patterns, hooks, and scalable client state.',
      price: 799,
      category: 'Frontend Development',
      level: 'advanced',
      status: 'pending', // Pending admin approval test
      avgRating: 5.0,
      enrollCount: 0,
      createdAt: new Date().toISOString()
    };

    db.courses.push(c1, c2, c3);

    // 3. Sections for Course 1
    const sec1 = { id: store.newId(), courseId: c1.id, title: 'Module 1: Web Fundamentals & JavaScript ES6+', order: 1 };
    const sec2 = { id: store.newId(), courseId: c1.id, title: 'Module 2: Node.js Core Modules & Express APIs', order: 2 };
    const sec3 = { id: store.newId(), courseId: c1.id, title: 'Module 3: Project Assessment & Capstone', order: 3 };
    db.sections.push(sec1, sec2, sec3);

    // 4. Lessons for Course 1
    const les1 = {
      id: store.newId(),
      courseId: c1.id,
      sectionId: sec1.id,
      title: '01. Introduction to Web Fundamentals & ES6',
      type: 'video',
      videoFile: 'sample-lesson.mp4',
      originalName: 'web-fundamentals.mp4',
      durationSec: 360,
      isPreview: true, // Preview enabled for unenrolled visitors
      order: 1,
      transcript: 'Welcome to Web Fundamentals! In this lecture we explore the DOM, ES6 features like destructuring, arrow functions, and the Fetch API.',
      resources: [{ id: store.newId(), title: 'Web Fundamentals Cheatsheet (PDF)', filename: 'sample-lesson.mp4', originalName: 'web-fundamentals-cheatsheet.pdf', sizeBytes: 102400 }]
    };

    const les2 = {
      id: store.newId(),
      courseId: c1.id,
      sectionId: sec2.id,
      title: '02. Node.js Core: Streams, Buffers & HTTP Range Streaming',
      type: 'video',
      videoFile: 'sample-lesson.mp4',
      originalName: 'nodejs-streams.mp4',
      durationSec: 480,
      isPreview: false,
      order: 2,
      transcript: 'In this session, we investigate how Node.js handles I/O via the libuv Event Loop, and why fs.createReadStream with 206 Partial Content streams massive media files without filling RAM.',
      resources: [{ id: store.newId(), title: 'Node Streams Architecture Source Code', filename: 'sample-lesson.mp4', originalName: 'streams-architecture.zip', sizeBytes: 102400 }]
    };

    const les3 = {
      id: store.newId(),
      courseId: c1.id,
      sectionId: sec3.id,
      title: '03. Comprehensive Quiz: JavaScript, Node & Express',
      type: 'quiz',
      isPreview: false,
      order: 3,
      questions: [
        {
          q: 'Which Node.js core module is primarily used to stream chunks of large media files?',
          options: ['path', 'fs (createReadStream)', 'os', 'dns'],
          answer: 1
        },
        {
          q: 'What HTTP status code is returned for byte-range chunked media streaming?',
          options: ['200 OK', '201 Created', '206 Partial Content', '304 Not Modified'],
          answer: 2
        },
        {
          q: 'Which mechanism prevents unauthorized users from downloading course videos directly?',
          options: ['Expiring Signed URLs with Token Verification', 'CSS hiding', 'Disabling right click', 'HTTP Cookies without tokens'],
          answer: 0
        },
        {
          q: 'In Express, which middleware argument count identifies an Error Handling Middleware?',
          options: ['2 (req, res)', '3 (req, res, next)', '4 (err, req, res, next)', '1 (err)'],
          answer: 2
        }
      ]
    };

    const les4 = {
      id: store.newId(),
      courseId: c1.id,
      sectionId: sec3.id,
      title: '04. Final Assignment: Build a Secure REST API',
      type: 'assignment',
      isPreview: false,
      order: 4,
      instructions: 'Build and deploy a RESTful API implementing JWT Authentication, Role-Based Access Control (RBAC), and Multer file uploads. Submit your GitHub repository URL and documentation notes below.'
    };

    db.lessons.push(les1, les2, les3, les4);

    // 5. Sections and Lessons for Course 2 (Free course)
    const secC2 = { id: store.newId(), courseId: c2.id, title: 'Module 1: Deep Dive into Node.js Internals', order: 1 };
    db.sections.push(secC2);

    const lesC2_1 = {
      id: store.newId(),
      courseId: c2.id,
      sectionId: secC2.id,
      title: '01. The Event Loop, Call Stack & Microtask Queues',
      type: 'video',
      videoFile: 'sample-lesson.mp4',
      originalName: 'event-loop.mp4',
      durationSec: 540,
      isPreview: true,
      order: 1,
      transcript: 'Understanding timers, I/O polling, check phase (setImmediate), and process.nextTick priority.',
      resources: []
    };

    const lesC2_2 = {
      id: store.newId(),
      courseId: c2.id,
      sectionId: secC2.id,
      title: '02. Knowledge Check: Event Loop & Asynchronous I/O',
      type: 'quiz',
      isPreview: false,
      order: 2,
      questions: [
        {
          q: 'Which phase of the Node.js event loop executes setImmediate callbacks?',
          options: ['Timers', 'Poll', 'Check', 'Close callbacks'],
          answer: 2
        },
        {
          q: 'Does process.nextTick execute before or after the current operation finishes and before microtasks?',
          options: ['Immediately after current operation, before the event loop continues', 'At the end of the next tick', 'Only after timers', 'Never'],
          answer: 0
        }
      ]
    };

    db.lessons.push(lesC2_1, lesC2_2);

    // 6. Pre-enroll Student Rahul in Course 1 with partial progress
    const enrollment = {
      id: store.newId(),
      courseId: c1.id,
      userId: student.id,
      paymentId: 'PAY-INIT-DEMO-4242',
      amount: c1.price,
      enrolledAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      completedAt: null
    };
    db.enrollments.push(enrollment);

    db.payments.push({
      id: store.newId(),
      paymentId: 'PAY-INIT-DEMO-4242',
      userId: student.id,
      courseId: c1.id,
      amount: c1.price,
      status: 'success',
      createdAt: new Date(Date.now() - 3 * 86400000).toISOString()
    });

    // Lesson 1 completed with progress
    db.progress.push(
      {
        userId: student.id,
        lessonId: les1.id,
        lastPosition: 125,
        isCompleted: true,
        updatedAt: Date.now() - 2 * 86400000
      },
      {
        userId: student.id,
        lessonId: les2.id,
        lastPosition: 45,
        isCompleted: false,
        updatedAt: Date.now() - 1 * 86400000
      }
    );

    // Timestamped Notes
    db.notes.push(
      {
        id: store.newId(),
        userId: student.id,
        lessonId: les1.id,
        text: 'Important: Arrow functions do not bind their own "this" context.',
        timestampSec: 65,
        createdAt: new Date().toISOString()
      },
      {
        id: store.newId(),
        userId: student.id,
        lessonId: les2.id,
        text: 'Node Streams implement the Pipe pattern (readable.pipe(writable)).',
        timestampSec: 42,
        createdAt: new Date().toISOString()
      }
    );

    // Q&A Discussion
    db.qa.push({
      id: store.newId(),
      lessonId: les2.id,
      userId: student.id,
      userName: student.name,
      userRole: student.role,
      question: 'Why is HTTP 206 Partial Content preferred over 200 OK when delivering video lessons?',
      replies: [
        {
          id: store.newId(),
          userId: inst.id,
          userName: inst.name,
          userRole: inst.role,
          text: 'Great question Rahul! With 206 Partial Content and the Range header, the browser only downloads the bytes needed for current playback. When a student seeks to 10 minutes in, the server immediately pipes that specific byte slice without downloading all preceding megabytes. This drastically reduces server memory and bandwidth.',
          createdAt: new Date().toISOString()
        }
      ],
      createdAt: new Date(Date.now() - 86400000).toISOString()
    });

    // Course Reviews
    db.reviews.push({
      id: store.newId(),
      courseId: c1.id,
      userId: student.id,
      userName: student.name,
      rating: 5,
      comment: 'Exceptional course! The explanations of Node.js streams and secure token streaming are crystal clear.',
      createdAt: new Date(Date.now() - 86400000).toISOString()
    });

    store.save();
    console.log('Demo database seeded successfully.');
    console.log('Admin login:       admin@lms.com   / Admin@123');
    console.log('Instructor login:  teacher@lms.com / Teacher@123');
    console.log('Student login:     student@lms.com / Student@123');
  }
}

// Reset or ensure data exists
seed();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`LMS Server running at http://localhost:${PORT}`);
  console.log(`CE1 Web Fundamentals, Node.js Core & Express REST API Ready.`);
});

module.exports = app;
