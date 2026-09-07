#!/usr/bin/env node
// Podcast studio, step 5: publish an episode to the site and its RSS feed.
//
//   node automation/episode-publish.mjs <draft-id>            copy files, register, rebuild, commit locally
//   node automation/episode-publish.mjs <draft-id> --push     ...and push (Vercel deploys; feed.xml updates)
//   node automation/episode-publish.mjs <draft-id> --date 2026-09-08
//   node automation/episode-publish.mjs <draft-id> --push-only   retry the push for an episode already built
//
// What "publish" means here: the MP3 goes to /audio, the art to /images/episodes,
// the transcript to automation/transcripts, and the episode is appended to
// automation/studio-episodes.json. That file is merged into episodes.json by
// import-feed.mjs on every sync, so the episode survives the 6-hourly CI feed
// refresh. build-all then regenerates episodes.html, the episode page, feed.xml,
// search, sitemap and status.
//
// Spotify and Apple read https://www.crimetimesnacks.com/feed.xml directly (the
// show was re-pointed there on 2026-09-05), so a successful push IS the release.
// Nothing is uploaded anywhere by hand.
//
// Three rules this script enforces, because the browser cannot be the only guard:
//   1. Every claim in factsToVerify must be ticked (override: --skip-facts, which
//      the weekly job passes explicitly so a bypass is visible in the log).
//   2. The checkout is synced with origin BEFORE anything is written, so a rebase
//      never fails halfway with the site half-built.
//   3. The episode is only marked "published" once the push actually succeeded.
//      A failed push leaves it "committed" and exits non-zero, so the studio says so.

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
const pushOnly = args.includes("--push-only");
const push = args.includes("--push") || pushOnly;
const skipFacts = args.includes("--skip-facts");
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const sh = (cmd, a, label) => {
  const r = spawnSync(cmd, a, { cwd: ROOT, encoding: "utf8", windowsHide: true });
  // stderr, not stdout: in --json mode the last stdout line must stay the result object.
  process.stderr.write((r.stdout || "") + (r.stderr || ""));
  if (r.status !== 0) throw new Error(`${label || cmd} failed (${r.status}): ${(r.stderr || r.stdout || r.error?.message || "").trim().slice(-400)}`);
  return r.stdout || "";
};
const quiet = (cmd, a) => { const r = spawnSync(cmd, a, { cwd: ROOT, encoding: "utf8", windowsHide: true }); return { code: r.status, out: (r.stdout || "").trim() }; };

if (!id) die("args", "usage: episode-publish.mjs <draft-id> [--push] [--date YYYY-MM-DD] [--push-only]");
const dir = join(DRAFTS, id);
const epPath = join(dir, "episode.json");
let ep;
try { ep = JSON.parse(await readFile(epPath, "utf8")); } catch { die("draft", `No draft ${id}`); }
if (ep.status === "published" && !pushOnly) die("state", `${id} is already published (${ep.publishedAt}). Use --push-only to retry a push that failed.`);

/* ------------------------------------------------- the checks, before any work */

async function gitPreflight() {
  for (const f of ["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"]) {
    try { await stat(join(ROOT, ".git", f)); } catch { continue; }
    die("git", `The repo is in the middle of a rebase or merge (.git/${f}). Nothing was published. Run "git status" in D:\\Dev\\GitHub\\crimetime, finish or abort it, then publish again.`);
  }
  if (!push) return;
  if (quiet("git", ["fetch", "origin"]).code !== 0) die("git", "Cannot reach origin (offline, or GitHub is down). Nothing was published; try again when the network is back, or publish without --push to commit locally.");
  const behind = parseInt(quiet("git", ["rev-list", "--count", "HEAD..origin/main"]).out || "0", 10) || 0;
  if (!behind) return;
  // CI rewrites the generated JSON every six hours, so being behind is normal, not a warning sign.
  try { sh("git", ["pull", "--rebase", "--autostash"], "git pull --rebase"); }
  catch (e) {
    quiet("git", ["rebase", "--abort"]);
    die("git", `Could not bring the checkout up to date with origin/main (${behind} commit(s) behind): ${e.message}\nNothing was published. Run "git status" in the repo, sort it out, then publish again.`);
  }
}

