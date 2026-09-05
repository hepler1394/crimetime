#!/usr/bin/env node
// Podcast studio, step 1: write an episode script in Cory's voice.
//
//   node automation/episode-draft.mjs --auto                 next case from cases.json
//   node automation/episode-draft.mjs "The Golden State Killer" [--minutes 10]
//   node automation/episode-draft.mjs --auto --json           machine-readable result
//
// Writes automation/studio/drafts/<date>-<slug>/episode.json with the title,
// show notes, the script as an array of spoken paragraphs, a list of claims to
// verify before publishing, and an Instagram caption. Nothing is published here.
// Local LM Studio first, cloud fallback (see llm.mjs). No keys in code.

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
const minutes = Math.max(1, Math.min(25, parseFloat(opt("--minutes", "2")) || 2));
const asJson = flag("--json");

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const stripFence = (s) => s.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };

async function readJson(p, fallback) { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fallback; } }

async function existingSlugs() {
  const slugs = new Set();
  const eps = await readJson(join(__dirname, "episodes.json"), { episodes: [] });
  for (const e of eps.episodes || []) slugs.add(e.slug);
  const studio = await readJson(join(__dirname, "studio-episodes.json"), { episodes: [] });
  for (const e of studio.episodes || []) slugs.add(e.slug);
  try {
    for (const d of await readdir(DRAFTS)) {
      const ep = await readJson(join(DRAFTS, d, "episode.json"), null);
      if (ep?.caseSlug) slugs.add(ep.caseSlug);
    }
  } catch { /* no drafts yet */ }
  return slugs;
}

async function pickCase() {
  const wanted = opt("--case", null);
  const { cases = [] } = await readJson(join(__dirname, "cases.json"), {});
  if (wanted) return cases.find((c) => c.slug === wanted) || { slug: slugify(wanted), title: wanted, angle: "" };
  if (positional[0]) {
    const hit = cases.find((c) => c.slug === slugify(positional[0]) || c.title.toLowerCase() === positional[0].toLowerCase());
    return hit || { slug: slugify(positional[0]), title: positional[0], angle: "" };
  }
  const used = await existingSlugs();
  const next = cases.find((c) => !used.has(c.slug));
  if (!next) throw new Error("cases.json is exhausted: every case has a draft or an episode. Add cases.");
  return next;
}

const kase = await pickCase();
const voice = await readFile(join(__dirname, "voice.md"), "utf8").catch(() => "");
// Research notes (episode-research.mjs) ground the script. Without them the
// model works from memory, which is where invented details come from.
const researchFull = await readFile(join(__dirname, "studio", "research", kase.slug, "research.md"), "utf8").catch(() => "");
// Local models load with a small context (LM Studio here: 8192 tokens). The
// notes go in capped so the answer is never cut off mid-sentence; the full file
// still lands in the draft folder for Cory.
const RESEARCH_CAP = parseInt(process.env.RESEARCH_CAP || "5200", 10);
const research = researchFull.length > RESEARCH_CAP ? researchFull.slice(0, RESEARCH_CAP).replace(/\s+\S*$/, "") + "\n\n[notes trimmed for the model; full notes in research.md]" : researchFull;
const words = Math.round(minutes * 150);

