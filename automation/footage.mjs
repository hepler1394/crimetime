#!/usr/bin/env node
// The footage library. Reels made of typography over stills read as slideshows;
// the ones people stop for are made of the real thing - the press conference
// where the arrest was announced, the courtroom, released body-cam. This holds
// that footage per case, with the provenance attached, so nothing ever gets cut
// into a reel without a recorded source and a rights basis.
//
//   node automation/footage.mjs --list [--case <slug>]
//   node automation/footage.mjs --add <url> --case <slug> [--rights agency] [--note "..."]
//   node automation/footage.mjs --find <sourceId> --q "needle in the haystack"
//   node automation/footage.mjs --clip <sourceId> --in 464 --out 476 \
//        --label "Sacramento County DA, April 25, 2018" [--x 0.5] [--json]
//
// --add fetches metadata and the auto captions only, never the video. --find
// searches those captions so a clip can be located by what was said. --clip is
// the only step that downloads, and it downloads that section alone.
//
// Rights tiers, recorded per source and printed everywhere:
//   agency   an arm of government publishing its own record (a DA's office, a
//            sheriff, a court stream, an FBI release). Cleanest.
//   court    a court's own livestream or released recording.
//   public   other public-record material with a documented release.
//   news     a news organisation's upload. The underlying event may be public
//            record, but their video is theirs. Short excerpts are commentary,
//            not a licence - Cory decides, and the label always names them.
//   owned    Cory's own footage.
// Anything else is refused.

