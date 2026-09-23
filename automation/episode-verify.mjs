#!/usr/bin/env node
// Podcast studio, the fact gate: check every claim on a draft's checklist against that
// draft's research notes, tick the ones the notes actually carry, and hold the rest.
//
//   node automation/episode-verify.mjs <draft-id> [--json] [--dry]
//
// This exists so the weekly job can publish unattended. It replaces the mechanical part
// of reading 200 claims against the notes; it does NOT replace judgement, and it is worth
// being precise about what it can and cannot catch.
//
// It CATCHES: a name, date, figure or quoted phrase in the claim that appears nowhere in
// the notes, and claims whose wording barely overlaps anything in the notes. That is the
// class of error the drafter actually makes - invented specifics, transposed numbers,
// an argument attributed to the wrong side.
//
// It does NOT catch a claim that the notes support but that contradicts another part of
// the same script. The Golden State Killer episode said he was never charged with a rape
// and, ninety seconds later, that he pleaded guilty to charges involving rape; both lines
// traced to the notes. Only a person reading the whole script catches that. So: a clean
// run here means "nothing is unsupported", not "the episode is right".
//
// Anything held blocks publication. That is the point: the job stops and asks rather than
// shipping a claim nobody stood behind.

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dry = args.includes("--dry");
const id = args.find((a) => !a.startsWith("--"));
const out = (o) => { console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o))); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };

if (!id) die("args", "usage: episode-verify.mjs <draft-id> [--json] [--dry]");
const dir = join(here, "studio", "drafts", id);

let ep, notesRaw;
try { ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8")); }
catch (e) { die("draft", `No draft ${id}: ${e.message}`); }
try { notesRaw = await readFile(join(dir, "research.md"), "utf8"); }
catch { die("notes", `${id} has no research.md, so nothing can be verified against it.`); }

const claims = ep.factsToVerify || [];
if (!claims.length) die("claims", `${id} has no fact list. Run episode-draft.mjs first.`);

/* ------------------------------------------------------------------ matching */
// Numbers are spelled out in a script and written as digits in the notes, and dates are
// abbreviated in one and not the other. Normalise both sides before comparing.
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
// A scale word changes the number in front of it, and until 2026-09-22 nothing here read
// one. Two consequences, and the second is the dangerous one.
//
//   "forty thousand comments" was HELD against notes reading "40,000 comments". "forty"
//   became the token "40", the notes' comma was stripped to "40000", and "40" is not a word
//   inside "40000". A hold that meant nothing.
//
//   "three billion views" was TICKED against notes reading "3 million views". "three"
//   became "3", the notes carry a "3", and nothing ever looked at "billion". That is a
//   wrong figure about a real case walking straight through the gate.
//
// So a run of number words is read as a single number, the same way on both sides, before
// anything is compared. Only a run containing a scale word is touched; a lone "fourteen"
// is left to the single-word pass below, exactly as before.
const SCALE = { hundred: 100, thousand: 1000, million: 1e6, billion: 1e9 };
const ONE_WORDS = Object.keys(NUM).join("|");
const NUM_PART = `(?:\\d+(?:\\.\\d+)?|${ONE_WORDS}|hundred|thousand|million|billion)`;
const NUM_RUN = new RegExp(`\\b${NUM_PART}(?:[\\s-]+(?:and[\\s-]+)?${NUM_PART})*\\b`, "gi");

// The ordinary accumulator: parts add up, a scale word banks what came before it.
function readNumberRun(run) {
  let total = 0, current = 0, sawScale = false, sawValue = false;
  for (const w of run.toLowerCase().split(/[\s-]+/)) {
    if (w === "and") continue;
    if (/^\d/.test(w)) { current += parseFloat(w); sawValue = true; continue; }
    if (NUM[w] !== undefined) { current += NUM[w]; sawValue = true; continue; }
    if (w === "hundred") { current = (current || 1) * 100; sawScale = true; continue; }
    if (SCALE[w] !== undefined) { total += (current || 1) * SCALE[w]; current = 0; sawScale = true; continue; }
    return null;
  }
  return sawValue && sawScale ? String(Math.round(total + current)) : null;
}

// A trailing "and" belongs to the sentence, not to the number: "forty thousand and the police".
const scaleNumbers = (text) =>
  String(text).replace(NUM_RUN, (run) => readNumberRun(run.replace(/[\s-]+and$/i, "")) ?? run);

// Accents are folded on both sides: the notes write "Rosselló" and "José", a claim may not.
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\bjan(uary)?\b/g, "january").replace(/\bfeb(ruary)?\b/g, "february")
  .replace(/\bmar(ch)?\b/g, "march").replace(/\bapr(il)?\b/g, "april")
  .replace(/\bjun(e)?\b/g, "june").replace(/\bjul(y)?\b/g, "july")
  .replace(/\baug(ust)?\b/g, "august").replace(/\bsept?(ember)?\b/g, "september")
  .replace(/\boct(ober)?\b/g, "october").replace(/\bnov(ember)?\b/g, "november")
  .replace(/\bdec(ember)?\b/g, "december")
  .replace(/,/g, "").replace(/\$/g, " ")                  // "US$41,000" must not become the one word "us41000"
  .replace(/(\d)\.00\b/g, "$1")                          // "$920,000.00" in the notes, "$920,000" in a script
  .replace(/\b(\d+(?:\.\d+)?)k\b/g, (_, n) => String(Math.round(parseFloat(n) * 1000)))   // "$70K" in the notes, "$70,000" in a claim
  .replace(/(\d)\s*:\s*00\b/g, "$1")            // "1:00 p.m." in a script, "1 p.m." in the notes
  // A script says "fourteen years" where the notes say "14". Spell numbers out to digits on
  // BOTH sides, or every written-out number in a script reads as absent from the notes.
  .replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/g, (m) => String(NUM[m]));

