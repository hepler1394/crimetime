// The origin to build redirects against.
//
// This zone is served at www.crimetimesnacks.com through a rewrite in the static site's
// vercel.json, which means every request reaches it addressed to its own vercel.app host.
// A redirect built from that host is a redirect off the real domain: the person finishes
// signing in on crimetime-community.vercel.app, and because the session cookie is scoped
// to crimetimesnacks.com it cannot be set there at all - so they land back on the sign-in
// page with no session and nothing to explain why. That is exactly what happened the first
// time Google sign-in ran against production.
//
// So redirects are built from SITE_URL, which names the address people actually use.
// Without it - local development - the request's own origin is right.
export function siteOrigin(request, configured = process.env.SITE_URL) {
  const set = String(configured ?? "").trim();
  if (set) {
    try { return new URL(set).origin; } catch { /* not a URL; fall through to the request */ }
  }
  return new URL(request.url).origin;
}
