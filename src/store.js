// Simple JSON-file store built on the Node "fs" and "path" core modules.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const empty = {
  users: [],
  courses: [],
  sections: [],
  lessons: [],
  enrollments: [],
  progress: [],
  attempts: [],
  payments: [],
  payouts: [],
  notes: [],
  qa: [],
  assignmentSubmissions: [],
  reviews: [],
  notifications: [],
  nextId: 1
};

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = { ...empty };
if (fs.existsSync(FILE)) {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    db = { ...empty, ...raw };
  } catch (e) {
    console.error('Failed reading db.json, using empty db:', e.message);
  }
}

function save() {
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function newId() {
  const id = db.nextId++;
  save();
  return id;
}

function addNotification({ userId, message, type = 'general', createdAt = new Date().toISOString() }) {
  const notification = {
    id: newId(),
    userId,
    message,
    type,
    read: false,
    createdAt
  };
  db.notifications.push(notification);
  save();
  return notification;
}

module.exports = {
  get db() { return db; },
  save,
  newId,
  addNotification
};
