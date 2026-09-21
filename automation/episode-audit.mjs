#!/usr/bin/env node
// Podcast studio, the audio gate: listen to what was actually rendered before it goes out.
//
//   node automation/episode-audit.mjs <draft-id> [--json] [--asr <words.json>] [--no-write]
//                                      [--no-confirm] [--no-digest] [--no-delivery]
//
// Cory, 2026-09-18: "always..always audit the audio". The Petito episode had been live for six
// days with the clone saying "Capra One" for Capital One, garbling "authorities" and stuttering
// an extra "fraud" after "intent to defraud"; every claim in it had passed the fact gate, and
// the fact gate reads text. This reads the sound.
//
// Four passes:
//   1. Levels on episode.mp3: integrated loudness, true peak, length, dead air.
//   2. Words on voice.wav (the dry voice, no music): a faster-whisper medium.en transcript with
//      per-word time and confidence, aligned against episode.json's script. It proposes
//        ARTIFACT  a word the script never had: a stutter or a stray sound
//        DROPPED   three or more script words in a row that were never heard
//        MISHEARD  a word that does not sound like the script's: a likely mispronunciation
//   3. A SECOND LISTEN to every flagged paragraph on its own (audio-confirm.mjs). Anything that
//      does not come back the same way is the transcriber's, not the render's, and is recorded
//      as unstable rather than held.
//   4. Delivery and writing (audio-delivery.mjs): pace, pitch movement, splice seams, and
//      whether the script tells a scene twice.
//
// WHAT HOLDS AN EPISODE AND WHAT DOES NOT
//
// Held: levels, length, dead air, a confirmed word finding, a splice seam that steps in level,
// and a script that retells enough of itself to read as padding. Every one of those has a right
// answer that does not depend on taste.
//
// Not held, only reported: pace and flat delivery. On 2026-09-20 this gate held two finished
// episodes on ten findings and every one was a false alarm, which is slower and no safer - the
// same lesson the fact gate learned on 2026-09-11. A judgement is not a defect. Those notes
// rank episode-digest.mjs instead, which cuts the minute worth listening to.
//
// It still cannot tell a wrong vowel from a right one ("Statik" read as "Stotic" has the same
// consonants). Names it keeps getting wrong can be listed in episode.json as audioOk: ["..."],
// though after audio-phonetics.mjs that list should rarely need to grow. A clean run means
// nothing was caught, not that a person would find nothing.
//
// Do not run this while a clone render is going: both want every core.

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { VOICE_STARTS_AT } from "./episode-music.mjs";
import { compareWords } from "./audio-compare.mjs";
import { paragraphSpans, paragraphAt } from "./audio-paragraphs.mjs";
import { confirmFindings } from "./audio-confirm.mjs";
import { measure, delivery, repeats, LIMITS } from "./audio-delivery.mjs";
import { buildDigest } from "./episode-digest.mjs";

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
// Keep the end time as well as the start. Without it every finding's span collapses to a point,
// the window cut for a second listen is a shade short, and audio-paragraphs.mjs reads the last
// moment a paragraph is heard as the moment its last word BEGAN.
const heardWords = (asr.words || (Array.isArray(asr) ? asr.flatMap((s) => s.words || []) : [])).map((w) => ({ raw: w.w, s: w.s, e: w.e ?? w.s, p: w.p }));

const paras = (ep.script || []).filter(Boolean);
const asrWords = heardWords.map((h) => ({ w: h.raw, s: h.s, e: h.e, p: h.p }));
const cmp = compareWords(paras, asrWords, ep.audioOk || []);
const A = { length: cmp.scriptWords }, B = { length: cmp.heardWordCount };

// Where each paragraph actually sits in the voice track, read from the transcript.
const sp = paragraphSpans(voice, paras, { words: asrWords });
if (!sp.ok && sp.why) say(`Paragraph boundaries: ${sp.why}`);

// The aligner numbers a difference by the script word it stopped at, so a word that really
// belongs to the next paragraph gets reported against this one. The clock does not have that
// problem: put each finding in the paragraph whose audio contains it.
let candidates = cmp.findings.map((f) => {
  if (!sp.spans.length || !f.seconds) return f;
  const owner = paragraphAt(sp.spans, f.seconds[0]);
  const inside = sp.spans[owner] && f.seconds[0] >= sp.spans[owner][0] && f.seconds[0] <= sp.spans[owner][1];
  return inside && owner !== f.pi ? { ...f, pi: owner, movedFrom: f.pi } : f;
});

/* ------------------------------------------------- 3. the same spots, heard again */
let unstable = [];
if (!args.includes("--no-confirm") && candidates.length && sp.spans.length) {
  const res = await confirmFindings(voice, candidates, paras, sp.spans, {
    work: join(dir, "audit-confirm"), asr: join(STUDIO, "asr_words.py"), audioOk: ep.audioOk || [], say });
  if (res.ran) { candidates = res.kept; unstable = res.dropped; }
}
for (const f of candidates) findings.push({ ...f, at: f.at + VOICE_STARTS_AT });

