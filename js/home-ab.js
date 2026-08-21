import { CoproducerPlayer } from './player.js';

const DEMO = new URL('../demo/', import.meta.url);

const FALLBACK = [
  {
    id: 'crazy-stacy',
    title: 'Crazy Stacy',
    problem: '831 clipped samples and an unsafe true peak on a vocal mix.',
    beforeFile: 'before.m4a',
    afterFile: 'after.m4a',
    before: { score: 70 },
    after: { score: 90 },
    rows: [
      { metric: 'Score', before: 70, after: 90, delta: 20 },
      { metric: 'Rating', before: 'Usable after technical corrections', after: 'Release ready', delta: '' },
      { metric: 'Integrated LUFS', before: -12.61, after: -13.63, delta: -1.02 },
      { metric: 'True peak dBTP', before: 0.33, after: 0.04, delta: -0.29 },
      { metric: 'Dynamic range dB', before: 10.4, after: 10.78, delta: 0.38 },
      { metric: 'Clipped samples', before: 831, after: 0, delta: -831 },
      { metric: 'Noise floor dBFS', before: -34.19, after: -31.78, delta: 2.41 },
      { metric: 'Phase correlation', before: 0.98, after: 0.971, delta: -0.01 },
    ],
  },
  {
    id: 'beatgohard',
    title: 'BeatGoHard',
    problem: 'True peak above the −1.0 dBTP streaming ceiling with no sample clips.',
    beforeFile: '33-hard-before.m4a',
    afterFile: '33-hard-after.m4a',
    before: { score: 77 },
    after: { score: 95 },
    rows: [
      { metric: 'Score', before: 77, after: 95, delta: 18 },
      { metric: 'Rating', before: 'Good with minor corrections', after: 'Release ready', delta: '' },
      { metric: 'Integrated LUFS', before: -15.11, after: -15.42, delta: -0.31 },
      { metric: 'True peak dBTP', before: -0.3, after: -1.0, delta: -0.7 },
      { metric: 'Dynamic range dB', before: 12.63, after: 12.18, delta: -0.45 },
      { metric: 'Clipped samples', before: 0, after: 0, delta: 0 },
      { metric: 'Noise floor dBFS', before: -30.04, after: -30.09, delta: -0.05 },
      { metric: 'Phase correlation', before: 0.926, after: 0.923, delta: 0 },
    ],
  },
  {
    id: 'drippin',
    title: 'Drippin',
    problem: '231k clipped samples, −11.9 LUFS, and a +1.06 dBTP overshoot.',
    beforeFile: 'bassboost-before.m4a',
    afterFile: 'bassboost-after.m4a',
    before: { score: 66 },
    after: { score: 93 },
    rows: [
      { metric: 'Score', before: 66, after: 93, delta: 27 },
      { metric: 'Rating', before: 'Usable after technical corrections', after: 'Release ready', delta: '' },
      { metric: 'Integrated LUFS', before: -11.92, after: -14.12, delta: -2.2 },
      { metric: 'True peak dBTP', before: 1.06, after: 0.23, delta: -0.83 },
      { metric: 'Dynamic range dB', before: 7.98, after: 10.08, delta: 2.1 },
      { metric: 'Clipped samples', before: 231310, after: 0, delta: -231310 },
      { metric: 'Noise floor dBFS', before: null, after: null, delta: '' },
      { metric: 'Phase correlation', before: 0.982, after: 0.966, delta: -0.02 },
    ],
  },
];

function fmtCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function gate(metric, v) {
  if (v === null || v === undefined || v === '') return '';
  const m = String(metric).toLowerCase();
  if (m === 'rating') {
    return String(v).toLowerCase().includes('release ready') ? 'good' : 'bad';
  }
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  if (m === 'score') return n >= 90 ? 'good' : 'bad';
  if (m.includes('lufs')) return Math.abs(n - (-14)) <= 1.5 ? 'good' : 'bad';
  if (m.includes('true peak')) return n <= -1 + 0.15 ? 'good' : 'bad';
  if (m.includes('clipped')) return n === 0 ? 'good' : 'bad';
  if (m.includes('dynamic')) return n >= 8 ? 'good' : 'bad';
  if (m.includes('noise')) return n <= -40 ? 'good' : 'bad';
  if (m.includes('phase')) return n >= 0.2 ? 'good' : 'bad';
  return '';
}

