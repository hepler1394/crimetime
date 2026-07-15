#!/usr/bin/env node
// AI quiz writer. Generates one new 5-question true-crime quiz in Cory's voice
// (see voice.md) and adds it to quizzes.json, then rebuilds quiz.html.
// Local LM Studio first, cloud fallback — no keys in code (see llm.mjs).
//
// Usage:
//   node automation/gen-quiz.mjs                 (topic picked from recent posts/episodes)
//   node automation/gen-quiz.mjs "The Delphi case"

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const stripFence = (s) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

async function loadVoice() {
  try { return await readFile(join(__dirname, "voice.md"), "utf8"); } catch { return ""; }
}

async function pickTopic() {
  const arg = process.argv.slice(2).filter((a) => !a.startsWith("--"))[0];
  if (arg) return arg;
  // Prefer a case the site already covers: newest episode or blog post not yet quizzed.
  try {
    const [quizzes, episodes, blog] = await Promise.all([
      readFile(join(__dirname, "quizzes.json"), "utf8").then(JSON.parse),
      readFile(join(__dirname, "episodes.json"), "utf8").then(JSON.parse).catch(() => ({ episodes: [] })),
      readFile(join(__dirname, "blog.json"), "utf8").then(JSON.parse).catch(() => ({ posts: [] })),
    ]);
    const quizzed = new Set(quizzes.quizzes.map((q) => q.sourceTopic).filter(Boolean));
    const candidates = [
      ...episodes.episodes.map((e) => e.title),
      ...blog.posts.map((p) => p.title),
    ];
    for (const c of candidates) if (!quizzed.has(c)) return c;
  } catch { /* fall through */ }
  return "Famous forensic breakthroughs in true crime history";
}

const topic = await pickTopic();
const voice = await loadVoice();

const SYSTEM = `You write true-crime quizzes for CrimeTimeSnacks. Follow this voice guide exactly:

${voice}

CRITICAL quiz rules:
- 5 questions. Every question must be about WELL-DOCUMENTED, verifiable facts. If a case detail is disputed or you are not certain, DO NOT use it — pick a safer fact.
- Respect victims. No gore. Presumption of innocence for anyone not convicted.
- 4 options per question, exactly one correct. Wrong answers plausible but clearly wrong to someone who knows the case.
- "explain" teaches one detail most people miss, in Cory's voice.
Output ONLY valid minified JSON, no markdown:
{"title": string (punchy, max 40 chars), "tag": string (2-3 words, e.g. "Episode Case" or "Detective Skills"), "description": string (max 140 chars, Cory's voice), "questions": [{"q": string, "options": [string,string,string,string], "answer": number (0-3 index), "explain": string}]}`;

console.log(`Quiz topic: ${topic}`);
const cfg = await loadConfig();
const { text, provider } = await chat(SYSTEM, `Write the quiz about: ${topic}`, cfg);
console.log(`Generated via: ${provider}`);

let obj;
try {
  obj = JSON.parse(stripFence(text));
} catch {
  console.error("Model did not return valid JSON:\n" + text.slice(0, 400));
  process.exit(1);
}
if (!obj.title || !Array.isArray(obj.questions) || obj.questions.length < 3) {
  console.error("Generated quiz missing title/questions.");
  process.exit(1);
}
const bad = obj.questions.find(
  (q) => !q.q || !Array.isArray(q.options) || q.options.length !== 4 || typeof q.answer !== "number" || q.answer < 0 || q.answer > 3
);
if (bad) { console.error("Malformed question — aborting."); process.exit(1); }

const path = join(__dirname, "quizzes.json");
const data = JSON.parse(await readFile(path, "utf8"));
const slug = slugify(obj.title);
if (data.quizzes.some((q) => q.slug === slug)) {
  console.error(`Quiz "${slug}" already exists. Skipping.`);
  process.exit(0);
}
data.quizzes.unshift({
  slug,
  title: obj.title.trim(),
  tag: (obj.tag || "Case Quiz").trim(),
  description: (obj.description || "").trim(),
  created: new Date().toISOString().slice(0, 10),
  sourceTopic: topic,
  questions: obj.questions,
});
data.meta = data.meta || {};
data.meta.updated = new Date().toISOString();
await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log(`Added quiz: ${obj.title} (${slug})`);

const r = spawnSync(process.execPath, [join(__dirname, "build-quiz.mjs")], { stdio: "inherit", cwd: ROOT });
process.exit(r.status ?? 0);
