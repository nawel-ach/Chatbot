document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('chatWidgetBtn');
  const win = document.getElementById('chatWidgetWindow');
  const close = document.getElementById('chatCloseBtn');
  const resize = document.getElementById('chatResizeBtn');

  btn.addEventListener('click', () => {
    win.classList.toggle('open');
  });
  
  close.addEventListener('click', () => {
    win.classList.remove('open');
  });
  
  resize.addEventListener('pointerdown', () => {
    win.classList.toggle('maximized');
    resize.classList.toggle('fa-expand');
    resize.classList.toggle('fa-compress');
  });
});

// === Configuration ===
const BASE_URL = (function () {
  // Auto-detect local dev vs production
  const host = location.hostname;
  if (/^(localhost|127\.0\.0\.1)$/.test(host)) {
    return 'http://127.0.0.1:5000'; // Flask backend port
  }
  // For production, use your actual server URL
  return 'https://your-production-server.com'; // Update this with your production URL
})();

const CHAT_ENDPOINT = `${BASE_URL}/api/chat`;


// === IMOBOTChat class ===
class IMOBOTChat {
  constructor() {
    // Session persistence so chat context can be reused across refresh
    this.sessionKey = 'imobot_session_id';
    this.sessionId = this._restoreOrCreateSessionId();

    // simple runtime stats
    this.messageCount = 0;
    this.partsFound = 0;
    this.startTime = Date.now();
    this.isTyping = false;

    // DOM refs
    this._bindElements();
    this._bindEvents();

    // start
    this._updateStats();
    this._startStatsTicker();
    this._showWelcomeMessage();
  }

  // --- Session helpers ---
  _restoreOrCreateSessionId() {
    try {
      const stored = localStorage.getItem(this.sessionKey);
      if (stored) return stored;
    } catch (e) {
      console.warn('LocalStorage not available:', e);
    }
    const newId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    try { localStorage.setItem(this.sessionKey, newId); } catch (e) {}
    return newId;
  }

  // --- DOM binding ---
  _bindElements() {
    this.messagesContainer = document.getElementById('messages');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.sessionTimeEl = document.getElementById('session-time');
    this.messageCountEl = document.getElementById('message-count');
    this.partsFoundEl = document.getElementById('parts-found');
  }

