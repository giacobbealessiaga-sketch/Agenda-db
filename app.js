const DAYS = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const DAYS_FULL = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const MONTHS_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MFULL = MONTHS_FULL;

// ── STORAGE ───────────────────────────────────────────────────────
// db: { [dayKey]: htmlString }
// ps_local_ts: { [dayKey]: timestamp } — when key was last edited locally
// ps_sync_ts: { [dayKey]: timestamp } — when key was last successfully synced
// ps_cache: serialized db
// sb_session: auth session

let db = JSON.parse(localStorage.getItem('ps_cache') || '{}');
let session = JSON.parse(localStorage.getItem('sb_session') || 'null');

function dayKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// Check if HTML content is effectively empty
function isEmptyHtml(html) {
  if (!html) return true;
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim();
  return text === '';
}

// Save to localStorage immediately — always called on every input
function localSave(key, html) {
  if (html && !isEmptyHtml(html)) {
    db[key] = html;
  } else {
    delete db[key];
  }
  localStorage.setItem('ps_cache', JSON.stringify(db));
  // Record edit timestamp
  const ts = JSON.parse(localStorage.getItem('ps_local_ts') || '{}');
  ts[key] = Date.now();
  localStorage.setItem('ps_local_ts', JSON.stringify(ts));
}


// Sync using sendBeacon — survives page close/navigation
// Used on blur and visibilitychange to guarantee delivery
function syncKeyBeacon(key) {
  if (!session) return;
  // Use keepalive fetch — survives page close on mobile and desktop
  const content = db[key] || null;
  setSyncState('syncing');
  if (content && !isEmptyHtml(content)) {
    // UPSERT: delete then insert to avoid duplicate key errors
    fetch('https://grmfbbqujopstaagknuc.supabase.co/rest/v1/agenda?user_id=eq.' + session.userId + '&day_key=eq.' + key, {
      method: 'DELETE',
      headers: {
        'apikey': 'sb_publishable_S5LYjuFe5m4ieS6BNZXz5A_-E7kuxuK',
        'Authorization': 'Bearer ' + session.token
      },
      keepalive: true
    }).then(() => {
      return fetch('https://grmfbbqujopstaagknuc.supabase.co/rest/v1/agenda', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': 'sb_publishable_S5LYjuFe5m4ieS6BNZXz5A_-E7kuxuK',
          'Authorization': 'Bearer ' + session.token
        },
        body: JSON.stringify({ user_id: session.userId, day_key: key, content: content, updated_at: new Date().toISOString() }),
        keepalive: true
      });
    }).then(r => {
      if (r.ok) {
        const ts = JSON.parse(localStorage.getItem('ps_sync_ts') || '{}');
        ts[key] = Date.now();
        localStorage.setItem('ps_sync_ts', JSON.stringify(ts));
        setSyncState('ok');
      } else { setSyncState('error'); }
    }).catch(() => setSyncState('error'));
  } else {
    fetch('https://grmfbbqujopstaagknuc.supabase.co/rest/v1/agenda?user_id=eq.' + session.userId + '&day_key=eq.' + key, {
      method: 'DELETE',
      headers: {
        'apikey': 'sb_publishable_S5LYjuFe5m4ieS6BNZXz5A_-E7kuxuK',
        'Authorization': 'Bearer ' + session.token
      },
      keepalive: true
    }).then(() => setSyncState('ok')).catch(() => setSyncState('error'));
  }
}

// Sync to Supabase — called debounced or on blur/visibilitychange
async function syncKey(key) {
  if (!session) return;
  setSyncState('syncing');
  try {
    if (db[key]) {
      const ok = await sb.upsertDay(session.token, session.userId, key, db[key]);
      if (!ok) throw new Error('upsert failed');
    } else {
      await sb.deleteDay(session.token, session.userId, key);
    }
    // Record sync timestamp
    const ts = JSON.parse(localStorage.getItem('ps_sync_ts') || '{}');
    ts[key] = Date.now();
    localStorage.setItem('ps_sync_ts', JSON.stringify(ts));
    setSyncState('ok');
  } catch(e) {
    setSyncState('error');
  }
}

