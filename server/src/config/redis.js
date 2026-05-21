'use strict';

const IORedis = require('ioredis');
const logger = require('./logger');
const { env } = require('./env');

/**
 * Shared IORedis client for general caching and pub/sub.
 * Handles connection errors gracefully to avoid crashing the process.
 */
const redisClient = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 500, 5000);
    logger.warn(`Redis retry attempt ${times}, retrying in ${delay}ms`);
    return delay;
  },
  reconnectOnError(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

redisClient.on('connect', () => {
  logger.info('✅ Redis client connected');
});

redisClient.on('ready', () => {
  logger.info('✅ Redis client ready');
});

redisClient.on('error', (err) => {
  logger.error(`Redis client error: ${err.message}`);
});

redisClient.on('close', () => {
  logger.warn('Redis connection closed');
});

redisClient.on('reconnecting', (delay) => {
  logger.warn(`Redis reconnecting in ${delay}ms`);
});

/**
 * Create and return a new IORedis connection suitable for BullMQ.
 * BullMQ requires a dedicated connection with maxRetriesPerRequest set to null.
 * @returns {IORedis} A new IORedis instance configured for BullMQ
 */
function getRedisConnection() {
  const connection = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      return delay;
    },
  });

  connection.on('error', (err) => {
    logger.error(`BullMQ Redis connection error: ${err.message}`);
  });

  return connection;
}

module.exports = { redisClient, getRedisConnection };
