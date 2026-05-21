const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

/**
 * WebRTC Service
 * Manages WebRTC room lifecycle for video/audio calls.
 *
 * In production, integrate with a media server (e.g., LiveKit, Twilio Video, mediasoup).
 * This implementation provides a clean interface that can be swapped for any provider.
 */

// In-memory store for active rooms (in production, use Redis)
const activeRooms = new Map();

// Default STUN/TURN servers
const DEFAULT_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: process.env.TURN_SERVER_URL || 'turn:turn.example.com:3478',
    username: process.env.TURN_USERNAME || 'nexo',
    credential: process.env.TURN_CREDENTIAL || 'nexo_secret',
  },
];

/**
 * Creates a new WebRTC room for a call.
 *
 * @param {string} userId - ID of the call initiator
 * @param {string} targetId - ID of the lead or contact
 * @returns {{ roomId: string, iceServers: Array }}
 */
exports.createRoom = async (userId, targetId) => {
  const roomId = uuidv4();

  const room = {
    roomId,
    userId,
    targetId,
    createdAt: new Date(),
    participants: [userId],
    status: 'active',
  };

  activeRooms.set(roomId, room);

  logger.info(`WebRTC room created: ${roomId} by user ${userId}`);

  // If using LiveKit, create room here:
  // const lkRoom = await livekitClient.createRoom({ name: roomId, emptyTimeout: 300 });

  return {
    roomId,
    iceServers: DEFAULT_ICE_SERVERS,
  };
};

/**
 * Ends a WebRTC room and returns call duration.
 *
 * @param {string} roomId - Room ID to end
 * @returns {{ duration: number }} - Duration in seconds
 */
exports.endRoom = async (roomId) => {
  const room = activeRooms.get(roomId);

  if (!room) {
    logger.warn(`Attempted to end non-existent room: ${roomId}`);
    return { duration: 0 };
  }

  const duration = Math.floor((Date.now() - room.createdAt.getTime()) / 1000);

  room.status = 'ended';
  room.endedAt = new Date();
  room.duration = duration;

  // Clean up after a delay (keep for potential reconnects)
  setTimeout(() => {
    activeRooms.delete(roomId);
    logger.debug(`Room ${roomId} cleaned up`);
  }, 30000); // 30 seconds grace period

  logger.info(`WebRTC room ended: ${roomId}, duration: ${duration}s`);

  // If using LiveKit, delete room here:
  // await livekitClient.deleteRoom(roomId);

  return { duration };
};

/**
 * Gets the status of a room.
 * @param {string} roomId
 * @returns {Object|null}
 */
exports.getRoomStatus = (roomId) => {
  return activeRooms.get(roomId) || null;
};

/**
 * Generate access token for a participant.
 * In production, use provider-specific token generation (e.g., LiveKit AccessToken).
 *
 * @param {string} roomId
 * @param {string} participantId
 * @returns {string} - Access token
 */
exports.generateParticipantToken = (roomId, participantId) => {
  // Placeholder — replace with actual provider token generation
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { roomId, participantId, exp: Math.floor(Date.now() / 1000) + 3600 },
    process.env.JWT_SECRET || 'webrtc_secret'
  );
};