// Sync all pending keys (local_ts > sync_ts)
async function syncAllPending() {
  if (!session) return;
  const localTs = JSON.parse(localStorage.getItem('ps_local_ts') || '{}');
  const syncTs = JSON.parse(localStorage.getItem('ps_sync_ts') || '{}');
  const pending = Object.keys(localTs).filter(k => !syncTs[k] || localTs[k] > syncTs[k]);
  for (const key of pending) {
    await syncKey(key);
  }
}

// ── AUTH ──────────────────────────────────────────────────────────
function showTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('form-signup').style.display = tab === 'signup' ? 'block' : 'none';
}

document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');
  if (!email || !password) { errEl.textContent = 'Inserisci email e password.'; return; }
  btn.disabled = true; btn.textContent = 'Accesso...'; errEl.textContent = '';
  const res = await sb.signIn(email, password);
  btn.disabled = false; btn.textContent = 'Accedi';
  if (res.error) { errEl.textContent = res.error.message || 'Errore di accesso.'; return; }
  session = { token: res.access_token, refreshToken: res.refresh_token, userId: res.user.id, email: res.user.email };
  localStorage.setItem('sb_session', JSON.stringify(session));
  await startApp();
});

document.getElementById('btn-signup').addEventListener('click', async () => {
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const errEl = document.getElementById('signup-error');
  const msgEl = document.getElementById('signup-msg');
  const btn = document.getElementById('btn-signup');
  if (!email || !password) { errEl.textContent = 'Inserisci email e password.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password minimo 6 caratteri.'; return; }
  btn.disabled = true; btn.textContent = 'Registrazione...'; errEl.textContent = ''; msgEl.textContent = '';
  const res = await sb.signUp(email, password);
  btn.disabled = false; btn.textContent = 'Crea account';
  if (res.error) { errEl.textContent = res.error.message || 'Errore di registrazione.'; return; }
  msgEl.textContent = 'Account creato! Controlla la tua email per confermare, poi accedi.';
});

// ── START APP ─────────────────────────────────────────────────────
async function startApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  const emailEl = document.getElementById('hdr-email');
  const menuEmailEl = document.getElementById('menu-email');
  if (emailEl) emailEl.textContent = session.email ? session.email.split('@')[0] : '';
  if (menuEmailEl) menuEmailEl.textContent = session.email || '';

  wireDayViewEvents();
  renderWeek(); // show immediately with cached data

  // On startup: cloud is ALWAYS source of truth — reset local timestamps
  localStorage.removeItem('ps_local_ts');
  localStorage.removeItem('ps_sync_ts');

  setSyncState('syncing');
  try {
    const rows = await sb.getAllDays(session.token, session.userId);
    if (Array.isArray(rows)) {
      db = {};
      rows.forEach(r => { if (r.content && !isEmptyHtml(r.content)) db[r.day_key] = r.content; });
      localStorage.setItem('ps_cache', JSON.stringify(db));
    }
    setSyncState('ok');
    renderWeek();
  } catch(e) {
    console.log('Cloud load error:', e);
    setSyncState('error');
  }
  startTokenRefresh();
  startPolling();
}

// Auto-login
(async () => {
  if (session && session.token && session.userId) {
    try {
      // Refresh token first
      if (session.refreshToken) {
        const r = await fetch('https://grmfbbqujopstaagknuc.supabase.co/auth/v1/token?grant_type=refresh_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_S5LYjuFe5m4ieS6BNZXz5A_-E7kuxuK' },
          body: JSON.stringify({ refresh_token: session.refreshToken })
        });
        const data = await r.json();
        if (data.access_token) {
          session.token = data.access_token;
          if (data.refresh_token) session.refreshToken = data.refresh_token;
          localStorage.setItem('sb_session', JSON.stringify(session));
        }
      }
      await startApp();
      return;
    } catch(e) { console.log('Auto-login error:', e); }
  }
  document.getElementById('auth-screen').style.display = 'flex';
})();