const SYSTEM = `You write the spoken script for CrimeTimeSnacks, a true crime podcast. One host, Cory, talking to the listener. Follow this voice guide exactly:

${voice}

EPISODE SCRIPT RULES (non-negotiable):
- This is SPOKEN. Write the way Cory talks on the mic: short sentences, contractions, direct address. No headings, no bullet points, no stage directions, no "[music]" cues, no markdown. Every paragraph is something he says out loud.
- Open with his real opener, close to: "What's up guys, thanks for tuning in to Crime Time Snacks, the true crime podcast." Then the hook: the single strangest documented detail of the case, stated plainly.
- Structure: opener and hook, who the people were, the timeline in order, the investigation, where it stands today, and a closing that hands the case to the listener ("Read the file. Form your own conclusion." or similar, in his words). The closing line IS the last line: no teaser for a next episode, no "stay curious", no sign-off paragraph after it.
- Length target: about ${words} words total (roughly ${minutes} minute${minutes === 1 ? "" : "s"} spoken). This is a SHORT, snack-sized episode: one case, the essential facts, nothing padded. Paragraphs of 2 to 4 sentences.
- FACTS ONLY. ${research ? "Use ONLY facts that appear in the RESEARCH NOTES supplied with the case. If a detail is not in the notes, leave it out or say it generally." : "Use only widely documented, verifiable facts from court records and major reporting. If you are not sure of a name, date, number or quote, leave it out or say it generally (\"investigators\", \"that winter\")."} Never invent a quote. Never invent a statistic.
- Every specific claim that a fact-checker would want to confirm (dates, dollar amounts, sentence lengths, distances, quotes) ALSO goes into "factsToVerify" so Cory can check it before it airs.
- Presumption of innocence: "accused", "charged", "suspected" for anyone not convicted. Respect the victims and their families. No gore for its own sake.
- No emojis anywhere. No AI filler phrases. No "in this episode we will explore".

Output ONLY valid JSON, no markdown fences, with exactly this shape:
{"title": string (episode title, max 60 chars, no colon-stacked subtitles), "hook": string (one sentence), "description": string (show notes: 2 or 3 short paragraphs separated by \\n\\n, in Cory's voice, no spoilers of the ending), "script": [string, ...] (the spoken paragraphs, in order), "factsToVerify": [string, ...], "instagramCaption": string (3 short lines plus a final line "New episode. Link in bio." No hashtags, no emojis), "keywords": [string, ...] (5 to 8 search terms)}`;

const USER = `Case: ${kase.title}
Angle for this episode: ${kase.angle || "the documented facts, in order, and where the case stands now"}
Years: ${kase.year || "unknown"}
Target length: ${minutes} minute${minutes === 1 ? "" : "s"} (${words} words).${research ? `

RESEARCH NOTES (the only allowed source of facts):
${research}` : ""}`;

let text, provider;
try {
  ({ text, provider } = await chat(SYSTEM, USER, { ...(await loadConfig()), timeoutMs: 45 * 60 * 1000 })); // CPU inference on this PC runs a few tokens a second; a full script takes 15 to 30 minutes
} catch (err) {
  out({ ok: false, step: "llm", message: `LLM failed: ${err.message}` });
  process.exit(2);
}

let ep;
try {
  ep = JSON.parse(stripFence(text));
  if (!Array.isArray(ep.script) || !ep.script.length) throw new Error("no script array");
} catch {
  // Not valid JSON. Two cases: the answer was cut off (salvage every complete
  // string field we can find), or the model wrote prose (keep the words).
  const raw = stripFence(text);
  const field = (k) => { const m = raw.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`)); try { return m ? JSON.parse(`"${m[1]}"`) : ""; } catch { return ""; } };
  const scriptBlock = raw.match(/"script"\s*:\s*\[([\s\S]*)/);
  let paras = [];
  if (scriptBlock) for (const m of scriptBlock[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)) { try { paras.push(JSON.parse(`"${m[1]}"`)); } catch { /* skip */ } }
  // Without the closing bracket the array runs into the next fields; stop at the first key-looking string.
  const stop = paras.findIndex((p) => /^(factsToVerify|instagramCaption|keywords|title|hook|description)$/.test(p));
  if (stop > -1) paras = paras.slice(0, stop);
  paras = paras.flatMap((p) => p.split(/\n\s*\n/)).map((s) => s.trim()).filter(Boolean);
  if (paras.length < 2) paras = raw.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  ep = { title: field("title") || kase.title, hook: field("hook"), description: field("description"), script: paras, factsToVerify: ["Model answer was cut off or not JSON; the script was salvaged. Read every line."], instagramCaption: field("instagramCaption"), keywords: [] };
}

// Pass 2, only when the model overshot: cut to length. Small local models run long.
const wc = (arr) => arr.join(" ").split(/\s+/).filter(Boolean).length;
if (wc(ep.script) > words * 1.25) {
  try {
    const { text: cut } = await chat(
      `You are the show's editor. Cut a spoken true-crime script to about ${words} words (it is ${wc(ep.script)} now) without adding anything. Keep the opener sentence, keep the closing hand-off line as the LAST line, keep the facts, drop repetition, drop any teaser or sign-off after the closing line. Same voice, same paragraphs shape. Output ONLY a JSON array of paragraph strings.`,
      JSON.stringify(ep.script), { ...(await loadConfig()), timeoutMs: 20 * 60 * 1000 });
    const arr = JSON.parse(stripFence(cut));
    if (Array.isArray(arr) && arr.length >= 3 && wc(arr) < wc(ep.script)) ep.script = arr.map(String);
  } catch { /* keep the long one; the studio shows the word count */ }
}

