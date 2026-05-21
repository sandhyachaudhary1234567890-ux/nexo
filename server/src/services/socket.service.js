'use strict';
let io;

const socketService = {
  /**
   * Initialize the service with a Socket.io server instance.
   * Must be called once during app bootstrap before any emit is attempted.
   * @param {import('socket.io').Server} ioInstance
   */
  initialize(ioInstance) {
    io = ioInstance;
    if (!io) throw new Error('Socket.io instance is required');
  },

  /**
   * Emit an event to all sockets joined to a user-specific room.
   * @param {string} userId
   * @param {string} event
   * @param {object} data
   */
  emitToUser(userId, event, data) {
    if (!io) return;
    io.to(`user:${userId.toString()}`).emit(event, { ...data, timestamp: new Date() });
  },

  /**
   * Broadcast an event to every connected socket.
   * @param {string} event
   * @param {object} data
   */
  broadcast(event, data) {
    if (!io) return;
    io.emit(event, { ...data, timestamp: new Date() });
  },

  /**
   * Emit an event to all sockets in an arbitrary named room.
   * @param {string} room
   * @param {string} event
   * @param {object} data
   */
  emitToRoom(room, event, data) {
    if (!io) return;
    io.to(room).emit(event, { ...data, timestamp: new Date() });
  },

  /**
   * Make a socket join a named room.
   * @param {string} socketId
   * @param {string} room
   */
  joinRoom(socketId, room) {
    if (!io) return;
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.join(room);
  },

  /**
   * Make a socket leave a named room.
   * @param {string} socketId
   * @param {string} room
   */
  leaveRoom(socketId, room) {
    if (!io) return;
    const socket = io.sockets.sockets.get(socketId);
    if (socket) socket.leave(room);
  },

  /** Return the raw Socket.io server instance. */
  getIO() { return io; },

  /** Return true if the service has been initialized. */
  isInitialized() { return !!io; }
};

module.exports = socketService;
