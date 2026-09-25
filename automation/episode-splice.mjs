#!/usr/bin/env node
// Podcast studio: repair a finished episode without a five-hour re-render. Swap or drop
// individual paragraphs in a draft's dry voice track, then re-mix, re-master and
// re-transcribe exactly as episode-voice.mjs does.
//
//   node automation/episode-splice.mjs <draft-id> --edits <edits.json> --new <dir> [--json]
//
// edits.json: { "<paragraph index>": { "script": "text as it should read" } | { "drop": true } }
// <dir> holds pNNN.wav for every index that has a "script" (render them with tts_clone.py).
//
// Why this is safe to do: episode-voice.mjs joins paragraphs with 0.55 s of digital silence
// (joinParts), so the paragraph boundaries can be read back out of voice.wav. A swap lands on
// those boundaries, never inside speech, so there is no seam to hear.
//
// It used to find those boundaries by counting, and refuse when the count came out wrong. On
// 2026-09-20 that refused the finished Miami episode - "Found 80 paragraph gaps for 80
// paragraphs" - because the clone left a beat inside paragraph 3, after "That is in the notes
// for a reason", and a beat and a join look the same to a level detector. audio-paragraphs.mjs
// settles it against the transcript instead. See its header.
//
// The joins are rebuilt at the length they actually were, not at a flat 0.55 s. An untouched
// render varies between about 0.50 and 0.63 s and a spliced one used to come out at 0.550 every
// time; the difference is small but it is the kind of regularity that makes a thing sound
// machine-made, and there is no reason to introduce it.
//
// The previous voice.wav, episode.mp3, transcript.json and episode.json are kept beside the
// new ones as *.before-splice.

import { readFile, writeFile, copyFile, mkdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { mixEpisode, probeSeconds } from "./episode-music.mjs";
import { paragraphSpans } from "./audio-paragraphs.mjs";
import { segmentsFromSpans, spansFromParts, transcriptDoc } from "./script-transcript.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(here, "studio");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id || !opt("--edits") || !opt("--new")) die("args", "usage: episode-splice.mjs <draft-id> --edits <edits.json> --new <dir>");

const dir = join(STUDIO, "drafts", id);
const epPath = join(dir, "episode.json");
const ep = JSON.parse(await readFile(epPath, "utf8"));
const edits = JSON.parse(await readFile(opt("--edits"), "utf8"));
const newDir = opt("--new");
const voice = join(dir, "voice.wav");
if (!existsSync(voice)) die("voice", `${id} has no voice.wav to splice into.`);

const run = (cmd, a, label) => {
  const r = spawnSync(cmd, a, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) die(label, `${label}: ${(r.stderr || r.stdout || "").trim().slice(-400)}`);
  return r;
};
const meanDb = (file) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8", windowsHide: true });
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr || ""); return m ? parseFloat(m[1]) : null;
};

/* 1. paragraph boundaries, read back from the audio against the transcript */
const paras = ep.script.filter(Boolean);
const wordsFile = join(dir, "audit-words.json");
const heard = existsSync(wordsFile) ? (JSON.parse(await readFile(wordsFile, "utf8")).words || []) : null;
const bounds = paragraphSpans(voice, paras, { words: heard?.length ? heard : null });
if (!bounds.ok) die("boundaries", `${bounds.why}. Run episode-audit.mjs first so the joins can be read against the transcript.`);
if (bounds.extra.length) say(`Ignored ${bounds.extra.length} pause(s) inside paragraphs: ${bounds.extra.map((g) => g.start.toFixed(2)).join(", ")}`);
const span = (i) => bounds.spans[i];

/* 2. cut the kept paragraphs out, bring the new ones to the same processing and level */
const work = join(dir, "splice"); await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true });
const parts = [], script = [], report = [], partOf = [];
for (let i = 0; i < paras.length; i++) {
  const e = edits[String(i)];
  if (e?.drop) { report.push({ i, action: "dropped", seconds: +(span(i)[1] - span(i)[0]).toFixed(1) }); continue; }
  partOf.push(i);
  const [s, t] = span(i);
  const orig = join(work, `o${String(i).padStart(3, "0")}.wav`);
  run("ffmpeg", ["-y", "-v", "error", "-ss", s.toFixed(4), "-to", t.toFixed(4), "-i", voice, "-ac", "1", "-ar", "44100", orig], "cut");
  if (!e?.script) { parts.push(orig); script.push(paras[i]); continue; }
  const src = join(newDir, `p${String(i).padStart(3, "0")}.wav`);
  if (!existsSync(src)) die("new", `No replacement audio for paragraph ${i} (${src}).`);
  // Same chain episode-voice.mjs puts on the joined clone track, then matched to the level of
  // the paragraph it replaces so the swap does not step up or down in volume.
  const proc = join(work, `n${String(i).padStart(3, "0")}-proc.wav`);
  run("ffmpeg", ["-y", "-v", "error", "-i", src, "-af", "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=8:release=120:makeup=2", "-ac", "1", "-ar", "44100", proc], "process");
  const gain = (meanDb(orig) ?? 0) - (meanDb(proc) ?? 0);
  const fin = join(work, `n${String(i).padStart(3, "0")}.wav`);
  run("ffmpeg", ["-y", "-v", "error", "-i", proc, "-af", `volume=${Math.max(-6, Math.min(6, gain)).toFixed(2)}dB`, fin], "level");
  parts.push(fin); script.push(e.script);
  report.push({ i, action: "replaced", was: +(t - s).toFixed(1), now: +probeSeconds(fin).toFixed(1), gainDb: +gain.toFixed(2) });
}

