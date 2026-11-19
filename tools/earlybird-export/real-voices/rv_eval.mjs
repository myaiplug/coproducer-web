import { chromium } from 'playwright-core'; import fs from 'node:fs';
// node rv_eval.mjs <manifest.json> <out.jsonl>
// Serve the repo root on 127.0.0.1:8124 (python3 -m http.server 8124) with a symlink _rv -> the built set/ dir.
const [manPath, outPath] = process.argv.slice(2);
const man = JSON.parse(fs.readFileSync(manPath)); const done = new Set(fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).id) : []);
const todo = man.filter((m) => !done.has(m.id)); console.log('todo', todo.length, 'done', done.size);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
const p = await (await b.newContext()).newPage(); p.setDefaultTimeout(0);
await p.goto('http://localhost:8124/stem-studio.html'); await p.waitForFunction(() => window.__studioUi?.voiceCommands, null, { timeout: 60000 });
await p.evaluate(() => __studioUi.voiceCommands.load());
for (let i = 0; i < todo.length; i += 100) {
  const batch = todo.slice(i, i + 100).map((m) => m.id);
  const res = await p.evaluate(async (ids) => { const out = [];
    for (const id of ids) { const a = new Float32Array(await (await fetch('/_rv/' + id + '.f32')).arrayBuffer()); const r = await __studioUi.voiceCommands.recognise(a);
      out.push({ id, text: r.text, lp: r.lp, cmd: r.command && [r.command.action, r.command.stem], phrase: r.command?.text ?? null, ms: Math.round(r.ms), cands: r.cands.map((c) => ({ s: +c.score.toFixed(3), d: +c.dist.toFixed(3), t: c.text })) }); }
    return out; }, batch);
  fs.appendFileSync(outPath, res.map((r) => JSON.stringify(r)).join('\n') + '\n'); console.log(i + res.length, '/', todo.length);
}
await b.close();
