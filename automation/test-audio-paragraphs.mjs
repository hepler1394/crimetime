// node --test automation/test-audio-paragraphs.mjs
// The case is the real one: on 2026-09-20 episode-splice.mjs refused the finished Miami episode
// with "Found 80 paragraph gaps for 80 paragraphs; refusing to guess where they are." The extra
// gap was a beat the clone left inside paragraph 3, after "That is in the notes for a reason",
// before "Let's unpack it."
import test from "node:test";
import assert from "node:assert/strict";
import { selectJoins, paragraphAt } from "./audio-paragraphs.mjs";

// Three paragraphs, and a pause inside the middle one as well as the two real joins.
const PARAS = [
  "One more thing before we start. If any part of this sounds like your life, the hotline number is in the notes.",
  "That is in the notes for a reason. Let's unpack it.",
  "They lived in unit 2201 at One Paraiso Residences, a luxury high-rise in Edgewater.",
];
// start, end of every stretch of near silence. The middle one is the beat, not a join.
const GAPS = [
  { start: 6.0, end: 6.55 },     // join 0 -> 1
  { start: 9.4, end: 10.06 },    // the beat inside paragraph 1
  { start: 11.1, end: 11.62 },   // join 1 -> 2
];
const TOTAL = 17.0;

// A word list of the kind asr_words.py returns, covering all three paragraphs.
const say = (text, from, step = 0.25) => text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
  .map((w, i) => ({ w, s: +(from + i * step).toFixed(2), e: +(from + i * step + 0.2).toFixed(2), p: 0.99 }));
const WORDS = [...say(PARAS[0], 0.2), ...say("That is in the notes for a reason.", 6.6), ...say("Let's unpack it.", 10.1), ...say(PARAS[2], 11.7)];

test("a beat inside a paragraph is not mistaken for a join", () => {
  const { picked, how } = selectJoins(GAPS, PARAS, TOTAL, WORDS);
  assert.equal(how, "transcript");
  assert.deepEqual(picked, [0, 2], "the join before 'Let's unpack it.' is the beat, not the boundary");
});

test("with no transcript it still returns a usable answer", () => {
  const { picked, how } = selectJoins(GAPS, PARAS, TOTAL, null);
  assert.equal(how, "length fit");
  assert.equal(picked.length, 2);
  assert.ok(picked[0] < picked[1]);
});

test("an exact count needs no choosing", () => {
  const two = [GAPS[0], GAPS[2]];
  const { picked, how } = selectJoins(two, PARAS, TOTAL, null);
  assert.equal(how, "count");
  assert.deepEqual(picked, [0, 1]);
});

test("a moment lands in the paragraph that contains it", () => {
  const spans = [[0, 6], [6.55, 11.1], [11.62, 17]];
  assert.equal(paragraphAt(spans, 3), 0);
  assert.equal(paragraphAt(spans, 9.5), 1);
  assert.equal(paragraphAt(spans, 12), 2);
  // Inside a join it belongs to whichever paragraph is nearer, so a finding on the tail of one
  // paragraph does not get reported against the next.
  assert.equal(paragraphAt(spans, 6.1), 0);
  assert.equal(paragraphAt(spans, 6.5), 1);
});
