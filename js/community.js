// Follow-a-case forms. Talks to /api/community/*. No framework.
(function () {
  var forms = document.querySelectorAll("form.follow[data-case]");
  if (!forms.length) return;
  var me = { signedIn: false, follows: [] };

  function state(form, text, cls) { var el = form.querySelector(".follow-state"); el.textContent = text; el.className = "follow-state" + (cls ? " " + cls : ""); }
  function paint(form) {
    var slug = form.getAttribute("data-case");
    var btn = form.querySelector("button");
    var input = form.querySelector("input[type=email]");
    if (me.signedIn && me.follows.indexOf(slug) > -1) {
      btn.textContent = "Following"; btn.classList.add("following"); btn.dataset.mode = "unfollow"; input.style.display = "none";
      state(form, "You follow this case. Click again to stop.", "");
    } else if (me.signedIn) {
      btn.textContent = "Follow this case"; btn.classList.remove("following"); btn.dataset.mode = "follow"; input.style.display = "none";
      state(form, "Signed in as " + me.email + ".", "");
    } else {
      btn.textContent = "Follow this case"; btn.classList.remove("following"); btn.dataset.mode = "email"; input.style.display = "";
    }
  }
  function api(path, body) {
    return fetch(path, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); return j; }); });
  }

  // Landing from an email link.
  var q = new URLSearchParams(location.search);
  if (q.get("follow") === "confirmed") forms.forEach(function (f) { state(f, "Confirmed. You will get an email when something happens in this case.", "ok"); });
  if (q.get("follow") === "invalid") forms.forEach(function (f) { state(f, "That link was not valid. Enter your email to get a fresh one.", "err"); });

  api("/api/community/me").then(function (j) { me = j; forms.forEach(paint); }).catch(function () { forms.forEach(paint); });

  forms.forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var slug = form.getAttribute("data-case");
      var btn = form.querySelector("button");
      var input = form.querySelector("input[type=email]");
      var mode = btn.dataset.mode || "email";
      if (mode === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) { state(form, "Enter a valid email.", "err"); input.focus(); return; }
      btn.disabled = true; state(form, mode === "unfollow" ? "Removing..." : "One moment...", "");
      var req = mode === "unfollow" ? api("/api/community/unfollow", { case: slug }) : api("/api/community/follow", { case: slug, email: input.value.trim() });
      req.then(function (j) {
        if (j.state === "check-email") { state(form, "Check your email and click the link to confirm. Then you are set.", "ok"); input.value = ""; }
        else if (j.state === "following") { me.follows.push(slug); me.signedIn = true; paint(form); state(form, "Following. We will email you when something happens.", "ok"); }
        else if (j.state === "unfollowed") { me.follows = me.follows.filter(function (s) { return s !== slug; }); paint(form); state(form, "Unfollowed.", ""); }
      }).catch(function (err) { state(form, err.message, "err"); }).then(function () { btn.disabled = false; });
    });
  });
})();
