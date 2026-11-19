#!/usr/bin/env node
// A small stand-in for Decaid, so the skin can be tried without a DE1.
// It serves the skin on http://localhost:3000 and a fake API on http://localhost:8080.
// No dependencies: run `node dev/fake-decaid.js`.
//
// Handy switches for testing problem states (POST with curl, or open in a browser with ?):
//   /dev/state?s=heating | needsWater | sleeping | idle
//   /dev/scale?on=0 | 1        (turn the scale off or on, also mid-shot)
//   /dev/water?mm=3            (set the water level)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SKIN_PORT = +process.env.SKIN_PORT || 3000;
const API_PORT = +process.env.API_PORT || 8080;
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

// ---------------- data ----------------
const step = (name, pump, target, temp, seconds, extra = {}) => ({ name, pump, transition: 'fast', temperature: temp, sensor: 'coffee', seconds, volume: 0,
  pressure: pump === 'pressure' ? target : 0, flow: pump === 'flow' ? target : 0, ...extra });
const PROFILES = [
  { title: 'D-Flow', author: 'Damian', notes: 'Fill, soak, then pressure into a flow-limited decline. Good all-rounder.', target_weight: 40,
    steps: [step('Fill', 'flow', 8, 94, 4, { exit: { type: 'pressure', condition: 'over', value: 3 } }), step('Soak', 'pressure', 3, 94, 4), step('Hold', 'pressure', 9, 94, 24, { limiter: { value: 2.5, range: 0.6 } }), step('Decline', 'pressure', 6, 93, 12, { transition: 'smooth' })] },
  { title: 'Blooming espresso', author: 'Decent', notes: 'Wet the puck, let it bloom, then pour. Bright and sweet for light roasts.', target_weight: 42,
    steps: [step('Fill', 'flow', 4, 92, 8, { exit: { type: 'pressure', condition: 'over', value: 2 } }), step('Bloom', 'flow', 0, 92, 20), step('Pour', 'flow', 2.2, 92, 25, { limiter: { value: 9, range: 0.6 } })] },
  { title: 'Londinium', author: 'Decent', notes: 'Lever-style: long preinfusion then a falling pressure curve. Classic, syrupy.', target_weight: 36,
    steps: [step('Preinfuse', 'flow', 4, 90, 15, { exit: { type: 'pressure', condition: 'over', value: 3.5 } }), step('Rise', 'pressure', 9, 90, 4), step('Decline', 'pressure', 4.5, 90, 26, { transition: 'smooth' })] },
  { title: 'Adaptive v2', author: 'Decent', notes: 'Finds the right flow for your grind after the first seconds.', target_weight: 36,
    steps: [step('Fill', 'flow', 8, 93, 5), step('Rise', 'pressure', 8.6, 93, 8), step('Adapt', 'flow', 2, 93, 30, { limiter: { value: 9, range: 0.6 } })] },
  { title: 'Extractamundo Dos', author: 'Decent', notes: 'Fast, high-extraction profile for light roasts.', target_weight: 45,
    steps: [step('Fill', 'flow', 7, 95, 6), step('Pour', 'flow', 3.5, 95, 26)] },
  { title: 'Allongé', author: 'Decent', notes: 'Long, flow-driven shot. Rao-style, turbo grind.', target_weight: 90,
    steps: [step('Pour', 'flow', 4.5, 96, 30)] },
];
const hash = (p) => 'profile:' + crypto.createHash('sha1').update(JSON.stringify(p.steps) + p.title).digest('hex').slice(0, 16);
const profiles = PROFILES.map((p, i) => {
  const profile = { version: '2', beverage_type: 'espresso', target_volume: 0, target_volume_count_start: 0, tank_temperature: 0, ...p };
  return { id: hash(profile), profile, parentId: null, visibility: 'visible', isDefault: true, createdAt: now(), updatedAt: now(),
    metadata: { tags: i === 0 ? ['favourite', 'modern'] : i === 2 ? ['classic'] : i === 3 ? ['modern'] : [] } };
});
{
  const own = JSON.parse(JSON.stringify(profiles[0].profile));
  own.title = 'D-Flow, my version'; own.notes = 'My copy of D-Flow with a slightly longer soak.'; own.steps[1].seconds = 6;
  profiles.unshift({ id: hash(own), profile: own, parentId: profiles[0].id, visibility: 'visible', isDefault: false, createdAt: now(), updatedAt: now(), metadata: { tags: ['own', 'favourite', 'modern'] } });
}

