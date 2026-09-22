#!/usr/bin/env node
// Podcast studio: take the claims the drafter's fact-checker marked UNSUPPORTED and fix the
// script instead of leaving the episode held for a person.
//
//   node automation/episode-revise.mjs <draft-id> [--rounds 2] [--json]
//   node automation/episode-revise.mjs <draft-id> --repeats      cut the scenes it tells twice
//   node automation/episode-revise.mjs <draft-id> --facts        rebuild the claim list only
//
// For each chapter that has unsupported claims, the writer gets the chapter, the list of what
// is wrong with it (the checker's own note says what the research actually supports), and the
// research. It may only delete or correct: no new facts, same voice, same order, and the show's
// opener and sign-off stay word for word. The chapter is then checked again from scratch, and
// its claim list is replaced with the new one. Up to --rounds passes per chapter.
//
// This does not lower the bar. The mechanical gate (episode-verify.mjs) still has to find every
// claim in research.md, and a chapter that still has unsupported claims after the last round
// keeps them on the list, so the episode still holds.
//
// Only for a draft that has not been voiced: changing the words after the render makes the
// audio wrong. Use episode-repair.mjs --edits for that. The exception is --facts, which
// rewrites no words and so is safe at any point.

import { readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";
import { findRepeats } from "./script-repeats.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id) die("args", "usage: episode-revise.mjs <draft-id> [--rounds 2] [--repeats] [--facts]");

const dir = join(here, "studio", "drafts", id);
const epPath = join(dir, "episode.json");
const ep = JSON.parse(await readFile(epPath, "utf8").catch(() => die("draft", `No draft ${id}.`)));
// --facts rebuilds the claim list and changes no words, so it is the one mode that is safe
// on a draft that has already been voiced.
if (!args.includes("--facts") && ["voiced", "ready", "committed", "published"].includes(ep.status)) die("state", `${id} is already voiced (${ep.status}). Changing its words now would make the audio wrong.`);
const research = await readFile(join(dir, "research.md"), "utf8").catch(() => die("notes", `${id} has no research.md.`));
const voice = await readFile(join(here, "voice.md"), "utf8").catch(() => "");
const cfg = await loadConfig();
const rounds = Math.max(1, Math.min(4, parseInt(opt("--rounds", "2"), 10) || 2));
const OPENER = "What's up guys, welcome back to CrimeTimeSnacks.";
const OUTRO = "That's it for this one. Thanks for hanging out with me. This has been CrimeTimeSnacks, and I'll catch you next time.";
const parse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; };

// The fact list is an enumeration of every claim in a chapter, and the gate is only ever as
// complete as that enumeration. When Gemini sheds load, falling through to the 4B model on
// the desk does not look like a failure: it looks like a chapter with fewer claims in it,
// and a shorter list is a weaker gate, not a slower one. So the checker waits the provider
// out instead of working around it. A machine with no cloud key at all still uses the local
// model, because there it is the only checker there is - and the run says which one read it.
const cloudFirst = cfg.order.filter((n) => n !== "local");
const checkCfg = { ...cfg, order: cloudFirst.length ? cloudFirst : cfg.order };
const checkedBy = new Set();
let lastProvider = "";

