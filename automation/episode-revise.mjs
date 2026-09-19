#!/usr/bin/env node
// Podcast studio: take the claims the drafter's fact-checker marked UNSUPPORTED and fix the
// script instead of leaving the episode held for a person.
//
//   node automation/episode-revise.mjs <draft-id> [--rounds 2] [--json]
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
// audio wrong. Use episode-repair.mjs --edits for that.

import { readFile, writeFile, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id) die("args", "usage: episode-revise.mjs <draft-id> [--rounds 2]");

const dir = join(here, "studio", "drafts", id);
const epPath = join(dir, "episode.json");
const ep = JSON.parse(await readFile(epPath, "utf8").catch(() => die("draft", `No draft ${id}.`)));
if (["voiced", "ready", "committed", "published"].includes(ep.status)) die("state", `${id} is already voiced (${ep.status}). Changing its words now would make the audio wrong.`);
const research = await readFile(join(dir, "research.md"), "utf8").catch(() => die("notes", `${id} has no research.md.`));
const voice = await readFile(join(here, "voice.md"), "utf8").catch(() => "");
const cfg = await loadConfig();
const rounds = Math.max(1, Math.min(4, parseInt(opt("--rounds", "2"), 10) || 2));
const OPENER = "What's up guys, welcome back to CrimeTimeSnacks.";
const OUTRO = "That's it for this one. Thanks for hanging out with me. This has been CrimeTimeSnacks, and I'll catch you next time.";
const parse = (t) => { const m = String(t).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : {}; };

async function check(paras) {
  const body = paras.map((t) => t.replace(OPENER, "").replace(OUTRO, "").trim()).filter(Boolean).join("\n\n");
  const { text } = await chat(`You are a fact-checker. You get RESEARCH NOTES and a SCRIPT CHAPTER. List every specific factual claim in the chapter (names, dates, counts, places, quotes, sequence of events). For each, decide if the notes support it. Output ONLY a JSON object: {"claims": [{"claim": string, "supported": boolean, "note": string (for unsupported claims: what the notes actually say, or "not in notes")}]}. Be strict: a claim is supported only if the notes state it.`,
    `RESEARCH NOTES:\n${research.slice(0, 200000)}\n\nSCRIPT CHAPTER:\n${body}`, { ...cfg, jsonMode: true });
  return (parse(text).claims || []).filter((c) => c && c.claim);
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
Object.assign(fresh, { script, chapters, factsToVerify: facts, factsChecked: [], factsHeld: [], factCheck: { checked: facts.length, unsupported: stillBad },
  scriptWords: script.join(" ").split(/\s+/).length, edited: new Date().toISOString() });
await writeFile(epPath, JSON.stringify(fresh, null, 2) + "\n", "utf8");
out({ ok: true, id, words: fresh.scriptWords, claims: facts.length, revised: fixed, unsupported: stillBad,
  message: `Revised ${id}: ${fresh.scriptWords} words, ${facts.length} claims, ${stillBad} still unsupported${stillBad ? " (the episode will hold on those)" : ""}.` });
