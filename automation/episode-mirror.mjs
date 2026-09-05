#!/usr/bin/env node
// Brings the back catalogue home. Downloads every episode's audio and art that
// still lives on Spotify/Anchor's CDN into /audio and /images/episodes, and
// writes automation/legacy-episodes.json with local paths and real byte sizes.
//
//   node automation/episode-mirror.mjs            mirror anything not yet local
//   node automation/episode-mirror.mjs --json
//
// Why: the plan is to redirect the show's feed from Spotify for Creators to
// this site's feed.xml. After that, Spotify stops being the host, so every
// enclosure in our feed must point at files we serve. Apple also requires a
// real enclosure length, which the Anchor feed never gave us.
//
// import-feed.mjs uses legacy-episodes.json instead of the Anchor feed once
// automation/feed-mode.json says {"selfHosted": true}.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const asJson = process.argv.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const say = (m) => { if (!asJson) console.log(m); };

const eps = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
let legacy = { episodes: [] };
try { legacy = JSON.parse(await readFile(join(__dirname, "legacy-episodes.json"), "utf8")); } catch { /* first run */ }
const bySlug = Object.fromEntries(legacy.episodes.map((e) => [e.slug, e]));
await mkdir(join(ROOT, "audio"), { recursive: true });
await mkdir(join(ROOT, "images", "episodes"), { recursive: true });

async function download(url, dest) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 CrimeTimeSnacksMirror/1.0" }, redirect: "follow" });
  if (!r.ok || !r.body) throw new Error(`${r.status} ${url}`);
  await pipeline(Readable.fromWeb(r.body), createWriteStream(dest));
  return (await stat(dest)).size;
}
const extOf = (url, fallback) => { const m = url.split("?")[0].match(/\.(mp3|m4a|wav|jpg|jpeg|png)$/i); return m ? m[1].toLowerCase() : fallback; };

let mirrored = 0, failed = 0;
const result = [];
for (const ep of eps.episodes) {
  if (ep.source === "studio") continue; // already ours
  const prev = bySlug[ep.slug];
  const rec = { ...ep, ...(prev || {}) };
  try {
    if (!/^\//.test(rec.audio)) {
      const ext = extOf(rec.audio, "mp3");
      const rel = `/audio/${ep.slug}.${ext}`;
      const dest = join(ROOT, rel);
      let size = 0; try { size = (await stat(dest)).size; } catch { /* download */ }
      if (!size) { say(`  ${ep.slug}: downloading audio...`); size = await download(rec.audio, dest); }
      rec.audioOriginal = rec.audioOriginal || rec.audio;
      rec.audio = rel; rec.audioBytes = size;
      rec.audioType = ext === "m4a" ? "audio/x-m4a" : ext === "wav" ? "audio/wav" : "audio/mpeg";
      mirrored++;
    }
    if (rec.image && !/^\//.test(rec.image)) {
      const ext = extOf(rec.image, "jpg");
      const rel = `/images/episodes/${ep.slug}.${ext}`;
      const dest = join(ROOT, rel);
      try { await stat(dest); } catch { say(`  ${ep.slug}: downloading art...`); await download(rec.image, dest); }
      rec.imageOriginal = rec.imageOriginal || rec.image;
      rec.image = rel;
    }
    rec.source = "legacy";
    result.push(rec);
  } catch (e) {
    failed++; say(`  ${ep.slug}: FAILED ${e.message}`);
    result.push(rec);
  }
}
// Show art too.
const podcast = { ...eps.podcast, ...(legacy.podcast || {}) };
if (podcast.image && !/^\//.test(podcast.image)) {
  try { const dest = join(ROOT, "images", "episodes", "show.jpg"); try { await stat(dest); } catch { await download(podcast.image, dest); } podcast.imageOriginal = podcast.imageOriginal || podcast.image; podcast.image = "/images/episodes/show.jpg"; } catch (e) { say(`  show art: FAILED ${e.message}`); }
}
await writeFile(join(__dirname, "legacy-episodes.json"), JSON.stringify({ _README: "The back catalogue, mirrored from the Anchor/Spotify feed with local audio and art. Used instead of the Anchor feed when feed-mode.json says selfHosted. Edit titles/descriptions here if needed, then build-all.", podcast, episodes: result }, null, 2) + "\n", "utf8");
const total = result.reduce((n, e) => n + (e.audioBytes || 0), 0);
out({ ok: failed === 0, mirrored, failed, episodes: result.length, totalMB: +(total / 1048576).toFixed(1), message: `Mirrored ${mirrored} audio file(s), ${failed} failed; ${result.length} legacy episodes, ${(total / 1048576).toFixed(1)} MB of audio now served from the site.` });
