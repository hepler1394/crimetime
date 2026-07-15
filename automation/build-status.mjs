#!/usr/bin/env node
// Bakes automation/status.json — the safe-to-publish snapshot that powers the
// Mission Control dashboard (/dashboard.html). Counts + timestamps only; NEVER
// keys or secrets (config.json is gitignored and stays local).
// Run: node automation/build-status.mjs

import { readFile, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const readJson = async (name) => {
  try { return JSON.parse(await readFile(join(__dirname, name), "utf8")); } catch { return null; }
};
const mtime = async (rel) => {
  try { return (await stat(join(ROOT, rel))).mtime.toISOString(); } catch { return null; }
};

const [episodes, blog, merch, quizzes, fbi, topics, videos] = await Promise.all([
  readJson("episodes.json"), readJson("blog.json"), readJson("merch.json"),
  readJson("quizzes.json"), readJson("fbi.json"), readJson("topics.json"), readJson("videos.json"),
]);

const eps = episodes?.episodes || [];
const posts = blog?.posts || [];
const latestEp = [...eps].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null;
const latestPost = [...posts].sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0] || null;
const usedTopics = new Set(posts.map((p) => p.sourceTopic).filter(Boolean));
const topicList = topics?.topics || [];

let improvements = 0;
try {
  const led = await readFile(join(__dirname, "improvements.md"), "utf8");
  improvements = (led.match(/^\d+\./gm) || []).length;
} catch { /* no ledger yet */ }

const status = {
  generated: new Date().toISOString(),
  improvementsShipped: improvements,
  schedule: {
    cadence: "Twice a week — Tuesday & Friday (content run), feed sync every 6 hours",
    content: ["TUE 09:00", "FRI 09:00"],
    sync: "Every 6 hours",
  },
  counts: {
    episodes: eps.length,
    posts: posts.length,
    merchDesigns: (merch?.designs || []).length,
    merchCollection: (merch?.collection || []).length,
    quizzes: (quizzes?.quizzes || []).length,
    quizQuestions: (quizzes?.quizzes || []).reduce((n, q) => n + (q.questions?.length || 0), 0),
    fbiCases: (fbi?.items || []).length,
    videos: (videos?.videos || []).length,
    topicsQueued: topicList.filter((t) => !usedTopics.has(t.topic)).length,
    topicsTotal: topicList.length,
  },
  latest: {
    episode: latestEp ? { title: latestEp.title, date: latestEp.date } : null,
    post: latestPost ? { title: latestPost.title, date: latestPost.date } : null,
    quiz: quizzes?.quizzes?.[0] ? { title: quizzes.quizzes[0].title, created: quizzes.quizzes[0].created } : null,
  },
  freshness: {
    episodesJson: await mtime("automation/episodes.json"),
    blogJson: await mtime("automation/blog.json"),
    merchJson: merch?.meta?.updated || (await mtime("automation/merch.json")),
    quizzesJson: quizzes?.meta?.updated || (await mtime("automation/quizzes.json")),
    fbiJson: fbi?.meta?.updated || null,
    css: await mtime("css/style.css"),
  },
  nextTopics: topicList.filter((t) => !usedTopics.has(t.topic)).slice(0, 6).map((t) => t.topic),
};

await writeFile(join(__dirname, "status.json"), JSON.stringify(status, null, 2) + "\n", "utf8");
console.log(`status.json baked: ${status.counts.episodes} eps, ${status.counts.posts} posts, ${status.counts.quizzes} quizzes, ${status.counts.fbiCases} FBI cases.`);
