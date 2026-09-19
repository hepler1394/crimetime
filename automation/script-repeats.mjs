#!/usr/bin/env node
// Podcast studio: find the scenes a script tells twice, before five hours are spent voicing it.
//
//   node automation/script-repeats.mjs <draft-id> [--json] [--min 0.45]
//
// The fact gate cannot see this and neither can the audio audit: every retold sentence is
// true and cleanly read. The Watts interrogation draft told the welfare check four times; the
// published Petito episode walks the Moab stop three times. Both came from a drafter that wrote
// each chapter without seeing the ones before it.
//
// Sentences are compared across paragraphs that are not neighbours. Two sentences count as the
// same telling when most of their content words match (names, numbers, places and verbs, stems
// only). Openers, sign-offs and the show's stock phrases are ignored. The score is the share of
// sentences that have an earlier twin; over about 8% is an episode that should be edited first.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const MIN = parseFloat(opt("--min", "0.45"));
if (!id) { console.error("usage: script-repeats.mjs <draft-id> [--json]"); process.exit(2); }

const STOP = new Set(("the a an and or but of to in on at by for from with as that this these those it its he she they them his her their was were is are be been being had has have do does did not no so then than when while which who whom whose what where how very just also more most other some such only own same too can will would could should may might must about into over under after before during again once here there all any both each few now up out off went go got get said told says say like even still back one two").split(/\s+/));
const STOCK = /what the evidence actually shows|the case file|let's unpack|you've probably heard|read the file|form your own conclusion|welcome back to crimetimesnacks|thanks for hanging out/i;
const stem = (w) => (w.length > 4 ? w.replace(/(ing|ed|es|s|ly)$/, "") : w);
const bag = (s) => new Set(s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem));

const ep = JSON.parse(await readFile(join(here, "studio", "drafts", id, "episode.json"), "utf8"));
const paras = (ep.script || []).filter(Boolean);
const sents = [];
paras.forEach((p, pi) => p.split(/(?<=[.!?])\s+/).forEach((t) => { const b = bag(t); if (b.size >= 5 && !STOCK.test(t)) sents.push({ pi, t: t.trim(), b }); }));

const pairs = [];
for (let j = 0; j < sents.length; j++) {
  let best = null;
  for (let i = 0; i < j; i++) {
    if (sents[j].pi - sents[i].pi < 2) continue;                    // the same beat, not a retelling
    let hit = 0; for (const w of sents[j].b) if (sents[i].b.has(w)) hit++;
    const score = hit / Math.min(sents[i].b.size, sents[j].b.size);
    if (score >= MIN && hit >= 4 && (!best || score > best.score)) best = { score, first: sents[i], again: sents[j] };
  }
  if (best) pairs.push(best);
}
const share = sents.length ? pairs.length / sents.length : 0;
const byPara = {}; for (const p of pairs) (byPara[p.again.pi] ||= []).push(p);
const result = { ok: true, id, words: paras.join(" ").split(/\s+/).length, sentences: sents.length, retold: pairs.length, share: +share.toFixed(3),
  paragraphs: Object.keys(byPara).map(Number), verdict: share > 0.08 ? "edit before voicing" : share > 0.04 ? "read the flagged paragraphs" : "clean" };
if (asJson) console.log(JSON.stringify({ ...result, pairs: pairs.map((p) => ({ score: +p.score.toFixed(2), firstPara: p.first.pi, first: p.first.t, againPara: p.again.pi, again: p.again.t })) }));
else {
  console.log(`${id}: ${result.words} words, ${pairs.length} of ${sents.length} sentences retell an earlier one (${(share * 100).toFixed(1)}%): ${result.verdict}`);
  for (const p of pairs.sort((a, b) => b.score - a.score).slice(0, 12)) console.log(`  [${p.first.pi}] ${p.first.t.slice(0, 110)}\n  [${p.again.pi}] ${p.again.t.slice(0, 110)}  (${p.score.toFixed(2)})\n`);
}
