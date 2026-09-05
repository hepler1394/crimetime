#!/usr/bin/env node
// Podcast studio, step 1: write a long-form episode script in Cory's voice.
//
//   node automation/episode-draft.mjs --auto                      next case from cases.json, 20 minutes
//   node automation/episode-draft.mjs "The Golden State Killer" --minutes 25
//   node automation/episode-draft.mjs --case golden-state-killer --json
//
// A twenty-minute episode is about 3,200 spoken words. A local model with an
// 8k context cannot write that in one answer, and would not stay factual if it
// tried, so this runs as a small newsroom:
//   A. Outline: read the lead of the research notes, plan N chapters in order
//      (who, timeline, investigation, trial, where it stands), plus title, hook,
//      show notes and caption.
//   B. Write each chapter on its own, fed ONLY the research chunks that match
//      that chapter (keyword retrieval over the notes' headings and text), plus
//      the tail of the previous chapter for continuity.
//   C. Fact-check each chapter against the same chunks; unsupported claims go to
//      the top of the studio's checklist marked UNSUPPORTED.
// Every call is small enough for the local context. Slow on a CPU (an hour or
// more for twenty minutes) and that is fine: the studio runs it unattended.
// Output: automation/studio/drafts/<date>-<slug>/episode.json (+ research.md).

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(__dirname, "studio", "drafts");

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const positional = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--minutes" && args[i - 1] !== "--case");
const minutes = Math.max(1, Math.min(60, parseFloat(opt("--minutes", "20")) || 20));
const asJson = flag("--json");
const WPM = 160;                 // the cloned voice reads briskly
const CHAPTER_WORDS = 420;       // one model answer, comfortably inside the context
const LLM_TIMEOUT = 30 * 60 * 1000;

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const stripFence = (s) => s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
const wc = (arr) => (Array.isArray(arr) ? arr.join(" ") : String(arr)).split(/\s+/).filter(Boolean).length;
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const say = (m) => { if (asJson) console.error(m); else console.log(m); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
async function readJson(p, fallback) { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } }

/* ------------------------------------------------------------- the case */
async function existingSlugs() {
  const slugs = new Set();
  for (const e of (await readJson(join(__dirname, "episodes.json"), { episodes: [] })).episodes || []) slugs.add(e.slug);
  for (const e of (await readJson(join(__dirname, "studio-episodes.json"), { episodes: [] })).episodes || []) slugs.add(e.slug);
  try { for (const d of await readdir(DRAFTS)) { const ep = await readJson(join(DRAFTS, d, "episode.json"), null); if (ep?.caseSlug) slugs.add(ep.caseSlug); } } catch { /* none */ }
  return slugs;
}
async function pickCase() {
  const wanted = opt("--case", null);
  const { cases = [] } = await readJson(join(__dirname, "cases.json"), {});
  if (wanted) return cases.find((c) => c.slug === wanted) || { slug: slugify(wanted), title: wanted, angle: "" };
  if (positional[0]) return cases.find((c) => c.slug === slugify(positional[0]) || c.title.toLowerCase() === positional[0].toLowerCase()) || { slug: slugify(positional[0]), title: positional[0], angle: "" };
  const used = await existingSlugs();
  const next = cases.find((c) => !used.has(c.slug));
  if (!next) die("backlog", "cases.json is exhausted: every case has a draft or an episode. Add cases.");
  return next;
}
const kase = await pickCase();
const voice = await readFile(join(__dirname, "voice.md"), "utf8").catch(() => "");
const cfg = { ...(await loadConfig()), timeoutMs: LLM_TIMEOUT };
// How much research each chapter call may carry. A cloud model (Gemini, DeepSeek)
// has a huge context, so it gets far more of the notes; the local 8k model gets a slice.
const cloudFirst = cfg.order[0] !== "local" && !!cfg[cfg.order[0]]?.apiKey;
const CHUNK_BUDGET = cloudFirst ? 16000 : 4600;

