'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');

const { env } = require('./config/env');
const { protect } = require('./middleware/auth');
const { globalLimiter, authLimiter, aiLimiter } = require('./middleware/rateLimiter');
const apiGateway = require('./middleware/apiGateway');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ─── Security ─────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(mongoSanitize());

// ─── CORS ──────────────────────────────────────────
const allowedOrigins = [
  env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5500'
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, true); // permissive in dev; tighten in production
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID']
}));

// ─── Body / Cookie ─────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ─── Logging ───────────────────────────────────────
if (env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(apiGateway);

// ─── Rate Limiting ─────────────────────────────────
app.use('/api/', globalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/ai', aiLimiter);

// ─── Bull Board (Queue Dashboard) ──────────────────
try {
  const { createBullBoard } = require('@bull-board/api');
  const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
  const { ExpressAdapter } = require('@bull-board/express');
  const { outreachQueue, automationQueue, enrichmentQueue, notificationQueue } = require('./jobs/queues');

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(outreachQueue),
      new BullMQAdapter(automationQueue),
      new BullMQAdapter(enrichmentQueue),
      new BullMQAdapter(notificationQueue)
    ],
    serverAdapter
  });

  // Basic auth for Bull Board
  app.use('/admin/queues', (req, res, next) => {
    const header = req.headers.authorization;
    const expected = 'Basic ' + Buffer.from(`${env.BULL_BOARD_USERNAME}:${env.BULL_BOARD_PASSWORD}`).toString('base64');
    if (header === expected) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexo Queue Dashboard"');
    return res.status(401).json({ error: 'Unauthorized' });
  }, serverAdapter.getRouter());
} catch (err) {
  console.warn('[App] Bull Board unavailable:', err.message);
}

// ─── Health ────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', version: '1.0.0', timestamp: new Date() });
});

// ─── API Routes ────────────────────────────────────
app.use('/api/auth',          require('./routes/auth.routes'));
app.use('/api/users',         protect, require('./routes/user.routes'));
app.use('/api/leads',         protect, require('./routes/lead.routes'));
app.use('/api/crm',           protect, require('./routes/crm.routes'));
app.use('/api/campaigns',     protect, require('./routes/campaign.routes'));
app.use('/api/templates',     protect, require('./routes/template.routes'));
app.use('/api/ai',            protect, require('./routes/ai.routes'));
app.use('/api/calls',         protect, require('./routes/call.routes'));
app.use('/api/automations',   protect, require('./routes/automation.routes'));
app.use('/api/analytics',     protect, require('./routes/analytics.routes'));
app.use('/api/notifications', protect, require('./routes/notification.routes'));

// ─── 404 ───────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: `Route ${req.method} ${req.originalUrl} not found` });
});

// ─── Global Error Handler ──────────────────────────
app.use(errorHandler);

module.exports = app;
