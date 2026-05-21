'use strict';
require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB } = require('./config/db');
const logger = require('./config/logger');
const { env } = require('./config/env');
const socketService = require('./services/socket.service');

// ─── Boot BullMQ Workers ───────────────────────────
try {
  require('./jobs/outreach.worker');
  require('./jobs/automation.worker');
  require('./jobs/enrichment.worker');
  require('./jobs/notification.worker');
  logger.info('[Workers] All job workers started');
} catch (err) {
  logger.warn('[Workers] Worker startup skipped (Redis may be offline):', err.message);
}

// ─── HTTP + Socket.io Server ───────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [env.CLIENT_URL, 'http://localhost:3000', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

socketService.initialize(io);

// ─── Socket.io Events ─────────────────────────────
io.on('connection', (socket) => {
  logger.debug(`[Socket] Connected: ${socket.id}`);

  // Authenticate socket to user room
  socket.on('auth', ({ userId }) => {
    if (userId) {
      socket.join(`user:${userId}`);
      socket.data.userId = userId;
      logger.debug(`[Socket] ${socket.id} → user:${userId}`);
    }
  });

  // WebRTC signaling
  socket.on('call:join', ({ roomId, userId, name }) => {
    socket.join(`call:${roomId}`);
    socket.to(`call:${roomId}`).emit('call:user-joined', { userId, name, socketId: socket.id });
  });

  socket.on('call:offer', ({ roomId, offer }) => {
    socket.to(`call:${roomId}`).emit('call:offer', { offer, from: socket.id });
  });

  socket.on('call:answer', ({ roomId, answer }) => {
    socket.to(`call:${roomId}`).emit('call:answer', { answer, from: socket.id });
  });

  socket.on('call:ice-candidate', ({ roomId, candidate }) => {
    socket.to(`call:${roomId}`).emit('call:ice-candidate', { candidate, from: socket.id });
  });

  socket.on('call:leave', ({ roomId, userId }) => {
    socket.leave(`call:${roomId}`);
    socket.to(`call:${roomId}`).emit('call:user-left', { userId, socketId: socket.id });
  });

  socket.on('disconnect', (reason) => {
    logger.debug(`[Socket] Disconnected: ${socket.id} (${reason})`);
  });
});

// ─── Start Server ──────────────────────────────────
async function startServer() {
  await connectDB();

  server.listen(env.PORT, () => {
    logger.info(`🚀 Nexo server running on port ${env.PORT}`);
    logger.info(`📊 Bull Board: http://localhost:${env.PORT}/admin/queues`);
    logger.info(`💚 Health:     http://localhost:${env.PORT}/api/health`);
    logger.info(`🌍 Mode:       ${env.NODE_ENV}`);
  });

  // ─── Graceful Shutdown ───────────────────────────
  const shutdown = async (signal) => {
    logger.info(`[Server] ${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info('[Server] HTTP server closed');
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => { logger.error('[Server] Uncaught Exception:', err); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error('[Server] Unhandled Rejection:', reason); });
}

startServer().catch(err => {
  logger.error('Failed to start Nexo server:', err);
  process.exit(1);
});
