// ============================================================
// BIOShield v2.3 — Admin Panel JavaScript
// ============================================================

const API = (typeof __API_URL__ !== 'undefined') ? __API_URL__ : '';

const isStaticPreview = (
  window.location.hostname.includes('perplexity.ai') ||
  window.location.hostname.includes('pplx.app') ||
  window.location.hostname.includes('github.io') ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('vercel.app') ||
  window.location.protocol === 'file:'
);

let adminSession   = null;
let pollingInterval = null;
let scenarioList   = []; // cached scenario list

// ===== UTILS =====
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type]||'ℹ'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transition='0.3s'; setTimeout(()=>el.remove(),350); }, duration);
}

async function api(method, path, body, timeout = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeout);
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include', signal: controller.signal };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, error: err };
  } finally {
    clearTimeout(t);
  }
}

function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDate(ts) {
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status) {
  const map = { waiting: 'badge-blue', active: 'badge-green', completed: 'badge-gray', abandoned: 'badge-red' };
  return `<span class="badge ${map[status]||'badge-gray'}">${escHtml(status||'unknown')}</span>`;
}

// ===== AUTH =====
async function checkAdminAuth() {
  if (isStaticPreview) {
    if (sessionStorage.getItem('bs_admin_auth') === '1') {
      adminSession = { username: 'admin', role: 'admin' };
      showAdminApp('admin');
    } else {
      document.getElementById('auth-gate').style.display = 'flex';
    }
    return;
  }

  const { ok, data } = await api('GET', '/api/auth/me');
  if (ok && data.role === 'admin') {
    adminSession = data;
    showAdminApp(data.username || 'admin');
    return;
  }

  if (sessionStorage.getItem('bs_admin_auth') === '1') {
    adminSession = { username: 'admin', role: 'admin' };
    showAdminApp('admin');
    return;
  }

  document.getElementById('auth-gate').style.display = 'flex';
  document.getElementById('admin-app').style.display = 'none';
}

function showAdminApp(username) {
  document.getElementById('auth-gate').style.display = 'none';
  document.getElementById('admin-app').style.display = 'block';
  document.getElementById('admin-user-badge').textContent = username;
  loadScenarios(true).then(() => loadRooms());
  startPolling();
}

async function adminLogout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  sessionStorage.removeItem('bs_admin_auth');
  clearInterval(pollingInterval);
  window.location.href = 'index.html';
}

// ===== POLLING =====
function startPolling() {
  clearInterval(pollingInterval);
  pollingInterval = setInterval(() => {
    const activePanel = document.querySelector('.admin-panel.active');
    if (activePanel?.id === 'panel-rooms') loadRooms(true);
    else if (activePanel?.id === 'panel-analytics') loadAnalytics(true);
  }, 15000);
}

// ===== TAB NAVIGATION =====
function switchAdminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');

  if (name === 'rooms') loadRooms();
  else if (name === 'scenarios') loadScenarios();
  else if (name === 'analytics') loadAnalytics();
  else if (name === 'records') loadQuizRecords();
  else if (name === 'apistatus') loadApiStatus();
  else if (name === 'builder') builderInit();
  else if (name === 'settings') loadSettings();
}

// ===== SCENARIOS =====
async function loadScenarios(silent = false) {
  const { ok, data } = await api('GET', '/api/admin/scenarios');
  if (!ok) {
    if (!silent) toast('Failed to load scenarios', 'error');
    return;
  }

  scenarioList = Array.isArray(data) ? data : [];
  updateScenarioDropdowns();

  document.getElementById('scenarios-loading').style.display = 'none';

  if (!scenarioList.length) {
    document.getElementById('scenarios-list').style.display = 'none';
    document.getElementById('scenarios-empty').style.display = 'block';
    return;
  }

  document.getElementById('scenarios-empty').style.display = 'none';
  document.getElementById('scenarios-list').style.display = 'block';
  document.getElementById('scenarios-grid').innerHTML = scenarioList.map(renderScenarioCard).join('');
}

function renderScenarioCard(sc) {
  const uploaded = sc.uploadedAt ? timeAgo(sc.uploadedAt) : '';
  return `
    <div class="scenario-card">
      <div class="scenario-card-header">
        <div>
          <div class="scenario-title">${escHtml(sc.title)}</div>
          <div class="scenario-meta">${escHtml(sc.framework || '')}${sc.framework && sc.id ? ' · ' : ''}ID: ${escHtml(sc.id)}</div>
        </div>
        <span class="badge badge-green">${sc.phaseCount || 0} phases</span>
      </div>
      <div class="scenario-card-footer">
        <span class="text-xs text-dim">${uploaded ? 'Added ' + uploaded : ''}</span>
        <button class="btn btn-danger btn-sm" onclick="deleteScenario('${escHtml(sc.id)}', '${escHtml(sc.title)}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Delete
        </button>
      </div>
    </div>
  `;
}

function updateScenarioDropdowns() {
  const sel = document.getElementById('create-room-scenario');
  if (!sel) return;
  if (!scenarioList.length) {
    sel.innerHTML = '<option value="">No scenarios available — upload one first</option>';
    return;
  }
  sel.innerHTML = scenarioList.map(sc =>
    `<option value="${escHtml(sc.id)}">${escHtml(sc.title)}</option>`
  ).join('');
}

async function deleteScenario(id, title) {
  if (!confirm(`Delete scenario "${title}"?\n\nThis cannot be undone. Any rooms currently running this scenario will continue, but no new rooms can be assigned to it.`)) return;
  const { ok, data } = await api('DELETE', `/api/admin/scenarios/${id}`);
  if (ok) {
    toast(`Scenario "${title}" deleted`, 'success');
    loadScenarios();
  } else {
    toast(data.error || 'Failed to delete scenario', 'error');
  }
}

// ===== UPLOAD SCENARIO =====
let uploadFileText = null;

function openUploadModal() {
  uploadFileText = null;
  document.getElementById('upload-title').value = '';
  document.getElementById('upload-file-name').style.display = 'none';
  document.getElementById('upload-file-name').textContent = '';
  document.getElementById('upload-progress').style.display = 'none';
  document.getElementById('upload-progress-bar').style.width = '0%';
  document.getElementById('btn-upload-confirm').disabled = false;
  document.getElementById('upload-modal').style.display = 'flex';
}

function closeUploadModal() {
  document.getElementById('upload-modal').style.display = 'none';
}

let uploadFileRaw = null; // stores File object for binary upload

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const nameEl = document.getElementById('upload-file-name');
  nameEl.textContent = file.name;
  nameEl.style.display = 'block';

  const ext = file.name.split('.').pop().toLowerCase();
  uploadFileRaw  = file;
  uploadFileText = null; // reset text fallback

  if (ext === 'txt' || ext === 'md') {
    // Plain text — read directly
    uploadFileText = await file.text();
    uploadFileRaw  = null; // no need for binary path
  } else if (ext === 'docx') {
    // Keep as binary for server-side extraction via mammoth
    toast('.docx selected — will be extracted on the server automatically.', 'info', 3000);
  } else {
    toast('Unsupported file type. Use .docx, .txt, or .md', 'error');
    uploadFileRaw  = null;
    uploadFileText = null;
    return;
  }

  // Auto-fill title from filename if empty
  const titleInput = document.getElementById('upload-title');
  if (!titleInput.value) {
    titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

async function uploadScenario() {
  const title = document.getElementById('upload-title').value.trim();
  if (!title) { toast('Please enter a scenario title', 'error'); return; }
  if (!uploadFileText && !uploadFileRaw) {
    toast('Please select a document file first', 'error');
    return;
  }

  const btn = document.getElementById('btn-upload-confirm');
  btn.disabled = true;
  const progress = document.getElementById('upload-progress');
  const bar = document.getElementById('upload-progress-bar');
  const statusEl = document.getElementById('upload-status');
  progress.style.display = 'block';

  let prog = 5;
  statusEl.textContent = uploadFileRaw ? 'Extracting DOCX text on server…' : 'Sending to AI for analysis…';
  bar.style.width = prog + '%';
  const ticker = setInterval(() => {
    if (prog < 85) { prog += Math.random() * 3; bar.style.width = Math.min(prog, 85) + '%'; }
  }, 800);

  let ok, data;

  if (uploadFileRaw) {
    // Binary DOCX upload — server extracts text with mammoth
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 120000);
      const res = await fetch(API + '/api/admin/scenarios/upload-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Scenario-Title': encodeURIComponent(title),
        },
        body: uploadFileRaw,
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(t);
      data = await res.json().catch(() => ({}));
      ok = res.ok;
    } catch (err) {
      ok = false;
      data = { error: err.message || 'Network error' };
    }
  } else {
    // Plain text upload
    const r = await api('POST', '/api/admin/scenarios/upload', { text: uploadFileText, title }, 120000);
    ok = r.ok; data = r.data;
  }

  clearInterval(ticker);
  bar.style.width = '100%';

  if (!ok) {
    statusEl.textContent = 'Failed: ' + (data.error || 'Unknown error');
    statusEl.style.color = '#ef4444';
    btn.disabled = false;
    toast(data.error || 'Upload failed', 'error');
    return;
  }

  statusEl.textContent = `✓ Parsed ${data.phaseCount} phases successfully`;
  statusEl.style.color = 'var(--green)';
  toast(`Scenario "${data.title}" uploaded with ${data.phaseCount} phases — opening in Builder for review`, 'success', 4000);
  setTimeout(() => {
    closeUploadModal();
    loadScenarios(true);
    builderOpenAfterUpload(data.id || data.preview?.id);
  }, 1500);
}

// ===== ROOMS =====
function openCreateRoomModal() {
  updateScenarioDropdowns();
  document.getElementById('create-room-modal').style.display = 'flex';
}

function closeCreateRoomModal() {
  document.getElementById('create-room-modal').style.display = 'none';
}

async function loadRooms(silent = false) {
  const { ok, data } = await api('GET', '/api/admin/rooms');
  if (!ok) {
    if (!silent) toast('Failed to load rooms', 'error');
    return;
  }

  document.getElementById('rooms-loading').style.display = 'none';

  if (!data || data.length === 0) {
    document.getElementById('rooms-list').style.display = 'none';
    document.getElementById('rooms-empty').style.display = 'block';
    return;
  }

  document.getElementById('rooms-empty').style.display = 'none';
  document.getElementById('rooms-list').style.display = 'block';
  document.getElementById('rooms-grid').innerHTML = data.map(room => renderRoomCard(room)).join('');
}

