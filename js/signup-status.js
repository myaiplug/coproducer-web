/* Shows the result of a signup (?status=...) or unsubscribe (?status=..., ?t=token) on the Journal notice pages. No tracking. */
(function () {
  var q = new URLSearchParams(location.search);
  var s = (q.get("status") || "").toLowerCase();
  var box = document.getElementById("notice-status");
  var T = {
    ok: ["You are on the list. The checklist is right below, and it is yours either way.", false],
    invalid: ["That did not look like a valid email address, or the link has expired. Nothing was saved. You can try again from any essay.", true],
    consent: ["Nothing was saved, because the consent line was not accepted. You can try again from any essay.", true],
    busy: ["Lots of signups from your network just now. Nothing was saved. Please try again in an hour.", true],
    error: ["Something went wrong on our side, and nothing was saved. The checklist below is yours regardless. Please try again later.", true],
    done: ["Done. You are unsubscribed and will not be written to again.", false],
    erased: ["Done. Your address has been erased.", false]
  };
  if (box && T[s]) {
    box.textContent = T[s][0];
    box.classList.toggle("is-bad", T[s][1]);
    box.hidden = false;
  }
  var tok = document.getElementById("unsub-token");
  if (tok) {
    var t = q.get("t") || "";
    if (/^[A-Za-z0-9_-]{20,40}$/.test(t)) tok.value = t;
    else if (!T[s]) {
      var f = document.getElementById("unsub-form");
      if (f) f.hidden = true;
      if (box) { box.textContent = "This page needs the personal link from a Lacquer email. Write to NoDAW@nodawlabs.com and we will remove you by hand."; box.hidden = false; }
    }
    if (T[s]) { var f2 = document.getElementById("unsub-form"); if (f2) f2.hidden = true; }
  }
})();
