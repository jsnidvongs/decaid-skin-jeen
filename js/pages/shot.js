// Pull a shot: ready, pouring and done.
import { S, machineState, heating, heatProgress, waterLow, patchWorkflow, refreshWorkflow, notify } from '../store.js';
import { api } from '../api.js';
import { esc, graph, legend, profileCurves, profileSummary, tempWindow, stepper, sw, fmt, toast, COLORS } from '../ui.js';

let dismissed = null;      // the finished shot the user has moved on from
let rating = 0;
let note = '';
let lastYield = 36;        // remembered so switching stop-at-weight back on restores it
let batch = null, batchFor = null;
let lastPaint = 0;

const ctx = () => (S.workflow && S.workflow.context) || {};
const prof = () => (S.workflow && S.workflow.profile) || null;

function phase() {
  if (machineState() === 'espresso') return 'pouring';
  if (S.shot && S.shot.done && dismissed !== S.shot) return 'done';
  return 'ready';
}

function curves() {
  const p = prof();
  const c = profileCurves(p);
  const lo = tempWindow((p && p.steps || []).map((s) => Number(s.temperature)));
  return { c, lo };
}

function targetSeries(c, faint) {
  const w = faint ? 1.5 : 3, d = faint ? '5 5' : '';
  return [
    { pts: c.T, color: COLORS.temp, width: w, dash: d, temp: true },
    { pts: c.F, color: COLORS.flow, width: w, dash: d },
    { pts: c.P, color: COLORS.pressure, width: w, dash: d },
  ];
}

function bands(c) {
  const out = [];
  c.marks.forEach((m, i) => { if (i % 2 === 0) out.push([m.t, (c.marks[i + 1] || { t: c.total }).t]); });
  return out;
}

function head(left, leftSub, eyebrow, title, noteText) {
  return `<div class="head"><h2 class="h2">${left}</h2>${leftSub}</div>
    <div class="head"><div style="min-width:0"><span class="eyebrow">${eyebrow}</span><h1 class="h1">${esc(title)}</h1></div><p class="note-r">${esc(noteText)}</p></div>`;
}

function issueBlock(issue) {
  if (!issue) return '';
  return `<div role="status" style="display:flex;align-items:flex-end;gap:24px;min-width:0;padding-bottom:6px"><p class="iss"><span class="dot dot-off" aria-hidden="true" style="margin-top:6px"></span><span><strong>${esc(issue.title)}</strong><br>${esc(issue.text)}</span></p>${issue.action ? `<button type="button" class="line line-on" data-act="${issue.act}">${esc(issue.action)}</button>` : ''}</div>`;
}

function rows(items) { return items.map(([a, b]) => `<div class="row row-static"><span>${a}</span>${b}</div>`).join(''); }

