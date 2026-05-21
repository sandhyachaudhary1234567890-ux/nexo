const multer = require('multer');
const { AppError } = require('../utils/helpers');

// Use memory storage so CSV buffers can be parsed without disk writes
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimes = [
    'text/csv',
    'text/plain',
    'application/csv',
    'application/vnd.ms-excel',
    'application/octet-stream',
  ];

  const allowedExtensions = ['.csv', '.txt'];
  const ext = '.' + file.originalname.split('.').pop().toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new AppError('Only CSV files are allowed', 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB max
    files: 1,
  },
});

// Image upload configuration (for avatars, etc.)
const imageStorage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, WebP, or GIF images are allowed', 400), false);
  }
};

const uploadImage = multer({
  storage: imageStorage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
    files: 1,
  },
});

module.exports = { upload, uploadImage };
