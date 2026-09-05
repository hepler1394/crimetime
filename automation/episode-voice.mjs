#!/usr/bin/env node
// Podcast studio, step 2: turn the script into the episode audio.
//
//   node automation/episode-voice.mjs <draft-id>                    synthesize with edge-tts (free)
//   node automation/episode-voice.mjs <draft-id> --voice en-US-ChristopherNeural --rate -5%
//   node automation/episode-voice.mjs <draft-id> --from "C:\path\to\cory-recording.wav"   use Cory's own recording
//
// Output in the draft folder: episode.mp3 (128k mono, normalized to -16 LUFS,
// the podcast standard), transcript.json (timed segments from the TTS word
// boundaries, in the same shape build-episodes.mjs already renders), and the
// duration/size written back into episode.json.
//
// Requires: edge-tts (pip), ffmpeg + ffprobe on PATH. No API keys.

import { readFile, writeFile, mkdir, rm, stat, readdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(__dirname, "studio", "drafts");
const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message, code = 2) => { out({ ok: false, step, message }); process.exit(code); };

if (!id) die("args", "usage: episode-voice.mjs <draft-id> [--voice NAME] [--rate -3%] [--pitch -2Hz] [--from file]");
const dir = join(DRAFTS, id);
const epPath = join(dir, "episode.json");
let ep;
try { ep = JSON.parse(await readFile(epPath, "utf8")); } catch { die("draft", `No draft at ${epPath}`); }

const run = (cmd, cmdArgs, label) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`${label || cmd} failed (${r.status}): ${(r.stderr || r.stdout || "").trim().slice(-600)}`);
  return r.stdout;
};
const probeSeconds = (file) => parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], "ffprobe").trim()) || 0;
const fmtDur = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; };

// SRT -> [{start,end,text}] in seconds, offset by `base`.
function parseSrt(srt, base) {
  const segs = [];
  const toSec = (t) => { const m = t.trim().match(/(\d+):(\d+):(\d+)[,.](\d+)/); return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000 : 0; };
  for (const block of srt.replace(/\r/g, "").split(/\n\n+/)) {
    const lines = block.trim().split("\n");
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split("-->");
    const text = lines.slice(ti + 1).join(" ").replace(/\s+/g, " ").trim();
    if (text) segs.push({ start: +(base + toSec(a)).toFixed(1), end: +(base + toSec(b)).toFixed(1), text });
  }
  return segs;
}

