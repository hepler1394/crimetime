// node --test automation/test-update-gate.mjs
// The case update gate's deterministic checks, with the model check stubbed.
import test from "node:test";
import assert from "node:assert/strict";
import { gateUpdate, distinctive, missingFromArticle, findDuplicate, normUrl } from "./community/update-gate.mjs";

const ARTICLE = `SALT LAKE CITY - The Utah Supreme Court on Tuesday postponed oral arguments in the wrongful death lawsuit that Gabby Petito's parents brought against the Moab City Police Department. The hearing had been scheduled for March 4. Attorneys for Joseph Petito and Nichole Schmidt said they were disappointed. `.repeat(3);
const today = "2026-09-13";
const good = { title: "Utah Supreme Court postpones arguments in Petito lawsuit", summary: "The Utah Supreme Court postponed oral arguments in the lawsuit Gabby Petito's parents brought against Moab police.", happened_on: "2026-09-09", url: "https://www.abc4.com/utah-court-cases/gabby-petito-utah-supreme-court/" };
const supports = async () => ({ supported: true, quote: "The Utah Supreme Court on Tuesday postponed oral arguments in the wrongful death lawsuit that Gabby Petito's parents brought against the Moab City Police Department.", why: "reports it" });

test("approves an update the article carries, with the quote on the row", async () => {
  const r = await gateUpdate({ update: good, articleText: ARTICLE, today, check: supports });
  assert.equal(r.decision, "approve", r.note);
  assert.match(r.note, /carried by the article/);
});

test("holds when the article could not be read", async () => {
  const r = await gateUpdate({ update: good, articleText: "", today, check: supports });
  assert.equal(r.decision, "hold");
});

test("holds a future date", async () => {
  const r = await gateUpdate({ update: { ...good, happened_on: "2026-10-01" }, articleText: ARTICLE, today, check: supports });
  assert.equal(r.decision, "hold");
  assert.match(r.note, /future/);
});

test("holds a name or number the article never mentions (the Heuermann case)", async () => {
  const r = await gateUpdate({ update: { ...good, title: "Rex Heuermann sentenced", summary: "Rex Heuermann was sentenced to 3 consecutive life terms." }, articleText: ARTICLE, today, check: supports });
  assert.equal(r.decision, "hold");
  assert.match(r.note, /Rex Heuermann/);
});

test("holds when the model says the article does not report it", async () => {
  const r = await gateUpdate({ update: good, articleText: ARTICLE, today, check: async () => ({ supported: false, quote: "", why: "anniversary piece" }) });
  assert.equal(r.decision, "hold");
  assert.match(r.note, /anniversary/);
});

test("holds when the model's supporting sentence is not actually in the article", async () => {
  const r = await gateUpdate({ update: good, articleText: ARTICLE, today, check: async () => ({ supported: true, quote: "The court ruled in favour of the Petito family on every count today." }) });
  assert.equal(r.decision, "hold");
  assert.match(r.note, /not in the article/);
});

test("holds when the model check throws", async () => {
  const r = await gateUpdate({ update: good, articleText: ARTICLE, today, check: async () => { throw new Error("timeout"); } });
  assert.equal(r.decision, "hold");
});

test("a quote matches despite curly quotes and spacing", async () => {
  const r = await gateUpdate({ update: good, articleText: ARTICLE.replace(/'/g, "’"), today, check: supports });
  assert.equal(r.decision, "approve", r.note);
});

test("rejects the /video/ twin of an update already on the case", async () => {
  const existing = [{ id: 2, title: "Gabby Petito family attorney discusses ongoing appeal", happened_on: "2026-08-27", url: "https://www.mysuncoast.com/2026/08/27/five-years-after/" }];
  const r = await gateUpdate({ update: { ...good, title: "Family attorney talks appeal", url: "https://www.mysuncoast.com/video/2026/08/27/five-years-after/" }, articleText: ARTICLE, existing, today, check: supports });
  assert.equal(r.decision, "reject");
});

test("rejects a near-identical title within two weeks, not one months apart", () => {
  const e = [{ id: 7, title: "Utah Supreme Court postpones arguments in Petito family lawsuit", happened_on: "2026-09-09", url: "https://a.com/x" }];
  assert.ok(findDuplicate({ ...good, url: "https://b.com/y" }, e));
  assert.equal(findDuplicate({ ...good, url: "https://b.com/y", happened_on: "2026-01-09" }, e), null);
});

test("distinctive picks numbers and summary names, not Title Case title words", () => {
  const d = distinctive({ title: "Judge Dismisses $50M Wrongful Death Lawsuit", summary: "A Utah judge dismissed the suit against Moab police on November 28." });
  assert.ok(d.includes("50"));
  assert.ok(d.includes("Utah"));
  assert.ok(d.includes("Moab"));
  assert.ok(!d.includes("Dismisses"));
});

test("US$41,000 is the number 41000, not 000", () => {
  assert.deepEqual(distinctive({ title: "", summary: "a reward of US$41,000 was offered" }), ["41000"]);
});

test("a figure written US$41,000 in the source still matches 41000 (the Delphi hold)", () => {
  assert.deepEqual(missingFromArticle({ title: "", summary: "A reward of $41,000 was offered." }, "the reward offered in the case was set at US$41,000 (equivalent to $53,900 today)"), []);
});

test("numbers match on a word boundary: 19 is not found inside 2019", () => {
  assert.deepEqual(missingFromArticle({ title: "", summary: "Sentenced on May 19." }, "He was sentenced in May 2019 in a long hearing."), ["19"]);
});

test("normUrl ignores www, trailing slash and the /video/ segment", () => {
  assert.equal(normUrl("https://www.x.com/video/a/b/"), normUrl("https://x.com/a/b"));
});
