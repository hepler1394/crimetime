#!/usr/bin/env node
// The weekly episode job. Runs the whole studio pipeline for the next case in
// cases.json and stops at "ready": research, script, voice, art, Instagram kit.
// It does NOT publish. An AI-voiced episode about a real crime goes out under
// Cory's name, so the last click (fact list checked, Publish) stays his, in the
// studio: npm run studio -> http://127.0.0.1:4177
//
//   node automation/episode-weekly.mjs                 draft the next case (20 minute episode)
//   node automation/episode-weekly.mjs --minutes 3
//   node automation/episode-weekly.mjs --engine edge   skip the voice clone (fast)
//   node automation/episode-weekly.mjs --publish       also publish + push (only if you have decided to trust it unattended)
//
// Scheduled by cron/cts-episode.ps1 (Windows task "CTS Episode Draft", Mondays 08:00).
// When it finishes it tells Cory over Telegram through the Hermes bridge on this PC.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const publish = args.includes("--publish");
const minutes = opt("--minutes", "20");
const engine = opt("--engine", null);

const step = (script, a, { optional = false } = {}) => {
  console.log(`\n=== ${script} ${a.join(" ")} ===`);
  const r = spawnSync(process.execPath, [join(here, script), ...a, "--json"], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write((r.stdout || "") + (r.stderr || ""));
  const last = (r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"));
  let res = null; try { res = last ? JSON.parse(last) : null; } catch { /* noise */ }
  if (r.status !== 0 || !res?.ok) {
    if (optional) { console.log(`(optional step failed, continuing) ${res?.message || `exit ${r.status}`}`); return null; }
    throw new Error(`${script}: ${res?.message || `exit ${r.status}`}`);
  }
  return res;
};

async function notify(text) {
  // Hermes bridge on mainpc sends as the Telegram bot. Best-effort; never fatal.
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 115000);
    await fetch("http://127.0.0.1:18789/", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: `Task from the CrimeTimeSnacks studio: send Cory (chat id 7463992102) exactly this message, plain text, no emojis:\n${text}` }) });
    console.log("Telegram notice sent via Hermes bridge.");
  } catch (e) { console.log(`Telegram notice skipped: ${e.message}`); }
}

// Which case is next? Same rule as episode-draft --auto, so research lands on the right one.
async function nextCase() {
  const readJson = async (p) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } };
  const { cases = [] } = (await readJson(join(here, "cases.json"))) || {};
  const used = new Set();
  for (const e of ((await readJson(join(here, "episodes.json"))) || {}).episodes || []) used.add(e.slug);
  for (const e of ((await readJson(join(here, "studio-episodes.json"))) || {}).episodes || []) used.add(e.slug);
  try { const { readdir } = await import("node:fs/promises"); for (const d of await readdir(join(here, "studio", "drafts"))) { const ep = await readJson(join(here, "studio", "drafts", d, "episode.json")); if (ep?.caseSlug) used.add(ep.caseSlug); } } catch { /* none */ }
  return cases.find((c) => !used.has(c.slug)) || null;
}

const t0 = Date.now();
try {
  const kase = await nextCase();
  if (!kase) throw new Error("cases.json is exhausted. Add cases.");
  step("episode-research.mjs", ["--case", kase.slug], { optional: true });
  const draft = step("episode-draft.mjs", ["--case", kase.slug, "--minutes", String(minutes)]);
  step("episode-voice.mjs", [draft.id, ...(engine ? ["--engine", engine] : [])]);
  step("episode-art.mjs", [draft.id]);
  step("episode-social.mjs", [draft.id]);
  let pub = null;
  if (publish) pub = step("episode-publish.mjs", [draft.id, "--push"]);
  const ep = JSON.parse(await readFile(join(here, "studio", "drafts", draft.id, "episode.json"), "utf8"));
  const facts = (ep.factsToVerify || []).length;
  const mins = Math.round((Date.now() - t0) / 60000);
  const msg = pub
    ? `CrimeTimeSnacks: published "${ep.title}" (${ep.duration}). ${pub.page}. Spotify and Apple pick it up from the feed.`
    : `CrimeTimeSnacks: this week's episode is drafted and voiced. "${ep.title}", ${ep.duration}, ${facts} facts to check, ${ep.voiceUsed}. Open the studio (npm run studio) to review and publish. Took ${mins} min.`;
  console.log(`\n${msg}`);
  await notify(msg);
} catch (e) {
  const msg = `CrimeTimeSnacks: the weekly episode job failed. ${e.message}`.slice(0, 600);
  console.error(`\n${msg}`);
  await notify(msg);
  process.exit(1);
}
