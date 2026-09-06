#!/usr/bin/env node
// Podcast studio: the trailer reel. Shaped like the JonBenet trailer Cory rates
// as his best work: a cold open, the show's name, the two or three strongest
// lines of the episode in his voice with the words landing on screen, then
// "New episode. Link in bio." and the plug.
//
//   node automation/episode-trailer.mjs <draft-id> [--seconds 40] [--json]
//
// Inputs from the episode folder: episode.mp3 + transcript.json (the lines),
// cover.jpg / card.jpg / any art-*.jpg or saved-*.jpg (backgrounds), and an
// OPTIONAL cold open: coldopen.mp3|wav|m4a|mp4 (public-record audio such as a
// 911 call or a body-cam clip, max 8 s used) with coldopen.txt holding one label
// line ("911 call, December 26, 1996. Public record."). No cold open file means
// the hook line opens the trailer instead.
// Which lines: Gemini Flash reads the transcript and picks the gripping ones;
// without a key, a heuristic picks. Output: trailer.mp4 (1080x1920, -14 LUFS).

import { readFile, writeFile, mkdir, rm, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { chat, loadConfig } from "./llm.mjs";
import { ensureBeds, probeSeconds } from "./episode-music.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRAFTS = join(__dirname, "studio", "drafts");
const TEMPLATE = pathToFileURL(join(__dirname, "studio", "templates", "trailer.html")).href;
const LOGO = pathToFileURL(join(ROOT, "images", "logo.png")).href;
const PW = ["D:/Dev/GitHub/ig-studio/node_modules/playwright/index.mjs", join(ROOT, "node_modules", "playwright", "index.mjs")].find((p) => existsSync(p));

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const target = Math.max(25, Math.min(60, parseFloat(opt("--seconds", "40")) || 40));
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
const ff = (a, label) => { const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...a], { encoding: "utf8", windowsHide: true }); if (r.status !== 0) throw new Error(`${label}: ${(r.stderr || "").trim().slice(-500)}`); };

