#!/usr/bin/env node
// Podcast studio: the YouTube version of an episode. 1920x1080, the cover and title on a
// branded card, the words burned in as captions, the chapter name on screen, a waveform, and
// a text file with the title, description, chapter timestamps and tags ready to paste.
//
//   node automation/episode-video.mjs <draft-id> [--seconds 60] [--json]
//
// --seconds renders only the first N seconds, for checking the look without a full encode.
// Output in the draft folder: youtube.mp4, youtube.txt, youtube-thumb.jpg (1280x720).
//
// No generated imagery: the card is the episode's own cover (Cory's) on the site's colours.
// The picture is one still, so the encode is cheap: ffmpeg holds the card, draws the waveform
// and burns the captions; nothing is rendered frame by frame in a browser.
// Chapter times are exact: paragraphs in voice.wav are separated by 0.55 s of digital silence
// (episode-voice.mjs joinParts), so their starts can be read back out of the audio.

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { VOICE_STARTS_AT } from "./episode-music.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const STUDIO = join(here, "studio");
const PW = ["D:/Dev/GitHub/ig-studio/node_modules/playwright/index.mjs", join(ROOT, "node_modules", "playwright", "index.mjs")].find((p) => existsSync(p));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id) die("args", "usage: episode-video.mjs <draft-id> [--seconds N]");
if (!PW) die("playwright", "Playwright is not installed (needed once, to draw the title card).");

// A studio draft, or the slug of an episode that predates the studio: those have no draft, but
// the site holds their audio, cover and transcript, which is everything but chapter marks.
let dir = join(STUDIO, "drafts", id), ep, AUDIO, COVER, TRANSCRIPT, VOICE = null;
if (existsSync(join(dir, "episode.json"))) {
  ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8"));
  for (const f of ["episode.mp3", "voice.wav", "cover.jpg", "transcript.json"]) if (!existsSync(join(dir, f))) die("files", `${id} is missing ${f}.`);
  AUDIO = join(dir, "episode.mp3"); COVER = join(dir, "cover.jpg"); TRANSCRIPT = join(dir, "transcript.json"); VOICE = join(dir, "voice.wav");
} else {
  const all = JSON.parse(await readFile(join(here, "episodes.json"), "utf8")).episodes || [];
  const e = all.find((x) => x.slug === id); if (!e) die("draft", `No draft and no published episode called ${id}.`);
  ep = { ...e, chapters: [], script: [] };
  AUDIO = join(ROOT, e.audio.replace(/^\//, "")); COVER = join(ROOT, e.image.replace(/^\//, "")); TRANSCRIPT = join(here, "transcripts", `${e.slug}.json`);
  for (const f of [AUDIO, COVER, TRANSCRIPT]) if (!existsSync(f)) die("files", `${id} is missing ${f}.`);
  dir = join(STUDIO, "youtube", e.slug); await mkdir(dir, { recursive: true });
}
const limit = parseFloat(opt("--seconds", "0")) || 0;
const work = join(dir, "video"); await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true });
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const run = (cmd, a, label) => { const r = spawnSync(cmd, a, { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, cwd: work }); if (r.status !== 0) die(label, `${label}: ${(r.stderr || "").trim().slice(-500)}`); return r; };