function renderRoomCard(room) {
  const memberCount = (room.members || []).length;
  const sc = scenarioList.find(s => s.id === room.scenarioId);
  const scenarioName = sc ? sc.title : (room.scenarioId || 'Unknown');

  return `
    <div class="room-card" id="room-card-${room.id}">
      <div class="room-card-header">
        <span class="room-code">${escHtml(room.id)}</span>
        ${statusBadge(room.status)}
      </div>
      <div class="room-card-body">
        <div class="room-meta">
          <div class="room-meta-row">
            <span class="label">Scenario</span>
            <span class="value" style="font-size:0.8rem; max-width:180px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${escHtml(scenarioName)}">${escHtml(scenarioName)}</span>
          </div>
          <div class="room-meta-row">
            <span class="label">Password</span>
            <span class="value mono">${escHtml(room.password)}</span>
          </div>
          <div class="room-meta-row">
            <span class="label">Phase</span>
            <span class="value">${escHtml(room.currentPhaseId || 'Phase 1')}</span>
          </div>
          <div class="room-meta-row">
            <span class="label">Members</span>
            <span class="value">${memberCount} online</span>
          </div>
          <div class="room-meta-row">
            <span class="label">Created</span>
            <span class="value text-muted">${timeAgo(room.createdAt)}</span>
          </div>
        </div>
        <div class="room-actions">
          <button class="btn btn-primary btn-sm" onclick="shareRoom('${room.id}', '${escHtml(room.password)}', '${escHtml(scenarioName)}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right:4px"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            Share
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openRoomModal('${room.id}')">Details</button>
          <button class="btn btn-danger btn-sm" onclick="deleteRoom('${room.id}')">Delete</button>
        </div>
      </div>
    </div>
  `;
}

async function createRoom() {
  const sel = document.getElementById('create-room-scenario');
  const scenarioId = sel ? sel.value : (scenarioList[0]?.id || 'plantplan');

  if (!scenarioId) { toast('Please select a scenario first', 'error'); return; }

  const btn = document.getElementById('btn-confirm-create');
  btn.classList.add('btn-loading');
  btn.disabled = true;

  const { ok, data } = await api('POST', '/api/admin/rooms', { scenarioId });

  btn.classList.remove('btn-loading');
  btn.disabled = false;

  if (!ok) { toast('Failed to create room: ' + (data.error || 'Unknown error'), 'error'); return; }

  closeCreateRoomModal();

  const sc = scenarioList.find(s => s.id === data.scenarioId);
  const scenarioName = sc ? sc.title : (data.scenarioId || 'Unknown');

  document.getElementById('new-room-code').textContent = data.roomId || '—';
  document.getElementById('new-room-pw').textContent   = data.password || '—';
  document.getElementById('new-room-scenario').textContent = scenarioName;
  document.getElementById('new-room-banner').style.display = 'block';

  toast(`Room ${data.roomId} created (${scenarioName})`, 'success');
  loadRooms();
}

async function deleteRoom(roomId) {
  if (!confirm(`Delete room ${roomId}? This cannot be undone.`)) return;
  const { ok, data } = await api('DELETE', `/api/admin/rooms/${roomId}`);
  if (ok) { toast(`Room ${roomId} deleted`, 'success'); loadRooms(); }
  else toast(data.error || 'Failed to delete room', 'error');
}

// ===== SHARE ROOM =====
function shareRoom(roomId, password, scenarioName) {
  const joinUrl = `${window.location.origin}/index.html`;
  document.getElementById('share-room-code').textContent     = roomId;
  document.getElementById('share-room-password').textContent = password;
  document.getElementById('share-join-url').textContent      = joinUrl;
  document.getElementById('share-scenario-name').textContent = scenarioName || '';

  const msg =
    `You have been invited to join a BIOShield biosecurity exercise.\n\n` +
    `Scenario:  ${scenarioName || ''}\n` +
    `Join URL:  ${joinUrl}\n` +
    `Room Code: ${roomId}\n` +
    `Password:  ${password}\n\n` +
    `Steps: Open the URL → click Join Exercise → enter the Room Code and Password.`;
  document.getElementById('share-modal').dataset.msg = msg;
  document.getElementById('share-modal').style.display = 'flex';
}

function closeShareModal() { document.getElementById('share-modal').style.display = 'none'; }

async function copyShareMessage() {
  const msg = document.getElementById('share-modal').dataset.msg || '';
  try {
    await navigator.clipboard.writeText(msg);
    const btn = document.getElementById('btn-copy-share');
    btn.textContent = '✓ Copied!';
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
    setTimeout(() => { btn.textContent = 'Copy Message'; btn.classList.remove('btn-primary'); btn.classList.add('btn-secondary'); }, 2000);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = msg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied to clipboard', 'success');
  }
}

// ===== ROOM MODAL =====
async function openRoomModal(roomId) {
  const { ok, data } = await api('GET', '/api/admin/rooms');
  if (!ok) { toast('Failed to load room data', 'error'); return; }
  const room = data.find(r => r.id === roomId);
  if (!room) { toast('Room not found', 'error'); return; }

  const sc = scenarioList.find(s => s.id === room.scenarioId);
  const scenarioName = sc ? sc.title : (room.scenarioId || 'Unknown');

  document.getElementById('modal-room-title').textContent = `Room ${room.id}`;
  const members = room.members || [];
  const membersHtml = members.length === 0
    ? '<div class="empty-state" style="padding:1rem;">No members online</div>'
    : members.map(m => `
      <div class="member-row">
        <div class="member-row-left">
          <div class="member-avatar" style="width:28px;height:28px;font-size:0.7rem;">${escHtml((m.name||'?').charAt(0))}</div>
          <span class="member-row-name">${escHtml(m.name)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <span class="badge ${m.role==='leader'?'badge-green':'badge-gray'}">${m.role}</span>
          ${m.role !== 'leader' ? `<button class="btn btn-ghost btn-sm" onclick="promoteLeader('${room.id}', '${m.visitorId}', '${escHtml(m.name)}')">Make Leader</button>` : ''}
        </div>
      </div>
    `).join('');

  document.getElementById('modal-room-body').innerHTML = `
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1.25rem;">
      <div class="room-info-item"><div class="room-info-label">Room Code</div><div class="room-info-value font-mono">${escHtml(room.id)}</div></div>
      <div class="room-info-item"><div class="room-info-label">Password</div><div class="room-info-value font-mono" style="font-size:1rem;">${escHtml(room.password)}</div></div>
      <div class="room-info-item"><div class="room-info-label">Status</div><div style="margin-top:0.25rem;">${statusBadge(room.status)}</div></div>
      <div class="room-info-item"><div class="room-info-label">Current Phase</div><div class="room-info-value" style="font-size:0.9rem;">${escHtml(room.currentPhaseId || 'phase1')}</div></div>
      <div class="room-info-item" style="grid-column:span 2;"><div class="room-info-label">Scenario</div><div class="room-info-value" style="font-size:0.875rem;">${escHtml(scenarioName)}</div></div>
    </div>
    <div>
      <h4 style="font-size:0.875rem; margin-bottom:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:700; letter-spacing:0.05em;">Members (${members.length})</h4>
      ${membersHtml}
    </div>
    <div style="margin-top:1.25rem; padding-top:1.25rem; border-top:1px solid var(--border);">
      <div style="font-size:0.8125rem; color:var(--text-dim);">Created: ${formatDate(room.createdAt)}</div>
    </div>
  `;
  document.getElementById('room-modal').style.display = 'flex';
}

function closeRoomModal() { document.getElementById('room-modal').style.display = 'none'; }

async function promoteLeader(roomId, visitorId, name) {
  if (!confirm(`Make ${name} the Team Leader?`)) return;
  const { ok, data } = await api('POST', `/api/admin/rooms/${roomId}/leader`, { visitorId });
  if (ok) { toast(`${name} is now Team Leader`, 'success'); openRoomModal(roomId); }
  else toast(data.error || 'Failed to change leader', 'error');
}

// ===== TIME FORMATTING =====
function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function avgDuration(records, field) {
  const vals = records.map(r => r[field]).filter(v => v && v > 0);
  if (!vals.length) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function avgPhaseTime(records) {
  const all = records.flatMap(r => (r.phaseHistory || []).map(p => p.timeTakenMs).filter(v => v && v > 0));
  if (!all.length) return null;
  return Math.round(all.reduce((a, b) => a + b, 0) / all.length);
}

// ===== SCORE CHART =====
let scoreChart = null;

function renderScoreChart(records) {
  const canvas = document.getElementById('score-chart');
  if (!canvas) return;
  const card = document.getElementById('score-chart-card');
  if (!records || records.length === 0) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = 'block';

  const recent = [...records].slice(-12);
  const labels = recent.map(r => r.roomId);
  const pcts   = recent.map(r => r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0);
  const colors = pcts.map(p => p >= 70 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444');

  if (scoreChart) { scoreChart.destroy(); scoreChart = null; }

  scoreChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Score %', data: pcts, backgroundColor: colors, borderRadius: 6, borderSkipped: false }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${ctx.raw}% — ${recent[ctx.dataIndex].totalScore}/${recent[ctx.dataIndex].maxScore} pts` } }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { min: 0, max: 100, ticks: { color: '#94a3b8', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.05)' } }
      }
    }
  });
}

// ===== ANALYTICS =====
async function loadAnalytics(silent = false) {
  const { ok, data } = await api('GET', '/api/admin/analytics');
  if (!ok) { if (!silent) toast('Failed to load analytics', 'error'); return; }

  document.getElementById('stat-total-rooms').textContent     = data.totalRooms || 0;
  document.getElementById('stat-active-rooms').textContent    = data.activeRooms || 0;
  document.getElementById('stat-completed').textContent       = data.completedRooms || 0;
  document.getElementById('stat-participants').textContent    = data.totalParticipants || 0;

  const records = data.quizRecords || [];
  const avgTotal = avgDuration(records, 'totalTimeMs');
  const avgPhase = avgPhaseTime(records);
  document.getElementById('stat-avg-time').textContent  = avgTotal ? formatDuration(avgTotal) : '—';
  document.getElementById('stat-avg-phase').textContent = avgPhase ? formatDuration(avgPhase) : '—';

  const timed = records.filter(r => r.totalTimeMs > 0);
  if (timed.length > 0) {
    const fastest = timed.reduce((a, b) => a.totalTimeMs < b.totalTimeMs ? a : b);
    const slowest = timed.reduce((a, b) => a.totalTimeMs > b.totalTimeMs ? a : b);
    document.getElementById('stat-fastest').textContent = `${fastest.roomId} (${formatDuration(fastest.totalTimeMs)})`;
    document.getElementById('stat-slowest').textContent = `${slowest.roomId} (${formatDuration(slowest.totalTimeMs)})`;
  } else {
    document.getElementById('stat-fastest').textContent = '—';
    document.getElementById('stat-slowest').textContent = '—';
  }

  renderScoreChart(records);

  const container = document.getElementById('analytics-records');
  if (records.length === 0) container.innerHTML = '<div class="empty-state">No quiz records yet.</div>';
  else {
    // Store in allQuizRecords so Detail/PDF buttons work from the Analytics page
    if (allQuizRecords.length === 0) allQuizRecords = [...records].reverse();
    container.innerHTML = renderRecordsTable(records.slice(-10).reverse());
  }
}