function readyView() {
  const p = prof();
  const c0 = ctx();
  const sum = profileSummary(p);
  const yieldG = c0.targetYield || 0;
  const saw = yieldG > 0;
  if (saw) lastYield = yieldG;
  const { c, lo } = curves();
  const hot = heating(), low = waterLow(), noScale = !S.scale.connected;
  let issue = null;
  if (!S.machine) issue = { title: 'No machine connected', text: 'Turn on the DE1 and check Bluetooth in Settings, Devices.', action: 'Open devices', act: 'devices' };
  else if (low) issue = { title: 'Water tank is nearly empty', text: 'Refill it before pulling a shot so the pump does not run dry.' };
  else if (hot) issue = { title: 'Heating up', text: `Group head is ${fmt.n(S.machine.groupTemperature)}°, aiming for ${fmt.n(S.machine.targetGroupTemperature)}°.`, action: 'Start anyway', act: 'force' };
  else if (machineState() === 'sleeping') issue = { title: 'Machine is asleep', text: 'Wake it to heat up. This takes a few minutes.', action: 'Wake up', act: 'wake' };
  else if (noScale && saw) issue = { title: 'Scale not found', text: 'Turn on the Decent Scale. Without it the shot runs to the end of the profile.' };
  const blocked = !S.machine || low || hot;
  const ctaLabel = low ? 'Refill water' : hot ? `Heating, ${Math.round(heatProgress() * 100)}%` : 'Start shot';
  const ctaCls = 'cta cta-big' + (blocked ? ' cta-off' : '') + (hot && !low ? ' cta-heat' : '');
  const bean = c0.coffeeName ? `${esc(c0.coffeeName)}${c0.coffeeRoaster ? `<span style="color:var(--muted)"> · ${esc(c0.coffeeRoaster)}</span>` : ''}` : '<span style="color:var(--muted)">None chosen</span>';
  const roasted = batch && batch.roastDate ? `${fmt.dmy(batch.roastDate)}, ${fmt.ago(batch.roastDate)}` : '–';
  return `
    ${head('Next shot', '<a class="line" href="#profiles">Change profile</a>', esc(p && p.author ? p.author : 'Profile'), p ? p.title : 'No profile loaded', p && p.notes ? p.notes.slice(0, 150) : 'The machine’s own button also starts the shot.')}
    <div class="row2"><span class="eyebrow" style="padding-bottom:10px">Stop at weight</span><span style="display:flex;align-items:center;gap:16px">${saw ? `<span class="val">${fmt.n(yieldG)} g</span>` : '<span class="val" style="color:var(--faint)">Off</span>'}${sw('saw', saw, 'Stop at weight')}</span></div>
    <div class="row2"><p>${sum.temp ? sum.temp + '° · ' : ''}${fmt.n(c0.targetDoseWeight || 0)} → ${saw ? fmt.n(yieldG) + ' g' : 'no target'} · ${sum.steps} steps</p><nav class="acts" aria-label="Shot actions"><button type="button" class="line line-on" data-act="tare">Tare scale</button></nav></div>
    <section class="list" aria-label="Shot details">
      <span class="grp">Coffee</span>
      <a class="row row-link" href="#beans" aria-label="Bean: change on the Beans page"><span>Bean</span><span style="display:flex;align-items:center;gap:12px;min-width:0"><span class="val" style="overflow:hidden;text-overflow:ellipsis">${bean}</span><span aria-hidden="true" style="color:var(--muted);font-size:20px;line-height:1">›</span></span></a>
      ${rows([['Roasted', `<span class="val">${roasted}</span>`], ['Grinder', stepper('grind', c0.grinderSetting || '–', 'Finer', 'Coarser')]])}
      <span class="grp">Recipe</span>
      ${rows([['Dose', stepper('dose', fmt.n(c0.targetDoseWeight || 0) + ' g', 'Less coffee', 'More coffee')], ['Yield', stepper('yield', saw ? fmt.n(yieldG) + ' g' : 'Off', 'Less', 'More')], ['Temperature', `<span class="val">${sum.temp ? sum.temp + '°' : '–'}</span>`]])}
    </section>
    <section class="right3">
      <figure style="margin:12px 0 0 -60px">${graph({ height: 362, B: 318, xMax: niceMax(c.total), tempLo: lo, series: targetSeries(c, false), marks: c.marks, bands: bands(c), aria: 'Profile targets for the next shot', weightAxis: false })}</figure>
      <div class="bottom">
        ${issue ? issueBlock(issue) : legend('Target', [[COLORS.temp, 'Temperature'], [COLORS.pressure, 'Pressure'], [COLORS.flow, 'Flow']])}
        <button type="button" class="${ctaCls}" style="--heat:${Math.round(heatProgress() * 100)}%" aria-disabled="${blocked}" data-act="${blocked ? 'noop' : 'start'}">${ctaLabel} <span aria-hidden="true">→</span></button>
      </div>
    </section>`;
}

const niceMax = (t) => Math.max(30, Math.ceil((t || 30) / 10) * 10);

function liveSeries(points) {
  return [
    { pts: points.map((q) => [q.t, q.wf]), color: COLORS.weight, width: 2, dash: '2 3' },
    { pts: points.map((q) => [q.t, q.temp]), color: COLORS.temp, width: 3, temp: true },
    { pts: points.map((q) => [q.t, q.f]), color: COLORS.flow, width: 3 },
    { pts: points.map((q) => [q.t, q.p]), color: COLORS.pressure, width: 3 },
  ];
}

