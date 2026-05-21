// js/calls.js — WebRTC calling interface

let _localStream = null;
let _peerConnection = null;
let _currentCallId = null;
let _currentRoomId = null;
let _callStartTime = null;
let _timerInterval = null;

const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function initCalls() {
  try {
    const { data } = await api.get('/calls?limit=20');
    renderCallsList(data.data);
  } catch (err) {
    console.error('[Calls] Error:', err);
    showToast('Failed to load calls', 'error');
  }
}

function renderCallsList(calls) {
  const el = document.getElementById('calls-list');
  if (!el) return;
  if (!calls.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon"><i class="fas fa-phone"></i></div>
      <div class="empty-title">No calls yet</div>
      <div class="empty-desc">Start a WebRTC call with a lead directly from their profile.</div>
    </div>`;
    return;
  }
  el.innerHTML = calls.map(c => `
    <div class="card card-sm mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="stat-icon ${c.status === 'ended' ? 'green' : 'blue'}" style="margin:0;width:36px;height:36px">
          <i class="fas fa-${c.status === 'ended' ? 'phone-slash' : 'phone'}"></i>
        </div>
        <div>
          <div class="font-semibold text-sm">Call ${c.roomId?.slice(0,8)}…</div>
          <div class="text-xs text-dim">${c.duration ? formatDuration(c.duration) : c.status} · ${new Date(c.createdAt).toLocaleString()}</div>
        </div>
      </div>
      <span class="badge ${c.status === 'ended' ? 'badge-gray' : 'badge-green'}">${c.status}</span>
    </div>`).join('');
}

async function startCall(leadId = null) {
  try {
    // Request media
    _localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    document.getElementById('local-video').srcObject = _localStream;

    // Create call on server
    const { data } = await api.post('/calls', { leadId });
    _currentCallId = data.data.callId;
    _currentRoomId = data.data.roomId;

    // Show call UI
    document.getElementById('call-modal')?.classList.add('open');
    document.getElementById('call-room-id').textContent = _currentRoomId;

    // Create peer connection
    _peerConnection = new RTCPeerConnection(ICE_CONFIG);
    _localStream.getTracks().forEach(t => _peerConnection.addTrack(t, _localStream));

    _peerConnection.ontrack = e => {
      const remoteVideo = document.getElementById('remote-video');
      if (remoteVideo) remoteVideo.srcObject = e.streams[0];
    };

    _peerConnection.onicecandidate = e => {
      if (e.candidate) {
        socketService.get()?.emit('call:ice-candidate', { roomId: _currentRoomId, candidate: e.candidate });
      }
    };

    // Socket signaling
    const socket = socketService.get();
    if (socket) {
      socket.emit('call:join', { roomId: _currentRoomId, userId: window.nexo?.user?._id, name: window.nexo?.user?.name || 'User' });

      socket.on('call:user-joined', async ({ userId, name }) => {
        document.getElementById('call-status-text').textContent = `${name} joined`;
        const offer = await _peerConnection.createOffer();
        await _peerConnection.setLocalDescription(offer);
        socket.emit('call:offer', { roomId: _currentRoomId, offer });
        startCallTimer();
      });

      socket.on('call:offer', async ({ offer }) => {
        await _peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await _peerConnection.createAnswer();
        await _peerConnection.setLocalDescription(answer);
        socket.emit('call:answer', { roomId: _currentRoomId, answer });
        startCallTimer();
      });

      socket.on('call:answer', async ({ answer }) => {
        await _peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      });

      socket.on('call:ice-candidate', ({ candidate }) => {
        _peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      });

      socket.on('call:user-left', () => {
        document.getElementById('call-status-text').textContent = 'Participant left';
        const remoteVideo = document.getElementById('remote-video');
        if (remoteVideo) remoteVideo.srcObject = null;
      });
    }
  } catch (err) {
    console.error('[Calls] Start error:', err);
    if (err.name === 'NotAllowedError') showToast('Camera/mic permission denied', 'error');
    else showToast('Failed to start call', 'error');
  }
}

async function endCall() {
  stopCallTimer();
  _peerConnection?.close();
  _localStream?.getTracks().forEach(t => t.stop());
  socketService.get()?.emit('call:leave', { roomId: _currentRoomId, userId: window.nexo?.user?._id });

  try {
    if (_currentCallId) await api.patch(`/calls/${_currentCallId}/end`);
  } catch {}

  document.getElementById('call-modal')?.classList.remove('open');
  _localStream = _peerConnection = _currentCallId = _currentRoomId = null;
  await initCalls();
}

function toggleMute() {
  if (!_localStream) return;
  const track = _localStream.getAudioTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    const btn = document.getElementById('mute-btn');
    if (btn) btn.innerHTML = `<i class="fas fa-microphone${track.enabled ? '' : '-slash'}"></i>`;
  }
}

function toggleVideo() {
  if (!_localStream) return;
  const track = _localStream.getVideoTracks()[0];
  if (track) {
    track.enabled = !track.enabled;
    const btn = document.getElementById('video-btn');
    if (btn) btn.innerHTML = `<i class="fas fa-video${track.enabled ? '' : '-slash'}"></i>`;
  }
}

function startCallTimer() {
  _callStartTime = Date.now();
  _timerInterval = setInterval(() => {
    const el = document.getElementById('call-timer');
    if (el) el.textContent = formatDuration(Math.floor((Date.now() - _callStartTime) / 1000));
  }, 1000);
}

function stopCallTimer() {
  clearInterval(_timerInterval);
  _timerInterval = null;
}

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

window.initCalls = initCalls;
window.startCall = startCall;
window.endCall = endCall;
window.toggleMute = toggleMute;
window.toggleVideo = toggleVideo;