if (!pushOnly) {
  for (const f of ["episode.mp3", "cover.jpg"]) { try { await stat(join(dir, f)); } catch { die("files", `Missing ${f}. Finish the voice and art steps first.`); } }
  if (!ep.title || !ep.description) die("meta", "Title and show notes are required before publishing.");
  const facts = ep.factsToVerify || [], ticked = ep.factsChecked || [];
  const open = facts.filter((_, i) => !ticked[i]).length;
  if (open && !skipFacts) die("facts", `${open} claim${open === 1 ? " is" : "s are"} still unticked in the studio. Read the Facts tab, tick what you have confirmed, then publish.`);
  if (open && skipFacts) process.stderr.write(`WARNING: publishing with ${open} unticked claim(s) because --skip-facts was passed.\n`);
}
await gitPreflight();

const date = opt("--date", ep.publishDate || new Date().toISOString().slice(0, 10));
const slug = ep.slug;
const audioRel = `/audio/${slug}.mp3`, imageRel = `/images/episodes/${slug}.jpg`;
let bytes = 0, hasTranscript = false;

/* ---------------------------------------------------------------- the work */

if (!pushOnly) {
  await mkdir(join(ROOT, "images", "episodes"), { recursive: true });
  await mkdir(join(__dirname, "transcripts"), { recursive: true });
  await copyFile(join(dir, "episode.mp3"), join(ROOT, audioRel));
  await copyFile(join(dir, "cover.jpg"), join(ROOT, imageRel));
  try { await copyFile(join(dir, "transcript.json"), join(__dirname, "transcripts", `${slug}.json`)); hasTranscript = true; } catch { /* recorded, not synthesized */ }
  bytes = (await stat(join(ROOT, audioRel))).size;

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
}

/* ---------------------------------------------------------------- git */

// Stage what publishing produces, not the whole tree: an episode commit should
// never sweep up whatever else is in flight in the working copy.
const STAGE = ["audio", "images/episodes", "automation/transcripts", "automation/studio-episodes.json", "automation/episodes.json",
  "automation/cases-live.json", "automation/search-index.json", "automation/status.json", "automation/improvements.md",
  "episodes.html", "episodes", "cases.html", "cases", "blog.html", "blog-feed.xml", "feed.xml", "sitemap.xml", "index.html"];

let pushed = false, gitNote = "", committed = false;
try {
  if (!pushOnly) {
    sh("git", ["add", "-A", "--", ...STAGE], "git add");
    if (quiet("git", ["diff", "--cached", "--quiet"]).code !== 0) { sh("git", ["commit", "-m", `Episode: ${ep.title}`], "git commit"); committed = true; }
    else gitNote = "Nothing changed in the site files; the episode was already registered.";
  }
  if (push) {
    try { sh("git", ["push"], "git push"); }
    catch { sh("git", ["pull", "--rebase", "--autostash"], "git pull --rebase (retry)"); sh("git", ["push"], "git push (retry)"); }
    pushed = true;
  } else gitNote = "Committed locally, not on the site yet. Press Publish to push; Vercel deploys in about a minute.";
} catch (e) {
  quiet("git", ["rebase", "--abort"]);
  ep.status = committed ? "committed" : ep.status;
  ep.publishDate = date;
  ep.pushed = false;
  ep.gitNote = e.message;
  await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
  die("git", `The site files are built${committed ? " and committed locally" : ""}, but ${push ? "the push" : "git"} failed:\n${e.message}\nThe episode is NOT live. Fix it in the repo (git status), then press Publish again; the work already done is reused.`);
}

if (!pushOnly) await logImprovement(`Published podcast episode from the studio: "${ep.title}" (${ep.duration || "?"})`);
ep.status = pushed ? "published" : "committed";
ep.pushed = pushed;
ep.gitNote = gitNote;
if (pushed) ep.publishedAt = new Date().toISOString();
ep.publishDate = date;
ep.pageUrl = `https://www.crimetimesnacks.com/episodes/${slug}.html`;
await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");

out({
  ok: true, id, slug, pushed, page: ep.pageUrl, audio: audioRel, bytes, transcript: hasTranscript, note: gitNote,
  spotifyUpload: { title: ep.title, description: ep.description, file: join(ROOT, audioRel), art: join(ROOT, imageRel) },
  message: pushed
    ? `Published "${ep.title}" -> ${ep.pageUrl}\nPushed. Vercel deploys in about a minute; Spotify and Apple read feed.xml within a few hours.`
    : `Built and committed "${ep.title}". ${gitNote}`,
});