function pouringView() {
  const p = prof();
  const m = S.machine || {};
  const pts = (S.shot && S.shot.points) || [];
  const t = pts.length ? pts[pts.length - 1].t : 0;
  const steps = (p && p.steps) || [];
  const frame = m.profileFrame || 0;
  const step = steps[frame];
  const yieldG = ctx().targetYield || 0;
  const lost = (S.shotState && S.shotState.scaleLost) || !S.scale.connected;
  const w = S.scale.weight, wf = S.scale.flow;
  const dose = ctx().targetDoseWeight || 0;
  const { c, lo } = curves();
  const stopsAt = lost ? 'End of profile' : yieldG ? `${fmt.n(yieldG)} g` : 'End of profile';
  const issue = lost ? { title: 'No scale reading', text: 'The shot keeps going and stops at the end of the profile. Stop it yourself if the cup looks full.' } : null;
  const ro = (label, color, val, unit, cls = '') => `<div class="ro"><span class="eyebrow"><i style="background:${color}"></i>${label}</span><span class="ro-num ${cls}" data-live="${label}">${val}<small> ${unit}</small></span></div>`;
  return `
    ${head(`${fmt.n(t)} s`, `<span class="eyebrow" style="padding-bottom:10px">Step ${frame + 1} of ${steps.length || '?'}${step ? ', ' + esc(step.name) : ''}</span>`, `Pouring · stops at ${esc(stopsAt)}`, p ? p.title : 'Shot', 'Dashed lines are the profile’s targets. Solid lines are this shot, live.')}
    <div class="row2"><span class="eyebrow" style="padding-bottom:10px">Stops at</span><span class="val" style="padding-bottom:8px">${esc(stopsAt)}</span></div>
    <div class="row2"><p>${!lost && dose && w != null ? `1 : ${fmt.n(w / dose)} so far` : '&nbsp;'}</p><nav class="acts" aria-label="Shot actions"><button type="button" class="line line-on" data-act="skip">Skip to next step</button></nav></div>
    <section class="list" aria-label="Live readings" style="overflow:hidden">
      <div class="ro-grid">
        <div class="ro" style="grid-column:span 2"><span class="eyebrow">Weight</span><span class="ro-big ${lost ? 'ro-lost' : ''}">${lost ? '—' : fmt.n(w)}<small> g</small></span><span class="ro-sub">${lost ? 'Scale not reading' : yieldG ? `of ${fmt.n(yieldG)} g` : 'no target weight'}</span></div>
        ${ro('Pressure', COLORS.pressure, fmt.n(m.pressure), 'bar')}
        ${ro('Flow', COLORS.flow, fmt.n(m.flow), 'ml/s')}
        ${ro('Temperature', COLORS.temp, fmt.n(m.mixTemperature), '°')}
        ${ro('Weight flow', COLORS.weight, lost ? '—' : fmt.n(wf), 'g/s', lost ? 'ro-lost' : '')}
      </div>
    </section>
    <section class="right3">
      <figure style="margin:12px 0 0 -60px">${graph({ height: 362, B: 318, xMax: niceMax(Math.max(c.total, t + 5)), tempLo: lo, series: [...targetSeries(c, true), ...liveSeries(pts)], marks: c.marks, bands: bands(c), lines: [{ t, label: `Now, ${fmt.n(t)} s` }], aria: `Live shot graph at ${fmt.n(t)} seconds` })}</figure>
      <div class="bottom">
        ${issue ? issueBlock(issue) : legend('Live', [[COLORS.temp, 'Temperature'], [COLORS.pressure, 'Pressure'], [COLORS.flow, 'Flow'], [COLORS.weight, 'Weight flow', true]])}
        <button type="button" class="cta cta-big" data-act="stop">Stop <span aria-hidden="true">■</span></button>
      </div>
    </section>`;
}

const REASONS = { targetWeight: 'stopped by the scale', targetVolume: 'stopped by volume', machineEnded: 'profile finished', apiStop: 'stopped here', appStop: 'stopped in Decaid', error: 'ended with an error', disconnected: 'machine disconnected' };

function doneView() {
  const p = prof();
  const pts = S.shot.points;
  const end = pts.length ? pts[pts.length - 1].t : 0;
  const w = pts.map((q) => q.w).filter((x) => x != null);
  const out = w.length ? w[w.length - 1] : null;
  const dose = ctx().targetDoseWeight || 0;
  const peak = Math.max(0, ...pts.map((q) => q.p || 0));
  const flows = pts.map((q) => q.f).filter((x) => x > 0.2);
  const avgF = flows.length ? flows.reduce((a, b) => a + b, 0) / flows.length : null;
  const reason = S.shotState && S.shotState.decision && REASONS[S.shotState.decision.reason];
  const { c, lo } = curves();
  const stars = [1, 2, 3, 4, 5].map((n) => `<button type="button" class="star${n <= rating ? ' star-on' : ''}" data-act="rate" data-n="${n}" aria-label="Rate ${n} out of 5">${n}</button>`).join('');
  return `
    ${head(`${fmt.n(end)} s`, '<a class="line" href="#history">Open in history</a>', `Shot finished${reason ? ' · ' + esc(reason) : ''}`, p ? p.title : 'Shot', 'Add a rating and a note while you taste it. Both are saved to History.')}
    <div class="row2"><span class="eyebrow" style="padding-bottom:10px">Rating</span><span style="display:flex;gap:4px">${stars}</span></div>
    <div class="row2"><p>${fmt.n(dose)} → ${fmt.n(out)} g${dose && out ? ` · 1 : ${fmt.n(out / dose)}` : ''} · Peak ${fmt.n(peak)} bar</p><nav class="acts" aria-label="Shot actions"><button type="button" class="line line-on" data-act="upload" ${S.lastShotId ? '' : 'disabled'}>Upload to Visualizer</button></nav></div>
    <section class="list" aria-label="Shot summary">
      <label style="flex:none;display:flex;flex-direction:column;gap:4px;padding:12px 0 8px;border-top:1px solid var(--hair)"><span class="eyebrow">Note</span><textarea class="note" rows="2" style="border-bottom:0" data-in="note" placeholder="Sweet, a little sour. Grind one finer.">${esc(note)}</textarea></label>
      ${rows([['Time', `<span class="val">${fmt.n(end)} s</span>`], ['Yield', `<span class="val">${fmt.n(out)} g</span>`], ['Ratio', `<span class="val">${dose && out ? '1 : ' + fmt.n(out / dose) : '–'}</span>`], ['Peak pressure', `<span class="val">${fmt.n(peak)} bar</span>`], ['Average flow', `<span class="val">${fmt.n(avgF)} ml/s</span>`]])}
    </section>
    <section class="right3">
      <figure style="margin:12px 0 0 -60px">${graph({ height: 362, B: 318, xMax: niceMax(Math.max(c.total, end)), tempLo: lo, series: [...targetSeries(c, true), ...liveSeries(pts)], marks: c.marks, bands: bands(c), lines: [{ t: end, dash: true, end: true, label: reason ? reason[0].toUpperCase() + reason.slice(1) : 'Stopped' }], aria: 'Finished shot graph' })}</figure>
      <div class="bottom">
        ${legend('Shot', [[COLORS.temp, 'Temperature'], [COLORS.pressure, 'Pressure'], [COLORS.flow, 'Flow'], [COLORS.weight, 'Weight flow', true]])}
        <button type="button" class="cta cta-big" data-act="again">Again <span aria-hidden="true">→</span></button>
      </div>
    </section>`;
}

