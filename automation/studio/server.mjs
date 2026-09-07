#!/usr/bin/env node
// CrimeTimeSnacks Studio: the local control room for the podcast pipeline.
//
//   node automation/studio/server.mjs            http://127.0.0.1:4177
//   npm run studio
//
// Local only, on purpose. It runs the pipeline scripts on this machine (LM
// Studio, Chatterbox, edge-tts, ffmpeg, git), so it binds to loopback and is
// never deployed. No dependencies: node:http + the scripts in automation/.

import { createServer } from "node:http";
import { StringDecoder } from "node:string_decoder";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, readdir, stat, rm, mkdir, access, unlink } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize, basename } from "node:path";
import { loadEnv } from "../community/env.mjs";
import { sb } from "../community/lib.js";
import { PROJECTS, listProjects, createProject, getProject, appendNote, saveNotes, chatProject, exportProject, projectToResearch, deleteProject } from "./projects.mjs";
await loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTO = join(HERE, "..");
const ROOT = join(AUTO, "..");
const DRAFTS = join(HERE, "drafts");
const MUSIC = join(HERE, "music");
const VOICE = join(HERE, "voice");
const PORT = parseInt(process.env.STUDIO_PORT || "4177", 10);
const POSTS = join(HERE, "posts");
const FOOTAGE = join(HERE, "footage"); // real case footage per case, with its sources
const IG_STUDIO = process.env.IG_STUDIO || "D:/Dev/GitHub/ig-studio"; // the Instagram pipeline repo (scripts/, content/queue.json, out/)
const HOST = "127.0.0.1";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".webm": "audio/webm", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".pdf": "application/pdf" };
// What may render in the browser straight from a user-writable folder (drafts, projects,
// posts, ig out). None of these can execute script as a top-level document. Everything
// else, .html and .svg included, is sent as a download: the studio origin holds write
// power, so a page planted in a draft folder must never run inside it.
const INLINE = new Set([".mp3", ".wav", ".webm", ".m4a", ".ogg", ".mp4", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf", ".json", ".txt", ".md"]);
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
// JSON bodies over 1 MB are drained and rejected. readBody resolves null for "could not
// read this body" (too large, or not JSON) so a route never mistakes a truncated request
// for an empty object and writes the emptiness to disk. Chunks are decoded through one
// StringDecoder because a multibyte character can straddle a chunk boundary.
const readBody = (req) => new Promise((resolve) => {
  const dec = new StringDecoder("utf8");
  let b = "", over = false;
  req.on("data", (c) => { if (over) return; b += dec.write(c); if (b.length > 1_000_000) { over = true; b = ""; } });
  req.on("end", () => { if (over) return resolve(null); b += dec.end(); try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); } });
  req.on("error", () => resolve(null));
});
const TOO_BIG = { error: "the request body was too large or was not valid JSON; nothing was changed" };
// Files the studio may serve from the repo root through /site/: public assets only. Never automation/, never dotfiles.
const SITE_DIRS = ["images", "css", "js", "audio", "videos"];
const isHidden = (rel) => rel.split(/[\\/]/).some((seg) => seg.startsWith("."));
const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const safeId = (s) => /^[a-z0-9][a-z0-9-]{0,120}$/.test(s || "");
const safeName = (s) => /^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,120}$/.test(s || "") && !s.includes("..");
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

