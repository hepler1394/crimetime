#!/usr/bin/env node
// Podcast studio: fact-check only the paragraphs a correction changed.
//
//   node automation/episode-delta-check.mjs <draft-id> [--json]
//
// For an episode that is ALREADY published and is having its audio corrected. The full fact
// gate (episode-verify.mjs) judges the whole script, which is right for a new episode. For a
// correction it asks the wrong question: every paragraph the correction did not touch is, word
// for word, what is already on Apple and Spotify, so a claim held there does not make the
// replacement worse than the recording it replaces - and holding the replacement keeps the
// known error live. On 2026-11-21 Gemini's credit ran out, Claude took over the fact check, and
// it is stricter: it began holding old paragraphs for words like "quickly", which would have
// kept the Murdaugh correction - the one that says he is presumed innocent - off the feed.
//
// Cory, 2026-11-21, asked whether a correction should publish when only its changed paragraphs
// pass the strict check: "Yes, changed parts only".
//
// So: every paragraph of the draft that is not, word for word, in the published transcript
// (automation/transcripts/<slug>.json) is checked against research.md as strictly as any new
// script, claim by claim. The result is written to delta-check.json in the draft. Anything
// unsupported in a changed paragraph still blocks. This lowers no bar for new words; it only
// stops words that are already public from blocking the removal of a known mistake.
//
// It never publishes. episode-publish.mjs --replace-audio reads delta-check.json: see there.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id) die("args", "usage: episode-delta-check.mjs <draft-id> [--json]");

const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const scriptHash = (paras) => createHash("sha256").update(paras.map(norm).join("\n")).digest("hex");

const dir = join(here, "studio", "drafts", id);
let ep, research, live;
try { ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8")); } catch { die("draft", `No draft ${id}.`); }
try { research = await readFile(join(dir, "research.md"), "utf8"); } catch { die("research", `${id} has no research.md to check against.`); }
try { live = JSON.parse(await readFile(join(here, "transcripts", `${ep.slug}.json`), "utf8")); } catch { die("live", `${ep.slug} has no published transcript, so there is nothing to compare with. This check is for corrections to a published episode.`); }
const paras = (ep.script || []).filter(Boolean);
const liveText = norm((live.segments || []).map((s) => s.text || "").join(" "));
if (liveText.length < 2000) die("live", `The published transcript of ${ep.slug} is too short to compare against.`);
const changed = paras.map((p, i) => ({ i, text: p })).filter((p) => !liveText.includes(norm(p.text)));
// A draft that shares almost nothing with the live episode is a rewrite, not a correction, and
// a rewrite is a new script: it goes through the whole gate.
if (changed.length > paras.length * 0.4) die("rewrite", `${changed.length} of ${paras.length} paragraphs differ from the published episode. That is a rewrite, not a correction; it has to pass episode-verify.mjs in full.`);

const parse = (raw) => {
  const t = String(raw || "").replace(/^\s*```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch { /* salvage */ }
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  if (s > -1 && e > s) return JSON.parse(t.slice(s, e + 1));
  throw new Error("no JSON object in the answer");
};

const cfg = await loadConfig();
const cloud = cfg.order.filter((n) => n !== "local");
const checkCfg = { ...cfg, order: cloud.length ? cloud : cfg.order, jsonMode: true };
const results = [];
let provider = "";
say(`${changed.length} of ${paras.length} paragraphs differ from the published episode: ${changed.map((c) => c.i).join(", ") || "none"}`);
for (const c of changed) {
  let claims = null, last = "";
  for (let attempt = 1; attempt <= 3 && claims === null; attempt++) {
    const r = await chat(`You are a fact-checker. You get RESEARCH NOTES and one SCRIPT PARAGRAPH from a true crime podcast. List every specific factual claim in the paragraph (names, dates, counts, places, quotes, sequence of events). For each, decide if the notes support it. A sentence that only refers back to something said earlier in the episode, a sign-off, or a line that is plainly the host's framing rather than a statement of fact is not a claim: leave it out. Output ONLY a JSON object: {"claims": [{"claim": string, "supported": boolean, "note": string (for unsupported claims: what the notes actually say, or "not in notes")}]}. Be strict: a claim is supported only if the notes state it.`,
      `RESEARCH NOTES:\n${research.slice(0, 200000)}\n\nSCRIPT PARAGRAPH:\n${c.text}`, checkCfg);
    provider = r.provider;
    try { const j = parse(r.text); if (Array.isArray(j.claims)) claims = j.claims.filter((x) => x && x.claim); } catch (e) { last = e.message; }
  }
  if (claims === null) { results.push({ paragraph: c.i, claims: 0, unsupported: [{ claim: "(could not be checked)", note: last || "the checker gave no usable answer" }] }); continue; }
  const bad = claims.filter((x) => x.supported === false).map((x) => ({ claim: x.claim, note: x.note || "" }));
  results.push({ paragraph: c.i, claims: claims.length, unsupported: bad });
  say(`  paragraph ${c.i}: ${claims.length} claim(s), ${bad.length} unsupported`);
}

const unsupported = results.flatMap((r) => r.unsupported.map((u) => ({ paragraph: r.paragraph, ...u })));
const record = { at: new Date().toISOString(), slug: ep.slug, checkedBy: provider, scriptHash: scriptHash(paras), paragraphs: results.map((r) => r.paragraph), claims: results.reduce((n, r) => n + r.claims, 0), unsupported, ok: unsupported.length === 0 };
await writeFile(join(dir, "delta-check.json"), JSON.stringify(record, null, 2) + "\n", "utf8");
out({ ok: true, id, clear: record.ok, ...record,
  message: record.ok
    ? `Delta check ${id}: ${record.claims} claims in ${results.length} changed paragraph(s), all carried by the notes (${provider}).`
    : `Delta check ${id}: ${unsupported.length} claim(s) in the changed paragraphs are NOT carried by the notes:\n${unsupported.map((u) => `  [${u.paragraph}] ${u.claim} (${u.note})`).join("\n")}` });
