#!/usr/bin/env node
// Show-format tests: the fixed opener and outro, and which theme bed a case gets.
// Run: npm run test:format
import { test } from "node:test";
import assert from "node:assert/strict";
import { OPENER, OUTRO, THEMES, DEFAULT_THEME, enforceShowFormat, pickTheme } from "./episode-format.mjs";

test("a script with no opener gets one", () => {
  const s = enforceShowFormat(["Here is the strangest detail in the case file.", "The end of the story."]);
  assert.ok(s[0].startsWith(OPENER), s[0]);
  assert.ok(s[0].includes("strangest detail"), "the original first line survives");
});

test("a paraphrased opener is replaced, not stacked", () => {
  const s = enforceShowFormat([
    "What's up guys, thanks for tuning in to Crime Time Snacks, the true crime podcast. Here is the hook.",
    "Last words.",
  ]);
  assert.ok(s[0].startsWith(OPENER), s[0]);
  assert.ok(!s[0].includes("thanks for tuning in"), "the old opener is gone");
  assert.ok(s[0].includes("Here is the hook."), "the rest of the paragraph survives");
  assert.equal(s[0].match(/What's up guys/g).length, 1, "exactly one opener");
});

test("the outro is appended to the last paragraph", () => {
  const s = enforceShowFormat(["Opening.", "That is where the case stands."]);
  assert.ok(s.at(-1).endsWith(OUTRO), s.at(-1));
  assert.ok(s.at(-1).includes("where the case stands"), "the original ending survives");
});

test("a paraphrased sign-off is replaced, not stacked", () => {
  const s = enforceShowFormat(["Opening.", "That is where it stands. I'm Cory, and I'll catch you next time."]);
  assert.equal(s.at(-1).match(/catch you next time/g).length, 1, s.at(-1));
  assert.ok(s.at(-1).endsWith(OUTRO));
  assert.ok(!s.at(-1).includes("I'm Cory"), "the old sign-off is gone");
});

test("the old stay-safe sign-off is converted, not kept alongside the new one", () => {
  const s = enforceShowFormat(["Opening.", "Read the file. Form your own conclusion. Stay curious, stay informed, and as always, stay safe."]);
  assert.ok(!s.at(-1).includes("stay safe"), s.at(-1));
  assert.ok(s.at(-1).includes("Read the file. Form your own conclusion."), "the hand-off to the listener survives");
  assert.ok(s.at(-1).endsWith(OUTRO));
});

test("running it twice changes nothing", () => {
  const once = enforceShowFormat(["Here is the hook.", "That is where it stands."]);
  assert.deepEqual(enforceShowFormat(once), once);
});

test("a one paragraph script gets both the opener and the outro", () => {
  const s = enforceShowFormat(["The whole show."]);
  assert.equal(s.length, 1);
  assert.ok(s[0].startsWith(OPENER) && s[0].endsWith(OUTRO), s[0]);
});

test("an empty script is left alone rather than becoming an opener with no episode", () => {
  assert.deepEqual(enforceShowFormat([]), []);
});

test("themes are the four the show actually has", () => {
  assert.deepEqual(THEMES, ["cold-case", "active-investigation", "missing-person", "courtroom"]);
  assert.ok(THEMES.includes(DEFAULT_THEME));
});

test("court words pick the courtroom bed", () => {
  assert.equal(pickTheme({ title: "Delphi The Appeal" }), "courtroom");
  assert.equal(pickTheme({ title: "The Menendez Brothers Parole Years" }), "courtroom");
  assert.equal(pickTheme({ title: "The Moscow Murders Plea Deal" }), "courtroom");
});

test("a disappearance picks the missing person bed", () => {
  assert.equal(pickTheme({ title: "The Disappearance of Gabby Petito" }), "missing-person");
  assert.equal(pickTheme({ title: "Where Is Maura Murray", hook: "She vanished on a back road." }), "missing-person");
});

test("a live hunt picks the active investigation bed", () => {
  assert.equal(pickTheme({ title: "The Gilgo Beach Murders", hook: "The manhunt is still open." }), "active-investigation");
});

test("anything else falls back to the cold case bed", () => {
  assert.equal(pickTheme({ title: "The Golden State Killer" }), "cold-case");
  assert.equal(pickTheme({}), DEFAULT_THEME);
});

test("the hook and keywords count, not just the title", () => {
  assert.equal(pickTheme({ title: "Thirty Years On", keywords: ["retrial", "evidence"] }), "courtroom");
});

test("a theme is never invented", () => {
  for (const c of [{ title: "x" }, { title: "trial" }, { title: "missing" }, { title: "manhunt" }]) {
    assert.ok(THEMES.includes(pickTheme(c)), c.title);
  }
});
