// Tests for research source selection. Run: npm run test:research
//
// These exist because the Chris Watts notes were half about a different case. The research
// step asked Wikipedia for "Chris Watts: The Interrogation murder case", took the top two
// hits on trust, and wrote 22,000 characters about an Iraq court-martial into the file the
// fact gate checks episode scripts against. A claim could have been marked supported by
// evidence from an unrelated crime.
//
// The fixture titles and extracts below are the real ones that search returns.
import { test } from "node:test";
import assert from "node:assert/strict";
import { articleIsAboutCase, caseTokens } from "./studio/research-filter.mjs";

const about = (caseName, title, extract = "") => articleIsAboutCase(caseName, title, extract);

test("keeps the article that is actually about the case", () => {
  assert.equal(about("Chris Watts", "Watts family murders", "Christopher Lee Watts murdered his pregnant wife Shanann Watts"), true);
  assert.equal(about("Gabby Petito", "Killing of Gabby Petito", "Gabrielle Venora Petito was an American travelling vlogger"), true);
  assert.equal(about("Golden State Killer", "Golden State Killer", "Joseph James DeAngelo"), true);
});

test("rejects the unrelated articles that search actually returned", () => {
  // Top two for "Chris Watts: The Interrogation murder case" - what poisoned the real notes.
  assert.equal(about("Chris Watts", "Mahmudiyah rape and murders",
    "The Mahmudiyah rape and killings were war crimes committed by five U.S. Army soldiers in Iraq. Steven Dale Green"), false);
  assert.equal(about("Chris Watts", "List of murdered American children",
    "This is a list of notable murders of children in the United States. Adam Walsh. Polly Klaas."), false);
  // Hit two for the corrected query, which the old code would still have taken.
  assert.equal(about("Chris Watts", "Murder of Alice Gross",
    "Alice Gross was a 14-year-old British schoolgirl who disappeared in London"), false);
});

test("a stray first-name mention is not enough", () => {
  // "Chris" is a common name. One or two mentions must not carry an article.
  assert.equal(about("Chris Watts", "Some Other Case", "A detective named Chris attended. Chris later testified."), false);
});

test("keeps an article whose title names the place, not the person", () => {
  // The Moscow case's article is "University of Idaho killings" - no word of the case name is
  // in the title, so a title-only rule would have thrown away the correct article.
  const extract = "The University of Idaho killings occurred in Moscow, Idaho. Four students were stabbed in Moscow. " +
    "Moscow police and the Moscow Police Department investigated. The city of Moscow was shaken. Moscow, Idaho.";
  assert.equal(about("Murders in Moscow", "University of Idaho killings", extract), true);
});

test("ignores short and common words when matching", () => {
  const t = caseTokens("The Delphi Murders");
  assert.ok(t.includes("delphi"));
  assert.ok(!t.includes("the"), "stopwords must not be matchable");
  // "murders" alone must not qualify an article, or every murder article matches every case.
  assert.equal(about("The Delphi Murders", "Mahmudiyah rape and murders", "murders murders murders murders murders"), false);
});

test("handles accents, because the notes and Wikipedia disagree about them", () => {
  assert.equal(about("JonBenet Ramsey", "Killing of JonBenét Ramsey", "JonBenét Patricia Ramsey was an American child"), true);
});

test("an empty or missing extract cannot pass on its own", () => {
  assert.equal(about("Chris Watts", "Some Unrelated Page", ""), false);
});

test("never takes an index page, however often it mentions the case", () => {
  // This one passed the frequency test on a live search: a list of unsolved murders mentions
  // the city plenty without being about the case. Both original contaminants were lists too.
  const many = "moscow ".repeat(40);
  assert.equal(about("Murders in Moscow", "List of unsolved murders (2000-present)", many), false);
  assert.equal(about("Chris Watts", "List of murdered American children", "watts ".repeat(40)), false);
  assert.equal(about("Delphi", "Timeline of the Delphi murders", "delphi"), false);
});
