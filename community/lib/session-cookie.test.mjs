// node --test community/lib/session-cookie.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { storageKeyFor, accessTokenFromCookieHeader } from "./session-cookie.mjs";

const URL_BASE = "https://iwsjhiplpbagqkepogmg.supabase.co";
const KEY = storageKeyFor(URL_BASE);
const b64url = (s) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const session = (token) => `base64-${b64url(JSON.stringify({ access_token: token, token_type: "bearer", user: { id: "u1" } }))}`;

test("derives the storage key from the project URL", () => {
  assert.equal(KEY, "sb-iwsjhiplpbagqkepogmg-auth-token");
  assert.equal(storageKeyFor("https://abc123.supabase.co/"), "sb-abc123-auth-token");
  assert.equal(storageKeyFor(""), null);
  assert.equal(storageKeyFor("not a url"), null);
});

test("reads the access token out of a single cookie", () => {
  const header = `theme=dark; ${KEY}=${session("aaa.bbb.ccc")}; other=1`;
  assert.equal(accessTokenFromCookieHeader(header, KEY), "aaa.bbb.ccc");
});

test("reassembles a cookie the browser split into chunks", () => {
  // @supabase/ssr splits anything over 3180 bytes into <key>.0, <key>.1 and so on. A
  // session with a Google avatar URL in it goes over that, so this is the normal case for
  // a signed-in member, not an edge case.
  const whole = session("aaa.bbb.ccc");
  const cut = Math.floor(whole.length / 2);
  const header = `${KEY}.0=${whole.slice(0, cut)}; ${KEY}.1=${whole.slice(cut)}`;
  assert.equal(accessTokenFromCookieHeader(header, KEY), "aaa.bbb.ccc");
});

test("puts chunks back in index order, not the order the browser sent them", () => {
  const whole = session("aaa.bbb.ccc");
  const cut = Math.floor(whole.length / 2);
  const header = `${KEY}.1=${whole.slice(cut)}; ${KEY}.0=${whole.slice(0, cut)}`;
  assert.equal(accessTokenFromCookieHeader(header, KEY), "aaa.bbb.ccc");
});

test("accepts a value that was not base64 wrapped", () => {
  const header = `${KEY}=${encodeURIComponent(JSON.stringify({ access_token: "plain.jwt.here" }))}`;
  assert.equal(accessTokenFromCookieHeader(header, KEY), "plain.jwt.here");
});

test("gives nothing back rather than guessing", () => {
  assert.equal(accessTokenFromCookieHeader("", KEY), null);
  assert.equal(accessTokenFromCookieHeader(null, KEY), null);
  assert.equal(accessTokenFromCookieHeader("cts_m=deadbeef", KEY), null);
  assert.equal(accessTokenFromCookieHeader(`${KEY}=base64-!!!not-base64!!!`, KEY), null);
  assert.equal(accessTokenFromCookieHeader(`${KEY}=base64-${b64url("not json")}`, KEY), null);
  assert.equal(accessTokenFromCookieHeader(`${KEY}=base64-${b64url('{"user":{"id":"u1"}}')}`, KEY), null);
  assert.equal(accessTokenFromCookieHeader(`${KEY}=${session("x")}`, null), null);
});

test("a missing middle chunk is absent, not a half-decoded token", () => {
  const whole = session("aaa.bbb.ccc");
  const third = Math.floor(whole.length / 3);
  const header = `${KEY}.0=${whole.slice(0, third)}; ${KEY}.2=${whole.slice(third * 2)}`;
  assert.equal(accessTokenFromCookieHeader(header, KEY), null);
});

test("is not fooled by a cookie whose name merely starts the same", () => {
  const header = `${KEY}-code-verifier=abc; ${KEY}x=${session("nope")}`;
  assert.equal(accessTokenFromCookieHeader(header, KEY), null);
});
