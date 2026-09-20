#!/usr/bin/env node
// Render an episode's paragraphs on a rented GPU box instead of this CPU.
//
// Deliberately a drop-in for tts_clone.py: it takes the same --ref/--jsonl/--outdir
// /--exaggeration/--cfg/--seed arguments and leaves the same pNNN.wav files in
// --outdir, so episode-voice.mjs swaps one command for the other and everything
// downstream (join, master, music, audit) is untouched.
//
//   node automation/render-remote.mjs --check
//   node automation/render-remote.mjs --ref <wav> --jsonl <file> --outdir <dir> [--dry-run]
//
// The box is described by automation/render-host.json (gitignored, never committed):
//
//   { "host": "213.0.0.1", "port": 22, "user": "root",
//     "identity": "C:/Users/Cory/.ssh/runpod_ed25519",
//     "workdir": "/workspace/cts", "python": "python",
//     "setup": "pip install -q chatterbox-tts" }
//
// Provider-agnostic on purpose: anything reachable over SSH works (RunPod, Vast,
// Lambda, a box in the corner), so the show is never tied to one vendor's API.
//
// Only the paragraphs missing from --outdir are sent, so a render interrupted
// halfway costs the paragraphs it had left, not the whole episode.

import { readFile, writeFile, mkdir, readdir, rm, stat, access, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(__dirname, "studio");
const CONFIG = join(__dirname, "render-host.json");

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const dryRun = args.includes("--dry-run");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const say = (m) => { if (asJson) console.error(m); else console.log(m); };
const die = (step, message, code = 2) => { out({ ok: false, step, message }); process.exit(code); };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

// --- the box -----------------------------------------------------------------

async function loadHost() {
  const path = opt("--config", CONFIG);
  if (!(await exists(path))) {
    die("config", `No render host configured. Write ${path} with {host, user, identity, workdir}. See the header of this file.`);
  }
  let cfg;
  try { cfg = JSON.parse(await readFile(path, "utf8")); }
  catch (e) { die("config", `${path} is not valid JSON: ${e.message}`); }
  for (const k of ["host", "user"]) if (!cfg[k]) die("config", `${path} is missing "${k}".`);
  return {
    host: cfg.host,
    port: String(cfg.port || 22),
    user: cfg.user,
    identity: cfg.identity || null,
    workdir: cfg.workdir || "/workspace/cts",
    python: cfg.python || "python",
    setup: cfg.setup || "",
    transport: opt("--transport", cfg.transport || "ssh"),
  };
}

// SSH flags that keep this non-interactive: a rented box is new every time, so
// accept-new rather than hanging on a host-key prompt, and never fall back to a
// password prompt that nothing is there to answer.
const sshFlags = (h) => [
  "-p", h.port,
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=20",
  "-o", "ServerAliveInterval=30",
  ...(h.identity ? ["-i", h.identity] : []),
];

const scpFlags = (h) => [
  "-P", h.port,
  "-o", "StrictHostKeyChecking=accept-new",
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=20",
  ...(h.identity ? ["-i", h.identity] : []),
];

function sh(cmd, argv, { cwd, label, capture = false, allowFail = false } = {}) {
  if (dryRun) { say(`  [dry-run] ${cmd} ${argv.join(" ")}`); return { stdout: "", stderr: "", status: 0 }; }
  const r = spawnSync(cmd, argv, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    stdio: capture ? "pipe" : ["ignore", "inherit", "pipe"],
  });
  if (r.error) { if (allowFail) return { ...r, status: -1 }; die(label || cmd, r.error.message); }
  if (r.status !== 0 && !allowFail) {
    const tail = String(r.stderr || "").trim().split("\n").slice(-6).join("\n");
    die(label || cmd, `exit ${r.status}${tail ? `: ${tail}` : ""}`);
  }
  return r;
}

// Backslashes are escapes to a POSIX shell, and Git Bash understands "D:/x".
const posix = (p) => String(p).replace(/\\/g, "/");

