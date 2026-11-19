// H2O: steam, hot water and flush.
import { S, machineState, patchWorkflow, refreshWorkflow } from '../store.js';
import { api } from '../api.js';
import { stepper, sw, fmt, toast } from '../ui.js';

let rea = null;
let startedAt = {};

const wf = () => S.workflow || {};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v * 10) / 10));
const row = (label, right) => `<div class="row row-static" style="font-size:16px"><span>${label}</span>${right}</div>`;
const st = (act, value, less, more) => stepper(act, value, less, more).replace('<span>', '<span style="min-width:72px;font-size:16px">');

const MODES = {
  steam: { state: 'steam', kicker: 'For milk', title: 'Steam', bigLabel: 'Steaming for' },
  water: { state: 'hotWater', kicker: 'For tea and americano', title: 'Hot water', bigLabel: 'Poured' },
  flush: { state: 'flush', kicker: 'Rinse the group head', title: 'Flush', bigLabel: 'Time left' },
};

function col(key, rows) {
  const m = MODES[key];
  const running = machineState() === m.state;
  const other = !running && ['steam', 'hotWater', 'flush', 'espresso'].includes(machineState());
  const el = running && startedAt[key] ? (Date.now() - startedAt[key]) / 1000 : 0;
  let big = '0 s';
  if (key === 'steam') big = `${Math.round(el)} s`;
  if (key === 'water') big = running && S.scale.connected ? `${fmt.n(S.scale.weight, 0)} g` : running ? `${Math.round(el)} s` : `${(wf().hotWaterData || {}).volume || 0} ml`;
  if (key === 'flush') big = `${Math.max(0, Math.round(((wf().rinseData || {}).duration || 0) - el))} s`;
  return `<section class="col" style="grid-row:1/-1;display:flex;flex-direction:column;min-width:0;min-height:0;${other ? 'opacity:.35' : ''}" aria-label="${m.title}">
    <div class="head"><div><span class="eyebrow">${m.kicker}</span><h2 class="h2" style="margin-top:6px">${m.title}</h2></div><span class="eyebrow" style="padding-bottom:8px">${running ? 'Running' : other ? 'Busy' : 'Ready'}</span></div>
    <div style="padding:8px 0 16px;display:flex;flex-direction:column;gap:2px"><span class="eyebrow">${key === 'water' && !running ? 'Will pour' : m.bigLabel}</span><span class="big" data-big="${key}">${big}</span></div>
    <div style="border-bottom:1px solid var(--hair)">${rows.join('')}</div>
    <div style="margin-top:auto;display:flex;justify-content:flex-end">
      <button type="button" class="cta cta-big${other ? ' cta-off' : ''}" data-act="${running ? 'stop' : other ? 'noop' : 'go'}" data-mode="${key}">${running ? 'Stop <span aria-hidden="true">■</span>' : 'Start <span aria-hidden="true">→</span>'}</button>
    </div></section>`;
}

export default {
  wide: true,
  enter() { refreshWorkflow(); api.get('/api/v1/settings').then((r) => { rea = r; this.repaint && this.repaint(); }).catch(() => {}); },
  render() {
    const s = wf().steamSettings || {}, w = wf().hotWaterData || {}, r = wf().rinseData || {};
    for (const k of Object.keys(MODES)) { if (machineState() === MODES[k].state) { startedAt[k] = startedAt[k] || Date.now(); } else startedAt[k] = 0; }
    const saw = rea ? rea.stopHotWaterAtWeight !== false : true;
    return col('steam', [
      row('Steam temperature', st('s.temp', `${s.targetTemperature || 0}°`, 'Cooler', 'Hotter')),
      row('Stop after', st('s.dur', `${s.duration || 0} s`, 'Shorter', 'Longer')),
      row('Flow, for jug size', st('s.flow', `${fmt.n(s.flow)} ml/s`, 'Less flow', 'More flow')),
    ]) + col('water', [
      row('Volume', st('w.vol', `${w.volume || 0} ml`, 'Less', 'More')),
      row('Temperature', st('w.temp', `${w.targetTemperature || 0}°`, 'Cooler', 'Hotter')),
      row('Flow', st('w.flow', `${fmt.n(w.flow)} ml/s`, 'Slower', 'Faster')),
      row('Stop by weight on scale', sw('w.saw', saw, 'Stop hot water by weight on the scale')),
    ]) + col('flush', [
      row('Duration', st('r.dur', `${r.duration || 0} s`, 'Shorter', 'Longer')),
      row('Flow', st('r.flow', `${fmt.n(r.flow)} ml/s`, 'Slower', 'Faster')),
      row('Temperature', st('r.temp', `${r.targetTemperature || 0}°`, 'Cooler', 'Hotter')),
    ]);
  },
  live(el) {
    for (const k of Object.keys(MODES)) {
      if (machineState() !== MODES[k].state) continue;
      const big = el.querySelector(`[data-big="${k}"]`);
      if (!big) continue;
      const t = (Date.now() - (startedAt[k] || Date.now())) / 1000;
      big.textContent = k === 'flush' ? `${Math.max(0, Math.round(((wf().rinseData || {}).duration || 0) - t))} s` : k === 'water' && S.scale.connected ? `${fmt.n(S.scale.weight, 0)} g` : `${Math.round(t)} s`;
    }
  },
  async act(a, el) {
    const d = +el.dataset.dir || 0;
    const s = wf().steamSettings || {}, w = wf().hotWaterData || {}, r = wf().rinseData || {};
    if (a === 'go') { await api.setState(MODES[el.dataset.mode].state); return; }
    if (a === 'stop') { await api.setState('idle'); return; }
    if (a === 'w.saw') {
      const on = !(rea ? rea.stopHotWaterAtWeight !== false : true);
      rea = await api.post('/api/v1/settings', { stopHotWaterAtWeight: on }).catch((e) => { toast(e.message); return rea; }) || { ...rea, stopHotWaterAtWeight: on };
      this.repaint(); return;
    }
    const patches = {
      's.temp': { steamSettings: { targetTemperature: clamp((s.targetTemperature || 0) + d * 5, 100, 170) } },
      's.dur': { steamSettings: { duration: clamp((s.duration || 0) + d * 5, 5, 250) } },
      's.flow': { steamSettings: { flow: clamp((s.flow || 0) + d * 0.1, 0.4, 2.5) } },
      'w.vol': { hotWaterData: { volume: clamp((w.volume || 0) + d * 10, 10, 250) } },
      'w.temp': { hotWaterData: { targetTemperature: clamp((w.targetTemperature || 0) + d, 40, 100) } },
      'w.flow': { hotWaterData: { flow: clamp((w.flow || 0) + d * 0.5, 1, 10) } },
      'r.dur': { rinseData: { duration: clamp((r.duration || 0) + d, 1, 60) } },
      'r.flow': { rinseData: { flow: clamp((r.flow || 0) + d * 0.5, 1, 10) } },
      'r.temp': { rinseData: { targetTemperature: clamp((r.targetTemperature || 0) + d, 60, 100) } },
    };
    if (patches[a]) await patchWorkflow(patches[a]);
  },
};
