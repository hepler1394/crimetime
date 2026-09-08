#!/usr/bin/env node
// A vertical promo cut (1080x1920) for Snapchat Stories and Reels, built from
// real footage rather than typography over stills.
//
//   node automation/snap-cut.mjs <cut-id> [--json]
//
// Reads  automation/studio/snapcuts/<cut-id>/cut.json
// Writes automation/studio/snapcuts/<cut-id>/cut.mp4  (H.264, -14 LUFS)
//
// Every "clip" beat points at a clip in the footage library, so it arrives with
// a recorded source and a rights tier attached, and this renders that source
// onto the frame in a black band under the picture. A clip beat without a label
// is refused - the label is what makes an excerpt honest, and a promo is exactly
// where it is most tempting to drop it.
//
// Snapchat is watched full-screen, one-handed, at speed. Cards punch in and
// settle rather than drifting, and every size in snapcut.html is set for a phone
// at arm's length. Check a frame at ~400px wide before believing a layout:
//   ffmpeg -ss <t> -i cut.mp4 -frames:v 1 -vf scale=400:-1 f.png
//
// Needs ffmpeg/ffprobe and Playwright (ig-studio's node_modules).

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CUTS = join(__dirname, "studio", "snapcuts");
const FOOTAGE = join(__dirname, "studio", "footage");
const TEMPLATE = pathToFileURL(join(__dirname, "studio", "templates", "snapcut.html")).href;
const PW = ["D:/Dev/GitHub/ig-studio/node_modules/playwright/index.mjs", join(ROOT, "node_modules", "playwright", "index.mjs")].find((p) => existsSync(p));

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const id = args.find((a) => !a.startsWith("--"));
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };

const W = 1080, H = 1920, FPS = 30;
const CARD_W = 1296, CARD_H = 2304;       // rendered oversize so the punch-in stays sharp
const PIC_H = 1640;                        // picture window; the rest is the source band

