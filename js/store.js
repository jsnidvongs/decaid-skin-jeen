// Live machine state shared by every page.
import { api, stream } from './api.js';

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
let pending = null;
function emit(kind) {
  // Live frames arrive ~10 times a second; batch them into one paint per frame.
  if (kind === 'live') {
    if (pending) return;
    pending = requestAnimationFrame(() => { pending = null; listeners.forEach((f) => f('live')); });
    return;
  }
  listeners.forEach((f) => f(kind));
}

export const S = {
  online: false,          // REST reachable
  machineLinked: false,   // snapshot socket open
  machine: null,          // latest /ws/v1/machine/snapshot frame
  scale: { connected: false, weight: null, flow: null, battery: null },
  water: null,            // { currentLevel, refillLevel } in mm
  workflow: null,
  shotState: null,        // latest /ws/v1/machine/shotState frame
  shot: null,             // { start, points: [], frames: [] } while pouring and right after
  lastShotId: null,
};

// The DE1 tank reads in mm. This is roughly full; used only to show a percentage.
export const WATER_FULL_MM = 65; // Jeen's tank: 2 L at 65 mm

export const machineState = () => (S.machine && S.machine.state && S.machine.state.state) || 'disconnected';
export const machineSub = () => (S.machine && S.machine.state && S.machine.state.substate) || '';

export function waterPct() {
  if (!S.water || S.water.currentLevel == null) return null;
  return Math.max(0, Math.min(100, Math.round((S.water.currentLevel / WATER_FULL_MM) * 100)));
}
export function waterLow() {
  if (machineState() === 'needsWater') return true;
  if (!S.water || S.water.currentLevel == null) return false;
  return S.water.currentLevel <= (S.water.refillLevel || 0) + 2;
}
export function heating() {
  const st = machineState();
  if (st === 'heating' || st === 'preheating') return true;
  return false;
}
export function heatProgress() {
  const m = S.machine;
  if (!m || !m.targetGroupTemperature) return 0;
  const start = 20;
  return Math.max(0, Math.min(1, (m.groupTemperature - start) / (m.targetGroupTemperature - start)));
}

function t(ts) { return ts ? Date.parse(ts) : Date.now(); }

function onMachine(m) {
  const prev = machineState();
  S.machine = m;
  const now = machineState();
  if (now === 'espresso' && prev !== 'espresso') {
    S.shot = { start: t(m.timestamp), points: [], frames: [], done: false };
    S.lastShotId = null;
  }
  if (S.shot && !S.shot.done && now === 'espresso') {
    const time = (t(m.timestamp) - S.shot.start) / 1000;
    const last = S.shot.frames[S.shot.frames.length - 1];
    if (!last || last.frame !== m.profileFrame) S.shot.frames.push({ frame: m.profileFrame, t: time });
    S.shot.points.push({
      t: time, p: m.pressure, f: m.flow, temp: m.mixTemperature, group: m.groupTemperature,
      w: S.scale.connected ? S.scale.weight : null, wf: S.scale.connected ? S.scale.flow : null,
    });
  }
  if (S.shot && !S.shot.done && prev === 'espresso' && now !== 'espresso') {
    S.shot.done = true;
    S.shot.end = t(m.timestamp);
    emit('shotDone');
    // Decaid stores the shot when it ends; fetch its id so the rating can be saved.
    setTimeout(async () => {
      try { const s = await api.latestShot(); if (s) { S.lastShotId = s.id; emit('change'); } } catch (e) { /* offline */ }
    }, 1500);
  }
  emit(prev !== now ? 'change' : 'live');
}

function onScale(f) {
  if (f.status) { S.scale.connected = f.status === 'connected'; emit('change'); return; }
  const was = S.scale.connected;
  S.scale.connected = true;
  S.scale.weight = f.weight;
  S.scale.flow = f.weightFlow != null ? f.weightFlow : f.flow;
  if (f.batteryLevel != null) S.scale.battery = f.batteryLevel;
  emit(was ? 'live' : 'change');
}

export async function refreshWorkflow() {
  try { S.workflow = await api.workflow(); emit('change'); } catch (e) { /* offline */ }
  return S.workflow;
}

export async function patchWorkflow(patch) {
  S.workflow = await api.patchWorkflow(patch);
  emit('change');
  return S.workflow;
}

export function start() {
  stream('/ws/v1/machine/snapshot', onMachine, (up) => { S.machineLinked = up; if (!up) S.machine = null; emit('change'); });
  stream('/ws/v1/scale/snapshot', onScale, (up) => { if (!up) { S.scale.connected = false; emit('change'); } });
  stream('/ws/v1/machine/waterLevels', (w) => { S.water = w; emit('change'); });
  stream('/ws/v1/machine/shotState', (f) => { S.shotState = f; emit('change'); });
  const ping = async () => {
    try {
      if (!S.water) S.water = await api.get('/api/v1/machine/waterLevels').catch(() => null);
      if (!S.workflow) S.workflow = await api.workflow();
      if (!S.online) { S.online = true; emit('change'); }
    } catch (e) {
      if (S.online) { S.online = false; emit('change'); }
    }
  };
  ping();
  setInterval(ping, 5000);
}

export function notify(kind) { emit(kind || 'change'); }
