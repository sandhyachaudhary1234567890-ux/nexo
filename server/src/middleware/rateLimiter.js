'use strict';

const rateLimit = require('express-rate-limit');

/**
 * JSON response handler for rate limit exceeded errors.
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
const rateLimitHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: 'Too many requests. Please slow down and try again later.',
    retryAfter: res.getHeader('Retry-After'),
  });
};

/**
 * Global API rate limiter — applies to all /api/* routes.
 * Allows 1000 requests per 15 minutes per IP.
 */
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: 'Too many requests from this IP.',
});

/**
 * Authentication rate limiter — applies to /api/auth/* routes.
 * Allows 10 failed attempts per 15 minutes per IP.
 * Successful requests are not counted against the limit.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
});

/**
 * AI route rate limiter — applies to /api/ai/* routes.
 * Allows 30 requests per minute per IP (AI calls are expensive).
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: 'AI request limit reached. Please wait before making more AI requests.',
});

/**
 * Outreach rate limiter — applies to campaign send/outreach routes.
 * Allows 100 requests per hour per IP.
 */
const outreachLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  message: 'Outreach limit reached. Please wait before sending more messages.',
});

module.exports = { globalLimiter, authLimiter, aiLimiter, outreachLimiter };
