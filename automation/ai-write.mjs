#!/usr/bin/env node
// AI blog writer. Generates a measured, slop-free true-crime post and adds it to
// blog.json, then rebuilds the site. Uses your LOCAL LM Studio model first (free),
// falling back to Deepseek/Claude/OpenAI. No API keys in code (see llm.mjs).
//
// Usage:
//   node automation/ai-write.mjs "The Long Island Serial Killer" investigation
//   node automation/ai-write.mjs --auto            (pick a topic automatically)
//   node automation/ai-write.mjs "..." analysis --commit

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CATEGORIES = { breaking: "Breaking", court: "Court", investigation: "Investigation", analysis: "Analysis", updates: "Case Updates" };
const AUTO_TOPICS = [
  ["The Long Island Serial Killer case", "investigation"],
  ["How forensic genealogy is solving cold cases", "analysis"],
  ["The Idaho student murders: where the case stands", "court"],
  ["Why some cases go cold for decades", "analysis"],
  ["The Delphi murders investigation timeline", "investigation"],
];

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const stripFence = (s) => s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const auto = args.includes("--auto");
const rest = args.filter((a) => !a.startsWith("--"));
let topic = rest[0];
let category = rest[1] && CATEGORIES[rest[1]] ? rest[1] : null;
if (auto || !topic) {
  const [t, c] = AUTO_TOPICS[Math.floor(Math.random() * AUTO_TOPICS.length)];
  topic = topic || t;
  category = category || c;
}
category = category || "analysis";

const SYSTEM = `You write for CrimeTimeSnacks, a true crime podcast website. House style is STRICT:
- Measured, factual, respectful of victims. No sensationalism.
- NO emojis. No "in this article". No AI-sounding filler. No invented quotes, statistics, or sources.
- Plain, clear American English. 3 short paragraphs.
- If you are unsure of a fact, stay general rather than stating something that might be wrong.
Output ONLY valid minified JSON, no markdown, with this exact shape:
{"title": string, "excerpt": string (max ~160 chars), "body": [string, string, string]}`;

const USER = `Write a short blog post for the category "${CATEGORIES[category]}" about: ${topic}`;

console.log(`Topic: ${topic}\nCategory: ${category}`);
const cfg = await loadConfig();
const { text, provider } = await chat(SYSTEM, USER, cfg);
console.log(`Generated via: ${provider}`);

let obj;
try {
  obj = JSON.parse(stripFence(text));
} catch (e) {
  console.error("Model did not return valid JSON:\n" + text.slice(0, 500));
  process.exit(1);
}
if (!obj.title || !Array.isArray(obj.body) || !obj.body.length) {
  console.error("Generated post missing title/body."); process.exit(1);
}

const blogPath = join(__dirname, "blog.json");
const blog = JSON.parse(await readFile(blogPath, "utf8"));
const slug = slugify(obj.title);
if (blog.posts.some((p) => p.slug === slug)) {
  console.error(`A post with slug "${slug}" already exists. Skipping.`); process.exit(1);
}

const post = {
  slug,
  title: obj.title.trim(),
  date: new Date().toISOString().slice(0, 10),
  category,
  categoryLabel: CATEGORIES[category],
  image: "images/logo.png",
  author: blog.meta?.author || "Cory",
  featured: false,
  excerpt: (obj.excerpt || obj.body[0]).trim().slice(0, 200),
  body: obj.body.map((s) => String(s).trim()).filter(Boolean),
};

blog.posts.unshift(post);
await writeFile(blogPath, JSON.stringify(blog, null, 2) + "\n", "utf8");
console.log(`Added post: ${post.title} (${slug})`);

// Rebuild the site from the updated source.
const r = spawnSync(process.execPath, [join(__dirname, "build-all.mjs")], { stdio: "inherit", cwd: ROOT });
if (r.status !== 0) process.exit(r.status ?? 1);

if (commit) {
  spawnSync("git", ["add", "-A"], { cwd: ROOT, stdio: "inherit" });
  spawnSync("git", ["commit", "-m", `Blog: add "${post.title}" (AI-written via ${provider})`], { cwd: ROOT, stdio: "inherit" });
  console.log("Committed. Run `git push` to publish (or let the cron job push).");
}
console.log("Done.");
