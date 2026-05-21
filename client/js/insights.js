// js/insights.js — AI Chat with SSE streaming

let _chatHistory = [];

function initInsights() {
  _chatHistory = [];
  renderWelcomeMessage();
}

function renderWelcomeMessage() {
  const prefs = window.nexo?.user?.preferences || {};
  const hasAnyKey = !!(prefs.groqKey || prefs.openaiKey || prefs.geminiKey);
  
  if (!hasAnyKey) {
    const warningText = `
      <div style="font-weight:600;margin-bottom:0.5rem;font-size:0.95rem;color:var(--text)">👋 Welcome to Nexo AI Insights!</div>
      <p style="margin-bottom:0.75rem;line-height:1.4">Nexo AI is currently <strong style="color:var(--amber)">inactive</strong>. To activate it, you must configure at least one API key (OpenAI, Google Gemini, or Groq) in settings. The other keys are completely optional, and the system will auto-fallback to whichever key you configure.</p>
      <div style="margin-top:1rem">
        <button class="btn btn-primary" onclick="openSettingsModal()"><i class="fas fa-cog" style="margin-right:0.4rem"></i>Configure API Keys</button>
      </div>
    `;
    appendMsg('ai', warningText, true);
  } else {
    appendMsg('ai', `👋 **Hi, I'm Nexo AI!** I can help you:
- Analyze your leads and deals
- Draft personalized outreach emails  
- Research companies and markets
- Generate campaign strategy ideas

What would you like to explore today?`);
  }
}

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  if (!text) return;

  input.value = '';
  input.style.height = '44px';

  appendMsg('user', text);
  _chatHistory.push({ role: 'user', content: text });

  const provider = document.getElementById('chat-provider')?.value || 'groq';
  const taskType = detectTaskType(text);
  const typingId = appendTyping();

  try {
    const res = await fetch('http://localhost:5000/api/ai/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify({ messages: _chatHistory, taskType, provider })
    });

    if (!res.ok) throw new Error('Chat request failed');

    removeTyping(typingId);
    const msgId = appendMsg('ai', '');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') break;
        try {
          const { chunk: text } = JSON.parse(payload);
          if (text) {
            fullText += text;
            updateMsg(msgId, fullText);
          }
        } catch {}
      }
    }

    _chatHistory.push({ role: 'assistant', content: fullText });
  } catch (err) {
    removeTyping(typingId);
    appendMsg('ai', '⚠️ Sorry, I couldn\'t process that. Please check your AI API keys in settings.');
    console.error('[Insights] Chat error:', err);
  }
}

function detectTaskType(text) {
  const lower = text.toLowerCase();
  if (lower.includes('email') || lower.includes('draft') || lower.includes('write')) return 'draft';
  if (lower.includes('analyze') || lower.includes('analysis') || lower.includes('summary')) return 'analysis';
  return 'chat';
}

function getAccessToken() {
  return document.cookie.match(/accessToken=([^;]+)/)?.[1] || '';
}

function appendMsg(role, text, isHtml = false) {
  const id = 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const container = document.getElementById('chat-messages');
  if (!container) return id;

  const isUser = role === 'user';
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">
      ${isUser ? '<i class="fas fa-user"></i>' : '<i class="fas fa-robot"></i>'}
    </div>
    <div class="msg-bubble">${isHtml ? text : renderMarkdown(text)}</div>`;

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function updateMsg(id, text) {
  const el = document.getElementById(id);
  if (el) {
    el.querySelector('.msg-bubble').innerHTML = renderMarkdown(text);
    const container = document.getElementById('chat-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }
}

function appendTyping() {
  const id = 'typing-' + Date.now();
  const container = document.getElementById('chat-messages');
  if (!container) return id;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'msg ai';
  div.innerHTML = `
    <div class="msg-avatar"><i class="fas fa-robot"></i></div>
    <div class="msg-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTyping(id) {
  document.getElementById(id)?.remove();
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--card2);padding:0.1em 0.3em;border-radius:4px;font-size:0.85em">$1</code>')
    .replace(/^### (.+)$/gm, '<h4 style="margin:0.5rem 0 0.25rem;font-size:0.9rem">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:0.5rem 0 0.25rem">$1</h3>')
    .replace(/^- (.+)$/gm, '<li style="margin:0.15rem 0;padding-left:0.5rem">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="list-style:disc;padding-left:1.2rem">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:0.5rem 0">')
    .replace(/\n/g, '<br>');
}

// Quick action prompts
function sendQuickPrompt(text) {
  const input = document.getElementById('chat-input');
  if (input) { input.value = text; sendChat(); }
}

window.initInsights = initInsights;
window.sendChat = sendChat;
window.sendQuickPrompt = sendQuickPrompt;
