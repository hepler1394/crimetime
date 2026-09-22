// node --test community/lib/monogram.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { monogram } from "./monogram.mjs";

test("is deterministic and in range", () => {
  const a = monogram("detective_kate");
  assert.equal(a.initials, "DK");
  assert.equal(monogram("detective_kate").hue, a.hue);
  assert.ok(a.hue >= 0 && a.hue < 360);
});

test("falls back to one letter when there is no separator", () => {
  assert.equal(monogram("kate").initials, "K");
});

test("takes the first letter of the first two parts, and no more", () => {
  assert.equal(monogram("a_b_c_d").initials, "AB");
  assert.equal(monogram("kate_9").initials, "K9");
});

test("ignores empty parts left by stray underscores", () => {
  assert.equal(monogram("kate__smith").initials, "KS");
  assert.equal(monogram("_kate").initials, "K");
  assert.equal(monogram("kate_").initials, "K");
});

test("different handles mostly get different hues", () => {
  const names = ["kate", "kate_smith", "detective_kate", "gilgo_watcher", "annie", "bob_9"];
  const hues = new Set(names.map((n) => monogram(n).hue));
  assert.ok(hues.size >= names.length - 1, `too many collisions: ${[...hues].join(",")}`);
});

test("survives a handle that is missing or empty rather than throwing", () => {
  for (const bad of ["", null, undefined, 42]) {
    const m = monogram(bad);
    assert.equal(m.initials, "?");
    assert.ok(m.hue >= 0 && m.hue < 360);
  }
});
