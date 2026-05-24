// ── Player Branding + Theme + Dark Mode ─────────────────────
const PLAYER_THEME_VARS = {
  navy:    { '--green': '#10b981', '--green-glow': 'rgba(16,185,129,0.3)', '--green-glow2': 'rgba(16,185,129,0.08)' },
  slate:   { '--green': '#6366f1', '--green-glow': 'rgba(99,102,241,0.3)', '--green-glow2': 'rgba(99,102,241,0.08)' },
  forest:  { '--green': '#22c55e', '--green-glow': 'rgba(34,197,94,0.3)',  '--green-glow2': 'rgba(34,197,94,0.08)' },
  crimson: { '--green': '#ef4444', '--green-glow': 'rgba(239,68,68,0.3)',  '--green-glow2': 'rgba(239,68,68,0.08)' },
  ocean:   { '--green': '#38bdf8', '--green-glow': 'rgba(56,189,248,0.3)', '--green-glow2': 'rgba(56,189,248,0.08)' },
};

function playerApplyTheme(theme) {
  const vars = PLAYER_THEME_VARS[theme] || PLAYER_THEME_VARS.navy;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  if (theme !== 'navy') root.setAttribute('data-game-theme', theme);
  else root.removeAttribute('data-game-theme');
}

function playerToggleDarkMode() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const dark = isLight;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  localStorage.setItem('bioshield-dark-mode', dark ? 'dark' : 'light');
  const btn = document.getElementById('player-dark-toggle');
  if (btn) btn.textContent = dark ? '🌙' : '☀️';
}

// Stored branding data — applied on load and after every screen transition
let _brandingCache = null;

async function playerApplyBranding() {
  try {
    const res = await fetch('/api/branding');
    if (!res.ok) return;
    const b = await res.json();
    _brandingCache = b;
    _applyBrandingToDOM(b);
  } catch(e) { /* non-critical */ }
}

function _applyBrandingToDOM(b) {
  if (!b) return;

  // ── Site title ──────────────────────────────────────────────
  if (b.siteTitle) {
    document.title = b.siteTitle;
    // Update all brand-name spans
    const nameEls = document.querySelectorAll('[id^="player-brand-name"]');
    nameEls.forEach(el => {
      const raw = b.siteTitle;
      // Try to style 'Shield' part with accent colour
      el.innerHTML = raw.replace(/(shield)/i, '<span>$1</span>');
    });
  }

  // ── Logo image ───────────────────────────────────────────────
  // Strategy: when custom logo is uploaded, hide the entire green .logo-icon box
  // and show a standalone img next to the brand name. Avoids double-logo.
  const logoScreens = ['home', 'login', 'waiting', 'exercise'];
  logoScreens.forEach(screen => {
    const iconEl = document.getElementById('logo-icon-'  + screen);
    const imgEl  = document.getElementById('logo-img-'   + screen);
    const nameEl = document.getElementById('player-brand-name-' + screen);
    if (!iconEl || !imgEl) return;
    if (b.logoUrl) {
      // Custom logo: hide the green icon box AND the text name (logo image already has the brand name)
      iconEl.style.display = 'none';
      if (nameEl) nameEl.style.display = 'none';
      imgEl.src = b.logoUrl;
      imgEl.style.display = 'block';
    } else {
      // No custom logo: show default green icon + text name, hide the img slot
      iconEl.style.display = '';
      if (nameEl) nameEl.style.display = '';
      imgEl.style.display = 'none';
    }
  });

  // ── Login card logo ──────────────────────────────────────────
  // ── Favicon ──────────────────────────────────────────────────
  if (b.faviconUrl) {
    let link = document.getElementById('favicon-link');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.id = 'favicon-link';
      document.head.appendChild(link);
    }
    link.href = b.faviconUrl;
  }

  // ── Game theme ───────────────────────────────────────────────
  if (b.gameTheme) {
    localStorage.setItem('bioshield-game-theme', b.gameTheme);
    playerApplyTheme(b.gameTheme);
  }

  // ── Dark/light toggle button icon ───────────────────────────
  const dm = localStorage.getItem('bioshield-dark-mode');
  const btn = document.getElementById('player-dark-toggle');
  if (btn) btn.textContent = dm === 'light' ? '☀️' : '🌙';
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  const theme = localStorage.getItem('bioshield-game-theme') || 'navy';
  playerApplyTheme(theme);
  const dm = localStorage.getItem('bioshield-dark-mode');
  const btn = document.getElementById('player-dark-toggle');
  if (btn) btn.textContent = dm === 'light' ? '☀️' : '🌙';
  playerApplyBranding();
});

// ============================================================
// BIOShield v2.11 — Frontend Game Logic
// ============================================================

const API = (typeof __API_URL__ !== 'undefined') ? __API_URL__ : '';

// ===== STATE =====
let state = {
  screen: 'home',
  session: null,          // { userId, role, username, roomId }
  roomState: null,        // full room state from server
  visitorId: getOrCreateVisitorId(),
  ws: null,
  wsReconnectTimer: null,
  roomTimerInterval: null, // live elapsed time ticker
  roomStartedAt: null,     // timestamp (ms) when exercise started
  currentPhase: null,
  analysisResult: null,
  jitsiApi: null,
};

function getOrCreateVisitorId() {
  let id = localStorage.getItem('bioshield_visitor_id');
  if (!id) { id = 'v-' + Math.random().toString(36).substr(2, 10); localStorage.setItem('bioshield_visitor_id', id); }
  return id;
}

