#!/usr/bin/env node
// Podcast studio, step 2: turn the script into the finished episode audio,
// intro and outro music included. Three ways to get the voice:
//
//   node automation/episode-voice.mjs <draft-id>                          cloned voice (Cory, via Chatterbox) if the reference exists, else edge-tts
//   node automation/episode-voice.mjs <draft-id> --engine edge [--voice en-US-AndrewNeural --rate -3% --pitch -2Hz]
//   node automation/episode-voice.mjs <draft-id> --engine clone [--exaggeration 0.45 --cfg 0.5]
//   node automation/episode-voice.mjs <draft-id> --from "C:\path\to\recording.wav"   Cory recorded it: trim the long pauses, master, add music
//   ... --no-music        skip the intro/outro beds
//   ... --no-trim         keep every pause in a recording as is
//
// Output in the draft folder: episode.mp3 (128k, -16 LUFS, music mixed in),
// voice.wav (the dry voice, kept for re-mixing), transcript.json (timed
// segments; from the TTS word boundaries for edge, from faster-whisper for the
// clone and recordings), and duration/size written into episode.json.
//
// Requires: ffmpeg + ffprobe, edge-tts (pip, Python 3.13), and for the clone the
// venv in automation/studio/.venv with chatterbox-tts plus voice/cory-reference.wav.

import { readFile, writeFile, mkdir, rm, stat, access, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { mixEpisode, probeSeconds } from "./episode-music.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(__dirname, "studio");
const DRAFTS = join(STUDIO, "drafts");
const VENV_PY = join(STUDIO, ".venv", "Scripts", "python.exe");
const REFERENCE = join(STUDIO, "voice", "cory-reference.wav");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message, code = 2) => { out({ ok: false, step, message }); process.exit(code); };
const say = (m) => { if (!asJson) console.log(m); else console.error(m); };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

if (!id) die("args", "usage: episode-voice.mjs <draft-id> [--engine clone|edge] [--from file] [--no-music] [--no-trim]");
const dir = join(DRAFTS, id);
const epPath = join(dir, "episode.json");
let ep;
try { ep = JSON.parse(await readFile(epPath, "utf8")); } catch { die("draft", `No draft at ${epPath}`); }

