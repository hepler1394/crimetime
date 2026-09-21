#!/usr/bin/env node
// The weekly episode job. Runs the whole studio pipeline for the next case in cases.json
// and publishes it: research, script, FACT GATE, voice, art, Instagram kit, publish, push.
//
// It used to stop at "ready" and wait for Cory to tick the fact list by hand. That gate was
// the right instinct and the wrong mechanism: an episode nobody had time to check sat
// unpublished for weeks, which is not safer, just slower. The check is now automatic and
// the standard is stricter than a tired person ticking two hundred boxes - every claim must
// be carried by that episode's own research notes, or the episode does not go out.
//
// What still reaches Cory: a Telegram message either way, and any claim the gate held.
//
//   node automation/episode-weekly.mjs                 next case, 20 minutes, publish if it passes
//   node automation/episode-weekly.mjs --minutes 3
//   node automation/episode-weekly.mjs --engine edge   skip the voice clone (fast)
//   node automation/episode-weekly.mjs --no-publish    build it, do not publish whatever the gate says
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
// Publishing is the default. The fact gate, not a flag, is what decides whether an episode
// actually goes out: episode-verify.mjs must find every claim carried by the research notes.
const publish = !args.includes("--no-publish");
const minutes = opt("--minutes", "22");   // two minutes of margin over the twenty-minute rule
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
  // Two ways to Cory's phone, tried in order. The agent relay is the reliable one: it is a
  // plain HTTPS POST and Cortex forwards a to=cory message to Telegram. The Hermes bridge
  // is local and has been the flakier of the two, so it is the fallback, not the first try.
  // Never fatal - a job that finished must not report failure because a message did not send.
  try {
    const { readFile: rf } = await import("node:fs/promises");
    const key = (await rf("C:/Users/cory/AppData/Local/hermes/relay-key.txt", "utf8")).trim();
    const c = new AbortController(); setTimeout(() => c.abort(), 20000);
    const r = await fetch("https://cortex-relay.vercel.app", { method: "POST", signal: c.signal,
      headers: { "x-relay-key": key, "content-type": "application/json" },
      body: JSON.stringify({ agent: "claude", to: "cory", body: text }) });
    if (r.ok) { console.log("Notice sent to Cory over the agent relay."); return; }
    console.log(`Relay returned ${r.status}; trying the Hermes bridge.`);
  } catch (e) { console.log(`Relay notice failed (${e.message}); trying the Hermes bridge.`); }
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
  // --draft <id>: take a script that already exists (re-drafted, revised or edited by hand) and
  // run it through the rest of the line: gate, voice, audio audit and repair, art, kit, publish.
  const given = (() => { const i = process.argv.indexOf("--draft"); return i > -1 ? process.argv[i + 1] : null; })();
  let draft;
  if (given) draft = { id: given };
  else {
    const kase = await nextCase();
    if (!kase) throw new Error("cases.json is exhausted. Add cases.");
    step("episode-research.mjs", ["--case", kase.slug], { optional: true });
    draft = step("episode-draft.mjs", ["--case", kase.slug, "--minutes", String(minutes)]);
    // Fix what the drafter's own checker flagged before any of it is voiced.
    step("episode-revise.mjs", [draft.id], { optional: true });
  }

  // The fact gate. It runs before the render so its verdict is in hand early, but a held
  // claim does not stop the render: most holds are the checker being literal about a name,
  // and in that case the script is fine and the audio stays valid. So build the whole
  // episode either way, and let the gate decide only whether it goes out.
  const check = step("episode-verify.mjs", [draft.id]);

  // Length preflight. episode-publish.mjs refuses a render under twenty minutes, and
  // finding that out afterwards costs the whole render. Measure the script against the
  // pace of the episodes already published and say so now, while the fix is still a
  // text edit. A thin margin is a warning; a script the ordinary pace cannot carry
  // over the floor stops the run here rather than spending the hours first.
  const len = step("episode-length.mjs", [draft.id], { optional: true });
  if (len && !len.safe) {
    console.log(`\nLength preflight: ${len.words} words, expected ${len.expected}, worst case ${len.worst}.`);
    if (len.willFail) {
      const msg = `${draft.id} is too short to publish: ${len.words} words runs about ${len.expected}, under the twenty-minute floor. Add roughly ${len.wordsShort} words from research.md and run it again. Nothing was rendered.`;
      await notify(`CrimeTimeSnacks: ${msg}`);
      throw new Error(msg);
    }
    console.log(`  Thin margin (${len.marginSeconds}s in the worst case). Rendering anyway; about ${len.wordsShort} more words would make it comfortable.`);
  }

  // Repetition preflight, for the same reason as the length one: a script that tells the same
  // scene three times is the thing a listener calls filler, and the audio audit cannot hear it.
  // The published Petito episode scores 11.8% here and walks the Moab traffic stop three times;
  // every episode since is between 2.1% and 6.0%. Over its own "edit before voicing" line the
  // script is rewritten before five hours are spent reading it aloud.
  const rep = step("script-repeats.mjs", [draft.id], { optional: true });
  if (rep?.ok && rep.verdict === "edit before voicing") {
    const msg = `${draft.id} tells the same scenes over: ${rep.retold} of ${rep.sentences} sentences retell an earlier one (${(rep.share * 100).toFixed(1)}%), in paragraphs ${rep.paragraphs.join(", ")}. Edit those and run it again. Nothing was rendered.`;
    await notify(`CrimeTimeSnacks: ${msg}`);
    throw new Error(msg);
  } else if (rep?.ok && rep.retold) {
    console.log(`Repetition preflight: ${(rep.share * 100).toFixed(1)}% (${rep.verdict}).`);
  }

  // --remote puts both clone renders (the episode and any repair) on the GPU box in
  // render-host.json. Everything else in the run is unchanged and still happens here.
  const remote = args.includes("--fal") ? ["--fal"] : args.includes("--remote") ? ["--remote"] : [];
  step("episode-voice.mjs", [draft.id, ...(engine ? ["--engine", engine] : []), ...remote]);

  // The audio gate: listen to the render, re-voice the paragraphs the clone got wrong, and only
  // then cut the reel and trailer from it. episode-publish.mjs refuses an unaudited render.
  let audio = step("episode-audit.mjs", [draft.id]);
  if (!audio.clean && (audio.paragraphs || []).length) {
    const fixed = step("episode-repair.mjs", [draft.id, ...remote]);
    // A splice makes a different file, and the rule is that the audio that goes out is the audio
    // that was audited. Re-audit the render the repair produced rather than trusting the
    // paragraph-by-paragraph check that built it; that is also what cuts the digest for it.
    audio = (fixed.repaired || fixed.dropped) ? step("episode-audit.mjs", [draft.id]) : fixed;
  }
  step("episode-art.mjs", [draft.id]);
  step("episode-social.mjs", [draft.id]);

  let pub = null;
  if (publish && check.publishable && audio.clean) pub = step("episode-publish.mjs", [draft.id, "--push"]);
  const ep = JSON.parse(await readFile(join(here, "studio", "drafts", draft.id, "episode.json"), "utf8"));
  const mins = Math.round((Date.now() - t0) / 60000);
  const held = check.heldClaims || [];
  const msg = pub
    ? `CrimeTimeSnacks: published "${ep.title}" (${ep.duration}). ${pub.page}. All ${check.total} claims are carried by the research notes. Spotify and Apple pick it up from the feed. Took ${mins} min.${audio.digest ? `\nIf you want to spot-check it, digest.mp3 in the draft folder is ${Math.round(audio.digest.seconds)}s of the ${audio.digest.clips} places the gate was least sure about, worst first; digest.md says where each one is in the episode.` : ""}`
    : !audio.clean
      ? `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and NOT published: the audio audit still hears a problem after the automatic re-voice (paragraphs ${(audio.unresolved || audio.paragraphs || []).join(", ") || "levels"}). See automation/studio/drafts/${draft.id}/audio-audit.md. Took ${mins} min.`
    : check.publishable
      ? `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and all ${check.total} claims check out, but publishing was turned off for this run. Publish it with: node automation/episode-publish.mjs ${draft.id} --push`
      : `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and NOT published. ${check.ticked} of ${check.total} claims check out against the notes; ${check.held} need you.\n` +
        held.slice(0, 3).map((h) => `- ${h.reason}: ${h.claim.slice(0, 110)}`).join("\n") +
        `\nThe full list is in automation/studio/drafts/${draft.id}/fact-check.md. Clear them in the studio and press Publish, or tell Claude to. Took ${mins} min.`;
  console.log(`\n${msg}`);
  await notify(msg);
} catch (e) {
  const msg = `CrimeTimeSnacks: the weekly episode job failed. ${e.message}`.slice(0, 600);
  console.error(`\n${msg}`);
  await notify(msg);
  process.exit(1);
}
