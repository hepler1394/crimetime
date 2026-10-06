#!/usr/bin/env node
// Podcast studio: rebuild an episode's mix from its dry voice track, without re-voicing.
//
//   node automation/episode-remix.mjs <draft-id> [--json]
//
// For when the mix changes and the words do not: the music, the bed or the voice colour in
// episode-music.mjs. The clone read in voice.wav is untouched, so the transcript, its timings
// and the audit's word pass all still hold; only episode.mp3 is rebuilt, the same way
// episode-voice.mjs builds it (mixEpisode, then the -16 LUFS master). The old file is kept
// as episode.mp3.before-remix. episode-publish.mjs refuses a render nothing has audited, so
// run episode-audit.mjs <id> --asr audit-words.json after this (fast: it reuses the word
// transcript of the unchanged voice.wav) and then publish with --replace-audio.

import { readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mixEpisode, probeSeconds } from "./episode-music.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
if (!id) die("args", "usage: episode-remix.mjs <draft-id>");

const dir = join(here, "studio", "drafts", id);
let ep;
try { ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8")); } catch { die("draft", `No draft ${id}`); }
const voice = join(dir, "voice.wav"), mp3 = join(dir, "episode.mp3"), mixed = join(dir, "remix.wav");
if (!existsSync(voice)) die("voice", `${id} has no voice.wav to remix from (Cory's own recordings are not remixed).`);

const before = existsSync(mp3) ? probeSeconds(mp3) : null;
await mixEpisode(voice, mixed, { music: ep.music !== false, bed: ep.bed !== false, theme: ep.theme });
if (existsSync(mp3)) await copyFile(mp3, join(dir, "episode.mp3.before-remix"));
const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", mixed, "-af", "apad=pad_dur=0.5,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "3",
  "-metadata", `title=${ep.title}`, "-metadata", "artist=CrimeTimeSnacks", "-metadata", "album=CrimeTimeSnacks", "-metadata", "genre=Podcast", mp3], { encoding: "utf8", windowsHide: true });
await rm(mixed, { force: true });
if (r.status !== 0) die("master", (r.stderr || "").trim().slice(-400));
const after = probeSeconds(mp3);
const fresh = JSON.parse(await readFile(join(dir, "episode.json"), "utf8"));
fresh.remixedAt = new Date().toISOString();
await writeFile(join(dir, "episode.json"), JSON.stringify(fresh, null, 2) + "\n", "utf8");
out({ ok: true, id, before, after, message: `Remixed ${id}: ${before ? before.toFixed(1) + "s -> " : ""}${after.toFixed(1)}s, old mix kept as episode.mp3.before-remix. Audit it next.` });
