#!/usr/bin/env node
// Publish a reel to Instagram through the official Content Publishing API.
//
// Why this exists: the browser route works for images and does not work for
// video. Instagram's web uploader takes an mp4 into its file input and ignores
// it, and retrying it quickly enough to debug gets the account rate limited
// ("Please wait a few minutes before you try again"). This is the path Meta
// built for exactly this, and it is the only reliable way to post a reel
// without a phone in your hand.
//
//   node automation/instagram-publish.mjs <draft-id> [--dry] [--video-url <url>] [--json]
//   node automation/instagram-publish.mjs --check          (config and token only)
//
// It reads the draft's trailer.mp4 and caption.txt, so what goes out is exactly
// what the studio rendered and what preflight checked.
//
// SETUP - three things only Cory can do, once. See automation/INSTAGRAM-API.md.
//   1. @crimetimesnacks switched to a Business or Creator account, linked to a
//      Facebook Page.
//   2. A Meta app with the Instagram Graph API, and a long-lived token.
//   3. Those two values in automation/.env.instagram (gitignored):
//        IG_USER_ID=...        the Instagram Business account id, not the username
//        IG_TOKEN=...          long-lived access token
//        IG_VIDEO_BASE=...     optional, see below
//
// THE HOSTING WRINKLE, because it will bite otherwise: Meta does not accept a
// file upload. It fetches the video from a public HTTPS URL that you provide,
// so the mp4 has to be reachable on the internet before it can be posted.
// Options, in order of least work:
//   - --video-url <url>   anything already public.
//   - IG_VIDEO_BASE       a base URL this script appends the filename to, for a
//                         folder that is already served (a Blob store, R2, or
//                         a public folder on the site).
// Neither is set up yet. --dry runs the whole thing and prints what it would
// send, which is worth doing before wiring hosting.

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(__dirname, "studio", "drafts");
const ENVFILE = join(__dirname, ".env.instagram");
const GRAPH = "https://graph.facebook.com/v21.0";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const has = (n) => args.includes(n);
const asJson = has("--json");
const dry = has("--dry");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ config */
// Kept out of the repo and out of config.json: a long-lived token posts as him.
async function loadEnv() {
  const env = { ...process.env };
  if (existsSync(ENVFILE)) {
    for (const line of (await readFile(ENVFILE, "utf8")).split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
    }
  }
  return env;
}

async function check(env) {
  const missing = ["IG_USER_ID", "IG_TOKEN"].filter((k) => !env[k]);
  if (missing.length) {
    out({ ok: false, step: "setup", missing, message: `Not set up yet. Missing ${missing.join(" and ")} in automation/.env.instagram. See automation/INSTAGRAM-API.md - three one-time steps, all of them Cory's.` });
    return false;
  }
  // Ask Instagram who the token belongs to. Catching a wrong account here beats
  // finding out by posting a true crime reel to the wrong profile.
  const r = await fetch(`${GRAPH}/${env.IG_USER_ID}?fields=username,followers_count,media_count&access_token=${env.IG_TOKEN}`);
  const j = await r.json();
  if (!r.ok) { out({ ok: false, step: "token", message: `Token rejected: ${j.error?.message || r.status}` }); return false; }
  out({ ok: true, username: j.username, followers: j.followers_count, posts: j.media_count, message: `Ready: posting as @${j.username} (${j.followers_count} followers, ${j.media_count} posts).` });
  return j;
}

/* ----------------------------------------------------------------- publish */
async function publish() {
  const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
  if (!id) die("args", "usage: instagram-publish.mjs <draft-id> [--dry]");
  const dir = join(DRAFTS, id);
  const video = join(dir, "trailer.mp4");
  const capFile = join(dir, "caption.txt");
  if (!existsSync(video)) die("draft", `No trailer.mp4 in ${id}. Cut the trailer first.`);
  const caption = existsSync(capFile) ? (await readFile(capFile, "utf8")).trim() : "";
  if (!caption) die("caption", "No caption.txt. Nothing goes out without one.");
  const bytes = (await stat(video)).size;

  const env = await loadEnv();
  // Meta fetches the file; it cannot be uploaded. Without a public URL there is
  // nothing to hand them, so say so plainly instead of failing inside the API.
  const url = opt("--video-url", env.IG_VIDEO_BASE ? `${env.IG_VIDEO_BASE.replace(/\/$/, "")}/${id}.mp4` : "");
  if (!url && !dry) die("hosting", "No public URL for the video. Meta fetches it rather than accepting an upload - pass --video-url, or set IG_VIDEO_BASE. See the note at the top of this file.");

  if (dry) {
    out({ ok: true, dry: true, id, bytes, caption, videoUrl: url || "(none set)",
      message: `Dry run.\n  video   ${video} (${(bytes / 1048576).toFixed(1)} MB)\n  hosted  ${url || "NOT SET - Meta fetches the file, so it must be public first"}\n  caption ${caption.split("\n")[0]}...\n  would POST ${GRAPH}/<IG_USER_ID>/media  media_type=REELS\n  then poll status_code, then media_publish.` });
    return;
  }

  const who = await check(env);
  if (!who) process.exit(2);

  // 1. container
  const body = new URLSearchParams({ media_type: "REELS", video_url: url, caption, share_to_feed: "true", access_token: env.IG_TOKEN });
  const c = await fetch(`${GRAPH}/${env.IG_USER_ID}/media`, { method: "POST", body });
  const cj = await c.json();
  if (!c.ok) die("container", cj.error?.message || `HTTP ${c.status}`);
  say(`  container ${cj.id}`);

  // 2. Meta downloads and transcodes; publishing before it finishes fails.
  let state = "";
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const s = await fetch(`${GRAPH}/${cj.id}?fields=status_code,status&access_token=${env.IG_TOKEN}`);
    const sj = await s.json();
    state = sj.status_code || "";
    say(`  ${state}`);
    if (state === "FINISHED") break;
    if (state === "ERROR") die("processing", sj.status || "Instagram could not process the video.");
  }
  if (state !== "FINISHED") die("processing", "Timed out waiting for Instagram to process the video.");

  // 3. publish
  const p = await fetch(`${GRAPH}/${env.IG_USER_ID}/media_publish`, { method: "POST", body: new URLSearchParams({ creation_id: cj.id, access_token: env.IG_TOKEN }) });
  const pj = await p.json();
  if (!p.ok) die("publish", pj.error?.message || `HTTP ${p.status}`);

  // 4. Verify rather than trusting the response, the same rule as everywhere else.
  const v = await fetch(`${GRAPH}/${pj.id}?fields=permalink,media_type,timestamp&access_token=${env.IG_TOKEN}`);
  const vj = await v.json();
  out({ ok: true, id, mediaId: pj.id, permalink: vj.permalink, message: `Posted to @${who.username}: ${vj.permalink || pj.id}` });
}

const env = await loadEnv();
if (has("--check")) { await check(env); }
else await publish();