const ff = (a, label) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...a], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${label}: ${(r.stderr || "").trim().slice(-600)}`);
};
const probe = (file, entry) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", entry, "-of", "default=nw=1:nk=1", file], { encoding: "utf8", windowsHide: true });
  return (r.stdout || "").trim().split("\n")[0];
};

if (!id) die("args", "usage: snap-cut.mjs <cut-id>");
if (!PW) die("playwright", "Playwright not found (ig-studio node_modules).");

const dir = join(CUTS, id);
let cut;
try { cut = JSON.parse(await readFile(join(dir, "cut.json"), "utf8")); }
catch { die("cut", `No cut.json in ${dir}`); }

const work = join(dir, ".work");
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });

/* ----------------------------------------------------------------- cards */
// One browser, one page, a screenshot per card beat.
const { chromium } = await import(pathToFileURL(PW).href);
const browser = await chromium.launch();
// Two pages, because the two kinds of frame want different pixel densities.
// Cards are rendered oversize and zoomed down, so the punch-in stays sharp.
// Labels are overlaid on the video at native size - render one of those oversize
// and it lands 1.2x too big and slides off the bottom of the frame.
const cardPage = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: CARD_W / W });
const labelPage = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
for (const p of [cardPage, labelPage]) await p.goto(TEMPLATE, { waitUntil: "networkidle" });

const shots = new Map();
async function shoot(name, kind, data) {
  const file = join(work, `${name}.png`);
  const isLabel = kind === "label";
  const page = isLabel ? labelPage : cardPage;
  await page.evaluate(([k, d]) => window.show(k, d), [kind, data]);
  await page.waitForTimeout(260);
  await page.screenshot({ path: file, omitBackground: isLabel });
  shots.set(name, file);
  return file;
}

const asUrl = (p) => (p ? pathToFileURL(p.startsWith("/") ? join(ROOT, p.slice(1)) : join(dir, p)).href : "");

for (const [i, beat] of cut.beats.entries()) {
  if (beat.type === "clip") {
    if (!beat.label?.what || !beat.label?.src) die("label", `Beat ${i + 1} uses footage with no label. Every clip carries its source.`);
    await shoot(`label-${i}`, "label", beat.label);
  } else {
    await shoot(`card-${i}`, beat.type, {
      ...beat,
      shot: asUrl(beat.shot),
      logo: asUrl(beat.logo),
    });
  }
}
await browser.close();
say(`cards rendered (${shots.size})`);

/* --------------------------------------------------------------- segments */
// Each beat becomes a standalone, identically-encoded mp4 so the concat demuxer
// can join them without re-deciding anything.
const ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", String(FPS),
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"];

const segments = [];
for (const [i, beat] of cut.beats.entries()) {
  const dur = Number(beat.seconds);
  if (!(dur > 0)) die("beat", `Beat ${i + 1} has no seconds.`);
  const seg = join(work, `seg-${String(i).padStart(2, "0")}.mp4`);
  const frames = Math.max(2, Math.round(dur * FPS));

  if (beat.type === "clip") {
    const src = join(FOOTAGE, cut.case, "clips", `${beat.clip}.mp4`);
    if (!existsSync(src)) die("clip", `No clip ${beat.clip} for ${cut.case}. Cut it with footage.mjs first.`);
    // footage.mjs keeps a clip's sound beside it as a wav; the mp4 is picture only.
    const wav = join(FOOTAGE, cut.case, "clips", `${beat.clip}.wav`);
    if (!existsSync(wav)) die("clip", `No audio for ${beat.clip} (expected ${beat.clip}.wav).`);
    // Crop the broadcaster's lower third off the bottom, sit the picture in a
    // 1640px window, and put the source band underneath it.
    const vf = `[0:v]crop=iw:ih*0.855:0:0,scale=${W}:${PIC_H}:flags=lanczos,setsar=1,`
      + `pad=${W}:${H}:0:0:color=0x050505[base];[base][2:v]overlay=0:0[v];`
      + `[1:a]loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.12,afade=t=out:st=${(dur - 0.25).toFixed(2)}:d=0.25[a]`;
    ff(["-ss", String(beat.in || 0), "-t", String(dur), "-i", src,
      "-ss", String(beat.in || 0), "-t", String(dur), "-i", wav,
      "-i", shots.get(`label-${i}`),
      "-filter_complex", vf, "-map", "[v]", "-map", "[a]",
      "-t", String(dur), ...ENC, seg], `clip ${beat.clip}`);
  } else {
    // Punch in and settle: z runs 1.10 -> 1.00 across the beat.
    const zoom = `zoompan=z='max(1.0,1.10-0.10*on/${frames - 1})':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${W}x${H}:fps=${FPS}`;
    const vArgs = ["-loop", "1", "-framerate", String(FPS), "-t", String(dur), "-i", shots.get(`card-${i}`)];
    if (beat.voice) {
      const vo = join(dir, beat.voice);
      if (!existsSync(vo)) die("voice", `No voice file ${beat.voice}`);
      ff([...vArgs, "-i", vo,
        "-filter_complex", `[0:v]${zoom},format=yuv420p[v];[1:a]loudnorm=I=-15:TP=-1.5:LRA=9,adelay=${Math.round((beat.voiceAt ?? 0.35) * 1000)}|${Math.round((beat.voiceAt ?? 0.35) * 1000)},apad[a]`,
        "-map", "[v]", "-map", "[a]", "-t", String(dur), ...ENC, seg], `card ${i} + voice`);
    } else {
      ff([...vArgs, "-f", "lavfi", "-t", String(dur), "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-filter_complex", `[0:v]${zoom},format=yuv420p[v]`,
        "-map", "[v]", "-map", "1:a", "-t", String(dur), ...ENC, seg], `card ${i}`);
    }
  }
  segments.push(seg);
  say(`  beat ${i + 1}/${cut.beats.length} (${beat.type}, ${dur}s)`);
}

/* ----------------------------------------------------------------- joined */
const list = join(work, "segments.txt");
await writeFile(list, segments.map((s) => `file '${s.replace(/\\/g, "/")}'`).join("\n"), "utf8");
const joined = join(work, "joined.mp4");
ff(["-f", "concat", "-safe", "0", "-i", list, "-c", "copy", joined], "concat");

// A bed under the whole cut. The card beats carry no sound of their own, and a
// silent open and a silent end card are where a Story gets swiped past - it is
// watched with sound on. Built from ffmpeg expressions in the same shape as the
// show's theme (episode-music.mjs), so there is no sample to license and nothing
// for a platform's content matcher to recognise.
const total = Number(probe(joined, "format=duration"));
const withBed = join(work, "bedded.mp4");
if (cut.music === false) {
  ff(["-i", joined, "-c", "copy", withBed], "no bed");
} else {
  const drone = `0.16*sin(2*PI*55*t)*(0.8+0.2*sin(2*PI*0.5*t))+0.06*sin(2*PI*110.3*t)+0.05*sin(2*PI*82.4*t)*sin(2*PI*0.25*t)`;
  const pulse = `0.42*sin(2*PI*52*t*exp(-9*mod(t,1.6)))*exp(-6*mod(t,1.6))`;
  ff(["-i", joined,
    "-f", "lavfi", "-i", `aevalsrc=exprs='${drone}':s=48000:d=${total}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='${pulse}':s=48000:d=${total}`,
    "-f", "lavfi", "-i", `anoisesrc=color=brown:amplitude=0.05:d=${total}:seed=7:r=48000`,
    "-filter_complex",
    // Mix the bed, then duck it against the programme audio so speech always wins.
    `[1:a][2:a][3:a]amix=inputs=3:normalize=0,alimiter=limit=0.7,`
    + `afade=t=in:st=0:d=0.6,afade=t=out:st=${(total - 1.4).toFixed(2)}:d=1.4,`
    + `aformat=channel_layouts=stereo:sample_rates=48000[bed];`
    + `[0:a]aformat=channel_layouts=stereo:sample_rates=48000,asplit=2[prog][key];`
    + `[bed][key]sidechaincompress=threshold=0.02:ratio=12:attack=15:release=400[duck];`
    + `[prog][duck]amix=inputs=2:normalize=0:duration=first[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", withBed], "bed");
}

// One loudness pass over the finished mix. -14 LUFS is what the platforms
// expect; raw output lands near -19 and plays quiet next to everything else.
const final = join(dir, "cut.mp4");
ff(["-i", withBed, "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", final], "master");

const seconds = Number(probe(final, "format=duration"));
const bytes = Number(probe(final, "format=size"));
out({
  ok: true, id, file: final,
  seconds: Number(seconds.toFixed(2)),
  mb: Number((bytes / 1048576).toFixed(1)),
  message: `cut.mp4 ${seconds.toFixed(1)}s, ${(bytes / 1048576).toFixed(1)} MB -> ${final}`,
});
