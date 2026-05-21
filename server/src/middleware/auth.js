const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * protect - Verifies Bearer JWT in Authorization header.
 * Sets req.user with the full user document (minus sensitive fields).
 */
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    throw new AppError('Authentication required. Please log in.', 401);
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('Your session has expired. Please log in again.', 401);
    }
    throw new AppError('Invalid token. Please log in again.', 401);
  }

  // Fetch user — exclude sensitive fields for general use
  const user = await User.findById(decoded.id).select('-passwordHash -refreshTokens');
  if (!user) {
    throw new AppError('User no longer exists', 401);
  }

  // Attach user to request
  req.user = user;
  next();
});

/**
 * authorize - Role-based access control middleware.
 * Must be used AFTER protect middleware.
 * @param {...string} roles - Allowed roles
 */
exports.authorize = (...roles) =>
  asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required', 401);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(
        `Access denied. Your role '${req.user.role}' is not authorized for this action.`,
        403
      );
    }

    next();
  });

/**
 * optionalAuth - Attaches user if token is present, but doesn't fail if not.
 * Useful for public endpoints that behave differently for authenticated users.
 */
exports.optionalAuth = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-passwordHash -refreshTokens');
    if (user) req.user = user;
  } catch {
    // Silently ignore invalid token for optional auth
  }

  next();
});