// An answer that does not parse, or that finds no claims at all in five hundred words of
// true crime, is a failed extraction and not a verdict. It used to be taken at face value:
// `(parse(text).claims || [])` turns a half-received answer into an empty array, and an
// empty array is a chapter the gate has nothing to check in, which is indistinguishable
// from a chapter that passed. Two of the Elisa Lam chapters came back that way on
// 2026-09-22. So: ask again, and if it keeps coming back like that, stop the run. The
// transport retry in llm.mjs cannot see this - to it the request succeeded.
const EXTRACT_TRIES = 4;
async function check(paras) {
  const body = paras.map((t) => t.replace(OPENER, "").replace(OUTRO, "").trim()).filter(Boolean).join("\n\n");
  if (!body.trim()) return [];   // a chapter that is only the opener or the sign-off
  let last = "";
  for (let attempt = 1; attempt <= EXTRACT_TRIES; attempt++) {
    const { text, provider } = await chat(`You are a fact-checker. You get RESEARCH NOTES and a SCRIPT CHAPTER. List every specific factual claim in the chapter (names, dates, counts, places, quotes, sequence of events). For each, decide if the notes support it. Output ONLY a JSON object: {"claims": [{"claim": string, "supported": boolean, "note": string (for unsupported claims: what the notes actually say, or "not in notes")}]}. Be strict: a claim is supported only if the notes state it.`,
      `RESEARCH NOTES:\n${research.slice(0, 200000)}\n\nSCRIPT CHAPTER:\n${body}`, { ...checkCfg, jsonMode: true });
    let claims = [];
    try { claims = (parse(text).claims || []).filter((c) => c && c.claim); }
    catch (err) { last = `the answer did not parse (${err.message})`; }
    if (claims.length) { checkedBy.add(provider); lastProvider = provider; return claims; }
    if (!last) last = `${provider} found no claims in ${body.split(/\s+/).length} words`;
    say(`  extraction attempt ${attempt}/${EXTRACT_TRIES}: ${last}; asking again`);
  }
  throw new Error(`${last}, ${EXTRACT_TRIES} times over. A chapter with no claims on its list is a chapter the gate cannot hold, so the list is not being written.`);
}

/* Checking every chapter, and keeping what is already checked if the run dies.
 *
 * A thirteen-chapter rebuild is thirteen separate provider calls, and until 2026-09-22 a
 * run that lost the ninth threw away the eight before it. That was fine when a failure
 * meant something was wrong; it is not fine against a provider shedding a third of
 * requests, where the ninth call failing says nothing at all. llm.mjs now retries, and
 * this keeps the finished chapters so a run that still dies restarts where it stopped.
 *
 * What is NOT done here is writing a short list to episode.json. A fact list built from
 * nine chapters of thirteen is not a partial result, it is a weaker gate that looks like
 * a finished one: the four missing chapters would have nothing to check and would sail
 * through. So the parked chapters stay in their own file and episode.json is written only
 * once every chapter is in hand. The file is keyed by the script it was checked against,
 * so an edited script discards it rather than certifying sentences that are gone.
 */
const progressPath = join(dir, "facts-progress.json");
async function checkChapters(list, scriptArr) {
  const key = createHash("sha1").update(JSON.stringify(scriptArr)).digest("hex").slice(0, 12);
  let done = {};
  try {
    const p = JSON.parse(await readFile(progressPath, "utf8"));
    // An empty chapter is never picked up, whatever parked it. check() refuses to return
    // one now, but a file written before it did would otherwise carry the hole forward.
    if (p.script === key) {
      for (const [n, v] of Object.entries(p.chapters || {})) if (v?.claims?.length) done[n] = v;
      if (Object.keys(done).length) say(`Picking up ${Object.keys(done).length} chapter(s) checked by an earlier run.`);
    }
  } catch { /* no progress, or unreadable: check everything */ }
  const claimsBy = [];
  for (const [n, c] of list.entries()) {
    if (done[n]) {
      say(`Chapter ${n + 1}/${list.length}: ${c.title || ""} (already checked by ${done[n].provider})`);
      checkedBy.add(done[n].provider);   // a resumed run still names every model that read it
      claimsBy.push(done[n].claims); continue;
    }
    say(`Chapter ${n + 1}/${list.length}: ${c.title || ""}`);
    let claims;
    try {
      claims = await check(scriptArr.slice(c.start, c.start + c.paragraphs));
    } catch (err) {
      await writeFile(progressPath, JSON.stringify({ script: key, chapters: done }), "utf8");
      die("check", `Chapter ${n + 1} of ${list.length} could not be checked: ${err.message}\nThe ${Object.keys(done).length} chapter(s) before it are kept; running this again resumes there. Nothing was written to episode.json.`);
    }
    done[n] = { claims, provider: lastProvider };
    await writeFile(progressPath, JSON.stringify({ script: key, chapters: done }), "utf8");
    claimsBy.push(claims);
  }
  await rm(progressPath, { force: true });
  return claimsBy;
}

