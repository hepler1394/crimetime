// node --test community/lib/site-url.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { siteOrigin } from "./site-url.mjs";

const req = (url) => ({ url });

test("uses the public site, not the host the request arrived on", () => {
  // This zone is served at www.crimetimesnacks.com through a Vercel rewrite, which means
  // the request reaches it addressed to its own vercel.app host. Building a redirect from
  // that host sends the person off the real domain mid sign-in - and the session cookie is
  // scoped to crimetimesnacks.com, so it cannot even be set once they land there.
  assert.equal(
    siteOrigin(req("https://crimetime-community.vercel.app/auth/callback?code=abc"), "https://www.crimetimesnacks.com"),
    "https://www.crimetimesnacks.com",
  );
});

test("keeps only the origin, whatever else the setting carries", () => {
  assert.equal(siteOrigin(req("https://x.vercel.app/a"), "https://www.crimetimesnacks.com/"), "https://www.crimetimesnacks.com");
  assert.equal(siteOrigin(req("https://x.vercel.app/a"), "https://www.crimetimesnacks.com/some/path"), "https://www.crimetimesnacks.com");
});

test("falls back to the request when there is no setting, which is local development", () => {
  assert.equal(siteOrigin(req("http://localhost:3000/auth/landing"), undefined), "http://localhost:3000");
  assert.equal(siteOrigin(req("http://localhost:3000/auth/landing"), ""), "http://localhost:3000");
  assert.equal(siteOrigin(req("http://localhost:3000/auth/landing"), "   "), "http://localhost:3000");
});

test("a setting that is not a URL is ignored rather than trusted", () => {
  assert.equal(siteOrigin(req("http://localhost:3000/x"), "not a url"), "http://localhost:3000");
  assert.equal(siteOrigin(req("http://localhost:3000/x"), "/account"), "http://localhost:3000");
});
