/* ============================================================
   NyaTickerTools – Dashboard Application
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
    {
      id: 'BHYG',
      name: 'BHYG',
      desc: 'High-speed Bilibili helper',
      color: '#3B82F6',
      abbrev: 'BHYG',
      lang: 'Python',
      repo: 'https://github.com/ZianTT/BHYG',
    },
    {
      id: 'bili_ticket_rush',
      name: 'bili_ticket_rush',
      desc: 'Rush-grab ticket tool',
      color: '#10B981',
      abbrev: 'BTR',
      lang: 'Rust',
      repo: 'https://github.com/Violiate/bili_ticket_rush',
    },
    {
      id: 'bili-ticket-go',
      name: 'bili-ticket-go',
      desc: 'Go-based ticket grabber',
      color: '#F59E0B',
      abbrev: 'BTG',
      lang: 'Go',
      repo: 'https://github.com/konaxia548/bili-ticket-go',
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
      {
        opacity: 1, y: 0,
        duration: 0.5,
        stagger: 0.07,
        ease: 'power3.out',
        clearProps: 'transform',
      }
    );
  }

  function animateStatValues() {
    $$('.stat-value').forEach(el => {
      const target = parseInt(el.textContent) || 0;
      gsap.from(el, {
        textContent: 0,
        duration: 1,
        ease: 'power2.out',
        snap: { textContent: 1 },
        onUpdate() { el.textContent = Math.round(gsap.getProperty(el, 'textContent')); },
      });
    });
  }

  // Hover lift for cards (applied once)
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

  // Pulse animation for status change
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
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    gsap.fromTo(toast,
      { opacity: 0, x: 40 },
      { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out' }
    );

    setTimeout(() => {
      gsap.to(toast, {
        opacity: 0, x: 40, duration: 0.3, ease: 'power2.in',
        onComplete: () => toast.remove(),
      });
    }, 3000);
  }

  // ---- Render: Dashboard ----
  function renderDashboard() {
    $('#statAccounts').textContent = accounts.length;
    $('#statTickets').textContent = tickets.length;

    const grid = $('#dashboardToolsGrid');
    grid.innerHTML = TOOLS.map(tool => {
      const state = toolStates[tool.id] || { status: 'idle', lastRun: null };
      const statusLabels = { idle: 'Idle', running: 'Running', success: 'Success', failed: 'Failed' };
      return `
        <div class="tool-card glass" data-tool="${tool.id}">
          <div class="tool-card-header">
            <div class="tool-card-left">
              <div class="tool-icon" style="background:${tool.color}">${tool.abbrev}</div>
              <span class="tool-name">${tool.name}</span>
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
            <button class="btn btn-sm ${state.status === 'running' ? 'btn-danger' : 'btn-primary'}" onclick="window.__toggleTool('${tool.id}')">
              ${state.status === 'running' ? 'Stop' : 'Start'}
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
              <span class="label">Last Run</span>
              <span class="value">${state.lastRun ? new Date(state.lastRun).toLocaleString() : '-'}</span>
            </div>
          </div>
          <div class="tool-detail-actions">
            <button class="btn btn-sm btn-ghost" onclick="window.__openRepo('${tool.repo}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Repo
            </button>
            <button class="btn btn-sm ${state.status === 'running' ? 'btn-danger' : 'btn-primary'}" onclick="window.__toggleTool('${tool.id}')">
              ${state.status === 'running' ? 'Stop' : 'Start'}
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
      const hasCookie = !!acc.sessdata;
      return `
        <div class="account-card glass" data-id="${acc.id}">
          <div class="account-header">
            <div class="account-avatar">${initials}</div>
            <div>
              <div class="account-name">${escHtml(acc.name)}</div>
              <div class="account-uid">UID: ${escHtml(acc.uid || '-')}</div>
            </div>
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
            <button class="btn btn-sm btn-ghost" onclick="window.__editAccount('${acc.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
            <button class="btn btn-sm btn-danger" onclick="window.__deleteAccount('${acc.id}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              Delete
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
    $('#projectId').value = data.projectId || '';
    $('#screenId').value = data.screenId || '';
    $('#skuId').value = data.skuId || '';
    $('#payMoney').value = data.payMoney || '';
    $('#ticketCount').value = data.count || '1';
    $('#saleTime').value = data.saleTime || '';
    $('#buyerName').value = data.buyerName || '';
    $('#buyerPhone').value = data.buyerPhone || '';
    $('#buyerIdCard').value = data.buyerIdCard || '';
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
    renderAccounts();
    renderDashboard();
    closeAccountModal();
  });

  // ---- Tool toggle (start/stop via API) ----
  window.__toggleTool = async function(toolId) {
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
        // Fallback to local simulation
        state.status = 'running';
        state.lastRun = Date.now();
        showToast(`${toolId} started (local)`, 'success');
      }
    }
    toolStates[toolId] = state;
    save(STORAGE_KEYS.toolStates, toolStates);
    renderDashboard();
    renderTools();

    // Pulse the status dot
    const dots = $$(`[data-status="${toolId}"]`);
    dots.forEach(d => pulseElement(d));
  };

  window.__editAccount = function(id) { openAccountModal(id); };

  window.__deleteAccount = function(id) {
    if (!confirm('Delete this account?')) return;
    accounts = accounts.filter(a => a.id !== id);
    save(STORAGE_KEYS.accounts, accounts);
    renderAccounts();
    renderDashboard();
    showToast('Account deleted', 'info');
  };

  window.__openRepo = function(url) { window.open(url, '_blank', 'noopener'); };

  // ---- Ticket form events ----
  $$('#ticketForm .form-input').forEach(input => {
    input.addEventListener('input', renderTicketPreview);
  });

  $('#ticketForm').addEventListener('submit', e => {
    e.preventDefault();
    const data = gatherTicketForm();
    if (!data.projectId) { showToast('Project ID is required', 'error'); return; }
    tickets = [data]; // single config for now
    save(STORAGE_KEYS.tickets, tickets);
    renderDashboard();
    showToast('Ticket config saved', 'success');
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
    const result = await apiCall('/api/config/generate', { method: 'POST' });
    if (result?.ok) {
      showToast('Configs generated', 'success');
    } else {
      showToast('API unavailable - check local config', 'warning');
    }
    $('#lastSyncTime').textContent = new Date().toLocaleString();
  });

  $('#genAllConfigsBtn').addEventListener('click', () => {
    if (!tickets.length) { showToast('No ticket config to export', 'error'); return; }
    downloadJSON(tickets[0], 'ticket_config.json');
    showToast('Config generated', 'success');
  });

  $('#exportAllBtn').addEventListener('click', () => {
    const data = { accounts, tickets, toolStates, exportedAt: new Date().toISOString() };
    downloadJSON(data, 'nyaticker_backup.json');
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
    const data = { accounts, tickets, toolStates, exportedAt: new Date().toISOString() };
    downloadJSON(data, 'nyaticker_backup.json');
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
        showToast('Config imported', 'success');
      } catch { showToast('Invalid JSON file', 'error'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

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

  // ---- Countdown timer ----
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
      return;
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const d = Math.floor(h / 24);

    if (d > 0) {
      display.textContent = `${d}d ${String(h%24).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    } else {
      display.textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }

    if (diff < 60000) {
      const card = $('#countdownCard');
      if (card) card.classList.add('urgent');
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

      // Update connection indicator
      const dot = $('#connectionStatus');
      if (dot) dot.className = 'connection-status connected';

      // Update node count
      const nodeEl = $('#statNodes');
      if (nodeEl && status.node_count) nodeEl.textContent = status.node_count;
    } else {
      const dot = $('#connectionStatus');
      if (dot) dot.className = 'connection-status disconnected';
    }

    // Also try loading accounts from API
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

    // Entrance animation
    gsap.from('.sidebar', { x: -40, opacity: 0, duration: 0.6, ease: 'power3.out' });
    gsap.from('.topbar', { y: -20, opacity: 0, duration: 0.5, delay: 0.1, ease: 'power3.out' });

    // Animate stat cards
    const statCards = $$('.stat-card');
    gsap.fromTo(statCards,
      { opacity: 0, y: 30, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.1, delay: 0.2, ease: 'back.out(1.4)' }
    );

    // Animate tool cards
    const toolCards = $$('#dashboardToolsGrid .tool-card');
    gsap.fromTo(toolCards,
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, delay: 0.5, ease: 'power3.out' }
    );

    // Count up stats
    setTimeout(animateStatValues, 300);

    // Periodic status refresh
    setInterval(async () => {
      await loadStateFromAPI();
      renderDashboard();
      renderTools();
    }, 10000);
  }

  // Wait for GSAP
  if (typeof gsap !== 'undefined') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
