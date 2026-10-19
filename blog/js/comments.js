// Lacquer reader notes: tiny loader. The thread UI (comments-app.js) and its API call
// only load when the comment section scrolls near the viewport.
const roots = document.querySelectorAll("[data-comments]");
const boot = (root) => import("./comments-app.js").then((m) => m.mount(root)).catch(() => {
  root.innerHTML = '<p class="cmt-quiet">Reader notes could not load right now. The essay above is unaffected.</p>';
});
if (roots.length) {
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { io.unobserve(e.target); boot(e.target); }
    }, { rootMargin: "400px 0px" });
    roots.forEach((r) => io.observe(r));
  } else {
    roots.forEach(boot);
  }
}
