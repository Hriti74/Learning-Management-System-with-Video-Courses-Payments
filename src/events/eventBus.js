// Node.js Core "events" module demonstrating EventEmitter in backend architecture
const EventEmitter = require('events');
const store = require('../store');

class LMSEventBus extends EventEmitter {}
const eventBus = new LMSEventBus();

// Listener: Log system audit trail and notify users
eventBus.on('enrollment:created', ({ user, course, paymentId, amount }) => {
  console.log(`[EVENT: ENROLLMENT] User ${user.name} (${user.id}) enrolled in "${course.title}" (Payment: ${paymentId}, Amount: ₹${amount})`);
  store.addNotification({
    userId: course.instructorId,
    message: `New student enrolled! ${user.name} joined your course "${course.title}".`,
    type: 'enrollment',
    createdAt: new Date().toISOString()
  });
});

eventBus.on('course:status_changed', ({ course, oldStatus, newStatus }) => {
  console.log(`[EVENT: COURSE_STATUS] Course "${course.title}" status changed from ${oldStatus} to ${newStatus}`);
  store.addNotification({
    userId: course.instructorId,
    message: `Your course "${course.title}" status has been updated to "${newStatus}".`,
    type: 'course_status',
    createdAt: new Date().toISOString()
  });
});

eventBus.on('quiz:completed', ({ user, lesson, score, total }) => {
  console.log(`[EVENT: QUIZ] User ${user.name} scored ${score}/${total} on lesson "${lesson.title}"`);
});

eventBus.on('certificate:issued', ({ user, course, certificateId }) => {
  console.log(`[EVENT: CERTIFICATE] Certificate ${certificateId} issued to ${user.name} for "${course.title}"`);
  store.addNotification({
    userId: user.id,
    message: `Congratulations! You earned a Certificate of Completion for "${course.title}".`,
    type: 'certificate',
    createdAt: new Date().toISOString()
  });
});

eventBus.on('qa:new_question', ({ user, course, lesson, questionText }) => {
  console.log(`[EVENT: Q&A] New question in "${course.title}" / "${lesson.title}" by ${user.name}`);
  store.addNotification({
    userId: course.instructorId,
    message: `${user.name} asked a question in "${lesson.title}": "${questionText.substring(0, 50)}..."`,
    type: 'qa',
    createdAt: new Date().toISOString()
  });
});

module.exports = eventBus;