// ── TOKEN REFRESH ─────────────────────────────────────────────────
function startTokenRefresh() {
  setInterval(async () => {
    if (!session || !session.refreshToken) return;
    try {
      const r = await fetch('https://grmfbbqujopstaagknuc.supabase.co/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': 'sb_publishable_S5LYjuFe5m4ieS6BNZXz5A_-E7kuxuK' },
        body: JSON.stringify({ refresh_token: session.refreshToken })
      });
      const data = await r.json();
      if (data.access_token) {
        session.token = data.access_token;
        if (data.refresh_token) session.refreshToken = data.refresh_token;
        localStorage.setItem('sb_session', JSON.stringify(session));
      }
    } catch(e) {}
  }, 45 * 60 * 1000);
}


// ── POLLING SYNC ─────────────────────────────────────────────────
// Refresh data from cloud every 30s if tab is visible and not editing
function startPolling() {
  setInterval(async () => {
    if (!session || document.visibilityState !== 'visible' || isEditing) return;
    try {
      const rows = await sb.getAllDays(session.token, session.userId);
      if (!Array.isArray(rows)) return;
      const localTs = JSON.parse(localStorage.getItem('ps_local_ts') || '{}');
      const syncTs = JSON.parse(localStorage.getItem('ps_sync_ts') || '{}');
      let changed = false;
      rows.forEach(r => {
        const key = r.day_key;
        const localEditTime = localTs[key] || 0;
        const lastSyncTime = syncTs[key] || 0;
        const hasUnsavedLocal = localEditTime > lastSyncTime;
        if (!hasUnsavedLocal || isEmptyHtml(db[key] || '')) {
          if (db[key] !== r.content) { db[key] = r.content; changed = true; }
        }
      });
      // Also handle keys deleted on other device
      const cloudKeys = new Set(rows.map(r => r.day_key));
      Object.keys(db).forEach(key => {
        const localEditTime = localTs[key] || 0;
        const lastSyncTime = syncTs[key] || 0;
        const hasUnsavedLocal = localEditTime > lastSyncTime;
        if (!hasUnsavedLocal && !cloudKeys.has(key)) {
          delete db[key];
          changed = true;
        }
      });
      if (changed) {
        localStorage.setItem('ps_cache', JSON.stringify(db));
        renderWeek(); // re-render with updated data
      }
    } catch(e) { /* silent fail on poll */ }
  }, 30000); // every 30 seconds
}

// ── SYNC STATE ────────────────────────────────────────────────────
function setSyncState(state) {
  const dot = document.getElementById('sync-dot');
  if (!dot) return;
  dot.className = 'sync-dot ' + state;
}

// ── WEEK / DAY VIEW ───────────────────────────────────────────────
let weekOffset = 0, calY, calM;
let dvDate = null;

function getMonday(offset) {
  const t = new Date(); t.setHours(0,0,0,0);
  const dow = t.getDay(), diff = dow === 0 ? -6 : 1 - dow;
  const m = new Date(t); m.setDate(t.getDate() + diff + offset * 7);
  return m;
}
function getWeekNum(d) {
  const jan = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - jan) / 86400000) + jan.getDay() + 1) / 7);
}
function buildSpiral() {
  const col = document.getElementById('spiral-col'); col.innerHTML = '';
  const h = document.getElementById('main-page').offsetHeight || 500;
  for (let i = 0; i < Math.floor(h / 13); i++) {
    const r = document.createElement('div'); r.className = 'ring'; col.appendChild(r);
  }
}
function renderWeek() {
  const mon = getMonday(weekOffset);
  const days = [];
  for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(d.getDate() + i); days.push(d); }
  const hdrMonth = document.getElementById('hdr-month');
  if (hdrMonth) hdrMonth.textContent = MONTHS[mon.getMonth()] + ' ' + mon.getFullYear();
  const left = document.getElementById('left-col'), right = document.getElementById('right-col');
  left.innerHTML = ''; right.innerHTML = '';
  const today = new Date(); today.setHours(0,0,0,0);
  [days[0], days[1], days[2]].forEach(d => left.appendChild(makeCard(d, today)));
  [days[3], days[4]].forEach(d => right.appendChild(makeCard(d, today)));
  const wkWrap = document.createElement('div'); wkWrap.className = 'weekend-wrap';
  [days[5], days[6]].forEach(d => wkWrap.appendChild(makeCard(d, today)));
  right.appendChild(wkWrap);
  setTimeout(buildSpiral, 80);
}

