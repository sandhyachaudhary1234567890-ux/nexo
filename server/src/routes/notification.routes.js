const router = require('express').Router();
const controller = require('../controllers/notification.controller');
const { protect } = require('../middleware/auth');

// All notification routes require authentication
router.use(protect);

// GET /api/notifications — list notifications (sorted, limit 50)
router.get('/', controller.getNotifications);

// GET /api/notifications/unread-count — count unread notifications
router.get('/unread-count', controller.getUnreadCount);

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', controller.markAllRead);

// DELETE /api/notifications — delete all notifications for user
router.delete('/', controller.deleteAllNotifications);

// PATCH /api/notifications/:id/read — mark single as read
router.patch('/:id/read', controller.markRead);

module.exports = router;