const STOP = new Set(("the a an and or but of to in on at by for from with as that this these those it its he she " +
  "they them his her their was were is are be been being had has have do does did not no so then than when while " +
  "which who whom whose what where how very just also more most other some such only own same too can will would " +
  "could should may might must about into over under after before during again further once here there all any " +
  "both each few nor now s t don claim notes").split(/\s+/));
// A light stem, so "knocked" in a claim meets "knocks" in the notes and "repeatedly" meets
// "repeated". Edge apostrophes go too: a claim quoting 'CeCe' never matched "CeCe".
const stem = (w) => { const b = w.replace(/^'+|'+$/g, "").replace(/'s$/, ""); return b.length > 4 ? b.replace(/(ly|ing|ed|es|s)$/, "").replace(/(ly|ed)$/, "") : b; };
// scaleNumbers runs before norm on every side, so "forty thousand", "40 thousand" and
// "40,000" all reach the comparison as the same string.
const words = (s) => norm(scaleNumbers(s)).replace(/[^a-z0-9'\s]/g, " ").split(/\s+/).map(stem).filter((w) => w.length > 2 && !STOP.has(w));

const notes = norm(scaleNumbers(notesRaw));
const noteSentences = notesRaw.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 15);   // was 40, which threw away "They filed for bankruptcy in 2015." and held every claim resting on it
const noteWordSets = noteSentences.map((s) => new Set(words(s)));

// The load-bearing parts of a claim: proper names, numbers, dates, quoted phrases. A claim
// can only be ticked when every one of these is somewhere in the notes.
// Ranks and honorifics. The notes and the script rarely agree on how to write one.
const TITLE = /^(sgt|sergeant|det|detective|officer|ofc|judge|justice|dr|doctor|prof|professor|capt|captain|lt|lieutenant|cmdr|commander|chief|deputy|sheriff|mr|mister|mrs|ms|miss|madam|madame|rev|reverend|father|coroner|attorney|mayor|governor|senator|congressman|congresswoman|agent|inspector|constable|commissioner|marshal|warden|nurse|paramedic)\.?$/i;

function distinctive(claim) {
  const outSet = new Set();
  // Figures are read off the collapsed claim, so "three million" demands 3000000 rather
  // than a bare "3" that any date in the notes would happen to satisfy.
  const figures = scaleNumbers(claim);
  for (const m of figures.matchAll(/\b\d[\d,.:\/]*\b/g)) outSet.add(m[0].replace(/[,.]$/, "").replace(/,/g, ""));
  for (const m of claim.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z.]+){0,3})\b/g)) {
    if (/^(The|This|That|These|Those|He|She|They|It|A|An|In|On|At|By|For|From|With|And|But|His|Her|Their|Its|After|Before|During|When|While|Police|Investigators|Prosecutors|Defense|Defence|Court|Judge|State|Notes|Every|Both|What|Where|Chapter|Studies|Another|One|Some|Many|Several|Later|Then|There|According|Researchers|Coverage|Accounts|Hours|Days|Weeks|Months|Years|Nobody|Nothing|Neither|Serious|Panelist|Critics|Friends|Visitors)\b/.test(m[1])) continue;
    // A capital at the start of a sentence says nothing about whether the word is a name, and
    // the list above is thirty-odd attempts to say so one word at a time. On 2026-09-21 the
    // Elisa Lam episode was held on "Officers" and on "Former" - "Officers searched the
    // premises", where the notes say "Police searched the hotel", and "Former hotel manager
    // Amy Price", where the notes name Amy Price three times. Both claims are fully supported.
    //
    // So a LONE capitalised word opening a sentence is not treated as distinctive. A name that
    // opens a sentence is no longer checked by this rule - the drafter's own fact-checker and
    // the word-overlap check both still see it - and that is the price of the rule not firing
    // on ordinary words the notes happen to phrase differently.
    const opensSentence = m.index === 0 || /[.!?]["')\]]?\s+$/.test(claim.slice(0, m.index));
    if (opensSentence && !/\s/.test(m[1])) continue;
    outSet.add(m[1]);
  }
  for (const m of claim.matchAll(/"([^"]{4,60})"/g)) outSet.add(m[1]);
  // Also off the collapsed claim: "forty thousand" must not leave a bare "40" behind,
  // demanding a token the notes were never going to carry.
  for (const m of figures.toLowerCase().matchAll(/\b([a-z-]+)\b/g)) if (NUM[m[1]]) outSet.add(String(NUM[m[1]]));
  return [...outSet];
}