function makeCard(d, today) {
  const key = dayKey(d), isToday = d.getTime() === today.getTime();
  const card = document.createElement('div'); card.className = 'day-card'; card.dataset.key = key;

  const hdr = document.createElement('div');
  hdr.className = 'day-hdr' + (isToday ? ' today' : '');
  hdr.innerHTML = '<span class="dow">' + DAYS[d.getDay()] + '</span><span class="num">' + d.getDate() + '</span><span class="mon-lbl">' + MONTHS[d.getMonth()] + '</span>';
  hdr.addEventListener('click', () => openDay(d));

  const body = document.createElement('div'); body.className = 'day-body';
  const lines = document.createElement('div'); lines.className = 'day-lines';

  const editor = document.createElement('div');
  editor.className = 'day-editor';
  editor.contentEditable = 'true';
  editor.setAttribute('spellcheck', 'true');
  editor.dataset.key = key;
  if (db[key]) editor.innerHTML = db[key];

  let syncTimer = null;

  editor.addEventListener('input', function() {
    // 1. Save to localStorage IMMEDIATELY — no debounce
    localSave(key, this.innerHTML);
    // 2. Schedule cloud sync after 1500ms of inactivity
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncKey(key), 1500);
  });

  editor.addEventListener('focus', function() {
    activeEditor = this; isEditing = true;
    // No expansion — keep layout stable to prevent iOS scroll jump
    showToolbar('main'); updateToolbarState();
    if (window.visualViewport) {
      const onVvResize = () => {
        scrollToCard();
        window.visualViewport.removeEventListener('resize', onVvResize);
      };
      window.visualViewport.addEventListener('resize', onVvResize);
    }
  });

  editor.addEventListener('blur', function() {
    // On blur: cancel debounce, sync immediately
    clearTimeout(syncTimer);
    localSave(key, this.innerHTML);
    syncKeyBeacon(key); // guaranteed sync even on page close
    setTimeout(() => {
      if (!toolbar.contains(document.activeElement) && document.activeElement !== this) {
        if (activeEditor === this) { activeEditor = null; isEditing = false; hideToolbar('main'); }
      }
    }, 150);
  });

  editor.addEventListener('keyup', updateToolbarState);
  editor.addEventListener('mouseup', updateToolbarState);
  body.addEventListener('touchmove', e => { if (isEditing) e.stopPropagation(); }, { passive: true });
  body.addEventListener('click', e => { if (e.target === body || e.target === lines) { editor.focus(); placeCaretAtEnd(editor); } });

  body.appendChild(lines); body.appendChild(editor);
  card.appendChild(hdr); card.appendChild(body);
  return card;
}