// The stored list is UNSUPPORTED-first so the worst of it is the first thing read.
const toFacts = (claimsBy) => claimsBy.flat()
  .map((c) => (c.supported === false ? `UNSUPPORTED: ${c.claim}${c.note ? ` (notes: ${c.note})` : ""}` : String(c.claim)))
  .sort((a, b) => (b.startsWith("UNSUPPORTED:") ? 1 : 0) - (a.startsWith("UNSUPPORTED:") ? 1 : 0));
const countBad = (claimsBy) => claimsBy.flat().filter((x) => x.supported === false).length;
// Which model actually read the chapters. Written into episode.json because a list built by
// a 4B model and a list built by Flash are not the same artefact, and six months later
// nothing else on disk would say which one this was. Chapters resumed from a parked run
// carry their own provider, so a list assembled over three runs names all three.
const listedBy = () => (checkedBy.size ? [...checkedBy].sort().join(", ") : "unknown");

/* --------------------------------------------------------------------- --facts */
// Rebuild the claim list against the script as it stands now, and change nothing else.
//
// For a draft whose script was edited after its list was made. A claim is a description of
// a sentence, so once the sentence is gone the claim can never be ticked and can never be
// cleared by editing - the gate just holds forever on text that is not in the episode. That
// is what happened to Elisa Lam on 2026-09-21. Safe on a voiced draft: no words change, so
// the audio stays the audio that was audited.
if (args.includes("--facts")) {
  const chapters = (ep.chapters || []).map((c) => ({ ...c }));
  const claimsBy = await checkChapters(chapters, ep.script);
  const stillBad = countBad(claimsBy);
  const facts = toFacts(claimsBy);

  await copyFile(epPath, join(dir, "episode.json.bak-facts"));
  const freshF = JSON.parse(await readFile(epPath, "utf8"));
  const wasCount = (freshF.factsToVerify || []).length;
  // factsChecked and factsHeld describe the old list, so they go with it.
  Object.assign(freshF, { factsToVerify: facts, factsChecked: [], factsHeld: [],
    factCheck: { checked: facts.length, unsupported: stillBad }, factsListedBy: listedBy(), edited: new Date().toISOString() });
  await writeFile(epPath, JSON.stringify(freshF, null, 2) + "\n", "utf8");
  out({ ok: true, id, claims: facts.length, was: wasCount, unsupported: stillBad, listedBy: listedBy(),
    message: `Rebuilt the fact list for ${id} against the current script: ${wasCount} -> ${facts.length} claims, ${stillBad} unsupported, read by ${listedBy()}. No words changed.` });
  process.exit(0);
}