const run = (cmd, cmdArgs, label, opts = {}) => {
  const r = spawnSync(cmd, cmdArgs, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${label || cmd} failed (${r.status}): ${(r.stderr || r.stdout || "").trim().slice(-700)}`);
  return r.stdout || "";
};
const fmtDur = (s) => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`; };

// SRT -> [{start,end,text}] seconds, offset by base.
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
function coalesce(segs) {
  const res = []; let cur = null;
  for (const s of segs) {
    if (!cur) { cur = { ...s }; continue; }
    const len = cur.end - cur.start, ended = /[.!?]["')]?$/.test(cur.text);
    if ((ended && len >= 6) || len >= 14 || s.start - cur.end > 1.2) { res.push(cur); cur = { ...s }; }
    else { cur.end = s.end; cur.text = `${cur.text} ${s.text}`; }
  }
  if (cur) res.push(cur);
  return res;
}
// Join parts with a breath between paragraphs; returns [wavPath, [offsetsSeconds]].
async function joinParts(parts, work, gap = 0.55) {
  const silence = join(work, "gap.wav");
  run("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", String(gap), silence], "ffmpeg gap");
  const offsets = []; let base = 0;
  for (const p of parts) { offsets.push(base); base += probeSeconds(p) + gap; }
  const list = parts.flatMap((p, i) => (i ? [silence, p] : [p])).map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n");
  const listPath = join(work, "concat.txt");
  await writeFile(listPath, list, "utf8");
  const joined = join(work, "joined.wav");
  run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-ac", "1", "-ar", "44100", joined], "ffmpeg concat");
  return [joined, offsets];
}

const work = join(dir, "tts");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
const t0 = Date.now();
const music = !args.includes("--no-music");
const from = opt("--from", null);
let engine = opt("--engine", ep.voice?.engine || null);
if (!engine) engine = (await exists(REFERENCE)) && (await exists(VENV_PY)) ? "clone" : "edge";

let voiceWav, transcript = null, voiceUsed;

if (from) {
  // Cory's recording. Trim dead air longer than 1.2s down to a natural half-second, then master.
  if (!(await exists(from))) die("from", `Recording not found: ${from}`);
  voiceWav = join(work, "voice.wav");
  const trim = args.includes("--no-trim") ? "" : "silenceremove=start_periods=1:start_threshold=-42dB:start_silence=0.3,silenceremove=stop_periods=-1:stop_duration=1.2:stop_threshold=-42dB:stop_silence=0.5,";
  run("ffmpeg", ["-y", "-v", "error", "-i", from, "-af", `${trim}highpass=f=70,afftdn=nf=-28,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=3`, "-ac", "1", "-ar", "44100", voiceWav], "ffmpeg recording");
  voiceUsed = `recording: ${from}`;
  engine = "recording";
} else if (engine === "clone") {
  if (!(await exists(REFERENCE))) die("clone", `No reference voice at ${REFERENCE}. Cut a clean 10 to 20 second clip of Cory talking and save it there.`);
  if (!(await exists(VENV_PY))) die("clone", "The studio venv is missing. See STUDIO.md, 'Voice clone'.");
  const paras = ep.script.filter(Boolean);
  if (!paras.length) die("script", "The draft has an empty script.");
  const jsonl = join(work, "paragraphs.jsonl");
  await writeFile(jsonl, paras.map((text, i) => JSON.stringify({ i, text })).join("\n"), "utf8");
  say(`Cloning ${paras.length} paragraphs in Cory's voice (CPU; expect several minutes)...`);
  const exaggeration = opt("--exaggeration", String(ep.voice?.exaggeration ?? 0.45));
  const cfg = opt("--cfg", String(ep.voice?.cfg ?? 0.5));
  try {
    run(VENV_PY, [join(STUDIO, "tts_clone.py"), "--ref", REFERENCE, "--jsonl", jsonl, "--outdir", work, "--exaggeration", exaggeration, "--cfg", cfg], "chatterbox", { stdio: asJson ? "pipe" : ["ignore", "inherit", "pipe"], env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  } catch (e) { die("clone", e.message); }
  const parts = paras.map((_, i) => join(work, `p${String(i).padStart(3, "0")}.wav`));
  const [joined] = await joinParts(parts, work);
  voiceWav = join(work, "voice.wav");
  run("ffmpeg", ["-y", "-v", "error", "-i", joined, "-af", "highpass=f=70,acompressor=threshold=-20dB:ratio=2:attack=8:release=120:makeup=2", voiceWav], "ffmpeg voice");
  voiceUsed = `cloned (chatterbox, exaggeration ${exaggeration}, cfg ${cfg})`;
} else {
  const voice = opt("--voice", ep.voice?.name || "en-US-AndrewNeural");
  const rate = opt("--rate", ep.voice?.rate || "-3%");
  const pitch = opt("--pitch", ep.voice?.pitch || "-2Hz");
  voiceUsed = `edge-tts ${voice} rate ${rate} pitch ${pitch}`;
  const paras = ep.script.filter(Boolean);
  if (!paras.length) die("script", "The draft has an empty script.");
  const parts = [], srts = [];
  for (let i = 0; i < paras.length; i++) {
    const n = String(i).padStart(3, "0");
    const mp3 = join(work, `p${n}.mp3`), srt = join(work, `p${n}.srt`), txt = join(work, `p${n}.txt`);
    await writeFile(txt, paras[i], "utf8");
    let ok = false, lastErr = "";
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      // "--rate=-3%" form: argparse reads a bare "-3%" as an option flag.
      try { run("edge-tts", ["--voice", voice, `--rate=${rate}`, `--pitch=${pitch}`, "-f", txt, "--write-media", mp3, "--write-subtitles", srt], "edge-tts"); ok = true; } catch (e) { lastErr = e.message; }
    }
    if (!ok) die("tts", `Paragraph ${i + 1}: ${lastErr}`);
    parts.push(mp3); srts.push(srt);
    say(`  ${i + 1}/${paras.length}  ${probeSeconds(mp3).toFixed(1)}s`);
  }
  const [joined, offsets] = await joinParts(parts, work);
  voiceWav = joined;
  const all = [];
  for (let i = 0; i < srts.length; i++) all.push(...parseSrt(await readFile(srts[i], "utf8").catch(() => ""), offsets[i]));
  transcript = coalesce(all);
}

// Mix with the theme, master, encode.
const mixed = join(work, "mixed.wav");
const voiceOffset = await mixEpisode(voiceWav, mixed, { music });
const finalMp3 = join(dir, "episode.mp3");
run("ffmpeg", ["-y", "-v", "error", "-i", mixed, "-af", "apad=pad_dur=0.5,loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "3",
  "-metadata", `title=${ep.title}`, "-metadata", "artist=CrimeTimeSnacks", "-metadata", "album=CrimeTimeSnacks", "-metadata", "genre=Podcast", finalMp3], "ffmpeg master");
await copyFile(voiceWav, join(dir, "voice.wav"));
const seconds = probeSeconds(finalMp3);
const bytes = (await stat(finalMp3)).size;

// Transcript: shift TTS timings by the intro offset, or transcribe the dry voice.
if (!transcript) {
  say("Transcribing with faster-whisper...");
  const tj = join(work, "whisper.json");
  try {
    run("python", [join(STUDIO, "transcribe_file.py"), voiceWav, tj, "--offset", String(voiceOffset)], "faster-whisper", { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    transcript = JSON.parse(await readFile(tj, "utf8")).segments;
  } catch (e) { say(`Transcript skipped: ${e.message}`); }
} else {
  transcript = transcript.map((s) => ({ start: +(s.start + voiceOffset).toFixed(1), end: +(s.end + voiceOffset).toFixed(1), text: s.text }));
}
if (transcript) {
  await writeFile(join(dir, "transcript.json"), JSON.stringify({
    slug: ep.slug, title: ep.title, language: "en", duration: +seconds.toFixed(1), model: engine === "edge" ? "edge-tts word boundaries" : "faster-whisper small (int8)",
    generated: new Date().toISOString().slice(0, 10), note: engine === "recording" ? "Auto-transcribed; may contain minor errors." : "Transcript generated from the episode script.", segments: transcript,
  }, null, 1), "utf8");
}

ep.status = "voiced";
ep.duration = fmtDur(seconds);
ep.durationSeconds = +seconds.toFixed(1);
ep.audioBytes = bytes;
ep.voiceUsed = voiceUsed;
ep.voice = { ...(ep.voice || {}), engine: engine === "recording" ? (ep.voice?.engine || "clone") : engine };
ep.music = music;
ep.files = { ...(ep.files || {}), audio: "episode.mp3", voice: "voice.wav", transcript: transcript ? "transcript.json" : undefined };
await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
await rm(work, { recursive: true, force: true });
const wall = Math.round((Date.now() - t0) / 1000);
out({ ok: true, id, duration: ep.duration, seconds: ep.durationSeconds, bytes, voice: voiceUsed, music, wall, message: `Voiced ${id}: ${ep.duration}, ${(bytes / 1048576).toFixed(1)} MB, ${voiceUsed}${music ? ", theme mixed in" : ""} (${wall}s)` });
