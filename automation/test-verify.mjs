// Tests for the fact gate. Run: npm run test:verify
//
// The gate decides what reaches a public feed, so the cases that matter most are the ones
// where it must HOLD. A false hold costs a minute of review; a false tick puts an unchecked
// claim about a real person on the internet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ID = "__test-verify-draft";
const dir = join(here, "studio", "drafts", ID);

const NOTES = `# Research

## Case: Lead
On March 4, 2019, Dana Whitfield was arrested in Bellport, Maine and charged with two counts
of arson. Prosecutors said the fire at the Hollis Street warehouse caused 1.2 million dollars
of damage. Whitfield's lawyer, Robert Ellis Vance, said his client was at home that night.

## Case: Trial
The jury returned a verdict on November 18, 2021. Whitfield was convicted on both counts and
sentenced to fourteen years. A forensic chemist testified that accelerant was found on a rag
recovered from the loading dock, and the defense challenged the chain of custody.
`;

async function runVerify(claims, extraArgs = []) {
  await mkdir(dir, { recursive: true });
  // Each run starts clean, or a report left by an earlier test makes the --dry check lie.
  await rm(join(dir, "fact-check.md"), { force: true });
  await writeFile(join(dir, "research.md"), NOTES, "utf8");
  await writeFile(join(dir, "episode.json"), JSON.stringify({ id: ID, title: "Test", factsToVerify: claims }, null, 2), "utf8");
  const r = spawnSync(process.execPath, [join(here, "episode-verify.mjs"), ID, "--json", ...extraArgs], { encoding: "utf8", windowsHide: true });
  const line = (r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"));
  assert.ok(line, `no JSON from the verifier: ${r.stdout} ${r.stderr}`);
  return JSON.parse(line);
}
const heldIdx = (res) => new Set((res.heldClaims || []).map((h) => h.index));

test("ticks a claim the notes plainly carry", async () => {
  const r = await runVerify(["Dana Whitfield was arrested in Bellport, Maine on March 4, 2019 and charged with two counts of arson."]);
  assert.equal(r.held, 0);
  assert.equal(r.publishable, true);
});

test("holds a figure that is not in the notes", async () => {
  const r = await runVerify(["The warehouse fire caused 4.6 million dollars of damage."]);
  assert.equal(r.held, 1, "a wrong figure must not pass");
  assert.match(r.heldClaims[0].reason, /not in the notes/);
});

test("holds a date that is not in the notes", async () => {
  const r = await runVerify(["The jury returned its verdict on November 19, 2021."]);
  assert.equal(r.held, 1);
});

test("holds a name that is not in the notes", async () => {
  const r = await runVerify(["Whitfield's lawyer, Marcus Delaney, said his client was at home that night."]);
  assert.equal(r.held, 1);
});

test("holds a claim the drafter's own checker marked unsupported", async () => {
  const r = await runVerify(["UNSUPPORTED: Whitfield confessed to a cellmate. (notes: not in notes)"]);
  assert.equal(r.held, 1);
  assert.match(r.heldClaims[0].reason, /fact-checker/);
});

test("holds a chapter that was never fact-checked", async () => {
  const r = await runVerify(['Chapter 3 ("The Fire") was not fact-checked; read it against the notes.']);
  assert.equal(r.held, 1);
});

test("holds invention that shares no vocabulary with the notes", async () => {
  const r = await runVerify(["Neighbours described hearing a motorcycle idling in the alley for twenty minutes."]);
  assert.equal(r.held, 1);
});

test("matches a number spelled out against digits in the notes", async () => {
  const r = await runVerify(["Whitfield was sentenced to fourteen years after being convicted on both counts."]);
  assert.equal(r.held, 0);
});

test("matches a partial name against the fuller name in the notes", async () => {
  // The notes say "Robert Ellis Vance"; a script would say "Robert Vance".
  const r = await runVerify(["Robert Vance told the court his client was at home on the night of the fire."]);
  assert.equal(r.held, 0);
});

test("one held claim is enough to block publication", async () => {
  const r = await runVerify([
    "Dana Whitfield was arrested in Bellport, Maine on March 4, 2019 and charged with two counts of arson.",
    "Whitfield was sentenced to fourteen years after being convicted on both counts.",
    "The warehouse fire caused 4.6 million dollars of damage.",
  ]);
  assert.equal(r.ticked, 2);
  assert.equal(r.held, 1);
  assert.equal(r.publishable, false, "any held claim must block the publish");
  assert.ok(heldIdx(r).has(2));
});

test("writes the ticks and a readable report, and --dry writes nothing", async () => {
  await runVerify(["The warehouse fire caused 4.6 million dollars of damage."], ["--dry"]);
  assert.equal(existsSync(join(dir, "fact-check.md")), false, "--dry must not write a report");
  const dryEp = JSON.parse(await readFile(join(dir, "episode.json"), "utf8"));
  assert.equal(dryEp.factsChecked, undefined, "--dry must not tick anything");

  await runVerify([
    "Dana Whitfield was arrested in Bellport, Maine on March 4, 2019 and charged with two counts of arson.",
    "The warehouse fire caused 4.6 million dollars of damage.",
  ]);
  const ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8"));
  assert.deepEqual(ep.factsChecked, [true, false]);
  assert.equal(ep.factsHeld.length, 1);
  assert.match(ep.factsVerifiedBy, /episode-verify/);
  const report = await readFile(join(dir, "fact-check.md"), "utf8");
  assert.match(report, /4\.6 million/);
  // The report must be honest about what a clean run does not prove.
  const clean = await runVerify(["Dana Whitfield was arrested in Bellport, Maine on March 4, 2019 and charged with two counts of arson."]);
  assert.equal(clean.held, 0);
  assert.match(await readFile(join(dir, "fact-check.md"), "utf8"), /contradict another line/);
});

test("refuses a draft with no research notes rather than passing it", async () => {
  await mkdir(dir, { recursive: true });
  await rm(join(dir, "research.md"), { force: true });
  await writeFile(join(dir, "episode.json"), JSON.stringify({ id: ID, factsToVerify: ["anything"] }), "utf8");
  const r = spawnSync(process.execPath, [join(here, "episode-verify.mjs"), ID, "--json"], { encoding: "utf8", windowsHide: true });
  const res = JSON.parse((r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{")));
  assert.equal(res.ok, false);
  assert.notEqual(r.status, 0);
});

test.after(async () => { await rm(dir, { recursive: true, force: true }); });
