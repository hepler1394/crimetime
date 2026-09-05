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
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, readdir, stat, rm, mkdir, access, unlink } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, extname, normalize, basename } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTO = join(HERE, "..");
const ROOT = join(AUTO, "..");
const DRAFTS = join(HERE, "drafts");
const MUSIC = join(HERE, "music");
const VOICE = join(HERE, "voice");
const PORT = parseInt(process.env.STUDIO_PORT || "4177", 10);
const HOST = "127.0.0.1";

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".mp3": "audio/mpeg", ".wav": "audio/wav", ".webm": "audio/webm", ".m4a": "audio/mp4", ".ogg": "audio/ogg", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };
const json = (res, code, body) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(body)); };
const readBody = (req) => new Promise((resolve) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } }); });
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
  draft:    (a) => ["episode-draft.mjs", ...(a.topic ? [a.topic] : ["--auto"]), "--minutes", String(a.minutes || 20), "--json"],
  voice:    (a) => ["episode-voice.mjs", a.id, ...(a.engine ? ["--engine", a.engine] : []), ...(a.voice ? ["--voice", a.voice] : []), ...(a.rate ? ["--rate", a.rate] : []), ...(a.pitch ? ["--pitch", a.pitch] : []),
                    ...(a.exaggeration ? ["--exaggeration", String(a.exaggeration)] : []), ...(a.cfg ? ["--cfg", String(a.cfg)] : []), ...(a.from ? ["--from", a.from] : []), ...(a.noMusic ? ["--no-music"] : []), ...(a.noTrim ? ["--no-trim"] : []), "--json"],
  art:      (a) => ["episode-art.mjs", a.id, "--json"],
  social:   (a) => ["episode-social.mjs", a.id, "--clip", String(a.clip || 45), "--start", String(a.start || 0), "--json"],
  publish:  (a) => ["episode-publish.mjs", a.id, ...(a.push === false ? [] : ["--push"]), ...(a.date ? ["--date", a.date] : []), "--json"],
  music:    () => ["episode-music.mjs", "--json"],
  build:    () => ["build-all.mjs"],
  sync:     () => ["import-feed.mjs"],
  content:  () => ["weekly-update.mjs", "--commit", "--push"],
  fbi:      () => ["import-fbi.mjs"],
  qa:       () => ["check-links.mjs"],
  avatar:   () => ["episode-art.mjs", "--avatar", "--json"],
  weekly:   (a) => ["episode-weekly.mjs", ...(a.engine ? ["--engine", a.engine] : [])],
};
function startJob(action, a) {
  const argv = ACTIONS[action](a);
  const id = `j${++jobSeq}`;
  const job = { id, action, draft: a.id || null, started: Date.now(), done: false, code: null, log: "", result: null };
  jobs.set(id, job);
  const child = spawn(process.execPath, [join(AUTO, argv[0]), ...argv.slice(1)], { cwd: ROOT, windowsHide: true, env: { ...process.env, FORCE_COLOR: "0", PYTHONIOENCODING: "utf-8" } });
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
async function health() {
  const [git, tasks, lm, log, status, cases, studioEps, eps, music, voice] = await Promise.all([
    (async () => {
      sh("git", ["fetch", "--quiet", "origin"], 20000);
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
  const tools = { edgeTts: !!sh("edge-tts", ["--help"], 8000), ffmpeg: !!sh("ffmpeg", ["-version"], 8000) };
  return {
    now: new Date().toISOString(), git, tasks, lmStudio: lm, cronTail: log, status, tools, music, voice,
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
    outList.push({ id: ep.id || d, title: ep.title, status: ep.status, created: ep.created, caseSlug: ep.caseSlug, duration: ep.duration || null, scriptWords: ep.scriptWords, files: ep.files || {}, factsToVerify: (ep.factsToVerify || []).length, publishedAt: ep.publishedAt || null, researched: !!ep.researched || !!ep.files?.research });
  }
  return outList.sort((a, b) => (b.created || "").localeCompare(a.created || ""));
}
async function listFiles(dir) {
  const names = await readdir(dir).catch(() => []);
  const files = [];
  for (const n of names) { const st = await stat(join(dir, n)).catch(() => null); if (st?.isFile()) files.push({ name: n, size: st.size, mtime: st.mtime.toISOString() }); }
  return files.sort((a, b) => a.name.localeCompare(b.name));
}
function streamFile(req, res, file, st) {
  const ext = extname(file).toLowerCase();
  const range = req.headers.range;
  if (range && /^(audio|video)\//.test(MIME[ext] || "")) {
    const [s, e] = range.replace("bytes=", "").split("-").map((n) => parseInt(n, 10));
    const start = s || 0, end = Number.isFinite(e) ? e : st.size - 1;
    res.writeHead(206, { "Content-Type": MIME[ext], "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Length": st.size, "Cache-Control": "no-store", "Accept-Ranges": "bytes" });
  createReadStream(file).pipe(res);
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
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}`);
  const p = url.pathname;
  try {
    if (p === "/" || p === "/index.html") {
      const html = await readFile(join(HERE, "studio.html"));
      res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" }); return res.end(html);
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
      const st = await stat(file).catch(() => null); if (!st) return json(res, 404, { error: "not rendered yet; run the music action" });
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
      const file = join(VOICE, name); const st = await stat(file).catch(() => null);
      if (!st) return json(res, 404, { error: "no such file" });
      return streamFile(req, res, file, st);
    }

    /* drafts */
    if (p.startsWith("/api/draft/")) {
      const [id, sub] = p.slice("/api/draft/".length).split("/");
      if (!safeId(id)) return json(res, 400, { error: "bad id" });
      const dir = join(DRAFTS, id);
      const epPath = join(dir, "episode.json");
      if (req.method === "GET" && !sub) { const ep = await readJson(epPath, null); return ep ? json(res, 200, { ...ep, fileList: await listFiles(dir) }) : json(res, 404, { error: "no such draft" }); }
      if (req.method === "GET" && sub === "files") return json(res, 200, await listFiles(dir));
      if (req.method === "PUT" && !sub) {
        const ep = await readJson(epPath, null); if (!ep) return json(res, 404, { error: "no such draft" });
        if (ep.status === "published") return json(res, 409, { error: "published episodes are edited in studio-episodes.json" });
        const body = await readBody(req);
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
        if (!safeName(name)) return json(res, 400, { error: "bad name" });
        const file = normalize(join(dir, name));
        if (!file.startsWith(normalize(DRAFTS))) return json(res, 400, { error: "bad path" });
        if (req.method === "DELETE") {
          if (/^episode\.json$/.test(name)) return json(res, 400, { error: "not that one" });
          await unlink(file).catch(() => {}); return json(res, 200, { ok: true });
        }
        const st = await stat(file).catch(() => null); if (!st) return json(res, 404, { error: "no such file" });
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

    if (p === "/api/run" && req.method === "POST") {
      const body = await readBody(req);
      if (!ACTIONS[body.action]) return json(res, 400, { error: "unknown action" });
      if (body.id && !safeId(body.id)) return json(res, 400, { error: "bad id" });
      if (body.id && running().some((j) => j.draft === body.id)) return json(res, 409, { error: "a job is already running for this draft" });
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
      const body = await readBody(req);
      const target = body.id ? (safeId(body.id) ? join(DRAFTS, body.id) : null) : body.what === "music" ? MUSIC : body.what === "voice" ? VOICE : null;
      if (!target) return json(res, 400, { error: "bad target" });
      await mkdir(target, { recursive: true });
      spawn("explorer.exe", [target], { detached: true, stdio: "ignore" }).unref(); return json(res, 200, { ok: true });
    }
    if (p.startsWith("/site/")) {
      const rel = normalize(p.slice("/site/".length));
      const file = join(ROOT, rel);
      if (!file.startsWith(ROOT) || rel.includes("..")) return json(res, 400, { error: "bad path" });
      const st = await stat(file).catch(() => null); if (!st?.isFile()) return json(res, 404, { error: "nope" });
      return streamFile(req, res, file, st);
    }
    json(res, 404, { error: "not found" });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`CrimeTimeSnacks Studio  http://${HOST}:${PORT}`);
  console.log("Local only. Ctrl+C to stop.");
});