/* ---------------------------------------------------------------- jobs */
const jobs = new Map();
let jobSeq = 0;
const ACTIONS = {
  new:      (a) => ["episode-new.mjs", ...(a.topic ? [a.topic] : []), "--minutes", String(a.minutes || 20), "--json"],
  research: (a) => ["episode-research.mjs", "--draft", a.id, "--json"],
  draft:    (a) => ["episode-draft.mjs", ...(a.case ? ["--case", a.case] : a.topic ? [a.topic] : ["--auto"]), "--minutes", String(a.minutes || 20), "--json"],
  voice:    (a) => ["episode-voice.mjs", a.id, ...(a.engine ? ["--engine", a.engine] : []), ...(a.voice ? ["--voice", a.voice] : []), ...(a.rate ? ["--rate", a.rate] : []), ...(a.pitch ? ["--pitch", a.pitch] : []),
                    ...(a.exaggeration ? ["--exaggeration", String(a.exaggeration)] : []), ...(a.cfg ? ["--cfg", String(a.cfg)] : []), ...(a.from ? ["--from", a.from] : []), ...(a.noMusic ? ["--no-music"] : []), ...(a.noTrim ? ["--no-trim"] : []), "--json"],
  art:      (a) => ["episode-art.mjs", a.id, "--json"],
  social:   (a) => ["episode-social.mjs", a.id, "--clip", String(a.clip || 45), "--start", String(a.start || 0), "--json"],
  publish:  (a) => ["episode-publish.mjs", a.id, ...(a.pushOnly ? ["--push-only"] : a.push === false ? [] : ["--push"]), ...(a.date && !a.pushOnly ? ["--date", a.date] : []), "--json"],
  music:    () => ["episode-music.mjs", "--json"],
  build:    () => ["build-all.mjs"],
  sync:     () => ["import-feed.mjs"],
  content:  () => ["weekly-update.mjs", "--commit", "--push"],
  fbi:      () => ["import-fbi.mjs"],
  qa:       () => ["check-links.mjs"],
  avatar:   () => ["episode-art.mjs", "--avatar", "--json"],
  weekly:   (a) => ["episode-weekly.mjs", ...(a.engine ? ["--engine", a.engine] : [])],
  watch:    (a) => ["case-watch.mjs", ...(a.case ? ["--case", a.case] : []), "--json"],
  generate: (a) => ["gen-image.mjs", "--draft", a.id, "--prompt", String(a.prompt || ""), ...(a.kind === "video" ? ["--video", "--seconds", String(a.seconds || 8)] : []), ...(a.model ? ["--model", a.model] : []), ...(a.ref ? ["--ref", a.ref] : []), "--json"],
  synccases:() => ["community/sync-cases.mjs", "--json"],
  // Real footage. --add registers a source and pulls its captions only; --find
  // searches those captions; --clip is the only step that downloads video, and
  // it downloads that section alone.
  "footage-add":  (a) => ["footage.mjs", "--add", String(a.url || ""), "--case", String(a.case || ""), "--rights", String(a.rights || "agency"), ...(a.note ? ["--note", String(a.note)] : []), "--json"],
  "footage-find": (a) => ["footage.mjs", "--find", String(a.source || ""), "--case", String(a.case || ""), "--q", String(a.q || ""), "--json"],
  "footage-clip": (a) => ["footage.mjs", "--clip", String(a.source || ""), "--case", String(a.case || ""), "--in", String(a.in || 0), "--out", String(a.out || 0), "--label", String(a.label || ""), ...(a.x ? ["--x", String(a.x)] : []), "--json"],
  trailer:  (a) => ["episode-trailer.mjs", a.id, ...(a.seconds ? ["--seconds", String(a.seconds)] : []), ...(a.noFootage ? ["--no-footage"] : []), "--json"],
  "post-render": (a) => ["social-post.mjs", a.id, "--json"],
  "post-new":    (a) => ["social-post.mjs", "--new", String(a.title || "untitled"), "--json"],
  // Instagram pipeline (ig-studio). argv is relative to that repo.
  "ig-render":    (a) => ({ cwd: IG_STUDIO, argv: ["scripts/render.mjs", ...(a.ids || [])] }),
  "ig-reel":      (a) => ({ cwd: IG_STUDIO, argv: ["scripts/reel.mjs", a.spec || "reel-01.json"] }),
  "ig-preflight": () => ({ cwd: IG_STUDIO, argv: ["scripts/preflight.mjs"] }),
  "ig-capture":   (a) => ({ cwd: IG_STUDIO, argv: ["scripts/capture.mjs", ...(a.slugs || [])] }),
  "ig-board":     () => ({ cwd: IG_STUDIO, argv: ["scripts/board.mjs"] }),
  "ig-facts":     () => ({ cwd: IG_STUDIO, argv: ["scripts/facts.mjs"] }),
};
function startJob(action, a) {
  const spec = ACTIONS[action](a);
  const cwd = Array.isArray(spec) ? ROOT : spec.cwd;
  const argv = Array.isArray(spec) ? [join(AUTO, spec[0]), ...spec.slice(1)] : [join(spec.cwd, spec.argv[0]), ...spec.argv.slice(1)];
  const id = `j${++jobSeq}`;
  const job = { id, action, draft: a.id || null, started: Date.now(), done: false, code: null, log: "", result: null };
  jobs.set(id, job);
  // detached: a five-hour voice render must outlive a studio server restart. The
  // script updates its draft's episode.json itself, so the result is never lost
  // even if this process (and its log buffer) goes away.
  const child = spawn(process.execPath, argv, { cwd, windowsHide: true, detached: true, env: { ...process.env, FORCE_COLOR: "0", PYTHONIOENCODING: "utf-8" } });
  child.unref();
  const onData = (c) => { job.log += c.toString(); if (job.log.length > 200000) job.log = job.log.slice(-150000); };
  child.stdout.on("data", onData); child.stderr.on("data", onData);
  child.on("close", (code) => {
    job.done = true; job.code = code; job.finished = Date.now();
    const last = job.log.trim().split("\n").reverse().find((l) => l.startsWith("{"));
    if (last) { try { job.result = JSON.parse(last); } catch { /* not json */ } }
  });
  child.on("error", (e) => { job.done = true; job.code = -1; job.log += `\n${e.message}`; });
  return job;
}
const running = () => [...jobs.values()].filter((j) => !j.done);
// A five-hour clone render outlives this process, so "is it running" is read from the
// draft's tts folder rather than the job list. A folder nothing has touched for half an
// hour, or one carrying failed.txt, is a crash, not a render: say so instead of locking
// the episode for ever.
const STALE_MS = 30 * 60 * 1000;
async function voiceStopped(tts) {
  const st = await stat(tts).catch(() => null);
  if (!st) return null;
  const failed = await readFile(join(tts, "failed.txt"), "utf8").catch(() => null);
  if (failed) return failed.trim().slice(0, 400) || "The voice render stopped.";
  const names = await readdir(tts).catch(() => []);
  let newest = st.mtimeMs;
  for (const n of names) { const f = await stat(join(tts, n)).catch(() => null); if (f) newest = Math.max(newest, f.mtimeMs); }
  return Date.now() - newest > STALE_MS ? `No progress for ${Math.round((Date.now() - newest) / 60000)} minutes. The render stopped.` : null;
}
async function voiceState(tts, id) {
  if (!(await exists(tts))) return null;
  if (running().some((j) => j.draft === id && j.action === "voice")) return "voice";
  return (await voiceStopped(tts)) ? null : "voice";
}

