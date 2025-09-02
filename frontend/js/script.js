
        // Create animated background particles
        function createParticles() {
            const container = document.getElementById('bgParticles');
            const particleCount = 15;
            
            for (let i = 0; i < particleCount; i++) {
                const particle = document.createElement('div');
                particle.className = 'particle';
                
                const size = Math.random() * 6 + 2;
                const leftPosition = Math.random() * 100;
                const animationDelay = Math.random() * 20;
                const animationDuration = Math.random() * 10 + 15;
                
                particle.style.cssText = `
                    width: ${size}px;
                    height: ${size}px;
                    left: ${leftPosition}%;
                    animation-delay: ${animationDelay}s;
                    animation-duration: ${animationDuration}s;
                `;
                
                container.appendChild(particle);
            }
        }

        // Initialize particles
        createParticles();

        // Enhanced Chat Widget Functionality
        document.addEventListener('DOMContentLoaded', () => {
            const btn = document.getElementById('chatWidgetBtn');
            const win = document.getElementById('chatWidgetWindow');
            const close = document.getElementById('chatCloseBtn');
            const resize = document.getElementById('chatResizeBtn');

            btn.addEventListener('click', () => {
                win.classList.toggle('open');
                btn.classList.remove('pulse');
                if (win.classList.contains('open')) {
                    btn.style.transform = 'scale(0.9)';
                } else {
                    btn.style.transform = 'scale(1)';
                }
            });
            
            close.addEventListener('click', () => {
                win.classList.remove('open');
                btn.style.transform = 'scale(1)';
                btn.classList.add('pulse');
            });
            
            resize.addEventListener('click', () => {
                win.classList.toggle('maximized');
                resize.classList.toggle('fa-expand');
                resize.classList.toggle('fa-compress');
            });

            // Auto-resize textarea
            const messageInput = document.getElementById('messageInput');
            messageInput.addEventListener('input', function() {
                this.style.height = '50px';
                this.style.height = Math.min(this.scrollHeight, 150) + 'px';
            });

            // Enhanced send functionality
            const sendBtn = document.getElementById('sendBtn');
            sendBtn.addEventListener('click', () => {
                if (window.imobot) {
                    window.imobot.sendMessage();
                }
            });

            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (window.imobot) {
                        window.imobot.sendMessage();
                    }
                }
            });
        });

        // === Configuration ===
        const BASE_URL = (function () {
            const host = location.hostname;
            if (/^(localhost|127\.0\.0\.1)$/.test(host)) {
                return 'http://127.0.0.1:5000';
            }
            return 'https://your-production-server.com';
        })();

        const CHAT_ENDPOINT = `${BASE_URL}/api/chat`;

        // === Enhanced IMOBOTChat class ===
        class IMOBOTChat {
            constructor() {
                this.sessionKey = 'imobot_session_id';
                this.sessionId = this._restoreOrCreateSessionId();
                this.messageCount = 0;
                this.partsFound = 0;
                this.startTime = Date.now();
                this.isTyping = false;
                
                this._bindElements();
                this._bindEvents();
                this._showWelcomeMessage();
            }

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

            _bindElements() {
                this.messagesContainer = document.getElementById('messages');
                this.messageInput = document.getElementById('messageInput');
                this.sendBtn = document.getElementById('sendBtn');
            }

            _bindEvents() {
                this.sendBtn.addEventListener('click', () => this.sendMessage());

                this.messageInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.sendMessage();
                    }
                });

                this.messagesContainer.addEventListener('click', () => this.messageInput.focus());
            }

            _autoResize(textarea) {
                textarea.style.height = '50px';
                textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
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
                let safe = this._escapeHtml(content);
                safe = safe.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
                safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
                safe = safe.replace(/\n/g, '<br>');
                return safe;
            }

            _scrollToBottom(instant = false) {
                try {
                    if (instant) {
                        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                    } else {
                        this.messagesContainer.scrollTo({ 
                            top: this.messagesContainer.scrollHeight, 
                            behavior: 'smooth' 
                        });
                    }
                } catch (e) {
                    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
                }
            }

            _createMessageElement(role, htmlContent) {
                const wrapper = document.createElement('div');
                wrapper.className = `message ${role}`;

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

            _showTyping() {
                if (this.isTyping) return;
                this.isTyping = true;
                this.sendBtn.disabled = true;

                const typingEl = document.createElement('div');
                typingEl.id = 'typing-indicator';
                typingEl.className = 'typing-indicator';
                typingEl.innerHTML = `
                    <div class="message-avatar" style="background: linear-gradient(135deg, var(--primary), var(--primary-light)); color: white;">
                        <i class="fas fa-robot"></i>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span>IMOBOT is thinking</span>
                        <div class="typing-dots">
                            <div class="dot"></div>
                            <div class="dot"></div>
                            <div class="dot"></div>
                        </div>
                    </div>
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

            _showToast(message, type = 'info', ms = 4000) {
                const toast = document.createElement('div');
                toast.className = `toast ${type}`;
                toast.textContent = message;
                document.body.appendChild(toast);
                
                setTimeout(() => {
                    toast.style.animation = 'slideOutRight 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    setTimeout(() => toast.remove(), 400);
                }, ms);
            }

            async sendMessage() {
                const raw = (this.messageInput.value || '').trim();
                if (!raw || this.isTyping) return;

                this._addMessage('user', raw);
                this.messageInput.value = '';
                this._autoResize(this.messageInput);
                this.messageCount++;

                this._showTyping();

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
                }
            }

            _handleServerResponse(data) {
                if (data.reply) {
                    this._addMessage('bot', data.reply);
                }

                if (data.type === 'parts' && Array.isArray(data.data)) {
                    const normalized = data.data.map(p => this._normalizePart(p));
                    this._displayParts(normalized);
                    const foundCount = (data.metadata && Number(data.metadata.total_found)) || normalized.length || 0;
                    this.partsFound += foundCount;
                } else if (data.type === 'order' && data.data) {
                    this._displayOrder(data.data);
                } else if (data.type === 'command' && data.data) {
                    this._addMessage('bot', typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2));
                }

                if (Array.isArray(data.suggestions) && data.suggestions.length) {
                    this._renderSuggestions(data.suggestions);
                }

                if (!data.reply && !data.data) {
                    this._addMessage('bot', 'I did not understand the response from the server. Please try rephrasing.');
                }

                this.messageCount++;
            }

            _normalizePart(raw = {}) {
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

            _displayParts(parts = []) {
                if (!parts.length) {
                    this._addMessage('bot', 'No matching parts found in inventory.');
                    return;
                }

                const container = document.createElement('div');
                container.className = 'parts-list';

                parts.slice(0, 8).forEach(p => {
                    const card = document.createElement('div');
                    card.className = 'part-card';

                    const priceText = (p.unit_price !== null && p.unit_price !== undefined && !isNaN(Number(p.unit_price)))
                        ? `${Number(p.unit_price).toFixed(2)} DZD`
                        : 'Price on request';

                    const stock = Number.isFinite(p.qty) ? p.qty : 0;
                    const stockClass = stock === 0 ? 'out' : (stock < 5 ? 'low' : '');
                    const stockText = stock === 0 ? 'Out of stock' : 'Available';

                    const partNo = this._escapeHtml(p.part_no || '');
                    const brand = this._escapeHtml(p.brand || '');
                    const desc = this._escapeHtml(p.description || '');

                    card.innerHTML = `
                        <div class="part-name">${desc || partNo || 'Spare Part'}</div>
                        <div class="part-details">
                            <div><i class="fas fa-barcode"></i> ${partNo}</div>
                            <div><i class="fas fa-tag"></i> ${brand || 'Generic'}</div>
                            <div class="part-price"><i class="fas fa-money-bill"></i> ${priceText}</div>
                            <div class="part-stock ${stockClass}"><i class="fas fa-boxes"></i> ${stockText}</div>
                        </div>
                    `;

                    card.addEventListener('click', () => {
                        const follow = `Tell me more about part ${partNo || desc}`;
                        this._setInputAndFocus(follow);
                    });

                    container.appendChild(card);
                });

                if (parts.length > 8) {
                    const more = document.createElement('div');
                    more.style.cssText = 'text-align: center; padding: 12px; color: var(--text-secondary); font-weight: 600;';
                    more.innerHTML = `<i class="fas fa-plus-circle"></i> ${parts.length - 8} more results available`;
                    container.appendChild(more);
                }

                this.messagesContainer.appendChild(container);
                this._scrollToBottom();
            }

            _displayOrder(order = {}) {
                const card = document.createElement('div');
                card.className = 'order-card';
                card.style.cssText = `
                    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
                    border: 2px solid #0ea5e9;
                    border-radius: var(--radius);
                    padding: 20px;
                    margin-top: 16px;
                    position: relative;
                    overflow: hidden;
                `;

                const status = (order.status || 'Unknown').toString();
                const lastUpdate = order.last_update ? new Date(order.last_update).toLocaleString() : '';
                const courier = order.courier || 'Yalidine';
                const tracking = order.tracking_id || order.tracking || order.id || '';

                const statusIcon = this._getStatusIcon(status);
                const statusColor = this._getStatusColor(status);

                card.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                        <i class="fas ${statusIcon}" style="color: ${statusColor}; font-size: 20px;"></i>
                        <div>
                            <div style="font-weight: 700; font-size: 16px;">${this._escapeHtml(status)}</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">${lastUpdate}</div>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 14px; color: var(--text-secondary);">
                        <div><i class="fas fa-truck"></i> ${this._escapeHtml(courier)}</div>
                        <div><i class="fas fa-hashtag"></i> ${this._escapeHtml(tracking)}</div>
                    </div>
                `;

                this.messagesContainer.appendChild(card);
                this._scrollToBottom();
            }

            _getStatusIcon(status) {
                const s = (status || '').toString().toLowerCase();
                const map = { 
                    'en transit': 'fa-truck', 
                    'in transit': 'fa-truck', 
                    'delivered': 'fa-check-circle', 
                    'pending': 'fa-clock', 
                    'processing': 'fa-cog' 
                };
                return map[s] || 'fa-info-circle';
            }

            _getStatusColor(status) {
                const s = (status || '').toString().toLowerCase();
                const map = { 
                    'en transit': '#f59e0b', 
                    'in transit': '#f59e0b', 
                    'delivered': '#10b981', 
                    'pending': '#6b7280', 
                    'processing': '#3b82f6' 
                };
                return map[s] || '#6b7280';
            }

            _renderSuggestions(list = []) {
                if (!Array.isArray(list) || !list.length) return;

                const wrap = document.createElement('div');
                wrap.className = 'suggestions';

                const map = {
                    'Search Parts (Find by vehicle or part)': { 
                        prompt: 'Find brake pads for Toyota Corolla 2020', 
                        icon: 'fas fa-search' 
                    },
                    'Serial Lookup (Enter part number)': { 
                        prompt: 'Part number 35001110XKV08B', 
                        icon: 'fas fa-barcode' 
                    },
                    'Track Order (Yalidine)': { 
                        prompt: 'Track order 123456789', 
                        icon: 'fas fa-truck' 
                    },
                    'Daily Report (Inventory summary)': { 
                        prompt: 'daily report', 
                        icon: 'fas fa-chart-line' 
                    }
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

            async _showWelcomeMessage() {
                await new Promise(r => setTimeout(r, 500));
                
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                welcomeDiv.innerHTML = `
                    <div class="welcome-title">🚀 Welcome to IMOBOT v3.0</div>
                    <div class="welcome-subtitle">
                        Your intelligent Algerian spare parts assistant powered by AI
                    </div>
                    <div class="welcome-features">
                        <div class="feature-item">
                            <i class="fas fa-search"></i>
                            <span>Smart Search</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-barcode"></i>
                            <span>Part Lookup</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-truck"></i>
                            <span>Order Tracking</span>
                        </div>
                        <div class="feature-item">
                            <i class="fas fa-chart-line"></i>
                            <span>Analytics</span>
                        </div>
                    </div>
                `;

                this.messagesContainer.appendChild(welcomeDiv);

                setTimeout(() => {
                    this._renderSuggestions([
                        'Search Parts (Find by vehicle or part)',
                        'Serial Lookup (Enter part number)', 
                        'Track Order (Yalidine)',
                        'Daily Report (Inventory summary)'
                    ]);
                }, 800);
            }
        }

        // Initialize IMOBOT when DOM is ready
        try {
            window.imobot = new IMOBOTChat();
            console.log('🤖 IMOBOT v3.0 initialized successfully');
        } catch (e) {
            console.error('Failed to initialize IMOBOT:', e);
        }

        // Global utility functions
        window.clearChat = function() {
            if (!confirm('Are you sure you want to clear the chat history?')) return;
            location.reload();
        };

        // Add some visual enhancements
        document.addEventListener('DOMContentLoaded', () => {
            // Add smooth scrolling to all elements
            document.documentElement.style.scrollBehavior = 'smooth';
            
            // Add focus management
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const chatWindow = document.getElementById('chatWidgetWindow');
                    if (chatWindow.classList.contains('open')) {
                        chatWindow.classList.remove('open');
                        document.getElementById('chatWidgetBtn').classList.add('pulse');
                    }
                }
            });
        });