const beans = [], batches = [];
function addBean(b, bag) { const bean = { id: uid(), archived: false, decaf: false, createdAt: now(), updatedAt: now(), ...b }; beans.push(bean);
  const batch = { id: uid(), beanId: bean.id, archived: false, frozen: false, createdAt: now(), updatedAt: now(), ...bag }; batches.push(batch); return [bean, batch]; }
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
const [guji, gujiBag] = addBean({ roaster: 'Roots Roastery', name: 'Guji', country: 'Ethiopia', region: 'Guji', processing: 'Washed', notes: 'Jasmine, peach, black tea.' }, { roastDate: daysAgo(9), roastLevel: 'Light', weight: 250, weightRemaining: 112 });
addBean({ roaster: 'Roots Roastery', name: 'Huila', country: 'Colombia', region: 'Huila', processing: 'Natural', notes: 'Red fruit, cocoa. Good with milk.' }, { roastDate: daysAgo(22), roastLevel: 'Medium', weight: 500, weightRemaining: 230 });
addBean({ roaster: 'Local roaster', name: 'House blend', country: 'Brazil', processing: 'Natural', notes: 'Chocolate, nuts.', archived: true }, { roastDate: daysAgo(49), roastLevel: 'Medium dark', weight: 1000, weightRemaining: 0, archived: true });
addBean({ roaster: 'Roots Roastery', name: 'Decaf Sumatra', country: 'Indonesia', region: 'Aceh', processing: 'Sugarcane decaf', decaf: true, notes: 'Earthy, sweet.' }, { roastDate: daysAgo(30), roastLevel: 'Medium', weight: 250, weightRemaining: 180 });
const grinders = [{ id: uid(), model: 'Niche Zero', burrs: '63 mm conical', settingType: 'numeric' }];

let workflow = {
  name: 'Default', profile: JSON.parse(JSON.stringify(profiles[0].profile)),
  context: { targetDoseWeight: 18, targetYield: 40, grinderId: grinders[0].id, grinderModel: 'Niche Zero', grinderSetting: '12', beanBatchId: gujiBag.id, coffeeName: 'Guji', coffeeRoaster: 'Roots Roastery' },
  steamSettings: { targetTemperature: 150, duration: 45, flow: 1.2, stopAtTemperature: 0 },
  hotWaterData: { targetTemperature: 85, duration: 60, volume: 200, flow: 4 },
  rinseData: { targetTemperature: 88, duration: 5, flow: 6 },
};
let rea = { blockOnNoScale: false, stopHotWaterAtWeight: true, keepAwake: true, gatewayMode: 'disabled' };
let machineSettings = { usb: false, fan: 50, flushTemp: 88, flushFlow: 6, flushTimeout: 5, hotWaterFlow: 4, steamFlow: 1.2, tankTemp: 0, steamPurgeMode: 0 };
let display = { wakeLockEnabled: true, wakeLockOverride: false, brightness: 70, requestedBrightness: 70, lowBatteryBrightnessActive: false, platformSupported: { brightness: true, wakeLock: true } };
let water = { currentLevel: 36, refillLevel: 5 };
const shots = [], steams = [];
const kv = {};

// ---------------- machine simulation ----------------
let state = process.env.SIM_START || 'idle', substate = 'idle';
let group = state === 'heating' ? 70 : 93.4;
let scaleOn = true, weight = 0, wflow = 0;
let run = null;   // current espresso/steam/water/flush run
let shotState = { event: 'state', state: 'idle', shotId: null, scaleConnected: true, scaleLost: false, decision: null };

