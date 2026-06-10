/* ============================================================
   NyaTicketTools – Dashboard Application (v2)
   ============================================================ */

(() => {
  'use strict';

  // ---- Tool definitions ----
  const TOOLS = [
    {
      id: 'biliTickerBuy',
      name: 'biliTickerBuy',
      desc: 'Python-based ticket purchase automation',
      color: '#7C3AED',
      abbrev: 'BTB',
      lang: 'Python',
      repo: 'https://github.com/mikumifa/biliTickerBuy',
    },
  ];

  function toolDesc(tool) {
    return getLang() === 'zh-CN' ? tool.desc_zh : tool.desc_en;
  }

  // ---- API ----
  const API_BASE = location.origin;

  async function apiCall(path, options = {}) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`API unavailable (${path}):`, e.message);
      return null;
    }
  }

  // ---- Storage ----
  const STORAGE_KEYS = {
    accounts: 'nya_accounts',
    tickets: 'nya_tickets',
    toolStates: 'nya_tool_states',
  };

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key)) || []; }
    catch { return []; }
  }
  function save(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }
  function loadObj(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; }
    catch { return {}; }
  }

  // ---- State ----
  let accounts = load(STORAGE_KEYS.accounts);
  let tickets = load(STORAGE_KEYS.tickets);
  let toolStates = loadObj(STORAGE_KEYS.toolStates);
  let editingAccountId = null;
  let scheduledTimers = [];
  let currentTicketStep = 1;

  // ---- Notification settings ----
  const STORAGE_KEY_SETTINGS = 'nya_settings';
  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_SETTINGS)) || {};
    } catch { return {}; }
  }
  function saveSettings(s) {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(s));
  }
  let settings = {
    soundEnabled: true,
    browserNotify: true,
    webhookUrl: '',
    preSaleStartSeconds: 5,   // seconds before sale to auto-start
    autoStopMinutes: 5,       // minutes after sale to auto-stop
    countdownAlerts: [300, 120, 60, 30, 10],  // seconds before sale to alert
    ...loadSettings(),
  };

  // ---- Sound system (Web Audio API, no external files) ----
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playBeep(freq, duration, repeat) {
    if (!settings.soundEnabled) return;
    try {
      const ctx = getAudioCtx();
      for (let i = 0; i < (repeat || 1); i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * (duration + 0.1));
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * (duration + 0.1) + duration);
        osc.start(ctx.currentTime + i * (duration + 0.1));
        osc.stop(ctx.currentTime + i * (duration + 0.1) + duration);
      }
    } catch (e) { /* ignore audio errors */ }
  }

  function playCountdownBeep(secondsLeft) {
    if (secondsLeft <= 10) {
      playBeep(880, 0.15, 1);  // high short beep
    } else if (secondsLeft <= 30) {
      playBeep(660, 0.2, 1);  // medium beep
    } else {
      playBeep(440, 0.3, 1);  // low beep
    }
  }

  function playSaleStartSound() {
    playBeep(1047, 0.2, 3);  // 3 high urgent beeps
  }

  // ---- Webhook notification via server ----
  async function sendWebhook(title, body) {
    if (!settings.webhookUrl) return;
    await apiCall('/api/notify', {
      method: 'POST',
      body: JSON.stringify({ title, body, webhook: settings.webhookUrl }),
    });
  }

  // ---- DOM refs ----
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

  const sidebar = $('#sidebar');
  const sidebarOverlay = $('#sidebarOverlay');
  const mobileMenuBtn = $('#mobileMenuBtn');
  const sidebarToggle = $('#sidebarToggle');
  const navItems = $$('.nav-item');
  const pages = $$('.page');
  const pageTitle = $('#pageTitle');

  // ---- Navigation ----
  function navigateTo(page) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.page === page));
    pages.forEach(p => {
      const isTarget = p.id === `page-${page}`;
      p.classList.toggle('active', isTarget);
      if (isTarget) animatePageIn(p);
    });
    const titles = { dashboard: t('nav_dashboard'), accounts: t('nav_accounts'), tickets: t('nav_tickets'), tools: t('nav_tools'), deploy: t('nav_deploy') };
    pageTitle.textContent = titles[page] || page;
    if (page === 'deploy') loadNodes();
    closeSidebar();
  }

  navItems.forEach(n => n.addEventListener('click', e => {
    e.preventDefault();
    navigateTo(n.dataset.page);
  }));

  // ---- Sidebar (mobile) ----
  function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.classList.add('active');
  }
  function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.classList.remove('active');
  }
  mobileMenuBtn.addEventListener('click', openSidebar);
  sidebarToggle.addEventListener('click', closeSidebar);
  sidebarOverlay.addEventListener('click', closeSidebar);

  // ---- Language switch ----
  const langBtn = $('#langSwitchBtn');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const newLang = getLang() === 'zh-CN' ? 'en' : 'zh-CN';
      setLang(newLang);
      langBtn.textContent = newLang === 'zh-CN' ? 'EN' : '中文';
    });
    langBtn.textContent = getLang() === 'zh-CN' ? 'EN' : '中文';
  }

  // ---- i18n DOM update ----
  function updateI18nDOM() {
    $$('[data-i18n]').forEach(el => {
      el.textContent = t(el.dataset.i18n);
    });
    // Update nav active title
    const activeNav = $('.nav-item.active');
    if (activeNav) {
      const page = activeNav.dataset.page;
      const titles = { dashboard: t('nav_dashboard'), accounts: t('nav_accounts'), tickets: t('nav_tickets'), tools: t('nav_tools'), deploy: t('nav_deploy') };
      pageTitle.textContent = titles[page] || page;
    }
  }

  // ---- GSAP Animations ----
  function animatePageIn(page) {
    const cards = $$('.glass, .tool-card, .tool-detail-card, .account-card, .readiness-card, .deploy-action-btn, .status-bar', page);
    if (!cards.length) return;
    gsap.fromTo(cards,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'transform' }
    );
  }

  function initCardHover() {
    document.addEventListener('mouseenter', e => {
      const card = e.target.closest('.readiness-card, .tool-card, .tool-detail-card, .account-card, .node-card');
      if (!card) return;
      gsap.to(card, { y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)', duration: 0.25, ease: 'power2.out' });
    }, true);
    document.addEventListener('mouseleave', e => {
      const card = e.target.closest('.readiness-card, .tool-card, .tool-detail-card, .account-card, .node-card');
      if (!card) return;
      gsap.to(card, { y: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.35), 0 1px 3px rgba(0,0,0,0.2)', duration: 0.3, ease: 'power2.out' });
    }, true);
  }

  function pulseElement(el) {
    gsap.fromTo(el, { scale: 1 }, { scale: 1.2, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.inOut' });
  }

  // ---- Toast ----
  function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const icons = {
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);
    gsap.fromTo(toast, { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out' });
    setTimeout(() => {
      gsap.to(toast, { opacity: 0, x: 40, duration: 0.3, ease: 'power2.in', onComplete: () => toast.remove() });
    }, 3000);
  }

  // ---- Cookie auto-parse ----
  function parseCookieString(cookieStr) {
    const result = { sessdata: '', biliJct: '', dedeUserId: '', uid: '' };
    if (!cookieStr) return result;
    const parts = cookieStr.split(';').map(s => s.trim());
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const key = part.slice(0, eqIdx).trim();
      const val = part.slice(eqIdx + 1).trim();
      switch (key) {
        case 'SESSDATA': result.sessdata = val; break;
        case 'bili_jct': result.biliJct = val; break;
        case 'DedeUserID': result.dedeUserId = val; result.uid = val; break;
      }
    }
    return result;
  }

  // ---- Cookie verification ----
  async function verifyCookie() {
    const sessdata = $('#accSessdata').value.trim();
    if (!sessdata) {
      showToast(t('account_verify_no_sessdata'), 'error');
      return;
    }
    const btn = $('#verifyCookieBtn');
    btn.disabled = true;
    btn.textContent = t('account_verifying');
    try {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: { 'Cookie': `SESSDATA=${sessdata}` },
        credentials: 'omit',
      });
      const data = await res.json();
      if (data.code === 0 && data.data?.isLogin) {
        const uname = data.data.uname || 'Unknown';
        const mid = data.data.mid || '';
        showToast(t('account_verify_ok', { name: `${uname} (UID: ${mid})` }), 'success');
        if (!$('#accUid').value) $('#accUid').value = String(mid);
        if (!$('#accName').value || $('#accName').value === 'My Bilibili' || $('#accName').value === '主号') $('#accName').value = uname;
      } else {
        showToast(t('account_verify_fail', { code: data.code }), 'error');
      }
    } catch (e) {
      showToast(t('account_verify_err'), 'warning');
    }
    btn.disabled = false;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> ${t('account_verify')}`;
  }

  // ---- Dashboard: Readiness checks ----
  function renderDashboard() {
    // Status bar
    const runningCount = Object.values(toolStates).filter(s => s.status === 'running').length;
    const statusBarText = $('#statusBarText');
    const statusBarDot = $('#statusBarDot');
    if (runningCount > 0) {
      statusBarText.textContent = t('dash_status_bar', { n: runningCount });
      statusBarDot.className = 'status-bar-dot running';
    } else {
      statusBarText.textContent = t('dash_status_idle');
      statusBarDot.className = 'status-bar-dot';
    }

    // Start/Stop all button
    const startAllBtn = $('#startAllBtn');
    if (runningCount > 0) {
      startAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> <span>${t('dash_stop_all')}</span>`;
      startAllBtn.className = 'btn btn-danger btn-start-all';
    } else {
      startAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> <span>${t('dash_start_all')}</span>`;
      startAllBtn.className = 'btn btn-primary btn-start-all';
    }

    // Readiness: Accounts
    const accWithCookie = accounts.filter(a => a.sessdata || a.cookie).length;
    const accStatus = $('#readinessAccountsStatus');
    const accDetail = $('#readinessAccountsDetail');
    if (accounts.length === 0) {
      accStatus.className = 'readiness-status warn';
      accStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      accDetail.textContent = t('dash_accounts_warn', { n: 0 });
    } else if (accWithCookie < accounts.length) {
      accStatus.className = 'readiness-status warn';
      accStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      accDetail.textContent = t('dash_accounts_warn', { n: accounts.length - accWithCookie });
    } else {
      accStatus.className = 'readiness-status ok';
      accStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      accDetail.textContent = `${accounts.length} ${t('dash_accounts_ready')}`;
    }

    // Readiness: Tickets
    const ticketStatus = $('#readinessTicketsStatus');
    const ticketDetail = $('#readinessTicketsDetail');
    if (tickets.length === 0 || !tickets[0]?.projectId) {
      ticketStatus.className = 'readiness-status warn';
      ticketStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
      ticketDetail.textContent = t('dash_tickets_warn');
    } else {
      ticketStatus.className = 'readiness-status ok';
      ticketStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      ticketDetail.textContent = tickets[0].name || t('dash_tickets_ready');
    }

    // Readiness: Tools
    const autoTools = TOOLS.filter(t => t.automatable);
    const toolStatus = $('#readinessToolsStatus');
    const toolDetail = $('#readinessToolsDetail');
    toolStatus.className = 'readiness-status ok';
    toolStatus.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
    toolDetail.textContent = t('dash_tools_ready', { n: autoTools.length });

    // Running tools section
    const runningGrid = $('#runningToolsGrid');
    const noRunningMsg = $('#noRunningMsg');
    const runningTools = TOOLS.filter(tool => {
      const state = toolStates[tool.id] || {};
      return state.status === 'running';
    });

    if (runningTools.length > 0) {
      noRunningMsg.style.display = 'none';
      runningGrid.innerHTML = runningTools.map(tool => renderToolCard(tool, true)).join('');
    } else {
      noRunningMsg.style.display = 'block';
      runningGrid.innerHTML = '';
    }

    // All tools (collapsed)
    const allGrid = $('#dashboardToolsGrid');
    allGrid.innerHTML = TOOLS.map(tool => renderToolCard(tool, false)).join('');

    // Onboarding
    const onboarding = $('#dashboardOnboarding');
    if (onboarding) {
      onboarding.style.display = accounts.length === 0 ? 'block' : 'none';
    }
  }

  function renderToolCard(tool, isRunning) {
    const state = toolStates[tool.id] || { status: 'idle', lastRun: null };
    const statusLabels = {
      idle: t('tool_status_idle'),
      running: t('tool_status_running'),
      success: t('tool_status_success'),
      failed: t('tool_status_failed'),
    };
    const capBadge = tool.capability === 'auto'
      ? `<span class="tool-badge auto">${t('tool_cap_auto')}</span>`
      : tool.capability === 'gui'
        ? `<span class="tool-badge gui">${t('tool_cap_gui')}</span>`
        : `<span class="tool-badge linux">${t('tool_cap_linux')}</span>`;

    const canStart = tool.automatable;
    const startBtnClass = !canStart && state.status !== 'running' ? 'btn-ghost' : (state.status === 'running' ? 'btn-danger' : 'btn-primary');
    const startBtnText = state.status === 'running' ? t('tool_stop') : (canStart ? t('tool_start') : t('tool_manual'));
    const startBtnAttr = canStart
      ? `onclick="window.__toggleTool('${tool.id}')"`
      : `onclick="showToast('${t('tool_manual_warn')}', 'warning')"`;

    const lastRunText = state.lastRun
      ? t('tool_started_at', { time: new Date(state.lastRun).toLocaleString() })
      : '-';

    return `
      <div class="tool-card glass" data-tool="${tool.id}">
        <div class="tool-card-header">
          <div class="tool-card-left">
            <div class="tool-icon" style="background:${tool.color}">${tool.abbrev}</div>
            <span class="tool-name">${tool.name} ${capBadge}</span>
          </div>
          <div class="status-dot ${state.status}" data-status="${tool.id}"></div>
        </div>
        <div class="tool-card-meta">
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${lastRunText}
          </span>
          <span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            ${statusLabels[state.status]}
          </span>
        </div>
        <div class="tool-card-actions">
          <button class="btn btn-sm btn-ghost" onclick="window.__viewLog('${tool.id}')" title="${t('tool_log')}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="btn btn-sm ${startBtnClass}" ${startBtnAttr}>
            ${startBtnText}
          </button>
        </div>
      </div>`;
  }

  // ---- Render: Tools page ----
  function renderTools() {
    const grid = $('#toolsDetailGrid');
    grid.innerHTML = TOOLS.map(tool => {
      const state = toolStates[tool.id] || { status: 'idle', lastRun: null };
      const statusLabels = {
        idle: t('tool_status_idle'), running: t('tool_status_running'),
        success: t('tool_status_success'), failed: t('tool_status_failed'),
      };
      const statusClass = { idle: 'text-yellow', running: 'text-green', success: 'text-blue', failed: 'text-red' };
      const capLabel = tool.automatable ? t('tool_cap_auto') : (tool.platform === 'linux' ? t('tool_cap_linux') : t('tool_cap_gui'));
      const capClass = tool.automatable ? 'text-green' : 'text-yellow';
      return `
        <div class="tool-detail-card glass" data-tool="${tool.id}">
          <div class="tool-detail-header">
            <div class="tool-detail-icon" style="background:${tool.color}">${tool.abbrev}</div>
            <div class="tool-detail-title">
              <h3>${tool.name}</h3>
              <p>${toolDesc(tool)}</p>
            </div>
            <div class="status-dot ${state.status}" data-status="${tool.id}"></div>
          </div>
          <div class="tool-detail-body">
            <div class="info-row">
              <span class="label">${t('deploy_status')}</span>
              <span class="value ${statusClass[state.status]}">${statusLabels[state.status]}</span>
            </div>
            <div class="info-row">
              <span class="label">Language</span>
              <span class="value">${tool.lang}</span>
            </div>
            <div class="info-row">
              <span class="label">${t('ticket_step2_title')}</span>
              <span class="value ${capClass}">${capLabel}</span>
            </div>
          </div>
          <div class="tool-detail-actions">
            <button class="btn btn-sm btn-ghost" onclick="window.__openRepo('${tool.repo}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              ${t('tool_repo')}
            </button>
            <button class="btn btn-sm btn-ghost" onclick="window.__viewLog('${tool.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ${t('tool_log')}
            </button>
            <button class="btn btn-sm ${state.status === 'running' ? 'btn-danger' : 'btn-primary'}" ${tool.automatable ? `onclick="window.__toggleTool('${tool.id}')"` : `onclick="showToast('${t('tool_manual_warn')}', 'warning')"`}>
              ${state.status === 'running' ? t('tool_stop') : (tool.automatable ? t('tool_start') : t('tool_manual'))}
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // ---- Render: Accounts ----
  function renderAccounts() {
    const grid = $('#accountsGrid');
    const empty = $('#accountsEmpty');
    if (!accounts.length) {
      grid.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    grid.innerHTML = accounts.map(acc => {
      const initials = (acc.name || '?').slice(0, 2).toUpperCase();
      const hasCookie = !!(acc.sessdata || acc.cookie);
      const cookieStatus = hasCookie ? 'cookie-ok' : 'cookie-missing';
      const verifiedBadge = acc._verified
        ? `<span class="tool-badge auto">${t('account_status_verified')}</span>`
        : (hasCookie ? `<span class="tool-badge gui">${t('account_status_unverified')}</span>` : '');

      // Find which tickets use this account
      const usedBy = tickets.filter(tk => tk.account === acc.name).map(tk => tk.name || tk.projectId);
      const usedByText = usedBy.length > 0
        ? `<div class="account-used-by">${t('account_used_by', { tickets: usedBy.join(', ') })}</div>`
        : '';

      return `
        <div class="account-card glass ${cookieStatus}" data-id="${acc.id}">
          <div class="account-header">
            <div class="account-avatar">${initials}</div>
            <div>
              <div class="account-name">${escHtml(acc.name)} ${verifiedBadge}</div>
              <div class="account-uid">UID: ${escHtml(acc.uid || '-')}</div>
            </div>
          </div>
          ${!hasCookie ? `
          <div class="cookie-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            ${t('account_no_cookie')}
          </div>` : ''}
          <div class="account-body">
            <div class="account-field">
              <span class="label">SESSDATA</span>
              <span class="value">${acc.sessdata ? maskStr(acc.sessdata) : '-'}</span>
            </div>
            <div class="account-field">
              <span class="label">bili_jct</span>
              <span class="value">${acc.biliJct ? maskStr(acc.biliJct) : '-'}</span>
            </div>
          </div>
          ${usedByText}
          <div class="account-actions">
            <button class="btn btn-sm btn-ghost" onclick="window.__verifyAccount('${acc.id}')" title="${t('account_verify')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </button>
            <button class="btn btn-sm btn-ghost" onclick="window.__editAccount('${acc.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="btn btn-sm btn-danger" onclick="window.__deleteAccount('${acc.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // ---- Render: Ticket tool select cards ----
  function renderToolSelectCards() {
    const container = $('#toolSelectCards');
    if (!container) return;
    const selectedTools = tickets[0]?.tools || ['biliTickerBuy'];
    container.innerHTML = TOOLS.map(tool => {
      const checked = selectedTools.includes(tool.id) ? 'checked' : '';
      const capBadge = tool.capability === 'auto'
        ? `<span class="tool-badge auto">${t('tool_cap_auto')}</span>`
        : tool.capability === 'gui'
          ? `<span class="tool-badge gui">${t('tool_cap_gui')}</span>`
          : `<span class="tool-badge linux">${t('tool_cap_linux')}</span>`;
      const recommended = tool.automatable ? `<span class="tool-recommended">${getLang() === 'zh-CN' ? '推荐' : 'Recommended'}</span>` : '';
      return `
        <label class="tool-select-card ${checked ? 'selected' : ''}" data-tool="${tool.id}">
          <input type="checkbox" value="${tool.id}" ${checked} style="display:none;">
          <div class="tool-select-icon" style="background:${tool.color}">${tool.abbrev}</div>
          <div class="tool-select-info">
            <div class="tool-select-name">${tool.name} ${capBadge} ${recommended}</div>
            <div class="tool-select-desc">${toolDesc(tool)}</div>
          </div>
          <div class="tool-select-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </label>`;
    }).join('');

    // Click handler
    container.querySelectorAll('.tool-select-card').forEach(card => {
      card.addEventListener('click', () => {
        const cb = card.querySelector('input[type=checkbox]');
        cb.checked = !cb.checked;
        card.classList.toggle('selected', cb.checked);
      });
    });
  }

  // ---- Ticket step wizard ----
  function setTicketStep(step) {
    currentTicketStep = step;
    $$('.form-step').forEach(s => {
      s.classList.toggle('active', parseInt(s.dataset.step) === step);
    });
    $$('.step-dot').forEach(d => {
      const s = parseInt(d.dataset.step);
      d.classList.toggle('active', s === step);
      d.classList.toggle('done', s < step);
    });
    $$('.step-title').forEach(d => {
      const s = parseInt(d.dataset.step);
      d.classList.toggle('active', s === step);
      d.classList.toggle('done', s < step);
    });
    $('#prevStepBtn').style.display = step > 1 ? '' : 'none';
    $('#nextStepBtn').style.display = step < 4 ? '' : 'none';
    $('#saveTicketBtn').style.display = step === 4 ? '' : 'none';
  }

  // ---- Account modal ----
  const accountModal = $('#accountModal');

  function openAccountModal(editId) {
    editingAccountId = editId || null;
    $('#modalTitle').textContent = editId ? t('account_edit') : t('account_add');
    const form = $('#accountForm');
    form.reset();
    if (editId) {
      const acc = accounts.find(a => a.id === editId);
      if (acc) {
        $('#accName').value = acc.name || '';
        $('#accUid').value = acc.uid || '';
        $('#accSessdata').value = acc.sessdata || '';
        $('#accBiliJct').value = acc.biliJct || '';
        $('#accDedeUserId').value = acc.dedeUserId || '';
      }
    }
    accountModal.classList.add('active');
    gsap.fromTo($('.modal', accountModal), { y: 20, scale: 0.97 }, { y: 0, scale: 1, duration: 0.35, ease: 'power3.out' });
  }

  function closeAccountModal() {
    gsap.to($('.modal', accountModal), {
      y: 20, scale: 0.97, duration: 0.2, ease: 'power2.in',
      onComplete: () => accountModal.classList.remove('active'),
    });
    editingAccountId = null;
  }

  $('#addAccountBtn').addEventListener('click', () => openAccountModal());
  $('#modalClose').addEventListener('click', closeAccountModal);
  $('#modalCancelBtn').addEventListener('click', closeAccountModal);
  accountModal.addEventListener('click', e => { if (e.target === accountModal) closeAccountModal(); });

  // Cookie parse
  $('#parseCookieBtn').addEventListener('click', () => {
    const raw = $('#accCookiePaste').value.trim();
    if (!raw) { showToast(t('account_parse_empty'), 'error'); return; }
    const parsed = parseCookieString(raw);
    if (parsed.sessdata) $('#accSessdata').value = parsed.sessdata;
    if (parsed.biliJct) $('#accBiliJct').value = parsed.biliJct;
    if (parsed.dedeUserId) $('#accDedeUserId').value = parsed.dedeUserId;
    if (parsed.uid && !$('#accUid').value) $('#accUid').value = parsed.uid;
    showToast(t('account_parse_ok'), 'success');
  });

  // Verify button
  $('#verifyCookieBtn').addEventListener('click', verifyCookie);

  // Save account
  $('#accountForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = {
      name: $('#accName').value.trim(),
      uid: $('#accUid').value.trim(),
      sessdata: $('#accSessdata').value.trim(),
      biliJct: $('#accBiliJct').value.trim(),
      dedeUserId: $('#accDedeUserId').value.trim(),
    };
    if (!data.name) { showToast(t('name_required'), 'error'); return; }
    if (editingAccountId) {
      const idx = accounts.findIndex(a => a.id === editingAccountId);
      if (idx !== -1) { accounts[idx] = { ...accounts[idx], ...data }; }
      showToast(t('account_updated'), 'success');
    } else {
      accounts.push({ id: genId(), ...data, createdAt: Date.now() });
      showToast(t('account_saved'), 'success');
    }
    save(STORAGE_KEYS.accounts, accounts);
    syncAccountsToYAML();
    renderAll();
    closeAccountModal();
  });

  // ---- Sync to YAML ----
  async function syncAccountsToYAML() {
    const yamlData = {
      accounts: accounts.map(a => ({
        name: a.name,
        uid: a.uid,
        cookie: `SESSDATA=${a.sessdata || ''}; bili_jct=${a.biliJct || ''}; DedeUserID=${a.dedeUserId || ''}`,
        enabled: true,
      })),
    };
    await apiCall('/api/accounts', { method: 'POST', body: JSON.stringify(yamlData) });
  }

  async function syncTicketsToYAML() {
    const data = gatherTicketForm();
    if (!data.projectId) return;
    const yamlData = {
      tickets: [{
        name: data.name || 'Unnamed',
        project_id: data.projectId,
        screen_id: data.screenId,
        sku_id: data.skuId,
        pay_money: parseInt(data.payMoney) || 0,
        quantity: parseInt(data.count) || 1,
        account: data.account,
        tools: data.tools,
        sale_start: data.saleTime,
        is_hot_project: data.isHotProject,
        buyer_info: [{ name: data.buyerName, tel: data.buyerPhone, id_card: data.buyerIdCard }],
        deliver_info: { name: data.deliverName, tel: data.deliverTel, addr_id: data.deliverAddrId, addr: data.deliverAddr },
        webhook: data.webhookUrl,
        enabled: true,
      }],
      global: { pre_rush_seconds: 5, max_retries: 100, retry_delay_ms: 50 },
      notifications: { enabled: !!data.webhookUrl, webhook: data.webhookUrl || null },
    };
    await apiCall('/api/tickets', { method: 'POST', body: JSON.stringify(yamlData) });
  }

  // ---- Start/Stop all ----
  async function startAllTools() {
    const runningCount = Object.values(toolStates).filter(s => s.status === 'running').length;
    if (runningCount > 0) {
      // Stop all
      for (const tool of TOOLS) {
        const state = toolStates[tool.id] || {};
        if (state.status === 'running') {
          await window.__toggleTool(tool.id);
        }
      }
    } else {
      // Start all automatable
      showToast(t('tool_auto_starting'), 'info');
      for (const tool of TOOLS) {
        if (tool.automatable) {
          await window.__toggleTool(tool.id);
        }
      }
    }
  }

  // ---- Tool toggle ----
  window.__toggleTool = async function(toolId) {
    const tool = TOOLS.find(t => t.id === toolId);
    if (tool && !tool.automatable) {
      showToast(t('tool_manual_warn'), 'warning');
      return;
    }
    const state = toolStates[toolId] || { status: 'idle', lastRun: null };
    if (state.status === 'running') {
      const result = await apiCall('/api/tools/stop', {
        method: 'POST', body: JSON.stringify({ tool: toolId })
      });
      state.status = 'idle';
      const msg = t('tool_stopped', { name: toolId });
      showToast(msg, 'info');
      sendNotification('NyaTicketTools', msg);
      sendWebhook('NyaTicketTools', msg);
    } else {
      const result = await apiCall('/api/tools/start', {
        method: 'POST', body: JSON.stringify({ tool: toolId })
      });
      state.status = 'running';
      state.lastRun = Date.now();
      playBeep(880, 0.15, 1);
      const msg = t('tool_started', { name: toolId });
      showToast(msg, 'success');
      sendNotification('NyaTicketTools', msg);
      sendWebhook('NyaTicketTools', msg);
    }
    toolStates[toolId] = state;
    save(STORAGE_KEYS.toolStates, toolStates);
    renderDashboard();
    renderTools();
    const dots = $$(`[data-status="${toolId}"]`);
    dots.forEach(d => pulseElement(d));
  };

  // ---- Log viewer with auto-refresh ----
  window.__viewLog = async function(toolId) {
    let logInterval = null;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal glass" style="max-width:700px;width:90%;">
        <div class="modal-header">
          <h2>${toolId} ${t('tool_log')}</h2>
          <div style="display:flex;align-items:center;gap:8px;">
            <label class="checkbox-label" style="font-size:0.75rem;cursor:pointer;">
              <input type="checkbox" id="logAutoRefresh" checked> ${getLang() === 'zh-CN' ? '自动刷新' : 'Auto-refresh'}
            </label>
            <button class="btn btn-sm btn-ghost" id="logRefreshBtn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="log-modal-content" id="logContent">Loading...</div>
      </div>`;

    async function refreshLog() {
      const result = await apiCall(`/api/tools/${toolId}/log?lines=100`);
      const lines = result?.lines || [];
      const content = lines.length ? lines.join('\n') : (getLang() === 'zh-CN' ? '暂无日志' : 'No log entries found.');
      const el = modal.querySelector('#logContent');
      if (el) {
        el.textContent = content;
        el.scrollTop = el.scrollHeight;
      }
    }

    document.body.appendChild(modal);
    await refreshLog();

    // Auto-refresh every 3s if running
    const state = toolStates[toolId] || {};
    if (state.status === 'running') {
      logInterval = setInterval(() => {
        const cb = modal.querySelector('#logAutoRefresh');
        if (cb && cb.checked) refreshLog();
      }, 3000);
    }

    // Manual refresh button
    const refreshBtn = modal.querySelector('#logRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshLog);

    // Cleanup on close
    const closeBtn = modal.querySelector('.modal-close');
    const origClose = closeBtn?.getAttribute('onclick');
    if (closeBtn) {
      closeBtn.removeAttribute('onclick');
      closeBtn.addEventListener('click', () => {
        if (logInterval) clearInterval(logInterval);
        modal.remove();
      });
    }
    modal.addEventListener('click', e => {
      if (e.target === modal) {
        if (logInterval) clearInterval(logInterval);
        modal.remove();
      }
    });
  };

  // ---- Verify account from card ----
  window.__verifyAccount = async function(id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc || !acc.sessdata) {
      showToast(t('account_verify_no_sessdata'), 'error');
      return;
    }
    try {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: { 'Cookie': `SESSDATA=${acc.sessdata}` },
        credentials: 'omit',
      });
      const data = await res.json();
      if (data.code === 0 && data.data?.isLogin) {
        acc._verified = true;
        showToast(t('account_verify_ok', { name: `${acc.name} (UID: ${data.data.mid})` }), 'success');
      } else {
        acc._verified = false;
        showToast(t('account_verify_fail', { code: data.code }), 'error');
      }
      save(STORAGE_KEYS.accounts, accounts);
      renderAccounts();
    } catch {
      showToast(t('account_verify_err'), 'warning');
    }
  };

  window.__editAccount = function(id) { openAccountModal(id); };

  window.__deleteAccount = function(id) {
    if (!confirm(t('account_delete_confirm'))) return;
    accounts = accounts.filter(a => a.id !== id);
    save(STORAGE_KEYS.accounts, accounts);
    syncAccountsToYAML();
    renderAll();
    showToast(t('account_deleted'), 'info');
  };

  window.__openRepo = function(url) { window.open(url, '_blank', 'noopener'); };

  // ---- Ticket form events ----
  // Step wizard navigation
  $('#nextStepBtn').addEventListener('click', () => {
    if (currentTicketStep < 4) setTicketStep(currentTicketStep + 1);
  });
  $('#prevStepBtn').addEventListener('click', () => {
    if (currentTicketStep > 1) setTicketStep(currentTicketStep - 1);
  });

  // Step dot click
  $$('.step-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const step = parseInt(dot.dataset.step);
      if (step >= 1 && step <= 4) setTicketStep(step);
    });
  });

  // Save ticket
  $('#ticketForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = gatherTicketForm();
    if (!data.projectId) { showToast(t('ticket_project_required'), 'error'); setTicketStep(1); return; }
    tickets = [data];
    save(STORAGE_KEYS.tickets, tickets);
    syncTicketsToYAML();
    renderAll();
    showToast(t('ticket_saved'), 'success');
    scheduleStartStop(data);
  });

  $('#clearTicketBtn').addEventListener('click', () => {
    $('#ticketForm').reset();
  });

  // ---- Deploy actions ----
  const deployAllBtn = $('#deployAllConfigsBtn');
  if (deployAllBtn) deployAllBtn.addEventListener('click', deployToAllNodes);

  const clusterStartBtn = $('#clusterStartBtn');
  if (clusterStartBtn) clusterStartBtn.addEventListener('click', startCluster);

  const clusterStopBtn = $('#clusterStopBtn');
  if (clusterStopBtn) clusterStopBtn.addEventListener('click', stopCluster);

  const genAllBtn = $('#genAllConfigsBtn');
  if (genAllBtn) genAllBtn.addEventListener('click', deployToAllNodes);

  const syncBtn = $('#syncBtn');
  if (syncBtn) syncBtn.addEventListener('click', deployToAllNodes);

  $('#exportAllBtn').addEventListener('click', () => {
    const data = { accounts, tickets, toolStates, exportedAt: new Date().toISOString(), version: '0.2.0' };
    downloadJSON(data, 'nyaticket_backup.json');
    showToast(t('deploy_export_ok'), 'success');
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm(t('deploy_reset_confirm'))) return;
    accounts = []; tickets = []; toolStates = {};
    localStorage.removeItem(STORAGE_KEYS.accounts);
    localStorage.removeItem(STORAGE_KEYS.tickets);
    localStorage.removeItem(STORAGE_KEYS.toolStates);
    renderAll();
    showToast(t('deploy_reset_done'), 'info');
  });

  // ---- Import / Export (topbar) ----
  $('#exportBtn').addEventListener('click', () => {
    const data = { accounts, tickets, toolStates, exportedAt: new Date().toISOString(), version: '0.2.0' };
    downloadJSON(data, 'nyaticket_backup.json');
    showToast(t('deploy_export_ok'), 'success');
  });

  $('#importBtn').addEventListener('click', () => $('#importFileInput').click());

  $('#importFileInput').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result);
        if (data.accounts) { accounts = data.accounts; save(STORAGE_KEYS.accounts, accounts); }
        if (data.tickets) { tickets = data.tickets; save(STORAGE_KEYS.tickets, tickets); }
        if (data.toolStates) { toolStates = data.toolStates; save(STORAGE_KEYS.toolStates, toolStates); }
        renderAll();
        if (tickets.length) populateTicketForm(tickets[0]);
        syncAccountsToYAML();
        syncTicketsToYAML();
        showToast(t('deploy_import_ok'), 'success');
      } catch { showToast(t('deploy_import_err'), 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ---- Start All button ----
  $('#startAllBtn').addEventListener('click', startAllTools);

  // ---- Scheduled start/stop (configurable) ----
  function scheduleStartStop(ticketData) {
    scheduledTimers.forEach(t => clearTimeout(t));
    scheduledTimers = [];
    if (!ticketData.saleTime) return;
    const saleTime = new Date(ticketData.saleTime).getTime();
    const now = Date.now();
    if (saleTime <= now) return;

    const preSaleMs = (settings.preSaleStartSeconds || 5) * 1000;
    const autoStopMs = (settings.autoStopMinutes || 5) * 60 * 1000;
    const startDelay = Math.max(0, saleTime - now - preSaleMs);

    // Auto-start timer
    const startTimer = setTimeout(async () => {
      playSaleStartSound();
      showToast(t('tool_auto_starting'), 'info');
      sendNotification('NyaTicketTools', t('tool_auto_starting'));
      sendWebhook('NyaTicketTools', t('tool_auto_starting'));
      for (const tool of TOOLS.filter(t => t.automatable)) {
        await window.__toggleTool(tool.id);
      }
    }, startDelay);
    scheduledTimers.push(startTimer);

    // Auto-stop timer
    const stopTimer = setTimeout(async () => {
      showToast(t('tool_auto_stopping'), 'info');
      sendNotification('NyaTicketTools', t('tool_auto_stopping'));
      sendWebhook('NyaTicketTools', t('tool_auto_stopping'));
      const runningTools = Object.entries(toolStates).filter(([, s]) => s.status === 'running');
      for (const [id] of runningTools) {
        await window.__toggleTool(id);
      }
    }, startDelay + autoStopMs);
    scheduledTimers.push(stopTimer);

    // Pre-sale countdown alerts (5min, 2min, 1min, 30s, 10s)
    for (const secs of settings.countdownAlerts || [300, 120, 60, 30, 10]) {
      const alertDelay = Math.max(0, saleTime - now - secs * 1000);
      if (alertDelay > 0) {
        const alertTimer = setTimeout(() => {
          playCountdownBeep(secs);
          const msg = getLang() === 'zh-CN'
            ? `距离开售还有 ${secs} 秒！`
            : `${secs}s until sale!`;
          sendNotification('NyaTicketTools', msg);
          sendWebhook('NyaTicketTools', msg);
        }, alertDelay);
        scheduledTimers.push(alertTimer);
      }
    }
  }

  // ---- Browser notifications ----
  function sendNotification(title, body) {
    if (!settings.browserNotify) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') new Notification(title, { body });
      });
    }
  }

  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ---- Settings UI ----
  function renderSettings() {
    const soundCb = $('#settingSound');
    const notifyCb = $('#settingBrowserNotify');
    const webhookInput = $('#settingWebhook');
    const preSaleInput = $('#settingPreSale');
    const autoStopInput = $('#settingAutoStop');
    if (soundCb) soundCb.checked = settings.soundEnabled !== false;
    if (notifyCb) notifyCb.checked = settings.browserNotify !== false;
    if (webhookInput) webhookInput.value = settings.webhookUrl || '';
    if (preSaleInput) preSaleInput.value = settings.preSaleStartSeconds || 5;
    if (autoStopInput) autoStopInput.value = settings.autoStopMinutes || 5;
  }

  // Save settings
  const saveSettingsBtn = $('#saveSettingsBtn');
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener('click', () => {
      settings.soundEnabled = ($('#settingSound') || {}).checked !== false;
      settings.browserNotify = ($('#settingBrowserNotify') || {}).checked !== false;
      settings.webhookUrl = (($('#settingWebhook') || {}).value || '').trim();
      settings.preSaleStartSeconds = parseInt(($('#settingPreSale') || {}).value) || 5;
      settings.autoStopMinutes = parseInt(($('#settingAutoStop') || {}).value) || 5;
      saveSettings(settings);
      // Re-schedule with new settings
      if (tickets.length && tickets[0].saleTime) {
        scheduleStartStop(tickets[0]);
      }
      showToast(t('settings_saved'), 'success');
    });
  }

  // Test sound
  const testSoundBtn = $('#testSoundBtn');
  if (testSoundBtn) {
    testSoundBtn.addEventListener('click', () => {
      playBeep(660, 0.3, 2);
    });
  }

  // ---- Countdown timer with sound + urgency levels ----
  let countdownNotified = false;
  let lastCountdownSecond = -1;
  function updateCountdown() {
    const display = $('#countdownDisplay');
    if (!display) return;
    const ticketData = load(STORAGE_KEYS.tickets);
    const saleTime = ticketData[0]?.saleTime || ticketData[0]?.sale_start;
    if (!saleTime) {
      display.textContent = t('dash_countdown_noconfig');
      return;
    }
    const target = new Date(saleTime).getTime();
    const now = Date.now();
    const diff = Math.max(0, target - now);
    const statusBar = $('#statusBar');

    if (diff === 0) {
      display.textContent = t('dash_countdown_now');
      if (statusBar) statusBar.classList.add('urgent');
      if (!countdownNotified) {
        countdownNotified = true;
        playSaleStartSound();
        sendNotification('NyaTicketTools', t('dash_countdown_now'));
        sendWebhook('NyaTicketTools', t('dash_countdown_now'));
      }
      return;
    }

    const currentSecond = Math.floor(diff / 1000);

    // Sound alerts at specific thresholds (only once per second)
    if (currentSecond !== lastCountdownSecond) {
      lastCountdownSecond = currentSecond;
      const alertSeconds = settings.countdownAlerts || [300, 120, 60, 30, 10];
      if (alertSeconds.includes(currentSecond)) {
        playCountdownBeep(currentSecond);
        const msg = getLang() === 'zh-CN'
          ? `距离开售还有 ${currentSecond} 秒！`
          : `${currentSecond}s until sale!`;
        sendNotification('NyaTicketTools', msg);
        sendWebhook('NyaTicketTools', msg);
      }
    }

    // Urgency levels
    if (diff <= 60000 && statusBar) {
      statusBar.classList.add('urgent');
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const d = Math.floor(h / 24);

    if (d > 0) {
      display.textContent = t('time_days', { d, h: String(h%24).padStart(2,'0'), m: String(m).padStart(2,'0'), s: String(s).padStart(2,'0') });
    } else {
      display.textContent = t('time_hours', { h: String(h).padStart(2,'0'), m: String(m).padStart(2,'0'), s: String(s).padStart(2,'0') });
    }
  }
  setInterval(updateCountdown, 1000);

  // ---- Load state from API ----
  async function loadStateFromAPI() {
    const status = await apiCall('/api/status');
    if (status) {
      for (const [name, info] of Object.entries(status.tools || {})) {
        toolStates[name] = {
          status: info.running ? 'running' : 'idle',
          lastRun: info.running ? Date.now() : (toolStates[name]?.lastRun || null),
        };
      }
      save(STORAGE_KEYS.toolStates, toolStates);
      const dot = $('#connectionStatus');
      if (dot) dot.className = 'connection-status connected';
    } else {
      const dot = $('#connectionStatus');
      if (dot) dot.className = 'connection-status disconnected';
    }
    const accData = await apiCall('/api/accounts');
    if (accData?.accounts) {
      accounts = accData.accounts.map((a, i) => ({
        id: a.name || `acc_${i}`,
        name: a.name || '',
        uid: a.uid || '',
        sessdata: '',
        biliJct: '',
        dedeUserId: '',
        cookie: a.cookie || '',
        enabled: a.enabled !== false,
      }));
      save(STORAGE_KEYS.accounts, accounts);
    }
  }

  // ---- Populate account select ----
  function populateAccountSelect() {
    const select = $('#ticketAccount');
    if (!select) return;
    select.innerHTML = `<option value="">${t('ticket_account_ph')}</option>` +
      accounts.map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`).join('');
  }

  // ---- Gather ticket form ----
  function gatherTicketForm() {
    const tools = [...$$('#toolSelectCards input:checked')].map(cb => cb.value);
    return {
      name: ($('#ticketName') || {}).value?.trim() || '',
      projectId: $('#projectId').value.trim(),
      screenId: $('#screenId').value.trim(),
      skuId: $('#skuId').value.trim(),
      payMoney: $('#payMoney').value.trim(),
      count: $('#ticketCount').value.trim(),
      saleTime: $('#saleTime').value,
      isHotProject: ($('#isHotProject') || {}).checked || false,
      tools: tools,
      account: ($('#ticketAccount') || {}).value || '',
      buyerName: $('#buyerName').value.trim(),
      buyerPhone: $('#buyerPhone').value.trim(),
      buyerIdCard: $('#buyerIdCard').value.trim(),
      deliverName: ($('#deliverName') || {}).value?.trim() || '',
      deliverTel: ($('#deliverTel') || {}).value?.trim() || '',
      deliverAddrId: ($('#deliverAddrId') || {}).value?.trim() || '',
      deliverAddr: ($('#deliverAddr') || {}).value?.trim() || '',
      webhookUrl: ($('#webhookUrl') || {}).value?.trim() || '',
    };
  }

  function populateTicketForm(data) {
    if (!data) return;
    if (data.name && $('#ticketName')) $('#ticketName').value = data.name;
    $('#projectId').value = data.projectId || data.project_id || '';
    $('#screenId').value = data.screenId || data.screen_id || '';
    $('#skuId').value = data.skuId || data.sku_id || '';
    $('#payMoney').value = data.payMoney || data.pay_money || '';
    $('#ticketCount').value = data.count || '1';
    $('#saleTime').value = data.saleTime || data.sale_start || '';
    if ($('#isHotProject')) $('#isHotProject').checked = !!data.isHotProject;
    if (data.account && $('#ticketAccount')) $('#ticketAccount').value = data.account;
    if ($('#buyerName')) $('#buyerName').value = data.buyerName || '';
    if ($('#buyerPhone')) $('#buyerPhone').value = data.buyerPhone || '';
    if ($('#buyerIdCard')) $('#buyerIdCard').value = data.buyerIdCard || '';
    if ($('#deliverName')) $('#deliverName').value = data.deliverName || '';
    if ($('#deliverTel')) $('#deliverTel').value = data.deliverTel || '';
    if ($('#deliverAddrId')) $('#deliverAddrId').value = data.deliverAddrId || '';
    if ($('#deliverAddr')) $('#deliverAddr').value = data.deliverAddr || '';
    if ($('#webhookUrl')) $('#webhookUrl').value = data.webhookUrl || '';
    renderToolSelectCards();
  }

  // ---- Helpers ----
  function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function maskStr(s) {
    if (!s || s.length < 8) return '***';
    return s.slice(0, 4) + '****' + s.slice(-4);
  }

  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---- SSE connection for real-time events ----
  let sseConnection = null;

  function connectSSE() {
    if (sseConnection) {
      sseConnection.close();
    }
    try {
      sseConnection = new EventSource(`${API_BASE}/api/events`);
      sseConnection.addEventListener('connected', () => {
        const dot = $('#connectionStatus');
        if (dot) dot.className = 'connection-status connected';
        const label = $('#connectionLabel');
        if (label) label.textContent = t('conn_connected');
      });

      sseConnection.addEventListener('engine_started', (e) => {
        const data = JSON.parse(e.data);
        showToast(data.message || 'Engine started', 'info');
        loadStateFromAPI().then(() => {
          renderDashboard();
          renderTools();
        });
      });

      sseConnection.addEventListener('tool_started', (e) => {
        loadStateFromAPI().then(() => {
          renderDashboard();
          renderTools();
        });
      });

      sseConnection.addEventListener('tool_stopped', (e) => {
        loadStateFromAPI().then(() => {
          renderDashboard();
          renderTools();
        });
      });

      sseConnection.addEventListener('order_success', (e) => {
        const data = JSON.parse(e.data);
        showToast(t('tool_status_success') + '!', 'success');
        playSaleStartSound();
        sendNotification('NyaTicketTools', data.message || 'Order successful!');
        sendWebhook('NyaTicketTools', data.message || 'Order successful!');
        loadStateFromAPI().then(() => {
          renderDashboard();
          renderTools();
        });
      });

      sseConnection.addEventListener('engine_error', (e) => {
        const data = JSON.parse(e.data);
        showToast(data.message || 'Engine error', 'error');
      });

      sseConnection.addEventListener('cluster_deploy', () => {
        showToast(t('deploy_synced'), 'success');
        $('#lastSyncTime').textContent = new Date().toLocaleString();
      });

      sseConnection.onerror = () => {
        const dot = $('#connectionStatus');
        if (dot) dot.className = 'connection-status disconnected';
        const label = $('#connectionLabel');
        if (label) label.textContent = t('conn_disconnected');
        setTimeout(connectSSE, 5000);
      };
    } catch (e) {
      setTimeout(connectSSE, 5000);
    }
  }

  // ---- Cluster API helpers ----
  async function deployToAllNodes() {
    const result = await apiCall('/api/cluster/deploy', { method: 'POST' });
    if (result?.ok) {
      showToast(t('deploy_synced'), 'success');
    } else {
      showToast(t('deploy_sync_warn'), 'warning');
    }
    $('#lastSyncTime').textContent = new Date().toLocaleString();
  }

  async function startCluster() {
    const result = await apiCall('/api/cluster/start', { method: 'POST' });
    if (result?.ok) {
      showToast(t('tool_auto_starting'), 'success');
    }
  }

  async function stopCluster() {
    const result = await apiCall('/api/cluster/stop', { method: 'POST' });
    if (result?.ok) {
      showToast(t('tool_auto_stopping'), 'info');
    }
  }

  async function loadNodes() {
    const result = await apiCall('/api/nodes');
    if (result?.ok) {
      renderNodes(result.nodes);
    }
  }

  function renderNodes(nodes) {
    const container = $('#deployNodes');
    if (!container || !nodes) return;
    let html = '';
    for (const [name, node] of Object.entries(nodes)) {
      const statusClass = node.status === 'online' ? 'online' : 'offline';
      const engineStatus = node.engine_running
        ? `<span class="tool-badge auto">${t('tool_status_running')}</span>`
        : '';
      html += `
        <div class="node-card glass">
          <div class="node-header">
            <div class="node-status-dot ${statusClass}"></div>
            <span class="node-name">${name}</span>
            <span class="node-badge">${node.host}</span>
            ${engineStatus}
          </div>
          <div class="node-info">
            <div class="node-info-row">
              <span class="node-label">${t('deploy_status')}</span>
              <span class="node-value ${node.status === 'online' ? 'text-green' : 'text-red'}">
                ${node.status === 'online' ? t('deploy_online') : t('deploy_offline')}
              </span>
            </div>
            <div class="node-info-row">
              <span class="node-label">${t('deploy_last_sync')}</span>
              <span class="node-value">${node.last_sync || '-'}</span>
            </div>
          </div>
        </div>`;
    }
    container.innerHTML = html || `<div class="node-card glass"><span>${getLang() === 'zh-CN' ? '暂无远程节点' : 'No remote nodes'}</span></div>`;
  }
    updateI18nDOM();
    renderDashboard();
    renderTools();
    renderAccounts();
    populateAccountSelect();
    renderToolSelectCards();
    renderSettings();
    if (tickets.length) populateTicketForm(tickets[0]);
  }

  // ---- Init ----
  async function init() {
    await loadStateFromAPI();
    renderAll();
    setTicketStep(1);
    initCardHover();
    updateCountdown();
    requestNotificationPermission();

    // Entrance animation
    gsap.from('.sidebar', { x: -40, opacity: 0, duration: 0.6, ease: 'power3.out' });
    gsap.from('.topbar', { y: -20, opacity: 0, duration: 0.5, delay: 0.1, ease: 'power3.out' });
    gsap.fromTo('.status-bar',
      { opacity: 0, y: 20 },
      { opacity: 1, y: 0, duration: 0.5, delay: 0.2, ease: 'power3.out' }
    );

    const readinessCards = $$('.readiness-card');
    gsap.fromTo(readinessCards,
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.1, delay: 0.3, ease: 'back.out(1.4)' }
    );

    // Periodic status refresh
    setInterval(async () => {
      await loadStateFromAPI();
      renderDashboard();
      renderTools();
    }, 10000);

    // SSE real-time events
    connectSSE();

    // Schedule if ticket has sale time
    if (tickets.length && tickets[0].saleTime) {
      scheduleStartStop(tickets[0]);
    }
  }

  if (typeof gsap !== 'undefined') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
