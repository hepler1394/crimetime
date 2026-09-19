#!/usr/bin/env node
// Podcast studio: fix what the audio audit caught, without a person and without a full render.
//
//   node automation/episode-repair.mjs <draft-id> [--rounds 3] [--paragraphs 12,39] [--edits edits.json] [--new <dir>] [--json]
//
// The clone is not deterministic in what it gets wrong: the same sentence that came out
// "Capra One" reads correctly on another seed. So for each paragraph episode-audit.mjs flagged,
// render it again with a different seed, transcribe just that paragraph, and accept it only if
// it now matches its text. Up to --rounds tries each. Accepted paragraphs are swapped in by
// episode-splice.mjs on the silent gaps between paragraphs.
//
// --edits lets a person change the script at the same time: { "26": { "script": "...", "spoken": "..." },
// "30": { "drop": true } }. "spoken" is what the clone is asked to say when a spelling trips it
// ("Nomadic Static" for "Nomadic Statik"); the script and transcript keep "script".
// --new points at paragraphs already rendered (pNNN.wav); they are checked like any other try.
//
// What is left unresolved after the last round is reported and recorded in episode.json as
// audioAudit.unresolved, and the publish gate holds on it. Better one held episode and a
// Telegram message than "Capra One" on Apple Podcasts for a week.

import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { compareWords } from "./audio-compare.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(here, "studio");
const VENV_PY = join(STUDIO, ".venv", "Scripts", "python.exe");
const REFERENCE = join(STUDIO, "voice", "cory-reference.wav");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const say = (m) => { if (!asJson) console.log(m); };
if (!id) die("args", "usage: episode-repair.mjs <draft-id> [--rounds 3] [--paragraphs 1,2] [--edits file] [--new dir]");

const dir = join(STUDIO, "drafts", id);
const epPath = join(dir, "episode.json");
const ep = JSON.parse(await readFile(epPath, "utf8").catch(() => die("draft", `No draft ${id}.`)));
const paras = (ep.script || []).filter(Boolean);
const edits = opt("--edits") ? JSON.parse(await readFile(opt("--edits"), "utf8")) : {};
const rounds = Math.max(1, Math.min(5, parseInt(opt("--rounds", "3"), 10) || 3));
const pre = opt("--new", null);

const want = new Set([...(opt("--paragraphs") ? opt("--paragraphs").split(",").map(Number) : (ep.audioAudit?.paragraphs || [])),
  ...Object.keys(edits).filter((k) => edits[k].script).map(Number)]);
for (const k of Object.keys(edits)) if (edits[k].drop) want.delete(+k);
if (!want.size && !Object.values(edits).some((e) => e.drop)) die("nothing", `${id} has nothing flagged. Run episode-audit.mjs first.`);
const textOf = (i) => ({ script: edits[i]?.script || paras[i], spoken: edits[i]?.spoken || edits[i]?.script || paras[i] });

// --recheck: judge the attempts a previous run kept (repair/roundN) again, without rendering or
// transcribing anything. For when the checker was wrong, not the audio: on 2026-09-19 it held the
// Moscow episode because the transcriber writes "Hitler" for a clearly spoken "Hippler".
const recheck = args.includes("--recheck");
const work = join(dir, "repair");
if (!recheck) await rm(work, { recursive: true, force: true });
await rm(join(work, "accepted"), { recursive: true, force: true }); await mkdir(join(work, "accepted"), { recursive: true });
const run = (cmd, a, label, env) => {
  const r = spawnSync(cmd, a, { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: "utf-8", ...(env || {}) } });
  if (r.status !== 0) die(label, `${label}: ${(r.stderr || r.stdout || "").trim().slice(-400)}`);
  return r;
};
const pName = (i) => `p${String(i).padStart(3, "0")}.wav`;

