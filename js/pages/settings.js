// Settings: the groups people actually change, backed by Decaid's API.
import { S, patchWorkflow, refreshWorkflow, notify } from '../store.js';
import { api } from '../api.js';
import { esc, icon, stepper, sw, fmt, toast } from '../ui.js';

const GROUPS = [
  ['Grinder', 'grinder', 'Your grinder. Its setting is saved with every shot.'],
  ['Machine', 'cup', 'How the DE1 heats, steams and flushes.'],
  ['Scale', 'scale', 'Your Decent Scale stops shots at the target weight.'],
  ['Devices', 'bt', 'Machines and accessories Decaid talks to.'],
  ['Maintenance', 'wrench', 'Each one asks you to tap twice before it starts.'],
  ['Screen and sleep', 'moon', 'Brightness and keeping the screen on.'],
  ['Plugins', 'puzzle', 'Add-ons that run inside Decaid.'],
  ['About', 'info', 'Versions, and a way back to Decaid’s own screens.'],
];

let picked = 'Scale';
const D = {};         // loaded data per group
let armed = null;     // maintenance action waiting for a second tap
let addingGrinder = false, gform = {};

async function load(group) {
  const get = (p) => api.get(p).catch(() => null);
  if (group === 'Grinder') D.grinders = await get('/api/v1/grinders');
  if (group === 'Machine') { D.machine = await get('/api/v1/machine/settings'); D.water = await get('/api/v1/machine/waterLevels'); }
  if (group === 'Scale') { D.scaleInfo = await get('/api/v1/scale/info'); D.rea = await get('/api/v1/settings'); D.wifi = await get('/api/v1/devices/wifi'); }
  if (group === 'Devices') D.devices = await get('/api/v1/devices');
  if (group === 'Screen and sleep') { D.display = await get('/api/v1/display'); D.rea = await get('/api/v1/settings'); }
  if (group === 'Plugins') D.plugins = await get('/api/v1/plugins');
  if (group === 'About') { D.info = await get('/api/v1/info'); D.minfo = await get('/api/v1/machine/info'); }
  notify();
}

const ctx = () => (S.workflow && S.workflow.context) || {};
const row = (label, value, right = '') => `<div class="row row-static"><span>${label}</span><span style="display:flex;align-items:center;gap:28px"><span class="val" style="color:var(--muted)">${value}</span>${right}</span></div>`;
const btn = (act, label, extra = '') => `<button type="button" class="line line-on" data-act="${act}" ${extra}>${label}</button>`;

