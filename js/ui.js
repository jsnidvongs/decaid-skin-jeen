// Small shared helpers: escaping, icons, steppers, toasts and the shot graph.
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const COLORS = { temp: '#b3261e', pressure: '#3d8b37', flow: '#1f5fbf', weight: '#6b4f2e' };

const ICON = {
  cup: 'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z M16 11h1.5a2.5 2.5 0 0 1 0 5H16 M8 3.5v2.5 M12 3.5v2.5',
  list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
  pencil: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4',
  drop: 'M12 3.5c3.6 4.4 6 7.6 6 10.5a6 6 0 0 1-12 0c0-2.9 2.4-6.1 6-10.5z',
  bean: 'M6.3 17.7c-3.1-3.1-2.6-8.7 1.1-12.4s9.3-4.2 12.4-1.1 2.6 8.7-1.1 12.4-9.3 4.2-12.4 1.1z M16.5 6.5c-3 1-3.5 3.5-4.5 5.5s-2.5 4-5 5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7.5V12l3 2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  grinder: 'M6 3h12l-3 7H9z M9 10h6v5H9z M7 15h10v6H7z',
  scale: 'M4 15h16v4H4z M12 15v-3 M7 12h10 M8.5 9a3.5 3.5 0 0 1 7 0',
  bt: 'M7 7l10 10-5 4V3l5 4L7 17',
  wrench: 'M14.5 4a4.5 4.5 0 0 0-4.2 6.1L4 16.4 7.6 20l6.3-6.3A4.5 4.5 0 0 0 20 9.5l-3 1-2.5-2.5 1-3a4.5 4.5 0 0 0-1-.1z',
  moon: 'M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z',
  puzzle: 'M5 8h4a2 2 0 1 1 4 0h4v4a2 2 0 1 1 0 4v4H5v-4a2 2 0 1 0 0-4z',
  data: 'M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6 M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3',
  info: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 11v6 M12 7.5h.01',
};
export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><path d="${ICON[name]}"></path></svg>`;
}

export function stepper(action, value, less = 'Less', more = 'More') {
  return `<span class="step"><button type="button" data-act="${action}" data-dir="-1" aria-label="${esc(less)}">−</button><span>${esc(value)}</span><button type="button" data-act="${action}" data-dir="1" aria-label="${esc(more)}">+</button></span>`;
}
export function sw(action, on, label) {
  return `<button type="button" role="switch" aria-checked="${on}" aria-label="${esc(label)}" class="sw${on ? ' sw-on' : ''}" data-act="${action}"></button>`;
}
export function seg(action, options, current, label) {
  return `<div class="seg" role="radiogroup" aria-label="${esc(label)}">${options.map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === current}" class="${v === current ? 'seg-on' : ''}" data-act="${action}" data-val="${esc(v)}">${esc(l)}</button>`).join('')}</div>`;
}
export function legend(label, items) {
  return `<p class="legend"><span class="eyebrow">${esc(label)}</span>${items.map(([c, t, dash]) => `<span class="k"><b style="border-top-color:${c};border-top-style:${dash ? 'dashed' : 'solid'}"></b>${esc(t)}</span>`).join('')}</p>`;
}

let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.remove('gone');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('gone'), 3200);
}

export const fmt = {
  n: (v, d = 1) => (v == null || isNaN(v) ? '–' : Number(v).toFixed(d)),
  day: (ts) => { const d = new Date(ts); const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); },
  time: (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  dmy: (ts) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ts || '')); if (m) return `${m[3]}-${m[2]}-${m[1].slice(2)}`; const d = new Date(ts); return isNaN(d) ? '' : [d.getDate(), d.getMonth() + 1, d.getFullYear() % 100].map((n) => String(n).padStart(2, '0')).join('-'); },
  ago: (ts) => { const days = Math.floor((Date.now() - Date.parse(ts)) / 86400000); return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago'; },
};