// Tuned against the first two finished episodes (363 claims read by hand against the notes).
// The distinctive-token check is what earns its keep: it is the one that surfaced real
// near-misses. Word overlap is a weak signal - support is usually spread over a paragraph
// and phrased differently - so it is scored over a three-sentence window and set low, to
// catch only a claim that shares almost no vocabulary with any part of the notes.
const MIN_OVERLAP = 0.3;
const MIN_HITS = 2;
const WINDOW = 1;          // sentences either side of the best match

const results = claims.map((claim, i) => {
  const text = String(claim);
  // The drafter's own checker already read this chapter against the notes. If it said the
  // claim was unsupported, that verdict stands; nothing here overrides it.
  if (text.startsWith("UNSUPPORTED:")) {
    return { i, claim: text, hold: true, reason: "the drafter's fact-checker marked this unsupported", evidence: [] };
  }
  if (/was not fact-checked/i.test(text)) {
    return { i, claim: text, hold: true, reason: "that chapter was never fact-checked", evidence: [] };
  }

  const cw = new Set(words(text));
  const scored = noteWordSets.map((_, k) => {
    // Count a claim's words as found if they appear anywhere in the window around k.
    const seen = new Set();
    for (let j = Math.max(0, k - WINDOW); j <= Math.min(noteWordSets.length - 1, k + WINDOW); j++) {
      for (const w of cw) if (noteWordSets[j].has(w)) seen.add(w);
    }
    return { k, hit: seen.size };
  }).sort((a, b) => b.hit - a.hit);
  const top = scored[0] || { hit: 0, k: -1 };
  const overlap = cw.size ? top.hit / cw.size : 0;
  const evidence = scored.slice(0, 2).filter((s) => s.hit >= 2).map((s) => noteSentences[s.k].slice(0, 300));

  // A multi-word name counts as found if the whole string is in the notes, or if every word
  // of it is. The notes write "Roberta and Christopher Laundrie" where the script writes
  // "Roberta Laundrie", and a sentence starting "Near Brian's remains" reads as a two-word
  // name to the extractor. Demanding the exact string holds those, and they are always fine.
  const found = (t) => {
    const n = norm(t);
    // Numbers must match on a word boundary. Plain substring matching finds "19" inside
    // "2019" and waves through a wrong date, which is exactly the error worth catching.
    if (/^[\d.:\/]+$/.test(n)) {
      // A full stop only disqualifies when it is a decimal point. "(?![\w.])" also refused a year
      // that ends a sentence ("married ... on November 3, 2012."), holding a claim the notes state.
      return new RegExp(`(?<!\\w|\\d\\.)${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!\\w|\\.\\d)`).test(notes);
    }
    if (notes.includes(n)) return true;
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return false;
    if (parts.every((p) => notes.includes(p))) return true;
    // A rank or an honorific is not part of the identity, and the notes abbreviate where the
    // script spells out. "Sergeant Rudy Lopez stated..." was held because the notes say
    // "Sgt. Rudy Lopez said later" - the man is named, the word "Sergeant" is not there.
    const named = parts.filter((p) => !TITLE.test(p));
    return named.length > 0 && named.length < parts.length && named.every((p) => notes.includes(p));
  };
  const missing = distinctive(text).filter((t) => !found(t));
  if (missing.length) {
    return { i, claim: text, hold: true, reason: `not in the notes: ${missing.join(", ")}`, evidence };
  }
  // A claim of two or three content words ("The girls had been smothered") cannot reach two
  // hits in one window when the notes name the girls instead; ask it for all but one.
  const needHits = cw.size <= 3 ? Math.max(1, cw.size - 1) : MIN_HITS;
  if (overlap < MIN_OVERLAP || top.hit < needHits) {
    return { i, claim: text, hold: true, reason: "no passage in the notes carries this", evidence };
  }
  return { i, claim: text, hold: false, reason: "", evidence };
});