function rowsFor(g) {
  const m = D.machine || {}, rea = D.rea || {};
  switch (g) {
    case 'Grinder': {
      const list = D.grinders || [];
      return [row('In use', esc(ctx().grinderModel || 'None chosen')), row('Current setting', esc(ctx().grinderSetting || '–'), stepper('grind', '', 'Finer', 'Coarser').replace('<span></span>', ''))]
        .concat(list.map((x) => row(esc(x.model || 'Grinder'), esc(x.burrs || ''), x.id === ctx().grinderId ? '<span class="eyebrow">In use</span>' : btn('usegrinder', 'Use', `data-id="${esc(x.id)}"`))))
        .concat(addingGrinder
          ? [`<div class="row row-static" style="gap:24px;align-items:flex-end;padding-bottom:12px"><label class="fld" style="flex:1"><span class="eyebrow">Model</span><input data-in="g.model" value="${esc(gform.model || '')}" placeholder="Niche Zero" autofocus></label><label class="fld" style="flex:1"><span class="eyebrow">Burrs, optional</span><input data-in="g.burrs" value="${esc(gform.burrs || '')}" placeholder="63 mm conical"></label><span style="display:flex;gap:28px">${btn('cancelgrinder', 'Cancel')}${btn('savegrinder', 'Save')}</span></div>`]
          : [row(list.length ? 'Add another grinder' : 'No grinders saved yet', '', btn('addgrinder', 'Add a grinder'))]);
    }
    case 'Machine': return [
      row('Fan turns on above', `${m.fan != null ? m.fan + '°' : '–'}`, stepper('fan', '', 'Lower', 'Higher').replace('<span></span>', '')),
      row('Steam flow', `${fmt.n(m.steamFlow)} ml/s`, stepper('steamFlow', '', 'Less', 'More').replace('<span></span>', '')),
      row('Flush flow, temperature, time', `${fmt.n(m.flushFlow)} ml/s · ${m.flushTemp != null ? m.flushTemp + '°' : '–'} · ${m.flushTimeout != null ? m.flushTimeout + ' s' : '–'}`),
      row('Water tank heater', m.tankTemp ? `${m.tankTemp}°` : 'Off', sw('tank', !!m.tankTemp, 'Water tank heater')),
      row('Machine asks for a refill at', D.water ? `${D.water.refillLevel} mm` : '–', stepper('refill', '', 'Lower', 'Higher').replace('<span></span>', '')),
    ];
    case 'Scale': return [
      row('Decent Scale', S.scale.connected ? `Connected${S.scale.battery != null ? ' · battery ' + S.scale.battery + '%' : ''}` : 'Not connected', S.scale.connected ? btn('tare', 'Tare') : btn('scan', 'Find')),
      row('Stop shots at target weight', ctx().targetYield > 0 ? `On, ${fmt.n(ctx().targetYield)} g` : 'Off', sw('saw', ctx().targetYield > 0, 'Stop shots at target weight')),
      row('Block shots when no scale is connected', rea.blockOnNoScale ? 'On' : 'Off', sw('block', !!rea.blockOnNoScale, 'Block shots when no scale is connected')),
      row('Wi-Fi scales', D.wifi && D.wifi.length ? `${D.wifi.length} added` : 'None added'),
    ];
    case 'Devices': return (D.devices || []).map((d) => row(esc(d.name || d.id), esc(`${d.type || ''} · ${d.state || ''}`), d.state === 'connected' ? btn('disconnect', 'Disconnect', `data-id="${esc(d.id)}"`) : btn('connect', 'Connect', `data-id="${esc(d.id)}"`)))
      .concat([row('Find new devices', '', btn('scan', 'Scan'))]);
    case 'Maintenance': return [
      ['cleaning', 'Clean the group (backflush)', 'Put the blind basket in first.'],
      ['descaling', 'Descale', 'Follow Decent’s descale guide first.'],
      ['airPurge', 'Empty for transport (air purge)', 'Remove the water tank first.'],
    ].map(([s, label, hint]) => row(label, armed === s ? 'Tap again to start' : esc(hint), btn('maint', armed === s ? 'Start now' : 'Start', `data-val="${s}"`)));
    case 'Screen and sleep': {
      const d = D.display || {};
      return [
        row('Brightness', d.brightness != null ? (d.requestedBrightness === 100 ? 'Automatic' : d.brightness + '%') : '–', stepper('bright', '', 'Dimmer', 'Brighter').replace('<span></span>', '')),
        row('Keep the screen on', rea.keepAwake ? 'On' : 'Off', sw('awake', !!rea.keepAwake, 'Keep the screen on')),
        row('Put the machine to sleep', '', btn('sleep', 'Sleep now')),
      ];
    }
    case 'Plugins': return (D.plugins || []).map((p) => row(esc(p.name || p.id), esc(p.version || ''))).concat((D.plugins || []).length ? [] : ['<p class="empty">No plugins loaded.</p>']);
    case 'About': {
      const i = D.info || {}, mi = D.minfo || {};
      return [row('This skin', 'Jeen’s skin 0.1.0'), row('Decaid', esc(i.fullVersion || i.version || '–')), row('Machine', esc([mi.model, mi.firmwareVersion || mi.version].filter(Boolean).join(' · ') || '–')),
        row('Decaid’s own screens', '', btn('dashboard', 'Open dashboard'))];
    }
    default: return [];
  }
}

