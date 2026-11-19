import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const css = readFileSync(join(root, "css/skins.css"), "utf8");
const js = readFileSync(join(root, "js/skins.js"), "utf8");
const boot = readFileSync(join(root, "js/skins-boot.js"), "utf8");
const svg = readFileSync(join(root, "assets/brand/coproducer-mark.svg"), "utf8");

const SKINS = ["violet", "chrome", "gold", "ice", "crimson", "emerald"];

test("all six skins are defined in CSS", () => {
  for (const id of SKINS) {
    assert.match(css, new RegExp(`\\[data-skin="${id}"\\]`));
    assert.match(css, new RegExp(`html\\[data-skin="${id}"\\]`));
  }
});

test("chrome skin uses Exo 2 italic and official-mark blues/silvers", () => {
  assert.match(css, /family=Exo\+2/);
  assert.match(css, /html\[data-skin="chrome"\][\s\S]*?--display-font:\s*"Exo 2"/);
  assert.match(css, /html\[data-skin="chrome"\][\s\S]*?--mark-wave:\s*#1e6cff/);
  assert.match(css, /html\[data-skin="chrome"\][\s\S]*?--mark-hi:\s*#f7f8fb/);
  assert.match(js, /"Exo 2"|Chrome/);
});

test("wordmark SVG follows skin color variables", () => {
  assert.match(svg, /--mark-hi/);
  assert.match(svg, /--mark-mid/);
  assert.match(svg, /--mark-lo/);
  assert.match(svg, /--mark-wave/);
  assert.match(svg, /id="cpMarkTitle">CoProducer/);
});

test("boot script only allows known skins and has no network I/O", () => {
  for (const id of SKINS) assert.match(boot, new RegExp(id));
  assert.doesNotMatch(boot, /fetch\(|XMLHttpRequest/);
  assert.match(boot, /coproducer-skin/);
});

test("switcher script persists to localStorage and lists every skin", () => {
  assert.match(js, /localStorage\.setItem\(KEY/);
  for (const id of SKINS) assert.match(js, new RegExp(`id: "${id}"`));
  assert.match(js, /role="radiogroup"/);
  assert.match(js, /prefers-reduced-motion|aria-checked|storage/);
});