// Run a command on the box. The "local" transport runs the identical command
// string through a POSIX shell here instead, which is how the staging, ordering
// and collection logic gets exercised end to end without a GPU in the loop.
function remote(h, command, o = {}) {
  if (h.transport === "local") return sh("sh", ["-c", command], o);
  return sh("ssh", [...sshFlags(h), `${h.user}@${h.host}`, command], o);
}

// Copy local files up. scp on Windows reads "D:\x" as host "D", so every copy
// runs with cwd set to the file's folder and passes a bare filename.
function push(h, localPath, remoteDir) {
  const dir = dirname(localPath), name = basename(localPath);
  if (h.transport === "local") {
    sh("sh", ["-c", `cp "${name}" "${posix(remoteDir)}/"`], { cwd: dir, label: "copy up", capture: true });
    return;
  }
  sh("scp", [...scpFlags(h), name, `${h.user}@${h.host}:${remoteDir}/`], { cwd: dir, label: "scp up", capture: true });
}

function pull(h, remoteGlob, localDir) {
  if (h.transport === "local") {
    sh("sh", ["-c", `cp ${posix(remoteGlob)} .`], { cwd: localDir, label: "copy back", capture: true });
    return;
  }
  sh("scp", [...scpFlags(h), `${h.user}@${h.host}:${remoteGlob}`, "."], { cwd: localDir, label: "scp down", capture: true });
}

// --- what still needs rendering ----------------------------------------------

// Pure, so it can be tested without a box: given the full plan and whatever wavs
// already exist, return only the lines still to render.
export function pending(planLines, haveFiles) {
  const have = new Set(haveFiles.filter((f) => /^p\d+\.wav$/.test(f)));
  const todo = [];
  for (const line of planLines) {
    if (!line.trim()) continue;
    const j = JSON.parse(line);
    const name = `p${String(j.i).padStart(3, "0")}.wav`;
    if (!have.has(name)) todo.push({ line, i: j.i, name });
  }
  return todo;
}

// --- check --------------------------------------------------------------------

const PROBE = [
  "import json,platform,sys",
  "d={'python':platform.python_version(),'host':platform.node()}",
  "try:",
  "    import torch; d['torch']=torch.__version__; d['cuda']=torch.cuda.is_available()",
  "    d['gpu']=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None",
  "except Exception as e: d['torch']='missing: %s'%e",
  "try:",
  "    import chatterbox; d['chatterbox']=getattr(chatterbox,'__version__','present')",
  "except Exception as e: d['chatterbox']='missing: %s'%e",
  "print(json.dumps(d))",
].join("\n");