// ── DAY VIEW ──────────────────────────────────────────────────────
function openDay(d) {
  d = new Date(d); d.setHours(0,0,0,0); dvDate = d;
  renderDayView();
  document.getElementById('day-view').classList.add('open');
  setTimeout(() => { const ed = document.getElementById('dv-editor'); if(ed){ed.focus(); placeCaretAtEnd(ed);} }, 120);
}
function renderDayView() {
  const key = dayKey(dvDate);
  const today = new Date(); today.setHours(0,0,0,0);
  const dowEl = document.getElementById('dv-dow');
  const dateEl = document.getElementById('dv-date');
  if (dowEl) dowEl.textContent = DAYS_FULL[dvDate.getDay()];
  if (dateEl) dateEl.textContent = dvDate.getDate() + ' ' + MONTHS_FULL[dvDate.getMonth()] + ' ' + dvDate.getFullYear();
  if (dowEl) dowEl.style.color = dvDate.getTime() === today.getTime() ? '#c0392b' : '';
  const ed = document.getElementById('dv-editor');
  if (ed) ed.innerHTML = db[key] || '';
}
function closeDay() {
  document.getElementById('day-view').classList.remove('open');
  hideToolbar('dv'); dvDate = null; activeEditor = null;
}
function wireDayViewEvents() {
  const dvEd = document.getElementById('dv-editor');
  if (!dvEd) return;
  let dvSyncTimer = null;

  dvEd.addEventListener('input', function() {
    if (!dvDate) return;
    const key = dayKey(dvDate);
    localSave(key, this.innerHTML);
    clearTimeout(dvSyncTimer);
    dvSyncTimer = setTimeout(() => syncKey(key), 1500);
    // update week card preview
    const card = document.querySelector('.day-editor[data-key="' + key + '"]');
    if (card && document.activeElement !== card) card.innerHTML = db[key] || '';
  });

  dvEd.addEventListener('focus', function() { activeEditor = this; showToolbar('dv'); updateDvToolbarState(); });
  dvEd.addEventListener('blur', function() {
    if (!dvDate) return;
    const key = dayKey(dvDate);
    clearTimeout(dvSyncTimer);
    localSave(key, this.innerHTML);
    syncKeyBeacon(key);
    setTimeout(() => {
      const tbDv = document.getElementById('toolbar-dv');
      if (tbDv && !tbDv.contains(document.activeElement) && document.activeElement !== this) {
        if (activeEditor === this) { activeEditor = null; hideToolbar('dv'); }
      }
    }, 150);
  });
  dvEd.addEventListener('keyup', updateDvToolbarState);
  dvEd.addEventListener('mouseup', updateDvToolbarState);

  document.getElementById('dv-back').addEventListener('click', closeDay);
  document.getElementById('dv-prev').addEventListener('click', () => {
    const d = new Date(dvDate); d.setDate(d.getDate() - 1); dvDate = d;
    renderDayView(); setTimeout(() => { const e=document.getElementById('dv-editor'); if(e)e.focus(); }, 50);
  });
  document.getElementById('dv-next').addEventListener('click', () => {
    const d = new Date(dvDate); d.setDate(d.getDate() + 1); dvDate = d;
    renderDayView(); setTimeout(() => { const e=document.getElementById('dv-editor'); if(e)e.focus(); }, 50);
  });
  document.getElementById('dv-nav-oggi').addEventListener('click', () => openDay(new Date()));
  const dvMenu = document.getElementById('dv-nav-menu');
  if (dvMenu) dvMenu.addEventListener('click', () => {
    closeDay();
    const mo = document.getElementById('menu-overlay');
    if (mo) mo.classList.add('show');
    setNav('menu');
  });

  // DV toolbar
  function tbDvBind(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
    el.addEventListener('touchend', e => { e.preventDefault(); fn(); });
  }
  tbDvBind('dv-bold', () => fmt('bold'));
  tbDvBind('dv-italic', () => fmt('italic'));
  tbDvBind('dv-under', () => fmt('underline'));
  tbDvBind('dv-strike', () => fmt('strikeThrough'));
  tbDvBind('dv-ul', toggleBullet);

  const dvCurColor = document.getElementById('dv-cur-color');
  if (dvCurColor) {
    dvCurColor.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); document.getElementById('dv-color-menu').classList.toggle('show'); });
    document.querySelectorAll('#dv-color-menu .cm-dot').forEach(dot => {
      const apply = function(e) {
        e.preventDefault(); e.stopPropagation();
        currentColor = this.dataset.color;
        dvCurColor.style.background = currentColor;
        document.querySelectorAll('#dv-color-menu .cm-dot').forEach(d => d.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('dv-color-menu').classList.remove('show');
        fmt('foreColor', currentColor);
      };
      dot.addEventListener('mousedown', apply); dot.addEventListener('touchend', apply);
    });
  }
}
function updateDvToolbarState() {
  if (!activeEditor) return; saveRange();
  const map = {bold:'dv-bold',italic:'dv-italic',underline:'dv-under',strikeThrough:'dv-strike',insertUnorderedList:'dv-ul'};
  Object.entries(map).forEach(([cmd,id]) => { const el=document.getElementById(id); if(el) el.classList.toggle('on', document.queryCommandState(cmd)); });
}

