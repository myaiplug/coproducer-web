export function clamp01(x) { return Math.min(1, Math.max(0, x)); }
export function equalPowerGains(t) {
  const x = clamp01(t);
  return { a: Math.cos(x * Math.PI / 2), b: Math.sin(x * Math.PI / 2) };
}
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function offsetFromClick(x, width, duration) {
  if (!width || !duration) return 0;
  return clamp01(x / width) * duration;
}
export function lookaheadWindow(playhead, duration, ahead = 3) {
  const start = Math.max(0, Math.min(playhead, duration));
  return { start, end: Math.min(duration, start + ahead) };
}
export function colorForCentroidHz(hz) {
  if (hz < 400) return '#22d3ee';
  if (hz < 4000) return '#10b981';
  return '#facc15';
}