if (!id) die("args", "usage: episode-trailer.mjs <draft-id> [--seconds 40]");
if (!PW) die("playwright", "Playwright not found (ig-studio node_modules).");
const dir = join(DRAFTS, id);
let ep, tr;
try { ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8")); } catch { die("draft", `No draft ${id}`); }
try { tr = JSON.parse(await readFile(join(dir, "transcript.json"), "utf8")); } catch { die("transcript", "No transcript.json yet. Make the voice first."); }
const audio = join(dir, "episode.mp3");
if (!existsSync(audio)) die("audio", "No episode.mp3 yet. Make the voice first.");
const segs = (tr.segments || []).map((s, i) => ({ i, ...s, dur: +(s.end - s.start).toFixed(1) })).filter((s) => s.dur >= 1.5);
if (segs.length < 4) die("transcript", "Transcript too short to cut a trailer from.");

/* --------------------------------------------------------- plug + files */
const { cases = [] } = JSON.parse(await readFile(join(__dirname, "cases.json"), "utf8").catch(() => "{}"));
const plug = cases.find((c) => c.slug === ep.caseSlug)?.plug || null;
const names = await readdir(dir);
const coldFile = names.find((n) => /^coldopen\.(mp3|wav|m4a|mp4|webm|ogg)$/i.test(n));
const coldLabel = existsSync(join(dir, "coldopen.txt")) ? (await readFile(join(dir, "coldopen.txt"), "utf8")).trim().split(/\r?\n/) : [];
// Backgrounds: generated or saved photos only. The cover and card carry their own
// type, and type under type reads as a mistake.
const bgs = names.filter((n) => /^(art-.*|saved-.*|test-art.*|bg-.*)\.(jpe?g|png)$/i.test(n));
const bgUrl = (n) => pathToFileURL(join(dir, n)).href;

/* --------------------------------------------------------- pick lines */
const opener = segs.findIndex((s) => /thanks for tuning in|crime time snacks/i.test(s.text));
const closer = segs.findIndex((s) => /form your own conclusion|read the file/i.test(s.text));
const candidates = segs.filter((s) => s.i !== (opener > -1 ? segs[opener].i : -1) && s.i !== (closer > -1 ? segs[closer].i : -1) && s.dur <= 14);
let picks = [];
try {
  const cfg = { ...(await loadConfig()), timeoutMs: 90000, jsonMode: true };
  const { text } = await chat(
    `You cut trailers for a true crime podcast. From the numbered transcript lines, pick the ${coldFile ? "TWO" : "THREE"} most gripping, self-contained lines to tease the episode: concrete, documented, surprising, emotionally clear; each must make sense alone. Prefer lines under 11 seconds. Never the show opener, never the closing hand-off, no lines that spoil the ending. Order them for a trailer (hook first, escalate). Output ONLY a JSON object: {"picks":[{"i": number}], "why": string}.`,
    `EPISODE: ${ep.title}\nHOOK: ${ep.hook}\n\nLINES:\n${candidates.map((s) => `[${s.i}] (${s.dur}s) ${s.text}`).join("\n")}`, cfg);
  const j = JSON.parse(text);
  picks = (j.picks || []).map((p) => segs.find((s) => s.i === p.i)).filter(Boolean).slice(0, coldFile ? 2 : 3);
  say(`  picked ${picks.map((p) => p.i).join(", ")}: ${j.why || ""}`);
} catch (e) { say(`  picker fell back (${e.message.slice(0, 80)})`); }
if (picks.length < 2) {
  const pool = candidates.filter((s) => s.dur >= 4 && s.dur <= 11);
  const at = (f) => pool[Math.min(pool.length - 1, Math.floor(pool.length * f))];
  picks = [at(0.05), at(0.45), at(0.8)].filter(Boolean).slice(0, coldFile ? 2 : 3);
}
if (!picks.length) die("picks", "Could not find usable lines.");

/* ---------------------------------------------------------- audio */
const work = join(dir, "trailer-work");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
const beds = await ensureBeds();
const parts = []; // { file, type, ...meta }
if (coldFile) {
  const f = join(work, "cold.wav");
  ff(["-i", join(dir, coldFile), "-t", "8", "-af", "afade=t=in:st=0:d=0.3,afade=t=out:st=7.2:d=0.8,loudnorm=I=-18:TP=-2", "-ac", "2", "-ar", "48000", f], "cold open");
  parts.push({ file: f, type: "cold", label: coldLabel[0] || "", sub: coldLabel[1] || "" });
} else {
  // Hook line opens the trailer, over black.
  const h = picks.shift();
  const f = join(work, "hook.wav");
  ff(["-i", audio, "-ss", String(Math.max(0, h.start - 0.15)), "-t", String(h.dur + 0.4), "-af", "afade=t=in:st=0:d=0.15,afade=t=out:st=" + (h.dur + 0.05) + ":d=0.35", "-ac", "2", "-ar", "48000", f], "hook cut");
  parts.push({ file: f, type: "quote", text: h.text, cold: true });
}
// Title slam: the theme's first 3 seconds.
const slam = join(work, "slam.wav");
ff(["-i", beds.intro, "-t", "3.2", "-af", "afade=t=out:st=2.4:d=0.8", "-ac", "2", "-ar", "48000", slam], "slam");
parts.push({ file: slam, type: "title" });
for (const [k, p] of picks.entries()) {
  const f = join(work, `q${k}.wav`);
  ff(["-i", audio, "-ss", String(Math.max(0, p.start - 0.12)), "-t", String(p.dur + 0.45), "-af", `afade=t=in:st=0:d=0.12,afade=t=out:st=${p.dur + 0.1}:d=0.35`, "-ac", "2", "-ar", "48000", f], `quote ${k}`);
  parts.push({ file: f, type: "quote", text: p.text });
}
const outroF = join(work, "outro.wav");
ff(["-i", beds.outro, "-t", "4.5", "-ac", "2", "-ar", "48000", outroF], "outro");
parts.push({ file: outroF, type: "cta" });

// Timeline from real durations, 0.35 s of air between parts.
const GAP = 0.35;
let t = 0.4;
const sections = [];
for (const p of parts) {
  const d = probeSeconds(p.file);
  p.start = t; p.dur = d;
  if (p.type === "quote") {
    const words = p.text.split(/\s+/).filter(Boolean);
    const speak = Math.max(0.5, d - 0.6);
    p.words = words.map((w, i) => ({ w, t: +(0.1 + (speak * i) / words.length).toFixed(2) }));
  }
  sections.push(p);
  t += d + GAP;
}
const total = t + 0.6;
// Lay the parts on one track; a faint drone bed under the spoken lines.
const inputs = []; const filt = []; const mixIn = [];
parts.forEach((p, k) => { inputs.push("-i", p.file); filt.push(`[${k}:a]adelay=${Math.round(p.start * 1000)}|${Math.round(p.start * 1000)}[a${k}]`); mixIn.push(`[a${k}]`); });
const firstQ = sections.find((s) => s.type === "quote" && !s.cold), lastQ = [...sections].reverse().find((s) => s.type === "quote");
if (firstQ && lastQ) {
  const bStart = firstQ.start - 0.3, bDur = lastQ.start + lastQ.dur - bStart + 0.4;
  filt.push(`aevalsrc=exprs='0.05*sin(2*PI*55*t)*(0.7+0.3*sin(2*PI*0.4*t))+0.02*sin(2*PI*110*t)':s=48000:d=${bDur.toFixed(2)},afade=t=in:st=0:d=1.2,afade=t=out:st=${(bDur - 1.5).toFixed(2)}:d=1.5,adelay=${Math.round(bStart * 1000)}|${Math.round(bStart * 1000)}[bed]`);
  mixIn.push("[bed]");
}
filt.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(2)},loudnorm=I=-14:TP=-1.5:LRA=11[a]`);
const timelineWav = join(work, "timeline.wav");
ff([...inputs, "-filter_complex", filt.join(";"), "-map", "[a]", "-t", total.toFixed(2), "-ar", "48000", timelineWav], "timeline mix");
say(`  ${sections.length} parts, ${total.toFixed(1)}s`);

/* ---------------------------------------------------------- video */
const data = {
  title: ep.title, logo: LOGO, plug: plug ? plug.label : "",
  sections: sections.map((s, k) => ({ type: s.cold ? "quote" : s.type, start: +s.start.toFixed(2), dur: +(s.dur + (k === sections.length - 1 ? 1 : GAP)).toFixed(2), label: s.label, sub: s.sub, words: s.words, who: s.cold ? "The case" : "From the episode",
    bg: s.type === "quote" && !s.cold ? (bgs.length ? bgUrl(bgs[k % bgs.length]) : "") : "" })),
};
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1, recordVideo: { dir: work, size: { width: 1080, height: 1920 } } });
const page = await ctx.newPage();
await page.addInitScript((d) => { window.TRAILER = d; }, data);
await page.goto(TEMPLATE, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const leadIn = await page.evaluate(() => window.__start());
await page.waitForTimeout((total + 1.0) * 1000);
await ctx.close(); await browser.close();
const webm = (await readdir(work)).find((f) => f.endsWith(".webm"));
if (!webm) die("record", "No video was recorded.");
const mp4 = join(dir, "trailer.mp4");
ff(["-ss", Math.max(0, leadIn - 0.05).toFixed(2), "-i", join(work, webm), "-i", timelineWav, "-map", "0:v", "-map", "1:a", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", mp4], "mux");
await rm(work, { recursive: true, force: true });
ep.files = { ...(ep.files || {}), trailer: "trailer.mp4" };
ep.trailer = { seconds: +total.toFixed(1), coldOpen: coldFile || null, lines: sections.filter((s) => s.type === "quote").map((s) => s.text), generated: new Date().toISOString() };
await writeFile(join(dir, "episode.json"), JSON.stringify(ep, null, 2) + "\n", "utf8");
const bytes = (await stat(mp4)).size;
out({ ok: true, id, file: mp4, seconds: +total.toFixed(1), coldOpen: !!coldFile, lines: ep.trailer.lines.length, message: `Trailer ${total.toFixed(0)}s -> trailer.mp4 (${(bytes / 1048576).toFixed(1)} MB), ${coldFile ? "cold open from " + coldFile : "hook line opens"}, ${ep.trailer.lines.length} lines${plug ? ", plug: " + plug.label : ""}` });
