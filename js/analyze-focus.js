/* analyze.html deep links: analyze.html?check=lufs|tp|mono|lowend|tails|format|clips|punch
   Adds a quiet banner above the drop zone, then (once a file has been read) points at the meter that matters.
   Nothing here touches the analysis itself; it only highlights what the engine already measured.
   Journal essays link here with ?check=<focus>&utm_source=journal&utm_medium=essay&utm_campaign=<essay-slug>. */
(function () {
  "use strict";
  var FOCI = {
    lufs:   { label: "Integrated LUFS", meters: ["lufs"], line: "Drop your bounce. We will point at the LUFS row and show how far it sits from the −14 lane (±1.5 LU).", gate: function (v) { return v >= -15.5 && v <= -12.5; }, unit: "LUFS", target: "−14 ± 1.5" },
    tp:     { label: "True peak", meters: ["tp", "clips"], line: "Drop your bounce. We will point at true peak and clipped samples. The ceiling is −1.0 dBTP, measured on the file you actually export.", gate: function (v) { return v <= -1.0; }, unit: "dBTP", target: "≤ −1.0" },
    mono:   { label: "Mono and phase", meters: ["phase", "ch"], line: "Drop your bounce. We will point at phase correlation. Below about 0.2 the mix starts to thin in mono. Then audition the fold-down yourself.", gate: function (v) { return v >= 0.2; }, unit: "", target: "≥ 0.2" },
    lowend: { label: "Low end", meters: ["crest", "lufs"], dock: "referenceDock", line: "Drop your bounce, then a finished track you trust in the reference panel. The Low (30–120 Hz) and Low-mid zones show where your low end sits against it." },
    tails:  { label: "Edges and tails", meters: ["dur", "lufs"], line: "Drop your bounce. Check the duration against what you meant to export, and watch whether LUFS moves once the head and tail are trimmed." },
    format: { label: "File format", meters: ["sr", "ch", "dur"], line: "Drop your bounce. We will point at sample rate and channels so the file matches what the store asked for.", gate: function (v) { return v >= 44.1; }, unit: "kHz", target: "≥ 44.1" },
    clips:  { label: "Clipped samples", meters: ["clips", "tp"], line: "Drop your bounce. Any clipped sample is permanent, so we will point at the clip count first.", gate: function (v) { return v === 0; }, unit: "", target: "0" },
    punch:  { label: "Crest and punch", meters: ["crest", "lufs"], line: "Drop your bounce. Crest factor is the distance between peak and average. Read it beside LUFS, not instead of it." }
  };
  var params = new URLSearchParams(location.search);
  var key = (params.get("check") || "").toLowerCase();
  var f = FOCI[key];
  if (!f) return;

  var css = document.createElement("style");
  css.textContent =
    ".lq-focus{margin:22px 0 0;padding:14px 16px;border:1px solid rgba(196,165,116,.45);border-radius:12px;background:rgba(196,165,116,.06)}" +
    ".lq-focus b{display:block;font:600 10px 'JetBrains Mono',monospace;letter-spacing:.22em;text-transform:uppercase;color:#c4a574;margin-bottom:6px}" +
    ".lq-focus p{margin:0;color:#e9dfd6;font-size:14px;line-height:1.5}" +
    ".lq-focus .lq-read{margin-top:8px;font:600 12px 'JetBrains Mono',monospace;color:#c9ff4d}" +
    ".lq-focus .lq-read.is-off{color:#f0c27a}" +
    ".lq-focus a{color:#c4a574}" +
    "body.lq-has-focus #dropzone{box-shadow:0 0 0 1px rgba(196,165,116,.55)}" +
    ".meter.lq-hot{border-color:#c4a574!important;box-shadow:0 0 0 1px #c4a574 inset}" +
    "#meters.lq-dim .meter:not(.lq-hot){opacity:.55}" +
    ".dock.lq-hot{border-color:#c4a574}";
  document.head.appendChild(css);
  document.body.classList.add("lq-has-focus");

  var banner = document.createElement("div");
  banner.className = "lq-focus";
  banner.setAttribute("role", "note");
  banner.innerHTML = "<b>From the Journal · Checking " + f.label + "</b><p></p><p class=\"lq-read\" hidden></p>";
  banner.querySelector("p").textContent = f.line;
  var read = banner.querySelector(".lq-read");
  var anchor = document.getElementById("engineStatus");
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(banner, anchor);

  function num(el) {
    if (!el) return NaN;
    var m = el.textContent.replace("−", "-").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  }
  function apply() {
    var box = document.getElementById("meters");
    if (!box || box.hidden) return;
    box.classList.add("lq-dim");
    f.meters.forEach(function (k) {
      var el = box.querySelector('[data-m="' + k + '"]');
      if (el && el.parentElement) el.parentElement.classList.add("lq-hot");
    });
    if (f.dock) { var d = document.getElementById(f.dock); if (d) d.classList.add("lq-hot"); }
    if (f.gate) {
      var el = box.querySelector('[data-m="' + f.meters[0] + '"]');
      var v = num(el);
      if (key === "format" && el && /\bhz\b/i.test(el.textContent) && !/khz/i.test(el.textContent)) v = v / 1000;
      if (!isNaN(v)) {
        var ok = f.gate(v);
        read.hidden = false;
        read.className = "lq-read" + (ok ? "" : " is-off");
        read.textContent = f.label + ": " + (el ? el.textContent.trim() : v) + " · lane " + f.target + (f.unit ? " " + f.unit : "") + " · " + (ok ? "inside" : "outside");
      }
    }
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }
  var box = document.getElementById("meters");
  if (box) {
    var seen = false;
    new MutationObserver(function () {
      if (!box.hidden && !seen) { seen = true; setTimeout(apply, 250); }
    }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  }
})();