/* ------------------------------------------------------------------- --repeats */
// The repetition preflight in episode-weekly.mjs stops the run before the render when a script
// tells its scenes twice. That is only worth doing if there is a way through it: on 2026-09-21
// it held the Elisa Lam episode at 9.0% and the alternative was handing Cory twenty-five
// paragraph numbers, which is the checklist the whole pipeline exists to avoid.
//
// This cuts the SECOND telling, never the first, and it may only delete or compress. A
// paragraph usually carries something new alongside the retread, so the instruction is to keep
// that and lose the repetition rather than drop the paragraph.
if (args.includes("--repeats")) {
  const script = [...ep.script];
  const chapters = (ep.chapters || []).map((c) => ({ ...c }));
  const paraChapter = (pi) => chapters.findIndex((c) => pi >= c.start && pi < c.start + c.paragraphs);
  const before = findRepeats(script.filter(Boolean));
  if (before.verdict === "clean") {
    out({ ok: true, id, words: ep.scriptWords, share: +before.share.toFixed(3), revised: 0, message: `${id} does not repeat itself (${(before.share * 100).toFixed(1)}%). Nothing to do.` });
    process.exit(0);
  }
  say(`${id}: ${before.retold} of ${before.sentences} sentences retell an earlier one (${(before.share * 100).toFixed(1)}%).`);

  let touched = 0;
  for (let r = 1; r <= rounds; r++) {
    const found = findRepeats(script.filter(Boolean));
    if (found.verdict !== "edit before voicing") break;
    // Worst first, and one paragraph at a time so a bad rewrite cannot take the episode with it.
    const worst = Object.entries(found.byPara).map(([pi, ps]) => ({ pi: +pi, ps }))
      .sort((a, b) => Math.max(...b.ps.map((p) => p.score)) - Math.max(...a.ps.map((p) => p.score)));
    say(`Round ${r}: ${worst.length} paragraph(s) retell something earlier.`);
    for (const { pi, ps } of worst) {
      const original = script[pi];
      if (!original) continue;
      const { text } = await chat(`You edit the spoken script for CrimeTimeSnacks, a true crime podcast hosted by Cory. Voice guide:\n\n${voice}\n\nYou are given one paragraph from late in the script, and the earlier sentences it repeats. The audience has already heard those earlier sentences. Remove the repetition from this paragraph: delete the retold sentence, or cut it down to a short reference that assumes the listener remembers. Keep every fact and every sentence that is NOT a repeat, word for word. Add nothing. Do not replace the repetition with new material to hold the length. If the whole paragraph is a repeat, return an empty string. Keep it spoken and in first person, and keep these two lines exactly if they appear: "${OPENER}" and "${OUTRO}". Output ONLY a JSON object: {"paragraph": string}.`,
        `ALREADY SAID EARLIER:\n${ps.map((p, i) => `${i + 1}. ${p.first.t}`).join("\n")}\n\nTHE SENTENCES IN THIS PARAGRAPH THAT REPEAT THEM:\n${ps.map((p, i) => `${i + 1}. ${p.again.t}`).join("\n")}\n\nPARAGRAPH TO EDIT:\n${JSON.stringify(original)}`,
        { ...cfg, jsonMode: true, role: "writer" });
      let next = parse(text).paragraph;
      if (next == null) continue;
      next = String(next).replace(/\s+/g, " ").trim();
      if (next === original) continue;
      // A rewrite that grew is not a cut, and one that kept the repeat is no use either.
      if (next.length > original.length) { say(`  paragraph ${pi}: rewrite came back longer; left alone.`); continue; }
      script[pi] = next;
      touched++;
      say(`  paragraph ${pi}: ${original.split(/\s+/).length} -> ${next ? next.split(/\s+/).length : 0} words`);
    }
  }

  // Empty paragraphs come out, and the chapter marks move with them.
  for (let pi = script.length - 1; pi >= 0; pi--) {
    if (String(script[pi]).trim()) continue;
    const n = paraChapter(pi);
    if (n > -1) { chapters[n].paragraphs--; for (let m = n + 1; m < chapters.length; m++) chapters[m].start--; }
    script.splice(pi, 1);
  }
  const kept = chapters.filter((c) => c.paragraphs > 0);
  const after = findRepeats(script);
  const words = script.join(" ").split(/\s+/).filter(Boolean).length;

  // The fact list describes the script, so an edited script needs a new one. Without this
  // the gate goes on checking sentences this pass just deleted: on 2026-09-21 the Elisa Lam
  // episode was held on two claims whose sentences no longer existed anywhere in it, and no
  // amount of editing the script could ever have cleared them. Re-check the chapters that
  // changed and rebuild the list the same way the full revise does.
  // The edited script only exists in memory until the write below, so park it next to the
  // checked chapters: without it a rebuild that dies here loses the editing pass as well,
  // and the next run pays for both again.
  await writeFile(join(dir, "repeats-pending.json"), JSON.stringify({ script, chapters: kept, words }, null, 2), "utf8");
  const claimsBy = await checkChapters(kept, script);
  const stillBad = countBad(claimsBy);
  const facts = toFacts(claimsBy);

  await copyFile(epPath, join(dir, "episode.json.bak-repeats"));
  const freshR = JSON.parse(await readFile(epPath, "utf8"));
  Object.assign(freshR, { script, chapters: kept, scriptWords: words, edited: new Date().toISOString(),
    factsToVerify: facts, factsChecked: [], factsHeld: [], factCheck: { checked: facts.length, unsupported: stillBad }, factsListedBy: listedBy() });
  await writeFile(epPath, JSON.stringify(freshR, null, 2) + "\n", "utf8");
  await rm(join(dir, "repeats-pending.json"), { force: true });
  out({ ok: true, id, words, revised: touched, share: +after.share.toFixed(3), verdict: after.verdict,
    was: +before.share.toFixed(3), wordsBefore: ep.scriptWords,
    claims: facts.length, unsupported: stillBad,
    message: `Cut the repetition in ${id}: ${touched} paragraph(s) edited, ${(before.share * 100).toFixed(1)}% -> ${(after.share * 100).toFixed(1)}% (${after.verdict}). ${ep.scriptWords} -> ${words} words. Fact list rebuilt against the edited script: ${facts.length} claims, ${stillBad} unsupported.` });
  process.exit(0);
}