/* -------------------------------------------------------------- health */
const sh = (cmd, args, ms = 15000) => { const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", windowsHide: true, timeout: ms }); return (r.stdout || "").trim(); };
async function musicInfo() {
  const files = (await readdir(MUSIC).catch(() => [])).filter((f) => /^(intro|outro)\.(wav|mp3|m4a|flac|ogg)$/i.test(f));
  return { source: files.length ? "cory" : "synth", files, rendered: await exists(join(MUSIC, ".rendered", "intro.wav")) };
}
async function voiceInfo() {
  const reference = await exists(join(VOICE, "cory-reference.wav"));
  const venv = await exists(join(HERE, ".venv", "Scripts", "python.exe"));
  return { reference, venv, cloneReady: reference && venv, defaultEngine: reference && venv ? "clone" : "edge" };
}
let healthCache = { at: 0, value: null, slowAt: 0 };
async function health() {
  if (healthCache.value && Date.now() - healthCache.at < 20_000) return healthCache.value;
  const value = await healthNow(Date.now() - healthCache.slowAt > 300_000);
  if (value.slow) healthCache.slowAt = Date.now();
  healthCache = { ...healthCache, at: Date.now(), value };
  return value;
}
async function healthNow(slow) {
  const [git, tasks, lm, log, status, cases, studioEps, eps, music, voice] = await Promise.all([
    (async () => {
      if (slow) sh("git", ["fetch", "--quiet", "origin"], 20000);
      const [ahead, behind] = (sh("git", ["rev-list", "--left-right", "--count", "HEAD...origin/main"]) || "0\t0").split(/\s+/).map(Number);
      const dirty = sh("git", ["status", "--porcelain"]).split("\n").filter(Boolean).length;
      const lastCi = sh("git", ["log", "origin/main", "-1", "--format=%cI|%s"]).split("|");
      const lastLocal = sh("git", ["log", "-1", "--format=%cI|%s", "--grep=Weekly auto-update", "--grep=Episode:"]).split("|");
      return { ahead, behind, dirty, lastCi: { at: lastCi[0], msg: lastCi[1] }, lastContent: { at: lastLocal[0] || null, msg: lastLocal[1] || null } };
    })(),
    (async () => {
      const raw = sh("powershell", ["-NoProfile", "-Command", "Get-ScheduledTask -TaskName 'CTS *' | ForEach-Object { $i = $_ | Get-ScheduledTaskInfo; [pscustomobject]@{ name=$_.TaskName; state=[string]$_.State; last=$i.LastRunTime.ToString('o'); next=$i.NextRunTime.ToString('o'); result=$i.LastTaskResult } } | ConvertTo-Json -Compress"], 30000);
      try { const j = JSON.parse(raw || "[]"); return Array.isArray(j) ? j : [j]; } catch { return []; }
    })(),
    (async () => {
      try { const c = new AbortController(); setTimeout(() => c.abort(), 2500); const r = await fetch("http://localhost:1234/v1/models", { signal: c.signal }); const j = await r.json(); return { up: true, models: (j.data || []).map((m) => m.id) }; }
      catch { return { up: false, models: [] }; }
    })(),
    (async () => {
      try {
        const text = (await readFile(join(AUTO, "cron", "cron.log"))).toString("utf8").replace(/ /g, "").replace(/�/g, "");
        return text.split("\n").filter((l) => /^\s*\d{4}-\d{2}-\d{2}T.*(CONTENT|FEEDSYNC|EPISODE)/.test(l)).slice(-8).map((l) => l.trim());
      } catch { return []; }
    })(),
    readJson(join(AUTO, "status.json"), {}),
    readJson(join(AUTO, "cases.json"), { cases: [] }),
    readJson(join(AUTO, "studio-episodes.json"), { episodes: [] }),
    readJson(join(AUTO, "episodes.json"), { episodes: [] }),
    musicInfo(), voiceInfo(),
  ]);
  const drafts = await listDrafts();
  const used = new Set([...(eps.episodes || []).map((e) => e.slug), ...(studioEps.episodes || []).map((e) => e.slug), ...drafts.map((d) => d.caseSlug)]);
  const tools = slow || !healthCache.value ? { edgeTts: !!sh("edge-tts", ["--help"], 8000), ffmpeg: !!sh("ffmpeg", ["-version"], 8000) } : healthCache.value.tools;
  // Which model actually writes the scripts, read from the same config the pipeline uses,
  // so the light in the top bar means something.
  const cfg = await readJson(join(AUTO, "config.json"), {});
  const order = cfg.order || ["gemini"];
  const provider = order.find((n) => n === "local" || cfg[n]?.apiKey || process.env[`${n.toUpperCase()}_API_KEY`]) || order[0];
  const writer = {
    provider,
    model: provider === "local" ? (lm.models?.[0] || cfg.local?.model || "") : (cfg[provider]?.writerModel || cfg[provider]?.model || ""),
    ready: provider === "local" ? lm.up : !!(cfg[provider]?.apiKey || process.env[`${provider.toUpperCase()}_API_KEY`]),
  };
  return {
    now: new Date().toISOString(), slow, git, tasks, lmStudio: lm, cronTail: log, status, tools, music, voice, writer,
    episodes: (eps.episodes || []).map((e) => ({ title: e.title, date: e.date, duration: e.duration, slug: e.slug, source: e.source || "feed" })),
    backlog: cases.cases.map((c) => ({ ...c, used: used.has(c.slug) })),
    drafts, running: running().map(({ log, ...j }) => j),
  };
}

/* -------------------------------------------------------------- drafts */
async function listDrafts() {
  let dirs = [];
  try { dirs = await readdir(DRAFTS); } catch { return []; }
  const outList = [];
  for (const d of dirs) {
    const ep = await readJson(join(DRAFTS, d, "episode.json"), null);
    if (!ep) continue;
    outList.push({ id: ep.id || d, title: ep.title, status: ep.status, created: ep.created, caseSlug: ep.caseSlug, duration: ep.duration || null, scriptWords: ep.scriptWords, files: ep.files || {}, factsToVerify: (ep.factsToVerify || []).length, publishedAt: ep.publishedAt || null, researched: !!ep.researched || !!ep.files?.research, inProgress: await voiceState(join(DRAFTS, d, "tts"), d) });
  }
  return outList.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}
async function listFiles(dir) {
  const names = await readdir(dir).catch(() => []);
  const files = [];
  for (const n of names) { const st = await stat(join(dir, n)).catch(() => null); if (st?.isFile()) files.push({ name: n, size: st.size, mtime: st.mtime.toISOString() }); }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
// trusted: repo assets under /site/, which keep their real type (css, js). Everything
// from a folder a person or a download can write to goes through the INLINE gate.
function streamFile(req, res, file, st, trusted = false) {
  const ext = extname(file).toLowerCase();
  const inline = trusted || INLINE.has(ext);
  const type = inline ? (MIME[ext] || "application/octet-stream") : "application/octet-stream";
  const head = { "Content-Type": type, "Cache-Control": "no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
    ...(inline ? {} : { "Content-Disposition": `attachment; filename="${basename(file).replace(/["\\]/g, "")}"` }) };
  const pipe = (stream) => { stream.on("error", () => res.destroy()); stream.pipe(res); };
  const range = req.headers.range;
  if (range && /^(audio|video)\//.test(type)) {
    const [s, e] = range.replace("bytes=", "").split("-").map((n) => parseInt(n, 10));
    const start = Number.isFinite(s) ? s : 0;
    const end = Math.min(Number.isFinite(e) ? e : st.size - 1, st.size - 1);
    // An unsatisfiable range must be answered, not crashed on.
    if (start < 0 || start >= st.size || start > end) { res.writeHead(416, { "Content-Range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...head, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": end - start + 1 });
    return pipe(createReadStream(file, { start, end }));
  }
  res.writeHead(200, { ...head, "Content-Length": st.size });
  pipe(createReadStream(file));
}
function saveUpload(req, file, max = 400 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const ws = createWriteStream(file);
    req.on("data", (c) => { size += c.length; if (size > max) { req.destroy(); ws.destroy(); unlink(file).catch(() => {}); reject(new Error("file too large")); } });
    req.pipe(ws);
    ws.on("finish", () => resolve(size));
    ws.on("error", reject);
  });
}

/* -------------------------------------------------------------- server */
// Same-origin gate. The server listens on loopback only, but any web page in
// the user's browser can still fire a request at 127.0.0.1:4177. Two rules:
//  * the Host header must be ours (defeats DNS rebinding);
//  * anything that changes state (non-GET) must carry the X-CTS header, which a
//    cross-origin page cannot add without a CORS preflight that we never grant,
//    and its Origin (when present) must be ours or the desktop shell's.
const OWN_ORIGINS = new Set([`http://${HOST}:${PORT}`, `http://localhost:${PORT}`]);
function gate(req, res) {
  const host = (req.headers.host || "").toLowerCase();
  if (host !== `${HOST}:${PORT}` && host !== `localhost:${PORT}`) { json(res, 421, { error: "wrong host" }); return false; }
  if (req.method !== "GET" && req.method !== "HEAD") {
    const origin = req.headers.origin;
    if (origin && !OWN_ORIGINS.has(origin) && !/^(cts-shell|cts-file|file):\/\//.test(origin)) { json(res, 403, { error: "cross-origin write refused" }); return false; }
    if (req.headers["x-cts"] !== "1") { json(res, 403, { error: "missing X-CTS header" }); return false; }
  }
  return true;
}
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' cts-shell:; frame-ancestors 'none'",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const p = url.pathname;
  if (!gate(req, res)) return;
  try {
    if (p === "/" || p === "/index.html") {
      const html = await readFile(join(HERE, "studio.html"));
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store", ...SECURITY_HEADERS }); return res.end(html);
    }
    if (p === "/api/posts") {
      const ids = (await readdir(POSTS, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name).sort().reverse();
      const posts = [];
      for (const id of ids) {
        const spec = await readJson(join(POSTS, id, "post.json"), null); if (!spec) continue;
        const names = await readdir(join(POSTS, id)).catch(() => []);
        posts.push({ id, title: spec.title || id, status: spec.status || "draft", created: spec.created, rendered: spec.rendered || null, case: spec.case || null, caption: spec.caption || "", slides: (spec.slides || []).length,
          files: names.filter((n) => /^slide-\d+\.jpg$/.test(n)).sort((x, y) => parseInt(x.slice(6)) - parseInt(y.slice(6))), dir: join(POSTS, id) });
      }
      return json(res, 200, posts);
    }
    if (p.startsWith("/api/post/")) {
      const [, , , id, sub] = p.split("/");
      if (!safeId(id)) return json(res, 400, { error: "bad id" });
      const dir = join(POSTS, id);
      if (!(await exists(join(dir, "post.json")))) return json(res, 404, { error: "no such post" });
      if (sub === "file") {
        const name = url.searchParams.get("name") || "";
        if (!safeName(name) || isHidden(name)) return json(res, 400, { error: "bad name" });
        const file = normalize(join(dir, name)); if (!file.startsWith(normalize(dir))) return json(res, 400, { error: "bad path" });
        const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "no such file" });
        return streamFile(req, res, file, st);
      }
      if (sub === "spec" && req.method === "GET") return json(res, 200, await readJson(join(dir, "post.json"), {}));
      if (sub === "spec" && req.method === "PUT") {
        const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG);
        if (!Array.isArray(b.slides) || !b.slides.length) return json(res, 400, { error: "slides required" });
        const cur = await readJson(join(dir, "post.json"), {});
        const next = { ...cur, title: String(b.title || cur.title || id).slice(0, 200), caption: String(b.caption ?? cur.caption ?? "").slice(0, 2200), slides: b.slides.slice(0, 10), status: cur.status || "draft" };
        await writeFile(join(dir, "post.json"), JSON.stringify(next, null, 2) + "\n", "utf8");
        return json(res, 200, { ok: true });
      }
      if (sub === "status" && req.method === "POST") {
        const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG);
        if (!["draft", "approved", "posted", "rejected"].includes(b.status)) return json(res, 400, { error: "status" });
        const cur = await readJson(join(dir, "post.json"), {}); cur.status = b.status; if (b.status === "posted") cur.postedAt = new Date().toISOString();
        await writeFile(join(dir, "post.json"), JSON.stringify(cur, null, 2) + "\n", "utf8");
        return json(res, 200, { ok: true });
      }
      if (sub === "upload" && req.method === "POST") {
        const name = url.searchParams.get("name") || "";
        if (!safeName(name) || isHidden(name) || !/\.(jpe?g|png|webp|mp4)$/i.test(name)) return json(res, 400, { error: "image or mp4 name" });
        const chunks = []; let size = 0;
        await new Promise((ok, bad) => { req.on("data", (c) => { size += c.length; if (size > 200_000_000) { req.destroy(); bad(new Error("too large")); } chunks.push(c); }); req.on("end", ok); req.on("error", bad); }).catch((e) => json(res, 413, { error: e.message }));
        if (res.writableEnded) return;
        await writeFile(join(dir, name), Buffer.concat(chunks));
        return json(res, 200, { ok: true, name });
      }
      if (!sub && req.method === "DELETE") { await rm(dir, { recursive: true, force: true }); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: "unknown post route" });
    }
    if (p === "/instagram") {
      const html = await readFile(join(HERE, "instagram.html"));
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store", ...SECURITY_HEADERS }); return res.end(html);
    }
    if (p === "/api/ig/queue") {
      const q = await readJson(join(IG_STUDIO, "content", "queue.json"), { posts: [] });
      const outNames = await readdir(join(IG_STUDIO, "out")).catch(() => []);
      const posts = (q.posts || []).map((x) => ({ id: x.id, type: x.type, project: x.project, headline: (x.headline || "").replace(/<br\s*\/?>/g, " "), sub: x.sub || "", domain: x.domain || "", status: x.status || "draft", caption: x.caption || "", render: outNames.find((n) => n.startsWith(`${x.id}.`) && /\.(jpe?g|png)$/i.test(n)) || null, rejectedReason: x.rejectedReason || "" }));
      const renders = outNames.filter((n) => /\.(jpe?g|png|mp4)$/i.test(n)).map((n) => ({ name: n, path: join(IG_STUDIO, "out", n) }));
      return json(res, 200, { batch: q.batch, account: q.account || null, rules: q._rules || [], posts, renders, outDir: join(IG_STUDIO, "out") });
    }
    if (p === "/api/ig/file") {
      const name = url.searchParams.get("name") || "";
      if (!safeName(name) || isHidden(name)) return json(res, 400, { error: "bad name" });
      const file = normalize(join(IG_STUDIO, "out", name)); if (!file.startsWith(normalize(join(IG_STUDIO, "out")))) return json(res, 400, { error: "bad path" });
      const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "no such file" });
      return streamFile(req, res, file, st);
    }
    if (p === "/api/ig/status" && req.method === "POST") {
      const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG);
      if (!safeName(b.id || "") || !["draft", "approved", "posted", "rejected"].includes(b.status)) return json(res, 400, { error: "id + status (draft|approved|posted|rejected)" });
      const qp = join(IG_STUDIO, "content", "queue.json"); const q = await readJson(qp, null); if (!q) return json(res, 404, { error: "no queue" });
      const post = (q.posts || []).find((x) => x.id === b.id); if (!post) return json(res, 404, { error: "no such post" });
      post.status = b.status; if (b.status === "posted") post.postedAt = new Date().toISOString(); if (typeof b.reason === "string") post.rejectedReason = b.reason;
      await writeFile(qp, JSON.stringify(q, null, 2) + "\n", "utf8");
      return json(res, 200, { ok: true });
    }
    if (p === "/api/ig/caption" && req.method === "POST") {
      const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG);
      if (!safeName(b.id || "")) return json(res, 400, { error: "id" });
      const qp = join(IG_STUDIO, "content", "queue.json"); const q = await readJson(qp, null); if (!q) return json(res, 404, { error: "no queue" });
      const post = (q.posts || []).find((x) => x.id === b.id); if (!post) return json(res, 404, { error: "no such post" });
      post.caption = String(b.caption || "").slice(0, 2200);
      await writeFile(qp, JSON.stringify(q, null, 2) + "\n", "utf8");
      return json(res, 200, { ok: true });
    }
    /* footage library: what is on hand for a case, and preview of each clip */
    if (p === "/api/footage") {
      const only = url.searchParams.get("case") || "";
      const names = (await readdir(FOOTAGE).catch(() => [])).filter((n) => !n.startsWith(".") && (!only || n === only));
      const cases = [];
      for (const c of names) {
        const book = await readJson(join(FOOTAGE, c, "sources.json"), null);
        if (book) cases.push({ case: c, sources: book.sources || [] });
      }
      return json(res, 200, { cases, dir: FOOTAGE });
    }
    // Caption search, served straight from the stored cues. The CLI has the same
    // search, but a job round-trip to find a timestamp would make the studio feel
    // broken - this is a read, so it answers immediately.
    if (p === "/api/footage/find") {
      const c = url.searchParams.get("case") || "", src = url.searchParams.get("source") || "", q = (url.searchParams.get("q") || "").toLowerCase();
      if (!safeName(c) || !safeName(src) || q.length < 3) return json(res, 400, { error: "case + source + a phrase of 3 characters or more" });
      const cues = await readJson(join(FOOTAGE, c, "sources", `${src}.cues.json`), null);
      if (!cues) return json(res, 404, { error: "no captions stored for that source" });
      const hits = cues.filter((x) => String(x.text).toLowerCase().includes(q)).slice(0, 20);
      return json(res, 200, { hits });
    }
    if (p === "/api/footage/file") {
      const c = url.searchParams.get("case") || "", name = url.searchParams.get("name") || "";
      if (!safeName(c) || !safeName(name) || isHidden(name) || !/\.(mp4|wav)$/i.test(name)) return json(res, 400, { error: "case + clip name" });
      const file = normalize(join(FOOTAGE, c, "clips", name));
      if (!file.startsWith(normalize(FOOTAGE))) return json(res, 400, { error: "bad path" });
      const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "no such clip" });
      return streamFile(req, res, file, st);
    }
    if (p === "/api/community/digest-test" && req.method === "POST") {
      const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG);
      const to = String(b.to || "").toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return json(res, 400, { error: "valid email" });
      const site = (process.env.SITE_URL_PUBLIC || "https://www.crimetimesnacks.com").replace(/\/$/, "");
      try { const r = await fetch(`${site}/api/community/digest?key=${encodeURIComponent(process.env.CRON_SECRET || "")}&to=${encodeURIComponent(to)}${b.dry ? "&dry=1" : ""}`); return json(res, r.status, await r.json()); }
      catch (e) { return json(res, 502, { error: e.message }); }
    }

    if (p === "/api/health") return json(res, 200, await health());
    if (p === "/api/drafts") return json(res, 200, await listDrafts());

    /* music: theme beds */
    if (p === "/api/music") return json(res, 200, await musicInfo());
    if (p === "/api/music/upload" && req.method === "POST") {
      const kind = url.searchParams.get("kind"); const ext = (url.searchParams.get("ext") || "mp3").toLowerCase();
      if (!["intro", "outro"].includes(kind) || !/^(mp3|wav|m4a|flac|ogg)$/.test(ext)) return json(res, 400, { error: "kind=intro|outro, ext=mp3|wav|m4a|flac|ogg" });
      await mkdir(MUSIC, { recursive: true });
      for (const f of await readdir(MUSIC)) if (new RegExp(`^${kind}\\.`).test(f)) await unlink(join(MUSIC, f)).catch(() => {});
      const size = await saveUpload(req, join(MUSIC, `${kind}.${ext}`), 60 * 1024 * 1024);
      await rm(join(MUSIC, ".rendered"), { recursive: true, force: true });
      return json(res, 200, { ok: true, size });
    }
    if (p === "/api/music/reset" && req.method === "POST") {
      for (const f of await readdir(MUSIC).catch(() => [])) if (/^(intro|outro)\./.test(f)) await unlink(join(MUSIC, f)).catch(() => {});
      await rm(join(MUSIC, ".rendered"), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }
    if (p === "/api/music/file") {
      const name = url.searchParams.get("name");
      if (!["intro", "outro"].includes(name)) return json(res, 400, { error: "name=intro|outro" });
      const file = join(MUSIC, ".rendered", `${name}.wav`);
      const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "not rendered yet; run the music action" });
      return streamFile(req, res, file, st);
    }

    /* voice reference */
    if (p === "/api/voice/reference" && req.method === "POST") {
      // A clean 10 to 20 second clip of Cory talking. Converted to 24 kHz mono wav.
      await mkdir(VOICE, { recursive: true });
      const tmp = join(VOICE, `upload-${Date.now()}.bin`);
      await saveUpload(req, tmp, 80 * 1024 * 1024);
      const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", tmp, "-t", "25", "-ac", "1", "-ar", "24000", "-af", "loudnorm=I=-20:TP=-2", join(VOICE, "cory-reference.wav")], { encoding: "utf8", windowsHide: true });
      await unlink(tmp).catch(() => {});
      if (r.status !== 0) return json(res, 400, { error: `ffmpeg could not read that file: ${(r.stderr || "").slice(-300)}` });
      return json(res, 200, { ok: true });
    }
    if (p === "/api/voice/file") {
      const name = url.searchParams.get("name") || "cory-reference.wav";
      if (!safeName(name)) return json(res, 400, { error: "bad name" });
      const file = join(VOICE, name); const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "no such file" });
      if (!st) return json(res, 404, { error: "no such file" });
      return streamFile(req, res, file, st);
    }

    /* drafts */
    if (p.startsWith("/api/draft/")) {
      const [id, sub] = p.slice("/api/draft/".length).split("/");
      if (!safeId(id)) return json(res, 400, { error: "bad id" });
      const dir = join(DRAFTS, id);
      const epPath = join(dir, "episode.json");
      if (req.method === "GET" && !sub) { const ep = await readJson(epPath, null); return ep ? json(res, 200, { ...ep, dir, fileList: await listFiles(dir), inProgress: await voiceState(join(dir, "tts"), id), voiceStopped: await voiceStopped(join(dir, "tts")) }) : json(res, 404, { error: "no such draft" }); }
      if (req.method === "GET" && sub === "files") return json(res, 200, await listFiles(dir));
      if (req.method === "PUT" && !sub) {
        const ep = await readJson(epPath, null); if (!ep) return json(res, 404, { error: "no such draft" });
        if (ep.status === "published") return json(res, 409, { error: "published episodes are edited in studio-episodes.json" });
        const body = await readBody(req); if (!body) return json(res, 413, TOO_BIG);
        for (const k of ["title", "hook", "description", "instagramCaption", "publishDate"]) if (typeof body[k] === "string") ep[k] = body[k].trim();
        if (Array.isArray(body.script)) ep.script = body.script.map((s) => String(s).trim()).filter(Boolean);
        if (Array.isArray(body.factsToVerify)) ep.factsToVerify = body.factsToVerify.map(String);
        if (Array.isArray(body.factsChecked)) ep.factsChecked = body.factsChecked.map(Boolean);
        if (body.voice && typeof body.voice === "object") ep.voice = { ...ep.voice, ...body.voice };
        if (typeof body.title === "string") ep.slug = slugify(ep.title) || ep.slug;
        ep.scriptWords = ep.script.join(" ").split(/\s+/).filter(Boolean).length;
        if (Array.isArray(body.script) && ep.status !== "scripted") { ep.status = "scripted"; ep.files = { research: ep.files?.research }; }
        ep.edited = new Date().toISOString();
        await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
        return json(res, 200, { ...ep, fileList: await listFiles(dir) });
      }
      if (req.method === "DELETE" && !sub) {
        const ep = await readJson(epPath, null); if (!ep) return json(res, 404, { error: "no such draft" });
        if (ep.status === "published") return json(res, 409, { error: "published drafts are kept as the record" });
        await rm(dir, { recursive: true, force: true }); return json(res, 200, { ok: true });
      }
      if (sub === "file") {
        const name = url.searchParams.get("name") || "";
        if (!safeName(name) || isHidden(name)) return json(res, 400, { error: "bad name" });
        const file = normalize(join(dir, name));
        if (!file.startsWith(normalize(DRAFTS))) return json(res, 400, { error: "bad path" });
        if (req.method === "DELETE") {
          if (/^episode\.json$/.test(name)) return json(res, 400, { error: "not that one" });
          await unlink(file).catch(() => {}); return json(res, 200, { ok: true });
        }
        const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "no such file" });
        return streamFile(req, res, file, st);
      }
      if (sub === "upload" && req.method === "POST") {
        // Raw body. name is the filename to store (recording.webm, cory-take-2.wav, notes.txt ...).
        const name = url.searchParams.get("name") || "";
        if (!safeName(name) || /^episode\.json$/.test(name)) return json(res, 400, { error: "bad name" });
        if (!(await exists(dir))) return json(res, 404, { error: "no such draft" });
        const size = await saveUpload(req, join(dir, name));
        // Browser recordings arrive as webm/ogg; keep a wav twin so the voice step and Cory's editors can read it.
        let converted = null;
        if (/\.(webm|ogg)$/i.test(name)) {
          const wav = join(dir, name.replace(/\.(webm|ogg)$/i, ".wav"));
          const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", join(dir, name), "-ac", "1", "-ar", "44100", wav], { encoding: "utf8", windowsHide: true });
          if (r.status === 0) converted = basename(wav);
        }
        return json(res, 200, { ok: true, name, size, converted, path: join(dir, converted || name) });
      }
      return json(res, 404, { error: "unknown draft route" });
    }

    /* research projects */
    if (p === "/api/projects" && req.method === "GET") return json(res, 200, await listProjects());
    if (p === "/api/projects" && req.method === "POST") { const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG); try { return json(res, 200, await createProject(b.title)); } catch (e) { return json(res, 400, { error: e.message }); } }
    if (p.startsWith("/api/project/")) {
      const [pid, sub] = p.slice("/api/project/".length).split("/");
      if (!safeId(pid)) return json(res, 400, { error: "bad id" });
      const pdir = join(PROJECTS, pid);
      try {
        if (!sub && req.method === "GET") { const pr = await getProject(pid); return pr ? json(res, 200, pr) : json(res, 404, { error: "no such project" }); }
        if (!sub && req.method === "DELETE") { await deleteProject(pid); return json(res, 200, { ok: true }); }
        if (sub === "note" && req.method === "POST") { const b = await readBody(req); if (!b.text) return json(res, 400, { error: "text" }); await appendNote(pid, b.text, b.source || ""); return json(res, 200, { ok: true }); }
        if (sub === "notes" && req.method === "PUT") { const b = await readBody(req); if (!b) return json(res, 413, TOO_BIG); await saveNotes(pid, String(b.text ?? "")); return json(res, 200, { ok: true }); }
        if (sub === "upload" && req.method === "POST") {
          const name = url.searchParams.get("name") || ""; if (!safeName(name) || /^(project\.json|chat\.json)$/.test(name)) return json(res, 400, { error: "bad name" });
          if (!(await exists(pdir))) return json(res, 404, { error: "no such project" });
          const size = await saveUpload(req, join(pdir, name)); const { touch } = await import("./projects.mjs"); await touch(pid);
          return json(res, 200, { ok: true, name, size });
        }
        if (sub === "file") {
          const name = url.searchParams.get("name") || ""; if (!safeName(name) || isHidden(name)) return json(res, 400, { error: "bad name" });
          const file = normalize(join(pdir, name)); if (!file.startsWith(normalize(PROJECTS))) return json(res, 400, { error: "bad path" });
          if (req.method === "DELETE") { if (/^(project\.json|notes\.md)$/.test(name)) return json(res, 400, { error: "not that one" }); await unlink(file).catch(() => {}); return json(res, 200, { ok: true }); }
          const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "no such file" });
          return streamFile(req, res, file, st);
        }
        if (sub === "chat" && req.method === "POST") { const b = await readBody(req); if (!b.question) return json(res, 400, { error: "question" }); return json(res, 200, await chatProject(pid, String(b.question))); }
        if (sub === "export" && req.method === "POST") return json(res, 200, await exportProject(pid));
        if (sub === "to-episode" && req.method === "POST") {
          const r = await projectToResearch(pid);
          const job = startJob("draft", { case: r.caseSlug, topic: r.title, minutes: 20 });
          const { log, ...rest } = job; return json(res, 202, { ...rest, caseSlug: r.caseSlug });
        }
        if (sub === "open" && req.method === "POST") { spawn("explorer.exe", [pdir], { detached: true, stdio: "ignore" }).unref(); return json(res, 200, { ok: true }); }
      } catch (e) { return json(res, 500, { error: e.message }); }
      return json(res, 404, { error: "unknown project route" });
    }

    /* community: case update review queue */
    if (p === "/api/community/pending") {
      try {
        const rows = await sb("cts_case_updates?select=id,case_slug,happened_on,title,summary,url,source,status,created_at&status=eq.pending&order=created_at.desc&limit=100");
        const cases = Object.fromEntries((await sb("cts_cases?select=slug,title")).map((c) => [c.slug, c.title]));
        const members = (await sb("cts_members?select=id&confirmed_at=not.is.null&unsubscribed_at=is.null"))?.length ?? 0;
        return json(res, 200, { pending: rows.map((r) => ({ ...r, caseTitle: cases[r.case_slug] || r.case_slug })), members, cases: Object.keys(cases).length });
      } catch (e) { return json(res, 200, { pending: [], error: e.message }); }
    }
    if (p === "/api/community/review" && req.method === "POST") {
      const body = await readBody(req); if (!body) return json(res, 413, TOO_BIG);
      const id = parseInt(body.id, 10); const status = body.status;
      if (!Number.isFinite(id) || !["approved", "rejected", "pending"].includes(status)) return json(res, 400, { error: "id + status" });
      const patch = { status, approved_at: status === "approved" ? new Date().toISOString() : null };
      if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 200);
      if (typeof body.summary === "string") patch.summary = body.summary.trim().slice(0, 600);
      if (typeof body.happened_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.happened_on)) patch.happened_on = body.happened_on;
      try { await sb(`cts_case_updates?id=eq.${id}`, { method: "PATCH", body: patch, prefer: "return=minimal" }); return json(res, 200, { ok: true }); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (p === "/api/community/add" && req.method === "POST") {
      // Cory adds an update by hand: approved straight away.
      const body = await readBody(req); if (!body) return json(res, 413, TOO_BIG);
      if (!safeId(body.case) || !body.title) return json(res, 400, { error: "case + title" });
      try {
        await sb("cts_case_updates", { method: "POST", body: { case_slug: body.case, title: String(body.title).slice(0, 200), summary: String(body.summary || "").slice(0, 600), url: String(body.url || "").slice(0, 500), source: String(body.source || "").slice(0, 80), happened_on: /^\d{4}-\d{2}-\d{2}$/.test(body.happened_on || "") ? body.happened_on : new Date().toISOString().slice(0, 10), status: "approved", found_by: "cory", approved_at: new Date().toISOString() }, prefer: "return=minimal" });
        return json(res, 200, { ok: true });
      } catch (e) { return json(res, 500, { error: e.message }); }
    }

    if (p === "/api/run" && req.method === "POST") {
      const body = await readBody(req); if (!body) return json(res, 413, TOO_BIG);
      if (!ACTIONS[body.action]) return json(res, 400, { error: "unknown action" });
      if (body.id && !safeId(body.id)) return json(res, 400, { error: "bad id" });
      if (body.id && running().some((j) => j.draft === body.id)) return json(res, 409, { error: "a job is already running for this draft" });
      if (body.action === "voice" && body.id && (await exists(join(DRAFTS, body.id, "tts")))) {
        // Only block for a render that is actually alive; a crashed one is cleared below.
        if (!(await voiceStopped(join(DRAFTS, body.id, "tts")))) return json(res, 409, { error: "a voice render is already running for this episode. Wait for it to finish." });
        await rm(join(DRAFTS, body.id, "tts"), { recursive: true, force: true });
      }
      // The fact list is a house rule, so it is enforced here too, not only by the button.
      if (body.action === "publish" && body.id && !body.pushOnly) {
        const ep = await readJson(join(DRAFTS, body.id, "episode.json"), null);
        const open = (ep?.factsToVerify || []).filter((_, i) => !(ep.factsChecked || [])[i]).length;
        if (open) return json(res, 409, { error: `${open} claim${open === 1 ? " is" : "s are"} still unticked. Read the Facts tab first.` });
      }
      if (["content", "sync", "build", "publish", "weekly"].includes(body.action) && running().some((j) => ["content", "sync", "build", "publish", "weekly"].includes(j.action))) return json(res, 409, { error: "a site build is already running" });
      // A recording inside the draft folder (browser take or dropped file) is referenced by name only.
      if (body.fromInFolder) {
        if (!safeName(body.fromInFolder) || !body.id) return json(res, 400, { error: "bad recording name" });
        body.from = join(DRAFTS, body.id, body.fromInFolder);
      }
      if (body.from && !(await exists(body.from))) return json(res, 400, { error: `file not found: ${body.from}` });
      const job = startJob(body.action, body);
      const { log, ...rest } = job; return json(res, 202, rest);
    }
    if (p.startsWith("/api/job/")) {
      const job = jobs.get(p.slice("/api/job/".length));
      return job ? json(res, 200, job) : json(res, 404, { error: "no such job" });
    }
    if (p === "/api/jobs") return json(res, 200, [...jobs.values()].map(({ log, ...j }) => j).slice(-20));
    if (p === "/api/open" && req.method === "POST") {
      const body = await readBody(req); if (!body) return json(res, 413, TOO_BIG);
      const target = body.id ? (safeId(body.id) ? join(DRAFTS, body.id) : null) : body.what === "music" ? MUSIC : body.what === "voice" ? VOICE : null;
      if (!target) return json(res, 400, { error: "bad target" });
      await mkdir(target, { recursive: true });
      spawn("explorer.exe", [target], { detached: true, stdio: "ignore" }).unref(); return json(res, 200, { ok: true });
    }
    if (p.startsWith("/site/")) {
      const rel = normalize(decodeURIComponent(p.slice("/site/".length)));
      const file = join(ROOT, rel);
      const top = rel.split(/[\\/]/)[0];
      if (!file.startsWith(ROOT) || rel.includes("..") || !SITE_DIRS.includes(top) || isHidden(rel)) return json(res, 403, { error: "not served" });
      const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "nope" });
      return streamFile(req, res, file, st, true);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

// A render can run for five hours; one malformed request must not end it.
process.on("uncaughtException", (e) => console.error(`[studio] uncaught: ${e?.stack || e}`));
process.on("unhandledRejection", (e) => console.error(`[studio] unhandled rejection: ${e?.stack || e}`));

server.listen(PORT, HOST, () => {
  console.log(`CrimeTimeSnacks Studio  http://${HOST}:${PORT}`);
  console.log("Loopback only; state changes need the X-CTS header from a same-origin page. Ctrl+C to stop.");
});