// Save on visibility change (switching apps on mobile)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Save everything immediately when leaving
    if (activeEditor && activeEditor.dataset.key) {
      localSave(activeEditor.dataset.key, activeEditor.innerHTML);
      syncKeyBeacon(activeEditor.dataset.key);
    }
    if (dvDate) {
      const dvEd = document.getElementById('dv-editor');
      if (dvEd) { localSave(dayKey(dvDate), dvEd.innerHTML); syncKeyBeacon(dayKey(dvDate)); }
    }
    syncAllPending();
  } else if (document.visibilityState === 'visible' && session && !isEditing) {
    // Reload from cloud when tab becomes visible again (other device may have made changes)
    setTimeout(async () => {
      try {
        const rows = await sb.getAllDays(session.token, session.userId);
        if (!Array.isArray(rows)) return;
        const localTs = JSON.parse(localStorage.getItem('ps_local_ts') || '{}');
        const syncTs = JSON.parse(localStorage.getItem('ps_sync_ts') || '{}');
        let changed = false;
        rows.forEach(r => {
          const key = r.day_key;
          const hasUnsaved = (localTs[key] || 0) > (syncTs[key] || 0);
          if (!hasUnsaved && db[key] !== r.content) { db[key] = r.content; changed = true; }
        });
        if (changed) { localStorage.setItem('ps_cache', JSON.stringify(db)); renderWeek(); }
      } catch(e) {}
    }, 500);
  }
});

// ── TOOLBAR ───────────────────────────────────────────────────────
let activeEditor = null, savedRange = null, currentColor = '#1a1a1a';
let isEditing = false;

const toolbar = document.getElementById('toolbar');
const bottomNav = document.getElementById('bottom-nav');

function positionToolbar() {
  const tbDv = document.getElementById('toolbar-dv');
  const active = (tbDv && tbDv.classList.contains('show')) ? tbDv : toolbar.classList.contains('show') ? toolbar : null;
  if (!active) return;
  if (window.visualViewport) {
    const vv = window.visualViewport;
    active.classList.add('floating');
    active.style.top = (vv.offsetTop + vv.height - active.offsetHeight) + 'px';
    bottomNav.style.visibility = vv.height < window.innerHeight * 0.75 ? 'hidden' : 'visible';
  } else { active.classList.remove('floating'); active.style.top = ''; bottomNav.style.visibility = 'visible'; }
}
function showToolbar(which) {
  const tbDv = document.getElementById('toolbar-dv');
  if (which === 'dv') { if (tbDv) tbDv.classList.add('show'); toolbar.classList.remove('show','floating'); }
  else { toolbar.classList.add('show'); if (tbDv) tbDv.classList.remove('show','floating'); }
  positionToolbar();
}
function hideToolbar(which) {
  const tbDv = document.getElementById('toolbar-dv');
  if (which === 'dv') { if (tbDv) { tbDv.classList.remove('show','floating'); tbDv.style.top=''; } }
  else { toolbar.classList.remove('show','floating'); toolbar.style.top = ''; }
  bottomNav.style.visibility = 'visible';
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', positionToolbar);
  window.visualViewport.addEventListener('scroll', positionToolbar);
}

function placeCaretAtEnd(el) {
  const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
}
function saveRange() { const s = window.getSelection(); if (s && s.rangeCount > 0) savedRange = s.getRangeAt(0).cloneRange(); }
function restoreRange() { if (!savedRange || !activeEditor) return; try { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); } catch(e) {} }

function fmt(cmd, val) {
  if (!activeEditor) return;
  activeEditor.focus();
  const sel = window.getSelection();
  const hasSelection = sel && !sel.isCollapsed && activeEditor.contains(sel.anchorNode);
  if (!hasSelection) restoreRange();
  document.execCommand(cmd, false, val || null);
  saveRange();
  activeEditor === document.getElementById('dv-editor') ? updateDvToolbarState() : updateToolbarState();
  activeEditor.dispatchEvent(new Event('input'));
}
function toggleBullet() {
  if (!activeEditor) return;
  activeEditor.focus(); restoreRange();
  const was = document.queryCommandState('insertUnorderedList');
  document.execCommand('insertUnorderedList', false, null);
  if (was) activeEditor.normalize();
  saveRange();
  activeEditor === document.getElementById('dv-editor') ? updateDvToolbarState() : updateToolbarState();
  activeEditor.dispatchEvent(new Event('input'));
}
function updateToolbarState() {
  if (!activeEditor) return; saveRange();
  const map = {bold:'tb-bold',italic:'tb-italic',underline:'tb-under',strikeThrough:'tb-strike',insertUnorderedList:'tb-ul'};
  Object.entries(map).forEach(([cmd,id]) => { const el=document.getElementById(id); if(el) el.classList.toggle('on', document.queryCommandState(cmd)); });
}

