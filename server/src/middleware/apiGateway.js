'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * API Gateway middleware.
 * - Assigns a unique X-Request-ID to every request
 * - Logs incoming request details (method, URL, IP, authenticated user)
 * - Logs response time on response finish
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {Function} next - Next middleware
 */
function apiGateway(req, res, next) {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Attach request ID to response headers for client-side tracing
  res.setHeader('X-Request-ID', requestId);

  // Store on request for downstream use (logging, error responses, etc.)
  req.requestId = requestId;
  req.startTime = startTime;

  const userId = req.user ? req.user._id : 'unauthenticated';
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

  logger.debug({
    message: 'Incoming request',
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip,
    userId,
    userAgent: req.headers['user-agent'],
  });

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[logLevel]({
      message: 'Request completed',
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip,
      userId,
    });
  });

  next();
}

module.exports = apiGateway;
