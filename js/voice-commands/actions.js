/** Map a recognised command onto Stem Studio (engine = window.__studioUi.engine). Pure apart from the engine calls. */
const GROUPS = {
  vocals: ['vocals', 'lead', 'backing'],                         // "mute vocals" also covers a lead/backing split
  drums: ['drums', 'kick', 'snare', 'hats', 'toms', 'cymbals', 'ride', 'crash', 'perc', 'sub808'],
};

/** Tracks a stem word refers to: exact kind first, then the group (vocals / drums), then the track name. */
export function targets(tracks, stem) {
  const exact = tracks.filter((t) => t.kind === stem);
  if (exact.length) return exact;
  const g = GROUPS[stem]; if (g) { const m = tracks.filter((t) => g.includes(t.kind)); if (m.length) return m; }
  const re = new RegExp(`\\b${stem}`, 'i'); return tracks.filter((t) => re.test(t.name));
}

/**
 * Apply cmd ({action, stem}) and return the guide-voice clip key to confirm with.
 * hooks.exportNow() starts an export (the Render & export button).
 */
export function applyCommand(cmd, eng, hooks = {}) {
  if (!cmd) return 'not_understood';
  const { action, stem } = cmd, tracks = eng.tracks || [];
  if (['mute', 'unmute', 'solo', 'unsolo', 'unmute_all', 'play', 'export'].includes(action) && !tracks.length) return 'no_stems';
  if (stem) {
    const ts = targets(tracks, stem);
    if (!ts.length) return `missing:${stem}`;
    if (action === 'mute') ts.forEach((t) => eng.setMix(t, { mute: true }));
    else if (action === 'unmute') ts.forEach((t) => eng.setMix(t, { mute: false }));
    else if (action === 'solo') { for (const t of tracks) if (t.solo && !ts.includes(t)) eng.setMix(t, { solo: false }); ts.forEach((t) => eng.setMix(t, { solo: true, mute: false })); }
    return `${action}:${stem}`;
  }
  if (action === 'unsolo') { tracks.filter((t) => t.solo).forEach((t) => eng.setMix(t, { solo: false })); return 'unsolo'; }
  if (action === 'unmute_all') { tracks.filter((t) => t.mute).forEach((t) => eng.setMix(t, { mute: false })); return 'unmute_all'; }
  if (action === 'play') { if (!eng.playing) eng.play(); return 'play'; }
  if (action === 'pause') { eng.pause(); return 'pause'; }
  if (action === 'stop') { eng.stop(); return 'stop'; }
  if (action === 'export') { hooks.exportNow?.(); return 'export'; }
  return 'not_understood';
}