const frameTargets = (p, t) => {
  let acc = 0;
  for (let i = 0; i < p.steps.length; i++) { const s = p.steps[i]; if (t < acc + s.seconds) return { i, s, into: t - acc }; acc += s.seconds; }
  return null;
};
const noise = (a) => (Math.random() - 0.5) * a;
const ease = (cur, target, k) => cur + (target - cur) * k;

function startEspresso() {
  run = { kind: 'espresso', t0: Date.now(), p: 0, f: 0, temp: 92, frameOffset: 0, skip: 0, measurements: [], id: uid(), lost: false };
  weight = 0; wflow = 0;
  state = 'espresso'; substate = 'preinfusion';
  shotState = { event: 'state', state: 'pouring', shotId: run.id, scaleConnected: scaleOn, scaleLost: false, decision: null };
  broadcast('shotState', shotState);
}
function finishEspresso(reason) {
  const r = run; run = null;
  state = 'idle'; substate = 'idle';
  const record = { id: r.id, timestamp: new Date(r.t0).toISOString(), createdAt: now(), updatedAt: now(), measurements: r.measurements,
    workflow: JSON.parse(JSON.stringify(workflow)), annotations: { actualDoseWeight: workflow.context.targetDoseWeight, actualYield: Math.round(weight * 10) / 10 }, stopReason: reason, metadata: {} };
  shots.unshift(record);
  const b = batches.find((x) => x.id === workflow.context.beanBatchId);
  if (b && b.weightRemaining) b.weightRemaining = Math.max(0, b.weightRemaining - (workflow.context.targetDoseWeight || 18));
  shotState = { event: 'terminal', state: 'idle', shotId: r.id, scaleConnected: scaleOn, scaleLost: r.lost, decision: { kind: 'stop', reason, details: '' } };
  broadcast('shotState', shotState);
}

function tick() {
  const dt = 0.1;
  if (state === 'heating') { group = Math.min(93.4, group + 0.35); if (group >= 93.3) state = 'idle'; }
  if (run && run.kind === 'espresso') {
    const p = workflow.profile;
    const t = (Date.now() - run.t0) / 1000 + run.skip;
    const ft = frameTargets(p, t);
    const yieldTarget = workflow.context.targetYield || 0;
    if (!scaleOn) run.lost = true;
    if (!ft) { finishEspresso('machineEnded'); }
    else if (yieldTarget && scaleOn && !run.lost && weight >= yieldTarget - wflow * 0.3) { finishEspresso('targetWeight'); }
    else {
      const s = ft.s;
      run.frame = ft.i;
      if (s.exit && s.exit.type === 'pressure' && s.exit.condition === 'over' && run.p > s.exit.value) run.skip += s.seconds - ft.into;
      const k = s.transition === 'smooth' ? 0.04 : 0.25;
      if (s.pump === 'pressure') {
        run.p = ease(run.p, s.pressure, k);
        const lim = s.limiter && s.limiter.value ? s.limiter.value : 99;
        run.f = Math.min(lim, ease(run.f, t < 6 ? 4 : 1.8 + run.p * 0.05, 0.2));
      } else {
        run.f = ease(run.f, s.flow, k);
        run.p = ease(run.p, t < 3 ? 0.5 : Math.min(9.2, s.flow * 3.6), 0.12);
      }
      run.temp = ease(run.temp, s.temperature, 0.15);
      if (t > 6 && scaleOn) { wflow = ease(wflow, Math.max(0, run.f * 0.82), 0.3); weight += wflow * dt; }
      substate = t < 8 ? 'preinfusion' : 'pouring';
      run.measurements.push({ machine: snap(), scale: scaleOn ? { timestamp: now(), weight: Math.round(weight * 10) / 10, weightFlow: Math.round(wflow * 100) / 100 } : null, volume: 0 });
    }
  }
  if (run && run.kind !== 'espresso') {
    const t = (Date.now() - run.t0) / 1000;
    if (run.kind === 'hotWater' && scaleOn) weight += (workflow.hotWaterData.flow || 4) * dt * 0.95;
    const limit = run.kind === 'steam' ? workflow.steamSettings.duration : run.kind === 'flush' ? workflow.rinseData.duration
      : (rea.stopHotWaterAtWeight && scaleOn ? (weight >= workflow.hotWaterData.volume ? 0 : 999) : workflow.hotWaterData.duration);
    if (t >= limit) { if (run.kind === 'steam') steams.unshift({ id: uid(), timestamp: new Date(run.t0).toISOString(), measurements: [], workflow: JSON.parse(JSON.stringify(workflow)), annotations: {} }); run = null; state = 'idle'; }
  }
  broadcast('snapshot', snap());
  if (scaleOn) broadcast('scale', { timestamp: now(), weight: Math.round((weight + noise(0.04)) * 10) / 10, weightFlow: Math.round(wflow * 100) / 100, batteryLevel: 80 });
}
function snap() {
  const r = run && run.kind === 'espresso' ? run : null;
  const tp = r ? (frameTargets(workflow.profile, (Date.now() - r.t0) / 1000 + r.skip) || {}).s : null;
  return { timestamp: now(), state: { state, substate },
    flow: r ? Math.max(0, r.f + noise(0.05)) : state === 'flush' ? 6 : state === 'hotWater' ? 4 : 0,
    pressure: r ? Math.max(0, r.p + noise(0.06)) : 0,
    targetFlow: tp ? tp.flow : 0, targetPressure: tp ? tp.pressure : 0,
    mixTemperature: r ? r.temp + noise(0.1) : group - 1, groupTemperature: group + noise(0.05),
    targetMixTemperature: tp ? tp.temperature : 93, targetGroupTemperature: 93.4, profileFrame: r ? r.frame || 0 : 0, steamTemperature: 150 };
}