async function check(h) {
  say(`Checking ${h.user}@${h.host}:${h.port} over ${h.transport}...`);
  const who = remote(h, "hostname", { capture: true, label: "ssh", allowFail: true });
  if (who.status !== 0) {
    die("ssh", `cannot reach ${h.user}@${h.host}:${h.port}. ${String(who.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
  }
  say(`  reachable, remote hostname: ${String(who.stdout).trim()}`);
  const b64 = Buffer.from(PROBE, "utf8").toString("base64");
  const probe = remote(h, `${h.python} -c "import base64;exec(base64.b64decode('${b64}').decode())"`, { capture: true, label: "probe", allowFail: true });
  let info = null;
  try { info = JSON.parse(String(probe.stdout).trim().split("\n").pop()); } catch { /* reported below */ }
  if (!info) die("probe", `could not read the remote environment: ${String(probe.stderr || probe.stdout).trim().slice(-400)}`);
  const ready = info.cuda === true && !String(info.chatterbox).startsWith("missing");
  out({
    ok: true, ready, step: "check", host: h.host, remote: info,
    message: [
      `Remote ${info.host}: python ${info.python}, torch ${info.torch}`,
      `  cuda available : ${info.cuda}${info.gpu ? ` (${info.gpu})` : ""}`,
      `  chatterbox     : ${info.chatterbox}`,
      ready ? "Ready to render." : "NOT ready: fix the missing pieces above (setup runs pip install chatterbox-tts).",
    ].join("\n"),
  });
}

// --- render -------------------------------------------------------------------

async function render(h) {
  const ref = opt("--ref", join(STUDIO, "voice", "cory-reference.wav"));
  const jsonl = opt("--jsonl", null);
  const outdir = opt("--outdir", null);
  if (!jsonl || !outdir) die("args", "need --jsonl and --outdir (same as tts_clone.py)");
  if (!(await exists(ref))) die("ref", `reference voice not found: ${ref}`);
  if (!(await exists(jsonl))) die("jsonl", `plan not found: ${jsonl}`);
  await mkdir(outdir, { recursive: true });

  const planLines = (await readFile(jsonl, "utf8")).split("\n");
  const have = await readdir(outdir).catch(() => []);
  const todo = pending(planLines, have);
  const total = planLines.filter((l) => l.trim()).length;
  if (!todo.length) { out({ ok: true, step: "render", rendered: 0, total, message: `All ${total} paragraphs are already rendered; nothing to send.` }); return; }
  say(`${todo.length} of ${total} paragraphs still to render; sending them to ${h.host}.`);

  // A run gets its own remote folder so the collect step can take everything in
  // it without guessing which files are new.
  const stamp = `${basename(outdir.replace(/[\\/]+$/, ""))}-${Date.now().toString(36)}`;
  const rdir = `${h.workdir}/${stamp}`;
  const rout = `${rdir}/out`;
  remote(h, `mkdir -p "${rout}"`, { capture: true, label: "mkdir" });

  // Ship the renderer itself, so the box always runs this repo's version and the
  // two can never drift apart.
  const stage = join(outdir, ".remote");
  await mkdir(stage, { recursive: true });
  const localPlan = join(stage, "plan.jsonl");
  await writeFile(localPlan, todo.map((t) => t.line).join("\n") + "\n", "utf8");

  push(h, join(STUDIO, "tts_clone.py"), rdir);
  push(h, ref, rdir);
  push(h, localPlan, rdir);

  if (h.setup) { say(`  setup: ${h.setup}`); remote(h, `cd "${rdir}" && ${h.setup}`, { label: "setup" }); }

  const exaggeration = opt("--exaggeration", "0.45");
  const cfg = opt("--cfg", "0.5");
  const seed = opt("--seed", "7");
  const device = opt("--device", "cuda");
  const cmd = `cd "${rdir}" && ${h.python} tts_clone.py`
    + ` --ref "${basename(ref)}" --jsonl "plan.jsonl" --outdir "out"`
    + ` --exaggeration ${exaggeration} --cfg ${cfg} --seed ${seed} --device ${device}`;
  const t0 = Date.now();
  remote(h, cmd, { label: "remote render" });
  const wall = (Date.now() - t0) / 1000;

  pull(h, `${rout}/*.wav`, outdir);

  const after = await readdir(outdir).catch(() => []);
  const got = todo.filter((t) => after.includes(t.name));
  const missing = todo.filter((t) => !after.includes(t.name));
  await rm(stage, { recursive: true, force: true }).catch(() => {});
  if (!dryRun) remote(h, `rm -rf "${rdir}"`, { capture: true, label: "cleanup", allowFail: true });

  if (missing.length) {
    die("collect", `${missing.length} paragraph(s) did not come back: ${missing.slice(0, 8).map((m) => m.name).join(", ")}`);
  }
  out({
    ok: true, step: "render", rendered: got.length, total, seconds: Math.round(wall),
    message: `Rendered ${got.length} paragraph(s) on ${h.host} in ${Math.round(wall)}s.`,
  });
}

// --- main ---------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith("render-remote.mjs")) {
  const h = await loadHost();
  if (args.includes("--check")) await check(h);
  else await render(h);
}
