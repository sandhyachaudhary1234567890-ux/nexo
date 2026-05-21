'use strict';
const { Queue } = require('bullmq');
const { getRedisConnection } = require('../config/redis');
const logger = require('../config/logger');

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 }
};

let outreachQueue, automationQueue, enrichmentQueue, notificationQueue;

try {
  outreachQueue = new Queue('outreach', { connection: getRedisConnection(), defaultJobOptions });
  automationQueue = new Queue('automation', { connection: getRedisConnection(), defaultJobOptions });
  enrichmentQueue = new Queue('enrichment', { connection: getRedisConnection(), defaultJobOptions });
  notificationQueue = new Queue('notification', { connection: getRedisConnection(), defaultJobOptions });
  logger.info('[Queues] All BullMQ queues initialized');
} catch (err) {
  logger.warn('[Queues] Queue initialization failed (Redis may be offline):', err.message);
  // Create stub queues so imports don't crash
  const stubQueue = { add: async () => ({ id: 'stub' }), getJobs: async () => [] };
  outreachQueue = automationQueue = enrichmentQueue = notificationQueue = stubQueue;
}

module.exports = { outreachQueue, automationQueue, enrichmentQueue, notificationQueue };
