// Profiles: browse, filter, preview with the last shot, and load one.
import { S, patchWorkflow, notify } from '../store.js';
import { api } from '../api.js';
import { esc, graph, legend, profileCurves, profileSummary, tempWindow, shotSeries, fmt, toast, COLORS } from '../ui.js';
import { go } from '../app.js';

export const TAGS = [['favourite', 'Favourites'], ['modern', 'Modern'], ['classic', 'Classic']];
export const tagsOf = (rec) => ((rec && rec.metadata && rec.metadata.tags) || []).map((t) => String(t).toLowerCase());

let list = null, loading = false;
let filter = 'all', query = '', searching = false;
let pickedId = null;
const lastShots = {};   // title -> { series, when } | 'none'

export async function loadProfiles(force) {
  if ((list && !force) || loading) return list;
  loading = true;
  try { list = (await api.profiles()).filter((r) => r.visibility !== 'deleted' && r.visibility !== 'hidden'); }
  catch (e) { list = list || []; }
  loading = false;
  notify();
  return list;
}
export const profileList = () => list || [];

export async function setTags(rec, tags) {
  const updated = await api.put(`/api/v1/profiles/${encodeURIComponent(rec.id)}`, { profile: rec.profile, metadata: { ...(rec.metadata || {}), tags } });
  await loadProfiles(true);
  return updated;
}

function visible() {
  let l = profileList();
  if (filter === 'favourite' || filter === 'modern' || filter === 'classic') l = l.filter((r) => tagsOf(r).includes(filter));
  if (filter === 'own') l = l.filter((r) => !r.isDefault);
  if (query) { const q = query.toLowerCase(); l = l.filter((r) => (r.profile.title || '').toLowerCase().includes(q) || (r.profile.author || '').toLowerCase().includes(q)); }
  return l.slice().sort((a, b) => {
    const fa = tagsOf(a).includes('favourite') ? 0 : 1, fb = tagsOf(b).includes('favourite') ? 0 : 1;
    return fa - fb || (a.profile.title || '').localeCompare(b.profile.title || '');
  });
}

async function loadLast(title) {
  if (!title || lastShots[title]) return;
  lastShots[title] = 'loading';
  try {
    const page = await api.shots({ profileTitle: title, limit: 1, offset: 0, order: 'desc' });
    const item = page && page.items && page.items[0];
    if (!item) { lastShots[title] = 'none'; notify(); return; }
    const full = await api.shot(item.id);
    lastShots[title] = { series: shotSeries(full), when: item.timestamp, out: full.annotations && full.annotations.actualYield };
  } catch (e) { lastShots[title] = 'none'; }
  notify();
}

