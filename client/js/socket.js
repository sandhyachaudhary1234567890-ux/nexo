// js/socket.js — Real-time Socket.io client

const SOCKET_URL = 'http://localhost:5000';
let _socket = null;

function initSocket(userId) {
  if (_socket) _socket.disconnect();

  _socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10
  });

  _socket.on('connect', () => {
    console.log('[Socket] Connected:', _socket.id);
    _socket.emit('auth', { userId });
  });

  _socket.on('notification:new', notification => {
    window.dispatchEvent(new CustomEvent('nexo:notification', { detail: notification }));
    showToast(notification.title, 'info');
    // Bump badge
    const badge = document.getElementById('notif-badge');
    if (badge) {
      const current = parseInt(badge.dataset.count || '0') + 1;
      badge.dataset.count = current;
      badge.textContent = current;
      badge.style.display = 'block';
    }
  });

  _socket.on('lead:enriched', data => {
    window.dispatchEvent(new CustomEvent('nexo:lead-enriched', { detail: data }));
    showToast('Lead enriched with fresh data!', 'success');
  });

  _socket.on('campaign:update', data => {
    window.dispatchEvent(new CustomEvent('nexo:campaign-update', { detail: data }));
  });

  _socket.on('disconnect', reason => console.log('[Socket] Disconnected:', reason));

  return _socket;
}

function getSocket() { return _socket; }
function disconnectSocket() { if (_socket) { _socket.disconnect(); _socket = null; } }

window.socketService = { init: initSocket, get: getSocket, disconnect: disconnectSocket };