// Seed some history by running quick offline shots.
function seed() {
  const recipes = [[0, 8, 'Sweet, a little sour. Grind one finer.'], [1, 9, 'Lovely florals.'], [0, 7, ''], [2, 6, 'Too bitter.'], [3, 8, 'Good with milk.'], [0, 9, 'Best one yet.'], [1, null, '']];
  recipes.forEach(([pi, enjoy, notes], n) => {
    const p = profiles[pi].profile;
    const t0 = Date.now() - (n * 1.3 + 0.2) * 86400000;
    const meas = []; let pr = 0, fl = 0, w = 0, wf = 0, tmp = 92; let tt = 0;
    while (tt < 60) {
      const ft = frameTargets(p, tt); if (!ft) break; const s = ft.s;
      if (s.pump === 'pressure') { pr = ease(pr, s.pressure, 0.25); fl = ease(fl, tt < 6 ? 4 : 1.9, 0.2); } else { fl = ease(fl, s.flow, 0.25); pr = ease(pr, tt < 3 ? 0.5 : Math.min(9, s.flow * 3.6), 0.12); }
      tmp = ease(tmp, s.temperature, 0.15);
      if (tt > 6) { wf = ease(wf, fl * 0.82, 0.3); w += wf * 0.1; }
      const ts = new Date(t0 + tt * 1000).toISOString();
      meas.push({ machine: { timestamp: ts, state: { state: 'espresso', substate: 'pouring' }, pressure: pr + noise(0.08), flow: fl + noise(0.06), mixTemperature: tmp + noise(0.1), groupTemperature: 93.4, profileFrame: ft.i, targetPressure: s.pressure, targetFlow: s.flow, targetMixTemperature: s.temperature }, scale: { timestamp: ts, weight: w, weightFlow: wf }, volume: 0 });
      if (w >= p.target_weight) break;
      tt += 0.1;
    }
    const wfCopy = JSON.parse(JSON.stringify(workflow)); wfCopy.profile = JSON.parse(JSON.stringify(p));
    if (n === 3) { wfCopy.context.coffeeName = 'Huila'; wfCopy.context.beanBatchId = batches[1].id; }
    shots.push({ id: uid(), timestamp: new Date(t0).toISOString(), createdAt: now(), updatedAt: now(), measurements: meas, workflow: wfCopy,
      annotations: { actualDoseWeight: 18, actualYield: Math.round(w * 10) / 10, ...(enjoy != null ? { enjoyment: enjoy } : {}), ...(notes ? { espressoNotes: notes } : {}) }, stopReason: 'targetWeight', metadata: {} });
  });
  steams.push({ id: uid(), timestamp: new Date(Date.now() - 86400000).toISOString(), measurements: [], workflow: JSON.parse(JSON.stringify(workflow)), annotations: {} });
}
seed();

