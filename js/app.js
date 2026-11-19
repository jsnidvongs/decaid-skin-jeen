import { S, start, subscribe, machineState, waterPct, waterLow, heating } from './store.js';
import { api, BASE } from './api.js';
import { esc, icon, toast } from './ui.js';
import shot from './pages/shot.js';
import profiles from './pages/profiles.js';
import create from './pages/create.js';
import h2o from './pages/h2o.js';
import beans from './pages/beans.js';
import historyPage from './pages/history.js';
import settings from './pages/settings.js';

const PAGES = [
  ['shot', 'Pull a shot', 'cup', shot],
  ['profiles', 'Profiles', 'list', profiles],
  ['create', 'Create', 'pencil', create, 'profiles'],
  ['h2o', 'H2O', 'drop', h2o],
  ['beans', 'Beans', 'bean', beans],
  ['history', 'History', 'clock', historyPage],
  ['settings', 'Settings', 'gear', settings],
];

const root = document.getElementById('app');
root.innerHTML = '<header class="top"><nav class="tabs" aria-label="Sections"></nav><ul class="status" aria-label="Machine status"></ul></header><main class="main" id="page"></main><div class="offline gone" role="alert"></div>';
const nav = root.querySelector('.tabs');
const statusEl = root.querySelector('.status');
const pageEl = root.querySelector('#page');
const offEl = root.querySelector('.offline');

let current = null;

export function go(id, arg) {
  const entry = PAGES.find((p) => p[0] === id) || PAGES[0];
  if (current && current.leave) current.leave();
  current = entry[3];
  current.repaint = paint;
  if (location.hash.slice(1) !== entry[0]) history.replaceState(null, '', '#' + entry[0]);
  renderNav(entry[4] || entry[0]);
  pageEl.className = current.wide ? 'main main-3' : 'main';
  if (current.enter) current.enter(arg);
  paint();
}
export function paint() {
  if (!current) return;
  const keep = pageEl.querySelector('.list');
  const scroll = keep ? keep.scrollTop : 0;
  pageEl.innerHTML = current.render();
  const list = pageEl.querySelector('.list');
  if (list && current.keepScroll) list.scrollTop = scroll;
  if (current.after) current.after(pageEl);
}

function renderNav(active) {
  nav.innerHTML = PAGES.filter((p) => !p[4]).map(([id, label, ic]) => {
    const on = id === active;
    const cur = on ? ' aria-current="page"' : '';
    if (id === 'settings') return `<a class="tab tab-icon${on ? ' tab-on' : ''}" href="#settings" aria-label="Settings"${cur}>${icon(ic, 22)}</a>`;
    return `<a class="tab${on ? ' tab-on' : ''}" href="#${id}"${cur}>${icon(ic, 18)}<span>${esc(label)}</span></a>`;
  }).join('');
}

function stateLabel() {
  const st = machineState();
  return ({ idle: ['Ready', 'ok'], heating: ['Heating', 'bad'], preheating: ['Heating', 'bad'], sleeping: ['Asleep', 'idle'], espresso: ['Pouring', 'ok'],
    steam: ['Steaming', 'ok'], hotWater: ['Hot water', 'ok'], flush: ['Flushing', 'ok'], needsWater: ['Refill', 'bad'], error: ['Error', 'bad'],
    disconnected: ['No DE1', 'bad'], booting: ['Starting', 'idle'], busy: ['Busy', 'idle'], cleaning: ['Cleaning', 'ok'], descaling: ['Descaling', 'ok'],
    airPurge: ['Air purge', 'ok'], fwUpgrade: ['Updating', 'idle'] })[st] || [st, 'ok'];
}

function scaleReading() {
  const w = Math.round((S.scale.weight || 0) * 10) / 10;
  return (w < 0 ? '-' : '') + Math.abs(w).toFixed(1).padStart(4, '0');
}
const STATS = ['ready', 'group', 'water', 'scale'];
statusEl.innerHTML = STATS.map((k) => `<li><button type="button" class="stat stat-${k}" data-stat="${k}"><span class="stat-txt"></span><span class="dot" aria-hidden="true"></span></button></li>`).join('');
const statEls = Object.fromEntries(STATS.map((k) => { const b = statusEl.querySelector(`[data-stat="${k}"]`); return [k, { b, txt: b.firstChild, dot: b.lastChild, html: null, st: null }]; }));