// ===== NAVIGATION =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById('screen-' + name);
  if (el) el.classList.add('active');
  state.screen = name;
  // Re-apply branding so logo/title shows on every screen
  if (_brandingCache) _applyBrandingToDOM(_brandingCache);
}

function switchLoginTab(name) {
  document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.login-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('panel-' + name).classList.add('active');
}

// ===== TOAST =====
function toast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${escHtml(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '0.3s'; setTimeout(() => el.remove(), 350); }, duration);
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== API HELPERS =====
// isStaticPreview: true when running on a static CDN (Perplexity, GitHub Pages, etc.)
// with no backend. Detected by checking for known static hosts or missing WS support.
const isStaticPreview = (
  window.location.hostname.includes('perplexity.ai') ||
  window.location.hostname.includes('pplx.app') ||
  window.location.hostname.includes('github.io') ||
  window.location.hostname.includes('netlify.app') ||
  window.location.hostname.includes('vercel.app') ||
  window.location.protocol === 'file:'
);

async function api(method, path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout — prevents hangs on static hosts
  try {
    const opts = { method, headers: { 'Content-Type': 'application/json', 'X-Visitor-Id': state.visitorId }, credentials: 'include', signal: controller.signal };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + path, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, error: err };
  } finally {
    clearTimeout(timeout);
  }
}

// ===== AUTH CHECKS =====
async function checkSession() {
  const { ok, data } = await api('GET', '/api/auth/me');
  if (ok) {
    state.session = data;
    if (data.role === 'admin') { window.location.href = 'admin.html'; return; }
    if (data.roomId) {
      state.roomState = data.state;
      enterRoom();
      return;
    }
  }
}

// ===== LOGIN =====
async function handleJoinRoom(e) {
  e.preventDefault();
  const roomId = document.getElementById('join-room-id').value.trim().toUpperCase();
  const password = document.getElementById('join-password').value.trim();
  const name = document.getElementById('join-name').value.trim();

  // Clear errors
  ['err-room-id','err-join-password','err-join-name','join-error'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.style.display = 'none'; }
  });

  let valid = true;
  if (!roomId) { document.getElementById('err-room-id').style.display = 'block'; valid = false; }
  if (!password) { document.getElementById('err-join-password').style.display = 'block'; valid = false; }
  if (!name) { document.getElementById('err-join-name').style.display = 'block'; valid = false; }
  if (!valid) return;

  const btn = document.getElementById('btn-join');
  btn.classList.add('btn-loading');
  btn.disabled = true;

  const { ok, data } = await api('POST', '/api/auth/login', { roomId, roomPassword: password, displayName: name });

  btn.classList.remove('btn-loading');
  btn.disabled = false;

  if (!ok) {
    const errEl = document.getElementById('join-error');
    errEl.textContent = data.error || 'Failed to join room. Check the code and password.';
    errEl.style.display = 'block';
    return;
  }

  state.session = { userId: data.visitorId, role: data.role, username: name, roomId };
  state.roomState = data.state;
  enterRoom();
}

function clearAdminError() {
  const errEl = document.getElementById('admin-login-error');
  errEl.style.display = 'none';
  document.getElementById('admin-username').classList.remove('input-error');
  document.getElementById('admin-password').classList.remove('input-error');
  document.getElementById('admin-username-error').style.display = 'none';
  document.getElementById('admin-password-error').style.display = 'none';
}

