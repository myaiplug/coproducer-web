// Lacquer reader notes: real comments, stored by the API at coproducer-comments.netlify.app.
// No seeded or sample comments. Every note shown here was posted by a reader.
const API = "https://coproducer-comments.netlify.app/api/comments";
const MAX_NAME = 40;
const MAX_TEXT = 1500;

function slug() {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  return file.replace(/\.html?$/, "").replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "").slice(0, 100) || "index";
}

function initials(name) {
  const p = String(name).replace(/[._-]/g, " ").trim().split(/\s+/).filter(Boolean);
  const a = (p[0] && p[0][0]) || "?";
  const b = (p[1] && p[1][0]) || (p[0] && p[0][1]) || "";
  return (a + b).toUpperCase();
}

function hue(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 33 + c.codePointAt(0)) % 360;
  return h;
}

const rtf = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
function relTime(iso) {
  const t = Date.parse(iso);
  if (!t) return "";
  const s = Math.round((t - Date.now()) / 1000);
  const steps = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.345, "week"], [12, "month"], [Infinity, "year"]];
  let v = s;
  for (const [n, unit] of steps) {
    if (Math.abs(v) < n) {
      if (unit === "second" && Math.abs(v) < 45) return "just now";
      return rtf ? rtf.format(Math.round(v), unit) : new Date(t).toLocaleDateString();
    }
    v /= n;
  }
  return new Date(t).toLocaleDateString();
}

function node(c) {
  const el = document.createElement("article");
  el.className = "cmt";
  el.innerHTML = `
    <div class="cmt-av" aria-hidden="true"></div>
    <div>
      <p class="cmt-head"><span class="cmt-user"></span><time></time></p>
      <p class="cmt-text"></p>
    </div>`;
  const h = hue(c.name);
  const av = el.querySelector(".cmt-av");
  av.style.background = `hsl(${h} 35% 18%)`;
  av.style.color = `hsl(${h} 70% 72%)`;
  av.textContent = initials(c.name);
  el.querySelector(".cmt-user").textContent = c.name; // textContent only: reader text is never parsed as HTML
  const time = el.querySelector("time");
  time.dateTime = c.createdAt;
  time.title = new Date(c.createdAt).toLocaleString();
  time.textContent = relTime(c.createdAt);
  el.querySelector(".cmt-text").textContent = c.text;
  return el;
}