// Pass 3, when research notes exist: check every claim against them. The
// result replaces factsToVerify so Cory's checklist says which lines the notes
// do NOT support instead of listing everything.
if (research) {
  try {
    const { text: chk } = await chat(
      `You are a fact-checker. You get RESEARCH NOTES and a SCRIPT. List every specific factual claim in the script (names, dates, counts, places, quotes, sequence of events). For each, decide if the notes support it. Output ONLY a JSON array of objects: {"claim": string, "supported": boolean, "note": string (for unsupported claims: what the notes actually say, or "not in notes")}. Be strict: a claim is supported only if the notes state it.`,
      `RESEARCH NOTES:
${research}

SCRIPT:
${ep.script.join("\n\n")}`, { ...(await loadConfig()), timeoutMs: 20 * 60 * 1000 });
    const arr = JSON.parse(stripFence(chk));
    if (Array.isArray(arr) && arr.length) {
      const bad = arr.filter((c) => c && c.supported === false);
      const good = arr.filter((c) => c && c.supported !== false);
      ep.factsToVerify = [
        ...bad.map((c) => `UNSUPPORTED: ${c.claim}${c.note ? ` (notes: ${c.note})` : ""}`),
        ...good.map((c) => String(c.claim)),
      ];
      ep.factCheck = { checked: arr.length, unsupported: bad.length };
    }
  } catch { /* keep the model's own list */ }
}

const scriptWords = ep.script.join(" ").split(/\s+/).filter(Boolean).length;
const date = new Date().toISOString().slice(0, 10);
const slug = slugify(ep.title || kase.title) || kase.slug;
const id = `${date}-${slug}`;
const dir = join(DRAFTS, id);
await mkdir(dir, { recursive: true });

const draft = {
  id,
  status: "scripted",
  created: new Date().toISOString(),
  caseSlug: kase.slug,
  caseTitle: kase.title,
  title: String(ep.title || kase.title).trim(),
  slug,
  hook: ep.hook || "",
  description: ep.description || "",
  script: ep.script.map((s) => String(s).replace(/\s+/g, " ").trim()).filter(Boolean),
  factsToVerify: Array.isArray(ep.factsToVerify) ? ep.factsToVerify : [],
  instagramCaption: ep.instagramCaption || "",
  keywords: Array.isArray(ep.keywords) ? ep.keywords : [],
  targetMinutes: minutes,
  scriptWords,
  provider,
  researched: !!research,
  voice: { engine: null, name: "en-US-AndrewNeural", rate: "-3%", pitch: "-2Hz", exaggeration: 0.45, cfg: 0.5 },
  files: {},
};
await writeFile(join(dir, "episode.json"), JSON.stringify(draft, null, 2) + "\n", "utf8");
if (researchFull) await writeFile(join(dir, "research.md"), researchFull, "utf8");
out({ ok: true, id, dir, title: draft.title, words: scriptWords, provider, researched: !!research, message: `Drafted "${draft.title}" (${scriptWords} words via ${provider}${research ? ", grounded in research notes" : ", NO research notes: run episode-research first"}) -> ${dir}` });
