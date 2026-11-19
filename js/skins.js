/* CoProducer site skins. Persist in localStorage; tokens live in css/skins.css. */
(function () {
  const KEY = "coproducer-skin";
  const DEFAULT = "violet";
  const SKINS = [
    { id: "violet", label: "Violet", swatch: "linear-gradient(135deg,#e84cff,#6a1d9a)" },
    { id: "chrome", label: "Chrome", swatch: "linear-gradient(135deg,#f7f8fb,#1e6cff)" },
    { id: "gold", label: "Gold", swatch: "linear-gradient(135deg,#fff6d1,#8a6a1a)" },
    { id: "ice", label: "Ice", swatch: "linear-gradient(135deg,#f0fdff,#155e75)" },
    { id: "crimson", label: "Crimson", swatch: "linear-gradient(135deg,#ffe4e8,#7a1f2c)" },
    { id: "emerald", label: "Emerald", swatch: "linear-gradient(135deg,#e8fff5,#166534)" }
  ];
  const IDS = new Set(SKINS.map((s) => s.id));

  function read() {
    try {
      const q = new URLSearchParams(location.search).get("skin");
      if (q && IDS.has(q)) return q;
    } catch (e) {}
    try {
      const v = localStorage.getItem(KEY);
      if (v && IDS.has(v)) return v;
    } catch (e) {}
    const now = document.documentElement.getAttribute("data-skin");
    return IDS.has(now) ? now : DEFAULT;
  }

  function apply(id, persist) {
    const skin = IDS.has(id) ? id : DEFAULT;
    document.documentElement.setAttribute("data-skin", skin);
    document.documentElement.dataset.skin = skin;
    try {
      if (persist !== false) localStorage.setItem(KEY, skin);
    } catch (e) {}
    document.querySelectorAll("[data-skin-option]").forEach((btn) => {
      const on = btn.getAttribute("data-skin-option") === skin;
      btn.setAttribute("aria-checked", on ? "true" : "false");
    });
    const theme = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && theme) meta.setAttribute("content", theme);
  }

  function closeMenu(root) {
    const menu = root.querySelector(".skin-menu");
    const toggle = root.querySelector(".skin-switch-toggle");
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function mount(el) {
    if (!el || el.dataset.mounted === "1") return;
    el.dataset.mounted = "1";
    el.classList.add("skin-switch");
    const current = read();
    const menuId = "skin-menu";
    el.innerHTML =
      '<button type="button" class="skin-switch-toggle" aria-expanded="false" aria-haspopup="true" aria-controls="' +
      menuId +
      '" aria-label="Choose color skin" title="Skins"></button>' +
      '<div class="skin-menu" id="' + menuId + '" hidden>' +
      '<div class="skin-menu-label" id="skin-menu-label">Skins</div>' +
      '<div class="skin-options" role="radiogroup" aria-labelledby="skin-menu-label">' +
      SKINS.map((s) => {
        const checked = s.id === current ? "true" : "false";
        return (
          '<button type="button" role="radio" class="skin-option" data-skin-option="' +
          s.id +
          '" aria-checked="' + checked + '" aria-label="' + s.label + ' skin">' +
          '<span class="skin-swatch" style="--swatch:' + s.swatch + '"></span>' +
          s.label +
          "</button>"
        );
      }).join("") +
      "</div></div>";

    const toggle = el.querySelector(".skin-switch-toggle");
    const menu = el.querySelector(".skin-menu");
    const options = [...el.querySelectorAll("[data-skin-option]")];

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = menu.hidden;
      menu.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        const selected = el.querySelector('[aria-checked="true"]') || options[0];
        selected.focus();
      }
    });

    options.forEach((btn, i) => {
      btn.addEventListener("click", () => {
        apply(btn.getAttribute("data-skin-option"), true);
        closeMenu(el);
        toggle.focus();
      });
      btn.addEventListener("keydown", (e) => {
        const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        if (e.key in keys) {
          e.preventDefault();
          const next = (i + keys[e.key] + options.length) % options.length;
          options[next].focus();
        } else if (e.key === "Home") {
          e.preventDefault();
          options[0].focus();
        } else if (e.key === "End") {
          e.preventDefault();
          options[options.length - 1].focus();
        } else if (e.key === "Escape") {
          closeMenu(el);
          toggle.focus();
        } else if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          apply(btn.getAttribute("data-skin-option"), true);
          closeMenu(el);
          toggle.focus();
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (!el.contains(e.target)) closeMenu(el);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu(el);
    });
  }

  function findMounts() {
    const existing = document.querySelectorAll("[data-skin-switch]");
    if (existing.length) return existing;
    const hosts = [
      document.querySelector(".nav-inner"),
      document.querySelector(".site-nav-inner"),
      document.querySelector(".cp-nav .in"),
      document.querySelector("nav .wrap.nav"),
      document.querySelector("nav .wrap"),
      document.querySelector("header .nav-inner"),
      document.querySelector("header")
    ].filter(Boolean);
    return hosts.slice(0, 1).map((host) => {
      const el = document.createElement("div");
      el.setAttribute("data-skin-switch", "");
      host.appendChild(el);
      return el;
    });
  }

  function boot() {
    apply(read(), false);
    findMounts().forEach(mount);
  }

  window.CoProducerSkins = { SKINS, DEFAULT, KEY, apply, read };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue) apply(e.newValue, false);
  });
})();