// Word-level cues are too fine for the transcript UI: merge into sentence-ish
// segments of 6 to 14 seconds, splitting on sentence enders.
function coalesce(segs) {
  const outSegs = [];
  let cur = null;
  for (const s of segs) {
    if (!cur) { cur = { ...s }; continue; }
    const len = cur.end - cur.start;
    const ended = /[.!?]["')]?$/.test(cur.text);
    if ((ended && len >= 6) || len >= 14 || s.start - cur.end > 1.2) { outSegs.push(cur); cur = { ...s }; }
    else { cur.end = s.end; cur.text = `${cur.text} ${s.text}`; }
  }
  if (cur) outSegs.push(cur);
  return outSegs;
}

const work = join(dir, "tts");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
const t0 = Date.now();
let rawWav, transcript = null, voiceUsed;

const from = opt("--from", null);
if (from) {
  // Cory recorded it himself: keep his file as the source, just master it below.
  try { await stat(from); } catch { die("from", `Recording not found: ${from}`); }
  rawWav = join(work, "source.wav");
  run("ffmpeg", ["-y", "-i", from, "-ac", "1", "-ar", "44100", rawWav], "ffmpeg decode");
  voiceUsed = `recording: ${from}`;
} else {
  const voice = opt("--voice", ep.voice?.name || "en-US-AndrewNeural");
  const rate = opt("--rate", ep.voice?.rate || "-3%");
  const pitch = opt("--pitch", ep.voice?.pitch || "-2Hz");
  voiceUsed = `${voice} rate ${rate} pitch ${pitch}`;
  const paras = ep.script.filter(Boolean);
  if (!paras.length) die("script", "The draft has an empty script.");

  // One TTS call per paragraph keeps each request small and gives natural pauses.
  const parts = [];
  let base = 0;
  const allSegs = [];
  for (let i = 0; i < paras.length; i++) {
    const mp3 = join(work, `p${String(i).padStart(3, "0")}.mp3`);
    const srt = join(work, `p${String(i).padStart(3, "0")}.srt`);
    const txt = join(work, `p${String(i).padStart(3, "0")}.txt`);
    await writeFile(txt, paras[i], "utf8");
    let ok = false, lastErr = "";
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        // "--rate=-3%" form: argparse reads a bare "-3%" as an option flag.
        run("edge-tts", ["--voice", voice, `--rate=${rate}`, `--pitch=${pitch}`, "-f", txt, "--write-media", mp3, "--write-subtitles", srt], "edge-tts");
        ok = true;
      } catch (e) { lastErr = e.message; }
    }
    if (!ok) die("tts", `Paragraph ${i + 1}: ${lastErr}`);
    const secs = probeSeconds(mp3);
    allSegs.push(...parseSrt(await readFile(srt, "utf8").catch(() => ""), base));
    parts.push(mp3);
    base += secs + 0.55; // the gap inserted between paragraphs below
    if (!asJson) console.log(`  ${i + 1}/${paras.length}  ${secs.toFixed(1)}s`);
  }

  // Concatenate with a 0.55s breath between paragraphs.
  const silence = join(work, "gap.mp3");
  run("ffmpeg", ["-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", "0.55", "-c:a", "libmp3lame", "-q:a", "9", silence], "ffmpeg gap");
  const list = parts.flatMap((p, i) => (i ? [silence, p] : [p])).map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  const listPath = join(work, "concat.txt");
  await writeFile(listPath, list, "utf8");
  rawWav = join(work, "joined.wav");
  run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-ac", "1", "-ar", "44100", rawWav], "ffmpeg concat");
  transcript = coalesce(allSegs);
}

// Master: half a second of room at the head and tail, loudness to -16 LUFS
// (Apple/Spotify spoken-word target), true peak -1.5 dB, 128k mono MP3.
const finalMp3 = join(dir, "episode.mp3");
run("ffmpeg", ["-y", "-i", rawWav, "-af", "adelay=500|500,apad=pad_dur=0.8,loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "3",
  "-metadata", `title=${ep.title}`, "-metadata", "artist=CrimeTimeSnacks", "-metadata", "album=CrimeTimeSnacks", "-metadata", "genre=Podcast", finalMp3], "ffmpeg master");
const seconds = probeSeconds(finalMp3);
const bytes = (await stat(finalMp3)).size;

if (transcript) {
  // Shift for the 0.5s head padding added in mastering.
  transcript = transcript.map((s) => ({ start: +(s.start + 0.5).toFixed(1), end: +(s.end + 0.5).toFixed(1), text: s.text }));
  await writeFile(join(dir, "transcript.json"), JSON.stringify({
    slug: ep.slug, title: ep.title, language: "en", duration: +seconds.toFixed(1), model: "edge-tts word boundaries",
    generated: new Date().toISOString().slice(0, 10), note: "Transcript generated from the episode script.", segments: transcript,
  }, null, 1), "utf8");
}

ep.status = "voiced";
ep.duration = fmtDur(seconds);
ep.durationSeconds = +seconds.toFixed(1);
ep.audioBytes = bytes;
ep.voiceUsed = voiceUsed;
ep.files = { ...(ep.files || {}), audio: "episode.mp3", transcript: transcript ? "transcript.json" : undefined };
await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
await rm(work, { recursive: true, force: true });
out({ ok: true, id, duration: ep.duration, seconds: ep.durationSeconds, bytes, voice: voiceUsed, wall: Math.round((Date.now() - t0) / 1000), message: `Voiced ${id}: ${ep.duration}, ${(bytes / 1048576).toFixed(1)} MB, ${voiceUsed} (${Math.round((Date.now() - t0) / 1000)}s)` });
