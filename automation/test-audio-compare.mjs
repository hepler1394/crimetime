// node --test automation/test-audio-compare.mjs
// The cases are the real ones from the Petito audit on 2026-09-18, plus the false alarms that
// had to be tuned out before the audit could be a publish gate.
import test from "node:test";
import assert from "node:assert/strict";
import { compareWords, tokens } from "./audio-compare.mjs";

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
test("a past tense folded into the next word is speech, not a glitch", () => {
  assert.deepEqual(kinds("They planned to spend four months visiting state and national parks", "They plan to spend four months visiting state and national parks"), []);
  assert.deepEqual(kinds("Police separated them for the night and drove away", "Police separate them for the night and drove away"), []);
});
test("names the transcriber spells its own way are not findings", () => {
  assert.deepEqual(kinds("Officer Scott Coonts arrived at the house that afternoon", "Officer Scott Koontz arrived at the house that afternoon"), []);
  assert.deepEqual(kinds("They arrived at the Cervi 319 worksite that night", "They arrived at the Servi 319 worksite that night"), []);
  assert.deepEqual(kinds("he had driven them from the house to the site", "he had driven them for the house to the site"), []);
});
test("a run of names is judged word by word", () => {
  const script = "Ethan Chapin, Madison Mogen, Xana Kernodle, and Kaylee Goncalves were all killed in the attack";
  assert.deepEqual(kinds(script, "Ethan Chapin, Madison Mogan, Zana Kernodle, and Kaley Goncalves were all killed in the attack", ["Xana"]), []);
  assert.deepEqual(kinds(script, "Ethan Chapman, Madison Mogan, Zana Knodel, and Kalyan Calvez were all killed in the attack", ["Xana"]), ["MISHEARD"]);
});
test("a garbled last word of a paragraph is still caught", () => {
  assert.deepEqual(kinds("On November 23, authorities announced their conclusion.", "On November 23rd, he announced their conclusion."), ["MISHEARD"]);
});
test("audioOk lets a name through", () => {
  assert.deepEqual(kinds("She worked at a Publix supermarket in North Port", "She worked at a public supermarket in North Port"), ["MISHEARD"]);
  assert.deepEqual(kinds("She worked at a Publix supermarket in North Port", "She worked at a public supermarket in North Port", ["Publix"]), []);
});
// Every case below is a real finding that held a finished episode on 2026-09-20. All ten were
// the transcriber spelling a word its own way, and between them they cost two episodes a day.
test("a silent letter is a spelling, not a mispronunciation", () => {
  // Turner Guilford KNIGHT Correctional Center, written "night". The clone says it correctly.
  assert.deepEqual(kinds("she stayed in the Turner Guilford Knight Correctional Center that year", "she stayed in the Turner Guilford night Correctional Center that year"), []);
  assert.deepEqual(kinds("the detective who wrote the note that night", "the detective who wrote the note that knight"), []);
});
test("Stephen and Steven are the same name out loud", () => {
  assert.deepEqual(kinds("One writer who has followed the case for years, Stephen Singular, said so", "One writer who has followed the case for years, Steven Singular, said so"), []);
  assert.deepEqual(kinds("the report filed by Detective Redfearn that afternoon", "the report filed by Detective Redfern that afternoon"), []);
});
test("a reduced pronunciation is speech, not a defect", () => {
  assert.deepEqual(kinds("Stop on that for a second, because April 1 is the whole case in miniature", "Stop on that for a second, cause April 1 is the whole case in miniature"), []);
});
test("a small word flipped next to a name is still just a small word", () => {
  // "Clenney's account to police" written "Clenny's account of police": the name was the only
  // reason the run was reported at all.
  assert.deepEqual(kinds("Clenney's account to police was that he shoved her", "Clenny's account of police was that he shoved her"), []);
});
test("a possessive the transcriber ran together is covered by the allow list", () => {
  assert.deepEqual(kinds("material from a mixed blood sample on JonBenét's underwear", "material from a mixed blood sample on JonBenese underwear", ["JonBenet"]), []);
});
test("a name that contains a number is still checked", () => {
  // tokens() maps "One" to "1", and the rule that forgives however a number was spelled used to
  // throw away the whole difference with it. "Capital One" read as "Capstone Mutual" produced
  // nothing at all - the exact shape of the failure this gate exists for. Found on 2026-09-21
  // by staging defects into the Petito audio and checking they survived.
  assert.deepEqual(kinds("he made withdrawals using Capstone Mutual debit card and left", "he made withdrawals using Capital One debit card and left"), ["MISHEARD"]);
  // And a difference that really is only about how a number was written is still forgiven.
  assert.deepEqual(kinds("He took out more than a thousand dollars that week", "He took out more than $1,000 that week"), []);
  assert.deepEqual(kinds("the Turner Guilford Knight Correctional Center on Sixth Street", "the Turner Guilford night Correctional Center on 6th Street"), []);
});
test("the mispronunciation that started all of this is still caught", () => {
  // If any of the rules above ever swallow this, the gate is worthless.
  assert.deepEqual(kinds("withdrawals using Petito's Capital One debit card. He took out more", "withdrawals using Petito's Capra One debit card. He took out more"), ["MISHEARD"]);
  assert.deepEqual(kinds("She worked at a Publix supermarket in North Port", "She worked at a public supermarket in North Port"), ["MISHEARD"]);
});
test("a finding carries the seconds a second listen needs", () => {
  const f = compareWords(["withdrawals using Petito's Capital One debit card"], heard("withdrawals using Petito's Capra One debit card")).findings[0];
  assert.equal(f.kind, "MISHEARD");
  assert.ok(Array.isArray(f.seconds) && f.seconds.length === 2, "seconds span");
  assert.equal(f.said, "capital");
  assert.equal(f.heard, "capra");
});
test("an accented name stays one word", () => {
  // "JonBenét's" used to come apart into "jonben" and "ts", because the strip that
  // removes punctuation turned the accented letter into a space. The audit then
  // reported the script saying "jonben ts" on every episode about her.
  assert.deepEqual(tokens("JonBenét's"), ["jonbenets"]);
  assert.deepEqual(tokens("JonBenét"), ["jonbenet"]);
  assert.deepEqual(kinds("The DNA came from JonBenét's underwear", "The DNA came from JonBenet's underwear"), []);
});