export default {
  keepScroll: true,
  enter(group) { if (group) picked = group; refreshWorkflow(); load(picked); },
  render() {
    const g = GROUPS.find((x) => x[0] === picked) || GROUPS[0];
    const idx = GROUPS.indexOf(g) + 1;
    const rows = rowsFor(g[0]);
    const hint = { Grinder: ctx().grinderSetting ? 'Setting ' + ctx().grinderSetting : '', Machine: 'DE1', Scale: S.scale.connected ? 'Connected' : 'Not found', Devices: 'Bluetooth', Plugins: D.plugins ? D.plugins.length + ' loaded' : '' };
    return `
      <div class="head"><h2 class="h2">Settings</h2></div>
      <div class="head"><div style="min-width:0"><span class="eyebrow">Group ${idx} of ${GROUPS.length}</span><h1 class="h1">${esc(g[0])}</h1></div><p class="note-r">${esc(g[2])}</p></div>
      <div style="display:flex;align-items:flex-end;padding:8px 0 16px"><span class="eyebrow" style="padding-bottom:10px">Jeen’s skin 0.1.0</span></div>
      <div class="row2"><p style="color:var(--muted)">${rows.length} ${rows.length === 1 ? 'setting' : 'settings'}</p></div>
      <nav class="list" aria-label="Settings groups">${GROUPS.map(([name, ic]) => `<button type="button" class="row${name === picked ? ' row-on' : ''}" aria-pressed="${name === picked}" data-act="group" data-val="${esc(name)}"><span class="row-ic">${icon(ic)}<span class="row-name">${esc(name)}</span></span><span class="row-meta">${esc(hint[name] || '')}</span></button>`).join('')}</nav>
      <section class="list" aria-label="${esc(g[0])}" style="border-bottom:0">${rows.join('')}</section>`;
  },
  input(name, el) { if (name.startsWith('g.')) gform[name.slice(2)] = el.value; },
  async act(a, el) {
    const dir = +el.dataset.dir || 0;
    const m = D.machine || {};
    const postMachine = async (body) => { await api.post('/api/v1/machine/settings', body); await load('Machine'); };
    const postRea = async (body) => { D.rea = await api.post('/api/v1/settings', body).catch(async () => api.get('/api/v1/settings')); notify(); };
    if (a === 'group') { picked = el.dataset.val; armed = null; addingGrinder = false; this.repaint(); load(picked); }
    else if (a === 'addgrinder') { addingGrinder = true; gform = {}; this.repaint(); }
    else if (a === 'cancelgrinder') { addingGrinder = false; this.repaint(); }
    else if (a === 'savegrinder') {
      const model = (gform.model || '').trim();
      if (!model) { toast('Type the grinder model first'); return; }
      const g = await api.post('/api/v1/grinders', { model, burrs: (gform.burrs || '').trim() || null });
      addingGrinder = false;
      if (g && g.id) await patchWorkflow({ context: { grinderId: g.id, grinderModel: g.model, grinderBurrs: g.burrs || null } });
      toast(`${model} added and in use`);
      await load('Grinder');
    }
    else if (a === 'grind') { const v = parseFloat(ctx().grinderSetting); if (isNaN(v)) { toast('Type a setting in Decaid first'); return; } await patchWorkflow({ context: { grinderSetting: String(Math.round((v + dir * 0.5) * 10) / 10) } }); }
    else if (a === 'usegrinder') { const g = (D.grinders || []).find((x) => x.id === el.dataset.id); await patchWorkflow({ context: { grinderId: g.id, grinderModel: g.model, grinderBurrs: g.burrs || null } }); }
    else if (a === 'fan') await postMachine({ fan: Math.max(0, Math.min(60, (m.fan || 50) + dir * 5)) });
    else if (a === 'steamFlow') await postMachine({ steamFlow: Math.max(0.4, Math.min(2.5, Math.round(((m.steamFlow || 1) + dir * 0.1) * 10) / 10)) });
    else if (a === 'tank') await postMachine({ tankTemp: m.tankTemp ? 0 : 25 });
    else if (a === 'refill') { await api.post('/api/v1/machine/waterLevels', { refillLevel: Math.max(0, ((D.water && D.water.refillLevel) || 5) + dir) }); await load('Machine'); }
    else if (a === 'tare') { await api.tare(); toast('Scale tared'); }
    else if (a === 'saw') { const on = ctx().targetYield > 0; await patchWorkflow({ context: { targetYield: on ? 0 : 36 } }); }
    else if (a === 'block') await postRea({ blockOnNoScale: !(D.rea && D.rea.blockOnNoScale) });
    else if (a === 'awake') await postRea({ keepAwake: !(D.rea && D.rea.keepAwake) });
    else if (a === 'scan') { toast('Scanning for devices…'); await api.get('/api/v1/devices/scan').catch(() => null); await load('Devices'); }
    else if (a === 'connect') { await api.put('/api/v1/devices/connect', { deviceId: el.dataset.id }); await load('Devices'); }
    else if (a === 'disconnect') { await api.put('/api/v1/devices/disconnect', { deviceId: el.dataset.id }); await load('Devices'); }
    else if (a === 'maint') { const s = el.dataset.val; if (armed !== s) { armed = s; this.repaint(); return; } armed = null; await api.setState(s); toast('Started'); this.repaint(); }
    else if (a === 'bright') { const d = D.display || {}; const cur = d.requestedBrightness != null ? d.requestedBrightness : 70; D.display = await api.put('/api/v1/display/brightness', { brightness: Math.max(5, Math.min(100, cur + dir * 10)) }); notify(); }
    else if (a === 'sleep') { await api.setState('sleeping'); toast('Machine going to sleep'); }
    else if (a === 'dashboard') { if (window.decentApp && window.decentApp.exitToDashboard) window.decentApp.exitToDashboard(); else toast('Only works inside the Decaid app'); }
  },
};
