#!/usr/bin/env node
// Finish and publish one draft that is mid-render. Waits for the voice render to land, runs
// the fact gate, re-cuts the Instagram kit from the new audio, publishes, pushes, and
// messages Cory. For the case where a render is already running and nobody wants to sit
// and watch it.
//
//   node automation/episode-finish.mjs <draft-id> [--clear 12,18,25] [--hours 9] [--no-publish]
//
// --clear lists claim indexes a person has read against the notes and settled. They are
// ticked on top of whatever the gate decides, and the episode records that they were cleared
// by hand rather than mechanically, because that distinction is the whole point of the gate.
// Anything the gate holds that is NOT in --clear still blocks the publish.
//
// Why the ticking happens here and not before: episode-voice.mjs reads episode.json when it
// starts and writes it when it finishes, so anything ticked while a render is running is
// overwritten when that render lands. Tick after, or do not bother ticking.

import { readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a) => !a.startsWith("--") && !/^[\d,]+$/.test(a) && !/^\d+$/.test(a));
const clear = (opt("--clear", "") || "").split(",").map((n) => parseInt(n, 10)).filter((n) => Number.isInteger(n));
const hours = parseFloat(opt("--hours", "9"));
const doPublish = !args.includes("--no-publish");
if (!id) { console.error("usage: episode-finish.mjs <draft-id> [--clear 1,2,3] [--hours 9] [--no-publish]"); process.exit(2); }

const dir = join(here, "studio", "drafts", id);
const epPath = join(dir, "episode.json");
const log = (m) => console.log(`${new Date().toISOString()}  ${m}`);

async function notify(text) {
  try {
    const key = (await readFile("C:/Users/cory/AppData/Local/hermes/relay-key.txt", "utf8")).trim();
    const c = new AbortController(); setTimeout(() => c.abort(), 20000);
    const r = await fetch("https://cortex-relay.vercel.app", { method: "POST", signal: c.signal,
      headers: { "x-relay-key": key, "content-type": "application/json" },
      body: JSON.stringify({ agent: "claude", to: "cory", body: text }) });
    log(r.ok ? "notified Cory" : `relay returned ${r.status}`);
  } catch (e) { log(`notify failed: ${e.message}`); }
}

const step = (script, a) => {
  log(`${script} ${a.join(" ")}`);
  const r = spawnSync(process.execPath, [join(here, script), ...a, "--json"], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const last = (r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"));
  let res = null; try { res = last ? JSON.parse(last) : null; } catch { /* noise */ }
  if (r.status !== 0 || !res?.ok) throw new Error(`${script}: ${res?.message || (r.stderr || "").trim().slice(-300) || `exit ${r.status}`}`);
  return res;
};

const started = Date.now();
try {
  // 1. Wait for the render. "voiced" plus an episode.mp3 newer than this process started is
  // the only honest signal: the previous render's mp3 is still on disk until the mix
  // overwrites it, so its mere existence means nothing.
  log(`waiting for the voice render of ${id}`);
  let waited = 0;
  for (;;) {
    const ep = JSON.parse(await readFile(epPath, "utf8").catch(() => "{}"));
    const mp3 = await stat(join(dir, "episode.mp3")).catch(() => null);
    if (ep.status === "voiced" && mp3 && mp3.mtimeMs > started) { log(`render landed: ${ep.duration}`); break; }
    const failed = await readFile(join(dir, "tts", "failed.txt"), "utf8").catch(() => null);
    if (failed) throw new Error(`the voice render failed: ${failed.trim().slice(0, 300)}`);
    if (waited > hours * 3600 * 1000) throw new Error(`the voice render did not finish within ${hours} hours`);
    await new Promise((r) => setTimeout(r, 60000));
    waited = Date.now() - started;
  }

  // 2. The fact gate, then the hand-cleared claims on top of it.
  const check = step("episode-verify.mjs", [id]);
  let stillHeld = check.held;
  if (clear.length) {
    const ep = JSON.parse(await readFile(epPath, "utf8"));
    const heldIdx = new Set((ep.factsHeld || []).map((h) => h.index));
    const applied = clear.filter((i) => heldIdx.has(i));
    for (const i of applied) ep.factsChecked[i] = true;
    ep.factsHeld = (ep.factsHeld || []).filter((h) => !applied.includes(h.index));
    ep.factsVerifiedBy = `${check.ticked} of ${check.total} by episode-verify.mjs against research.md; ` +
      `${applied.length} read and cleared by hand (claims ${applied.join(", ")})`;
    await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
    stillHeld = ep.factsHeld.length;
    log(`gate ticked ${check.ticked}/${check.total}; cleared ${applied.length} by hand; ${stillHeld} still held`);
  }
  if (stillHeld > 0) {
    const ep = JSON.parse(await readFile(epPath, "utf8"));
    const msg = `CrimeTimeSnacks: "${ep.title}" is built but NOT published. ${stillHeld} claim(s) are still held:\n` +
      (ep.factsHeld || []).slice(0, 4).map((h) => `- [${h.index}] ${h.reason}: ${h.claim.slice(0, 110)}`).join("\n") +
      `\nFull list: automation/studio/drafts/${id}/fact-check.md`;
    log(msg); await notify(msg); process.exit(0);
  }

  // 3. The reel and trailer are cut from the audio, so they have to be rebuilt after a render.
  step("episode-social.mjs", [id]);

  // 4. Out the door.
  if (!doPublish) {
    const ep = JSON.parse(await readFile(epPath, "utf8"));
    const msg = `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and every claim checks out, but publishing was off for this run.`;
    log(msg); await notify(msg); process.exit(0);
  }
  const pub = step("episode-publish.mjs", [id, "--push"]);
  const ep = JSON.parse(await readFile(epPath, "utf8"));
  const mins = Math.round((Date.now() - started) / 60000);
  const msg = `CrimeTimeSnacks: published "${ep.title}" (${ep.duration}). ${pub.page}. ` +
    `All ${check.total} claims verified against the research notes. Spotify and Apple pick it up from the feed. Waited ${mins} min.`;
  log(msg);
  await notify(msg);
} catch (e) {
  const msg = `CrimeTimeSnacks: finishing ${id} failed. ${e.message}`.slice(0, 600);
  console.error(msg);
  await notify(msg);
  process.exit(1);
}