// ===== RESULTS / QUIZ RECORDS =====
let allQuizRecords = [];

async function loadQuizRecords() {
  const container = document.getElementById('records-container');
  if (container) container.innerHTML = '<div class="empty-state" style="opacity:0.5;">Loading…</div>';
  const { ok, data } = await api('GET', '/api/admin/quiz-records');
  if (!ok || !data || data.length === 0) {
    if (container) container.innerHTML = '<div class="empty-state">No completed exercises yet.</div>';
    allQuizRecords = [];
    return;
  }
  allQuizRecords = [...data].reverse();
  filterAndSortRecords();
  toast('Records refreshed', 'success', 2000);
}

function filterAndSortRecords() {
  const container = document.getElementById('records-container');
  if (!container) return;
  const query  = (document.getElementById('records-search')?.value || '').toLowerCase().trim();
  const sortBy = document.getElementById('records-sort')?.value || 'completed-desc';

  let filtered = allQuizRecords.filter(r => {
    if (!query) return true;
    const sc = scenarioList.find(s => s.id === r.scenarioId);
    const scName = (sc?.title || r.scenarioId || '').toLowerCase();
    const participants = (r.participants || []).join(' ').toLowerCase();
    return r.roomId.toLowerCase().includes(query) ||
           scName.includes(query) ||
           participants.includes(query);
  });

  filtered = filtered.slice().sort((a, b) => {
    switch (sortBy) {
      case 'completed-asc':  return a.completedAt - b.completedAt;
      case 'completed-desc': return b.completedAt - a.completedAt;
      case 'score-desc':     return (b.totalScore / Math.max(b.maxScore,1)) - (a.totalScore / Math.max(a.maxScore,1));
      case 'score-asc':      return (a.totalScore / Math.max(a.maxScore,1)) - (b.totalScore / Math.max(b.maxScore,1));
      case 'time-asc':       return a.totalTimeMs - b.totalTimeMs;
      case 'time-desc':      return b.totalTimeMs - a.totalTimeMs;
      default:               return b.completedAt - a.completedAt;
    }
  });

  if (filtered.length === 0) {
    container.innerHTML = query
      ? `<div class="empty-state">No results matching "<strong>${escHtml(query)}</strong>"</div>`
      : '<div class="empty-state">No completed exercises yet.</div>';
    return;
  }
  container.innerHTML = `<div class="card">${renderRecordsTable(filtered)}</div>`;
}

