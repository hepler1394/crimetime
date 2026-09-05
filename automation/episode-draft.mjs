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
const minutes = Math.max(4, Math.min(25, parseInt(opt("--minutes", "10"), 10) || 10));
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
const words = minutes * 150;

const SYSTEM = `You write the spoken script for CrimeTimeSnacks, a true crime podcast. One host, Cory, talking to the listener. Follow this voice guide exactly:

${voice}

EPISODE SCRIPT RULES (non-negotiable):
- This is SPOKEN. Write the way Cory talks on the mic: short sentences, contractions, direct address. No headings, no bullet points, no stage directions, no "[music]" cues, no markdown. Every paragraph is something he says out loud.
- Open with his real opener, close to: "What's up guys, thanks for tuning in to Crime Time Snacks, the true crime podcast." Then the hook: the single strangest documented detail of the case, stated plainly.
- Structure: opener and hook, who the people were, the timeline in order, the investigation, where it stands today, and a closing that hands the case to the listener ("Read the file. Form your own conclusion." or similar, in his words).
- Length target: about ${words} words total (roughly ${minutes} minutes spoken). Paragraphs of 2 to 5 sentences.
- FACTS ONLY. Use only widely documented, verifiable facts from court records and major reporting. If you are not sure of a name, date, number or quote, leave it out or say it generally ("investigators", "that winter"). Never invent a quote. Never invent a statistic.
- Every specific claim that a fact-checker would want to confirm (dates, dollar amounts, sentence lengths, distances, quotes) ALSO goes into "factsToVerify" so Cory can check it before it airs.
- Presumption of innocence: "accused", "charged", "suspected" for anyone not convicted. Respect the victims and their families. No gore for its own sake.
- No emojis anywhere. No AI filler phrases. No "in this episode we will explore".

Output ONLY valid JSON, no markdown fences, with exactly this shape:
{"title": string (episode title, max 60 chars, no colon-stacked subtitles), "hook": string (one sentence), "description": string (show notes: 2 or 3 short paragraphs separated by \\n\\n, in Cory's voice, no spoilers of the ending), "script": [string, ...] (the spoken paragraphs, in order), "factsToVerify": [string, ...], "instagramCaption": string (3 short lines plus a final line "New episode. Link in bio." No hashtags, no emojis), "keywords": [string, ...] (5 to 8 search terms)}`;

const USER = `Case: ${kase.title}
Angle for this episode: ${kase.angle || "the documented facts, in order, and where the case stands now"}
Years: ${kase.year || "unknown"}
Target length: ${minutes} minutes (${words} words).`;

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
  // Model ignored the JSON contract: keep the words, mark the metadata for editing.
  const paras = stripFence(text).split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  ep = { title: kase.title, hook: "", description: "", script: paras, factsToVerify: ["Model returned prose instead of JSON; review the whole script."], instagramCaption: "", keywords: [] };
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
  voice: { name: "en-US-AndrewNeural", rate: "-3%", pitch: "-2Hz" },
  files: {},
};
await writeFile(join(dir, "episode.json"), JSON.stringify(draft, null, 2) + "\n", "utf8");
out({ ok: true, id, dir, title: draft.title, words: scriptWords, provider, message: `Drafted "${draft.title}" (${scriptWords} words via ${provider}) -> ${dir}` });
