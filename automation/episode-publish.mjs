#!/usr/bin/env node
// Podcast studio, step 5: publish an episode to the site and its RSS feed.
//
//   node automation/episode-publish.mjs <draft-id>            copy files, register, rebuild, commit
//   node automation/episode-publish.mjs <draft-id> --push     ...and push (Vercel deploys; feed.xml updates)
//   node automation/episode-publish.mjs <draft-id> --date 2026-09-08
//
// What "publish" means here: the MP3 goes to /audio, the art to /images/episodes,
// the transcript to automation/transcripts, and the episode is appended to
// automation/studio-episodes.json. That file is merged into episodes.json by
// import-feed.mjs on every sync, so the episode survives the 6-hourly CI feed
// refresh. build-all then regenerates episodes.html, the episode page, feed.xml,
// search, sitemap and status.
//
// Spotify/Apple: they poll the Anchor feed, not this site's feed.xml. Until the
// show is re-pointed at https://crimetime.vercel.app/feed.xml, upload the same
// MP3 + show notes in Spotify for Podcasters (the studio prints them ready).

import { readFile, writeFile, copyFile, mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadStudioEpisodes, mergeEpisodes, STUDIO_EPISODES } from "./episodes-merge.mjs";
import { logImprovement } from "./ledger.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRAFTS = join(__dirname, "studio", "drafts");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const push = args.includes("--push");
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const sh = (cmd, a, label) => {
  const r = spawnSync(cmd, a, { cwd: ROOT, encoding: "utf8", windowsHide: true });
  if (!asJson) process.stdout.write((r.stdout || "") + (r.stderr || ""));
  if (r.status !== 0) throw new Error(`${label || cmd} failed (${r.status}): ${(r.stderr || r.stdout || "").trim().slice(-400)}`);
  return r.stdout || "";
};

if (!id) die("args", "usage: episode-publish.mjs <draft-id> [--push] [--date YYYY-MM-DD]");
const dir = join(DRAFTS, id);
const epPath = join(dir, "episode.json");
let ep;
try { ep = JSON.parse(await readFile(epPath, "utf8")); } catch { die("draft", `No draft ${id}`); }
if (ep.status === "published") die("state", `${id} is already published (${ep.publishedAt}).`);
for (const f of ["episode.mp3", "cover.jpg"]) { try { await stat(join(dir, f)); } catch { die("files", `Missing ${f}. Finish the voice and art steps first.`); } }
if (!ep.title || !ep.description) die("meta", "Title and show notes are required before publishing.");

const date = opt("--date", new Date().toISOString().slice(0, 10));
const slug = ep.slug;
const audioRel = `/audio/${slug}.mp3`, imageRel = `/images/episodes/${slug}.jpg`;
await mkdir(join(ROOT, "images", "episodes"), { recursive: true });
await mkdir(join(__dirname, "transcripts"), { recursive: true });
await copyFile(join(dir, "episode.mp3"), join(ROOT, audioRel));
await copyFile(join(dir, "cover.jpg"), join(ROOT, imageRel));
let hasTranscript = false;
try { await copyFile(join(dir, "transcript.json"), join(__dirname, "transcripts", `${slug}.json`)); hasTranscript = true; } catch { /* recorded, not synthesized */ }
const bytes = (await stat(join(ROOT, audioRel))).size;

const entry = {
  guid: `cts-studio-${slug}`,
  title: ep.title,
  slug,
  date,
  pubDate: new Date(`${date}T13:00:00Z`).toUTCString(),
  duration: ep.duration || "",
  description: ep.description,
  audio: audioRel,
  audioType: "audio/mpeg",
  audioBytes: bytes,
  image: imageRel,
  link: "",
  explicit: false,
  source: "studio",
  keywords: ep.keywords || [],
};

// Register in the studio list (source of truth for studio episodes).
const studio = await loadStudioEpisodes();
const idx = studio.findIndex((e) => e.slug === slug);
if (idx > -1) studio[idx] = entry; else studio.push(entry);
await writeFile(STUDIO_EPISODES, JSON.stringify({ _README: "Episodes published from the podcast studio. Merged into episodes.json by import-feed.mjs so the Anchor feed sync never erases them. Edit here, then run build-all.", episodes: studio }, null, 2) + "\n", "utf8");

// Merge into the live episodes.json right now (do not wait for the next feed sync).
const epsPath = join(__dirname, "episodes.json");
const eps = JSON.parse(await readFile(epsPath, "utf8"));
eps.episodes = mergeEpisodes((eps.episodes || []).filter((e) => e.source !== "studio"), studio);
await writeFile(epsPath, JSON.stringify(eps, null, 2) + "\n", "utf8");

try {
  sh(process.execPath, [join(__dirname, "build-all.mjs")], "build-all");
  sh(process.execPath, [join(__dirname, "check-links.mjs")], "check-links");
} catch (e) { die("build", e.message); }

await logImprovement(`Published podcast episode from the studio: "${ep.title}" (${ep.duration || "?"})`);

ep.status = "published";
ep.publishedAt = new Date().toISOString();
ep.publishDate = date;
ep.pageUrl = `https://crimetime.vercel.app/episodes/${slug}.html`;
await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");

let pushed = false, gitNote = "";
try {
  sh("git", ["add", "-A"], "git add");
  sh("git", ["commit", "-m", `Episode: ${ep.title}`], "git commit");
  if (push) {
    sh("git", ["pull", "--rebase", "--autostash"], "git pull --rebase");
    sh("git", ["push"], "git push");
    pushed = true;
  } else gitNote = "Committed locally. Run `git push` (or publish with --push) to deploy.";
} catch (e) { gitNote = `Site built and files in place, but git step failed: ${e.message}`; }

out({
  ok: true, id, slug, pushed, page: ep.pageUrl, audio: audioRel, bytes, transcript: hasTranscript, note: gitNote,
  spotifyUpload: { title: ep.title, description: ep.description, file: join(ROOT, audioRel), art: join(ROOT, imageRel) },
  message: `Published "${ep.title}" -> ${ep.pageUrl}${pushed ? " (pushed, Vercel deploying)" : ""}${gitNote ? `\n${gitNote}` : ""}`,
});
