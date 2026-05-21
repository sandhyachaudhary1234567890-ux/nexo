const jwt = require('jsonwebtoken');

// ─── CUSTOM APP ERROR ─────────────────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── PAGINATE HELPER ──────────────────────────────────────────────────────────
/**
 * Returns pagination metadata object.
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 */
const paginate = (page, limit, total) => ({
  page: Number(page),
  limit: Number(limit),
  total,
  pages: Math.ceil(total / Number(limit)),
});

// ─── SANITIZE USER ────────────────────────────────────────────────────────────
/**
 * Strips sensitive fields before sending user object to client.
 * @param {Object} user - Mongoose user document or plain object
 */
const sanitizeUser = (user) => {
  const obj = user.toObject ? user.toObject() : { ...user };
  delete obj.passwordHash;
  delete obj.refreshTokens;
  delete obj.__v;
  return obj;
};

// ─── GENERATE JWT TOKENS ──────────────────────────────────────────────────────
/**
 * Generates access and refresh JWTs for a user.
 * @param {string|ObjectId} userId
 * @param {string} accessSecret
 * @param {string} refreshSecret
 * @returns {{ accessToken: string, refreshToken: string }}
 */
const generateTokens = (userId, accessSecret, refreshSecret) => {
  if (!accessSecret) throw new Error('JWT_SECRET is not configured');
  if (!refreshSecret) throw new Error('JWT_REFRESH_SECRET is not configured');

  const accessToken = jwt.sign(
    { id: userId.toString(), type: 'access' },
    accessSecret,
    { expiresIn: '15m' }
  );

  const refreshToken = jwt.sign(
    { id: userId.toString(), type: 'refresh' },
    refreshSecret,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
};

// ─── PICK FIELDS ──────────────────────────────────────────────────────────────
/**
 * Pick specific fields from an object.
 * @param {Object} obj
 * @param {string[]} fields
 */
const pick = (obj, fields) =>
  fields.reduce((acc, field) => {
    if (obj[field] !== undefined) acc[field] = obj[field];
    return acc;
  }, {});

// ─── SLEEP ────────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── FORMAT DATE ──────────────────────────────────────────────────────────────
const formatDate = (date) => {
  if (!date) return null;
  return new Date(date).toISOString().split('T')[0];
};

// ─── IS VALID OBJECT ID ───────────────────────────────────────────────────────
const { Types } = require('mongoose');
const isValidObjectId = (id) => Types.ObjectId.isValid(id);

module.exports = {
  AppError,
  paginate,
  sanitizeUser,
  generateTokens,
  pick,
  sleep,
  formatDate,
  isValidObjectId,
};
