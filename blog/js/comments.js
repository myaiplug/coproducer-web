const SEEDS = {
  crest: [
    { user: "TheoLane", role: "mix", when: "1d", text: "Crest vs LUFS is the confusion that ate my 2024. This essay should be taped to the fridge." },
    { user: "ivy.p", role: "master", when: "1d", text: "Drippin is the right example. Loudness lane moved; the clip story moved; crest followed the overs, not a new arrangement." },
    { user: "PJ_408", role: "indie", when: "12h", text: "Same. I stopped calling DR \u201cloudness\u201d after one distributor rejection.", replyTo: "TheoLane" },
  ],
  phase: [
    { user: "AminaK", role: "indie", when: "2d", text: "Mono check after every widener. Uncomfortable. Correct." },
    { user: "s.okonkwo", role: "mix", when: "1d", text: "CoProducer leaving phase out of auto-repair is why I trust the plan." },
  ],
  noise: [
    { user: "hollyanne", role: "podcast", when: "2d", text: "Turn-up revealing hiss is our whole career. Glad music people are writing it down." },
    { user: "lena.rewire", role: "live", when: "1d", text: "Sparse verses lie on the console and confess on earbuds." },
  ],
  limiter: [
    { user: "Miles.R", role: "mix", when: "1d", text: "BeatGoHard vs Crazy Stacy is the teaching pair. Cap versus session recall." },
    { user: "cass_master", role: "master", when: "1d", text: "Projected repair without a download is the adult UI." },
  ],
  sr: [
    { user: "yen.studio", role: "post", when: "3d", text: "Still getting 32 kHz files named MASTER_FINAL. The gate is not insulting. The filename is." },
  ],
  ref: [
    { user: "mara.voss", role: "mix", when: "1d", text: "Reference deltas beat \u201cmake it like that song\u201d every time." },
  ],
  album: [
    { user: "Keisha.M", role: "label", when: "2d", text: "We want outlier reports, not vibes. Batch HTML/JSON is how assistants survive album week." },
  ],
  reports: [
    { user: "nate_from_floor2", role: "assist", when: "1d", text: "HTML for A&R, JSON for me, TXT for Slack. Stop making me translate." },
  ],
  local: [
    { user: "OmarQ", role: "beat", when: "2d", text: "Upload queues are a tax on attention. Local drop is the refund." },
  ],
  stems: [
    { user: "june_in_the_booth", role: "vox", when: "1d", text: "Solo bass under the vocal once. Then fix the session. Stems are a flashlight." },
  ],
  screw: [
    { user: "DarnellOK", role: "beat", when: "1d", text: "Syrup is fun. True peak still exists afterward. Measure the render you post." },
  ],
  social: [
    { user: "hollyanne", role: "podcast", when: "1d", text: "Resize bats do frames. Analyzer bats do ears. Chain them in that order." },
  ],
  masterbat: [
    { user: "r.santiago", role: "master", when: "2d", text: "Bat for honest mixes. Session for dishonest ones. That sentence alone is the SOP." },
  ],
  score: [
    { user: "TheoLane", role: "mix", when: "1d", text: "Score is the headline. Red cells are the story." },
  ],
  reencode: [
    { user: "ivy.p", role: "master", when: "1d", text: "If you only leave 0.1 dBTP margin, the encoder will find you." },
  ],
  lounge: [
    { user: "mara.voss", role: "mix", when: "2d", text: "Finally a journal that talks like a bounce folder and not a plugin ad. Bookmarked Vol. 01 for the interns." },
    { user: "DarnellOK", role: "beat", when: "2d", text: "The A/B on the homepage is the part that got me. Same bar, no click. I sent BeatGoHard to my mix partner last night." },
    { user: "june_in_the_booth", role: "vox", when: "1d", text: "Please keep writing like this. Short answer up top, then the session notes. I do not have time for a 4,000-word funnel." },
    { user: "r.santiago", role: "master", when: "1d", replyTo: "DarnellOK", text: "Same. I still print my own limiter, but I want the number before I open the session. That chip list is doing real work." },
    { user: "Keisha.M", role: "label", when: "18h", text: "We started asking artists for a LUFS/TP screenshot with the WAV. This is the language we needed without sounding like legal." },
    { user: "nate_from_floor2", role: "assist", when: "12h", text: "NoDAW corner of the internet is small and I am fine with that. Less comments, more meters." },
  ],
  lufs: [
    { user: "TheoLane", role: "mix", when: "3d", text: "I wasted two years chasing −8 because a Facebook group said Spotify rewards loud. This is the article I needed in 2023." },
    { user: "ivy.p", role: "master", when: "3d", text: "Apple is the one that still surprises people. If Sound Check is on, your “competitive” master is just a quieter, flatter file." },
    { user: "OmarQ", role: "beat", when: "2d", replyTo: "TheoLane", text: "Same group told me to clip the 808 into the master bus. Drippin on the A/B is literally that mistake, measured." },
    { user: "lena.rewire", role: "live", when: "2d", text: "Practical bit: bounce, measure, then decide if you even need another limiter. I cut about 40 minutes off my last recall doing that." },
    { user: "PJ_408", role: "indie", when: "1d", text: "The −14 ± 1.5 window in CoProducer matches what I already print. Nice to see it written as a gate instead of a vibe." },
    { user: "hollyanne", role: "podcast", when: "1d", text: "We deliver speech at −16. This still helped — the “quiet files get turned up and show their dirt” line is the one I sent to talent." },
    { user: "s.okonkwo", role: "mix", when: "9h", replyTo: "ivy.p", text: "Yes. I keep a Sound Check toggle on the iPhone and A/B there, not in the control room at 85 dB." },
  ],
  peak: [
    { user: "cass_master", role: "master", when: "4d", text: "Sample peak at −0.1 and true peak at +0.4 is the classic trap. Phones will tell on you even if the DAW looks clean." },
    { user: "Miles.R", role: "mix", when: "3d", text: "BeatGoHard is the useful example because clips were already zero. You do not need a new mix. You need the cap last." },
    { user: "yen.studio", role: "post", when: "3d", replyTo: "cass_master", text: "Broadcast is worse. We still print −2 TP for some deliverables. Amazon’s −2 on the table is the one I flag for clients." },
    { user: "AminaK", role: "indie", when: "2d", text: "I always thought “don’t clip” meant the red lights in Ableton. This is why my AAC sounded crunchy and the WAV did not." },
    { user: "dex.hw", role: "assist", when: "1d", text: "Limiter last, re-measure, stop. I printed that above the patchbay. Thank you for not selling a new plugin in paragraph two." },
    { user: "r.santiago", role: "master", when: "14h", text: "Crazy Stacy still showing +0.04 in red after repair is why I trust the page. A fake 100 would have been a tell." },
  ],
  repair: [
    { user: "DarnellOK", role: "beat", when: "3d", text: "831 clips to zero is not a flex. It is a warning I ignored on three records. Playing Crazy Stacy A/B hurt in a useful way." },
    { user: "june_in_the_booth", role: "vox", when: "3d", text: "The “cannot restore clipped transients” line should be on every auto-master landing page. Most of them imply the opposite." },
    { user: "mara.voss", role: "mix", when: "2d", replyTo: "june_in_the_booth", text: "Agreed. If the vocal is already flattened, go back to the session. A delivery pass will not give you the consonant back." },
    { user: "Keisha.M", role: "label", when: "2d", text: "We started asking for the CoProducer score with the master. 66 on Drippin would have failed intake before it hit distribution." },
    { user: "TheoLane", role: "mix", when: "1d", text: "I like that the web form projects the numbers and does not pretend to hand me a mastered WAV. That is the adult version of this tool." },
    { user: "nate_from_floor2", role: "assist", when: "8h", text: "Ran our Friday bounce. Projected repair said loudnorm + limiter, phase left alone. That matched what the chief would have said." },
  ],
  vault: [
    { user: "ivy.p", role: "master", when: "5d", text: "I will not put an unreleased album on a $15/month renderer. Measurement does not require that. This essay is the polite version of my rants." },
    { user: "OmarQ", role: "beat", when: "4d", text: "I uploaded one beat in 2024 “just to see.” Never again. Local meter, then I decide." },
    { user: "PJ_408", role: "indie", when: "3d", replyTo: "OmarQ", text: "Same. The terms are never written for the person who still has the only unclipped session." },
    { user: "lena.rewire", role: "live", when: "2d", text: "FOH here. We measure locally before any vendor gets a stem. Glad someone wrote it without shouting." },
    { user: "Miles.R", role: "mix", when: "1d", text: "The 127.0.0.1 point is the one people miss. If Analyze works, it is because an engine is on a machine you can point at." },
    { user: "hollyanne", role: "podcast", when: "11h", text: "We send WAV to the host, not to a mastering club. Different job. This helped me explain it to a producer who wanted “the AI one.”" },
  ],
  list: [
    { user: "dex.hw", role: "assist", when: "2d", text: "Printed the six gates. Taped them on the bounce folder. Chief nodded. That is a good Friday." },
    { user: "AminaK", role: "indie", when: "2d", text: "Phase ≥ 0.2 is the one I kept skipping. Mono check on the NS-10s after this. Uncomfortable and correct." },
    { user: "s.okonkwo", role: "mix", when: "1d", replyTo: "AminaK", text: "If phase fails, do not buy a loudness tool. That sentence should be a poster." },
    { user: "yen.studio", role: "post", when: "1d", text: "Sample rate sounds insulting until you have been handed a 32 kHz MP3 labeled MASTER_FINAL2. It happens." },
    { user: "r.santiago", role: "master", when: "16h", text: "Score ≥ 90 is a house number, not ITU. Fine. Just know which gate is physics and which is CoProducer’s bar." },
    { user: "mara.voss", role: "mix", when: "6h", text: "Using Analyze as the intake form for clients now. They see red/green before they argue with me about “make it slap.”" },
  ],
};

