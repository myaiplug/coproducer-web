/* Apply the saved skin before first paint. Keep this file tiny and load it synchronously in <head>. */
(function () {
  try {
    var allowed = { violet: 1, chrome: 1, gold: 1, ice: 1, crimson: 1, emerald: 1 };
    var q = new URLSearchParams(location.search).get("skin");
    var s = allowed[q] ? q : localStorage.getItem("coproducer-skin");
    document.documentElement.setAttribute("data-skin", allowed[s] ? s : "violet");
  } catch (e) {
    document.documentElement.setAttribute("data-skin", "violet");
  }
})();
