// node --test automation/test-audio-compare.mjs
// The cases are the real ones from the Petito audit on 2026-09-18, plus the false alarms that
// had to be tuned out before the audit could be a publish gate.
import test from "node:test";
import assert from "node:assert/strict";
import { compareWords } from "./audio-compare.mjs";

// Turn a sentence into the word list the ASR helper returns. "[x]" marks a low-confidence word.
const heard = (s) => s.split(/\s+/).map((w, i) => ({ w: w.replace(/[\[\]]/g, ""), s: i * 0.3, p: /^\[/.test(w) ? 0.01 : 0.95 }));
const kinds = (script, said, ok) => compareWords([script], heard(said), ok).findings.map((f) => f.kind);

test("a clean read finds nothing", () => {
  assert.deepEqual(kinds("He made unauthorized withdrawals using her Capital One debit card.", "He made unauthorized withdrawals using her Capital One debit card."), []);
});
test("Capital One read as Capra One is caught", () => {
  assert.deepEqual(kinds("withdrawals using Petito's Capital One debit card. He took out more", "withdrawals using Petito's Capra One debit card. He took out more"), ["MISHEARD"]);
});
test("a stuttered extra word at low confidence is an artifact", () => {
  assert.deepEqual(kinds("a federal warrant for intent to defraud. He was accused of making", "a federal warrant for intent to defraud. [fraud,] he was accused of making"), ["ARTIFACT"]);
});
test("a confident extra word is the model's business, not a stutter", () => {
  assert.deepEqual(kinds("they drove away on the highway together", "they drove away on the the highway together"), []);
});
test("three dropped words in a row are caught", () => {
  assert.deepEqual(kinds("The medical examiner confirmed she was killed by blunt force injuries to her head", "The medical examiner confirmed she was killed to her head"), ["DROPPED"]);
});
test("a surname heard as a common word is spelling, not a glitch", () => {
  assert.deepEqual(kinds("police took Laundrie to a local hotel for the night", "police took laundry to a local hotel for the night"), []);
});
test("numbers, plurals and joined words are not findings", () => {
  assert.deepEqual(kinds("He took out more than a thousand dollars that week", "He took out more than $1,000 that week"), []);
  assert.deepEqual(kinds("sobbing in the passenger seat of the van", "sobbing in the passengers seat of the van"), []);
  assert.deepEqual(kinds("part of the vanlife movement that summer", "part of the van life movement that summer"), []);
});
test("a garbled last word of a paragraph is still caught", () => {
  assert.deepEqual(kinds("On November 23, authorities announced their conclusion.", "On November 23rd, he announced their conclusion."), ["MISHEARD"]);
});
test("audioOk lets a name through", () => {
  assert.deepEqual(kinds("She worked at a Publix supermarket in North Port", "She worked at a public supermarket in North Port"), ["MISHEARD"]);
  assert.deepEqual(kinds("She worked at a Publix supermarket in North Port", "She worked at a public supermarket in North Port", ["Publix"]), []);
});
