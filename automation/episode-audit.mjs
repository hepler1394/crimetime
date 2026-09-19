#!/usr/bin/env node
// Podcast studio, the audio gate: listen to what was actually rendered before it goes out.
//
//   node automation/episode-audit.mjs <draft-id> [--json] [--asr <words.json>] [--no-write]
//
// Cory, 2026-09-18: "always..always audit the audio". The Petito episode had been live for six
// days with the clone saying "Capra One" for Capital One, garbling "authorities" and stuttering
// an extra "fraud" after "intent to defraud"; every claim in it had passed the fact gate, and
// the fact gate reads text. This reads the sound.
//
// Two passes:
//   1. Levels on episode.mp3: integrated loudness, true peak, length, dead air.
//   2. Words on voice.wav (the dry voice, no music): a faster-whisper medium.en transcript with
//      per-word time and confidence, aligned against episode.json's script. It reports
//        ARTIFACT  a word the script never had, heard at low confidence: a stutter or a noise
//        DROPPED   three or more script words in a row that were never heard
//        MISHEARD  a word whose consonants differ from the script's: a likely mispronunciation
//      each with its time in the finished episode and its paragraph, so episode-splice.mjs can
//      replace just that paragraph.
//
// It HOLDS on any of those. It cannot tell a wrong vowel from a right one ("Statik" read as
// "Stotic" has the same consonants), and a model hearing a rare surname as a common word is
// noise, not a glitch; names that are fine can be listed in episode.json as audioOk: ["..."].
// A clean run means nothing was caught, not that a person would find nothing.
//
// Do not run this while a clone render is going: both want every core.

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { VOICE_STARTS_AT } from "./episode-music.mjs";
import { compareWords } from "./audio-compare.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(here, "studio");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id) die("args", "usage: episode-audit.mjs <draft-id> [--json] [--asr words.json]");

const dir = join(STUDIO, "drafts", id);
const epPath = join(dir, "episode.json");
let ep; try { ep = JSON.parse(await readFile(epPath, "utf8")); } catch { die("draft", `No draft ${id}.`); }
const mp3 = join(dir, "episode.mp3"), voice = join(dir, "voice.wav");
if (!existsSync(mp3) || !existsSync(voice)) die("audio", `${id} has no episode.mp3 / voice.wav yet. Voice it first.`);
const ff = (a) => spawnSync("ffmpeg", ["-hide_banner", "-nostats", ...a], { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 }).stderr || "";
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
const findings = [];

/* ------------------------------------------------------------------ 1. levels */
const lv = ff(["-i", mp3, "-af", "ebur128=peak=true", "-f", "null", "-"]);
const I = parseFloat((/Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(lv) || [])[1]);
const TP = parseFloat((/True peak:\s*\n\s*Peak:\s*(-?[\d.]+) dBFS/.exec(lv) || [])[1]);
const seconds = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp3], { encoding: "utf8", windowsHide: true }).stdout);
if (!(I > -17.6 && I < -14.4)) findings.push({ kind: "LEVEL", at: 0, text: `integrated loudness is ${I} LUFS; the target is -16` });
if (!(TP <= -0.9)) findings.push({ kind: "LEVEL", at: 0, text: `true peak is ${TP} dBFS; it should stay under -1` });
if (seconds < 20 * 60) findings.push({ kind: "LENGTH", at: 0, text: `the episode is ${clock(seconds)}; the minimum is twenty minutes` });
const sd = ff(["-i", mp3, "-af", "silencedetect=noise=-45dB:d=2.5", "-f", "null", "-"]);
for (const m of sd.matchAll(/silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)/g)) {
  if (+m[1] > 1 && +m[1] < seconds - 8) findings.push({ kind: "DEAD AIR", at: +m[1], text: `${(+m[2]).toFixed(1)} s of near silence` });
}

/* ------------------------------------------------------------------- 2. words */
let asr;
if (opt("--asr")) asr = JSON.parse(await readFile(opt("--asr"), "utf8"));
else {
  say("Transcribing the dry voice with faster-whisper medium.en (about as long as the episode on this CPU)...");
  const tmp = join(dir, "audit-words.json");
  const r = spawnSync("python", [join(STUDIO, "asr_words.py"), voice, tmp], { encoding: "utf8", windowsHide: true, env: { ...process.env, PYTHONIOENCODING: "utf-8" }, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) die("asr", `transcription failed: ${(r.stderr || "").trim().slice(-300)}`);
  asr = JSON.parse(await readFile(tmp, "utf8"));
}
// Accept the scratch format used on 2026-09-18 (segments with words) as well as asr_words.py's.
const heardWords = (asr.words || (Array.isArray(asr) ? asr.flatMap((s) => s.words || []) : [])).map((w) => ({ raw: w.w, s: w.s, p: w.p }));

const paras = (ep.script || []).filter(Boolean);
const cmp = compareWords(paras, heardWords.map((h) => ({ w: h.raw, s: h.s, p: h.p })), ep.audioOk || []);
for (const f of cmp.findings) findings.push({ ...f, at: f.at + VOICE_STARTS_AT });
const A = { length: cmp.scriptWords }, B = { length: cmp.heardWordCount };

/* ------------------------------------------------------------------ 3. report */
findings.sort((a, b) => a.at - b.at);
const blocking = findings;
const parasToFix = [...new Set(findings.filter((f) => f.pi != null).map((f) => f.pi))].sort((a, b) => a - b);
const md = [`# Audio audit: ${ep.title}`, "", `Audited ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. ${clock(seconds)}, ${I} LUFS, true peak ${TP} dBFS. ${A.length} script words, ${B.length} heard.`, "",
  findings.length ? `**${findings.length} thing(s) to fix before this goes out.** Paragraphs: ${parasToFix.join(", ") || "none (levels only)"}.` : "**Nothing caught.** That means no stutter, dropped line or changed consonant was detected; it does not mean a person would find nothing.", "",
  ...findings.map((f) => `- ${f.at ? clock(f.at) : "whole file"}  ${f.kind}${f.pi != null ? ` (paragraph ${f.pi})` : ""}: ${f.text}`), ""].join("\n");
if (!args.includes("--no-write")) {
  await writeFile(join(dir, "audio-audit.md"), md, "utf8");
  const fresh = JSON.parse(await readFile(epPath, "utf8"));
  fresh.audioAudit = { at: new Date().toISOString(), seconds: +seconds.toFixed(1), lufs: I, truePeak: TP, findings: findings.length, paragraphs: parasToFix, clean: blocking.length === 0 };
  await writeFile(epPath, JSON.stringify(fresh, null, 2) + "\n", "utf8");
}
out({ ok: true, id, clean: blocking.length === 0, findings, paragraphs: parasToFix, lufs: I, truePeak: TP, seconds,
  message: blocking.length ? `Audio audit of ${id}: ${findings.length} finding(s), NOT clear to publish.\n${findings.map((f) => `  ${f.at ? clock(f.at) : "file"} ${f.kind}: ${f.text}`).join("\n")}` : `Audio audit of ${id}: nothing caught. ${clock(seconds)}, ${I} LUFS.` });
