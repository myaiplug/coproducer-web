import { CoproducerPlayer } from './player.js';

export const apiBase = () => new URLSearchParams(location.search).get('api') || 'http://127.0.0.1:8788';

export function fmt(v, digits = 2) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number' && Number.isFinite(v)) return v.toFixed(digits);
  return String(v);
}

export async function copyPromo(code) {
  await navigator.clipboard.writeText(code);
}

function cellClass(status) { return status === 'pass' ? 'pass' : status === 'off' ? 'off' : ''; }

export function renderVsTarget(tbody, rows) {
  tbody.replaceChildren();
  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${row.metric}</td>
      <td class="${cellClass(row.status_yours)}">${fmt(row.yours)}</td>
      <td class="${cellClass(row.status_projected)}">${fmt(row.projected)}</td>
      <td>${fmt(row.target)}</td>`;
    tbody.appendChild(tr);
  }
}

const MAX_BYTES = 40 * 1024 * 1024;
const STATUS_ANALYZE = 'Uploading → Analyzing with CoProducer engine → Building report';

let player;

function $(id) { return document.getElementById(id); }

function setError(msg) {
  const el = $('error');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function setDropEnabled(on) {
  const input = $('fileInput');
  const drop = $('dropzone');
  if (input) input.disabled = !on;
  if (drop) drop.dataset.disabled = on ? 'false' : 'true';
}

function renderFindings(ul, findings) {
  ul.replaceChildren();
  for (const f of findings || []) {
    const li = document.createElement('li');
    const sev = document.createElement('div');
    sev.className = 'sev';
    sev.textContent = f.severity || '';
    const title = document.createElement('h3');
    title.textContent = f.title || 'Finding';
    const msg = document.createElement('p');
    msg.textContent = f.message || '';
    li.append(sev, title, msg);
    if (f.action) {
      const act = document.createElement('p');
      act.textContent = f.action;
      li.append(act);
    }
    ul.appendChild(li);
  }
}

function renderStreaming(wrap, tbody, rows) {
  tbody.replaceChildren();
  if (!Array.isArray(rows) || !rows.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  for (const row of rows) {
    const tr = document.createElement('tr');
    const cells = [
      row.platform,
      fmt(row.target_lufs),
      fmt(row.true_peak_ceiling_dbtp),
      fmt(row.estimated_gain_db),
      fmt(row.projected_true_peak_dbtp),
      row.status,
    ];
    for (const v of cells) {
      const td = document.createElement('td');
      td.textContent = v == null ? '—' : String(v);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function renderPlan(el, plan) {
  el.replaceChildren();
  if (!plan || !plan.needed) {
    el.textContent = 'No automatic repair needed';
    return;
  }
  const actions = plan.actions || [];
  if (actions.length) {
    const ul = document.createElement('ul');
    for (const act of actions) {
      const li = document.createElement('li');
      li.textContent = act.reason ? `${act.label}: ${act.reason}` : (act.label || act.id || '');
      ul.appendChild(li);
    }
    el.appendChild(ul);
  }
  for (const c of plan.cautions || []) {
    const p = document.createElement('p');
    p.className = 'caution';
    p.textContent = c;
    el.appendChild(p);
  }
}

async function loadPlayer(file) {
  const root = $('uploadPlayer');
  const playBtn = root?.querySelector('.cp-play');
  if (playBtn) playBtn.disabled = true;
  try {
    if (!player) player = new CoproducerPlayer(root, { mode: 'single' });
    await player.load({ a: file });
    if (playBtn) playBtn.disabled = !player.bufA;
  } catch {
    if (playBtn) playBtn.disabled = true;
  }
}

function renderReport(data, file) {
  const report = $('report');
  report.hidden = false;
  $('scoreNumber').textContent = data.score == null ? '—' : String(data.score);
  $('ratingText').textContent = data.rating || '';
  $('summary').textContent = data.summary || '';
  renderFindings($('findings'), data.findings);
  renderStreaming($('streamingWrap'), document.querySelector('#streamingTable tbody'), data.streaming);
  renderVsTarget(document.querySelector('#vsTarget tbody'), data.vs_target || []);
  renderPlan($('planList'), data.plan);
  loadPlayer(file);
  report.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function analyzeFile(file) {
  setError('');
  if (file.size > MAX_BYTES) {
    setError('File exceeds 40 MB');
    return;
  }
  const status = $('engineStatus');
  status.textContent = STATUS_ANALYZE;
  setDropEnabled(false);
  const fd = new FormData();
  fd.append('file', file);
  try {
    const res = await fetch(apiBase() + '/api/analyze', { method: 'POST', body: fd });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error */ }
    if (!res.ok) {
      const msg = (body && body.error) || (res.status === 503
        ? 'Engine is analyzing another file'
        : `Analysis failed (${res.status})`);
      throw new Error(msg);
    }
    renderReport(body, file);
    status.textContent = 'Report ready';
  } catch (err) {
    setError(err.message || 'Analysis failed');
    status.textContent = 'Analysis failed';
  } finally {
    setDropEnabled(true);
  }
}

async function checkHealth() {
  const status = $('engineStatus');
  const offline = $('offline');
  try {
    const res = await fetch(apiBase() + '/health');
    if (!res.ok) throw new Error('health');
    const data = await res.json();
    if (!data.ok) throw new Error('health');
    status.textContent = data.engine || 'Engine connected';
    offline.hidden = true;
    setDropEnabled(true);
  } catch {
    status.textContent = 'Engine offline';
    offline.hidden = false;
    setDropEnabled(false);
  }
}

function wire() {
  const input = $('fileInput');
  const drop = $('dropzone');
  if (!input || !drop) return;

  checkHealth();

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) analyzeFile(file);
  });

  drop.addEventListener('click', (e) => {
    if (input.disabled || drop.dataset.disabled === 'true') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // <label> already forwards clicks to the file input once it is hidden.
    if (drop.tagName !== 'LABEL' && e.target !== input) input.click();
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      if (drop.dataset.disabled !== 'true') drop.classList.add('drag');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); });
  });
  drop.addEventListener('drop', (e) => {
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file && !input.disabled && drop.dataset.disabled !== 'true') analyzeFile(file);
  });

}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
}
