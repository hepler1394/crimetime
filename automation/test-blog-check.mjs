// node --test automation/test-blog-check.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { postTokens, unsupportedInPost, postWords } from "./blog-check.mjs";

const NOTES = `Joseph James DeAngelo Jr. (born November 8, 1945) is an American serial killer known as the Golden State Killer, who committed thirteen murders across California between 1974 and 1986. In 2018 investigators used genetic genealogy. He pleaded guilty in June 2020 in Sacramento. Michelle McNamara coined the name.`;

test("names mid-sentence and runs at the start of a sentence count; a lone first word does not", () => {
  const t = postTokens("Nobody saw it coming. Joseph DeAngelo pleaded guilty in Sacramento. Detectives in California waited.");
  assert.ok(t.includes("DeAngelo"));
  assert.ok(t.includes("Sacramento"));
  assert.ok(t.includes("California"));
  assert.ok(!t.includes("Nobody"));
  assert.ok(!t.includes("Detectives"));
});

test("numbers are picked up, including spelled-out equivalents in the notes", () => {
  const post = { title: "The Golden State Killer", body: ["He killed 13 people between 1974 and 1986."] };
  assert.deepEqual(unsupportedInPost(post, NOTES), []);
});

test("an invented name and a wrong year are caught", () => {
  const post = { title: "The Golden State Killer", body: ["In 2019 Paul Holes named him in Sacramento."] };
  const miss = unsupportedInPost(post, NOTES);
  assert.ok(miss.includes("2019"));
  assert.ok(miss.includes("Paul Holes"));
  assert.ok(!miss.includes("Sacramento"));
});

test("a currency amount is one number (the Delphi hold: US$41,000 read as 000)", () => {
  assert.deepEqual(postTokens("A reward was set at US$41,000. Later $1,000 more.", { numbersOnly: true }).sort(), ["1000", "41000"]);
  const post = { title: "x", body: ["A reward was set at US$41,000."] };
  assert.deepEqual(unsupportedInPost(post, "The reward reached $41,000 by March."), []);
});

test("headings only have their numbers checked", () => {
  const post = { title: "x", body: ["## What Changed After The Arrest", "## The 1999 Break"] };
  assert.deepEqual(unsupportedInPost(post, NOTES), ["1999"]);
});

test("possessives and punctuation do not break a name", () => {
  const t = postTokens("It was McNamara's name for him, used by California's press.");
  assert.ok(t.includes("McNamara"));
  assert.ok(t.includes("California"));
});

test("the host and the show are never treated as claims", () => {
  const post = { title: "x", body: ["Here is what I found, Cory here for CrimeTimeSnacks."] };
  assert.deepEqual(unsupportedInPost(post, NOTES), []);
});

test("word count ignores headings", () => {
  assert.equal(postWords({ body: ["## A Heading Here", "one two three"] }), 3);
});

import { unsupportedQuotes, stockLines } from "./blog-check.mjs";

test("an invented quotation is caught; one in the notes passes whatever the quote marks", () => {
  const notes = `The judge asked, "Are you pleading guilty because you are guilty?" He said yes.`;
  const ok = { body: ["Hippler asked him: “Are you pleading guilty because you are guilty?”"] };
  const bad = { body: ["He told reporters \"I never wanted any of this to happen\" outside."] };
  assert.deepEqual(unsupportedQuotes(ok, notes), []);
  assert.deepEqual(unsupportedQuotes(bad, notes), ["I never wanted any of this to happen"]);
  assert.deepEqual(unsupportedQuotes({ body: ["It was called \"touch DNA\" then."] }, notes), []);
});

test("stock lines and a copied opening are flagged", () => {
  const post = { title: "x", body: ["You have probably heard the headline version of this case.", "Read the file. Form your own conclusion."] };
  const hits = stockLines(post);
  assert.ok(hits.includes("headline version"));
  assert.ok(hits.includes("form your own conclusion"));
  const a = { title: "A", body: ["## H", "On a cold night in 1996 the call came in."] };
  const b = { title: "B", body: ["On a cold night in 1996 a different call."] };
  assert.ok(stockLines(b, [a]).some((h) => h.includes('"A"')));
  assert.deepEqual(stockLines({ title: "x", body: ["Plain opening here."] }), []);
});
