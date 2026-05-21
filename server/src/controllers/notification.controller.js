const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/helpers');
const Notification = require('../models/Notification');
const logger = require('../config/logger');

// ─── GET NOTIFICATIONS ────────────────────────────────────────────────────────
exports.getNotifications = asyncHandler(async (req, res) => {
  const { type, read, page = 1, limit = 50 } = req.query;

  const filter = { userId: req.user._id };
  if (type) filter.type = type;
  if (read !== undefined) filter.read = read === 'true';

  const pageNum = Number(page);
  const limitNum = Math.min(Number(limit), 100);
  const skip = (pageNum - 1) * limitNum;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Notification.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: notifications,
    pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
  });
});

// ─── GET UNREAD COUNT ─────────────────────────────────────────────────────────
exports.getUnreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    userId: req.user._id,
    read: false,
  });

  res.status(200).json({
    success: true,
    data: { count },
  });
});

// ─── MARK SINGLE AS READ ──────────────────────────────────────────────────────
exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { read: true, readAt: new Date() } },
    { new: true }
  );

  if (!notification) throw new AppError('Notification not found', 404);

  res.status(200).json({
    success: true,
    data: notification,
    message: 'Notification marked as read',
  });
});

// ─── MARK ALL AS READ ─────────────────────────────────────────────────────────
exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );

  logger.info(`User ${req.user._id} marked ${result.modifiedCount} notifications as read`);

  res.status(200).json({
    success: true,
    message: `${result.modifiedCount} notifications marked as read`,
    data: { updated: result.modifiedCount },
  });
});

// ─── DELETE ALL NOTIFICATIONS ─────────────────────────────────────────────────
exports.deleteAllNotifications = asyncHandler(async (req, res) => {
  const { olderThan, read } = req.query;

  const filter = { userId: req.user._id };

  // Only delete read notifications by default (safety measure)
  if (read !== undefined) {
    filter.read = read === 'true';
  } else {
    filter.read = true; // Default: only delete read notifications
  }

  if (olderThan) {
    const cutoffDate = new Date(olderThan);
    if (isNaN(cutoffDate.getTime())) {
      throw new AppError('Invalid olderThan date format', 400);
    }
    filter.createdAt = { $lt: cutoffDate };
  }

  const result = await Notification.deleteMany(filter);

  logger.info(`User ${req.user._id} deleted ${result.deletedCount} notifications`);

  res.status(200).json({
    success: true,
    message: `${result.deletedCount} notifications deleted`,
    data: { deleted: result.deletedCount },
  });
});
