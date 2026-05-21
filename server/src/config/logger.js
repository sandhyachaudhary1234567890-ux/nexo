'use strict';

const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Custom log format for console output.
 */
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (stack) log += `\n${stack}`;
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    if (metaStr) log += `\n${metaStr}`;
    return log;
  })
);

/**
 * Custom log format for file output (JSON for log aggregation tools).
 */
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  json()
);

const transports = [
  // Error-only log file
  new winston.transports.File({
    filename: path.join(logsDir, 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 10 * 1024 * 1024, // 10MB
    maxFiles: 5,
  }),
  // Combined log file (all levels)
  new winston.transports.File({
    filename: path.join(logsDir, 'combined.log'),
    format: fileFormat,
    maxsize: 20 * 1024 * 1024, // 20MB
    maxFiles: 10,
  }),
];

// Console transport only in development and test
if (NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
} else {
  // In production, also log to console (for container log collection), but without color
  transports.push(
    new winston.transports.Console({
      format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        json()
      ),
    })
  );
}

const logger = winston.createLogger({
  level: NODE_ENV === 'production' ? 'info' : 'debug',
  defaultMeta: { service: 'nexo-server' },
  transports,
  exitOnError: false,
});

module.exports = logger;
