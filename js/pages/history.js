// History: every shot (and steam), with the graph, rating and bean it used.
import { patchWorkflow, notify } from '../store.js';
import { api } from '../api.js';
import { esc, graph, legend, shotSeries, tempWindow, fmt, toast, COLORS } from '../ui.js';
import { go } from '../app.js';

let items = null, total = 0, filter = 'all', bean = null, pickedId = null, compareMode = false, compareId = null;
const full = {};

async function load() {
  items = null; notify();
  try {
    if (filter === 'steam') {
      const l = await api.get('/api/v1/steams');
      items = (l || []).map((s) => ({ ...s, steam: true })).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      total = items.length;
    } else {
      const q = { limit: 60, offset: 0, order: 'desc' };
      if (filter === 'rated') q.minEnjoyment = 8;
      if (bean) q.beanId = bean.beanId;
      const page = await api.shots(q);
      items = (page && page.items) || [];
      total = page ? page.total : items.length;
      if (filter === 'week') { const cut = Date.now() - 7 * 86400000; items = items.filter((s) => Date.parse(s.timestamp) >= cut); }
    }
  } catch (e) { items = []; }
  notify();
}
function fetchFull(id, steam) {
  if (!id || full[id]) return;
  full[id] = 'loading';
  api.get(`/api/v1/${steam ? 'steams' : 'shots'}/${encodeURIComponent(id)}`).then((s) => { full[id] = s; notify(); }).catch(() => { full[id] = null; });
}

