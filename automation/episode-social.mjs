#!/usr/bin/env node
// Podcast studio, step 4: the Instagram kit for an episode.
//
//   node automation/episode-social.mjs <draft-id> [--clip 45] [--start 0]
//
// Produces in the draft folder:
//   reel.mp4     1080x1920 audiogram: the reel still + a live red waveform of the
//                first --clip seconds of the episode (default 45s), audio at -14 LUFS
//                (Instagram's level). No third-party music, so nothing gets muted.
//   caption.txt  the caption from the script step plus the standard footer.
// card.jpg (from episode-art) is the feed post. Post order: reel first, card second.

import { readFile, writeFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(__dirname, "studio", "drafts");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };

if (!id) die("args", "usage: episode-social.mjs <draft-id> [--clip 45] [--start 0]");
const dir = join(DRAFTS, id);
let ep;
try { ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8")); } catch { die("draft", `No draft ${id}`); }
const audio = join(dir, "episode.mp3"), still = join(dir, "reel.jpg");
for (const [f, step] of [[audio, "voice"], [still, "art"]]) { try { await stat(f); } catch { die(step, `Missing ${f}. Run the ${step} step first.`); } }

const clip = Math.max(10, Math.min(90, parseFloat(opt("--clip", "45")) || 45));
const start = Math.max(0, parseFloat(opt("--start", "0")) || 0);
const reel = join(dir, "reel.mp4");

// Waveform band sits where the template reserved it (top 70%, height 16% of 1920).
const filter = [
  `[1:a]atrim=start=${start}:duration=${clip},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, clip - 1.2)}:d=1.2[a]`,
  `[a]asplit[a1][a2]`,
  `[a1]showwaves=s=1080x307:mode=cline:rate=30:colors=#e50914|#ff2b33:scale=sqrt:draw=full[w]`,
  `[0:v]scale=1080:1920,format=rgba[bg]`,
  `[bg][w]overlay=0:1344:shortest=1,format=yuv420p[v]`,
  `[a2]loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
].join(";");
const r = spawnSync("ffmpeg", ["-y", "-loop", "1", "-framerate", "30", "-i", still, "-i", audio, "-filter_complex", filter, "-map", "[v]", "-map", "[aout]",
  "-t", String(clip), "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", reel], { encoding: "utf8", windowsHide: true });
if (r.status !== 0) die("ffmpeg", (r.stderr || "").trim().slice(-800));

const caption = [
  (ep.instagramCaption || `${ep.title}.\n\n${ep.hook || ""}`).trim(),
  "",
  `Full episode: crimetime.vercel.app/episodes/${ep.slug}.html`,
  "Also on Spotify and Apple Podcasts.",
].join("\n");
await writeFile(join(dir, "caption.txt"), caption + "\n", "utf8");

ep.files = { ...(ep.files || {}), reel: "reel.mp4", caption: "caption.txt" };
ep.social = { clipSeconds: clip, clipStart: start, generated: new Date().toISOString() };
if (ep.status === "designed") ep.status = "ready";
await writeFile(join(dir, "episode.json"), JSON.stringify(ep, null, 2) + "\n", "utf8");
const bytes = (await stat(reel)).size;
out({ ok: true, id, reel, bytes, message: `Reel ${clip}s -> reel.mp4 (${(bytes / 1048576).toFixed(1)} MB), caption.txt written` });
