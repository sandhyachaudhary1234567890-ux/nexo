'use strict';
const { Worker } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const Notification = require('../models/Notification');
const socketService = require('../services/socket.service');
const logger = require('../config/logger');

const worker = new Worker('notification', async (job) => {
  const { userId, type, title, body, metadata = {} } = job.data;
  if (!userId || !title) throw new Error('userId and title required');

  const notification = await Notification.create({
    userId,
    type: type || 'system',
    title,
    body: body || '',
    read: false,
    metadata
  });

  if (socketService.isInitialized()) {
    socketService.emitToUser(userId.toString(), 'notification:new', {
      _id: notification._id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      metadata: notification.metadata,
      createdAt: notification.createdAt
    });
  }

  return { delivered: true, notificationId: notification._id };
}, { connection: getRedisConnection(), concurrency: 10 });

worker.on('completed', (job, result) => logger.info(`[NotificationWorker] Job ${job.id} delivered:`, result));
worker.on('failed', (job, err) => logger.error(`[NotificationWorker] Job ${job?.id} failed: ${err.message}`));

module.exports = worker;
