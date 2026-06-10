/* ============================================================
   NyaTicketTools – Dashboard Application
   ============================================================ */

(() => {
  'use strict';

  // ---- Tool definitions with capability info ----
  const TOOLS = [
    {
      id: 'biliTickerBuy',
      name: 'biliTickerBuy',
      desc: 'CLI mode, fully automated',
      color: '#7C3AED',
      abbrev: 'BTB',
      lang: 'Python',
      repo: 'https://github.com/mikumifa/biliTickerBuy',
      automatable: true,
      platform: 'all',
      capability: 'auto',
    },
    {
      id: 'BHYG',
      name: 'BHYG',
      desc: 'Terminal tool, config auto-generated',
      color: '#3B82F6',
      abbrev: 'BHYG',
      lang: 'Python',
      repo: 'https://github.com/ZianTT/BHYG',
      automatable: true,
      platform: 'all',
      capability: 'auto',
    },
    {
      id: 'bili_ticket_rush',
      name: 'bili_ticket_rush',
      desc: 'Rust GUI, requires desktop',
      color: '#10B981',
      abbrev: 'BTR',
      lang: 'Rust',
      repo: 'https://github.com/Violiate/bili_ticket_rush',
      automatable: false,
      platform: 'desktop',
      capability: 'gui',
    },
    {
      id: 'bili-ticket-go',
      name: 'bili-ticket-go',
      desc: 'Binary, Linux/WSL only',
      color: '#F59E0B',
      abbrev: 'BTG',
      lang: 'Go',
      repo: 'https://github.com/konaxia548/bili-ticket-go',
      automatable: false,
      platform: 'linux',
      capability: 'linux',
    },
  ];

  // ---- API Communication ----
  const API_BASE = 'http://localhost:8090';

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

  // ---- Storage helpers ----
  const STORAGE_KEYS = {
    accounts: 'nya_accounts',
    tickets: 'nya_tickets',
    toolStates: 'nya_tool_states',
    settings: 'nya_settings',
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
    const titles = { dashboard: 'Dashboard', accounts: 'Accounts', tickets: 'Tickets', tools: 'Tools', deploy: 'Deploy' };
    pageTitle.textContent = titles[page] || page;
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

  // ---- GSAP Animations ----
  function animatePageIn(page) {
    const cards = $$('.glass, .tool-card, .tool-detail-card, .account-card, .stat-card, .deploy-action-btn', page);
    if (!cards.length) return;
    gsap.fromTo(cards,
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.07, ease: 'power3.out', clearProps: 'transform' }
    );
  }

  function animateStatValues() {
    $$('.stat-value').forEach(el => {
      const target = parseInt(el.textContent) || 0;
      gsap.from(el, {
        textContent: 0, duration: 1, ease: 'power2.out', snap: { textContent: 1 },
        onUpdate() { el.textContent = Math.round(gsap.getProperty(el, 'textContent')); },
      });
    });
  }

  function initCardHover() {
    document.addEventListener('mouseenter', e => {
      const card = e.target.closest('.stat-card, .tool-card, .tool-detail-card, .account-card, .node-card');
      if (!card) return;
      gsap.to(card, { y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)', duration: 0.25, ease: 'power2.out' });
    }, true);
    document.addEventListener('mouseleave', e => {
      const card = e.target.closest('.stat-card, .tool-card, .tool-detail-card, .account-card, .node-card');
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

  // ---- #2 Cookie auto-parse ----
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

  // ---- #3 Cookie verification ----
  async function verifyCookie() {
    const sessdata = $('#accSessdata').value.trim();
    if (!sessdata) {
      showToast('Please fill in SESSDATA first (or paste full cookie and click Parse)', 'error');
      return;
    }
    const btn = $('#verifyCookieBtn');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    try {
      const res = await fetch('https://api.bilibili.com/x/web-interface/nav', {
        headers: { 'Cookie': `SESSDATA=${sessdata}` },
        credentials: 'omit',
      });
      const data = await res.json();
      if (data.code === 0 && data.data?.isLogin) {
        const uname = data.data.uname || 'Unknown';
        const mid = data.data.mid || '';
        showToast(`Cookie valid! Logged in as: ${uname} (UID: ${mid})`, 'success');
        if (!$('#accUid').value) $('#accUid').value = String(mid);
        if (!$('#accName').value || $('#accName').value === 'My Bilibili') $('#accName').value = uname;
      } else {
        showToast(`Cookie invalid or expired (code: ${data.code})`, 'error');
      }
    } catch (e) {
      showToast('Verification failed (CORS/network). Try from the backend.', 'warning');
    }
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Verify';
  }

  // ---- Render: Dashboard ----
  function renderDashboard() {
    $('#statAccounts').textContent = accounts.length;
    $('#statTickets').textContent = tickets.length;

    // #11 Onboarding: show when no accounts
    const onboarding = $('#dashboardOnboarding');
    if (onboarding) {
      onboarding.style.display = accounts.length === 0 ? 'block' : 'none';
    }

    const grid = $('#dashboardToolsGrid');
    grid.innerHTML = TOOLS.map(tool => {
      const state = toolStates[tool.id] || { status: 'idle', lastRun: null };
      const statusLabels = { idle: 'Idle', running: 'Running', success: 'Success', failed: 'Failed' };
      // #5: capability badge
      const capBadge = tool.capability === 'auto'
        ? '<span class="tool-badge auto">Auto</span>'
        : tool.capability === 'gui'
          ? '<span class="tool-badge gui">GUI</span>'
          : '<span class="tool-badge linux">Linux</span>';
      // #5: button text based on capability
      const canStart = tool.automatable;
      const startBtnClass = !canStart && state.status !== 'running' ? 'btn-ghost' : (state.status === 'running' ? 'btn-danger' : 'btn-primary');
      const startBtnText = state.status === 'running' ? 'Stop' : (canStart ? 'Start' : 'Manual');
      const startBtnAttr = canStart ? `onclick="window.__toggleTool('${tool.id}')"` : `onclick="showToast('This tool requires manual operation', 'warning')" title="Not automatable"`;
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
              ${state.lastRun ? new Date(state.lastRun).toLocaleString() : 'Never run'}
            </span>
            <span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              ${statusLabels[state.status]}
            </span>
          </div>
          <div class="tool-card-actions">
            <button class="btn btn-sm btn-ghost" onclick="window.__viewLog('${tool.id}')" title="View log">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </button>
            <button class="btn btn-sm ${startBtnClass}" ${startBtnAttr}>
              ${startBtnText}
            </button>
          </div>
        </div>`;
    }).join('');
  }

  // ---- Render: Tools page ----
  function renderTools() {
    const grid = $('#toolsDetailGrid');
    grid.innerHTML = TOOLS.map(tool => {
      const state = toolStates[tool.id] || { status: 'idle', lastRun: null };
      const statusLabels = { idle: 'Idle', running: 'Running', success: 'Success', failed: 'Failed' };
      const statusClass = { idle: 'text-yellow', running: 'text-green', success: 'text-blue', failed: 'text-red' };
      const capLabel = tool.automatable ? 'Automatable' : (tool.platform === 'linux' ? 'Linux/WSL only' : 'Requires GUI');
      const capClass = tool.automatable ? 'text-green' : 'text-yellow';
      return `
        <div class="tool-detail-card glass" data-tool="${tool.id}">
          <div class="tool-detail-header">
            <div class="tool-detail-icon" style="background:${tool.color}">${tool.abbrev}</div>
            <div class="tool-detail-title">
              <h3>${tool.name}</h3>
              <p>${tool.desc}</p>
            </div>
            <div class="status-dot ${state.status}" data-status="${tool.id}"></div>
          </div>
          <div class="tool-detail-body">
            <div class="info-row">
              <span class="label">Status</span>
              <span class="value ${statusClass[state.status]}">${statusLabels[state.status]}</span>
            </div>
            <div class="info-row">
              <span class="label">Language</span>
              <span class="value">${tool.lang}</span>
            </div>
            <div class="info-row">
              <span class="label">Capability</span>
              <span class="value ${capClass}">${capLabel}</span>
            </div>
            <div class="info-row">
              <span class="label">Last Run</span>
              <span class="value">${state.lastRun ? new Date(state.lastRun).toLocaleString() : '-'}</span>
            </div>
          </div>
          <div class="tool-detail-actions">
            <button class="btn btn-sm btn-ghost" onclick="window.__openRepo('${tool.repo}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Repo
            </button>
            <button class="btn btn-sm btn-ghost" onclick="window.__viewLog('${tool.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Log
            </button>
            <button class="btn btn-sm ${state.status === 'running' ? 'btn-danger' : 'btn-primary'}" ${tool.automatable ? `onclick="window.__toggleTool('${tool.id}')"` : `onclick="showToast('This tool requires manual operation', 'warning')"`}>
              ${state.status === 'running' ? 'Stop' : (tool.automatable ? 'Start' : 'Manual')}
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
      return `
        <div class="account-card glass ${cookieStatus}" data-id="${acc.id}">
          <div class="account-header">
            <div class="account-avatar">${initials}</div>
            <div>
              <div class="account-name">${escHtml(acc.name)}</div>
              <div class="account-uid">UID: ${escHtml(acc.uid || '-')}</div>
            </div>
            ${acc._verified ? '<span class="tool-badge auto">Verified</span>' : ''}
          </div>
          ${!hasCookie ? `
          <div class="cookie-warning">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Cookie not configured
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
            <div class="account-field">
              <span class="label">DedeUserID</span>
              <span class="value">${escHtml(acc.dedeUserId || '-')}</span>
            </div>
          </div>
          <div class="account-actions">
            <button class="btn btn-sm btn-ghost" onclick="window.__verifyAccount('${acc.id}')" title="Verify cookie">
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

  // ---- Render: Ticket config preview ----
  function renderTicketPreview() {
    const data = gatherTicketForm();
    const isEmpty = Object.values(data).every(v => !v || (Array.isArray(v) && !v.length));
    const code = $('#configCode');
    if (isEmpty) {
      code.textContent = '// Fill in the form to see the generated config';
      return;
    }
    const config = {
      name: data.name || 'Unnamed Ticket',
      project_id: data.projectId,
      screen_id: data.screenId,
      sku_id: data.skuId,
      pay_money: parseInt(data.payMoney) || 0,
      count: parseInt(data.count) || 1,
      sale_start: data.saleTime,
      is_hot_project: data.isHotProject,
      tools: data.tools,
      account: data.account,
      buyer_info: [{ name: data.buyerName, tel: data.buyerPhone, id_card: data.buyerIdCard }],
      deliver_info: { name: data.deliverName, tel: data.deliverTel, addr_id: data.deliverAddrId, addr: data.deliverAddr },
      webhook: data.webhookUrl,
      enabled: true,
    };
    code.textContent = JSON.stringify(config, null, 2);
  }

  function gatherTicketForm() {
    const tools = [...$$('#toolCheckboxes input:checked')].map(cb => cb.value);
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
    if (data.tools) {
      $$('#toolCheckboxes input').forEach(cb => { cb.checked = data.tools.includes(cb.value); });
    }
    $('#buyerName').value = data.buyerName || '';
    $('#buyerPhone').value = data.buyerPhone || '';
    $('#buyerIdCard').value = data.buyerIdCard || '';
    if ($('#deliverName')) $('#deliverName').value = data.deliverName || '';
    if ($('#deliverTel')) $('#deliverTel').value = data.deliverTel || '';
    if ($('#deliverAddrId')) $('#deliverAddrId').value = data.deliverAddrId || '';
    if ($('#deliverAddr')) $('#deliverAddr').value = data.deliverAddr || '';
    if ($('#webhookUrl')) $('#webhookUrl').value = data.webhookUrl || '';
    renderTicketPreview();
  }

  // ---- Account modal ----
  const accountModal = $('#accountModal');

  function openAccountModal(editId) {
    editingAccountId = editId || null;
    $('#modalTitle').textContent = editId ? 'Edit Account' : 'Add Account';
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

  // #2 Cookie parse button
  $('#parseCookieBtn').addEventListener('click', () => {
    const raw = $('#accCookiePaste').value.trim();
    if (!raw) { showToast('Paste your cookie string first', 'error'); return; }
    const parsed = parseCookieString(raw);
    if (parsed.sessdata) $('#accSessdata').value = parsed.sessdata;
    if (parsed.biliJct) $('#accBiliJct').value = parsed.biliJct;
    if (parsed.dedeUserId) $('#accDedeUserId').value = parsed.dedeUserId;
    if (parsed.uid && !$('#accUid').value) $('#accUid').value = parsed.uid;
    showToast('Cookie parsed successfully', 'success');
  });

  // #3 Verify button
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
    if (!data.name) { showToast('Account name is required', 'error'); return; }
    if (editingAccountId) {
      const idx = accounts.findIndex(a => a.id === editingAccountId);
      if (idx !== -1) { accounts[idx] = { ...accounts[idx], ...data }; }
      showToast('Account updated', 'success');
    } else {
      accounts.push({ id: genId(), ...data, createdAt: Date.now() });
      showToast('Account added', 'success');
    }
    save(STORAGE_KEYS.accounts, accounts);
    // #1: Sync to YAML via API
    syncAccountsToYAML();
    renderAccounts();
    renderDashboard();
    populateAccountSelect();
    closeAccountModal();
  });

  // ---- #1: Sync accounts/tickets to YAML via API ----
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
        name: data.name || 'Unnamed Ticket',
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

  // ---- Tool toggle (start/stop via API) ----
  window.__toggleTool = async function(toolId) {
    const tool = TOOLS.find(t => t.id === toolId);
    if (tool && !tool.automatable) {
      showToast(`${toolId} requires manual operation`, 'warning');
      return;
    }
    const state = toolStates[toolId] || { status: 'idle', lastRun: null };
    if (state.status === 'running') {
      const result = await apiCall('/api/tools/stop', {
        method: 'POST', body: JSON.stringify({ tool: toolId })
      });
      if (result?.ok) {
        state.status = 'idle';
        showToast(`${toolId} stopped`, 'info');
      } else {
        showToast(`Failed to stop ${toolId}`, 'error');
      }
    } else {
      const result = await apiCall('/api/tools/start', {
        method: 'POST', body: JSON.stringify({ tool: toolId })
      });
      if (result?.ok) {
        state.status = 'running';
        state.lastRun = Date.now();
        showToast(`${toolId} started`, 'success');
      } else {
        state.status = 'running';
        state.lastRun = Date.now();
        showToast(`${toolId} started (local)`, 'success');
      }
    }
    toolStates[toolId] = state;
    save(STORAGE_KEYS.toolStates, toolStates);
    renderDashboard();
    renderTools();
    const dots = $$(`[data-status="${toolId}"]`);
    dots.forEach(d => pulseElement(d));
  };

  // ---- #12: Log viewer ----
  window.__viewLog = async function(toolId) {
    const result = await apiCall(`/api/tools/${toolId}/log?lines=50`);
    const lines = result?.lines || [];
    const logContent = lines.length ? lines.join('\n') : 'No log entries found.';
    // Show in a simple modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.innerHTML = `
      <div class="modal glass" style="max-width:700px;width:90%;">
        <div class="modal-header">
          <h2>${toolId} Log</h2>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="log-modal-content">${escHtml(logContent)}</div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  };

  // ---- #3: Verify account from card ----
  window.__verifyAccount = async function(id) {
    const acc = accounts.find(a => a.id === id);
    if (!acc || !acc.sessdata) {
      showToast('No SESSDATA configured for this account', 'error');
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
        showToast(`${acc.name}: Valid (UID: ${data.data.mid})`, 'success');
      } else {
        acc._verified = false;
        showToast(`${acc.name}: Invalid or expired`, 'error');
      }
      save(STORAGE_KEYS.accounts, accounts);
      renderAccounts();
    } catch {
      showToast('Verification failed (CORS). Verify from backend.', 'warning');
    }
  };

  window.__editAccount = function(id) { openAccountModal(id); };

  window.__deleteAccount = function(id) {
    if (!confirm('Delete this account?')) return;
    accounts = accounts.filter(a => a.id !== id);
    save(STORAGE_KEYS.accounts, accounts);
    syncAccountsToYAML();
    renderAccounts();
    renderDashboard();
    showToast('Account deleted', 'info');
  };

  window.__openRepo = function(url) { window.open(url, '_blank', 'noopener'); };

  // ---- Ticket form events ----
  $$('#ticketForm .form-input').forEach(input => {
    input.addEventListener('input', renderTicketPreview);
  });
  $$('#ticketForm input[type=checkbox]').forEach(input => {
    input.addEventListener('change', renderTicketPreview);
  });

  // #1: Save ticket → sync to YAML
  $('#ticketForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = gatherTicketForm();
    if (!data.projectId) { showToast('Project ID is required', 'error'); return; }
    tickets = [data];
    save(STORAGE_KEYS.tickets, tickets);
    syncTicketsToYAML();
    renderDashboard();
    showToast('Ticket config saved & synced to YAML', 'success');
    // #8: Schedule start if sale time is set
    scheduleStartStop(data);
  });

  $('#clearTicketBtn').addEventListener('click', () => {
    $('#ticketForm').reset();
    renderTicketPreview();
  });

  $('#downloadConfigBtn').addEventListener('click', () => {
    const code = $('#configCode').textContent;
    if (code.startsWith('//')) { showToast('Fill in the form first', 'error'); return; }
    downloadJSON(JSON.parse(code), 'ticket_config.json');
    showToast('Config downloaded', 'success');
  });

  // ---- Deploy actions ----
  $('#syncBtn').addEventListener('click', async () => {
    await syncAccountsToYAML();
    await syncTicketsToYAML();
    const result = await apiCall('/api/config/generate', { method: 'POST' });
    if (result?.ok) {
      showToast('Configs generated & synced', 'success');
    } else {
      showToast('Synced to YAML (API unavailable for generation)', 'warning');
    }
    $('#lastSyncTime').textContent = new Date().toLocaleString();
  });

  $('#genAllConfigsBtn').addEventListener('click', async () => {
    await syncAccountsToYAML();
    await syncTicketsToYAML();
    const result = await apiCall('/api/config/generate', { method: 'POST' });
    if (result?.ok) {
      showToast('All configs generated', 'success');
    } else {
      showToast('Synced to YAML. Run: nyaticket config', 'info');
    }
  });

  $('#exportAllBtn').addEventListener('click', () => {
    const data = { accounts, tickets, toolStates, exportedAt: new Date().toISOString(), version: '0.2.0' };
    downloadJSON(data, 'nyaticket_backup.json');
    showToast('Backup exported', 'success');
  });

  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('This will clear ALL local data. Continue?')) return;
    accounts = []; tickets = []; toolStates = {};
    localStorage.removeItem(STORAGE_KEYS.accounts);
    localStorage.removeItem(STORAGE_KEYS.tickets);
    localStorage.removeItem(STORAGE_KEYS.toolStates);
    renderAll();
    showToast('All data cleared', 'info');
  });

  // ---- Import / Export (topbar) ----
  $('#exportBtn').addEventListener('click', () => {
    const data = { accounts, tickets, toolStates, exportedAt: new Date().toISOString(), version: '0.2.0' };
    downloadJSON(data, 'nyaticket_backup.json');
    showToast('Config exported', 'success');
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
        populateTicketForm(tickets[0]);
        syncAccountsToYAML();
        syncTicketsToYAML();
        showToast('Config imported & synced', 'success');
      } catch { showToast('Invalid JSON file', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  // ---- #8: Scheduled start/stop ----
  function scheduleStartStop(ticketData) {
    // Clear old timers
    scheduledTimers.forEach(t => clearTimeout(t));
    scheduledTimers = [];
    if (!ticketData.saleTime) return;
    const saleTime = new Date(ticketData.saleTime).getTime();
    const now = Date.now();
    if (saleTime <= now) return;
    // Schedule start 5 seconds before sale
    const startDelay = Math.max(0, saleTime - now - 5000);
    const startTimer = setTimeout(async () => {
      showToast('Auto-starting tools!', 'info');
      // #7: Browser notification
      sendNotification('NyaTicketTools', 'Sale starting! Auto-launching tools...');
      const automatableTools = TOOLS.filter(t => t.automatable);
      for (const tool of automatableTools) {
        await window.__toggleTool(tool.id);
      }
    }, startDelay);
    scheduledTimers.push(startTimer);
    // Schedule stop 5 minutes after sale
    const stopTimer = setTimeout(async () => {
      showToast('Auto-stopping tools (5 min after sale)', 'info');
      const runningTools = Object.entries(toolStates).filter(([, s]) => s.status === 'running');
      for (const [id] of runningTools) {
        await window.__toggleTool(id);
      }
    }, startDelay + 300000);
    scheduledTimers.push(stopTimer);
    const startStr = new Date(saleTime - 5000).toLocaleString();
    showToast(`Scheduled: auto-start at ${startStr}`, 'info');
  }

  // ---- #7: Browser notifications ----
  function sendNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: 'web/assets/logo.png' });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(perm => {
        if (perm === 'granted') new Notification(title, { body, icon: 'web/assets/logo.png' });
      });
    }
  }

  // Request notification permission on load
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // ---- Countdown timer ----
  let countdownNotified = false;
  function updateCountdown() {
    const display = $('#countdownDisplay');
    if (!display) return;
    const ticketData = load(STORAGE_KEYS.tickets);
    const saleTime = ticketData[0]?.saleTime || ticketData[0]?.sale_start;
    if (!saleTime) {
      display.textContent = '--:--:--';
      return;
    }
    const target = new Date(saleTime).getTime();
    const now = Date.now();
    const diff = Math.max(0, target - now);

    if (diff === 0) {
      display.textContent = 'NOW!';
      const card = $('#countdownCard');
      if (card) card.classList.add('urgent');
      if (!countdownNotified) {
        countdownNotified = true;
        sendNotification('NyaTicketTools', 'Sale is NOW! Tools should be running.');
      }
      return;
    }

    // #7: Notify at 60s, 30s, 10s
    if (diff <= 60000 && diff > 59000) sendNotification('NyaTicketTools', '60 seconds until sale!');
    if (diff <= 30000 && diff > 29000) sendNotification('NyaTicketTools', '30 seconds until sale!');
    if (diff <= 10000 && diff > 9000) sendNotification('NyaTicketTools', '10 seconds until sale!');

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const d = Math.floor(h / 24);

    if (d > 0) {
      display.textContent = `${d}d ${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    } else {
      display.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    const card = $('#countdownCard');
    if (diff < 60000 && card) card.classList.add('urgent');
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
      // #6: Dynamic node count
      const nodeEl = $('#statNodes');
      if (nodeEl && status.node_count) nodeEl.textContent = status.node_count;
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

  // ---- Populate account select dropdown ----
  function populateAccountSelect() {
    const select = $('#ticketAccount');
    if (!select) return;
    select.innerHTML = '<option value="">-- Select account --</option>' +
      accounts.map(a => `<option value="${escHtml(a.name)}">${escHtml(a.name)}</option>`).join('');
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

  // ---- Render all ----
  function renderAll() {
    renderDashboard();
    renderTools();
    renderAccounts();
    populateAccountSelect();
    renderTicketPreview();
  }

  // ---- Init ----
  async function init() {
    await loadStateFromAPI();
    renderAll();
    if (tickets.length) populateTicketForm(tickets[0]);
    initCardHover();
    updateCountdown();
    requestNotificationPermission();

    // Entrance animation
    gsap.from('.sidebar', { x: -40, opacity: 0, duration: 0.6, ease: 'power3.out' });
    gsap.from('.topbar', { y: -20, opacity: 0, duration: 0.5, delay: 0.1, ease: 'power3.out' });

    const statCards = $$('.stat-card');
    gsap.fromTo(statCards,
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.1, delay: 0.2, ease: 'back.out(1.4)' }
    );

    const toolCards = $$('#dashboardToolsGrid .tool-card');
    gsap.fromTo(toolCards,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, delay: 0.5, ease: 'power3.out' }
    );

    setTimeout(animateStatValues, 300);

    // Periodic status refresh
    setInterval(async () => {
      await loadStateFromAPI();
      renderDashboard();
      renderTools();
    }, 10000);

    // #8: If ticket has sale time, schedule it
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