// ---------------- websocket (just enough to send text frames) ----------------
const sockets = { snapshot: new Set(), scale: new Set(), water: new Set(), shotState: new Set() };
function wsFrame(str) {
  const data = Buffer.from(str);
  const len = data.length;
  const head = len < 126 ? Buffer.from([0x81, len]) : len < 65536 ? Buffer.from([0x81, 126, len >> 8, len & 255]) : null;
  if (!head) { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return Buffer.concat([h, data]); }
  return Buffer.concat([head, data]);
}
function broadcast(kind, obj) { const f = wsFrame(JSON.stringify(obj)); for (const s of sockets[kind]) { try { s.write(f); } catch (e) { sockets[kind].delete(s); } } }
function upgrade(req, socket) {
  const map = { '/ws/v1/machine/snapshot': 'snapshot', '/ws/v1/scale/snapshot': 'scale', '/ws/v1/machine/waterLevels': 'water', '/ws/v1/machine/shotState': 'shotState' };
  const kind = map[req.url.split('?')[0]];
  if (!kind) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sockets[kind].add(socket);
  socket.on('data', (b) => { if ((b[0] & 0x0f) === 8) { socket.end(); sockets[kind].delete(socket); } });
  socket.on('close', () => sockets[kind].delete(socket));
  socket.on('error', () => sockets[kind].delete(socket));
  if (kind === 'scale') socket.write(wsFrame(JSON.stringify({ status: scaleOn ? 'connected' : 'disconnected' })));
  if (kind === 'water') socket.write(wsFrame(JSON.stringify(water)));
  if (kind === 'shotState') socket.write(wsFrame(JSON.stringify(shotState)));
}

// ---------------- REST ----------------
const merge = (a, b) => { for (const [k, v] of Object.entries(b || {})) { if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v); else a[k] = v; } return a; };
const summary = (s) => { const { measurements, ...rest } = s; return rest; };
const beanOfBatch = (id) => (batches.find((b) => b.id === id) || {}).beanId;