function renderRecordsTable(records) {
  return `
    <table class="records-table">
      <thead>
        <tr>
          <th>Room</th>
          <th>Scenario</th>
          <th>Participants</th>
          <th>Score</th>
          <th>Total Time</th>
          <th>Avg / Phase</th>
          <th>Phases</th>
          <th>Completed</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${records.map(r => {
          const pct = r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0;
          const avgP = avgPhaseTime([r]);
          const sc = scenarioList.find(s => s.id === r.scenarioId);
          const scName = sc ? sc.title : (r.scenarioId || '—');
          return `
            <tr>
              <td class="font-mono fw-700">${escHtml(r.roomId)}</td>
              <td style="font-size:0.8rem; max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escHtml(scName)}">${escHtml(scName)}</td>
              <td>${(r.participants||[]).map(p => escHtml(p)).join(', ')}</td>
              <td><span class="badge ${pct>=70?'badge-green':pct>=50?'badge-amber':'badge-red'}">${r.totalScore}/${r.maxScore} (${pct}%)</span></td>
              <td>${formatDuration(r.totalTimeMs)}</td>
              <td>${avgP ? formatDuration(avgP) : '—'}</td>
              <td>${(r.phaseHistory||[]).length}</td>
              <td>${formatDate(r.completedAt)}</td>
              <td style="white-space:nowrap;">
                <button class="btn btn-ghost btn-sm" onclick="openPhaseBreakdown('${escHtml(r.id)}')" title="Phase breakdown">Detail</button>
                <button class="btn btn-ghost btn-sm" onclick="downloadRecordPDF('${escHtml(r.id)}')" title="Download PDF report" style="color:var(--green);">PDF</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ===== PHASE BREAKDOWN =====
function openPhaseBreakdown(recordId) {
  const r = allQuizRecords.find(x => x.id === recordId);
  if (!r) return;
  const phases = r.phaseHistory || [];
  const sc = scenarioList.find(s => s.id === r.scenarioId);
  const scName = sc ? sc.title : (r.scenarioId || '—');

  const rows = phases.map((p, i) => {
    const pct = 3 > 0 ? Math.round((p.score / 3) * 100) : 0;
    return `
      <tr>
        <td>${i + 1}</td>
        <td style="font-size:0.8rem;">${escHtml(p.phaseTitle || p.phaseId)}</td>
        <td><span class="badge ${pct>=70?'badge-green':pct>=50?'badge-amber':'badge-red'}">${p.score}/3</span></td>
        <td>${p.timeTakenMs ? formatDuration(p.timeTakenMs) : '—'}</td>
      </tr>
    `;
  }).join('');

  const totalTime = formatDuration(r.totalTimeMs);
  const pct = r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0;

  document.getElementById('modal-room-title').textContent = `Room ${r.roomId} — Phase Breakdown`;
  document.getElementById('modal-room-body').innerHTML = `
    <div style="font-size:0.8125rem; color:var(--text-dim); margin-bottom:1rem;">Scenario: ${escHtml(scName)}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.75rem;margin-bottom:1.25rem;">
      <div class="room-info-item"><div class="room-info-label">Total Score</div><div class="room-info-value">${r.totalScore}/${r.maxScore} (${pct}%)</div></div>
      <div class="room-info-item"><div class="room-info-label">Total Time</div><div class="room-info-value">${totalTime}</div></div>
      <div class="room-info-item"><div class="room-info-label">Participants</div><div class="room-info-value" style="font-size:0.8rem;">${(r.participants||[]).join(', ') || '—'}</div></div>
    </div>
    <table class="records-table">
      <thead><tr><th>#</th><th>Phase</th><th>Score</th><th>Time Taken</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim)">No phase data</td></tr>'}</tbody>
    </table>
    <div style="margin-top:1rem;font-size:0.8rem;color:var(--text-dim);">Completed: ${formatDate(r.completedAt)}</div>
    <div style="margin-top:1rem;">
      <button class="btn btn-primary btn-sm" onclick="downloadRecordPDF('${escHtml(r.id)}')">
        ⬇ Download PDF Report
      </button>
    </div>
  `;
  document.getElementById('room-modal').style.display = 'flex';
}

// ===== EXPORTS =====
function exportRecordsCSV() {
  if (!allQuizRecords.length) { toast('No records to export', 'info'); return; }

  // Clean flat CSV — one row per record, all phase scores in columns
  // Find max phase count for dynamic columns
  const maxPhases = Math.max(...allQuizRecords.map(r => (r.phaseHistory||[]).length), 0);
  const phaseScoreCols = Array.from({ length: maxPhases }, (_, i) => `Phase ${i+1} Score`);
  const phaseTimeCols  = Array.from({ length: maxPhases }, (_, i) => `Phase ${i+1} Time`);

  const headers = [
    'Record ID', 'Room', 'Scenario', 'Participants',
    'Total Score', 'Max Score', 'Score %',
    'Total Time', 'Avg Time/Phase', 'Phases Completed',
    'Completed At',
    ...phaseScoreCols,
    ...phaseTimeCols,
  ];

  const rows = allQuizRecords.map(r => {
    const pct  = r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0;
    const avgP = avgPhaseTime([r]);
    const sc   = scenarioList.find(s => s.id === r.scenarioId);
    const ph   = r.phaseHistory || [];
    const phaseScores = Array.from({ length: maxPhases }, (_, i) => ph[i] ? ph[i].score : '');
    const phaseTimes  = Array.from({ length: maxPhases }, (_, i) => ph[i]?.timeTakenMs ? formatDuration(ph[i].timeTakenMs) : '');
    const cols = [
      r.id,
      r.roomId,
      `"${(sc?.title || r.scenarioId || '').replace(/"/g, '""')}"`,
      `"${(r.participants||[]).join('; ')}"`,
      r.totalScore,
      r.maxScore,
      pct + '%',
      r.totalTimeMs ? formatDuration(r.totalTimeMs) : '',
      avgP ? formatDuration(avgP) : '',
      ph.length,
      new Date(r.completedAt).toISOString(),
      ...phaseScores,
      ...phaseTimes,
    ];
    return cols.join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  downloadBlob(csv, `bioshield-results-${today()}.csv`, 'text/csv');
  toast('CSV downloaded', 'success');
}

// ===== PDF REPORT =====
async function downloadRecordPDF(recordId) {
  const r = allQuizRecords.find(x => x.id === recordId);
  if (!r) { toast('Record not found', 'error'); return; }

  const sc     = scenarioList.find(s => s.id === r.scenarioId);
  const scName = sc ? sc.title : (r.scenarioId || 'Biosecurity Exercise');
  const pct    = r.maxScore > 0 ? Math.round((r.totalScore / r.maxScore) * 100) : 0;
  const grade  = pct >= 80 ? 'Excellent' : pct >= 60 ? 'Good' : pct >= 40 ? 'Adequate' : 'Developing';
  const gradeColor = pct >= 80 ? '#059669' : pct >= 60 ? '#0284c7' : pct >= 40 ? '#d97706' : '#dc2626';
  const totalTime  = formatDuration(r.totalTimeMs);
  const phases = r.phaseHistory || [];

  // Fetch branding for logo + site title in PDF header
  let brandLogoUrl = '';
  let brandTitle   = 'BIOShield';
  let brandTagline = 'Australian Biosecurity Exercise Simulator';
  try {
    const bRes = await fetch('/api/branding');
    if (bRes.ok) {
      const b = await bRes.json();
      if (b.logoUrl)    brandLogoUrl = b.logoUrl;
      if (b.siteTitle)  brandTitle   = b.siteTitle;
      if (b.siteTagline) brandTagline = b.siteTagline;
    }
  } catch(e) { /* use defaults */ }

  // Fetch full scenario to get references
  let references = [];
  try {
    const scRes = await fetch(`/api/admin/scenarios/${encodeURIComponent(r.scenarioId)}/full`);
    if (scRes.ok) {
      const scFull = await scRes.json();
      if (Array.isArray(scFull.references)) references = scFull.references;
    }
  } catch(e) { /* no references */ }

  // Build the cover logo HTML — image if uploaded, text fallback
  const coverLogoHtml = brandLogoUrl
    ? `<img src="${brandLogoUrl}" alt="${escHtml(brandTitle)}" style="max-height:56px; max-width:200px; object-fit:contain; display:block; margin-bottom:6px;">`
    : `<div class="logo">${escHtml(brandTitle).replace(/shield/i, '<span>$&</span>')}</div>`;

  const phaseRows = phases.map((p, i) => {
    const ps = p.score ?? 0;
    const pm = p.maxPhaseScore ?? 3;
    const pp = pm > 0 ? Math.round((ps / pm) * 100) : 0;
    const pc = pp >= 67 ? '#059669' : pp >= 33 ? '#d97706' : '#dc2626';
    const mentioned = (p.mentioned || []).map(m => `<li>${escHtml(m)}</li>`).join('');
    const missed    = (p.missed    || []).map(m => `<li>${escHtml(m)}</li>`).join('');
    const submissionText = p.submissionText ? escHtml(p.submissionText) : '<em style="color:#999">No submission text recorded</em>';
    return `
      <div class="phase-block">
        <div class="phase-header">
          <span class="phase-num">Phase ${i + 1}</span>
          <span class="phase-title">${escHtml(p.phaseTitle || p.phaseId)}</span>
          <span class="phase-score" style="color:${pc}">${ps}/${pm} (${pp}%)</span>
          ${p.timeTakenMs ? `<span class="phase-time">${formatDuration(p.timeTakenMs)}</span>` : ''}
        </div>
        ${p.question ? `<div class="phase-question"><strong>Question:</strong> ${escHtml(p.question)}</div>` : ''}
        <div class="phase-submission">
          <div class="sub-label">Team Response ${p.submittedByName ? `(submitted by ${escHtml(p.submittedByName)})` : ''}:</div>
          <div class="sub-text">${submissionText}</div>
        </div>
        ${p.assessment ? `<div class="phase-assessment">ℹ️ ${escHtml(p.assessment)}</div>` : ''}
        <div class="phase-elements">
          ${mentioned ? `<div class="el-section el-good"><div class="el-label">✓ Addressed</div><ul>${mentioned}</ul></div>` : ''}
          ${missed    ? `<div class="el-section el-miss"><div class="el-label">✕ Missed</div><ul>${missed}</ul></div>`    : ''}
        </div>
        ${p.aiPowered ? '<div class="ai-badge">AI-powered analysis</div>' : ''}
      </div>
    `;
  }).join('');

  // References section — only shown if scenario has references
  const referencesHtml = references.length > 0 ? `
    <div style="margin-top:28px;">
      <div class="section-title">References</div>
      <ol style="padding-left:18px; font-size:9.5pt; line-height:1.8; color:#334155;">
        ${references.map(ref => `<li>${escHtml(ref)}</li>`).join('')}
      </ol>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(brandTitle)} Exercise Report — Room ${escHtml(r.roomId)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1e293b; background: #fff; padding: 0; }
  .page { max-width: 800px; margin: 0 auto; padding: 32px 40px 100px; }
  .cover { border-bottom: 3px solid #0f172a; padding-bottom: 24px; margin-bottom: 28px; }
  .logo { font-size: 22pt; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
  .logo span { color: #10b981; }
  .cover-sub { font-size: 9pt; color: #64748b; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.06em; }
  .report-title { font-size: 16pt; font-weight: 700; margin-top: 20px; color: #0f172a; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-top: 16px; font-size: 10pt; }
  .meta-item { display: flex; flex-direction: column; }
  .meta-label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
  .meta-value { font-weight: 600; color: #0f172a; }
  .summary-box { display: flex; gap: 16px; margin: 24px 0 28px; }
  .stat-box { flex: 1; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; text-align: center; }
  .stat-val { font-size: 22pt; font-weight: 800; }
  .stat-lbl { font-size: 8pt; color: #64748b; text-transform: uppercase; margin-top: 2px; }
  .section-title { font-size: 12pt; font-weight: 700; color: #0f172a; border-bottom: 2px solid #10b981; padding-bottom: 6px; margin-bottom: 16px; }
  .phase-block { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 18px; margin-bottom: 16px; break-inside: avoid; }
  .phase-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
  .phase-num { background: #0f172a; color: #fff; font-size: 8pt; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
  .phase-title { font-weight: 700; font-size: 11pt; flex: 1; }
  .phase-score { font-weight: 800; font-size: 12pt; }
  .phase-time { font-size: 9pt; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 4px; }
  .phase-question { font-size: 9.5pt; color: #475569; background: #f8fafc; border-left: 3px solid #cbd5e1; padding: 8px 12px; margin-bottom: 10px; border-radius: 0 4px 4px 0; }
  .phase-submission { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
  .sub-label { font-size: 8.5pt; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px; }
  .sub-text { font-size: 10pt; line-height: 1.6; color: #334155; white-space: pre-wrap; }
  .phase-assessment { font-size: 9.5pt; color: #1e40af; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 8px 12px; margin-bottom: 10px; line-height: 1.5; }
  .phase-elements { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .el-section { padding: 8px 12px; border-radius: 6px; }
  .el-good { background: #f0fdf4; border: 1px solid #bbf7d0; }
  .el-miss { background: #fff7ed; border: 1px solid #fed7aa; }
  .el-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 5px; }
  .el-good .el-label { color: #15803d; }
  .el-miss .el-label { color: #c2410c; }
  .el-section ul { padding-left: 14px; font-size: 9pt; line-height: 1.6; }
  .ai-badge { font-size: 7.5pt; color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; padding: 2px 8px; border-radius: 12px; display: inline-block; margin-top: 8px; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #94a3b8; display: flex; justify-content: space-between; }
  .pdf-action-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #0f172a; padding: 12px 24px; display: flex; justify-content: flex-end; gap: 10px; z-index: 100; }
  .pdf-btn { padding: 8px 20px; border-radius: 6px; font-size: 10pt; font-weight: 700; cursor: pointer; border: none; }
  .pdf-btn-save { background: #10b981; color: #fff; }
  .pdf-btn-close { background: transparent; color: #94a3b8; border: 1px solid #334155 !important; border-radius: 6px; }
  @media print {
    body { padding: 0; }
    .page { padding: 20px 28px; }
    .phase-block { break-inside: avoid; }
    .pdf-action-bar { display: none; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="cover">
    ${coverLogoHtml}
    <div class="cover-sub">${escHtml(brandTagline)}</div>
    <div class="report-title">Exercise Feedback Report</div>
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Room</span><span class="meta-value">${escHtml(r.roomId)}</span></div>
      <div class="meta-item"><span class="meta-label">Scenario</span><span class="meta-value">${escHtml(scName)}</span></div>
      <div class="meta-item"><span class="meta-label">Participants</span><span class="meta-value">${(r.participants||[]).map(p => escHtml(p)).join(', ') || '—'}</span></div>
      <div class="meta-item"><span class="meta-label">Completed</span><span class="meta-value">${formatDate(r.completedAt)}</span></div>
    </div>
  </div>

  <div class="summary-box">
    <div class="stat-box">
      <div class="stat-val" style="color:${gradeColor}">${pct}%</div>
      <div class="stat-lbl">Overall Score</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${r.totalScore}/${r.maxScore}</div>
      <div class="stat-lbl">Points</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:${gradeColor}">${grade}</div>
      <div class="stat-lbl">Grade</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${totalTime || '—'}</div>
      <div class="stat-lbl">Total Time</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${phases.length}</div>
      <div class="stat-lbl">Phases</div>
    </div>
  </div>

  <div class="section-title">Phase-by-Phase Feedback</div>
  ${phaseRows || '<p style="color:#94a3b8; font-style:italic;">No phase data recorded.</p>'}

  ${referencesHtml}

  <div class="footer">
    <span>Generated by ${escHtml(brandTitle)} — ${new Date().toLocaleString()}</span>
    <span>Record ID: ${escHtml(r.id)}</span>
  </div>
</div>
<div class="pdf-action-bar">
  <button class="pdf-btn pdf-btn-close" onclick="window.close()">Close</button>
  <button class="pdf-btn pdf-btn-save" onclick="window.print()">&#128427; Save as PDF</button>
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Please allow popups to download the PDF report', 'error', 6000); return; }
  win.document.write(html);
  win.document.close();
  toast('Report ready — click \'Save as PDF\' in the opened window', 'info', 4000);
}

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().slice(0, 10); }

// ===== API STATUS =====
async function loadApiStatus() {
  const container = document.getElementById('api-status-content');
  container.innerHTML = '<div class="empty-state">Loading…</div>';

  const { ok, data } = await api('GET', '/api/admin/api-usage');
  if (!ok) { container.innerHTML = '<div class="empty-state">Failed to load API status.</div>'; return; }

  const g = data.gemini || {};
  const todayPct = g.dailyLimit > 0 ? Math.min(100, Math.round((g.today || 0) / g.dailyLimit * 100)) : 0;
  const activeModel = g.model || 'gemini-2.5-flash';
  const modelInfo = GEMINI_MODEL_LIMITS[activeModel] || { label: activeModel, rpm: g.rpm || 10, rpd: g.dailyLimit || 250, tpm: '250K' };

  const barColor = (pct) => pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981';
  const statusDot = (ok) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${ok ? '#10b981' : '#ef4444'};margin-right:6px;"></span>`;
  const overLimit = todayPct >= 100;

  container.innerHTML = `
    <div class="api-grid">

      <!-- Gemini AI -->
      <div class="api-card">
        <div class="api-card-header">
          <div class="api-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green)"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            ${modelInfo.label}
          </div>
          <span class="badge ${overLimit ? 'badge-red' : 'badge-green'}">${overLimit ? 'LIMIT REACHED' : 'AI Analysis'}</span>
        </div>
        ${overLimit ? `<div style="margin-bottom:0.75rem; padding:0.5rem 0.75rem; background:rgba(239,68,68,0.12); border:1px solid rgba(239,68,68,0.3); border-radius:6px; font-size:0.8125rem; color:#ef4444;">⚠️ Daily request limit reached (${g.today || 0}/${g.dailyLimit || 250}). Switch to a model with higher quota in Settings → AI Model, or wait until midnight UTC for reset.</div>` : ''}
        <div class="api-stat-row">
          <span>Requests today (RPD)</span>
          <strong style="color:${barColor(todayPct)}">${g.today || 0} / ${g.dailyLimit || 250}</strong>
        </div>
        <div class="api-progress-bar"><div style="width:${todayPct}%; background:${barColor(todayPct)};"></div></div>
        <div class="api-limits" style="margin-top:0.75rem;">
          <div class="api-limit-item"><span class="api-limit-label">Rate limit</span><span class="api-limit-value">${modelInfo.rpm} RPM</span></div>
          <div class="api-limit-item"><span class="api-limit-label">Daily free limit</span><span class="api-limit-value">${(modelInfo.rpd).toLocaleString()} requests</span></div>
          <div class="api-limit-item"><span class="api-limit-label">Tokens per min</span><span class="api-limit-value">${modelInfo.tpm} TPM</span></div>
          <div class="api-limit-item"><span class="api-limit-label">Cost</span><span class="api-limit-value" style="color:var(--green);">${g.cost || 'Free tier'}</span></div>
        </div>
        ${data.queueLength > 0 ? `<div style="margin-top:0.75rem; padding:0.5rem 0.75rem; background:rgba(245,158,11,0.1); border-radius:6px; font-size:0.8125rem; color:#f59e0b;">⏳ ${data.queueLength} call(s) queued (rate limiting active)</div>` : ''}
        <div style="margin-top:0.75rem;">
          <button class="btn btn-ghost btn-sm" onclick="switchAdminTab('settings');setTimeout(()=>document.getElementById('model-switcher-card')?.scrollIntoView({behavior:'smooth'}),200);">⚙️ Switch AI Model</button>
        </div>
      </div>

      <!-- Scenario Parser -->
      <div class="api-card">
        <div class="api-card-header">
          <div class="api-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green)"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
            Gemini (Scenario Parser)
          </div>
          <span class="badge badge-blue">Upload only</span>
        </div>
        <div class="api-stat-row"><span>Parsing calls today</span><strong>${(data.geminiParser?.today || 0)}</strong></div>
        <div class="api-stat-row"><span>Parsing calls this month</span><strong>${(data.geminiParser?.month || 0)}</strong></div>
        <div style="margin-top:0.75rem; font-size:0.8125rem; color:var(--text-dim); line-height:1.6;">
          Separate quota from exercise analysis. Only used when admin uploads a new scenario document.
          Set <code style="font-size:0.75rem; background:var(--bg3); padding:0.1em 0.3em; border-radius:3px;">GEMINI_PARSER_KEY</code> in ecosystem.config.js to use a separate API key.
        </div>
      </div>

      <!-- MySQL -->
      <div class="api-card">
        <div class="api-card-header">
          <div class="api-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green)"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
            MySQL Database
          </div>
          <span class="badge ${data.mysql?.status === 'connected' ? 'badge-green' : 'badge-red'}">${data.mysql?.status || 'unknown'}</span>
        </div>
        <div class="api-stat-row"><span>Quiz records stored</span><strong>${(data.mysql?.quizRecords || 0).toLocaleString()}</strong></div>
        <div class="api-stat-row"><span>Scenarios uploaded</span><strong>${scenarioList.length}</strong></div>
        <div class="api-limits">
          <div class="api-limit-item"><span class="api-limit-label">Host</span><span class="api-limit-value">localhost (Hostinger VPS)</span></div>
          <div class="api-limit-item"><span class="api-limit-label">Cost</span><span class="api-limit-value" style="color:var(--green);">Included in hosting</span></div>
        </div>
      </div>

      <!-- Jitsi -->
      <div class="api-card">
        <div class="api-card-header">
          <div class="api-card-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--green)"><path d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/></svg>
            Jitsi Meet
          </div>
          <span class="badge badge-green">Free</span>
        </div>
        <div class="api-stat-row"><span>Service</span><strong>meet.jit.si public server</strong></div>
        <div class="api-stat-row"><span>Participant limit</span><strong>No hard limit</strong></div>
        <div class="api-limits">
          <div class="api-limit-item"><span class="api-limit-label">Integration</span><span class="api-limit-value">Opens in new tab</span></div>
          <div class="api-limit-item"><span class="api-limit-label">Auth required</span><span class="api-limit-value">None</span></div>
          <div class="api-limit-item"><span class="api-limit-label">Cost</span><span class="api-limit-value" style="color:var(--green);">Free</span></div>
        </div>
        <div style="margin-top:0.75rem; font-size:0.8125rem; color:var(--text-dim);">
          meet.jit.si blocks third-party iframes. BIOShield opens video in a new tab — this is intentional.
        </div>
      </div>

    </div>

    <div class="card" style="margin-top:1.25rem;">
      <h3 style="margin-bottom:0.75rem; font-size:0.9rem;">About API Key Rotation</h3>
      <p style="font-size:0.8125rem; color:var(--text-dim); line-height:1.7;">
        BIOShield uses a Gemini request queue — calls are spaced 4 seconds apart to stay within rate limits. 
        For a typical exercise group, you will use roughly 1 Gemini call per phase per room. 
        <strong>If you hit the daily limit (RPD)</strong>, go to Settings → AI Model and switch to Gemini 2.0 Flash (1,500 RPD free) or Gemini 2.5 Flash-Lite (1,000 RPD free). The change takes effect immediately.
        You can also set <code style="font-size:0.75rem; background:var(--bg3); padding:0.1em 0.3em; border-radius:3px;">GEMINI_PARSER_KEY</code> in ecosystem.config.js to a separate API key for scenario parsing, keeping your exercise quota free.
      </p>
    </div>
  `;
}

// ===== SETTINGS =====
async function saveSettings(e) {
  e.preventDefault();
  const newPassword = document.getElementById('new-password').value.trim();
  const newEmail    = document.getElementById('new-email').value.trim();
  if (!newPassword && !newEmail) { toast('No changes to save', 'info'); return; }
  if (newPassword && newPassword.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }

  const { ok, data } = await api('POST', '/api/admin/settings', {
    newPassword: newPassword || undefined,
    newEmail:    newEmail    || undefined,
  });
  if (ok) {
    toast('Settings saved successfully', 'success');
    document.getElementById('new-password').value = '';
    document.getElementById('new-email').value    = '';
  } else {
    toast(data.error || 'Failed to save settings', 'error');
  }
}

async function loadSettings() {
  const { ok, data } = await api('GET', '/api/admin/settings');
  if (!ok) return;
  if (data.siteTitle)   { const el = document.getElementById('setting-site-title');   if(el) el.value = data.siteTitle; }
  if (data.siteTagline) { const el = document.getElementById('setting-site-tagline'); if(el) el.value = data.siteTagline; }
  const keyStatus = document.getElementById('gemini-key-status');
  if (keyStatus) keyStatus.style.display = data.geminiKeySet ? 'inline' : 'none';
  // Load active model into switcher
  if (data.geminiModel) {
    const modelSelect = document.getElementById('setting-gemini-model');
    if (modelSelect) modelSelect.value = data.geminiModel;
    updateModelLimitsDisplay(data.geminiModel);
  }
  const dm = localStorage.getItem('bioshield-dark-mode');
  applyDarkMode(dm !== 'light');
  const theme = localStorage.getItem('bioshield-game-theme') || 'navy';
  applyGameTheme(theme, true);
}

const GEMINI_MODEL_LIMITS = {
  'gemini-2.5-flash':      { rpm: 10,  tpm: '250K',   rpd: 250,   label: 'Gemini 2.5 Flash' },
  'gemini-2.5-flash-lite': { rpm: 15,  tpm: '250K',   rpd: 1000,  label: 'Gemini 2.5 Flash-Lite' },
  'gemini-2.0-flash':      { rpm: 15,  tpm: '1,000K', rpd: 1500,  label: 'Gemini 2.0 Flash' },
};

function updateModelLimitsDisplay(model) {
  const info = GEMINI_MODEL_LIMITS[model];
  const el = document.getElementById('model-limits-display');
  if (!el || !info) return;
  const rpd = info.rpd;
  const color = rpd >= 1000 ? '#10b981' : rpd >= 500 ? '#f59e0b' : '#ef4444';
  el.innerHTML = `<span style="color:${color};font-weight:600;">${info.label}</span> &nbsp;·&nbsp; ${info.rpm} RPM &nbsp;·&nbsp; ${info.rpd} RPD &nbsp;·&nbsp; ${info.tpm} TPM`;
}

async function saveGeminiModel() {
  const select = document.getElementById('setting-gemini-model');
  if (!select) return;
  const model = select.value;
  if (!GEMINI_MODEL_LIMITS[model]) { toast('Invalid model selected', 'error'); return; }
  const { ok } = await api('POST', '/api/admin/settings', { geminiModel: model });
  if (ok) {
    toast(`Switched to ${GEMINI_MODEL_LIMITS[model].label} — takes effect immediately`, 'success');
    updateModelLimitsDisplay(model);
  } else toast('Failed to switch model', 'error');
}

// Shared branding loader — called on every page init to apply logo, title, favicon
async function applyBranding() {
  try {
    const res = await fetch('/api/branding');
    if (!res.ok) return;
    const b = await res.json();

    // Site title
    if (b.siteTitle) {
      document.title = b.siteTitle + ' Admin';
      const textEl = document.getElementById('admin-logo-text');
      if (textEl) textEl.innerHTML = b.siteTitle + ' <span style="font-size:0.75rem;opacity:0.6;font-weight:400;">Admin</span>';
    }

    // Logo image — show custom logo, hide default icon
    if (b.logoUrl) {
      const logoImg  = document.getElementById('admin-logo-img');
      const logoIcon = document.getElementById('admin-logo-icon');
      const logoText = document.getElementById('admin-logo-text');
      if (logoImg) {
        logoImg.src = b.logoUrl + '?t=' + Date.now();
        logoImg.style.display = 'block';
        // Hide default svg icon + text when custom logo is shown
        if (logoIcon) logoIcon.style.display = 'none';
        if (logoText) logoText.style.display = 'none';
      }
    }

    // Favicon
    if (b.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = b.faviconUrl + '?t=' + Date.now();
    }

    // Game theme — apply to admin page too
    if (b.gameTheme) {
      localStorage.setItem('bioshield-game-theme', b.gameTheme);
      applyThemeVars(b.gameTheme);
      document.documentElement.setAttribute('data-game-theme', b.gameTheme === 'navy' ? '' : b.gameTheme);
      document.querySelectorAll('.theme-swatch').forEach(el => el.classList.toggle('active', el.dataset.theme === b.gameTheme));
    }
  } catch(e) { /* branding load is non-critical */ }
}

async function saveBranding() {
  const siteTitle   = document.getElementById('setting-site-title')?.value?.trim();
  const siteTagline = document.getElementById('setting-site-tagline')?.value?.trim();
  if (!siteTitle) { toast('Site title cannot be empty', 'error'); return; }
  const { ok } = await api('POST', '/api/admin/settings', { siteTitle, siteTagline });
  if (ok) toast('Branding saved — reload the page to see changes', 'success');
  else toast('Failed to save branding', 'error');
}

async function saveGeminiKey() {
  const key = document.getElementById('setting-gemini-key')?.value?.trim();
  if (!key) { toast('Enter a Gemini API key first', 'error'); return; }
  if (!key.startsWith('AIza')) { toast('Invalid key — Gemini keys start with AIza', 'error'); return; }
  const { ok } = await api('POST', '/api/admin/settings', { geminiApiKey: key });
  if (ok) {
    toast('API key updated — takes effect immediately, no restart needed', 'success');
    document.getElementById('setting-gemini-key').value = '';
    const s = document.getElementById('gemini-key-status');
    if (s) s.style.display = 'inline';
  } else toast('Failed to update key', 'error');
}

function toggleKeyVisibility() {
  const inp = document.getElementById('setting-gemini-key');
  const btn = document.getElementById('key-visibility-btn');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (btn) btn.textContent = inp.type === 'password' ? '👁' : '🙈';
}

async function uploadAsset(input, type) {
  const file = input.files?.[0];
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  const maxBytes = type === 'favicon' ? 100 * 1024 : 500 * 1024;
  if (file.size > maxBytes) { toast(`File too large — max ${type === 'favicon' ? '100 KB' : '500 KB'}`, 'error'); return; }
  const allowed = type === 'favicon' ? ['png','ico','svg'] : ['png','jpg','jpeg','svg','webp'];
  if (!allowed.includes(ext)) { toast(`Unsupported format. Use: ${allowed.join(', ').toUpperCase()}`, 'error'); return; }
  const res = await fetch('/api/admin/settings/upload-asset', {
    method: 'POST',
    headers: { 'x-asset-type': type, 'x-asset-ext': ext },
    body: file,
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.url) {
    toast(`${type === 'favicon' ? 'Favicon' : 'Logo'} uploaded`, 'success');
    const preview = document.getElementById(type + '-preview');
    if (preview) preview.innerHTML = `<img src="${data.url}?t=${Date.now()}" style="max-width:100%;max-height:100%;object-fit:contain;" alt="${type}">`;
  } else toast(data.error || 'Upload failed', 'error');
  input.value = '';
}

function toggleDarkMode() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  applyDarkMode(isLight); // if currently light, go dark; if dark, go light
  localStorage.setItem('bioshield-dark-mode', isLight ? 'dark' : 'light');
}

function applyDarkMode(dark) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const btn   = document.getElementById('header-dark-toggle');
  const knob  = document.getElementById('dark-mode-toggle');
  const label = document.getElementById('theme-mode-label');
  if (btn)   btn.textContent = dark ? '🌙' : '☀️';
  if (label) label.textContent = dark ? 'Dark Mode' : 'Light Mode';
  if (knob)  knob.classList.toggle('active', dark);
}

function applyGameTheme(theme, silent = false) {
  localStorage.setItem('bioshield-game-theme', theme);
  document.querySelectorAll('.theme-swatch').forEach(el => el.classList.toggle('active', el.dataset.theme === theme));
  // Apply to current admin page too (so admin sees the theme live)
  applyThemeVars(theme);
  if (!silent) {
    toast(`Theme "${theme}" applied`, 'info', 2000);
    // Persist to server so player pages pick it up
    api('POST', '/api/admin/settings', { gameTheme: theme }).catch(() => {});
  }
}

const THEME_VARS = {
  navy:    { '--green': '#10b981', '--green-glow': 'rgba(16,185,129,0.3)', '--green-glow2': 'rgba(16,185,129,0.08)' },
  slate:   { '--green': '#6366f1', '--green-glow': 'rgba(99,102,241,0.3)', '--green-glow2': 'rgba(99,102,241,0.08)' },
  forest:  { '--green': '#22c55e', '--green-glow': 'rgba(34,197,94,0.3)',  '--green-glow2': 'rgba(34,197,94,0.08)' },
  crimson: { '--green': '#ef4444', '--green-glow': 'rgba(239,68,68,0.3)',  '--green-glow2': 'rgba(239,68,68,0.08)' },
  ocean:   { '--green': '#38bdf8', '--green-glow': 'rgba(56,189,248,0.3)', '--green-glow2': 'rgba(56,189,248,0.08)' },
};

function applyThemeVars(theme) {
  const vars = THEME_VARS[theme] || THEME_VARS.navy;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  // Update --accent alias used in some places
  root.style.setProperty('--accent', vars['--green']);
}


// ===== AI SCENARIO GENERATOR =====

// Persisted context so admin doesn't have to re-enter it every time
const AI_GEN_CONTEXT_KEY = 'bioshield-aigen-context';

function openAiGenModal() {
  const saved = localStorage.getItem(AI_GEN_CONTEXT_KEY) || '';
  const ctxEl = document.getElementById('aigen-context');
  if (ctxEl && saved) ctxEl.value = saved;
  document.getElementById('aigen-error').style.display = 'none';
  document.getElementById('ai-gen-modal').style.display = 'flex';
  document.getElementById('aigen-title').focus();
}

function closeAiGenModal() {
  document.getElementById('ai-gen-modal').style.display = 'none';
}

async function submitAiGenScenario() {
  const title     = document.getElementById('aigen-title').value.trim();
  const framework = document.getElementById('aigen-framework').value;
  const type      = document.getElementById('aigen-type').value;
  const pest      = document.getElementById('aigen-pest').value.trim();
  const region    = document.getElementById('aigen-region').value.trim();
  const phases    = document.getElementById('aigen-phase-count').value;
  const context   = document.getElementById('aigen-context').value.trim();
  const prompt    = document.getElementById('aigen-prompt').value.trim();
  const errEl     = document.getElementById('aigen-error');
  const btn       = document.getElementById('aigen-submit-btn');

  errEl.style.display = 'none';
  if (!title) { errEl.textContent = 'Please enter a scenario title.'; errEl.style.display = 'block'; return; }

  // Persist context for next time
  if (context) localStorage.setItem(AI_GEN_CONTEXT_KEY, context);

  btn.disabled = true;
  btn.innerHTML = `<span style="display:inline-block;width:13px;height:13px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;margin-right:6px;"></span>Generating…`;

  const { ok, data, status } = await api('POST', '/api/admin/scenarios/generate', {
    title, framework, scenarioType: type, pestName: pest,
    region, phaseCount: phases, context, prompt
  }, 130000); // 130s timeout — AI generation can take 30-60s for large scenarios

  btn.disabled = false;
  btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px;"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>Generate Scenario`;

  if (!ok) {
    errEl.textContent = data?.error || `Generation failed (${status}). Check your API key and try again.`;
    errEl.style.display = 'block';
    return;
  }

  closeAiGenModal();
  toast(`✨ "${escHtml(data.scenario?.title || title)}" generated with ${Object.keys(data.scenario?.phases || {}).length} phases`, 'success');

  // Refresh scenario list and open in builder
  await loadScenarioList();
  if (data.id) {
    // Switch to builder tab and load the new scenario
    switchAdminTab('builder');
    setTimeout(() => builderLoadScenario(data.id), 200);
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  const dm = localStorage.getItem('bioshield-dark-mode');
  if (dm === 'light') document.documentElement.setAttribute('data-theme', 'light');
  // Apply saved theme vars immediately (no flash)
  const theme = localStorage.getItem('bioshield-game-theme') || 'navy';
  if (typeof applyThemeVars === 'function') applyThemeVars(theme);
  checkAdminAuth();
  applyBranding();
});

// ============================================================
// SCENARIO BUILDER — v2.5
// ============================================================

const builder = {
  scenarioId:   null,   // currently loaded scenario ID
  scenario:     null,   // full scenario object (live copy)
  activePhaseId: null,  // phase currently open in editor
  dirty:        false,  // unsaved changes flag
};


// ── Builder phase list height recalculation ───────────────────
// Ensures the phase list scrolls correctly by computing exact available height
function builderRecalcHeight() {
  // CSS now handles sidebar scroll via position:absolute save bar.
  // Clear any previously JS-set maxHeight so CSS takes over.
  const list = document.getElementById('builder-phase-list');
  if (list) list.style.maxHeight = '';
}

// ── Init: called when Builder tab is opened ──────────────────
async function builderInit() {
  await builderRefreshScenarioList();
  if (builder.scenarioId) {
    builderRenderPhaseList();
    builderUpdateMeta();
    document.getElementById('builder-meta-block').style.display      = 'block';
    document.getElementById('builder-phase-list-wrap').style.display = 'flex';
    document.getElementById('builder-save-bar').style.display        = 'flex';
  }
  // Recalculate scroll height after tab renders
  setTimeout(builderRecalcHeight, 100);
  // Re-run on window resize
  if (!window._builderResizeListener) {
    window._builderResizeListener = true;
    window.addEventListener('resize', builderRecalcHeight);
  }
}

async function builderRefreshScenarioList() {
  const { ok, data } = await api('GET', '/api/admin/scenarios');
  const sel = document.getElementById('builder-scenario-select');
  if (!ok || !Array.isArray(data)) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— select a scenario —</option>';
  data.forEach(sc => {
    const opt = document.createElement('option');
    opt.value = sc.id;
    opt.textContent = `${sc.title} (${sc.phaseCount} phases)`;
    if (sc.id === current || sc.id === builder.scenarioId) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Load a scenario into the builder ────────────────────────
async function builderLoadScenario(id) {
  if (!id) {
    builder.scenarioId = null;
    builder.scenario   = null;
    builder.dirty      = false;
    document.getElementById('builder-meta-block').style.display   = 'none';
    document.getElementById('builder-phase-list-wrap').style.display = 'none';
    document.getElementById('builder-save-bar').style.display     = 'none';
    builderCloseEditor();
    return;
  }

  const { ok, data } = await api('GET', `/api/admin/scenarios/${id}/full`);
  if (!ok) { toast('Could not load scenario: ' + (data.error || 'Unknown error'), 'error'); return; }

  builder.scenarioId  = id;
  builder.scenario    = JSON.parse(JSON.stringify(data)); // deep copy
  builder.dirty       = false;
  builder.activePhaseId = null;

  builderUpdateMeta();
  builderRenderPhaseList();
  builderCloseEditor();

  document.getElementById('builder-meta-block').style.display      = 'block';
  document.getElementById('builder-phase-list-wrap').style.display = 'flex';
  document.getElementById('builder-save-bar').style.display        = 'flex';
  document.getElementById('builder-save-status').textContent       = '';
}

function builderUpdateMeta() {
  if (!builder.scenario) return;
  const sc = builder.scenario;
  document.getElementById('builder-meta-id').textContent     = sc.id || '';
  document.getElementById('builder-meta-fw').textContent     = sc.framework || '—';
  document.getElementById('builder-meta-phases').textContent = Object.keys(sc.phases || {}).length;
  document.getElementById('builder-meta-block').style.display = 'block';
}

// ── Phase list rendering ─────────────────────────────────────
function builderRenderPhaseList() {
  const list = document.getElementById('builder-phase-list');
  if (!builder.scenario) { list.innerHTML = ''; return; }
  const phases = builder.scenario.phases || {};
  const ids = Object.keys(phases);

  if (ids.length === 0) {
    list.innerHTML = '<div class="builder-empty-phases">No phases yet. Click + Add Phase.</div>';
    return;
  }

  list.innerHTML = ids.map(id => {
    const ph = phases[id];
    const isActive = id === builder.activePhaseId;
    const branchCount = Object.keys(ph.branches || {}).length;
    const ceCount = (ph.criticalElements || []).length;
    return `
      <div class="builder-phase-item ${isActive ? 'active' : ''}" onclick="builderOpenPhaseEditor('${escHtml(id)}')">
        <div class="builder-phase-item-top">
          <span class="builder-phase-id font-mono">${escHtml(id)}</span>
          <span class="builder-phase-badge">${branchCount} branch${branchCount !== 1 ? 'es' : ''}</span>
        </div>
        <div class="builder-phase-title">${escHtml(ph.title || '—')}</div>
        <div class="builder-phase-meta">${ceCount} critical element${ceCount !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

// ── Phase editor ─────────────────────────────────────────────
function builderOpenPhaseEditor(phaseId) {
  if (!builder.scenario || !builder.scenario.phases[phaseId]) return;
  builder.activePhaseId = phaseId;
  const ph = builder.scenario.phases[phaseId];

  // Update active state in list
  document.querySelectorAll('.builder-phase-item').forEach(el => el.classList.remove('active'));
  const items = document.querySelectorAll('.builder-phase-item');
  const phaseIds = Object.keys(builder.scenario.phases);
  const idx = phaseIds.indexOf(phaseId);
  if (items[idx]) items[idx].classList.add('active');

  // Populate fields
  document.getElementById('be-phase-id-original').value  = phaseId;
  document.getElementById('be-phase-id').value           = ph.id || phaseId;
  document.getElementById('be-phase-number').value       = ph.phaseNumber || '';
  document.getElementById('be-phase-title').value        = ph.title || '';
  document.getElementById('be-phase-narrative').value    = (ph.narrative || []).join('\n');
  document.getElementById('be-phase-question').value     = ph.question || '';
  builderClearAllErrors();
  document.getElementById('be-phase-heading').textContent = `Edit Phase — ${phaseId}`;

  // Critical elements
  builderRenderElements(ph.criticalElements || []);
  // Branches
  builderRenderBranches(ph.branches || {});

  // Show phase editor, hide others
  document.getElementById('builder-editor-empty').style.display  = 'none';
  document.getElementById('builder-info-editor').style.display   = 'none';
  document.getElementById('builder-phase-editor').style.display  = 'block';
}

// ── Critical Elements ────────────────────────────────────────
function builderRenderElements(elements) {
  const list = document.getElementById('be-elements-list');
  if (elements.length === 0) {
    list.innerHTML = '<div class="builder-no-items">No critical elements yet. Click + Add Element.</div>';
    return;
  }
  list.innerHTML = elements.map((el, i) => `
    <div class="builder-element-row" data-idx="${i}">
      <div class="builder-element-row-top">
        <input type="text" class="form-input be-el-name" style="font-size:0.8125rem;padding:0.375rem 0.625rem;" placeholder="Element name (e.g. Notify DAFF)" value="${escHtml(el.name || '')}" oninput="builderMarkDirty()">
        <button class="btn btn-ghost btn-xs btn-icon" onclick="builderRemoveElement(${i})" title="Remove element">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <input type="text" class="form-input be-el-keywords" style="font-size:0.8125rem;padding:0.375rem 0.625rem;" placeholder="Keywords (comma separated): notify, DAFF, report, contact" value="${escHtml((el.keywords || []).join(', '))}" oninput="builderMarkDirty()">
    </div>`).join('');
}

function builderAddElement() {
  if (!builder.activePhaseId) return;
  const ph = builder.scenario.phases[builder.activePhaseId];
  if (!ph.criticalElements) ph.criticalElements = [];
  ph.criticalElements.push({ id: 'ce' + (ph.criticalElements.length + 1), name: '', keywords: [] });
  builderRenderElements(ph.criticalElements);
  builderMarkDirty();
  // Focus the new name field
  const rows = document.querySelectorAll('.builder-element-row');
  if (rows.length > 0) rows[rows.length - 1].querySelector('.be-el-name')?.focus();
}

function builderRemoveElement(idx) {
  if (!builder.activePhaseId) return;
  const ph = builder.scenario.phases[builder.activePhaseId];
  ph.criticalElements.splice(idx, 1);
  builderRenderElements(ph.criticalElements);
  builderMarkDirty();
}

// ── Branches ─────────────────────────────────────────────────
function builderRenderBranches(branches) {
  const list = document.getElementById('be-branches-list');
  const allPhaseIds = builder.scenario ? Object.keys(builder.scenario.phases) : [];
  const entries = Object.entries(branches);
  if (entries.length === 0) {
    list.innerHTML = '<div class="builder-no-items">No branches yet. Click + Add Branch.</div>';
    return;
  }
  list.innerHTML = entries.map(([key, val], i) => `
    <div class="builder-branch-row" data-idx="${i}">
      <input type="text" class="form-input be-br-key" style="font-size:0.8125rem;padding:0.375rem 0.625rem;font-family:monospace;" placeholder="Branch key (e.g. success, missed_notify)" value="${escHtml(key)}" oninput="builderMarkDirty()">
      <span class="builder-branch-arrow">→</span>
      <select class="form-input be-br-val" style="font-size:0.8125rem;padding:0.375rem 0.625rem;" onchange="builderMarkDirty()">
        <option value="">— next phase —</option>
        ${allPhaseIds.map(pid => `<option value="${escHtml(pid)}" ${pid === val ? 'selected' : ''}>${escHtml(pid)}</option>`).join('')}
        ${val && !allPhaseIds.includes(val) ? `<option value="${escHtml(val)}" selected>${escHtml(val)} (unknown)</option>` : ''}
      </select>
      <button class="btn btn-ghost btn-xs btn-icon" onclick="builderRemoveBranch(${i})" title="Remove branch">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');
}

function builderAddBranch() {
  if (!builder.activePhaseId) return;
  const ph = builder.scenario.phases[builder.activePhaseId];
  if (!ph.branches) ph.branches = {};
  // Add a placeholder entry — we'll collect it on save
  const tempKey = 'branch_' + Date.now();
  ph.branches[tempKey] = '';
  builderRenderBranches(ph.branches);
  builderMarkDirty();
  // Focus the new key field
  const rows = document.querySelectorAll('.builder-branch-row');
  if (rows.length > 0) rows[rows.length - 1].querySelector('.be-br-key')?.focus();
}

function builderRemoveBranch(idx) {
  if (!builder.activePhaseId) return;
  const ph = builder.scenario.phases[builder.activePhaseId];
  const keys = Object.keys(ph.branches);
  delete ph.branches[keys[idx]];
  builderRenderBranches(ph.branches);
  builderMarkDirty();
}


// ── Builder validation helpers ───────────────────────────────
function builderShowFieldError(inputId, message) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.style.border = '1.5px solid var(--red)';
  el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.15)';
  // Remove any existing error msg
  const existing = el.parentNode.querySelector('.builder-field-error');
  if (existing) existing.remove();
  const msg = document.createElement('div');
  msg.className = 'builder-field-error';
  msg.style.cssText = 'color:var(--red);font-size:0.75rem;margin-top:0.3rem;';
  msg.textContent = message;
  el.parentNode.appendChild(msg);
  el.focus();
}

function builderClearFieldError(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.style.border = '';
  el.style.boxShadow = '';
  const existing = el.parentNode.querySelector('.builder-field-error');
  if (existing) existing.remove();
}

function builderClearAllErrors() {
  document.querySelectorAll('.builder-field-error').forEach(e => e.remove());
  ['be-phase-id','be-phase-question','be-title'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.border = ''; el.style.boxShadow = ''; }
  });
  // Also clear branch/element rows
  document.querySelectorAll('.be-br-key, .be-br-val, .be-el-name').forEach(el => {
    el.style.border = '';
    el.style.boxShadow = '';
  });
}

function builderMarkFieldError(el, message) {
  if (!el) return;
  el.style.border = '1.5px solid var(--red)';
  el.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.15)';
  const existing = el.parentNode?.querySelector('.builder-field-error');
  if (existing) existing.remove();
  const msg = document.createElement('div');
  msg.className = 'builder-field-error';
  msg.style.cssText = 'color:var(--red);font-size:0.75rem;margin-top:0.3rem;';
  msg.textContent = message;
  el.parentNode?.appendChild(msg);
}

// ── Save phase from editor into builder.scenario ─────────────
function builderSavePhase() {
  if (!builder.activePhaseId || !builder.scenario) return;
  builderClearAllErrors();

  const originalId = document.getElementById('be-phase-id-original').value;
  const rawId      = document.getElementById('be-phase-id').value.trim();
  const newId      = rawId.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '') || '';

  // ── Validation ──────────────────────────────────────────────
  let hasError = false;

  // 1. Phase ID required
  if (!newId) {
    builderShowFieldError('be-phase-id', 'Phase ID is required.');
    hasError = true;
  }
  // 2. Phase ID format
  else if (!/^[a-z][a-z0-9_]*$/.test(newId)) {
    builderShowFieldError('be-phase-id', 'Phase ID must start with a letter and contain only lowercase letters, numbers, and underscores.');
    hasError = true;
  }
  // 3. Duplicate ID check (only if renamed)
  else if (newId !== originalId && builder.scenario.phases[newId]) {
    builderShowFieldError('be-phase-id', `Phase ID "${newId}" already exists. Choose a different ID.`);
    hasError = true;
  }

  // 4. Question required
  const question = document.getElementById('be-phase-question').value.trim();
  if (!question) {
    builderShowFieldError('be-phase-question', 'A question is required — this is what participants answer during the exercise.');
    hasError = true;
  }

  // 5. Branch validation
  const brRows = document.querySelectorAll('.builder-branch-row');
  const branchKeys = new Set();
  let branchError = false;
  brRows.forEach(row => {
    const keyEl = row.querySelector('.be-br-key');
    const valEl = row.querySelector('.be-br-val');
    const key   = keyEl?.value?.trim();
    const val   = valEl?.value?.trim();
    if (!key && !branchError) {
      builderMarkFieldError(keyEl, 'Branch key cannot be empty.');
      branchError = true; hasError = true;
    } else if (key && branchKeys.has(key) && !branchError) {
      builderMarkFieldError(keyEl, `Duplicate branch key "${key}".`);
      branchError = true; hasError = true;
    } else if (key) {
      branchKeys.add(key);
    }
    // Warn if branch target is blank (not a hard error — end phases have no next phase)
    if (key && !val && valEl) {
      valEl.style.border = '1.5px solid var(--yellow, #f59e0b)';
    }
  });

  // 6. Warn if no critical elements (soft warning, not blocking)
  const elNames = Array.from(document.querySelectorAll('.be-el-name')).map(e => e.value.trim()).filter(Boolean);
  if (elNames.length === 0) {
    const ceSection = document.getElementById('be-elements-list');
    if (ceSection) {
      const existing = ceSection.parentNode?.querySelector('.builder-field-error');
      if (!existing) {
        const warn = document.createElement('div');
        warn.className = 'builder-field-error';
        warn.style.cssText = 'color:var(--yellow,#f59e0b);font-size:0.75rem;margin-top:0.3rem;';
        warn.textContent = '⚠ No critical elements defined. AI scoring won\'t work for this phase.';
        ceSection.parentNode?.insertBefore(warn, ceSection);
      }
    }
  }

  if (hasError) return;

  // ── Collect data ─────────────────────────────────────────────
  const elRows = document.querySelectorAll('.builder-element-row');
  const elements = Array.from(elRows).map((row, i) => {
    const name     = row.querySelector('.be-el-name')?.value?.trim() || '';
    const kwRaw    = row.querySelector('.be-el-keywords')?.value || '';
    const keywords = kwRaw.split(',').map(k => k.trim()).filter(Boolean);
    return { id: 'ce' + (i + 1) + '_' + name.toLowerCase().replace(/\s+/g, '_').slice(0, 20), name, keywords };
  }).filter(e => e.name);

  const branches = {};
  brRows.forEach(row => {
    const key = row.querySelector('.be-br-key')?.value?.trim();
    const val = row.querySelector('.be-br-val')?.value?.trim();
    if (key) branches[key] = val || '';
  });

  const updatedPhase = {
    id:               newId,
    phaseNumber:      parseInt(document.getElementById('be-phase-number').value) || null,
    title:            document.getElementById('be-phase-title').value.trim(),
    narrative:        document.getElementById('be-phase-narrative').value.split('\n').map(l => l.trim()).filter(Boolean),
    question,
    criticalElements: elements,
    branches,
  };

  // ── Handle ID rename ─────────────────────────────────────────
  if (newId !== originalId) {
    const newPhases = {};
    Object.entries(builder.scenario.phases).forEach(([k, v]) => {
      newPhases[k === originalId ? newId : k] = v;
    });
    Object.values(newPhases).forEach(ph => {
      if (ph.branches) {
        Object.entries(ph.branches).forEach(([bk, bv]) => {
          if (bv === originalId) ph.branches[bk] = newId;
        });
      }
    });
    builder.scenario.phases = newPhases;
    builder.activePhaseId = newId;
    document.getElementById('be-phase-id-original').value = newId;
    document.getElementById('be-phase-id').value = newId;
  }

  builder.scenario.phases[newId] = updatedPhase;
  builder.dirty = true;
  builderRenderPhaseList();
  builderUpdateMeta();
  document.getElementById('builder-save-status').textContent = '● Unsaved changes';
  document.getElementById('builder-save-status').style.color = 'var(--green)';
  toast('Phase changes applied — click Save to persist', 'info', 2500);
}

// ── Add new phase ────────────────────────────────────────────
function builderAddPhase() {
  if (!builder.scenario) return;
  const existingIds = Object.keys(builder.scenario.phases);
  const n = existingIds.length + 1;
  let newId = 'phase' + n;
  // Avoid collision
  while (builder.scenario.phases[newId]) newId = 'phase' + Date.now();
  builder.scenario.phases[newId] = {
    id: newId,
    phaseNumber: n,
    title: `Phase ${n} — New Phase`,
    narrative: ['Enter narrative here.'],
    question: "What are the team's actions?",
    criticalElements: [],
    branches: { success: '' },
  };
  builder.dirty = true;
  builderRenderPhaseList();
  builderUpdateMeta();
  builderOpenPhaseEditor(newId);
  document.getElementById('builder-save-status').textContent = '● Unsaved changes';
}

// ── Delete phase ──────────────────────────────────────────────
function builderDeletePhase() {
  if (!builder.activePhaseId || !builder.scenario) return;
  const id = builder.activePhaseId;
  // Check if any phase branches to this one
  const refs = [];
  Object.entries(builder.scenario.phases).forEach(([phId, ph]) => {
    if (phId === id) return;
    Object.values(ph.branches || {}).forEach(target => {
      if (target === id) refs.push(phId);
    });
  });
  if (refs.length > 0) {
    toast(`Cannot delete: phases [${refs.join(', ')}] branch to this phase. Update their branches first.`, 'error', 5000);
    return;
  }
  if (!confirm(`Delete phase "${id}"? This cannot be undone.`)) return;
  delete builder.scenario.phases[id];
  builder.activePhaseId = null;
  builder.dirty = true;
  builderRenderPhaseList();
  builderUpdateMeta();
  builderCloseEditor();
  document.getElementById('builder-save-status').textContent = '● Unsaved changes';
  toast('Phase deleted. Save to persist.', 'info');
}

// ── Scenario info editor ──────────────────────────────────────
function builderEditScenarioInfo() {
  if (!builder.scenario) return;
  const sc = builder.scenario;
  document.getElementById('be-title').value       = sc.title       || '';
  document.getElementById('be-framework').value   = sc.framework   || 'PLANTPLAN';
  document.getElementById('be-description').value = sc.description || '';
  document.getElementById('be-version').value     = sc.version     || '1.0';
  document.getElementById('be-references').value  = (sc.references || []).join('\n');

  document.getElementById('builder-editor-empty').style.display  = 'none';
  document.getElementById('builder-phase-editor').style.display  = 'none';
  document.getElementById('builder-info-editor').style.display   = 'block';
  builder.activePhaseId = null;
  document.querySelectorAll('.builder-phase-item').forEach(el => el.classList.remove('active'));
}

function builderSaveInfoBlock() {
  if (!builder.scenario) return;
  builderClearAllErrors();

  const title = document.getElementById('be-title').value.trim();
  if (!title) {
    builderShowFieldError('be-title', 'Scenario title is required.');
    return;
  }
  if (title.length < 4) {
    builderShowFieldError('be-title', 'Title is too short — use at least 4 characters.');
    return;
  }

  builder.scenario.title       = title;
  builder.scenario.framework   = document.getElementById('be-framework').value;
  builder.scenario.description = document.getElementById('be-description').value.trim();
  builder.scenario.version     = document.getElementById('be-version').value.trim() || '1.0';
  builder.scenario.references  = document.getElementById('be-references').value
    .split('\n').map(l => l.trim()).filter(Boolean);
  builder.dirty = true;
  builderUpdateMeta();
  document.getElementById('builder-save-status').textContent = '● Unsaved changes';
  document.getElementById('builder-save-status').style.color = 'var(--green)';
  builderCloseEditor();
  toast('Scenario info updated — click Save to persist', 'info', 2500);
}

function builderCloseEditor() {
  document.getElementById('builder-editor-empty').style.display  = 'block';
  document.getElementById('builder-info-editor').style.display   = 'none';
  document.getElementById('builder-phase-editor').style.display  = 'none';
  document.querySelectorAll('.builder-phase-item').forEach(el => el.classList.remove('active'));
  builder.activePhaseId = null;
}

// ── Dirty tracking ────────────────────────────────────────────
function builderMarkDirty() {
  builder.dirty = true;
  document.getElementById('builder-save-status').textContent = '● Unsaved changes';
  document.getElementById('builder-save-status').style.color = 'var(--accent)';
}

// ── Save to server ────────────────────────────────────────────
async function builderSave() {
  if (!builder.scenarioId || !builder.scenario) return;
  const btn = document.getElementById('builder-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  document.getElementById('builder-save-status').textContent = '';

  const { ok, data } = await api('PUT', `/api/admin/scenarios/${builder.scenarioId}`, builder.scenario, 15000);
  btn.disabled = false;
  btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
  if (ok) {
    builder.dirty = false;
    const statusEl = document.getElementById('builder-save-status');
    statusEl.textContent = '✓ Saved';
    statusEl.style.color = 'var(--success)';
    toast('Scenario saved successfully', 'success');
    builderUpdateMeta();
    builderRefreshScenarioList();
    // Reload scenario list so rooms dropdown is current
    await loadScenarios(true);
  } else {
    document.getElementById('builder-save-status').textContent = '✕ Save failed';
    toast('Save failed: ' + (data.error || 'Unknown error'), 'error');
  }
}

// ── New scenario modal ────────────────────────────────────────
function builderNewScenario() {
  // Show a simple inline prompt using a modal-style overlay
  const overlay = document.createElement('div');
  overlay.className = 'builder-modal-overlay';
  overlay.innerHTML = `
    <div class="builder-modal">
      <div class="builder-modal-header">
        <h3>Create New Scenario</h3>
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.builder-modal-overlay').remove()">✕</button>
      </div>
      <div class="builder-modal-body">
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8125rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.375rem;">Scenario Title <span style="color:var(--green)">*</span></label>
          <input type="text" id="new-sc-title" class="form-input" placeholder="e.g. Foot and Mouth Disease Incursion">
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8125rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.375rem;">Framework</label>
          <select id="new-sc-framework" class="form-input">
            <option value="PLANTPLAN">PLANTPLAN</option>
            <option value="AUSVETPLAN">AUSVETPLAN</option>
            <option value="AUSFOODPLAN">AUSFOODPLAN</option>
            <option value="AQUAVETPLAN">AQUAVETPLAN</option>
            <option value="Custom">Custom</option>
          </select>
        </div>
        <div style="margin-bottom:1rem;">
          <label style="display:block;font-size:0.8125rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.375rem;">Description <span style="color:var(--text-dim);font-weight:400;">(optional)</span></label>
          <textarea id="new-sc-desc" class="form-input" rows="2" placeholder="Brief overview for participants"></textarea>
        </div>
        <p style="font-size:0.8125rem;color:var(--text-dim);margin-top:0.75rem;line-height:1.5;">Creates a blank scenario with one starter phase. You can add phases and upload content afterwards.</p>
      </div>
      <div class="builder-modal-footer">
        <button class="btn btn-ghost" onclick="this.closest('.builder-modal-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="builderCreateScenario()">Create Scenario</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  setTimeout(() => { const f = document.getElementById('new-sc-title'); if(f) f.focus(); }, 50);
}

async function builderCreateScenario() {
  const title     = document.getElementById('new-sc-title')?.value?.trim();
  const framework = document.getElementById('new-sc-framework')?.value || 'PLANTPLAN';
  const desc      = document.getElementById('new-sc-desc')?.value?.trim() || '';
  if (!title) { toast('Title is required', 'error'); return; }

  const btn = document.querySelector('.builder-modal .btn-primary, .builder-modal-footer .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }

  const { ok, data } = await api('POST', '/api/admin/scenarios/new', { title, framework, description: desc }, 10000);
  document.querySelector('.builder-modal-overlay')?.remove();
  if (ok && data.id) {
    toast(`Scenario "${title}" created`, 'success');
    await builderRefreshScenarioList();
    // Select and load it
    document.getElementById('builder-scenario-select').value = data.id;
    await builderLoadScenario(data.id);
    // Open info editor so they can review
    builderEditScenarioInfo();
  } else {
    toast('Could not create scenario: ' + (data.error || 'Unknown error'), 'error');
  }
}

// ── Upload & parse then open in builder ──────────────────────
// This hooks into the existing upload flow: after upload succeeds,
// offer to open in builder for review
async function builderOpenAfterUpload(scenarioId) {
  if (!scenarioId) return;
  await builderRefreshScenarioList();
  document.getElementById('builder-scenario-select').value = scenarioId;
  await builderLoadScenario(scenarioId);
  switchAdminTab('builder');
}