function tbBind(id, fn) {
  const el = document.getElementById(id); if (!el) return;
  el.addEventListener('mousedown', e => { e.preventDefault(); fn(); });
  el.addEventListener('touchend', e => { e.preventDefault(); fn(); });
}
tbBind('tb-bold', () => fmt('bold'));
tbBind('tb-italic', () => fmt('italic'));
tbBind('tb-under', () => fmt('underline'));
tbBind('tb-strike', () => fmt('strikeThrough'));
tbBind('tb-ul', toggleBullet);

document.getElementById('cur-color').addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); document.getElementById('color-menu').classList.toggle('show'); });
document.querySelectorAll('#color-menu .cm-dot').forEach(dot => {
  const apply = function(e) {
    e.preventDefault(); e.stopPropagation();
    currentColor = this.dataset.color;
    document.getElementById('cur-color').style.background = currentColor;
    document.querySelectorAll('#color-menu .cm-dot').forEach(d => d.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('color-menu').classList.remove('show');
    fmt('foreColor', currentColor);
  };
  dot.addEventListener('mousedown', apply); dot.addEventListener('touchend', apply);
});
document.addEventListener('click', e => {
  if (!e.target.closest('.color-picker-wrap')) {
    document.getElementById('color-menu').classList.remove('show');
    const dvcm = document.getElementById('dv-color-menu');
    if (dvcm) dvcm.classList.remove('show');
  }
});

// ── NAVIGATION ────────────────────────────────────────────────────
let swipeX = 0, swipeY = 0, mX = 0, mDown = false;
const nb = document.getElementById('notebook');
nb.addEventListener('touchstart', e => { if (isEditing) return; swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY; }, { passive: true });
nb.addEventListener('touchend', e => {
  if (isEditing) return;
  const dx = e.changedTouches[0].clientX - swipeX;
  const dy = e.changedTouches[0].clientY - swipeY;
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 45) { dx < 0 ? weekOffset++ : weekOffset--; renderWeek(); }
}, { passive: true });
nb.addEventListener('mousedown', e => { if (isEditing || e.target.isContentEditable || e.target.closest('[contenteditable]')) return; mX = e.clientX; mDown = true; });
nb.addEventListener('mouseup', e => { if (!mDown || isEditing) return; mDown = false; const dx = e.clientX - mX; if (Math.abs(dx) > 45) { dx < 0 ? weekOffset++ : weekOffset--; renderWeek(); } });

document.getElementById('nav-agenda').onclick = () => { setNav('agenda'); };
document.getElementById('nav-oggi').onclick = () => {
  setNav('agenda'); weekOffset = 0; renderWeek();
};
document.getElementById('nav-menu').onclick = () => { setNav('menu'); document.getElementById('menu-overlay').classList.add('show'); };
document.getElementById('menu-close').onclick = () => { document.getElementById('menu-overlay').classList.remove('show'); setNav('agenda'); };
document.getElementById('menu-overlay').onclick = e => { if (e.target === e.currentTarget) { e.currentTarget.classList.remove('show'); setNav('agenda'); } };

function setNav(w) { ['agenda','oggi','menu'].forEach(n => { const el = document.getElementById('nav-' + n); if(el) el.classList.toggle('active', n === w); }); }

// ── LOGOUT ────────────────────────────────────────────────────────
document.getElementById('btn-logout').onclick = async () => {
  if (!confirm('Vuoi uscire dall\'account?')) return;
  await sb.signOut(session.token).catch(()=>{});
  session = null; db = {};
  localStorage.removeItem('sb_session');
  localStorage.removeItem('ps_cache');
  localStorage.removeItem('ps_notes');
  localStorage.removeItem('ps_local_ts');
  localStorage.removeItem('ps_sync_ts');
  document.getElementById('menu-overlay').classList.remove('show');
  document.getElementById('app').classList.remove('visible');
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  showTab('login');
};

