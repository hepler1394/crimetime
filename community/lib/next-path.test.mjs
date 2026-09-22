// node --test community/lib/next-path.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./next-path.mjs";

test("keeps a same-origin path", () => {
  assert.equal(safeNext("/cases/delphi.html"), "/cases/delphi.html");
  assert.equal(safeNext("/u/detective_kate"), "/u/detective_kate");
  assert.equal(safeNext("/account?tab=cases"), "/account?tab=cases");
});

test("refuses anything that could leave the site", () => {
  // An open redirect on a sign-in page is a phishing primitive: the link looks like
  // crimetimesnacks.com, and the person lands somewhere else already trusting it.
  assert.equal(safeNext("https://evil.example.com"), "/account");
  assert.equal(safeNext("//evil.example.com"), "/account");
  assert.equal(safeNext("http://evil.example.com/x"), "/account");
  assert.equal(safeNext("javascript:alert(1)"), "/account");
  assert.equal(safeNext("/\\evil.example.com"), "/account");
  assert.equal(safeNext("/\t/evil.example.com"), "/account");
});

test("refuses header-splitting attempts", () => {
  assert.equal(safeNext("/ok\r\nLocation: https://evil.example.com"), "/account");
  assert.equal(safeNext("/ok\nSet-Cookie: a=b"), "/account");
});

test("falls back for anything that is not a path at all", () => {
  assert.equal(safeNext(""), "/account");
  assert.equal(safeNext(null), "/account");
  assert.equal(safeNext(undefined), "/account");
  assert.equal(safeNext("not-a-path"), "/account");
  assert.equal(safeNext(42), "/account");
  assert.equal(safeNext({}), "/account");
});