// The stored list is sorted with UNSUPPORTED first and carries no chapter number, so start by
// checking every chapter again; that also gives each claim a home.
const script = [...ep.script];
const chapters = ep.chapters.map((c) => ({ ...c }));
const claimsBy = [];
let fixed = 0, stillBad = 0;
for (let n = 0; n < chapters.length; n++) {
  const c = chapters[n];
  let paras = script.slice(c.start, c.start + c.paragraphs);
  let claims = await check(paras);
  for (let r = 1; r <= rounds; r++) {
    const bad = claims.filter((x) => x.supported === false);
    if (!bad.length) break;
    say(`Chapter ${n + 1} "${c.title}": ${bad.length} unsupported, revising (round ${r})...`);
    const { text } = await chat(`You edit the spoken script for CrimeTimeSnacks, a true crime podcast hosted by Cory. Voice guide:\n\n${voice}\n\nYou are given one chapter, a list of claims in it that the research does not support, and the research. Fix the chapter so that none of those claims remain: delete the sentence, or correct it to exactly what the research says (the note on each claim tells you what that is). Do not add any fact that is not in the research. Do not add new material to make up the length. Keep everything else word for word where you can, keep the order, keep it spoken and in first person, and keep these two lines exactly if they appear: "${OPENER}" and "${OUTRO}". Never have Cory claim to have read documents, transcripts or records. Output ONLY a JSON object: {"paragraphs": [string, ...]} with the same number of paragraphs, or fewer if one becomes empty.`,
      `UNSUPPORTED CLAIMS:\n${bad.map((b, i) => `${i + 1}. ${b.claim}\n   what the research says: ${b.note || "not in the research"}`).join("\n")}\n\nCHAPTER:\n${JSON.stringify(paras)}\n\nRESEARCH:\n${research.slice(0, 200000)}`, { ...cfg, jsonMode: true, role: "writer" });
    const next = (parse(text).paragraphs || []).map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!next.length) break;
    paras = next; fixed += bad.length;
    claims = await check(paras);
  }
  stillBad += claims.filter((x) => x.supported === false).length;
  claimsBy.push(claims);
  // Splice the chapter back in and move the later chapter marks if its length changed.
  const delta = paras.length - c.paragraphs;
  script.splice(c.start, c.paragraphs, ...paras);
  c.paragraphs = paras.length;
  if (delta) for (let m = n + 1; m < chapters.length; m++) chapters[m].start += delta;
}

const facts = claimsBy.flat().map((c) => (c.supported === false ? `UNSUPPORTED: ${c.claim}${c.note ? ` (notes: ${c.note})` : ""}` : String(c.claim)));
facts.sort((a, b) => (b.startsWith("UNSUPPORTED:") ? 1 : 0) - (a.startsWith("UNSUPPORTED:") ? 1 : 0));
await copyFile(epPath, join(dir, "episode.json.bak-revise"));
const fresh = JSON.parse(await readFile(epPath, "utf8"));
Object.assign(fresh, { script, chapters, factsToVerify: facts, factsChecked: [], factsHeld: [], factCheck: { checked: facts.length, unsupported: stillBad }, factsListedBy: listedBy(),
  scriptWords: script.join(" ").split(/\s+/).length, edited: new Date().toISOString() });
await writeFile(epPath, JSON.stringify(fresh, null, 2) + "\n", "utf8");
out({ ok: true, id, words: fresh.scriptWords, claims: facts.length, revised: fixed, unsupported: stillBad,
  message: `Revised ${id}: ${fresh.scriptWords} words, ${facts.length} claims, ${stillBad} still unsupported${stillBad ? " (the episode will hold on those)" : ""}.` });