/* 3. rejoin, each gap at the length it was */
const gapFile = new Map();
const gapOf = (seconds) => {
  const s = Math.max(0.3, Math.min(1.2, seconds || 0.55)).toFixed(3);
  if (!gapFile.has(s)) {
    const f = join(work, `gap-${s.replace(".", "")}.wav`);
    run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", s, f], "gap");
    gapFile.set(s, f);
  }
  return gapFile.get(s);
};
const list = parts.flatMap((p, i) => (i ? [gapOf(bounds.joins[partOf[i] - 1]?.seconds), p] : [p])).map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
await writeFile(join(work, "concat.txt"), list, "utf8");
const newVoice = join(work, "voice.wav");
run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", join(work, "concat.txt"), "-ac", "1", "-ar", "44100", newVoice], "concat");

/* 4. mix, master, transcribe: the same steps and settings as episode-voice.mjs */
const mixed = join(work, "mixed.wav");
const voiceOffset = await mixEpisode(newVoice, mixed, { music: ep.music !== false, bed: ep.bed !== false, theme: ep.theme });
const newMp3 = join(work, "episode.mp3");
run("ffmpeg", ["-y", "-v", "error", "-i", mixed, "-af", "apad=pad_dur=0.5,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "3",
  "-metadata", `title=${ep.title}`, "-metadata", "artist=CrimeTimeSnacks", "-metadata", "album=CrimeTimeSnacks", "-metadata", "genre=Podcast", newMp3], "master");
const seconds = probeSeconds(newMp3);
if (seconds < 20 * 60) die("length", `The spliced episode would be ${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}, under the twenty-minute minimum. Nothing was changed.`);
// The transcript is the (edited) script on the clock the concat above just made: each kept
// or replaced paragraph at its measured length, each join at the length it was rebuilt to.
const gapSeconds = (i) => Math.max(0.3, Math.min(1.2, bounds.joins[partOf[i] - 1]?.seconds || 0.55));
const segments = segmentsFromSpans(script, spansFromParts(parts.map((p) => probeSeconds(p)), parts.map((_, i) => (i < parts.length - 1 ? gapSeconds(i + 1) : 0))), voiceOffset);

/* 5. keep the old files, install the new ones, fix the bookkeeping */
for (const f of ["voice.wav", "episode.mp3", "transcript.json", "episode.json"]) if (existsSync(join(dir, f))) await copyFile(join(dir, f), join(dir, `${f}.before-splice`));
await copyFile(newVoice, join(dir, "voice.wav")); await copyFile(newMp3, join(dir, "episode.mp3"));
const fmt = (s) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
await writeFile(join(dir, "transcript.json"), JSON.stringify(transcriptDoc({ slug: ep.slug, title: ep.title, seconds, segments }), null, 1), "utf8");
// Chapter marks count paragraphs, so dropped ones have to come out of them.
const dropped = Object.keys(edits).filter((k) => edits[k].drop).map(Number);
let at = 0;
const chapters = (ep.chapters || []).map((c) => { const n = c.paragraphs - dropped.filter((d) => d >= c.start && d < c.start + c.paragraphs).length; const o = { ...c, start: at, paragraphs: n }; at += n; return o; }).filter((c) => c.paragraphs > 0);
const bytes = (await stat(join(dir, "episode.mp3"))).size;
Object.assign(ep, { script, chapters, scriptWords: script.join(" ").split(/\s+/).length, duration: fmt(seconds), durationSeconds: +seconds.toFixed(1), audioBytes: bytes,
  spliced: [...(ep.spliced || []), { at: new Date().toISOString(), changes: report }] });
await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
await rm(work, { recursive: true, force: true });
out({ ok: true, id, duration: ep.duration, seconds: ep.durationSeconds, bytes, changes: report, message: `Spliced ${id}: ${report.length} paragraphs changed, now ${ep.duration}.` });
