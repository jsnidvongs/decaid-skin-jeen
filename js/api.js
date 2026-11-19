// Talks to Decaid's REST and WebSocket API on port 8080.
// Override the address with ?api=http://192.168.1.20:8080 when testing from another computer.
const param = new URLSearchParams(location.search).get('api');
export const BASE = (param || `${location.protocol === 'https:' ? 'https:' : 'http:'}//${location.hostname || 'localhost'}:8080`).replace(/\/$/, '');
const WS_BASE = BASE.replace(/^http/, 'ws');

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.status + ' ' + res.statusText;
    try { const j = await res.json(); msg = j.error || j.message || msg; } catch (e) { /* not json */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const api = {
  get: (p) => call('GET', p),
  put: (p, b) => call('PUT', p, b === undefined ? {} : b),
  post: (p, b) => call('POST', p, b === undefined ? {} : b),
  del: (p) => call('DELETE', p),

  // machine
  setState: (s) => call('PUT', `/api/v1/machine/state/${s}`),
  tare: () => call('PUT', '/api/v1/scale/tare'),
  workflow: () => call('GET', '/api/v1/workflow'),
  patchWorkflow: (patch) => call('PUT', '/api/v1/workflow', patch),

  // data
  profiles: () => call('GET', '/api/v1/profiles'),
  shots: (q) => call('GET', '/api/v1/shots?' + new URLSearchParams(q)),
  shot: (id) => call('GET', `/api/v1/shots/${encodeURIComponent(id)}`),
  latestShot: () => call('GET', '/api/v1/shots/latest'),
  beans: () => call('GET', '/api/v1/beans?includeArchived=true'),
  batches: (beanId) => call('GET', `/api/v1/beans/${encodeURIComponent(beanId)}/batches`),
};

// A WebSocket that reconnects by itself. onMsg gets parsed JSON.
export function stream(path, onMsg, onState) {
  let ws, timer, closed = false, wait = 1000;
  const open = () => {
    try { ws = new WebSocket(WS_BASE + path); } catch (e) { retry(); return; }
    ws.onopen = () => { wait = 1000; onState && onState(true); };
    ws.onmessage = (ev) => { try { onMsg(JSON.parse(ev.data)); } catch (e) { /* ignore bad frame */ } };
    ws.onclose = () => { onState && onState(false); retry(); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* already closed */ } };
  };
  const retry = () => { if (closed) return; clearTimeout(timer); timer = setTimeout(open, wait); wait = Math.min(wait * 2, 10000); };
  open();
  return { close: () => { closed = true; clearTimeout(timer); ws && ws.close(); } };
}