export function mount(root) {
  const id = slug();
  let order = "desc";
  try { order = localStorage.getItem("lacquer.notes.order") === "asc" ? "asc" : "desc"; } catch {}
  let rows = [];

  root.innerHTML = `
    <div class="cmt-headrow">
      <h2>The booth</h2>
      <p class="cmt-count" aria-live="polite">Loading reader notes…</p>
    </div>
    <div class="cmt-order" role="group" aria-label="Sort notes" hidden>
      <button type="button" data-order="desc">Newest first</button>
      <button type="button" data-order="asc">Oldest first</button>
    </div>
    <div class="cmt-list"></div>
    <form class="cmt-form" novalidate>
      <p class="cmt-form-k">Leave a note</p>
      <div class="cmt-row">
        <label class="cmt-sr" for="cmt-name-${id}">Name or handle</label>
        <input id="cmt-name-${id}" name="name" maxlength="${MAX_NAME}" minlength="2" required placeholder="Name or handle" autocomplete="nickname">
        <label class="cmt-sr" for="cmt-email-${id}">Email (optional, never shown)</label>
        <input id="cmt-email-${id}" name="email" type="email" maxlength="254" placeholder="Email (optional, never shown)" autocomplete="email">
      </div>
      <div class="cmt-hp" aria-hidden="true">
        <label>Website <input name="website" tabindex="-1" autocomplete="off"></label>
      </div>
      <label class="cmt-sr" for="cmt-text-${id}">Your note</label>
      <textarea id="cmt-text-${id}" name="text" required maxlength="${MAX_TEXT}" rows="4" placeholder="What did this change in your session?"></textarea>
      <div class="cmt-row cmt-actions">
        <span class="cmt-left">${MAX_TEXT} characters left</span>
        <button type="submit">Post note</button>
      </div>
      <p class="cmt-status" role="status" aria-live="polite"></p>
      <p class="cmt-note">Notes are public and appear for every reader. Notes with links wait for review. Be useful. No pitch decks. <a href="methodology.html#comments">How notes are moderated</a>.</p>
    </form>`;

  const list = root.querySelector(".cmt-list");
  const count = root.querySelector(".cmt-count");
  const orderBox = root.querySelector(".cmt-order");
  const form = root.querySelector("form");
  const status = root.querySelector(".cmt-status");
  const left = root.querySelector(".cmt-left");
  const button = form.querySelector("button[type=submit]");

  const paint = () => {
    list.replaceChildren();
    const sorted = [...rows].sort((a, b) => (order === "asc" ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
    if (!sorted.length) {
      const p = document.createElement("p");
      p.className = "cmt-empty";
      p.textContent = "No notes yet. Be the first to leave a note.";
      list.append(p);
    }
    for (const c of sorted) list.append(node(c));
    count.textContent = rows.length === 1 ? "1 note from a reader." : `${rows.length} notes from readers.`;
    orderBox.hidden = rows.length < 2;
    orderBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.order === order)));
  };

  const quiet = (msg) => {
    list.replaceChildren();
    const p = document.createElement("p");
    p.className = "cmt-quiet";
    p.textContent = msg;
    list.append(p);
    count.textContent = "Reader notes are offline for the moment.";
  };

  const load = async () => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(`${API}?slug=${encodeURIComponent(id)}&order=${order}`, { signal: ctl.signal, credentials: "omit" });
      clearTimeout(timer);
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      rows = Array.isArray(data.comments) ? data.comments : [];
      paint();
    } catch {
      quiet("Reader notes could not load right now. Try again later. The essay above is unaffected.");
    }
  };

  orderBox.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-order]");
    if (!b) return;
    order = b.dataset.order;
    try { localStorage.setItem("lacquer.notes.order", order); } catch {}
    paint();
  });

  const ta = form.querySelector("textarea");
  ta.addEventListener("input", () => { left.textContent = `${MAX_TEXT - ta.value.length} characters left`; });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get("name") || "").trim();
    const text = String(fd.get("text") || "").trim();
    const email = String(fd.get("email") || "").trim();
    if (name.length < 2) { status.textContent = "Add a name or handle (2 to 40 characters)."; return; }
    if (text.length < 2) { status.textContent = "Write a note first."; return; }
    button.disabled = true;
    status.textContent = "Posting…";
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ slug: id, name, text, email: email || undefined, website: String(fd.get("website") || "") }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.status === 201 && data.comment) {
        rows.push(data.comment);
        form.reset();
        left.textContent = `${MAX_TEXT} characters left`;
        status.textContent = "Posted. Thanks for the note.";
        paint();
      } else if (r.status === 202) {
        form.reset();
        left.textContent = `${MAX_TEXT} characters left`;
        status.textContent = "Thanks. Your note includes a link, so it will appear after a quick review.";
      } else if (r.status === 429) {
        status.textContent = "You have posted a few notes in a row. Give it a few minutes and try again.";
      } else if (r.status === 409) {
        status.textContent = "That note is already posted.";
      } else if (r.status === 400) {
        const m = { name_too_long: "Names can be up to 40 characters.", text_too_long: "Notes can be up to 1,500 characters.", bad_email: "That email does not look right. You can leave it empty." };
        status.textContent = m[data.error] || "Check the name and note, then try again.";
      } else {
        throw new Error(String(r.status));
      }
    } catch {
      status.textContent = "Notes are not saving right now. Your text is still in the box. Please try again later.";
    } finally {
      button.disabled = false;
    }
  });

  load();
}
