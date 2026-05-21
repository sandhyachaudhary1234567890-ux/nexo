'use strict';

const mongoose = require('mongoose');
const logger = require('./logger');
const { env } = require('./env');

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 5000;

/**
 * Attempt a single Mongoose connection.
 * @param {number} attempt - Current attempt number (1-based)
 * @returns {Promise<void>}
 */
async function attemptConnection(attempt) {
  try {
    await mongoose.connect(env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info(`✅ MongoDB connected (attempt ${attempt})`);
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      logger.error(`❌ MongoDB connection failed after ${MAX_RETRIES} attempts: ${err.message}`);
      throw err;
    }
    logger.warn(
      `⚠️  MongoDB connection attempt ${attempt} failed. Retrying in ${RETRY_INTERVAL_MS / 1000}s... (${err.message})`
    );
    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    return attemptConnection(attempt + 1);
  }
}

/**
 * Establish a MongoDB connection with automatic retry logic.
 * Retries up to MAX_RETRIES (5) times with a RETRY_INTERVAL_MS (5s) delay between attempts.
 * @returns {Promise<void>}
 */
async function connectDB() {
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });

  await attemptConnection(1);
}

module.exports = { connectDB };