function showAdminLoginError(msg) {
  const errEl = document.getElementById('admin-login-error');
  errEl.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><span>${escHtml(msg)}</span>`;
  errEl.style.display = 'flex';
  // Shake the form
  const form = document.getElementById('admin-login-form');
  form.classList.remove('shake');
  void form.offsetWidth; // reflow to restart animation
  form.classList.add('shake');
  form.addEventListener('animationend', () => form.classList.remove('shake'), { once: true });
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const usernameEl = document.getElementById('admin-username');
  const passwordEl = document.getElementById('admin-password');
  const username = usernameEl.value.trim();
  const password = passwordEl.value;

  // ── FIELD VALIDATION ──────────────────────────────────────────────────────
  let hasError = false;
  clearAdminError();

  if (!username) {
    usernameEl.classList.add('input-error');
    document.getElementById('admin-username-error').style.display = 'block';
    hasError = true;
  }
  if (!password) {
    passwordEl.classList.add('input-error');
    document.getElementById('admin-password-error').style.display = 'block';
    hasError = true;
  }
  if (hasError) {
    const form = document.getElementById('admin-login-form');
    form.classList.remove('shake');
    void form.offsetWidth;
    form.classList.add('shake');
    form.addEventListener('animationend', () => form.classList.remove('shake'), { once: true });
    return;
  }

  const btn = document.getElementById('btn-admin-login');
  btn.classList.add('btn-loading');
  btn.disabled = true;

  // ── STATIC PREVIEW FAST PATH (pplx.app, GitHub Pages, etc.) ─────────────
  if (isStaticPreview) {
    btn.classList.remove('btn-loading');
    btn.disabled = false;
    const storedPassword = localStorage.getItem('bs_admin_pw') || 'BIOShield2026!';
    if (username === 'admin' && password === storedPassword) {
      sessionStorage.setItem('bs_admin_auth', '1');
      toast('Login successful — redirecting...', 'success');
      setTimeout(() => { window.location.href = 'admin.html'; }, 800);
    } else {
      passwordEl.classList.add('input-error');
      showAdminLoginError('Incorrect username or password. Please try again.');
    }
    return;
  }

  // ── BACKEND PATH (Heroku / Hostinger) ─────────────────────────────────────
  const { ok, data } = await api('POST', '/api/auth/login', { username, password });
  btn.classList.remove('btn-loading');
  btn.disabled = false;

  if (ok) {
    toast('Login successful — redirecting...', 'success');
    setTimeout(() => { window.location.href = 'admin.html'; }, 800);
    return;
  }

  if (data && data.error) {
    passwordEl.classList.add('input-error');
    showAdminLoginError(data.error);
    return;
  }

  // Backend returned non-ok with no message — try local credential fallback
  const storedPassword = localStorage.getItem('bs_admin_pw') || 'BIOShield2026!';
  if (username === 'admin' && password === storedPassword) {
    sessionStorage.setItem('bs_admin_auth', '1');
    toast('Login successful — redirecting...', 'success');
    setTimeout(() => { window.location.href = 'admin.html'; }, 800);
  } else {
    passwordEl.classList.add('input-error');
    showAdminLoginError('Incorrect username or password. Please try again.');
  }
}

// ===== ENTER ROOM =====
function enterRoom() {
  if (!state.roomState) return;

  // Decide: waiting room or active exercise
  if (state.roomState.status === 'waiting') {
    showWaitingRoom();
  } else {
    showExercise();
  }
  connectWebSocket();
}

// ===== WAITING ROOM =====
function showWaitingRoom() {
  showScreen('waiting');
  document.getElementById('waiting-room-id').textContent = state.roomState.id || '—';
  document.getElementById('waiting-role').textContent = capitalize(state.session.role || 'Participant');
  renderWaitingMembers();

  // Show start button for leader
  const startSection = document.getElementById('leader-start-section');
  if (state.session.role === 'leader') {
    startSection.style.display = 'block';
  } else {
    startSection.style.display = 'none';
  }
}

function renderWaitingMembers() {
  const members = state.roomState?.members || [];
  const ul = document.getElementById('waiting-members');
  document.getElementById('waiting-member-count').textContent = members.length;
  ul.innerHTML = members.map(m => `
    <li class="member-item">
      <div class="member-avatar">${escHtml((m.name || '?').charAt(0))}</div>
      <span class="member-name">${escHtml(m.name)}</span>
      <span class="badge ${m.role === 'leader' ? 'badge-green' : 'badge-gray'} member-role">${m.role === 'leader' ? 'Leader' : 'Participant'}</span>
    </li>
  `).join('');
}

function leaderStartExercise() {
  // The exercise starts when the admin starts it — but if room is already active,
  // we just transition. Otherwise, as leader, we can signal readiness via WS.
  if (state.ws && state.ws.readyState === 1) {
    state.ws.send(JSON.stringify({ type: 'join-room', roomId: state.roomState.id, visitorId: state.visitorId, name: state.session.username }));
  }
  showExercise();
}

function handleLeaveRoom() {
  if (!confirm('Are you sure you want to leave the exercise?')) return;
  api('POST', '/api/auth/logout');
  stopRoomTimer();
  if (state.ws) { state.ws.close(); state.ws = null; }
  if (state.jitsiApi) { try { state.jitsiApi.dispose(); } catch(e){} state.jitsiApi = null; }
  state.session = null;
  state.roomState = null;
  showScreen('home');
}

// ===== EXERCISE SCREEN =====
// ===== LIVE ROOM TIMER =====
function startRoomTimer(startedAt) {
  stopRoomTimer();
  state.roomStartedAt = startedAt || Date.now();

  function tick() {
    const elapsed = Date.now() - state.roomStartedAt;
    const totalSec = Math.floor(elapsed / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = n => String(n).padStart(2, '0');
    const display = h > 0
      ? `${pad(h)}:${pad(m)}:${pad(s)}`
      : `${pad(m)}:${pad(s)}`;
    const el = document.getElementById('ex-timer-value');
    if (el) el.textContent = display;
  }

  tick(); // immediate first render
  state.roomTimerInterval = setInterval(tick, 1000);
}

function stopRoomTimer() {
  if (state.roomTimerInterval) {
    clearInterval(state.roomTimerInterval);
    state.roomTimerInterval = null;
  }
  const el = document.getElementById('ex-timer-value');
  if (el) el.textContent = '00:00';
}

function showExercise() {
  showScreen('exercise');
  // Update topbar badges
  document.getElementById('ex-room-badge').textContent = state.roomState?.id || '';
  document.getElementById('ex-role-badge').textContent = capitalize(state.session?.role || 'Participant');

  // Start live elapsed timer — use server startedAt if available, else now
  const startedAt = state.roomState?.startedAt || Date.now();
  startRoomTimer(startedAt);

  renderPhaseProgress();
  renderPhaseContent();
  renderExMembers();
  initJitsi();
}

function renderPhaseProgress() {
  const history = state.roomState?.phaseHistory || [];
  const current = state.roomState?.currentPhaseId || 'phase1';
  const phaseNum = state.roomState?.currentPhase?.phaseNumber || 1;

  const container = document.getElementById('phase-progress');
  const steps = [];
  for (let i = 1; i <= 6; i++) {
    const done = i < phaseNum;
    const cur = i === phaseNum;
    steps.push(`
      <div class="phase-step ${done ? 'done' : ''} ${cur ? 'current' : ''}">
        <div class="phase-dot">${done ? '✓' : i}</div>
        <div class="phase-label">Phase ${i}</div>
      </div>
    `);
  }
  container.innerHTML = steps.join('');
}

function renderPhaseContent() {
  const phase = state.roomState?.currentPhase;
  const card = document.getElementById('phase-card');

  if (!phase) {
    card.innerHTML = `<div class="phase-body"><p class="text-muted">Loading phase data...</p></div>`;
    return;
  }

  const isLeader = state.session?.role === 'leader';

  // Check if current phase already has a submission
  const phaseId = state.roomState?.currentPhaseId;
  const submission = state.roomState?.submissions?.[phaseId];

  const narrativeHtml = (phase.narrative || []).map(n => `<li>${escHtml(n)}</li>`).join('');

  let actionHtml = '';
  if (submission && submission.analysis) {
    // Show analysis result
    actionHtml = renderAnalysisResult(submission, isLeader);
  } else if (isLeader) {
    // Show response textarea
    actionHtml = `
      <div class="response-section">
        <h4>Your Team's Response</h4>
        <p class="response-guidance" style="font-size:0.82rem; color:var(--text-dim); margin-bottom:0.625rem; line-height:1.55;">
          Write a full paragraph describing your team's actions. Use complete sentences — not bullet points or keywords.
        </p>
        <textarea id="response-textarea" class="form-textarea" placeholder="e.g. Our team would immediately notify the relevant state biosecurity authority and request a specialist plant pathologist to confirm the identification. We would then establish a quarantine boundary around the affected area..." maxlength="3000" oninput="updateWordCounter(this)"></textarea>
        <div class="char-counter" id="word-counter">0 words — write at least 20 words</div>
        <div id="response-validation-error" class="form-error" style="display:none;"></div>
        <div class="response-actions">
          <button class="btn btn-primary" id="btn-submit-answer" onclick="submitAnswer()" disabled>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            Submit Response
          </button>

        </div>
      </div>
    `;
  } else {
    // Participant view
    actionHtml = `
      <div class="participant-view">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-dim); margin:0 auto;"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        <p>Discuss with your team. The <strong>Team Leader</strong> will submit the team's response.</p>
      </div>
    `;
  }

  card.innerHTML = `
    <div class="phase-header">
      <div>
        <div class="phase-tag">Phase ${phase.phaseNumber}</div>
        <h2 class="phase-title">${escHtml(phase.title)}</h2>
      </div>
      ${state.roomState?.status === 'completed' ? '<span class="badge badge-green">Completed</span>' : ''}
    </div>
    <div class="phase-body">
      <div class="narrative-section">
        <h4>Situation Report</h4>
        <ul class="narrative-list">${narrativeHtml}</ul>
      </div>
      <div class="question-box">
        <p>${escHtml(phase.question || 'What are your team\'s immediate actions?')}</p>
      </div>
      ${actionHtml}
    </div>
  `;
}

function renderAnalysisResult(submission, isLeader) {
  const a = submission.analysis;
  const score = a.score || 0;
  // Dynamic max: read from phaseHistory entry; fall back to 3
  const phaseId = state.roomState?.currentPhaseId;
  const histEntry = (state.roomState?.phaseHistory || []).find(p => p.phaseId === phaseId);
  const maxScore = histEntry?.maxPhaseScore || 3;
  const stars = Array.from({length: maxScore}, (_, i) =>
    `<span class="star ${i < score ? 'filled score-'+score : ''}">★</span>`
  ).join('');
  const mentioned = (a.mentioned || []).map(e => `<div class="element-item">${escHtml(e)}</div>`).join('') || '<div class="element-item text-dim">None</div>';
  const missed = (a.missed || []).map(e => `<div class="element-item">${escHtml(e)}</div>`).join('') || '<div class="element-item text-dim">None — great work!</div>';

  // Score label based on percentage
  const pct = maxScore > 0 ? score / maxScore : 0;
  const scoreLabel = pct >= 1 ? 'Excellent Response' : pct >= 0.67 ? 'Good Response' : pct >= 0.33 ? 'Partial Response' : 'Needs Significant Improvement';
  const scoreColour = pct >= 1 ? 'green' : pct >= 0.5 ? 'amber' : 'red';

  // Next phase button (leader only)
  let nextAction = '';
  if (isLeader) {
    if (a.nextPhaseId && state.roomState?.currentPhase?.phaseNumber < 6) {
      nextAction = `<button class="btn btn-primary" onclick="advancePhase('${escHtml(a.nextPhaseId)}')">
        Continue to Next Phase →
      </button>`;
    } else if (state.roomState?.currentPhase?.phaseNumber >= 6) {
      nextAction = `<button class="btn btn-primary" onclick="completeExercise()">
        Complete Exercise ✓
      </button>`;
    }
  } else {
    nextAction = `<span class="text-muted text-sm">Waiting for Team Leader to advance...</span>`;
  }

  return `
    <div class="analysis-result">
      <div class="analysis-header score-${score}">
        <div class="score-display">
          <span class="score-value text-${scoreColour}">${score}</span>
          <span class="score-max">/${maxScore}</span>
          <div class="score-stars">${stars}</div>
        </div>
        <div style="text-align:right;">
          <div class="fw-700">${escHtml(scoreLabel)}</div>
          <div class="ai-badge">${a.aiPowered ? '✨ AI Analysis' : '🔑 Keyword Analysis'}</div>
        </div>
      </div>
      <div class="analysis-body">
        <div class="analysis-assessment">${escHtml(a.assessment || '')}</div>
        <div class="elements-grid">
          <div class="elements-list covered">
            <h5>✓ Addressed</h5>
            ${mentioned}
          </div>
          <div class="elements-list missed">
            <h5>✗ Missed</h5>
            ${missed}
          </div>
        </div>
        <div style="font-size:0.8125rem; color:var(--text-dim); margin-bottom:0.5rem;">
          Response by: <strong>${escHtml(submission.submittedByName || 'Team Leader')}</strong>
        </div>
      </div>
      <div class="analysis-footer">
        ${nextAction}
        <div class="text-sm text-muted" id="next-phase-hint"></div>
      </div>
    </div>
  `;
}

// ── Word-count indicator + submit gating ──────────────────────
function countWords(text) {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

function updateWordCounter(el) {
  const counter = document.getElementById('word-counter');
  const btn = document.getElementById('btn-submit-answer');
  const words = countWords(el.value);
  const MIN_WORDS = 20;

  if (!counter) return;

  if (words < MIN_WORDS) {
    counter.textContent = `${words} word${words !== 1 ? 's' : ''} — write at least ${MIN_WORDS} words`;
    counter.className = 'char-counter';
    if (btn) btn.disabled = true;
  } else if (words > 400) {
    counter.textContent = `${words} words (keep it concise)`;
    counter.className = 'char-counter warn';
    if (btn) btn.disabled = false;
  } else {
    counter.textContent = `${words} words ✔`;
    counter.className = 'char-counter ok';
    if (btn) btn.disabled = false;
  }

  // Clear any previous validation error when user types
  const errEl = document.getElementById('response-validation-error');
  if (errEl) errEl.style.display = 'none';
}

// ── Anti-cheat: detect pure keywords or prompt injection ───────
function detectAntiCheat(text) {
  const t = text.trim();

  // Check for prompt injection patterns
  const injectionPatterns = [
    /ignore (previous|prior|above|all) (instructions?|prompt|rules?)/i,
    /you are (now|a|an) /i,
    /pretend (you are|to be|that)/i,
    /act as (a|an|if)/i,
    /disregard (all|previous|prior)/i,
    /system prompt/i,
    /\[INST\]|<\|im_start\|>|<\|system\|>/i,
    /jailbreak/i,
  ];
  for (const pat of injectionPatterns) {
    if (pat.test(t)) return { cheat: true, reason: 'Response appears to contain a prompt injection attempt. Please write a genuine response describing your team\'s biosecurity actions.' };
  }

  // Check if it's just comma/semicolon separated keywords (no sentences)
  const sentences = t.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const hasSentences = sentences.some(s => s.trim().split(/\s+/).length >= 5);
  if (!hasSentences) {
    // Could be pure keyword list
    const commaRatio = (t.match(/,/g) || []).length / Math.max(1, t.split(/\s+/).length);
    if (commaRatio > 0.2) {
      return { cheat: true, reason: 'Please write your answer in full sentences, not as a list of keywords or comma-separated terms.' };
    }
  }

  return { cheat: false };
}

async function validateInput() {
  const text = document.getElementById('response-textarea')?.value?.trim();
  if (!text) { toast('Please enter a response first', 'error'); return; }
  const { ok, data } = await api('POST', '/api/validate', { text });
  if (ok) {
    if (data.valid) toast('Response looks good!', 'success');
    else { toast(data.error, 'error'); document.getElementById('response-validation-error').textContent = data.error; document.getElementById('response-validation-error').style.display = 'block'; }
  }
}

function submitAnswer() {
  const text = document.getElementById('response-textarea')?.value?.trim();
  const errEl = document.getElementById('response-validation-error');

  // Word count gate
  if (!text || countWords(text) < 20) {
    const msg = 'Please write at least 20 words in your response before submitting.';
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    toast(msg, 'error');
    return;
  }

  // Anti-cheat check
  const cheat = detectAntiCheat(text);
  if (cheat.cheat) {
    if (errEl) { errEl.textContent = cheat.reason; errEl.style.display = 'block'; }
    toast(cheat.reason, 'error');
    return;
  }

  if (errEl) errEl.style.display = 'none';

  if (!state.ws || state.ws.readyState !== 1) { toast('Not connected — reconnecting...', 'error'); connectWebSocket(); return; }

  const btn = document.getElementById('btn-submit-answer');
  if (btn) { btn.classList.add('btn-loading'); btn.disabled = true; }

  state.ws.send(JSON.stringify({ type: 'submit-answer', text }));
}

function advancePhase(nextPhaseId) {
  if (!state.ws || state.ws.readyState !== 1) { toast('Not connected', 'error'); return; }
  state.ws.send(JSON.stringify({ type: 'advance-phase', nextPhaseId }));
}

function completeExercise() {
  if (!confirm('Mark this exercise as complete?')) return;
  if (!state.ws || state.ws.readyState !== 1) { toast('Not connected', 'error'); return; }
  state.ws.send(JSON.stringify({ type: 'complete-exercise' }));
}

function renderExerciseComplete() {
  const history = state.roomState?.phaseHistory || [];
  const total = history.reduce((s, p) => s + (p.score || 0), 0);
  // Dynamic max: sum each phase's actual maxPhaseScore (not always *3)
  const max = history.reduce((s, p) => s + (p.maxPhaseScore || 3), 0);
  const pct = max > 0 ? Math.round((total / max) * 100) : 0;
  const grade = pct >= 90 ? 'Excellent' : pct >= 70 ? 'Good' : pct >= 50 ? 'Satisfactory' : 'Developing';
  const scenarioTitle = state.roomState?.scenarioTitle || 'Biosecurity Exercise';

  document.getElementById('phase-card').innerHTML = `
    <div class="phase-body complete-card">
      <div class="complete-icon">${pct >= 70 ? '🏆' : '📋'}</div>
      <h2>Exercise Complete!</h2>
      <p style="margin-top:0.5rem;">${escHtml(scenarioTitle)}</p>
      <div class="score-summary">
        <div class="score-summary-item">
          <div class="score-summary-value">${total}/${max}</div>
          <div class="score-summary-label">Total Score</div>
        </div>
        <div class="score-summary-item">
          <div class="score-summary-value">${pct}%</div>
          <div class="score-summary-label">Performance</div>
        </div>
        <div class="score-summary-item">
          <div class="score-summary-value">${history.length}</div>
          <div class="score-summary-label">Phases Completed</div>
        </div>
      </div>
      <div class="badge ${pct>=70?'badge-green':'badge-amber'}" style="margin: 0.5rem auto; font-size:1rem; padding: 0.5rem 1.25rem;">${grade}</div>
      <div style="margin-top:1.5rem;">
        <h3 style="margin-bottom:0.75rem; font-size:0.95rem;">Phase History</h3>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          ${history.map(p => {
            const mx = p.maxPhaseScore || 3;
            const badgeCls = p.score >= mx ? 'badge-green' : p.score >= Math.ceil(mx/2) ? 'badge-amber' : 'badge-red';
            return `
            <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg3); padding:0.625rem 1rem; border-radius:8px;">
              <span style="font-size:0.875rem; color:var(--text-muted);">${escHtml(p.phaseTitle || p.phaseId)}</span>
              <span class="badge ${badgeCls}">${p.score}/${mx}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div style="display:flex; gap:0.75rem; justify-content:center; margin-top:1.25rem; flex-wrap:wrap;">
        <button class="btn btn-primary" onclick="downloadGamePDF()">&#128427; Save PDF Report</button>
        <button class="btn btn-secondary" onclick="handleLeaveRoom()">Exit Exercise</button>
      </div>
    </div>
  `;
}

// ===== USER PDF REPORT =====
async function downloadGamePDF() {
  const history = state.roomState?.phaseHistory || [];
  const roomId  = state.roomState?.id || 'unknown';
  const scenarioTitle = state.roomState?.scenarioTitle || 'Biosecurity Exercise';
  const scenarioId    = state.roomState?.scenarioId || '';
  const completedAt   = new Date().toLocaleString();

  const total = history.reduce((s, p) => s + (p.score || 0), 0);
  const max   = history.reduce((s, p) => s + (p.maxPhaseScore || 3), 0);
  const pct   = max > 0 ? Math.round((total / max) * 100) : 0;
  const grade = pct >= 80 ? 'Excellent' : pct >= 60 ? 'Good' : pct >= 40 ? 'Adequate' : 'Developing';
  const gradeColor = pct >= 80 ? '#059669' : pct >= 60 ? '#0284c7' : pct >= 40 ? '#d97706' : '#dc2626';

  // Helper: format duration ms -> e.g. "2m 34s"
  function fmtDur(ms) {
    if (!ms || ms <= 0) return '—';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  // Total time: sum of all phase timeTakenMs
  const totalMs = history.reduce((s, p) => s + (p.timeTakenMs || 0), 0);

  // Fetch references via public route (fall back gracefully if none)
  let references = [];
  if (scenarioId) {
    try {
      const scRes = await fetch(`/api/scenario/${encodeURIComponent(scenarioId)}/references`);
      if (scRes.ok) {
        const scData = await scRes.json();
        if (Array.isArray(scData.references)) references = scData.references;
      }
    } catch(e) { /* skip */ }
  }

  const phaseRows = history.map((p, i) => {
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
          ${p.timeTakenMs ? `<span class="phase-time">${fmtDur(p.timeTakenMs)}</span>` : ''}
        </div>
        ${p.question ? `<div class="phase-question"><strong>Question:</strong> ${escHtml(p.question)}</div>` : ''}
        <div class="phase-submission">
          <div class="sub-label">Team Response${p.submittedByName ? ` (submitted by ${escHtml(p.submittedByName)})` : ''}:</div>
          <div class="sub-text">${submissionText}</div>
        </div>
        ${p.assessment ? `<div class="phase-assessment">ℹ️ ${escHtml(p.assessment)}</div>` : ''}
        <div class="phase-elements">
          ${mentioned ? `<div class="el-section el-good"><div class="el-label">✓ Addressed</div><ul>${mentioned}</ul></div>` : ''}
          ${missed    ? `<div class="el-section el-miss"><div class="el-label">✕ Missed</div><ul>${missed}</ul></div>` : ''}
        </div>
        ${p.aiPowered ? '<div class="ai-badge">AI-powered analysis</div>' : ''}
      </div>`;
  }).join('');

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
<title>BIOShield Exercise Report — Room ${escHtml(roomId)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1e293b; background: #fff; }
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
    <div class="logo">BIO<span>Shield</span></div>
    <div class="cover-sub">Australian Biosecurity Exercise Simulator</div>
    <div class="report-title">Exercise Feedback Report</div>
    <div class="meta-grid">
      <div class="meta-item"><span class="meta-label">Room</span><span class="meta-value">${escHtml(roomId)}</span></div>
      <div class="meta-item"><span class="meta-label">Scenario</span><span class="meta-value">${escHtml(scenarioTitle)}</span></div>
      <div class="meta-item"><span class="meta-label">Participants</span><span class="meta-value">${(state.roomState?.members || []).map(m => escHtml(m.name || '')).filter(Boolean).join(', ') || '—'}</span></div>
      <div class="meta-item"><span class="meta-label">Completed</span><span class="meta-value">${escHtml(completedAt)}</span></div>
    </div>
  </div>

  <div class="summary-box">
    <div class="stat-box">
      <div class="stat-val" style="color:${gradeColor}">${pct}%</div>
      <div class="stat-lbl">Overall Score</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${total}/${max}</div>
      <div class="stat-lbl">Points</div>
    </div>
    <div class="stat-box">
      <div class="stat-val" style="color:${gradeColor}">${grade}</div>
      <div class="stat-lbl">Grade</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${fmtDur(totalMs)}</div>
      <div class="stat-lbl">Total Time</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${history.length}</div>
      <div class="stat-lbl">Phases</div>
    </div>
  </div>

  <div class="section-title">Phase-by-Phase Feedback</div>
  ${phaseRows || '<p style="color:#94a3b8; font-style:italic;">No phase data recorded.</p>'}

  ${referencesHtml}

  <div class="footer">
    <span>Generated by BIOShield — ${escHtml(completedAt)}</span>
    <span>Room: ${escHtml(roomId)}</span>
  </div>
</div>
<div class="pdf-action-bar">
  <button class="pdf-btn pdf-btn-close" onclick="window.close()">Close</button>
  <button class="pdf-btn pdf-btn-save" onclick="window.print()">&#128427; Save as PDF</button>
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Please allow popups to save the PDF report', 'error', 6000); return; }
  win.document.write(html);
  win.document.close();
  toast('Report ready — click \'Save as PDF\' in the opened window', 'info', 4000);
}

function renderExMembers() {
  const members = state.roomState?.members || [];
  const leader = state.roomState?.leader;
  document.getElementById('ex-member-count').textContent = `${members.length} online`;
  document.getElementById('ex-members').innerHTML = members.map(m => `
    <li class="member-item">
      <div class="member-avatar">${escHtml((m.name||'?').charAt(0))}</div>
      <span class="member-name">${escHtml(m.name)}</span>
      <span class="badge ${m.visitorId === leader || m.role === 'leader' ? 'badge-green' : 'badge-gray'} member-role">${m.visitorId === leader || m.role === 'leader' ? 'Leader' : 'Participant'}</span>
    </li>
  `).join('');
}

function showAnalyzing(submittedBy) {
  const card = document.getElementById('phase-card');
  const body = card.querySelector('.phase-body');
  if (!body) return;
  const existing = body.querySelector('.analysis-result, .response-section, .participant-view');
  if (existing) existing.remove();
  body.insertAdjacentHTML('beforeend', `
    <div class="analyzing-overlay" id="analyzing-overlay">
      <div class="analyzing-spinner"></div>
      <p class="fw-700">Analysing response...</p>
      <p class="text-sm text-muted" style="margin-top:0.25rem;">Submitted by ${escHtml(submittedBy || 'Team Leader')}</p>
    </div>
  `);
}

// ===== JITSI MEET =====
// meet.jit.si blocks third-party iframe embeds as of 2023.
// Solution: use a plain <iframe> pointing directly to meet.jit.si/<room>
// which works without the IFrame API, plus an "Open in tab" fallback.
// If a JaaS App ID is configured (JAAS_APP_ID), use 8x8.vc instead —
// that fully supports embedded iframes with no restrictions.

// Optional: set window.JAAS_APP_ID = 'your-app-id' in a config script
// to switch to JaaS (https://jaas.8x8.vc). Leave undefined for free embed.
const JITSI_ALLOW = 'camera; microphone; display-capture; fullscreen; autoplay; clipboard-write';

function initJitsi() {
  if (!state.roomState?.id) return;
  const roomName = 'bioshield-' + state.roomState.id.toLowerCase();
  const container = document.getElementById('jitsi-container');
  if (!container) return;

  // Remove placeholder
  document.getElementById('jitsi-placeholder')?.remove();
  // Clear any previous Jitsi instance
  if (state.jitsiApi) { try { state.jitsiApi.dispose(); } catch(e){} state.jitsiApi = null; }
  container.innerHTML = '';

  if (window.JAAS_APP_ID) {
    // ─ JaaS path: full IFrame API, no embedding restrictions ───────────
    loadJaaSJitsi(container, roomName);
  } else {
    // ─ Free path: plain iframe — works around meet.jit.si embed block ─
    startJitsiFreeIframe(container, roomName);
  }
}

// ─── FREE TIER: plain <iframe> ─────────────────────────────────────────────
function startJitsiFreeIframe(container, roomName) {
  const meetUrl = `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false&config.startWithAudioMuted=true&userInfo.displayName=${encodeURIComponent(state.session?.username || 'Participant')}`;

  const iframe = document.createElement('iframe');
  iframe.src = meetUrl;
  iframe.allow = JITSI_ALLOW;
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:8px;background:#000;';
  iframe.title = 'BIOShield Video Conference';

  // Remove stale links before adding new one (prevents duplicates on re-render)
  const jitsiParent = container.parentNode;
  if (jitsiParent) jitsiParent.querySelectorAll('.jitsi-open-btn').forEach(el => el.remove());

  const openBtn = document.createElement('a');
  openBtn.href = meetUrl;
  openBtn.target = '_blank';
  openBtn.rel = 'noopener noreferrer';
  openBtn.className = 'jitsi-open-btn';
  openBtn.style.cssText = 'display:block;text-align:center;font-size:0.75rem;color:var(--green);margin-top:6px;text-decoration:underline;cursor:pointer;';
  openBtn.textContent = 'Open video in new tab ⇗';

  container.appendChild(iframe);
  jitsiParent && jitsiParent.appendChild(openBtn);
}

// ─── JAAS TIER: full IFrame API on 8x8.vc ────────────────────────────────
function loadJaaSJitsi(container, roomName) {
  const scriptSrc = 'https://8x8.vc/external_api.js';
  const doInit = () => startJaaSJitsi(container, roomName);
  if (window.JitsiMeetExternalAPI) { doInit(); return; }
  const script = document.createElement('script');
  script.src = scriptSrc;
  script.onload = doInit;
  script.onerror = () => startJitsiFreeIframe(container, roomName); // fallback
  document.head.appendChild(script);
}

function startJaaSJitsi(container, roomName) {
  try {
    state.jitsiApi = new JitsiMeetExternalAPI('8x8.vc', {
      roomName: `${window.JAAS_APP_ID}/${roomName}`,
      parentNode: container,
      width: '100%',
      height: '100%',
      userInfo: { displayName: state.session?.username || 'Participant' },
      configOverwrite: {
        startWithAudioMuted: true,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        p2p: { enabled: true },
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: ['microphone', 'camera', 'hangup', 'chat', 'raisehand', 'fullscreen'],
        SHOW_JITSI_WATERMARK: false,
        SHOW_BRAND_WATERMARK: false,
        SHOW_POWERED_BY: false,
      },
    });
    // Ensure iframe permissions are set
    const f = container.querySelector('iframe');
    if (f) { f.allow = JITSI_ALLOW; f.allowFullscreen = true; }
  } catch (err) {
    console.warn('JaaS init failed, falling back:', err.message);
    startJitsiFreeIframe(container, roomName);
  }
}

// ===== CHAT =====
function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const text = input?.value?.trim();
  if (!text) return;
  if (!state.ws || state.ws.readyState !== 1) { toast('Not connected', 'error'); return; }
  state.ws.send(JSON.stringify({ type: 'chat', text }));
  input.value = '';
}

function addChatMessage(msg, isSystem = false) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const time = new Date(msg.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const el = document.createElement('div');
  el.className = 'chat-msg' + (isSystem ? ' system' : '');
  el.innerHTML = isSystem
    ? `<div class="chat-msg-text">${escHtml(msg.text || msg)}</div>`
    : `<div class="chat-msg-name">${escHtml(msg.name || 'Unknown')}</div><div class="chat-msg-text">${escHtml(msg.text)}</div><div class="chat-msg-time">${time}</div>`;
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function loadChatHistory(messages) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  container.innerHTML = '';
  (messages || []).forEach(m => addChatMessage(m));
}

// ===== WEBSOCKET =====
function connectWebSocket() {
  if (state.ws) { try { state.ws.close(); } catch(e){} }

  const wsUrl = API.replace(/^http/, 'ws') + '/ws';
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    console.log('WS connected');
    if (state.wsReconnectTimer) { clearTimeout(state.wsReconnectTimer); state.wsReconnectTimer = null; }
    // Join room
    if (state.roomState?.id) {
      state.ws.send(JSON.stringify({ type: 'join-room', roomId: state.roomState.id, visitorId: state.visitorId, name: state.session?.username || 'Anonymous' }));
    }
  };

  state.ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleWsMessage(msg);
  };

  state.ws.onclose = () => {
    console.log('WS closed — reconnecting in 3s');
    state.wsReconnectTimer = setTimeout(() => { if (state.roomState) connectWebSocket(); }, 3000);
  };

  state.ws.onerror = (err) => {
    console.warn('WS error:', err);
  };
}

function handleWsMessage(msg) {
  switch (msg.type) {
    case 'room-state':
      state.roomState = msg.state;
      if (state.screen === 'exercise') {
        renderPhaseProgress();
        renderPhaseContent();
        renderExMembers();
        loadChatHistory(msg.state?.chat);
      } else if (state.screen === 'waiting') {
        renderWaitingMembers();
        // Auto-advance if status changed to active
        if (msg.state?.status === 'active') showExercise();
      }
      break;

    case 'member-joined':
      state.roomState = msg.state;
      if (state.screen === 'exercise') { renderExMembers(); }
      else if (state.screen === 'waiting') { renderWaitingMembers(); }
      addChatMessage({ text: `${msg.member?.name} joined the exercise` }, true);
      break;

    case 'member-left':
      state.roomState = msg.state;
      if (state.screen === 'exercise') renderExMembers();
      addChatMessage({ text: `${msg.name} left the exercise` }, true);
      break;

    case 'leader-changed':
      state.roomState = msg.state;
      // Update own role if we're the new leader
      if (msg.leader === state.visitorId) {
        state.session.role = 'leader';
        document.getElementById('ex-role-badge').textContent = 'Leader';
        toast('You are now the Team Leader', 'success');
      }
      if (state.screen === 'exercise') { renderExMembers(); renderPhaseContent(); }
      break;

    case 'chat':
      addChatMessage(msg.message);
      break;

    case 'analyzing':
      showAnalyzing(msg.submittedBy);
      break;

    case 'analysis-result':
      state.roomState = msg.state;
      // Re-render with the analysis
      if (state.screen === 'exercise') {
        renderPhaseProgress();
        renderPhaseContent();
      }
      break;

    case 'phase-changed':
      state.roomState = msg.state;
      if (state.screen === 'exercise') {
        renderPhaseProgress();
        renderPhaseContent();
        addChatMessage({ text: `Moving to: ${msg.state?.currentPhase?.title || msg.phaseId}` }, true);
      }
      break;

    case 'exercise-complete':
      state.roomState = msg.state;
      if (state.screen === 'exercise') {
        renderPhaseProgress();
        renderExerciseComplete();
      }
      break;

    case 'validation-error':
      const errEl = document.getElementById('response-validation-error');
      if (errEl) { errEl.textContent = msg.error; errEl.style.display = 'block'; }
      const btn = document.getElementById('btn-submit-answer');
      if (btn) { btn.classList.remove('btn-loading'); btn.disabled = false; }
      toast(msg.error, 'error');
      break;

    case 'error':
      toast(msg.error || 'An error occurred', 'error');
      break;
  }
}

// ===== UTILS =====
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});
