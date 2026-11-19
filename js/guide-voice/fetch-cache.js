/** Download with progress, SHA-256 check and CacheStorage (used by the guide-voice and voice-command workers). */
export async function sha256Hex(bytes) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function download(url, { cacheName, sha256 = null, onProgress = null, cache = true } = {}) {
  let store = null;
  if (cache && cacheName) {
    try { store = await caches.open(cacheName); const hit = await store.match(url); if (hit) { const b = new Uint8Array(await hit.arrayBuffer()); if (!sha256 || (await sha256Hex(b)) === sha256) return b; await store.delete(url); } }
    catch { store = null; }
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || 0;
  let bytes;
  if (!r.body || !total || !onProgress) bytes = new Uint8Array(await r.arrayBuffer());
  else {
    const reader = r.body.getReader(), chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(got / total); }
    bytes = new Uint8Array(got); let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.length; }
  }
  if (sha256) { const h = await sha256Hex(bytes); if (h !== sha256) throw new Error(`${url.split('/').pop()}: checksum mismatch (${h.slice(0, 12)}…)`); }
  if (store) store.put(url, new Response(bytes)).catch(() => {});
  return bytes;
}
