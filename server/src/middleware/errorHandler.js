const { AppError } = require('../utils/helpers');
const logger = require('../config/logger');

/**
 * Global error handler middleware.
 * Must be registered LAST in Express app (after all routes).
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  // ─── Mongoose CastError (invalid ObjectId) ───────────────────────────────
  if (err.name === 'CastError') {
    error = new AppError(`Invalid ${err.path}: ${err.value}`, 400);
  }

  // ─── Mongoose Duplicate Key Error ────────────────────────────────────────
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    const value = err.keyValue?.[field];
    error = new AppError(
      `Duplicate value for field '${field}': '${value}'. Please use a different value.`,
      409
    );
  }

  // ─── Mongoose Validation Error ───────────────────────────────────────────
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error = new AppError(`Validation failed: ${messages.join('. ')}`, 400);
  }

  // ─── JWT Errors ───────────────────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token. Please log in again.', 401);
  }
  if (err.name === 'TokenExpiredError') {
    error = new AppError('Your token has expired. Please log in again.', 401);
  }

  // ─── Multer Errors ────────────────────────────────────────────────────────
  if (err.code === 'LIMIT_FILE_SIZE') {
    error = new AppError('File too large. Maximum size is 10MB.', 400);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error = new AppError('Unexpected file field in upload.', 400);
  }

  // Log server errors
  if (error.statusCode >= 500) {
    logger.error({
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      userId: req.user?._id,
    });
  } else {
    logger.warn({
      message: error.message,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method,
    });
  }

  res.status(error.statusCode).json({
    success: false,
    status: error.status || 'error',
    message: error.message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      original: err.name,
    }),
  });
};

/**
 * 404 Not Found handler — mount BEFORE errorHandler, AFTER all routes.
 */
const notFound = (req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404));
};

module.exports = { errorHandler, notFound };