function renderStatus() {
  const m = S.machine;
  const [ready, rs] = stateLabel();
  const pct = waterPct();
  const g = m ? m.groupTemperature.toFixed(1) : null;
  const items = [
    ['ready', esc(ready), ready, rs],
    ['group', g ? `Group <span class="num">${g}°</span>` : 'Group –', g ? `Group ${g}°` : 'Group unknown', !m ? 'idle' : heating() ? 'bad' : 'ok'],
    ['water', pct == null ? 'Water –' : `Water <span class="num">${pct}%</span>`, pct == null ? 'Water unknown' : `Water ${pct}%`, pct == null ? 'idle' : waterLow() ? 'bad' : 'ok'],
    S.scale.connected ? ['scale', `Scale <span class="num">${scaleReading()} g</span>`, `Scale ${scaleReading()} g`, 'ok'] : ['scale', 'No scale', 'No scale', 'bad'],
  ];
  for (const [k, html, label, st] of items) {
    const e = statEls[k];
    if (e.html !== html) { e.txt.innerHTML = html; e.html = html; }
    if (e.st !== st) { e.dot.className = 'dot' + (st === 'bad' ? ' dot-off' : st === 'idle' ? ' dot-idle' : ''); e.st = st; }
    const aria = label + (st === 'bad' ? ', needs attention' : '');
    if (e.b.getAttribute('aria-label') !== aria) e.b.setAttribute('aria-label', aria);
  }
}

function renderOffline() {
  if (S.online) { offEl.classList.add('gone'); return; }
  offEl.classList.remove('gone');
  offEl.innerHTML = `<span class="eyebrow">Connecting</span><h1>Looking for Decaid at ${esc(BASE)}</h1><p>Make sure the Decaid app is open on the tablet. If you are testing on another computer, add <b>?api=http://TABLET-IP:8080</b> to this page's address.</p>`;
}

// Any touch or the tablet screen coming back on wakes the DE1 and tells Decaid someone is here.
let lastPresence = 0;
function presence() {
  if (machineState() === 'sleeping') api.setState('idle').then(() => toast('Waking the machine')).catch(() => {});
  if (Date.now() - lastPresence > 30000) { lastPresence = Date.now(); api.post('/api/v1/machine/heartbeat').catch(() => {}); }
}
window.addEventListener('pointerdown', presence, { capture: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') presence(); });

// One click handler for every page: elements carry data-act="name".
root.addEventListener('click', async (ev) => {
  const st = ev.target.closest('[data-stat]');
  if (st) {
    const k = st.dataset.stat;
    try {
      if (k === 'ready') { /* waking is handled by presence() */ }
      else if (k === 'scale' && S.scale.connected) { await api.tare(); toast('Scale tared'); }
      else if (k === 'scale') go('settings', 'Scale');
      else if (k === 'water') go('settings', 'Machine');
    } catch (e) { toast(e.message); }
    return;
  }
  const el = ev.target.closest('[data-act]');
  if (!el || !current || !current.act || !pageEl.contains(el)) return;
  try { await current.act(el.dataset.act, el, ev); } catch (e) { console.error(e); toast(e.message || String(e)); }
});
root.addEventListener('input', (ev) => { const el = ev.target.closest('[data-in]'); if (el && current && current.input) current.input(el.dataset.in, el, ev); });
root.addEventListener('change', (ev) => { const el = ev.target.closest('[data-in]'); if (el && current && current.changed) current.changed(el.dataset.in, el, ev); });
window.addEventListener('hashchange', () => { const id = location.hash.slice(1); const e = PAGES.find((p) => p[0] === id); if (e && e[3] !== current) go(id); });

subscribe((kind) => {
  renderStatus();
  renderOffline();
  if (!current) return;
  if (kind === 'live') { if (current.live) current.live(pageEl); return; }
  if (current.onStore && current.onStore(kind) === false) return;
  const active = document.activeElement;
  if (active && pageEl.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return; // don't wipe typing
  paint();
});

start();
renderStatus();
go(location.hash.slice(1) || 'shot');