const ROLES = {
  mix: "mixer",
  master: "mastering",
  beat: "producer",
  vox: "vocal",
  label: "A&R",
  assist: "assistant",
  indie: "independent",
  live: "FOH",
  post: "post",
  podcast: "podcast",
};

function slug() {
  const n = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (n.includes("crest-factor")) return "crest";
  if (n.includes("phase-correlation")) return "phase";
  if (n.includes("quiet-masters")) return "noise";
  if (n.includes("when-not-to-reach")) return "limiter";
  if (n.includes("sample-rate")) return "sr";
  if (n.includes("reference-matching")) return "ref";
  if (n.includes("album-consistency")) return "album";
  if (n.includes("why-three-report")) return "reports";
  if (n.includes("local-tools")) return "local";
  if (n.includes("stems-diagnose")) return "stems";
  if (n.includes("screw-tempo")) return "screw";
  if (n.includes("vertical-video")) return "social";
  if (n.includes("mastering-bat")) return "masterbat";
  if (n.includes("how-to-read")) return "score";
  if (n.includes("reencoding-eats")) return "reencode";
  if (n.includes("why-streaming")) return "lufs";
  if (n.includes("true-peak")) return "peak";
  if (n.includes("70-to-90")) return "repair";
  if (n.includes("unreleased")) return "vault";
  if (n.includes("checklist")) return "list";
  return "lounge";
}

