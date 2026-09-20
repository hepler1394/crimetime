#!/usr/bin/env node
// Render an episode's paragraphs through fal's hosted Chatterbox instead of this CPU.
//
// Another drop-in for tts_clone.py: same --ref/--jsonl/--outdir/--exaggeration/--cfg
// /--seed, same pNNN.wav in --outdir, so episode-voice.mjs swaps one command for
// the other and joining, mastering, music and the audit are untouched.
//
//   node automation/render-fal.mjs --check
//   node automation/render-fal.mjs --ref <wav> --jsonl <file> --outdir <dir> [--limit 2]
//
// fal-ai/chatterbox/text-to-speech is the same Resemble AI model the studio runs
// locally, and it takes the same knobs: audio_url is the reference voice,
// exaggeration, cfg and seed all map straight across. Because it is a queue, the
// chunks go out in parallel, so an episode is minutes rather than six hours.
//
// The chunking below is a deliberate transcription of chunk() in tts_clone.py.
// It is NOT an optimisation target: the 250-character pieces and the 0.28s breath
// between them are what the published episodes sound like, and sending whole
// paragraphs instead (fal allows 5000 characters) would change the read.
//
// FAL_KEY comes from automation/.env.fal, which is gitignored.

import { readFile, writeFile, mkdir, readdir, rm, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(here, "studio");
const ENV_FAL = join(here, ".env.fal");
const ENDPOINT = "https://fal.run/fal-ai/chatterbox/text-to-speech";
const UPLOAD_INIT = "https://rest.alpha.fal.ai/storage/upload/initiate";
const MAX_CHARS = 250;
const BREATH_SECONDS = 0.28;
const SAMPLE_RATE = 24000;

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const say = (m) => { if (asJson) console.error(m); else console.log(m); };
const die = (step, message, code = 2) => { out({ ok: false, step, message }); process.exit(code); };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

async function falKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  if (!(await exists(ENV_FAL))) {
    die("key", `No FAL_KEY. Put it in ${ENV_FAL} as FAL_KEY=... (that file is gitignored), or set the environment variable.`);
  }
  const raw = await readFile(ENV_FAL, "utf8");
  const m = raw.match(/FAL_KEY\s*=\s*(\S+)/);
  if (!m) die("key", `${ENV_FAL} has no FAL_KEY=... line.`);
  return m[1].trim();
}

// --- exactly tts_clone.py's chunk() ------------------------------------------

export function chunk(text, limit = MAX_CHARS) {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const outPieces = [];
  let buf = "";
  for (const s of sentences) {
    if (s.length > limit) {
      for (const piece of s.split(/(?<=,)\s+/)) {
        if (buf.length + piece.length + 1 > limit && buf) { outPieces.push(buf.trim()); buf = ""; }
        buf += (buf ? " " : "") + piece;
      }
      continue;
    }
    if (buf.length + s.length + 1 > limit && buf) { outPieces.push(buf.trim()); buf = ""; }
    buf += (buf ? " " : "") + s;
  }
  if (buf.trim()) outPieces.push(buf.trim());
  return outPieces.length ? outPieces : [text];
}

// --- fal ----------------------------------------------------------------------

async function falFetch(url, init, key, label, tries = 3) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const c = new AbortController();
      const timer = setTimeout(() => c.abort(), 180000);
      const r = await fetch(url, { ...init, signal: c.signal, headers: { Authorization: `Key ${key}`, ...(init.headers || {}) } });
      clearTimeout(timer);
      if (r.ok) return r;
      const body = await r.text().catch(() => "");
      last = `${r.status} ${body.slice(0, 300)}`;
      // Auth and payment problems will not improve on a retry.
      if (r.status === 401 || r.status === 403 || r.status === 402) break;
    } catch (e) { last = e.message; }
    if (i < tries) await new Promise((res) => setTimeout(res, 1500 * i));
  }
  throw new Error(`${label}: ${last}`);
}

// fal's storage gives a public URL for the reference voice. Uploaded once per run
// and reused for every chunk, rather than sending the wav 150 times.
async function uploadReference(ref, key) {
  const bytes = await readFile(ref);
  const init = await falFetch(UPLOAD_INIT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_name: basename(ref), content_type: "audio/wav" }),
  }, key, "upload initiate");
  const { upload_url, file_url } = await init.json();
  const put = await fetch(upload_url, { method: "PUT", body: bytes, headers: { "content-type": "audio/wav" } });
  if (!put.ok) throw new Error(`upload put: ${put.status}`);
  return file_url;
}

async function speak({ text, audioUrl, exaggeration, cfg, seed, key }) {
  const r = await falFetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, audio_url: audioUrl, exaggeration: Number(exaggeration), cfg: Number(cfg), seed: Number(seed) }),
  }, key, "chatterbox");
  const j = await r.json();
  const url = j?.audio?.url;
  if (!url) throw new Error(`chatterbox returned no audio: ${JSON.stringify(j).slice(0, 300)}`);
  const wav = await fetch(url);
  if (!wav.ok) throw new Error(`fetching rendered audio: ${wav.status}`);
  return Buffer.from(await wav.arrayBuffer());
}