// ---------- profile maths ----------
// Turns a v2 profile into target curves over time, plus step markers.
export function profileCurves(profile, cap = 60) {
  const steps = (profile && profile.steps) || [];
  const P = [], F = [], T = [], marks = [];
  let t = 0, lastP = 0, lastF = 0;
  for (const s of steps) {
    const dur = Math.max(0.5, Math.min(Number(s.seconds) || 0, cap));
    const isP = s.pump === 'pressure';
    const target = isP ? Number(s.pressure) || 0 : Number(s.flow) || 0;
    marks.push({ t, name: s.name || '', label: isP ? `${fmt.n(target)} bar` : `${fmt.n(target)} ml/s`, temp: s.temperature });
    const smooth = s.transition === 'smooth';
    if (isP) { P.push([t, smooth ? lastP : target], [t + dur, target]); lastP = target; F.push(null); }
    else { F.push([t, smooth ? lastF : target], [t + dur, target]); lastF = target; P.push(null); }
    T.push([t, Number(s.temperature) || 0], [t + dur, Number(s.temperature) || 0]);
    t += dur;
    if (t >= cap) break;
  }
  return { P, F, T, marks, total: t };
}

export function profileSummary(profile) {
  const p = profile || {};
  const steps = p.steps || [];
  const temps = steps.map((s) => Number(s.temperature)).filter((x) => x > 0);
  const temp = temps.length ? Math.round(temps[0]) : null;
  return { temp, steps: steps.length, yieldG: p.target_weight || null };
}

