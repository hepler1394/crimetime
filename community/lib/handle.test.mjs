// node --test community/lib/handle.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHandle, handleError, suggestHandle, RESERVED } from "./handle.mjs";

test("normalises case and surrounding space", () => {
  assert.equal(normalizeHandle("  Detective_Kate "), "detective_kate");
});

test("accepts a reasonable handle", () => {
  assert.equal(handleError("detective_kate"), null);
  assert.equal(handleError("kate99"), null);
  assert.equal(handleError("abc"), null);
  assert.equal(handleError("a".repeat(20)), null);
});

test("rejects what it should, with a message a reader understands", () => {
  assert.match(handleError(""), /pick a handle/i);
  assert.match(handleError("ab"), /3 characters/);
  assert.match(handleError("a".repeat(21)), /20 characters/);
  assert.match(handleError("kate smith"), /letters, numbers/i);
  assert.match(handleError("kate-smith"), /letters, numbers/i);
  assert.match(handleError("kate.smith"), /letters, numbers/i);
  assert.match(handleError("9lives"), /start with a letter/i);
  assert.match(handleError("_kate"), /start with a letter/i);
  assert.match(handleError(null), /pick a handle/i);
  assert.match(handleError(undefined), /pick a handle/i);
  assert.match(handleError(12345), /pick a handle/i);
});

test("reserves the words that would impersonate the show or collide with a route", () => {
  for (const w of ["admin", "cory", "crimetimesnacks", "account", "signin", "api", "support"]) {
    assert.ok(RESERVED.has(w), `${w} should be reserved`);
    assert.match(handleError(w), /not available/i);
  }
});

test("reserved words are matched after normalising", () => {
  assert.match(handleError("  ADMIN "), /not available/i);
  assert.match(handleError("Cory"), /not available/i);
});

test("every reserved word is itself a shape the validator would otherwise accept", () => {
  // A reserved word that could never be typed as a handle anyway is dead weight, and
  // worse, it hides a real one that was meant to be there.
  for (const w of RESERVED) {
    assert.match(w, /^[a-z][a-z0-9_]{2,19}$/, `"${w}" is reserved but is not a valid handle shape`);
  }
});

test("suggests a handle from the name the person already shows in public", () => {
  // Google gives a display name, not an address. Suggesting from the address would put
  // part of someone's email on a public profile because they pressed enter too fast.
  assert.equal(suggestHandle("Kate Smith"), "kate_smith");
  assert.equal(suggestHandle("  Mary-Jane  O'Brien "), "mary_jane_obrien");
  assert.equal(suggestHandle("J. R. Hartley"), "j_r_hartley");
  assert.equal(suggestHandle("Cory"), "cory_");          // reserved, so nudged rather than dropped
  assert.equal(suggestHandle("Ann"), "ann");
});

test("gives nothing back rather than a handle that would be refused", () => {
  assert.equal(suggestHandle("99"), "");                  // no letter to start with
  assert.equal(suggestHandle(""), "");
  assert.equal(suggestHandle(null), "");
  assert.equal(suggestHandle("   "), "");
  assert.equal(suggestHandle("Jo"), "");                  // too short, and nothing to pad it with
});

test("a suggestion is always a handle the rules accept", () => {
  for (const name of ["Kate Smith", "Mary-Jane O'Brien", "J. R. Hartley", "Cory",
                      "A Very Long Display Name That Goes On And On", "Ann"]) {
    const s = suggestHandle(name);
    if (s) assert.equal(handleError(s), null, `${name} suggested ${s}`);
  }
});
