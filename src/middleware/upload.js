const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate safe, collision-resistant filenames using Date + random digits + extension
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${Date.now()}-${safeBase}${ext}`);
  }
});

// Video upload handler (max 200MB, video formats)
const videoUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/') || /\.(mp4|webm|ogg|mov|mkv)$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only video files (mp4, webm, mov, mkv) are allowed for video lessons'), { status: 400 }));
    }
  }
});

// General resource/material upload handler (PDF, ZIP, DOC, images, video)
const resourceUpload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

module.exports = {
  videoUpload,
  resourceUpload
};
