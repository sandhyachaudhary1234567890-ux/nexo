/**
 * asyncHandler - wraps async route handlers to forward errors to Express errorHandler.
 * Eliminates the need for try/catch in every controller.
 *
 * @param {Function} fn - async controller function
 * @returns {Function} - Express middleware
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