/* ------------------------------------------- 4. delivery, seams and repetition */
const notes = [];
let stats = null, retold = [];
if (!args.includes("--no-delivery") && sp.spans.length) {
  const meas = await measure(voice, sp.spans, join(dir, "audit-delivery.json"), { say });
  const d = delivery(paras, meas, { joins: sp.joins, spliced: ep.spliced || [] });
  notes.push(...d.notes);
  for (const h of d.holds) findings.push({ ...h, at: (sp.spans[h.pi]?.[0] ?? 0) + VOICE_STARTS_AT });
  stats = d.stats;
}
const rep = repeats(id, { say });
if (rep?.ok) {
  // Below the note line the retelling is negligible, and listing it would crowd the digest on an
  // episode that scored clean.
  if (rep.share > LIMITS.repeatsNote) retold = (rep.paragraphs || []).map((pi) => ({ pi, text: "this paragraph retells an earlier one" }));
  const line = `${rep.retold} of ${rep.sentences} sentences retell an earlier one (${(rep.share * 100).toFixed(1)}%): ${rep.verdict}`;
  if (rep.share > LIMITS.repeatsHold) findings.push({ kind: "REPEATS", at: 0, text: line });
  else if (rep.share > LIMITS.repeatsNote) notes.push({ kind: "REPEATS", pi: null, score: rep.share, text: line });
}

/* ------------------------------------------------------------------ 5. report */
findings.sort((a, b) => a.at - b.at);
const blocking = findings;
const parasToFix = [...new Set(findings.filter((f) => f.pi != null).map((f) => f.pi))].sort((a, b) => a - b);
const md = [`# Audio audit: ${ep.title}`, "", `Audited ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC. ${clock(seconds)}, ${I} LUFS, true peak ${TP} dBFS. ${A.length} script words, ${B.length} heard.`, "",
  findings.length ? `**${findings.length} thing(s) to fix before this goes out.** Paragraphs: ${parasToFix.join(", ") || "none (levels only)"}.` : "**Nothing caught.** That means no stutter, dropped line or changed consonant survived a second listen; it does not mean a person would find nothing.", "",
  ...findings.map((f) => `- ${f.at ? clock(f.at) : "whole file"}  ${f.kind}${f.pi != null ? ` (paragraph ${f.pi})` : ""}: ${f.text}`),
  ...(unstable.length ? ["", `## Heard once, not twice (${unstable.length})`, "", "Reported by the first pass and gone on a second listen of the same audio. Not held.", "",
    ...unstable.map((f) => `- ${clock((f.seconds?.[0] ?? 0) + VOICE_STARTS_AT)}  ${f.kind}${f.pi != null ? ` (paragraph ${f.pi})` : ""}: ${f.text} - ${f.why}`)] : []),
  ...(notes.length ? ["", `## Worth an ear, not a hold (${notes.length})`, "",
    ...notes.map((n) => `- ${n.pi != null ? `paragraph ${n.pi}` : "whole script"}  ${n.kind}: ${n.text}`)] : []),
  ...(stats ? ["", `Pace ${stats.medianWps} words a second, pitch movement ${stats.medianSemitoneSd} semitones, ${stats.joins} joins spanning ${stats.joinSpread}s.`] : []), ""].join("\n");
if (!args.includes("--no-write")) {
  await writeFile(join(dir, "audio-audit.md"), md, "utf8");
  const fresh = JSON.parse(await readFile(epPath, "utf8"));
  fresh.audioAudit = { at: new Date().toISOString(), seconds: +seconds.toFixed(1), lufs: I, truePeak: TP, findings: findings.length, paragraphs: parasToFix,
    clean: blocking.length === 0, list: findings, unstable, notes, retold, stats, boundaries: sp.how };
  await writeFile(epPath, JSON.stringify(fresh, null, 2) + "\n", "utf8");
}

/* ---------------------------------------------------- 6. the minute to listen to */
let digest = null;
if (!args.includes("--no-digest") && !args.includes("--no-write")) {
  try { digest = await buildDigest(dir, { seconds: 75, say }); if (digest?.ok) say(`Digest: ${digest.seconds}s over ${digest.clips} moment(s) -> digest.mp3`); }
  catch (e) { say(`Digest not built: ${String(e.message || e)}`); }
}

out({ ok: true, id, clean: blocking.length === 0, findings, unstable, notes, paragraphs: parasToFix, lufs: I, truePeak: TP, seconds,
  digest: digest?.ok ? { file: digest.file, seconds: digest.seconds, clips: digest.clips } : null,
  message: blocking.length ? `Audio audit of ${id}: ${findings.length} finding(s), NOT clear to publish.\n${findings.map((f) => `  ${f.at ? clock(f.at) : "file"} ${f.kind}: ${f.text}`).join("\n")}` : `Audio audit of ${id}: nothing caught. ${clock(seconds)}, ${I} LUFS.${unstable.length ? ` ${unstable.length} first-pass finding(s) did not survive a second listen.` : ""}${notes.length ? ` ${notes.length} note(s) to listen to.` : ""}` });
