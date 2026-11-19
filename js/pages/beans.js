// Beans: what you have, what's in the hopper, and how it has been pulling.
import { S, patchWorkflow, notify } from '../store.js';
import { api } from '../api.js';
import { esc, fmt, toast } from '../ui.js';
import { go } from '../app.js';

let beans = null, pickedId = null, filter = 'in', adding = false, addingBag = false, searching = false, query = '';
const batches = {}, stats = {};
let form = {};

async function loadBeans() {
  try { beans = await api.beans(); } catch (e) { beans = beans || []; }
  notify();
}
async function loadBean(id) {
  if (!id) return;
  if (!batches[id]) {
    batches[id] = 'loading';
    api.batches(id).then((b) => { batches[id] = (b || []).sort((x, y) => String(y.roastDate || y.createdAt).localeCompare(String(x.roastDate || x.createdAt))); notify(); }).catch(() => { batches[id] = []; notify(); });
  }
  if (!stats[id]) {
    stats[id] = 'loading';
    api.shots({ beanId: id, limit: 100, offset: 0 }).then((page) => {
      const items = (page && page.items) || [];
      const rated = items.filter((s) => s.annotations && s.annotations.enjoyment != null);
      const byProfile = {};
      rated.forEach((s) => { const t = s.workflow && s.workflow.profile && s.workflow.profile.title; if (!t) return; (byProfile[t] = byProfile[t] || []).push(s.annotations.enjoyment); });
      let best = null, bestAvg = -1;
      for (const [t, v] of Object.entries(byProfile)) { const a = v.reduce((x, y) => x + y, 0) / v.length; if (a > bestAvg) { bestAvg = a; best = t; } }
      const lastGrind = items.find((s) => s.workflow && s.workflow.context && s.workflow.context.grinderSetting);
      stats[id] = {
        shots: page.total != null ? page.total : items.length,
        avg: rated.length ? rated.reduce((x, s) => x + s.annotations.enjoyment, 0) / rated.length / 2 : null,
        best, grind: lastGrind ? lastGrind.workflow.context.grinderSetting : null,
      };
      notify();
    }).catch(() => { stats[id] = { shots: 0 }; notify(); });
  }
}

const fld = (key, label, ph, span) => `<label class="fld"${span ? ` style="grid-column:span ${span}"` : ''}><span class="eyebrow">${label}</span><input data-in="${key}" value="${esc(form[key] || '')}" placeholder="${esc(ph)}"></label>`;

function visible() {
  const q = query.trim().toLowerCase();
  return (beans || []).filter((b) => filter === 'all' || (filter === 'in' && !b.archived) || (filter === 'done' && b.archived))
    .filter((b) => !q || [b.name, b.roaster, b.country, b.region, b.processing, b.notes].some((x) => String(x || '').toLowerCase().includes(q)));
}