import { readFile, writeFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FOOTAGE = join(__dirname, "studio", "footage");
const YTDLP = ["D:/Dev/GitHub/Glasswing/resources/bin/yt-dlp.exe", "yt-dlp"].find((p) => p === "yt-dlp" || existsSync(p));
const TIERS = ["agency", "court", "public", "news", "owned"];

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const has = (n) => args.includes(n);
const asJson = has("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const run = (cmd, a, label) => {
  const r = spawnSync(cmd, a, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${label}: ${((r.stderr || r.stdout || "").trim()).slice(-400)}`);
  return r.stdout || "";
};
const ff = (a, label) => run("ffmpeg", ["-y", "-v", "error", ...a], label);
const probe = (f) => {
  const j = JSON.parse(run("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", f], "probe"));
  const v = (j.streams || []).find((s) => s.codec_type === "video") || {};
  return { seconds: +(j.format?.duration || 0), width: +v.width || 0, height: +v.height || 0 };
};

const caseDir = (c) => join(FOOTAGE, c);
const bookPath = (c) => join(caseDir(c), "sources.json");
async function readBook(c) {
  try { return JSON.parse(await readFile(bookPath(c), "utf8")); }
  catch { return { case: c, sources: [] }; }
}
const writeBook = async (c, b) => {
  await mkdir(caseDir(c), { recursive: true });
  await writeFile(bookPath(c), JSON.stringify(b, null, 2) + "\n", "utf8");
};

/* ------------------------------------------------------------------ captions */
// yt-dlp writes rolling auto-captions: every cue repeats the previous line as it
// scrolls. Deduping on the text is what makes a caption search readable.
function parseVtt(txt) {
  const cues = [];
  const re = /(\d\d:\d\d:\d\d\.\d\d\d) --> (\d\d:\d\d:\d\d\.\d\d\d).*?\n([\s\S]*?)(?=\n\n|$)/g;
  const sec = (s) => { const [h, m, r] = s.split(":"); return +h * 3600 + +m * 60 + parseFloat(r); };
  let m; const seen = new Set();
  while ((m = re.exec(txt))) {
    const body = m[3].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!body || seen.has(body)) continue;
    seen.add(body);
    cues.push({ t: +sec(m[1]).toFixed(2), end: +sec(m[2]).toFixed(2), text: body });
  }
  return cues;
}

/* ----------------------------------------------------------------------- add */
async function add() {
  const url = opt("--add");
  const c = slug(opt("--case", ""));
  if (!c) die("args", "--case <slug> is required");
  const tier = opt("--rights", "");
  if (!TIERS.includes(tier)) die("rights", `--rights must be one of: ${TIERS.join(", ")}. Nothing goes in the library without one.`);
  const dir = join(caseDir(c), "sources");
  await mkdir(dir, { recursive: true });

  const meta = JSON.parse(run(YTDLP, ["--skip-download", "--no-warnings", "-J", url], "yt-dlp metadata"));
  const id = meta.id;
  say(`  ${meta.channel || meta.uploader} - ${meta.title}`);
  // Captions are the index into an hour of video. Without them --find is blind
  // and the only way to place a clip is to watch the whole thing.
  let cues = [];
  try {
    run(YTDLP, ["--skip-download", "--write-auto-subs", "--write-subs", "--sub-langs", "en.*", "--sub-format", "vtt", "-o", join(dir, "%(id)s.%(ext)s"), url], "yt-dlp captions");
    const f = (await readdir(dir)).filter((n) => n.startsWith(id) && n.endsWith(".vtt")).sort()[0];
    if (f) cues = parseVtt(await readFile(join(dir, f), "utf8"));
  } catch (e) { say(`  no captions (${e.message.slice(0, 60)})`); }
  if (cues.length) await writeFile(join(dir, `${id}.cues.json`), JSON.stringify(cues), "utf8");

  const book = await readBook(c);
  const entry = {
    id, url, title: meta.title, channel: meta.channel || meta.uploader || "", channelUrl: meta.channel_url || "",
    uploaded: meta.upload_date || "", seconds: meta.duration || 0,
    rights: tier, note: opt("--note", ""), captions: cues.length, added: new Date().toISOString(), clips: [],
  };
  const at = book.sources.findIndex((s) => s.id === id);
  if (at > -1) entry.clips = book.sources[at].clips || [];
  if (at > -1) book.sources[at] = entry; else book.sources.push(entry);
  await writeBook(c, book);
  const warn = tier === "news" ? " NOTE: news-organisation upload - their video, not a public-domain record. Label it and keep the excerpt short." : "";
  out({ ok: true, id, captions: cues.length, message: `Added ${id} (${entry.channel}, ${Math.round(entry.seconds / 60)} min, ${cues.length} caption cues, rights: ${tier}).${warn}` });
}

/* ---------------------------------------------------------------------- find */
async function find() {
  const id = opt("--find");
  const q = opt("--q", "").toLowerCase();
  const c = slug(opt("--case", ""));
  if (!c || !q) die("args", "--find <sourceId> --case <slug> --q <phrase>");
  const f = join(caseDir(c), "sources", `${id}.cues.json`);
  if (!existsSync(f)) die("captions", `No captions stored for ${id}. Run --add first.`);
  const cues = JSON.parse(await readFile(f, "utf8"));
  const hits = cues.filter((x) => x.text.toLowerCase().includes(q));
  if (!asJson) {
    if (!hits.length) console.log("  no match");
    for (const h of hits.slice(0, 25)) {
      const mm = String(Math.floor(h.t / 60)).padStart(2, "0"), ss = String(Math.floor(h.t % 60)).padStart(2, "0");
      console.log(`  ${mm}:${ss}  (${h.t}s)  ${h.text}`);
    }
  }
  out({ ok: true, hits: hits.slice(0, 25), message: `${hits.length} match${hits.length === 1 ? "" : "es"}` });
}

/* ---------------------------------------------------------------------- clip */
async function clip() {
  const id = opt("--clip");
  const c = slug(opt("--case", ""));
  const inS = parseFloat(opt("--in", "-1"));
  const outS = parseFloat(opt("--out", "-1"));
  const label = opt("--label", "");
  const xf = Math.max(0, Math.min(1, parseFloat(opt("--x", "0.5")))); // horizontal crop centre, 0 left .. 1 right
  if (!c || !id || inS < 0 || outS <= inS) die("args", "--clip <sourceId> --case <slug> --in <sec> --out <sec>");
  if (!label) die("args", "--label is required: every clip carries its source on screen.");
  const dur = Math.min(30, outS - inS);
  const book = await readBook(c);
  const src = book.sources.find((s) => s.id === id);
  if (!src) die("source", `${id} is not in the ${c} library. Run --add first.`);

  const work = join(caseDir(c), ".work");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const raw = join(work, "raw.mp4");
  // --download-sections pulls the seconds we asked for instead of an hour of
  // press conference; a 12 s cut is a few MB rather than a few hundred.
  const pad = 1.5; // yt-dlp cuts on keyframes, so ask wide and trim exactly after
  run(YTDLP, ["--no-warnings", "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
    "--download-sections", `*${Math.max(0, inS - pad)}-${outS + pad}`, "--force-keyframes-at-cuts",
    "--merge-output-format", "mp4", "-o", raw, src.url], "yt-dlp section");
  const meta = probe(raw);
  const lead = Math.min(pad, inS);

  const clipId = `${id}-${Math.round(inS)}`;
  const clips = join(caseDir(c), "clips");
  await mkdir(clips, { recursive: true });
  const file = join(clips, `${clipId}.mp4`);
  // Vertical is the format, so the frame has to be cropped, not letterboxed - a
  // pillarboxed 16:9 in a reel reads as a repost. Cover-scale, crop to 9:16 at
  // the chosen centre, and hold a very slow push so the shot is never static.
  const vf = [
    `scale=1080:1920:force_original_aspect_ratio=increase`,
    `crop=1080:1920:(iw-1080)*${xf.toFixed(3)}:(ih-1920)/2`,
    `zoompan=z='min(zoom+0.0006,1.10)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30`,
    `setsar=1`,
  ].join(",");
  ff(["-ss", lead.toFixed(2), "-i", raw, "-t", dur.toFixed(2), "-vf", vf, "-an",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", "30", file], "clip video");
  // The clip's own audio is kept beside it: a cold open needs the real voice,
  // and a reel cut under narration does not.
  const wav = join(clips, `${clipId}.wav`);
  ff(["-ss", lead.toFixed(2), "-i", raw, "-t", dur.toFixed(2), "-vn", "-ac", "2", "-ar", "48000", wav], "clip audio");
  await rm(work, { recursive: true, force: true });

  const rec = { id: clipId, file: `clips/${clipId}.mp4`, audio: `clips/${clipId}.wav`, in: inS, out: +(inS + dur).toFixed(2), seconds: +dur.toFixed(2), label, x: xf, source: id, cut: new Date().toISOString() };
  src.clips = (src.clips || []).filter((x) => x.id !== clipId).concat([rec]);
  await writeBook(c, book);
  const bytes = (await stat(file)).size;
  out({ ok: true, ...rec, message: `Clip ${clipId} ${dur.toFixed(1)}s (${(bytes / 1048576).toFixed(1)} MB) from ${meta.width}x${meta.height} - "${label}"` });
}

/* ---------------------------------------------------------------------- list */
async function list() {
  const only = opt("--case", "");
  await mkdir(FOOTAGE, { recursive: true });
  const cases = (await readdir(FOOTAGE, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).filter((n) => !only || n === slug(only));
  const all = [];
  for (const c of cases) {
    const book = await readBook(c);
    all.push({ case: c, sources: book.sources });
    if (asJson) continue;
    console.log(`\n${c}`);
    for (const s of book.sources) {
      console.log(`  [${s.rights}] ${s.channel} - ${s.title}`);
      console.log(`      ${s.url}  ${Math.round(s.seconds / 60)} min, ${s.captions} cues`);
      for (const cl of s.clips || []) console.log(`      clip ${cl.id}  ${cl.seconds}s  "${cl.label}"`);
    }
    if (!book.sources.length) console.log("  (empty)");
  }
  out({ ok: true, cases: all, message: `${all.length} case folder${all.length === 1 ? "" : "s"}` });
}

/* ---------------------------------------------------------------------- main */
try {
  if (!YTDLP) die("yt-dlp", "yt-dlp not found.");
  if (has("--add")) await add();
  else if (has("--find")) await find();
  else if (has("--clip")) await clip();
  else await list();
} catch (e) { die("run", e.message); }