// ---------- graph ----------
// series: [{ pts: [[t, v] | null...], color, width, dash, temp }]
export function graph({ height = 360, B, T = 40, xMax = 40, tempLo, series = [], marks = [], bands = [], lines = [], aria = 'Shot graph', weightAxis = true }) {
  B = B || height - 44;
  const X = (t) => 60 + (Math.min(t, xMax) / xMax) * 652;
  const Y = (v) => B - (Math.max(-0.2, Math.min(v, 9.6)) * (B - T)) / 9;
  const lo = tempLo == null ? 87 : tempLo;
  const o = [`<svg width="100%" viewBox="0 0 780 ${height}" style="display:block" role="img" aria-label="${esc(aria)}">`];
  for (const v of [3, 6, 9]) o.push(`<line x1="60" y1="${Y(v)}" x2="712" y2="${Y(v)}" stroke="rgba(0,0,0,0.08)"/>`);
  for (const [a, b] of bands) o.push(`<rect x="${X(a)}" y="${T}" width="${Math.max(0, X(b) - X(a))}" height="${B - T}" fill="#000" fill-opacity="0.045"/>`);
  o.push(`<line x1="60" y1="${B}" x2="712" y2="${B}" stroke="#000"/>`);
  for (const v of [0, 3, 6, 9]) o.push(`<text x="52" y="${Y(v) + 4}" font-size="12" text-anchor="end">${v}</text>`);
  for (const [i, v] of [0, 3, 6, 9].entries()) o.push(`<text x="720" y="${Y(v) + 4}" font-size="12">${lo + i * 3}</text>`);
  const mid = (T + B) / 2;
  o.push(`<text transform="translate(14,${mid}) rotate(-90)" font-size="11" letter-spacing="0.18em" text-anchor="middle"><tspan fill="${COLORS.pressure}">BAR</tspan><tspan fill="#4a4a4a"> · </tspan><tspan fill="${COLORS.flow}">ML/S</tspan>${weightAxis ? `<tspan fill="#4a4a4a"> · </tspan><tspan fill="${COLORS.weight}">G/S</tspan>` : ''}</text>`);
  o.push(`<text transform="translate(768,${mid}) rotate(90)" font-size="11" letter-spacing="0.18em" fill="${COLORS.temp}" text-anchor="middle">TEMPERATURE °C</text>`);
  const ticks = xMax <= 40 ? 10 : xMax <= 80 ? 20 : 30;
  for (let s = 0; s <= xMax + 0.01; s += ticks) o.push(`<text x="${X(s)}" y="${B + 18}" font-size="12" text-anchor="middle">${s}</text>`);
  o.push(`<text x="386" y="${B + 34}" font-size="11" letter-spacing="0.18em" text-anchor="middle">TIME, SECONDS</text>`);
  const laneEnd = [-999, -999];
  const nameW = (t) => t.length * 6.8;
  const valW = (t) => t.length * 5.2;
  marks.forEach((m, i) => {
    const x = X(m.t);
    if (i) o.push(`<line x1="${x}" y1="${T}" x2="${x}" y2="${B}" stroke="#7c7c7c" stroke-dasharray="6 4"/>`);
    if (x > 708) return;
    const name = (m.name || '').toUpperCase().slice(0, 12), val = m.label || '';
    const tries = [[name, val], [name, ''], [name.slice(0, 5), ''], [String(i + 1), '']];
    for (const [n, v] of tries) {
      const w = nameW(n) + (v ? 6 + valW(v) : 0);
      const lane = laneEnd.findIndex((end) => x + 4 >= end + 10);
      if (lane < 0) break;
      const left = Math.min(x + 4, 776 - w);
      if (left < laneEnd[lane] + 10) continue;
      laneEnd[lane] = left + w;
      o.push(`<text x="${left}" y="${lane ? 30 : 14}" font-size="10"><tspan letter-spacing="0.14em">${esc(n)}</tspan>${v ? `<tspan dx="6" font-size="11" fill="#4a4a4a">${esc(v)}</tspan>` : ''}</text>`);
      break;
    }
  });
  for (const l of lines) {
    const x = X(l.t);
    o.push(`<line x1="${x}" y1="${T}" x2="${x}" y2="${B}" stroke="#000" ${l.dash ? 'stroke-dasharray="2 3"' : ''}/>`);
    if (l.label) o.push(`<text x="${l.end ? x - 6 : x + 6}" y="${T + 16}" font-size="11" ${l.end ? 'text-anchor="end"' : ''}>${esc(l.label)}</text>`);
  }
  for (const s of series) {
    const segs = [[]];
    for (const p of s.pts) {
      if (!p || p[1] == null || isNaN(p[1])) { if (segs[segs.length - 1].length) segs.push([]); continue; }
      const v = s.temp ? p[1] - lo : p[1];
      segs[segs.length - 1].push(`${X(p[0]).toFixed(1)},${Y(v).toFixed(1)}`);
    }
    for (const sgm of segs) if (sgm.length > 1) o.push(`<polyline points="${sgm.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width || 3}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ''} stroke-linejoin="round"/>`);
  }
  o.push('</svg>');
  return o.join('');
}

// Picks a 9-degree temperature window that fits the profile.
export function tempWindow(temps) {
  const t = temps.filter((x) => x > 40);
  if (!t.length) return 87;
  const hi = Math.max(...t);
  return Math.round(hi) - 7;
}

// Turns a stored shot's measurements into graph points.
export function shotSeries(shot) {
  const m = (shot && shot.measurements) || [];
  if (!m.length) return null;
  const t0 = Date.parse(m[0].machine && m[0].machine.timestamp) || 0;
  const pts = m.map((s) => ({
    t: ((Date.parse(s.machine && s.machine.timestamp) || 0) - t0) / 1000,
    p: s.machine && s.machine.pressure, f: s.machine && s.machine.flow,
    temp: s.machine && s.machine.mixTemperature, frame: s.machine && s.machine.profileFrame,
    w: s.scale && s.scale.weight, wf: s.scale && (s.scale.weightFlow != null ? s.scale.weightFlow : s.scale.flow),
  }));
  const frames = [];
  pts.forEach((p) => { if (!frames.length || frames[frames.length - 1].frame !== p.frame) frames.push({ frame: p.frame, t: p.t }); });
  return { pts, frames, end: pts[pts.length - 1].t };
}