/* 1. the card, drawn once */
const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0}html,body{width:1920px;height:1080px;overflow:hidden;background:#050505;color:#f5f5f5;font-family:Inter,sans-serif}
.bg{position:absolute;inset:0;background:radial-gradient(1500px 900px at 20% 0%,rgba(229,9,20,.24),transparent 60%),#050505}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.03) 1px,transparent 1px);background-size:96px 96px;-webkit-mask-image:linear-gradient(180deg,#000,transparent 75%)}
.cover{position:absolute;left:110px;top:150px;width:640px;height:640px;border-radius:36px;overflow:hidden;border:2px solid rgba(255,255,255,.14);box-shadow:0 40px 110px rgba(0,0,0,.85)}
.cover img{width:100%;height:100%;object-fit:cover;display:block}
.mark{position:absolute;left:850px;top:150px;font-family:'Bebas Neue';font-size:64px;letter-spacing:.03em}.mark b{color:#e50914;font-weight:400}
.sub{position:absolute;left:852px;top:226px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;font-size:22px;color:#b9b9c0}
h1{position:absolute;left:850px;top:300px;width:960px;font-family:'Bebas Neue';font-weight:400;font-size:${ep.title.length > 34 ? 104 : 124}px;line-height:.95;letter-spacing:.015em}
.url{position:absolute;left:110px;top:830px;width:640px;text-align:center;font-weight:800;font-size:30px;color:#f5f5f5}
.tape{position:absolute;left:-60px;top:54px;width:2040px;height:52px;background:#f4c20d;color:#0a0a0a;font-weight:800;font-size:22px;letter-spacing:.14em;display:flex;align-items:center;white-space:nowrap;transform:rotate(-1.2deg);border-top:4px solid #0a0a0a;border-bottom:4px solid #0a0a0a;overflow:hidden}
.tape span{padding-left:20px}</style></head><body><div class="bg"></div><div class="grid"></div>
<div class="tape"><span>${"CRIME SCENE &bull; DO NOT CROSS &bull; ".repeat(9)}</span></div>
<div class="cover"><img src="${pathToFileURL(COVER).href}"></div>
<div class="mark">CRIME<b>TIME</b>SNACKS</div><div class="sub">A true crime podcast</div>
<h1>${esc(ep.title)}</h1><div class="url">crimetimesnacks.com</div></body></html>`;
await writeFile(join(work, "card.html"), html, "utf8");
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(join(work, "card.html")).href); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(600);
await page.screenshot({ path: join(work, "card.png") });
await page.setViewportSize({ width: 1280, height: 720 });
await page.evaluate(() => { document.body.style.zoom = String(1280 / 1920); });
await page.screenshot({ path: join(dir, "youtube-thumb.jpg"), type: "jpeg", quality: 90 });
await browser.close();

/* 2. chapter times, read back from the dry voice */
const det = !VOICE ? { stderr: "" } : spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", VOICE, "-af", "silencedetect=noise=-70dB:d=0.45", "-f", "null", "-"], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
const ends = [...det.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
const paras = (ep.script || []).filter(Boolean);
const exact = Boolean(VOICE) && ends.length === paras.length - 1;
const paraStart = (i) => (i === 0 ? 0 : ends[i - 1]) + VOICE_STARTS_AT;
const total = parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", AUDIO], { encoding: "utf8", windowsHide: true }).stdout);
const chapters = (ep.chapters || []).map((c, n) => ({ title: c.title, at: n === 0 ? 0 : exact ? paraStart(c.start) : (total * c.start) / paras.length }));

/* 3. captions and chapter labels as one ASS file */
const ts = (t) => { const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60); return `${h}:${String(m).padStart(2, "0")}:${s.toFixed(2).padStart(5, "0")}`; };
const clean = (s) => String(s).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
const segs = JSON.parse(await readFile(TRANSCRIPT, "utf8")).segments || [];
const lines = [];
for (const s of segs) lines.push(`Dialogue: 0,${ts(s.start)},${ts(Math.max(s.end, s.start + 0.6))},Cap,,0,0,0,,${clean(s.text)}`);
chapters.forEach((c, n) => { const end = n + 1 < chapters.length ? chapters[n + 1].at : total; lines.push(`Dialogue: 1,${ts(c.at)},${ts(end)},Chap,,0,0,0,,${clean(`${String(n + 1).padStart(2, "0")}  ${c.title}`).toUpperCase()}`); });
const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Arial,46,&H00F5F5F5,&H000000FF,&H00050505,&H96000000,1,0,0,0,100,100,0,0,1,2,0,7,852,110,0,1
Style: Chap,Arial,28,&H000DC2F4,&H000000FF,&H00050505,&H00000000,1,0,0,0,100,100,4,0,1,0,0,7,852,110,0,1

[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n` +
  lines.map((l) => l.replace(",Cap,,0,0,0,,", ",Cap,,0,0,665,,").replace(",Chap,,0,0,0,,", ",Chap,,0,0,612,,")).join("\n") + "\n";
await writeFile(join(work, "captions.ass"), ass, "utf8");

/* 4. one still, a waveform, the captions */
say(`Encoding ${limit ? `${limit} s of ` : ""}the video...`);
const outFile = join(dir, limit ? "youtube-sample.mp4" : "youtube.mp4");
run("ffmpeg", ["-y", "-v", "error", "-loop", "1", "-framerate", "15", "-i", "card.png", "-i", AUDIO,
  "-filter_complex", "[1:a]showwaves=s=960x110:mode=cline:rate=15:scale=sqrt:draw=full:colors=#ff2b33,format=rgba[w];[0:v][w]overlay=850:900:shortest=1,subtitles=captions.ass[v]",
  "-map", "[v]", "-map", "1:a", ...(limit ? ["-t", String(limit)] : []), "-r", "15", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "21", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", outFile], "ffmpeg video");

/* 5. what to paste into YouTube */
const stamp = (t) => { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; };
const txt = [`TITLE\n${ep.title} | CrimeTimeSnacks`, "",
  `DESCRIPTION\n${ep.description}\n\nListen free: https://www.crimetimesnacks.com/episodes/${ep.slug}.html\nApple Podcasts and Spotify: search CrimeTimeSnacks\nInstagram: https://www.instagram.com/crimetimesnacks/${chapters.length ? `\n\nCHAPTERS\n${chapters.map((c) => `${stamp(c.at)} ${c.title}`).join("\n")}` : ""}\n\n${VOICE ? "Every claim in this episode was checked against its research notes before it was published. " : ""}Presumption of innocence applies to anyone not convicted.`, "",
  `TAGS\n${[...(ep.keywords || []), "true crime", "true crime podcast", "CrimeTimeSnacks"].join(", ")}`, "",
  `SETTINGS\nNot made for kids. Category: Entertainment or News. Thumbnail: youtube-thumb.jpg. Add it to a playlist named "Full Episodes" so the site can tell episodes from Shorts.`, ""].join("\n");
if (!limit) await writeFile(join(dir, "youtube.txt"), txt, "utf8");
await rm(work, { recursive: true, force: true });
out({ ok: true, id, file: outFile, chapters: chapters.length, exactChapters: exact, message: `${limit ? "Sample" : "YouTube video"} for ${id}: ${outFile}${exact || !chapters.length ? "" : " (chapter times estimated: paragraph gaps did not match the script)"}` });
