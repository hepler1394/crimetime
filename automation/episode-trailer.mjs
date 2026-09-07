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
let bgs = names.filter((n) => /^(art-.*|saved-.*|test-art.*|bg-.*)\.(jpe?g|png)$/i.test(n));
// Fewer than two photos in the folder: generate scene stills from the episode
// (Gemini Flash Image, cents each) so every quote gets its own frame.
if (bgs.length < 2 && process.env.GEMINI_API_KEY) {
  const scenes = (ep.chapters || []).slice(1, 4).map((c) => c.title).filter(Boolean);
  const prompts = scenes.length ? scenes : [ep.hook || ep.title];
  for (const [k, sc] of prompts.slice(0, 3 - bgs.length).entries()) {
    const name = `bg-${k + 1}`;
    const r = spawnSync(process.execPath, [join(__dirname, "gen-image.mjs"), "--draft", id, "--name", name, "--prompt", `Scene still for a true crime episode about ${ep.caseTitle || ep.title}: ${sc}. Empty location, period-accurate, night or overcast, no people, no text.`, "--json"], { encoding: "utf8", windowsHide: true });
    const last = (r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"));
    try { const j = JSON.parse(last || "{}"); if (j.ok) { bgs.push(j.file.split(/[\\/]/).pop()); say(`  generated ${j.file.split(/[\\/]/).pop()}`); } else say(`  background skipped: ${j.message || ""}`); } catch { /* skip */ }
  }
}
const bgUrl = (n) => pathToFileURL(join(dir, n)).href;

/* --------------------------------------------------- footage for this case */
// Typography over a still photograph is a slideshow. What people stop for is
// the real thing - the press conference where the arrest was announced, the
// courtroom, released body-cam. automation/footage.mjs keeps those clips per
// case with their source and rights basis; if the case has any, the quote
// sections are cut over footage instead of stills and each one names its
// source on screen.
const FOOTAGE = join(__dirname, "studio", "footage");
const caseSlug = ep.caseSlug || id.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/^the-/, "");
let clips = [];
for (const c of [ep.caseSlug, caseSlug, id.replace(/^\d{4}-\d{2}-\d{2}-/, "")].filter(Boolean)) {
  const book = join(FOOTAGE, c, "sources.json");
  if (!existsSync(book)) continue;
  const b = JSON.parse(await readFile(book, "utf8"));
  clips = (b.sources || []).flatMap((src) => (src.clips || []).map((cl) => ({ ...cl, rights: src.rights, channel: src.channel, file: join(FOOTAGE, c, cl.file.replace(/\//g, "\\")) })))
    .filter((cl) => existsSync(cl.file));
  if (clips.length) { say(`  footage: ${clips.length} clip${clips.length === 1 ? "" : "s"} from ${c}`); break; }
}
const useFootage = clips.length > 0 && !args.includes("--no-footage");

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

/* ------------------------------------------------------- spelling of names */
// The captions come from a transcription of the cloned voice, and a transcriber
// spells names by ear: this episode's script says DeAngelo 65 times and the
// transcript came back with DiAngelo and D'Angelo. On screen that is a misspelt
// name on the face of a published reel. The script is the authority, so a
// near-miss proper noun in a caption is corrected back to the script's spelling.
const scriptText = JSON.stringify(ep);
const PROPER = /\b[A-Z][a-zA-Z\u2019\x27]{2,}\b/g;
const properNouns = [...new Set(scriptText.match(PROPER) || [])].filter((w) => scriptText.split(w).length - 1 >= 3);
const editDistance = (a, b) => {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
};
const fixNames = (text) => text.replace(PROPER, (w) => {
  if (properNouns.includes(w)) return w;
  const near = properNouns.find((n) => n.length >= 5 && Math.abs(n.length - w.length) <= 2 && editDistance(n.toLowerCase(), w.toLowerCase()) <= 2);
  if (near) say(`  spelling: ${w} -> ${near}`);
  return near || w;
});

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
  // -ss before -i and asetpts: the fades must count from the cut's own zero, not
  // the episode's timeline, or the fade-out fires before the clip starts and the
  // whole cut is silence.
  ff(["-ss", String(Math.max(0, h.start - 0.15)), "-i", audio, "-t", String(h.dur + 0.4), "-af", "asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.15,afade=t=out:st=" + (h.dur + 0.05) + ":d=0.35", "-ac", "2", "-ar", "48000", f], "hook cut");
  parts.push({ file: f, type: "quote", text: h.text, cold: true });
}
// Title slam: the theme's first 3 seconds.
const slam = join(work, "slam.wav");
ff(["-i", beds.intro, "-t", "3.2", "-af", "afade=t=out:st=2.4:d=0.8", "-ac", "2", "-ar", "48000", slam], "slam");
parts.push({ file: slam, type: "title" });
for (const [k, p] of picks.entries()) {
  const f = join(work, `q${k}.wav`);
  ff(["-ss", String(Math.max(0, p.start - 0.12)), "-i", audio, "-t", String(p.dur + 0.45), "-af", `asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.12,afade=t=out:st=${p.dur + 0.1}:d=0.35`, "-ac", "2", "-ar", "48000", f], `quote ${k}`);
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
    p.text = fixNames(p.text);
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
// Which quote is this, counting only the quotes - the title card and the end
// card sit in the same array and would otherwise skip clips.
const quoteIndex = (arr, k) => arr.slice(0, k).filter((x) => x.type === "quote").length;
const data = {
  title: ep.title, logo: LOGO, plug: plug ? plug.label : "",
  sections: sections.map((s, k) => {
    const isQuote = s.type === "quote" && !s.cold;
    // Clips are handed out in order so the strongest footage lands on the first
    // quote, which is the one most people see before they scroll.
    // The opening line gets footage too. It used to open over black, which was
    // right when the alternative was a stock still; it is not when there is real
    // footage, because the first two seconds decide whether anyone stays.
    const shot = (isQuote || s.cold) && useFootage ? clips[quoteIndex(sections, k) % clips.length] : null;
    if (shot) s.shot = shot;
    return { type: s.cold ? "quote" : s.type, start: +s.start.toFixed(2), dur: +(s.dur + (k === sections.length - 1 ? 1 : GAP)).toFixed(2), label: s.label, sub: s.sub, words: s.words, who: s.cold ? "The case" : "From the episode",
      footage: !!shot, credit: shot ? shot.label : "",
      bg: shot ? "" : (isQuote ? (bgs.length ? bgUrl(bgs[k % bgs.length]) : "") : "") };
  }),
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
const overlayWebm = join(work, webm);
const ss = Math.max(0, leadIn - 0.05).toFixed(2);
const shots = sections.filter((x) => x.shot);
if (shots.length) {
  // Two passes. First the footage track: the clips laid on black at the times
  // their quotes land. Then the recorded page is screen-blended over it - the
  // design is white and red type on black, and screen leaves black untouched,
  // so the type sits on the footage with no keying and no quality loss.
  const scrim = join(work, "scrim.png");
  // The bottom third has to go dark or white type over a sunlit press
  // conference is unreadable. The page cannot draw this: a dark gradient
  // screen-blends to nothing.
  ff(["-f", "lavfi", "-i", "color=black:s=1080x1920", "-vf", "format=rgba,geq=r=0:g=0:b=0:a='clip((Y-780)/560*255*0.96,0,255)'", "-frames:v", "1", scrim], "scrim");
  const vin = ["-f", "lavfi", "-i", `color=black:s=1080x1920:r=30:d=${total.toFixed(2)}`];
  const fc = []; let lastL = "[0:v]";
  shots.forEach((x, i) => {
    vin.push("-i", x.shot.file);
    // Run the clip through the gap only when the next section is more footage.
    // Letting it run into the title slam or the end card puts a press conference
    // behind "New episode. Link in bio.", which reads as a mistake.
    const next = sections[sections.indexOf(x) + 1];
    const d = (next && next.shot ? x.dur + GAP : x.dur);
    // tpad holds the last frame if a quote outlasts its clip; without it the
    // section would cut to black mid-sentence.
    fc.push(`[${i + 1}:v]scale=1080:1920,setsar=1,fps=30,eq=brightness=-0.11:contrast=1.12:saturation=0.34,tpad=stop_mode=clone:stop_duration=${(d + 2).toFixed(2)},trim=0:${d.toFixed(2)},setpts=PTS-STARTPTS+${x.start.toFixed(2)}/TB[s${i}]`);
    fc.push(`${lastL}[s${i}]overlay=0:0:enable='between(t,${x.start.toFixed(2)},${(x.start + d).toFixed(2)})'[b${i}]`);
    lastL = `[b${i}]`;
  });
  vin.push("-framerate", "30", "-loop", "1", "-i", scrim);
  fc.push(`${lastL}[${shots.length + 1}:v]overlay=0:0:shortest=1[fv]`);
  const track = join(work, "footage.mp4");
  ff([...vin, "-filter_complex", fc.join(";"), "-map", "[fv]", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", track], "footage track");
  ff(["-i", track, "-ss", ss, "-i", overlayWebm, "-i", timelineWav,
    // blend has to happen in RGB. Screen-blending YUV blends the chroma planes
    // too, which drags U and V toward 255 and turns the whole reel magenta.
    "-filter_complex", "[0:v]format=gbrp[bg];[1:v]fps=30,scale=1080:1920,setsar=1,format=gbrp[ov];[bg][ov]blend=all_mode=screen,format=yuv420p[v]",
    "-map", "[v]", "-map", "2:a", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", mp4], "mux over footage");
} else {
  ff(["-ss", ss, "-i", overlayWebm, "-i", timelineWav, "-map", "0:v", "-map", "1:a", "-t", total.toFixed(2), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", mp4], "mux");
}
await rm(work, { recursive: true, force: true });
ep.files = { ...(ep.files || {}), trailer: "trailer.mp4" };
ep.trailer = { seconds: +total.toFixed(1), coldOpen: coldFile || null, lines: sections.filter((s) => s.type === "quote").map((s) => s.text), footage: shots.map((x) => ({ clip: x.shot.id, label: x.shot.label, rights: x.shot.rights, channel: x.shot.channel })), generated: new Date().toISOString() };
await writeFile(join(dir, "episode.json"), JSON.stringify(ep, null, 2) + "\n", "utf8");
const bytes = (await stat(mp4)).size;
out({ ok: true, id, file: mp4, seconds: +total.toFixed(1), coldOpen: !!coldFile, lines: ep.trailer.lines.length, footage: shots.length, message: `Trailer ${total.toFixed(0)}s -> trailer.mp4 (${(bytes / 1048576).toFixed(1)} MB), ${coldFile ? "cold open from " + coldFile : "hook line opens"}, ${ep.trailer.lines.length} lines, ${shots.length ? shots.length + " over real footage" : "stills"}${plug ? ", plug: " + plug.label : ""}` });