function route(method, url, body) {
  const [p, qs] = url.split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const seg = p.split('/').filter(Boolean).slice(2); // after /api/v1
  const id = seg[1] && decodeURIComponent(seg[1]);
  const R = (status, data) => [status, data];
  const k = `${method} /${seg[0] || ''}`;

  if (p.startsWith('/dev/')) {
    if (p === '/dev/state') { state = q.s || 'idle'; if (state === 'heating') group = 75; if (state === 'needsWater') water.currentLevel = 2; else if (water.currentLevel < 6) water.currentLevel = 36; broadcast('water', water); return R(200, { state }); }
    if (p === '/dev/scale') { scaleOn = q.on !== '0'; broadcast('scale', { status: scaleOn ? 'connected' : 'disconnected' }); if (!scaleOn && run) { run.lost = true; shotState = { ...shotState, scaleConnected: false, scaleLost: true }; broadcast('shotState', shotState); } return R(200, { scaleOn }); }
    if (p === '/dev/water') { water.currentLevel = +q.mm; broadcast('water', water); return R(200, water); }
  }
  if (p.startsWith('/api/v1/machine/state/') && method === 'PUT') {
    const s = seg[2];
    if (!['booting','busy','idle','sleeping','heating','preheating','espresso','hotWater','flush','steam','steamRinse','skipStep','cleaning','descaling','calibration','selfTest','airPurge','needsWater','error','fwUpgrade'].includes(s)) return R(400, { error: `Unknown machine state: ${s}` });
    if (s === 'espresso') { if (rea.blockOnNoScale && !scaleOn) return R(409, { error: 'No scale connected' }); startEspresso(); }
    else if (s === 'idle') { if (run && run.kind === 'espresso') finishEspresso('apiStop'); run = null; state = 'idle'; }
    else if (s === 'skipStep') { if (run && run.kind === 'espresso') { const ft = frameTargets(workflow.profile, (Date.now() - run.t0) / 1000 + run.skip); if (ft) run.skip += ft.s.seconds - ft.into + 0.01; } }
    else if (['steam', 'hotWater', 'flush'].includes(s)) { run = { kind: s, t0: Date.now() }; state = s; if (s === 'hotWater') weight = 0; }
    else state = s;
    return R(200, { state });
  }
  switch (`${method} ${p}`) {
    case 'GET /api/v1/machine/state': return R(200, { state, substate });
    case 'GET /api/v1/workflow': return R(200, workflow);
    case 'PUT /api/v1/workflow': merge(workflow, body); if (body.profile) workflow.profile = body.profile; return R(200, workflow);
    case 'PUT /api/v1/scale/tare': weight = 0; return R(200, {});
    case 'GET /api/v1/scale/info': return scaleOn ? R(200, { firmwareVersion: 'R029', batteryLevel: 80 }) : R(503, { error: 'No scale' });
    case 'GET /api/v1/machine/waterLevels': return R(200, water);
    case 'POST /api/v1/machine/waterLevels': merge(water, body); broadcast('water', water); return R(200, water);
    case 'GET /api/v1/machine/settings': return R(200, machineSettings);
    case 'POST /api/v1/machine/settings': merge(machineSettings, body); return R(200, machineSettings);
    case 'GET /api/v1/machine/info': return R(200, { model: 'DE1 PRO (simulated)', firmwareVersion: '1352' });
    case 'GET /api/v1/settings': return R(200, rea);
    case 'POST /api/v1/settings': merge(rea, body); return R(200, rea);
    case 'GET /api/v1/display': return R(200, display);
    case 'PUT /api/v1/display/brightness': display.brightness = display.requestedBrightness = body.brightness; return R(200, display);
    case 'GET /api/v1/devices': return R(200, [{ name: 'DE1', id: 'F4:12:FA:5C:3D:8E', state: 'connected', type: 'machine' }, { name: 'Decent Scale', id: 'AA:BB:CC:DD:EE:FF', state: scaleOn ? 'connected' : 'disconnected', type: 'scale' }]);
    case 'GET /api/v1/devices/scan': return R(200, []);
    case 'GET /api/v1/devices/wifi': return R(200, []);
    case 'GET /api/v1/plugins': return R(200, [{ id: 'visualizer.reaplugin', name: 'Visualizer', version: '1.4.0' }, { id: 'settings.reaplugin', name: 'Settings', version: '1.0.0' }]);
    case 'GET /api/v1/info': return R(200, { version: '0.0.0-fake', fullVersion: 'fake Decaid for testing' });
    case 'POST /api/v1/machine/heartbeat': return R(200, { timeoutRemaining: 1800 });
    case 'GET /api/v1/grinders': return R(200, grinders);
    case 'POST /api/v1/grinders': { if (!body || !body.model) return R(400, { error: 'model is required' }); const g = { id: uid(), archived: false, settingType: 'numeric', createdAt: now(), updatedAt: now(), ...body }; grinders.push(g); return R(201, g); }
    case 'GET /api/v1/profiles': return R(200, profiles.filter((r) => r.visibility !== 'deleted'));
    case 'POST /api/v1/profiles': { const rec = { id: hash(body.profile), profile: body.profile, parentId: body.parentId || null, visibility: 'visible', isDefault: false, createdAt: now(), updatedAt: now(), metadata: body.metadata || {} }; const i = profiles.findIndex((r) => r.id === rec.id); if (i >= 0) profiles[i] = rec; else profiles.push(rec); return R(201, rec); }
    case 'GET /api/v1/beans': return R(200, beans.filter((b) => q.includeArchived === 'true' || !b.archived));
    case 'POST /api/v1/beans': { const b = { id: uid(), archived: false, createdAt: now(), updatedAt: now(), ...body }; beans.push(b); return R(201, b); }
    case 'GET /api/v1/shots/latest': return shots[0] ? R(200, shots[0]) : R(404, { error: 'none' });
    case 'GET /api/v1/shots': {
      let l = shots.slice();
      if (q.profileTitle) l = l.filter((s) => s.workflow.profile.title === q.profileTitle);
      if (q.beanId) l = l.filter((s) => beanOfBatch(s.workflow.context.beanBatchId) === q.beanId);
      if (q.minEnjoyment) l = l.filter((s) => s.annotations.enjoyment != null && s.annotations.enjoyment >= +q.minEnjoyment);
      l.sort((a, b) => (q.order === 'asc' ? 1 : -1) * a.timestamp.localeCompare(b.timestamp));
      const off = +q.offset || 0, lim = +q.limit || 20;
      return R(200, { items: l.slice(off, off + lim).map(summary), total: l.length, limit: lim, offset: off });
    }
    case 'GET /api/v1/steams': return R(200, steams.map(summary));
    case 'POST /api/v1/plugins/visualizer.reaplugin/upload': return R(202, { visualizer_id: 'fake-' + body.shotId.slice(0, 8) });
  }
  if (seg[0] === 'profiles' && id) {
    const rec = profiles.find((r) => r.id === id);
    if (!rec) return R(404, { error: 'No such profile' });
    if (seg[2] === 'visibility' && method === 'PUT') { rec.visibility = body.visibility; return R(200, rec); }
    if (method === 'PUT') { if (body.metadata) rec.metadata = body.metadata; if (body.profile && !rec.isDefault) rec.profile = body.profile; rec.updatedAt = now(); return R(200, rec); }
    if (method === 'GET') return R(200, rec);
  }
  if (seg[0] === 'shots' && id) {
    const s = shots.find((x) => x.id === id);
    if (!s) return R(404, { error: 'No such shot' });
    if (method === 'PUT') { merge(s, body); s.updatedAt = now(); return R(200, summary(s)); }
    if (method === 'DELETE') { shots.splice(shots.indexOf(s), 1); return R(200, {}); }
    return R(200, s);
  }
  if (seg[0] === 'steams' && id) { const s = steams.find((x) => x.id === id); return s ? R(200, s) : R(404, {}); }
  if (seg[0] === 'beans' && id) {
    const b = beans.find((x) => x.id === id);
    if (!b) return R(404, { error: 'No such bean' });
    if (seg[2] === 'batches') {
      if (method === 'GET') return R(200, batches.filter((x) => x.beanId === id));
      const nb = { id: uid(), beanId: id, archived: false, frozen: false, createdAt: now(), updatedAt: now(), ...body }; batches.push(nb); return R(201, nb);
    }
    if (method === 'PUT') { merge(b, body); return R(200, b); }
    return R(200, b);
  }
  if (seg[0] === 'bean-batches' && id) { const b = batches.find((x) => x.id === id); if (!b) return R(404, {}); if (method === 'PUT') merge(b, body); return R(200, b); }
  if (seg[0] === 'store') { const key = `${seg[1]}/${seg[2]}`; if (method === 'POST') { kv[key] = body; return R(200, body); } return key in kv ? R(200, kv[key]) : R(404, {}); }
  return R(404, { error: `Fake Decaid has no ${k}` });
}

const api = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch (e) { res.writeHead(400, cors); res.end('{"error":"bad json"}'); return; }
    const [status, data] = route(req.method, req.url, body);
    res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
    res.end(JSON.stringify(data));
  });
});
api.on('upgrade', upgrade);
api.listen(API_PORT, () => console.log(`Fake Decaid API on http://localhost:${API_PORT}`));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.otf': 'font/otf', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  let f = decodeURIComponent(req.url.split('?')[0]);
  if (f === '/') f = '/index.html';
  const full = path.join(ROOT, path.normalize(f));
  if (!full.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(SKIN_PORT, () => console.log(`Skin on http://localhost:${SKIN_PORT}`));

setInterval(tick, 100);
setInterval(() => broadcast('water', water), 5000);
