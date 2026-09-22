// Who is signed in, asked once per page and shared with anything else that needs it.
//
// Every generated page loads this, so it is also the single place that asks
// /api/community/me. js/community.js reuses the promise rather than asking again: a case
// page was making the same request twice, once for the header and once for the follow form.
//
// Signed out is a normal answer. Nothing here throws, and nothing here leaves a red line
// in the console of a page opened by somebody who has never signed in.
(function () {
  var SIGNED_OUT = { signedIn: false, follows: [] };

  window.__ctsMe = fetch("/api/community/me", { credentials: "same-origin" })
    .then(function (r) { return r.ok ? r.json() : SIGNED_OUT; })
    .catch(function () { return SIGNED_OUT; });

  var link = document.querySelector("[data-account]");

  // Pages built from automation/shell.mjs carry the link in their markup, so it reads
  // "Sign in" before any script runs. A dozen older pages - the home page among them -
  // still keep their own copy of the header and have no such link, and adding one to each
  // by hand would be twelve copies to keep in step with the shell. Until those pages move
  // onto the shared header, this puts the link there: the same element, built here.
  if (!link) {
    var bar = document.querySelector(".utility-nav");
    if (!bar) return;
    link = document.createElement("a");
    link.className = "nav-account";
    link.href = "/signin";
    link.textContent = "Sign in";
    link.setAttribute("data-account", "out");
    bar.insertBefore(link, bar.querySelector(".nav-cta"));
  }

  window.__ctsMe.then(function (me) {
    if (!me || !me.signedIn) return;          // leave it saying Sign in
    link.href = "/account";
    link.textContent = me.handle ? "@" + me.handle : "Your account";
    link.setAttribute("data-account", "in");
    link.setAttribute("aria-label", "Your account");
  });
})();