/* ---------------------------------------------------------- the notes */
const researchFull = await readFile(join(__dirname, "studio", "research", kase.slug, "research.md"), "utf8").catch(() => "");
// Chunks: one per "## heading" in research.md, further split so no chunk exceeds ~1800 chars.
function chunkNotes(md) {
  const chunks = [];
  for (const part of md.split(/\n(?=## )/)) {
    const m = part.match(/^## (.+?)\n([\s\S]*)$/); if (!m) continue;
    const heading = m[1].trim(); const body = m[2].replace(/^Source: .*$/m, "").trim();
    if (body.length < 80) continue;
    const paras = body.split(/\n\s*\n/); let buf = "";
    for (const p of paras) { if ((buf + p).length > 1800 && buf) { chunks.push({ heading, text: buf.trim() }); buf = ""; } buf += p + "\n\n"; }
    if (buf.trim()) chunks.push({ heading, text: buf.trim() });
  }
  return chunks;
}
const chunks = chunkNotes(researchFull);
const STOP = new Set(["the", "and", "that", "with", "from", "this", "were", "was", "for", "his", "her", "their", "have", "has", "had", "into", "after", "before", "about", "when", "then", "than", "them", "they", "what", "which", "where", "while", "would", "could", "also", "been", "being", "over", "under", "case", "episode", "chapter"]);
const tokens = (s) => (s.toLowerCase().match(/[a-z][a-z0-9']{2,}/g) || []).filter((w) => !STOP.has(w));
// Best chunks for a query, up to the char budget. Headings count triple.
function retrieve(query, budget = CHUNK_BUDGET, always = []) {
  const q = new Set(tokens(query));
  const scored = chunks.map((c, i) => {
    const ht = tokens(c.heading), bt = tokens(c.text);
    let s = 0; for (const w of ht) if (q.has(w)) s += 3; for (const w of bt) if (q.has(w)) s += 1;
    return { i, s: s / Math.sqrt(bt.length + 1) };
  }).sort((a, b) => b.s - a.s);
  const picked = []; let used = 0;
  for (const i of always) { if (chunks[i] && used + chunks[i].text.length <= budget) { picked.push(i); used += chunks[i].text.length; } }
  for (const { i, s } of scored) { if (s <= 0 || picked.includes(i)) continue; if (used + chunks[i].text.length > budget) continue; picked.push(i); used += chunks[i].text.length; if (used > budget * 0.9) break; }
  return picked.sort((a, b) => a - b).map((i) => `### ${chunks[i].heading}\n${chunks[i].text}`).join("\n\n");
}
const leadIdx = chunks.findIndex((c) => /: Lead$/.test(c.heading));
const overview = chunks.slice(0, Math.max(1, leadIdx + 1)).concat(chunks.slice(leadIdx + 1, leadIdx + 4)).map((c) => `### ${c.heading}\n${c.text}`).join("\n\n").slice(0, cloudFirst ? 20000 : 6500);

/* ------------------------------------------------------- llm helpers */
async function ask(system, user, label) {
  const t0 = Date.now();
  const { text, provider } = await chat(system, user, cfg);
  say(`  ${label}: ${Math.round((Date.now() - t0) / 1000)}s via ${provider}`);
  return { text, provider };
}
function parseArray(raw) {
  raw = stripFence(raw);
  try { const j = JSON.parse(raw); if (Array.isArray(j)) return j.map(String); if (Array.isArray(j.script)) return j.script.map(String); if (Array.isArray(j.paragraphs)) return j.paragraphs.map(String); } catch { /* salvage */ }
  const arr = []; const m = raw.match(/\[([\s\S]*)/);
  if (m) for (const s of m[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) { try { arr.push(JSON.parse(`"${s[1]}"`)); } catch { /* skip */ } }
  if (arr.length >= 2) return arr;
  return raw.split(/\n\s*\n/).map((s) => s.replace(/^[-*]\s*/, "").trim()).filter((s) => s.length > 40);
}
function parseObject(raw) {
  raw = stripFence(raw);
  try { return JSON.parse(raw); } catch { /* salvage */ }
  const start = raw.indexOf("{"); if (start > -1) { for (let end = raw.length; end > start; end--) { try { return JSON.parse(raw.slice(start, end)); } catch { /* shrink */ } } }
  return null;
}

const VOICE_RULES = `You write the spoken script for CrimeTimeSnacks, a true crime podcast. One host, Cory, talking to the listener. Follow this voice guide exactly:

${voice}

SCRIPT RULES (non-negotiable):
- SPOKEN. Write the way Cory talks on the mic: short sentences, contractions, direct address. No headings, no bullet points, no stage directions, no "[music]" cues, no markdown. Every paragraph is something he says out loud.
- FACTS ONLY from the RESEARCH NOTES you are given. If a detail is not in the notes, leave it out or say it generally ("investigators", "that winter"). Never invent a quote, a number, a date or a name.
- Presumption of innocence: "accused", "charged", "suspected" for anyone not convicted. Respect the victims and their families. No gore for its own sake.
- No emojis. No AI filler. No "in this episode we will explore". No teaser for a next episode.`;

/* ---------------------------------------------------------- A. outline */
const targetWords = Math.round(minutes * WPM);
const N = Math.max(1, Math.ceil(targetWords / CHAPTER_WORDS));
say(`Planning "${kase.title}": ${minutes} min, about ${targetWords} words in ${N} chapters. Notes: ${chunks.length} chunks, ${Math.round(researchFull.length / 1000)}k chars.`);
let outline = null, provider = "";
try {
  const { text, provider: p } = await ask(
    `You are the showrunner for CrimeTimeSnacks, a true crime podcast hosted by Cory. Plan one episode from research notes. Output ONLY valid JSON, no markdown fences:
{"title": string (max 60 chars, no colon-stacked subtitles), "hook": string (one sentence: the strangest documented detail, stated plainly), "description": string (show notes, 2 or 3 short paragraphs separated by \\n\\n, in Cory's first-person voice, no spoilers of the ending), "instagramCaption": string (3 short lines, then a final line "New episode. Link in bio.", no hashtags, no emojis), "keywords": [5 to 8 search terms], "chapters": [{"title": string, "beats": [3 to 6 short strings: the specific documented facts and events this chapter covers, in order]}]}
Rules: exactly ${N} chapters, chronological where the story allows. Chapter 1 opens the show and states the hook, then introduces the people. Middle chapters walk the timeline, the investigation, the arrest, the trial. The last chapter is where the case stands today and hands it to the listener. Use ONLY facts from the notes. No emojis.`,
    `Case: ${kase.title}\nAngle: ${kase.angle || "the documented facts in order, and where the case stands now"}\nYears: ${kase.year || "unknown"}\n\nRESEARCH NOTES (overview):\n${overview}`,
    "outline");
  provider = p;
  outline = parseObject(text);
} catch (e) { die("llm", `Outline failed: ${e.message}`); }
if (!outline || !Array.isArray(outline.chapters) || !outline.chapters.length) {
  outline = { ...(outline || {}), chapters: Array.from({ length: N }, (_, i) => ({ title: i === 0 ? "The case" : i === N - 1 ? "Where it stands" : `Part ${i + 1}`, beats: [] })) };
}
outline.chapters = outline.chapters.slice(0, N);
while (outline.chapters.length < N) outline.chapters.push({ title: `Part ${outline.chapters.length + 1}`, beats: [] });
say(`  chapters: ${outline.chapters.map((c) => c.title).join(" | ")}`);

/* --------------------------------------------------------- B. chapters */
const perChapter = Math.round(targetWords / N);
const script = [];
const chapterMarks = [];
const factsToVerify = [];
let checked = 0, unsupported = 0;
for (let i = 0; i < outline.chapters.length; i++) {
  const ch = outline.chapters[i];
  const first = i === 0, last = i === outline.chapters.length - 1;
  const query = `${ch.title} ${(ch.beats || []).join(" ")} ${kase.title}`;
  const notes = retrieve(query, CHUNK_BUDGET, first && leadIdx > -1 ? [leadIdx] : []) || overview.slice(0, CHUNK_BUDGET);
  const prevTail = script.slice(-2).join("\n\n");
  let paras = [];
  try {
    const { text } = await ask(VOICE_RULES, `Write chapter ${i + 1} of ${outline.chapters.length}: "${ch.title}".
Beats to cover, in order: ${(ch.beats || []).map((b) => `\n- ${b}`).join("") || "\n- the documented facts for this part of the story"}
Target: about ${perChapter} words, paragraphs of 2 to 4 sentences.
${first ? `This is the OPENING chapter. The first sentence is his real opener, close to: "What's up guys, thanks for tuning in to Crime Time Snacks, the true crime podcast." Then the hook: ${outline.hook || "the strangest documented detail, stated plainly"}.` : "Do NOT re-introduce the show. Continue straight from the previous chapter."}
${last ? `This is the LAST chapter. End on the hand-off to the listener ("Read the file. Form your own conclusion." or his own words). That closing line is the LAST line; nothing after it, no sign-off, no teaser.` : "Do not wrap up the episode; the story continues in the next chapter."}
${prevTail ? `\nFor continuity, the previous chapter ended:\n${prevTail}\n` : ""}
RESEARCH NOTES for this chapter (the only allowed source of facts):
${notes}

Output ONLY a JSON array of paragraph strings.`, `chapter ${i + 1} write`);
    paras = parseArray(text).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  } catch (e) { say(`  chapter ${i + 1} failed: ${e.message}`); }
  if (!paras.length) paras = [`[Chapter ${i + 1}, "${ch.title}", did not generate. Rewrite this chapter or delete this line.]`];
  chapterMarks.push({ title: ch.title, start: script.length, paragraphs: paras.length });
  script.push(...paras);
  say(`  chapter ${i + 1}: ${wc(paras)} words`);

  /* ------------------------------------------------------ C. check */
  try {
    const { text } = await ask(
      `You are a fact-checker. You get RESEARCH NOTES and a SCRIPT CHAPTER. List every specific factual claim in the chapter (names, dates, counts, places, quotes, sequence of events). For each, decide if the notes support it. Output ONLY a JSON array of objects: {"claim": string, "supported": boolean, "note": string (for unsupported claims: what the notes actually say, or "not in notes")}. Be strict: a claim is supported only if the notes state it.`,
      `RESEARCH NOTES:\n${notes}\n\nSCRIPT CHAPTER:\n${paras.join("\n\n")}`, `chapter ${i + 1} check`);
    const arr = parseObject(text);
    const list = Array.isArray(arr) ? arr : Array.isArray(arr?.claims) ? arr.claims : [];
    for (const c of list) {
      if (!c || !c.claim) continue;
      checked++;
      if (c.supported === false) { unsupported++; factsToVerify.push(`UNSUPPORTED: ${c.claim}${c.note ? ` (notes: ${c.note})` : ""}`); }
      else factsToVerify.push(String(c.claim));
    }
  } catch (e) { say(`  chapter ${i + 1} check skipped: ${e.message}`); factsToVerify.push(`Chapter ${i + 1} ("${ch.title}") was not fact-checked; read it against the notes.`); }
}
factsToVerify.sort((a, b) => (b.startsWith("UNSUPPORTED:") ? 1 : 0) - (a.startsWith("UNSUPPORTED:") ? 1 : 0));

/* ------------------------------------------------------------ write */
const scriptWords = wc(script);
const date = new Date().toISOString().slice(0, 10);
const title = String(outline.title || kase.title).trim();
const slug = slugify(title) || kase.slug;
const id = `${date}-${slug}`;
const dir = join(DRAFTS, id);
await mkdir(dir, { recursive: true });
const draft = {
  id, status: "scripted", created: new Date().toISOString(),
  caseSlug: kase.slug, caseTitle: kase.title, title, slug,
  hook: outline.hook || "", description: outline.description || "", script,
  chapters: chapterMarks,
  factsToVerify, factCheck: { checked, unsupported },
  instagramCaption: outline.instagramCaption || "", keywords: Array.isArray(outline.keywords) ? outline.keywords : [],
  targetMinutes: minutes, targetWords, scriptWords, provider, researched: !!researchFull,
  voice: { engine: null, name: "en-US-AndrewNeural", rate: "-3%", pitch: "-2Hz", exaggeration: 0.45, cfg: 0.5 },
  files: researchFull ? { research: "research.md" } : {},
};
await writeFile(join(dir, "episode.json"), JSON.stringify(draft, null, 2) + "\n", "utf8");
if (researchFull) await writeFile(join(dir, "research.md"), researchFull, "utf8");
out({ ok: true, id, dir, title, words: scriptWords, minutesEstimate: +(scriptWords / WPM).toFixed(1), chapters: chapterMarks.length, checked, unsupported, provider, researched: !!researchFull,
  message: `Drafted "${title}": ${scriptWords} words (~${(scriptWords / WPM).toFixed(1)} min) in ${chapterMarks.length} chapters, ${checked} claims checked, ${unsupported} unsupported${researchFull ? "" : "; NO research notes, run episode-research first"} -> ${dir}` });