async function loadBatch() {
  const id = ctx().beanBatchId;
  if (!id || batchFor === id) return;
  batchFor = id;
  try { batch = await api.get(`/api/v1/bean-batches/${encodeURIComponent(id)}`); notify(); } catch (e) { batch = null; }
}

async function saveRating() {
  if (!S.lastShotId || (!rating && !note)) return;
  const annotations = {};
  if (rating) annotations.enjoyment = rating * 2;   // Decaid stores 0-10
  if (note) annotations.espressoNotes = note;
  await api.put(`/api/v1/shots/${encodeURIComponent(S.lastShotId)}`, { annotations });
}

const step = (v, d, by, min, max) => Math.max(min, Math.min(max, Math.round(((Number(v) || 0) + d * by) * 10) / 10));

export default {
  enter() { refreshWorkflow(); loadBatch(); },
  render() {
    loadBatch();
    const ph = phase();
    if (ph === 'pouring') return pouringView();
    if (ph === 'done') return doneView();
    return readyView();
  },
  live() {
    const ph = phase();
    const now = Date.now();
    if (ph === 'pouring' && now - lastPaint > 150) { lastPaint = now; this.repaint(); }
    else if (ph === 'ready' && heating() && now - lastPaint > 2000) { lastPaint = now; this.repaint(); }
  },
  onStore(kind) {
    if (kind === 'shotDone') { rating = 0; note = ''; }
    return true;
  },
  after() {},
  input(name, el) { if (name === 'note') note = el.value; },
  async act(a, el) {
    const c0 = ctx();
    if (a === 'start') { await api.setState('espresso'); }
    else if (a === 'force') { await api.setState('espresso'); }
    else if (a === 'wake') { await api.setState('idle'); }
    else if (a === 'devices') { location.hash = '#settings'; }
    else if (a === 'stop') { await api.setState('idle'); }
    else if (a === 'skip') { await api.setState('skipStep'); }
    else if (a === 'tare') { await api.tare(); toast('Scale tared'); }
    else if (a === 'saw') { await patchWorkflow({ context: { targetYield: c0.targetYield > 0 ? 0 : lastYield } }); }
    else if (a === 'dose') { await patchWorkflow({ context: { targetDoseWeight: step(c0.targetDoseWeight, +el.dataset.dir, 0.5, 5, 30) } }); }
    else if (a === 'yield') { await patchWorkflow({ context: { targetYield: step(c0.targetYield || lastYield, +el.dataset.dir, 1, 1, 200) } }); }
    else if (a === 'grind') {
      const cur = parseFloat(c0.grinderSetting);
      if (isNaN(cur)) { toast('Set your grinder in Settings first'); return; }
      await patchWorkflow({ context: { grinderSetting: String(step(cur, +el.dataset.dir, 0.5, 0, 999)) } });
    }
    else if (a === 'rate') { rating = +el.dataset.n; notify(); }
    else if (a === 'upload') {
      await saveRating();
      await api.post('/api/v1/plugins/visualizer.reaplugin/upload', { shotId: S.lastShotId });
      toast('Sent to Visualizer');
    }
    else if (a === 'again') {
      try { await saveRating(); if (rating || note) toast('Rating saved'); } catch (e) { toast('Could not save the rating: ' + e.message); }
      dismissed = S.shot; rating = 0; note = ''; notify();
    }
  },
};