function initials(name) {
  const p = String(name).replace(/[._-]/g, " ").trim().split(/\s+/);
  const a = p[0][0] || "N";
  const b = (p[1] && p[1][0]) || (p[0][1] || "L");
  return (a + b).toUpperCase();
}

function hue(name) {
  let h = 0;
  for (const c of name) h = (h * 33 + c.charCodeAt(0)) % 360;
  return h;
}

function loadExtra(id) {
  try {
    return JSON.parse(localStorage.getItem("lacquer.comments." + id) || "[]");
  } catch {
    return [];
  }
}

function saveExtra(id, rows) {
  localStorage.setItem("lacquer.comments." + id, JSON.stringify(rows.slice(-40)));
}

function node(c, isReply) {
  const el = document.createElement("article");
  el.className = "cmt" + (isReply ? " cmt-reply" : "");
  const h = hue(c.user);
  el.innerHTML = `
    <div class="cmt-av"></div>
    <div>
      <p class="cmt-head"><span class="cmt-user"></span><span class="cmt-role" hidden></span><span class="cmt-to" hidden></span><time></time></p>
      <p class="cmt-text"></p>
    </div>`;
  const av = el.querySelector(".cmt-av");
  av.style.background = `hsl(${h} 35% 18%)`;
  av.style.color = `hsl(${h} 70% 72%)`;
  av.textContent = initials(c.user);
  el.querySelector(".cmt-user").textContent = c.user;
  if (c.role && ROLES[c.role]) {
    const r = el.querySelector(".cmt-role");
    r.hidden = false;
    r.textContent = ROLES[c.role];
  }
  if (c.replyTo) {
    const t = el.querySelector(".cmt-to");
    t.hidden = false;
    t.textContent = "re: " + c.replyTo;
  }
  el.querySelector("time").textContent = c.when || "just now";
  el.querySelector(".cmt-text").textContent = c.text;
  return el;
}

function mount(root) {
  const id = root.dataset.thread || slug();
  const seeds = SEEDS[id] || SEEDS.lounge;
  const extras = loadExtra(id);
  root.innerHTML = `
    <div class="cmt-headrow">
      <h2>The booth</h2>
      <p>${seeds.length + extras.length} notes from the floor. Be useful. No pitch decks.</p>
    </div>
    <div class="cmt-list"></div>
    <form class="cmt-form">
      <p class="cmt-form-k">Leave a note</p>
      <div class="cmt-row">
        <input name="user" maxlength="28" required placeholder="handle (e.g. mara.voss)" autocomplete="nickname">
        <button type="submit">Post</button>
      </div>
      <textarea name="text" required maxlength="600" rows="3" placeholder="What did this change in your session?"></textarea>
      <p class="cmt-note">Stored in this browser only. The printed thread is the house conversation.</p>
    </form>`;
  const list = root.querySelector(".cmt-list");
  const paint = () => {
    list.replaceChildren();
    for (const c of seeds) list.append(node(c, Boolean(c.replyTo)));
    for (const c of extras) list.append(node(c, false));
    root.querySelector(".cmt-headrow p").textContent =
      `${seeds.length + extras.length} notes from the floor. Be useful. No pitch decks.`;
  };
  paint();
  root.querySelector("form").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const user = String(fd.get("user") || "").trim().slice(0, 28);
    const text = String(fd.get("text") || "").trim().slice(0, 600);
    if (!user || !text) return;
    extras.push({ user, text, when: "just now", role: "indie" });
    saveExtra(id, extras);
    e.target.reset();
    paint();
  });
}

document.querySelectorAll("[data-comments]").forEach(mount);
