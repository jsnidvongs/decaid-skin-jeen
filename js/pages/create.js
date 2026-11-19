// Create: opened from Profiles to make a new profile or edit a copy, step by step, and save it as your own.
import { S, patchWorkflow } from '../store.js';
import { api } from '../api.js';
import { esc, graph, profileCurves, tempWindow, stepper, seg, fmt, toast, COLORS } from '../ui.js';
import { TAGS, tagsOf, loadProfiles } from './profiles.js';
import { go } from '../app.js';

let draft = null, parentId = null, tags = ['own'], picked = 0, more = false, dirty = false, cancelArmed = false;

const clone = (x) => JSON.parse(JSON.stringify(x));
const blank = () => ({ version: '2', title: 'New profile', author: 'Me', notes: '', beverage_type: 'espresso', target_weight: 36, target_volume: 0, target_volume_count_start: 0, tank_temperature: 0,
  steps: [
    { name: 'Fill', pump: 'flow', flow: 6, pressure: 0, temperature: 93, sensor: 'coffee', transition: 'fast', seconds: 12, volume: 0, exit: { type: 'pressure', condition: 'over', value: 4 } },
    { name: 'Pour', pump: 'pressure', pressure: 9, flow: 0, temperature: 93, sensor: 'coffee', transition: 'fast', seconds: 30, volume: 0 },
  ] });

function startFrom(rec, fresh) {
  const p = rec ? rec.profile : fresh ? blank() : (S.workflow && S.workflow.profile) || blank();
  draft = clone(p);
  if (rec) draft.title = /my version/i.test(draft.title) ? draft.title : `${draft.title}, my version`;
  parentId = rec ? rec.id : null;
  tags = rec ? tagsOf(rec).filter((t) => t !== 'own') : [];
  picked = Math.min(2, (draft.steps || []).length - 1);
  if (picked < 0) picked = 0;
  more = false;
  dirty = false;
  cancelArmed = false;
}

const EXITS = [['none', 'No early exit'], ['pressure-over', 'Pressure over'], ['pressure-under', 'Pressure under'], ['flow-over', 'Flow over'], ['flow-under', 'Flow under'], ['weight', 'Weight over']];
function exitKind(s) {
  if (s.weight) return 'weight';
  if (s.exit && s.exit.type) return `${s.exit.type}-${s.exit.condition}`;
  return 'none';
}
function exitValue(s) {
  const k = exitKind(s);
  if (k === 'weight') return `${fmt.n(s.weight)} g`;
  if (k === 'none') return '';
  return `${fmt.n(s.exit.value)} ${s.exit.type === 'pressure' ? 'bar' : 'ml/s'}`;
}
const summary = (s) => `${s.pump === 'flow' ? 'Flow ' + fmt.n(s.flow) + ' ml/s' : 'Pressure ' + fmt.n(s.pressure) + ' bar'} · ${Math.round(s.seconds)} s`;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * 10) / 10));
const ctl = (label, inner) => `<div class="ctl"><span class="eyebrow">${label}</span>${inner}</div>`;