function deltaTone(metric, before, after, delta) {
  if (delta === null || delta === undefined || delta === '') return '';
  const gb = gate(metric, before);
  const ga = gate(metric, after);
  if (ga === 'good' && gb === 'bad') return 'good';
  if (ga === 'bad' && gb === 'good') return 'bad';
  const d = Number(delta);
  if (!Number.isFinite(d) || d === 0) return '';
  const m = String(metric).toLowerCase();
  if (m === 'score' || m.includes('dynamic') || m.includes('phase')) return d > 0 ? 'good' : 'bad';
  if (m.includes('clipped') || m.includes('true peak') || m.includes('noise')) {
    return d < 0 ? 'good' : 'bad';
  }
  if (m.includes('lufs')) {
    return Math.abs(Number(after) + 14) < Math.abs(Number(before) + 14) ? 'good' : 'bad';
  }
  return '';
}

function renderRows(track) {
  const tbody = document.querySelector('#abTable tbody');
  if (!tbody || !track?.rows) return;
  tbody.replaceChildren();
  for (const row of track.rows) {
    const tr = document.createElement('tr');
    const tdM = document.createElement('td');
    tdM.textContent = row.metric;
    const tdB = document.createElement('td');
    tdB.textContent = fmtCell(row.before);
    tdB.className = gate(row.metric, row.before);
    const tdA = document.createElement('td');
    tdA.textContent = fmtCell(row.after);
    tdA.className = gate(row.metric, row.after);
    const tdD = document.createElement('td');
    tdD.textContent = fmtCell(row.delta);
    tdD.className = deltaTone(row.metric, row.before, row.after, row.delta);
    tr.append(tdM, tdB, tdA, tdD);
    tbody.appendChild(tr);
  }
}

function paintPicker(picker, tracks, currentId) {
  if (!picker) return;
  picker.replaceChildren();
  for (const track of tracks) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.id = track.id;
    const from = track.before?.score ?? '';
    const to = track.after?.score ?? '';
    btn.textContent = from === '' ? track.title : `${track.title}  ${from}→${to}`;
    if (track.id === currentId) btn.classList.add('is-live');
    picker.appendChild(btn);
  }
}

async function loadCatalog() {
  try {
    const res = await fetch(new URL('tracks.json', DEMO));
    if (!res.ok) return FALLBACK;
    const data = await res.json();
    return Array.isArray(data.tracks) && data.tracks.length ? data.tracks : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

function demoFile(name) {
  return new URL(name, DEMO).href;
}

async function boot() {
  const picker = document.getElementById('abTracks');
  const story = document.getElementById('abStory');
  const root = document.getElementById('abPlayer');
  const tracks = await loadCatalog();
  let currentId = tracks[0].id;
  paintPicker(picker, tracks, currentId);
  if (story) story.textContent = tracks[0].problem || '';
  renderRows(tracks[0]);

  if (!root) {
    if (story) story.textContent = 'A/B player markup is missing.';
    return;
  }

  const player = new CoproducerPlayer(root, { mode: 'ab', theme: 'home' });

  function syncLive() {
    const side = player.getSide();
    document.querySelectorAll('#abTable tbody tr').forEach((tr) => {
      if (tr.cells[1]) tr.cells[1].classList.toggle('live', side === 'a');
      if (tr.cells[2]) tr.cells[2].classList.toggle('live', side === 'b');
    });
    root.querySelectorAll('.cp-ab [data-side]').forEach((btn) => {
      btn.classList.toggle('is-live', btn.dataset.side === side);
    });
  }

  async function showTrack(id) {
    const track = tracks.find((t) => t.id === id) || tracks[0];
    currentId = track.id;
    paintPicker(picker, tracks, currentId);
    if (story) story.textContent = track.problem || '';
    renderRows(track);
    const wasPlaying = player.playing;
    const side = player.getSide();
    try {
      await player.load({
        a: demoFile(track.beforeFile),
        b: demoFile(track.afterFile),
      });
      player.setSide(side);
      syncLive();
      if (wasPlaying) player.play();
    } catch (err) {
      if (story) {
        story.textContent = `${track.problem || ''} Audio could not load (${err && err.message ? err.message : 'decode failed'}). Serve this folder over http, not as a file:// page.`;
      }
    }
  }

  picker?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn || btn.dataset.id === currentId) return;
    showTrack(btn.dataset.id);
  });
  root.querySelectorAll('.cp-ab [data-side]').forEach((btn) => {
    btn.addEventListener('click', () => {
      player.setSide(btn.dataset.side);
      syncLive();
    });
  });

  await showTrack(currentId);
}

boot().catch((err) => {
  const story = document.getElementById('abStory');
  if (story) story.textContent = `Could not start A/B: ${err && err.message ? err.message : err}`;
  const picker = document.getElementById('abTracks');
  paintPicker(picker, FALLBACK, FALLBACK[0].id);
  renderRows(FALLBACK[0]);
});