export default {
  keepScroll: true,
  enter(arg) { if (arg && arg.beanId) { bean = arg; filter = 'all'; } pickedId = null; load(); },
  render() {
    const list = items || [];
    let sel = list.find((s) => s.id === pickedId) || list[0];
    if (sel) { pickedId = sel.id; fetchFull(sel.id, sel.steam); }
    const f = sel && typeof full[sel.id] === 'object' ? full[sel.id] : null;
    const cmp = compareId && typeof full[compareId] === 'object' ? full[compareId] : null;
    const w = (sel && sel.workflow) || {}, ctx = w.context || {}, ann = (sel && sel.annotations) || {};
    const ser = f ? shotSeries(f) : null, cser = cmp ? shotSeries(cmp) : null;
    const lo = tempWindow(ser ? ser.pts.map((p) => p.temp) : []);
    const series = [];
    const add = (s, faint) => s && series.push(
      ...(faint ? [] : [{ pts: s.pts.map((x) => [x.t, x.wf]), color: COLORS.weight, width: 2, dash: '2 3' }]),
      { pts: s.pts.map((x) => [x.t, x.temp]), color: COLORS.temp, width: faint ? 1.5 : 3, dash: faint ? '5 5' : '', temp: true },
      { pts: s.pts.map((x) => [x.t, x.f]), color: COLORS.flow, width: faint ? 1.5 : 3, dash: faint ? '5 5' : '' },
      { pts: s.pts.map((x) => [x.t, x.p]), color: COLORS.pressure, width: faint ? 1.5 : 3, dash: faint ? '5 5' : '' });
    add(cser, true); add(ser, false);
    const steps = (w.profile && w.profile.steps) || [];
    const marks = ser ? ser.frames.map((fr) => ({ t: fr.t, name: steps[fr.frame] ? steps[fr.frame].name : '', label: '' })) : [];
    const xMax = Math.max(30, Math.ceil(Math.max(ser ? ser.end : 0, cser ? cser.end : 0) / 10) * 10);
    const out = ann.actualYield || (ser && ser.pts.length ? ser.pts[ser.pts.length - 1].w : null);
    const dose = ann.actualDoseWeight || ctx.targetDoseWeight;
    const stars = ann.enjoyment != null ? '★'.repeat(Math.round(ann.enjoyment / 2)) + '☆'.repeat(5 - Math.round(ann.enjoyment / 2)) : 'Not rated';
    const filters = [['all', 'All'], ['rated', 'Rated 4+'], ['week', 'This week'], ['steam', 'Steam']];
    return `
      <div class="head"><h2 class="h2">History</h2><span class="eyebrow" style="padding-bottom:10px">${items ? total + (filter === 'steam' ? ' steams' : ' shots') : ''}</span></div>
      <div class="head"><div style="min-width:0"><span class="eyebrow">${sel ? esc(fmt.day(sel.timestamp) + ', ' + fmt.time(sel.timestamp) + (ctx.coffeeName ? ' · ' + ctx.coffeeName : '')) : ''}</span><h1 class="h1">${esc(sel ? (sel.steam ? 'Steam' : (w.profile && w.profile.title) || 'Shot') : 'No shots yet')}</h1></div><p class="note-r">${esc(ann.espressoNotes || sel && sel.shotNotes || '')}</p></div>
      <div role="tablist" aria-label="Filter history" style="display:flex;justify-content:space-between;align-items:flex-end;white-space:nowrap;padding:8px 0 16px">${filters.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === filter && !bean}" class="line${k === filter && !bean ? ' line-on' : ''}" style="letter-spacing:.16em" data-act="filter" data-val="${k}">${l}</button>`).join('')}${bean ? `<button type="button" class="line line-on" style="letter-spacing:.16em" data-act="clearbean">${esc(bean.label)} ✕</button>` : ''}</div>
      <div class="row2"><p>${sel && !sel.steam ? `${fmt.n(dose)} → ${fmt.n(out)} g${dose && out ? ' · 1 : ' + fmt.n(out / dose) : ''} · <span title="Rating">${stars}</span>` : '&nbsp;'}</p>
        <nav class="acts" aria-label="Shot actions">${sel && !sel.steam ? `<button type="button" class="line line-on" data-act="compare">${compareMode ? 'Pick a shot…' : compareId ? 'Stop comparing' : 'Compare'}</button><button type="button" class="line line-on" data-act="upload">Upload</button>` : ''}</nav></div>
      <section class="list" aria-label="Shots">${items === null ? '<p class="empty">Loading…</p>' : list.length ? list.map((s) => `<button type="button" class="row${s.id === pickedId ? ' row-on' : ''}${s.id === compareId ? ' row-cmp' : ''}" aria-pressed="${s.id === pickedId}" data-act="pick" data-id="${esc(s.id)}"><span class="row-name">${esc(s.steam ? 'Steam' : (s.workflow && s.workflow.profile && s.workflow.profile.title) || 'Shot')}${s.id === compareId ? ' <span class="eyebrow">· compared</span>' : ''}</span><span class="row-meta">${esc(fmt.day(s.timestamp))} ${esc(fmt.time(s.timestamp))}</span></button>`).join('') : '<p class="empty">No shots match.</p>'}</section>
      <section class="right3">
        <figure style="margin:12px 0 0 -60px">${ser ? graph({ height: 381, B: 337, xMax, tempLo: lo, series, marks, aria: 'Shot graph' }) : `<p class="empty" style="margin-left:60px">${sel ? (sel.steam ? 'Steam sessions have no shot graph.' : 'Loading the graph…') : ''}</p>`}</figure>
        <div class="bottom">
          ${legend('Shot', [[COLORS.temp, 'Temperature'], [COLORS.pressure, 'Pressure'], [COLORS.flow, 'Flow'], [COLORS.weight, 'Weight flow', true]]).replace('</p>', cmp ? `<span style="color:var(--muted)">Dashed: ${esc(fmt.day(cmp.timestamp))} ${esc(fmt.time(cmp.timestamp))}</span></p>` : '</p>')}
          ${sel && !sel.steam ? '<button type="button" class="cta" data-act="again">Pull this again <span aria-hidden="true">→</span></button>' : ''}
        </div>
      </section>`;
  },
  async act(a, el) {
    const sel = (items || []).find((s) => s.id === pickedId);
    if (a === 'pick') {
      if (compareMode) { compareId = el.dataset.id === pickedId ? null : el.dataset.id; compareMode = false; fetchFull(compareId, false); }
      else pickedId = el.dataset.id;
      this.repaint();
    }
    else if (a === 'filter') { filter = el.dataset.val; bean = null; pickedId = null; compareId = null; load(); }
    else if (a === 'clearbean') { bean = null; load(); }
    else if (a === 'compare') { if (compareId) compareId = null; else compareMode = !compareMode; this.repaint(); }
    else if (a === 'upload') { await api.post('/api/v1/plugins/visualizer.reaplugin/upload', { shotId: sel.id }); toast('Sent to Visualizer'); }
    else if (a === 'again') {
      const w = sel.workflow || {};
      const c = w.context || {};
      const keep = ['targetDoseWeight', 'targetYield', 'grinderId', 'grinderModel', 'grinderSetting', 'beanBatchId', 'coffeeName', 'coffeeRoaster'];
      const ctx = {}; keep.forEach((k) => { if (c[k] != null) ctx[k] = c[k]; });
      await patchWorkflow({ profile: w.profile, context: ctx });
      toast('Loaded this shot’s recipe');
      go('shot');
    }
  },
};
