#!/usr/bin/env node
// Podcast studio: start a new episode. Research first, then the script.
//
//   node automation/episode-new.mjs --auto [--minutes 20]
//   node automation/episode-new.mjs "Gabby Petito" [--minutes 20]
//
// Thin orchestrator so the studio's Draft button and the weekly job do the same
// two things in the same order. Prints the draft step's JSON as its last line.

import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const minutes = opt("--minutes", "20");
const topic = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const readJson = async (p) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } };

const { cases = [] } = (await readJson(join(here, "cases.json"))) || {};
let kase;
if (topic) {
  kase = cases.find((c) => c.slug === slugify(topic) || c.title.toLowerCase() === topic.toLowerCase()) || { slug: slugify(topic), title: topic };
} else {
  const used = new Set();
  for (const e of ((await readJson(join(here, "episodes.json"))) || {}).episodes || []) used.add(e.slug);
  for (const e of ((await readJson(join(here, "studio-episodes.json"))) || {}).episodes || []) used.add(e.slug);
  try { for (const d of await readdir(join(here, "studio", "drafts"))) { const ep = await readJson(join(here, "studio", "drafts", d, "episode.json")); if (ep?.caseSlug) used.add(ep.caseSlug); } } catch { /* none */ }
  kase = cases.find((c) => !used.has(c.slug));
  if (!kase) { console.log(JSON.stringify({ ok: false, step: "backlog", message: "cases.json is exhausted. Add a case." })); process.exit(2); }
}

const run = (script, a) => {
  const r = spawnSync(process.execPath, [join(here, script), ...a, ...(asJson ? ["--json"] : [])], { cwd: join(here, ".."), encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const lines = (r.stdout || "").trim().split("\n");
  const last = lines.reverse().find((l) => l.startsWith("{"));
  // Pass everything but the final JSON line straight through so the studio log shows progress.
  process.stdout.write((r.stdout || "").split("\n").filter((l) => l !== last).join("\n") + (r.stderr || ""));
  let res = null; try { res = last ? JSON.parse(last) : null; } catch { /* prose */ }
  return { status: r.status, res };
};

const research = run("episode-research.mjs", ["--case", kase.slug, ...(kase.title && !cases.includes(kase) ? [kase.title] : [])]);
if (!asJson) console.log(research.res?.message || "");
else console.error(research.res?.message || `research exit ${research.status}`);
const draft = run("episode-draft.mjs", ["--case", kase.slug, "--minutes", String(minutes)]);
if (draft.res) console.log(asJson ? JSON.stringify(draft.res) : draft.res.message);
process.exit(draft.status ?? 1);