export default {
  keepScroll: true,
  enter() { loadBeans(); },
  render() {
    const list = visible();
    const ctxBatch = S.workflow && S.workflow.context && S.workflow.context.beanBatchId;
    let sel = (beans || []).find((b) => b.id === pickedId) || list[0];
    if (sel) { pickedId = sel.id; loadBean(sel.id); }
    const bs = sel && Array.isArray(batches[sel.id]) ? batches[sel.id] : [];
    const st = sel && typeof stats[sel.id] === 'object' ? stats[sel.id] : null;
    const current = sel && bs.some((b) => b.id === ctxBatch);
    const origin = sel ? [sel.country, sel.region].filter(Boolean).join(', ') : '';
    const lvl = bs[0] && bs[0].roastLevel;
    const filters = [['all', 'All'], ['in', 'In use'], ['done', 'Finished']];
    const head = adding
      ? { eyebrow: 'New bean', name: 'Add a bean', note: 'Fill in what is on the bag. Only roaster and name are needed.', summary: 'Shots pulled with it save this bean and bag.' }
      : sel ? { eyebrow: (sel.roaster || '') + (current ? ' · in the hopper now' : ''), name: sel.name, note: sel.notes || '', summary: [origin, sel.processing, lvl ? lvl + ' roast' : ''].filter(Boolean).join(' · ') || ' ' }
        : { eyebrow: '', name: 'No beans yet', note: 'Add the coffee you are using so every shot remembers it.', summary: ' ' };
    let body;
    if (adding) {
      body = `<form style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));column-gap:32px;row-gap:16px;padding-top:16px" onsubmit="return false">
        <span class="eyebrow" style="grid-column:span 3;color:var(--ink)">The coffee</span>
        ${fld('roaster', 'Roaster', 'Roots Roastery')}${fld('name', 'Coffee name', 'Guji')}${fld('origin', 'Country and region', 'Ethiopia, Guji')}
        ${fld('processing', 'Process', 'Washed')}${fld('variety', 'Variety', 'Heirloom')}${fld('producer', 'Producer', 'Optional')}
        <span class="eyebrow" style="grid-column:span 3;color:var(--ink);padding-top:8px">This bag</span>
        ${dateFld()}${fld('roastLevel', 'Roast level', 'Light')}${fld('weight', 'Bag weight, g', '250')}
        ${fld('notes', 'Tasting notes', 'Jasmine, peach, black tea', 2)}${fld('price', 'Price', 'Optional')}
      </form>`;
    } else if (sel) {
      body = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:32px;padding-top:16px">
          <div class="ro"><span class="eyebrow">Shots</span><span class="fig">${st ? st.shots : '–'}</span></div>
          <div class="ro"><span class="eyebrow">Average rating</span><span class="fig">${st && st.avg != null ? fmt.n(st.avg) + ' / 5' : '–'}</span></div>
          <div class="ro"><span class="eyebrow">Best with</span><span class="fig" style="font-size:20px;padding-top:6px">${esc(st && st.best ? st.best : '–')}</span></div>
          <div class="ro"><span class="eyebrow">Grinder</span><span class="fig">${esc(st && st.grind ? st.grind : '–')}</span></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-top:24px"><span class="eyebrow" style="color:var(--ink);padding-bottom:10px">Bags</span><button type="button" class="line line-on" data-act="addbag">${addingBag ? 'Cancel' : 'Add a bag'}</button></div>
        ${addingBag ? `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));column-gap:24px;align-items:end;padding-bottom:12px">${dateFld()}${fld('roastLevel', 'Roast level', 'Light')}${fld('weight', 'Weight, g', '250')}<button type="button" class="line line-on" data-act="savebag">Save bag</button></div>` : ''}
        <div style="overflow-y:auto;min-height:0">${bs.length ? bs.map((b) => `<div class="row row-static"><span>${b.roastDate ? 'Roasted ' + esc(fmt.dmy(b.roastDate)) : 'Bag'}${b.id === ctxBatch ? ' <span class="eyebrow">· in use</span>' : ''}</span><span style="display:flex;gap:32px;align-items:center"><span class="val" style="color:var(--muted)">${b.weight ? fmt.n(b.weight, 0) + ' g' : ''}</span><span class="val">${b.archived ? 'Finished' : b.weightRemaining != null ? fmt.n(b.weightRemaining, 0) + ' g left' : ''}</span>${!b.archived ? `<button type="button" class="line line-on" data-act="usebag" data-id="${esc(b.id)}">Use</button>` : ''}</span></div>`).join('') : `<p class="empty">${batches[sel.id] === 'loading' ? 'Loading bags…' : 'No bags yet. Add one so shots record the roast date.'}</p>`}</div>`;
    } else body = '<p class="empty">Tap Add a bean to start.</p>';
    const actions = adding ? [['cancel', 'Cancel']] : sel ? [['shots', 'Shots with this bean'], ['finish', sel.archived ? 'Restock' : 'Mark finished']] : [];
    const cta = adding ? ['savebean', 'Save and use'] : current ? ['pull', 'Pull a shot'] : sel ? ['use', 'Use this bean'] : null;
    return `
      <div class="head"><h2 class="h2">Beans</h2><nav class="acts" aria-label="Bean list actions"><button type="button" class="line${searching ? ' line-on' : ''}" data-act="search">${searching ? 'Close' : 'Search'}</button><button type="button" class="line line-on" data-act="add">Add</button></nav></div>
      <div class="head"><div style="min-width:0"><span class="eyebrow">${esc(head.eyebrow)}</span><h1 class="h1">${esc(head.name)}</h1></div><p class="note-r">${esc(head.note)}</p></div>
      ${searching
        ? `<div class="row2" style="align-items:flex-end"><label class="fld" style="width:100%"><span class="eyebrow">Search by name, roaster or origin</span><input data-in="q" value="${esc(query)}" autofocus></label></div>`
        : `<div role="tablist" aria-label="Filter beans" style="display:flex;gap:40px;align-items:flex-end;white-space:nowrap;padding:8px 0 16px">${filters.map(([k, l]) => `<button type="button" role="tab" aria-selected="${k === filter}" class="line${k === filter ? ' line-on' : ''}" style="letter-spacing:.16em" data-act="filter" data-val="${k}">${l}</button>`).join('')}</div>`}
      <div class="row2"><p>${esc(head.summary)}</p><nav class="acts" aria-label="Bean actions">${actions.map(([k, l]) => `<button type="button" class="line line-on" data-act="${k}">${l}</button>`).join('')}</nav></div>
      <section class="list" aria-label="Your beans">${beans === null ? '<p class="empty">Loading…</p>' : list.length ? list.map((b) => `<button type="button" class="row${b.id === pickedId && !adding ? ' row-on' : ''}" aria-pressed="${b.id === pickedId && !adding}" data-act="pick" data-id="${esc(b.id)}"><span class="row-name">${esc(b.name)}</span><span class="row-meta">${esc(b.roaster || '')}</span></button>`).join('') : '<p class="empty">Nothing here.</p>'}</section>
      <section class="right3" aria-label="Bean detail" style="min-height:0">
        ${body}
        <div class="bottom"><p style="margin:0 0 12px;font-size:14px;color:var(--muted);max-width:52ch">${adding ? 'Saved beans show up on Pull a shot and in History.' : current ? 'This bean is saved with every shot you pull.' : 'Switching beans changes what the next shot saves.'}</p>
        ${cta ? `<button type="button" class="cta" data-act="${cta[0]}">${cta[1]} <span aria-hidden="true">→</span></button>` : ''}</div>
      </section>`;
  },
  input(name, el) {
    if (name === 'q') { query = el.value; clearTimeout(this._t); this._t = setTimeout(() => { const pos = el.selectionStart; this.repaint(); const i = document.querySelector('[data-in="q"]'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 250); return; }
    if (name === 'roastDate') { el.value = dashed(el.value); }
    form[name] = el.value;
  },
  async act(a, el) {
    const sel = (beans || []).find((b) => b.id === pickedId);
    const useBatch = async (bean, batch) => {
      await patchWorkflow({ context: { beanBatchId: batch ? batch.id : null, coffeeName: bean.name, coffeeRoaster: bean.roaster || null } });
      toast(`${bean.name} is in the hopper`);
    };
    if (a === 'pick') { pickedId = el.dataset.id; adding = false; addingBag = false; this.repaint(); }
    else if (a === 'filter') { filter = el.dataset.val; this.repaint(); }
    else if (a === 'search') { searching = !searching; if (!searching) query = ''; this.repaint(); }
    else if (a === 'add') { adding = true; form = {}; this.repaint(); }
    else if (a === 'cancel') { adding = false; this.repaint(); }
    else if (a === 'addbag') { addingBag = !addingBag; form = {}; this.repaint(); }
    else if (a === 'pull') { go('shot'); }
    else if (a === 'shots') { go('history', { beanId: sel.id, label: sel.name }); }
    else if (a === 'finish') { await api.put(`/api/v1/beans/${encodeURIComponent(sel.id)}`, { archived: !sel.archived }); await loadBeans(); }
    else if (a === 'use') { const bs = Array.isArray(batches[sel.id]) ? batches[sel.id] : []; await useBatch(sel, bs.find((b) => !b.archived)); }
    else if (a === 'usebag') { const bs = batches[sel.id] || []; await useBatch(sel, bs.find((b) => b.id === el.dataset.id)); }
    else if ((a === 'savebag' || a === 'savebean') && form.roastDate && !isoDate(form.roastDate)) { toast('Roast date should be DD-MM-YY, like 10-11-25'); }
    else if (a === 'savebag') {
      const batch = await api.post(`/api/v1/beans/${encodeURIComponent(sel.id)}/batches`, bagBody());
      delete batches[sel.id]; addingBag = false; form = {}; await useBatch(sel, batch); loadBean(sel.id);
    }
    else if (a === 'savebean') {
      if (!form.roaster || !form.name) { toast('Roaster and name are needed'); return; }
      const [country, ...region] = (form.origin || '').split(',').map((x) => x.trim());
      const bean = await api.post('/api/v1/beans', { roaster: form.roaster, name: form.name, country: country || null, region: region.join(', ') || null,
        processing: form.processing || null, variety: form.variety ? form.variety.split(',').map((x) => x.trim()) : null, producer: form.producer || null, notes: form.notes || null,
        decaf: /decaf/i.test(`${form.name} ${form.processing}`) });
      const batch = await api.post(`/api/v1/beans/${encodeURIComponent(bean.id)}/batches`, bagBody());
      adding = false; form = {}; pickedId = bean.id; await loadBeans(); await useBatch(bean, batch);
    }
  },
};

function dashed(v) {
  const d = String(v || '').replace(/\D/g, '').slice(0, 6);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)].filter(Boolean).join('-');
}
function isoDate(v) {
  const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  const iso = `20${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(iso + 'T12:00:00');
  return !isNaN(d) && d.getDate() === +m[1] ? `${iso}T00:00:00Z` : null;
}
const dateFld = () => `<label class="fld"><span class="eyebrow">Roast date</span><input data-in="roastDate" value="${esc(form.roastDate || '')}" placeholder="DD-MM-YY" inputmode="numeric" maxlength="8" autocomplete="off"></label>`;

function bagBody() {
  const w = parseFloat(form.weight);
  const date = isoDate(form.roastDate);
  return { roastDate: date, roastLevel: form.roastLevel || null, weight: isNaN(w) ? null : w, weightRemaining: isNaN(w) ? null : w, price: parseFloat(form.price) || null };
}