export default {
  keepScroll: true,
  enter() { loadProfiles(true); },
  render() {
    const l = visible();
    const cur = S.workflow && S.workflow.profile && S.workflow.profile.title;
    let sel = profileList().find((r) => r.id === pickedId) || l.find((r) => r.profile.title === cur) || l[0];
    if (sel) pickedId = sel.id;
    const p = sel ? sel.profile : null;
    if (p) loadLast(p.title);
    const tags = sel ? tagsOf(sel) : [];
    const sum = profileSummary(p);
    const last = p && lastShots[p.title];
    const hasLast = last && last.series;
    const c = profileCurves(p);
    const lo = tempWindow(((p && p.steps) || []).map((s) => Number(s.temperature)));
    const xMax = Math.max(30, Math.ceil(Math.max(c.total, hasLast ? last.series.end : 0) / 10) * 10);
    const bands = []; c.marks.forEach((m, i) => { if (i % 2 === 0) bands.push([m.t, (c.marks[i + 1] || { t: c.total }).t]); });
    const series = [
      { pts: c.T, color: COLORS.temp, temp: true }, { pts: c.F, color: COLORS.flow }, { pts: c.P, color: COLORS.pressure },
    ];
    if (hasLast) {
      const q = last.series.pts;
      series.push(
        { pts: q.map((x) => [x.t, x.wf]), color: COLORS.weight, width: 2, dash: '2 3' },
        { pts: q.map((x) => [x.t, x.temp]), color: COLORS.temp, width: 1.5, dash: '5 5', temp: true },
        { pts: q.map((x) => [x.t, x.f]), color: COLORS.flow, width: 1.5, dash: '5 5' },
        { pts: q.map((x) => [x.t, x.p]), color: COLORS.pressure, width: 1.5, dash: '5 5' });
    }
    const eyebrow = [!sel ? '' : sel.isDefault ? 'Decent' : 'Own', ...TAGS.filter(([k]) => tags.includes(k)).map(([, l2]) => l2.replace(/s$/, ''))].filter(Boolean).join(' · ');
    const filters = [['all', 'All'], ['favourite', 'Favourites'], ['own', 'Own'], ['modern', 'Modern'], ['classic', 'Classic']];
    return `
      <div class="head"><h2 class="h2">Profiles</h2><button type="button" class="line${searching ? ' line-on' : ''}" data-act="search">${searching ? 'Close search' : 'Search'}</button></div>
      <div class="head"><div style="min-width:0"><span class="eyebrow">${esc(eyebrow)}</span><h1 class="h1">${esc(p ? p.title : 'No profiles yet')}</h1></div><p class="note-r">${esc(p && p.notes ? p.notes.slice(0, 150) : '')}</p></div>
      ${searching
        ? `<div class="row2" style="align-items:flex-end"><label class="fld" style="width:100%"><span class="eyebrow">Search by name or author</span><input data-in="q" value="${esc(query)}" autofocus></label></div>`
        : `<div role="tablist" aria-label="Filter profiles" style="display:flex;justify-content:space-between;align-items:flex-end;white-space:nowrap;padding:8px 0 16px">${filters.map(([k, label]) => `<button type="button" role="tab" aria-selected="${k === filter}" class="line${k === filter ? ' line-on' : ''}" style="letter-spacing:.16em" data-act="filter" data-val="${k}">${label}</button>`).join('')}</div>`}
      <div class="row2"><p>${sum.temp ? sum.temp + '° · ' : ''}${p && p.target_weight ? '→ ' + fmt.n(p.target_weight) + ' g · ' : ''}${sum.steps} steps${hasLast ? ` · <span style="color:var(--muted)">Last pulled ${fmt.ago(last.when)}</span>` : ''}</p>
        <nav class="acts" aria-label="Profile actions"><button type="button" class="line line-on" data-act="copy">Edit a copy</button><button type="button" class="line line-on" data-act="fav">${tags.includes('favourite') ? 'Unfavourite' : 'Favourite'}</button><button type="button" class="line line-on" data-act="hide">Hide</button></nav></div>
      <section class="list" aria-label="Profiles">
        ${list === null ? '<p class="empty">Loading profiles…</p>' : l.length ? l.map((r) => `<button type="button" class="row${r.id === pickedId ? ' row-on' : ''}" aria-pressed="${r.id === pickedId}" data-act="pick" data-id="${esc(r.id)}"><span class="row-name">${esc(r.profile.title)}</span><span class="row-meta">${r.profile.target_weight ? '→ ' + fmt.n(r.profile.target_weight, 0) + ' g' : (r.profile.steps || []).length + ' steps'}</span></button>`).join('') : `<p class="empty">No profiles here yet.${filter !== 'all' ? ' Tag a profile from Create, or with Favourite above.' : ''}</p>`}
      </section>
      <section class="right3">
        <figure style="margin:12px 0 0 -60px">${p ? graph({ height: 381, B: 337, xMax, tempLo: lo, series, marks: c.marks, bands, lines: hasLast ? [{ t: last.series.end, dash: true, end: true, label: `Last shot${last.series.pts.length && last.series.pts[last.series.pts.length - 1].w ? ' stopped at ' + fmt.n(last.series.pts[last.series.pts.length - 1].w) + ' g' : ''}` }] : [], aria: 'Profile preview' }) : ''}</figure>
        <div class="bottom">
          ${legend('Target', [[COLORS.temp, 'Temperature'], [COLORS.pressure, 'Pressure'], [COLORS.flow, 'Flow']]).replace('</p>', hasLast ? '<span style="color:var(--muted)">Dashed: last shot</span></p>' : '</p>')}
          <button type="button" class="cta" data-act="use" ${p ? '' : 'disabled'}>Use this profile <span aria-hidden="true">→</span></button>
        </div>
      </section>`;
  },
  input(name, el) { if (name === 'q') { query = el.value; clearTimeout(this._t); this._t = setTimeout(() => { const pos = el.selectionStart; this.repaint(); const i = document.querySelector('[data-in="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 250); } },
  async act(a, el) {
    const sel = profileList().find((r) => r.id === pickedId);
    if (a === 'pick') { pickedId = el.dataset.id; this.repaint(); }
    else if (a === 'filter') { filter = el.dataset.val; this.repaint(); }
    else if (a === 'search') { searching = !searching; if (!searching) query = ''; this.repaint(); }
    else if (!sel) return;
    else if (a === 'use') { await patchWorkflow({ profile: sel.profile }); toast(`${sel.profile.title} loaded`); go('shot'); }
    else if (a === 'fav') { const t = tagsOf(sel); await setTags(sel, t.includes('favourite') ? t.filter((x) => x !== 'favourite') : [...t, 'favourite']); }
    else if (a === 'copy') { go('create', sel); }
    else if (a === 'hide') { await api.put(`/api/v1/profiles/${encodeURIComponent(sel.id)}/visibility`, { visibility: 'hidden' }); toast(`${sel.profile.title} hidden`); pickedId = null; await loadProfiles(true); }
  },
};