// --- assembly -----------------------------------------------------------------

function ff(argv, label) {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...argv], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${label}: ${String(r.stderr || "").trim().slice(-300)}`);
}

// Same shape as the local render: pieces at 24 kHz mono, a short breath between
// them, nothing between the last piece and the end.
async function assemble(pieceFiles, dest, workdir) {
  if (pieceFiles.length === 1) {
    ff(["-i", pieceFiles[0], "-ac", "1", "-ar", String(SAMPLE_RATE), dest], "ffmpeg single");
    return;
  }
  const breath = join(workdir, "breath.wav");
  if (!(await exists(breath))) {
    ff(["-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`, "-t", String(BREATH_SECONDS), breath], "ffmpeg breath");
  }
  const listFile = join(workdir, `${basename(dest, ".wav")}.list`);
  const seq = [];
  for (let i = 0; i < pieceFiles.length; i++) {
    seq.push(pieceFiles[i]);
    if (i < pieceFiles.length - 1) seq.push(breath);
  }
  await writeFile(listFile, seq.map((f) => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  ff(["-f", "concat", "-safe", "0", "-i", listFile, "-ac", "1", "-ar", String(SAMPLE_RATE), dest], "ffmpeg concat");
  await rm(listFile, { force: true });
}

// --- main ---------------------------------------------------------------------

async function check(key) {
  const r = await falFetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: "Testing the render path.", exaggeration: 0.45, cfg: 0.5, seed: 7 }),
  }, key, "chatterbox");
  const j = await r.json();
  out({ ok: true, step: "check", audio: !!j?.audio?.url, message: j?.audio?.url ? "fal reached, chatterbox answered, credit is being spent correctly." : `fal answered oddly: ${JSON.stringify(j).slice(0, 200)}` });
}

async function render(key) {
  const ref = opt("--ref", join(STUDIO, "voice", "cory-reference.wav"));
  const jsonl = opt("--jsonl", null);
  const outdir = opt("--outdir", null);
  if (!jsonl || !outdir) die("args", "need --jsonl and --outdir (same as tts_clone.py)");
  if (!(await exists(ref))) die("ref", `reference voice not found: ${ref}`);
  if (!(await exists(jsonl))) die("jsonl", `plan not found: ${jsonl}`);
  await mkdir(outdir, { recursive: true });

  const exaggeration = opt("--exaggeration", "0.45");
  const cfg = opt("--cfg", "0.5");
  const seed = opt("--seed", "7");
  const conc = Math.max(1, Number(opt("--concurrency", "6")));
  const limit = Number(opt("--limit", "0")); // render at most N paragraphs; 0 means all

  const have = new Set((await readdir(outdir).catch(() => [])).filter((f) => /^p\d+\.wav$/.test(f)));
  let todo = [];
  for (const line of (await readFile(jsonl, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    const name = `p${String(j.i).padStart(3, "0")}.wav`;
    if (!have.has(name)) todo.push({ i: j.i, name, text: j.text.trim() });
  }
  const total = todo.length + have.size;
  if (limit > 0) todo = todo.slice(0, limit);
  if (!todo.length) { out({ ok: true, step: "render", rendered: 0, message: "Every paragraph is already rendered; nothing sent to fal." }); return; }

  const work = join(outdir, ".fal");
  await mkdir(work, { recursive: true });
  say(`Uploading the reference voice...`);
  const audioUrl = await uploadReference(ref, key);

  const pieces = todo.map((t) => ({ ...t, parts: chunk(t.text) }));
  const calls = pieces.reduce((n, p) => n + p.parts.length, 0);
  say(`${todo.length} paragraph(s), ${calls} chunk(s) to fal, ${conc} at a time.`);

  let done = 0, failed = null;
  const t0 = Date.now();
  // One worker per paragraph slot: chunks inside a paragraph stay ordered, while
  // separate paragraphs render at the same time.
  const queue = [...pieces];
  async function worker() {
    while (queue.length && !failed) {
      const p = queue.shift();
      try {
        const files = [];
        for (let k = 0; k < p.parts.length; k++) {
          const buf = await speak({ text: p.parts[k], audioUrl, exaggeration, cfg, seed, key });
          const f = join(work, `${p.name.replace(".wav", "")}-${k}.wav`);
          await writeFile(f, buf);
          files.push(f);
        }
        await assemble(files, join(outdir, p.name), work);
        for (const f of files) await rm(f, { force: true });
        done++;
        say(`  ${p.name}: ${p.parts.length} piece(s) (${done}/${pieces.length})`);
      } catch (e) { failed = `${p.name}: ${e.message}`; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, pieces.length) }, worker));
  await rm(work, { recursive: true, force: true }).catch(() => {});
  if (failed) die("render", failed);

  const wall = Math.round((Date.now() - t0) / 1000);
  out({ ok: true, step: "render", rendered: done, chunks: calls, total, seconds: wall,
        message: `Rendered ${done} paragraph(s) in ${wall}s through fal (${calls} chunks).` });
}

if (process.argv[1] && process.argv[1].endsWith("render-fal.mjs")) {
  const key = await falKey();
  if (args.includes("--check")) await check(key);
  else await render(key);
}