export default {
  enter(arg) { if (arg === 'new') startFrom(null, true); else if (arg || !draft) startFrom(arg); },
  render() {
    if (!draft) startFrom(null);
    const steps = draft.steps || [];
    const s = steps[picked] || {};
    const c = profileCurves(draft);
    const lo = tempWindow(steps.map((x) => Number(x.temperature)));
    const m0 = c.marks[picked], m1 = c.marks[picked + 1];
    const band = m0 ? [[m0.t, m1 ? m1.t : c.total]] : [];
    const xMax = Math.max(30, Math.ceil(c.total / 10) * 10);
    const isFlow = s.pump === 'flow';
    const ek = exitKind(s);
    return `
      <div class="head"><h2 class="h2">Steps</h2><button type="button" class="line" data-act="add">Add step</button></div>
      <div class="head" style="align-items:flex-end"><label style="flex:1;min-width:0"><span class="eyebrow">Profile name</span><input class="namefield" data-in="title" value="${esc(draft.title)}"></label><nav class="acts" style="padding-bottom:2px"><button type="button" class="line line-on" data-act="cancel">${cancelArmed ? 'Discard changes' : 'Cancel'}</button><button type="button" class="line line-on" data-act="save">Save</button></nav></div>
      <div class="row2" style="align-items:center"><span><span class="eyebrow">Stop at weight</span></span>${stepper('tw', draft.target_weight ? fmt.n(draft.target_weight) + ' g' : 'Off', 'Less', 'More')}</div>
      <div class="row2" style="align-items:flex-end"><span class="eyebrow" style="padding-bottom:10px">Shows in</span><span style="display:flex;gap:28px"><span class="line line-on" style="cursor:default">Own, always</span>${TAGS.map(([k, l]) => `<button type="button" class="line${tags.includes(k) ? ' line-on' : ' line-dim'}" data-act="tag" data-val="${k}" aria-pressed="${tags.includes(k)}">${tags.includes(k) ? '✓' : '+'} ${l}</button>`).join('')}</span></div>
      <section class="list" aria-label="Steps">
        ${steps.map((x, i) => `<button type="button" class="row${i === picked ? ' row-on' : ''}" aria-pressed="${i === picked}" data-act="pick" data-i="${i}"><span class="row-name">${i + 1}  ${esc(x.name || 'Step')}</span><span class="row-meta">${esc(summary(x))}</span></button>`).join('')}
      </section>
      <section class="right3" aria-label="Selected step">
        <figure style="margin:12px 0 0 -60px">${graph({ height: 224, B: 180, xMax, tempLo: lo, series: [{ pts: c.T, color: COLORS.temp, temp: true }, { pts: c.F, color: COLORS.flow }, { pts: c.P, color: COLORS.pressure }], marks: c.marks, bands: band, aria: 'Profile targets', weightAxis: false })}</figure>
        <div class="ctl-grid">
          ${ctl(`Step ${picked + 1} controls`, seg('pump', [['pressure', 'Pressure'], ['flow', 'Flow']], s.pump, 'Pump control'))}
          ${ctl('Target', stepper('target', isFlow ? fmt.n(s.flow) + ' ml/s' : fmt.n(s.pressure) + ' bar', 'Lower target', 'Raise target').replace('class="step"', 'class="step" style="margin-left:-14px"'))}
          ${ctl('Temperature', stepper('temp', fmt.n(s.temperature) + '°', 'Cooler', 'Hotter').replace('class="step"', 'class="step" style="margin-left:-14px"'))}
          ${ctl('Ends after', stepper('secs', Math.round(s.seconds) + ' s', 'Shorter', 'Longer').replace('class="step"', 'class="step" style="margin-left:-14px"'))}
        </div>
        ${more ? `<div class="ctl-grid">
          ${ctl('Ends early if', `<span style="display:flex;align-items:center;gap:8px"><button type="button" class="line" style="padding-left:0" data-act="exit">${esc(EXITS.find((e) => e[0] === ek)[1])} ▾</button>${ek !== 'none' ? stepper('exitv', exitValue(s), 'Lower', 'Higher').replace('<span>', '<span style="min-width:64px">') : ''}</span>`)}
          ${ctl('Transition', seg('trans', [['fast', 'Fast'], ['smooth', 'Smooth']], s.transition, 'Transition'))}
          ${ctl('Limiter', stepper('limit', s.limiter && s.limiter.value ? fmt.n(s.limiter.value) + (isFlow ? ' bar' : ' ml/s') : 'Off', 'Lower limit', 'Raise limit').replace('class="step"', 'class="step" style="margin-left:-14px"'))}
          ${ctl('Step name', `<span style="display:flex;gap:16px;align-items:flex-end"><label class="fld" style="flex:1"><input data-in="sname" value="${esc(s.name || '')}" aria-label="Step name"></label><button type="button" class="line line-on" data-act="del" ${steps.length < 2 ? 'disabled' : ''}>Delete</button></span>`)}
        </div>` : ''}
        <div class="bottom">
          <button type="button" class="line" aria-expanded="${more}" data-act="more">${more ? `Fewer options for step ${picked + 1} ▴` : `More options for step ${picked + 1} ▾`}</button>
          <button type="button" class="cta" data-act="saveuse">Save and use <span aria-hidden="true">→</span></button>
        </div>
      </section>`;
  },
  input(name, el) {
    if (name === 'title') { draft.title = el.value; dirty = true; }
    if (name === 'sname') { draft.steps[picked].name = el.value; dirty = true; }
  },
  changed(name) { if (name === 'sname') this.repaint(); },
  async act(a, el) {
    const steps = draft.steps;
    const s = steps[picked];
    const dir = +el.dataset.dir || 0;
    const edit = () => { dirty = true; cancelArmed = false; this.repaint(); };
    if (a === 'pick') { picked = +el.dataset.i; this.repaint(); }
    else if (a === 'more') { more = !more; this.repaint(); }
    else if (a === 'tag') { const k = el.dataset.val; tags = tags.includes(k) ? tags.filter((t) => t !== k) : [...tags, k]; edit(); }
    else if (a === 'tw') { draft.target_weight = clamp((draft.target_weight || 0) + dir, 0, 200); edit(); }
    else if (a === 'add') { steps.splice(picked + 1, 0, { ...clone(s || blank().steps[1]), name: 'New step', exit: undefined, weight: undefined }); picked += 1; edit(); }
    else if (a === 'pump') { s.pump = el.dataset.val; if (s.pump === 'flow' && !s.flow) s.flow = 2; if (s.pump === 'pressure' && !s.pressure) s.pressure = 6; edit(); }
    else if (a === 'target') { if (s.pump === 'flow') s.flow = clamp((s.flow || 0) + dir * 0.1, 0, 10); else s.pressure = clamp((s.pressure || 0) + dir * 0.1, 0, 12); edit(); }
    else if (a === 'temp') { s.temperature = clamp((s.temperature || 93) + dir * 0.5, 60, 105); edit(); }
    else if (a === 'secs') { s.seconds = clamp((s.seconds || 0) + dir, 1, 127); edit(); }
    else if (a === 'trans') { s.transition = el.dataset.val; edit(); }
    else if (a === 'limit') {
      const v = clamp(((s.limiter && s.limiter.value) || 0) + dir * 0.5, 0, 12);
      s.limiter = v ? { value: v, range: (s.limiter && s.limiter.range) || 0.6 } : undefined; edit();
    }
    else if (a === 'exit') {
      const order = EXITS.map((e) => e[0]);
      const next = order[(order.indexOf(exitKind(s)) + 1) % order.length];
      delete s.exit; delete s.weight;
      if (next === 'weight') s.weight = 4;
      else if (next !== 'none') { const [type, condition] = next.split('-'); s.exit = { type, condition, value: type === 'pressure' ? 4 : 2 }; }
      edit();
    }
    else if (a === 'exitv') {
      if (s.weight) s.weight = clamp(s.weight + dir, 0, 100);
      else if (s.exit) s.exit.value = clamp(s.exit.value + dir * (s.exit.type === 'pressure' ? 0.5 : 0.1), 0, 12);
      edit();
    }
    else if (a === 'del') { steps.splice(picked, 1); picked = Math.max(0, picked - 1); edit(); }
    else if (a === 'cancel') {
      if (dirty && !cancelArmed) { cancelArmed = true; toast('Tap again to discard your changes'); this.repaint(); return; }
      draft = null; cancelArmed = false; go('profiles');
    }
    else if (a === 'save' || a === 'saveuse') {
      if (!draft.title.trim()) { toast('Give the profile a name first'); return; }
      const body = { profile: draft, metadata: { tags: [...new Set(['own', ...tags])] } };
      if (parentId) body.parentId = parentId;
      const rec = await api.post('/api/v1/profiles', body);
      dirty = false;
      await loadProfiles(true);
      if (rec && rec.id) parentId = rec.id;
      if (a === 'saveuse') { await patchWorkflow({ profile: draft }); toast(`Saved and loaded ${draft.title}`); go('shot'); }
      else toast(`Saved ${draft.title}`);
    }
  },
};