// ── EXPORT / IMPORT ───────────────────────────────────────────────
document.getElementById('btn-export').onclick = () => {
  const payload = { version: 1, exported: new Date().toISOString(), agenda: db };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'agendabb-backup-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
};
document.getElementById('btn-import').onclick = () => document.getElementById('file-input').click();
document.getElementById('file-input').addEventListener('change', async function() {
  const file = this.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.version || !data.agenda) { alert('File non valido.'); return; }
      if (!confirm('Importare i dati? I dati attuali verranno sostituiti.')) return;
      db = data.agenda;
      localStorage.setItem('ps_cache', JSON.stringify(db));
      // Mark all as needing sync
      const ts = {};
      Object.keys(db).forEach(k => { ts[k] = Date.now(); });
      localStorage.setItem('ps_local_ts', JSON.stringify(ts));
      localStorage.removeItem('ps_sync_ts');
      await syncAllPending();
      renderWeek();
      document.getElementById('menu-overlay').classList.remove('show');
      setNav('agenda');
      alert('Dati importati e sincronizzati!');
    } catch(err) { alert('Errore nella lettura del file.'); }
  };
  reader.readAsText(file); this.value = '';
});

// ── CALENDAR ──────────────────────────────────────────────────────
function renderCal() {
  const grid = document.getElementById('cgrid'); grid.innerHTML = '';
  document.getElementById('cal-label').textContent = MFULL[calM] + ' ' + calY;
  ['Lu','Ma','Me','Gi','Ve','Sa','Do'].forEach(d => { const h = document.createElement('div'); h.className = 'cdh'; h.textContent = d; grid.appendChild(h); });
  const today = new Date(); today.setHours(0,0,0,0);
  const curMon = getMonday(weekOffset), curSun = new Date(curMon); curSun.setDate(curMon.getDate() + 6);
  const first = new Date(calY, calM, 1); let sd = first.getDay(); if (sd === 0) sd = 7;
  for (let i = 1; i < sd; i++) { const e = document.createElement('div'); e.className = 'cd empty'; grid.appendChild(e); }
  const dim = new Date(calY, calM + 1, 0).getDate();
  for (let d = 1; d <= dim; d++) {
    const cell = document.createElement('div'); cell.className = 'cd';
    const dt = new Date(calY, calM, d); dt.setHours(0,0,0,0);
    if (dt >= curMon && dt <= curSun) cell.classList.add('cur-week');
    if (dt.getTime() === today.getTime()) cell.classList.add('today-c');
    cell.textContent = d;
    cell.addEventListener('click', ev => {
      ev.stopPropagation();
      const todayD = new Date(); todayD.setHours(0,0,0,0);
      const dow = todayD.getDay(), diff = dow === 0 ? -6 : 1 - dow;
      const thisMon = new Date(todayD); thisMon.setDate(todayD.getDate() + diff);
      const cdt = new Date(calY, calM, d); cdt.setHours(0,0,0,0);
      const cdow = cdt.getDay(), cdiff = cdow === 0 ? -6 : 1 - cdow;
      const cmon = new Date(cdt); cmon.setDate(cdt.getDate() + cdiff);
      weekOffset = Math.round((cmon - thisMon) / (7 * 86400000));
      renderWeek(); document.getElementById('cal-wrap').classList.remove('show');
    });
    grid.appendChild(cell);
  }
}
document.getElementById('open-cal').addEventListener('click', e => { e.stopPropagation(); const t = new Date(); calY = t.getFullYear(); calM = t.getMonth(); renderCal(); document.getElementById('cal-wrap').classList.add('show'); });
document.getElementById('cal-prev').addEventListener('click', e => { e.stopPropagation(); calM--; if (calM < 0) { calM = 11; calY--; } renderCal(); });
document.getElementById('cal-next').addEventListener('click', e => { e.stopPropagation(); calM++; if (calM > 11) { calM = 0; calY++; } renderCal(); });
document.getElementById('cal-close').addEventListener('click', e => { e.stopPropagation(); document.getElementById('cal-wrap').classList.remove('show'); });
document.getElementById('cal-wrap').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('show'); });
document.getElementById('cal-box').addEventListener('click', e => e.stopPropagation());

wireDayViewEvents();
renderWeek();