  // --- Events ---
  _bindEvents() {
    this.sendBtn.addEventListener('click', () => this.sendMessage());

    // send on Enter (no Shift)
    this.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // auto-resize textarea
    this.messageInput.addEventListener('input', () => this._autoResize(this.messageInput));

    // quick action buttons
    document.querySelectorAll('.quick-btn[data-prompt]').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.dataset.prompt || '';
        this._setInputAndFocus(prompt);
      });
    });

    // allow paste of long queries and keep scroll in view
    this.messagesContainer.addEventListener('click', () => this.messageInput.focus());
  }

  // --- UI utilities ---
  _autoResize(textarea) {
    textarea.style.height = '44px';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  }

  _setInputAndFocus(text) {
    this.messageInput.value = text;
    this._autoResize(this.messageInput);
    this.messageInput.focus();
  }

  _escapeHtml(s = '') {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  _formatMessage(content = '') {
    // sanitize & simple formatting: links and linebreaks
    let safe = this._escapeHtml(content);
    // turn URLs into anchors
    safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    // simple bold support **text**
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // replace newlines
    safe = safe.replace(/\n/g, '<br>');
    return safe;
  }

  _scrollToBottom(instant = false) {
    // smooth behavior but fallback to immediate scroll to avoid jitter
    try {
      if (instant) {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
      } else {
        this.messagesContainer.scrollTo({ top: this.messagesContainer.scrollHeight, behavior: 'smooth' });
      }
    } catch (e) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  _createMessageElement(role, htmlContent) {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role} fade-in`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    const icon = document.createElement('i');
    icon.className = role === 'bot' ? 'fas fa-robot' : 'fas fa-user';
    avatar.appendChild(icon);

    const content = document.createElement('div');
    content.className = 'message-content';
    content.innerHTML = htmlContent;

    wrapper.appendChild(avatar);
    wrapper.appendChild(content);
    return wrapper;
  }

  _addMessage(role, text) {
    const formatted = this._formatMessage(text || '');
    const el = this._createMessageElement(role, formatted);
    this.messagesContainer.appendChild(el);
    this._scrollToBottom();
    return el;
  }

  // --- Typing indicator ---
  _showTyping() {
    if (this.isTyping) return;
    this.isTyping = true;
    this.sendBtn.disabled = true;

    const typingEl = document.createElement('div');
    typingEl.id = 'typing-indicator';
    typingEl.className = 'typing-indicator fade-in';
    typingEl.innerHTML = `
      <i class="fas fa-robot"></i>
      <span>IMOBOT is thinking</span>
      <div class="typing-dots"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>
    `;
    this.messagesContainer.appendChild(typingEl);
    this._scrollToBottom();
  }

  _hideTyping() {
    this.isTyping = false;
    this.sendBtn.disabled = false;
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  // --- Toast notifications ---
  _showToast(message, type = 'info', ms = 3000) {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  // --- Stats ---
  _updateStats() {
    try { this.sessionTimeEl.textContent = this._formatDuration(Date.now() - this.startTime); } catch (e) {}
    try { this.messageCountEl.textContent = String(this.messageCount); } catch (e) {}
    try { this.partsFoundEl.textContent = String(this.partsFound); } catch (e) {}
  }

  _startStatsTicker() {
    setInterval(() => this._updateStats(), 60_000);
  }

  _formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  // === Main: sendMessage -> calls backend ===
async sendMessage() {
  const raw = (this.messageInput.value || '').trim();
  if (!raw || this.isTyping) return;

  // Show user's message
  this._addMessage('user', raw);
  this.messageInput.value = '';
  this._autoResize(this.messageInput);
  this.messageCount++;

  // Display typing indicator
  this._showTyping();

  // Prepare payload with sessionId
  const payload = { 
    message: raw, 
    sessionId: this.sessionId 
  };

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    this._hideTyping();

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.error('Server error:', res.status, errorText);
      this._addMessage('bot', `⚠️ Server error (${res.status}). Please try again.`);
      this._showToast('Server error: ' + res.status, 'error');
      return;
    }

    const data = await res.json();
    this._handleServerResponse(data);
    
  } catch (err) {
    this._hideTyping();
    console.error('Network error:', err);
    this._addMessage('bot', '🔌 Connection error. Please check if the backend server is running on port 5000.');
    this._showToast('Network error - Is the backend running?', 'error');
  } finally {
    this._updateStats();
  }
}

  // --- Response handler (expects JSON shape from your chatservice) ---
  _handleServerResponse(data) {
    // Expected common shape:
    // { type: 'parts' | 'order' | 'text' | 'command', reply: 'string', data: [...], suggestions: [...] , metadata: {...} }

    // Always display bot textual reply if present
    if (data.reply) {
  // Remove any line that starts with "📊 Stock:"
       const filteredReply = data.reply.replace(/📊 Stock:.*(\n|$)/, '');
       this._addMessage('bot', filteredReply.trim());
}


    // Handle parts list (inventory search)
    if (data.type === 'parts' && Array.isArray(data.data)) {
      const normalized = data.data.map(p => this._normalizePart(p));
      this._displayParts(normalized);

      // if metadata.total_found supplied prefer it; else use array length
      const foundCount = (data.metadata && Number(data.metadata.total_found)) || normalized.length || 0;
      this.partsFound += foundCount;
      this._updateStats();
    }

    // Handle order tracking
    else if (data.type === 'order' && data.data) {
      this._displayOrder(data.data);
    }

    // Handle command results (future)
    else if (data.type === 'command' && data.data) {
      // Render a generic card or table depending on payload shape
      this._addMessage('bot', typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2));
    }

    // Suggestions / quick chips
    if (Array.isArray(data.suggestions) && data.suggestions.length) {
      this._renderSuggestions(data.suggestions);
    }

    // If not any of above and no reply, show fallback
    if (!data.reply && !data.data) {
      this._addMessage('bot', 'I did not understand the response from the server. Please try rephrasing.');
    }

    // increment message count for bot reply
    this.messageCount++;
  }

  // --- Normalize part object to your DB schema ---
  _normalizePart(raw = {}) {
    // raw may come with different field names from nlp_processor/parts_service
    return {
      id: raw.id ?? raw._id ?? null,
      part_no: raw.part_no ?? raw.partNumber ?? raw.serial ?? (raw.part || ''),

      brand: raw.brand ?? raw.make ?? raw.manufacturer ?? '',
      model: raw.model ?? raw.vehicle_model ?? '',
      description: raw.description ?? raw.desc ?? raw.name ?? '',
      qty: (typeof raw.qty !== 'undefined') ? Number(raw.qty) : ((typeof raw.quantity !== 'undefined') ? Number(raw.quantity) : 0),
      unit_price: (typeof raw.unit_price !== 'undefined') ? raw.unit_price : (typeof raw.price !== 'undefined' ? raw.price : null),
    };
  }

  // --- Render parts cards ---
  _displayParts(parts = []) {
    if (!parts.length) {
      this._addMessage('bot', 'No matching parts found in inventory.');
      return;
    }

    const container = document.createElement('div');
    container.className = 'parts-list fade-in';

    // show up to 8 items inline
    parts.slice(0, 8).forEach(p => {
      const card = document.createElement('div');
      card.className = 'part-card';

      const priceText = (p.unit_price !== null && p.unit_price !== undefined && !isNaN(Number(p.unit_price)))
        ? `${Number(p.unit_price).toFixed(2)} DZD`
        : 'Price on request';

      const stock = Number.isFinite(p.qty) ? p.qty : 0;
      let stockHtml = '';
      if (stock > 0) {
        stockHtml = `<div class="part-stock available" title="Stock">
                      <i class="fas fa-boxes"></i> Available
                    </div>`;
}



      const partNo = this._escapeHtml(p.part_no || '');
      const brand = this._escapeHtml(p.brand || '');
      const model = this._escapeHtml(p.model || '');
      const desc = this._escapeHtml(p.description || '');

      card.innerHTML = `
        <div class="part-name">${desc || partNo || 'Spare Part'}</div>
        <div class="part-details">
          <div title="Part number"><i class="fas fa-barcode"></i> ${partNo}</div>
          <div title="Brand"><i class="fas fa-tag"></i> ${brand || 'Generic'}</div>
          <div class="part-price" title="Unit price"><i class="fas fa-money-bill"></i> ${priceText}</div>
          ${stockHtml}
        </div>
      `;


      // clicking a card triggers a follow-up question about that part
      card.addEventListener('click', () => {
        const follow = `Tell me more about part ${partNo || desc}`;
        this._setInputAndFocus(follow);
      });

      container.appendChild(card);
    });

    if (parts.length > 8) {
      const more = document.createElement('div');
      more.style.textAlign = 'center';
      more.style.padding = '8px';
      more.style.color = 'var(--text-secondary)';
      more.innerText = `... and ${parts.length - 8} more results`;
      container.appendChild(more);
    }

    this.messagesContainer.appendChild(container);
    this._scrollToBottom();
  }

  // --- Render order card ---
  _displayOrder(order = {}) {
    // expected order shape maybe: { tracking_id, status, courier, last_update, history: [...] }
    const card = document.createElement('div');
    card.className = 'order-card fade-in';

    const status = (order.status || 'Unknown').toString();
    const lastUpdate = order.last_update ? new Date(order.last_update).toLocaleString() : '';
    const courier = order.courier || 'Yalidine';
    const tracking = order.tracking_id || order.tracking || order.id || '';

    const statusIcon = this._getStatusIcon(status);
    const statusColor = this._getStatusColor(status);

    const historyHtml = Array.isArray(order.history) ? order.history.slice(-4).map(h => {
      const date = h.date ? new Date(h.date).toLocaleString() : '';
      const ev = this._escapeHtml(h.event || h.status || '');
      return `<div class="timeline-item"><i class="fas fa-circle" style="font-size:8px;color:var(--primary)"></i><span style="margin-left:6px;font-size:13px;color:var(--text-secondary)">${date} — ${ev}</span></div>`;
    }).join('') : '';

    card.innerHTML = `
      <div class="order-status">
        <i class="fas ${statusIcon}" style="color: ${statusColor}; margin-right:8px"></i>
        <strong>${this._escapeHtml(status)}</strong>
        <span style="margin-left:auto; font-size:12px; color:var(--text-secondary)">${lastUpdate}</span>
      </div>

      <div style="font-size:14px; color:var(--text-secondary); margin-bottom:8px;">
        <i class="fas fa-truck"></i> Courier: ${this._escapeHtml(courier)} |
        <i class="fas fa-hashtag"></i> ID: ${this._escapeHtml(tracking)}
      </div>

      ${historyHtml ? `<div class="order-timeline">${historyHtml}</div>` : ''}
    `;

    this.messagesContainer.appendChild(card);
    this._scrollToBottom();
  }

  _getStatusIcon(status) {
    const s = (status || '').toString().toLowerCase();
    const map = { 'en transit': 'fa-truck', 'in transit': 'fa-truck', delivered: 'fa-check-circle', pending: 'fa-clock', processing: 'fa-cog', awaiting: 'fa-hourglass-half' };
    return map[s] || 'fa-info-circle';
  }

  _getStatusColor(status) {
    const s = (status || '').toString().toLowerCase();
    const map = { 'en transit': '#f59e0b', 'in transit': '#f59e0b', delivered: '#10b981', pending: '#6b7280', processing: '#3b82f6' };
    return map[s] || '#6b7280';
  }

  // --- Render suggestions (chips) ---
  _renderSuggestions(list = []) {
    if (!Array.isArray(list) || !list.length) return;

    const wrap = document.createElement('div');
    wrap.className = 'suggestions fade-in';

    const map = {
      'Search Parts (Find by vehicle or part)': { prompt: 'Find brake pads for Toyota Corolla 2020', icon: 'fas fa-search' },
      'Serial Lookup (Enter part number)': { prompt: 'Part number 35001110XKV08B', icon: 'fas fa-barcode' },
      'Track Order (Yalidine)': { prompt: 'Track order 123456789', icon: 'fas fa-truck' },
      'Daily Report (Inventory summary)': { prompt: 'daily report', icon: 'fas fa-chart-line' }
    };

    list.forEach(label => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn';
      const info = map[label] || { prompt: label, icon: 'fas fa-lightbulb' };
      btn.innerHTML = `<i class="${info.icon}"></i> ${label}`;

      btn.addEventListener('click', () => {
        this._setInputAndFocus(info.prompt);
      });

      wrap.appendChild(btn);
    });

    this.messagesContainer.appendChild(wrap);
    this._scrollToBottom();
  }

  // --- Welcome message at startup ---
  async _showWelcomeMessage() {
    // short delay so UI mounts first
    await new Promise(r => setTimeout(r, 300));
    const welcome = [
      '👋 Welcome to IMOBOT — your Algerian spare parts assistant.',
      '',
      'Here are some quick actions to get started 👇'

    ].join('\n');

    this._addMessage('bot', welcome);

    
    this._renderSuggestions([
      'Search Parts (Find by vehicle or part)',
      'Serial Lookup (Enter part number)',
      'Track Order (Yalidine)',
      'Daily Report (Inventory summary)'
    ]);
  }
}

// === Public utilities ===
window.clearChat = function clearChat() {
  if (!confirm('Are you sure you want to clear the chat history?')) return;
  // keep session id unless user explicitly wants new session
  // to generate a fresh session uncomment the localStorage removal line below:
  // localStorage.removeItem('imobot_session_id');
  location.reload();
};

// Boot IMOBOT
try {
  window.imobot = new IMOBOTChat();
  console.log('🤖 IMOBOT v2.0 initialized (frontend)');
} catch (e) {
  console.error('Failed to initialize IMOBOT frontend:', e);
}