let remaining = [...want].sort((a, b) => a - b);
const accepted = {}, history = {};
for (let r = 1; r <= rounds && remaining.length; r++) {
  const rdir = join(work, `round${r}`); await mkdir(rdir, { recursive: true });
  const kept = recheck && existsSync(join(rdir, "heard.json"));
  const toRender = [];
  for (const i of remaining) {
    if (kept && existsSync(join(rdir, pName(i)))) continue;
    if (r === 1 && pre && existsSync(join(pre, pName(i)))) await copyFile(join(pre, pName(i)), join(rdir, pName(i)));
    else toRender.push(i);
  }
  if (toRender.length) {
    say(`Round ${r}: cloning ${toRender.length} paragraph(s) on seed ${7 + 101 * r}...`);
    const jsonl = join(rdir, "paragraphs.jsonl");
    await writeFile(jsonl, toRender.map((i) => JSON.stringify({ i, text: textOf(i).spoken })).join("\n"), "utf8");
    run(VENV_PY, [join(STUDIO, "tts_clone.py"), "--ref", REFERENCE, "--jsonl", jsonl, "--outdir", rdir, "--exaggeration", String(ep.voice?.exaggeration ?? 0.45), "--cfg", String(ep.voice?.cfg ?? 0.5), "--seed", String(7 + 101 * r)], "chatterbox");
  }
  say(`Round ${r}: listening to ${remaining.length} paragraph(s)...`);
  const files = remaining.map((i) => join(rdir, pName(i)));
  const heard = join(rdir, "heard.json");
  if (!(kept && !toRender.length)) run("python", [join(STUDIO, "asr_words.py"), "--batch", heard, ...files], "faster-whisper");
  const words = JSON.parse(await readFile(heard, "utf8"));
  const next = [];
  for (const i of remaining) {
    const f = join(rdir, pName(i));
    const { findings } = compareWords([textOf(i).spoken], words[f] || [], ep.audioOk || []);
    (history[i] ||= []).push({ round: r, findings: findings.map((x) => `${x.kind}: ${x.text}`) });
    if (findings.length) { next.push(i); say(`  paragraph ${i}: still wrong (${findings[0].text})`); }
    else { accepted[i] = f; await copyFile(f, join(work, "accepted", pName(i))); say(`  paragraph ${i}: clean`); }
  }
  remaining = next;
}

/* swap in what passed, plus any drops; a paragraph that never came out right keeps its old audio */
const spliceEdits = {};
for (const k of Object.keys(edits)) if (edits[k].drop) spliceEdits[k] = { drop: true };
for (const i of Object.keys(accepted)) spliceEdits[i] = { script: textOf(+i).script };
let spliced = null;
if (Object.keys(spliceEdits).length) {
  const ef = join(work, "splice-edits.json"); await writeFile(ef, JSON.stringify(spliceEdits, null, 1), "utf8");
  const r = run(process.execPath, [join(here, "episode-splice.mjs"), id, "--edits", ef, "--new", join(work, "accepted"), "--json"], "episode-splice");
  spliced = JSON.parse(r.stdout.trim().split("\n").reverse().find((l) => l.startsWith("{")));
  if (!spliced?.ok) die("splice", spliced?.message || "splice failed");
}

// Paragraph numbers move when paragraphs are dropped; report the unresolved ones in the new numbering.
const drops = Object.keys(spliceEdits).filter((k) => spliceEdits[k].drop).map(Number);
const renum = (i) => i - drops.filter((d) => d < i).length;
const fresh = JSON.parse(await readFile(epPath, "utf8"));
fresh.audioAudit = { ...(fresh.audioAudit || {}), at: new Date().toISOString(), repaired: Object.keys(accepted).map(Number).map(renum), unresolved: remaining.map(renum),
  paragraphs: remaining.map(renum), findings: remaining.length, clean: remaining.length === 0, seconds: spliced?.seconds ?? fresh.audioAudit?.seconds, history };
await writeFile(epPath, JSON.stringify(fresh, null, 2) + "\n", "utf8");
// Keep the attempts when something is still unresolved: they are minutes of CPU each, and a
// person (or a tuned checker) may find one of them was fine all along.
if (!remaining.length) await rm(work, { recursive: true, force: true });
out({ ok: true, id, clean: remaining.length === 0, repaired: Object.keys(accepted).length, dropped: drops.length, unresolved: remaining.map(renum), duration: spliced?.duration || fresh.duration,
  message: `Repaired ${id}: ${Object.keys(accepted).length} paragraph(s) re-voiced and verified, ${drops.length} dropped${remaining.length ? `, ${remaining.length} still wrong after ${rounds} tries (paragraphs ${remaining.map(renum).join(", ")})` : ""}. Now ${spliced?.duration || fresh.duration}.` });