const held = results.filter((r) => r.hold);
const ticked = results.length - held.length;

if (!dry) {
  await copyFile(join(dir, "episode.json"), join(dir, "episode.json.bak-verify")).catch(() => {});
  ep.factsChecked = results.map((r) => !r.hold);
  ep.factsVerifiedBy = `episode-verify.mjs against research.md on ${new Date().toISOString().slice(0, 10)}`;
  ep.factsHeld = held.map((r) => ({ index: r.i, claim: r.claim, reason: r.reason }));
  await writeFile(join(dir, "episode.json"), JSON.stringify(ep, null, 2) + "\n", "utf8");
  // A readable copy for whoever has to settle the held claims.
  const report = [`# Fact check: ${ep.title || id}`, "", `Checked ${results.length} claims against research.md.`,
    `Ticked ${ticked}. Held ${held.length}.`, "",
    ...(held.length ? held.flatMap((r) => [`## [${r.i}] ${r.reason}`, "", r.claim, "",
      ...(r.evidence.length ? ["Closest passages in the notes:", "", ...r.evidence.map((e) => `> ${e}`), ""] : ["Nothing in the notes resembles this.", ""])])
      : ["Nothing held. Every claim is carried by the notes.", "",
         "This does not mean the episode is right: a claim can be supported by the notes and still",
         "contradict another line in the same script. Only reading it end to end catches that."]),
  ].join("\n");
  await writeFile(join(dir, "fact-check.md"), report, "utf8");
}

out({
  ok: true, id, total: results.length, ticked, held: held.length,
  heldClaims: held.slice(0, 8).map((r) => ({ index: r.i, reason: r.reason, claim: r.claim.slice(0, 160) })),
  publishable: held.length === 0,
  message: held.length === 0
    ? `Verified ${id}: all ${results.length} claims are carried by the notes. Clear to publish.`
    : `Verified ${id}: ${ticked} of ${results.length} ticked, ${held.length} held. NOT clear to publish. See ${join(dir, "fact-check.md")}`,
});
