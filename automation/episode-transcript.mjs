#!/usr/bin/env node
// Rebuilds a draft's transcript.json from its SCRIPT, timed against its voice track, and
// with --publish installs it as the public transcript of the published episode.
//
//   node automation/episode-transcript.mjs <draft-id> [--publish] [--json]
//   node automation/episode-transcript.mjs --all-published [--publish] [--json]
//
// Why: see script-transcript.mjs. Every episode voiced before 2026-09-24 shipped a
// faster-whisper guess as its transcript. This reads the paragraph boundaries back out of
// voice.wav (against audit-words.json when the audit left one for this render, else by
// fitting paragraph lengths) and lays the script over them.
//
// It never touches audio and never changes episode.json's script, so it is safe on a draft
// that has been voiced, audited and published. Run build-all afterwards.

import { readFile, writeFile, copyFile, stat, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { paragraphSpans, probe } from "./audio-paragraphs.mjs";
import { segmentsFromSpans, transcriptDoc, SCRIPT_MODEL } from "./script-transcript.mjs";
import { VOICE_STARTS_AT } from "./episode-music.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(__dirname, "studio", "drafts");
const PUBLIC = join(__dirname, "transcripts");
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const publish = args.includes("--publish");
const all = args.includes("--all-published");
const id = args.find((a) => !a.startsWith("--"));
const say = (m) => { if (!asJson) console.log(m); };
const mtime = async (p) => (await stat(p).then((s) => s.mtimeMs, () => 0));

async function rebuild(draftId) {
  const dir = join(DRAFTS, draftId);
  const ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8"));
  const paras = (ep.script || []).filter(Boolean);
  const voice = join(dir, "voice.wav");
  if (!paras.length) throw new Error(`${draftId}: empty script`);
  if (!existsSync(voice)) throw new Error(`${draftId}: no voice.wav`);
  const wordsFile = join(dir, "audit-words.json");
  let words = null;
  if (existsSync(wordsFile) && (await mtime(wordsFile)) >= (await mtime(voice))) {
    words = JSON.parse(await readFile(wordsFile, "utf8")).words || null;
  }
  const bounds = paragraphSpans(voice, paras, { words });
  if (!bounds.ok) throw new Error(`${draftId}: ${bounds.why}. Run episode-audit.mjs so the joins can be read against a transcript.`);
  const offset = ep.music === false ? 0.5 : VOICE_STARTS_AT;
  const segments = segmentsFromSpans(paras, bounds.spans, offset);
  const mp3 = join(dir, "episode.mp3");
  const seconds = existsSync(mp3) ? probe(mp3) : ep.durationSeconds || bounds.total + offset;
  const doc = transcriptDoc({ slug: ep.slug, title: ep.title, seconds, segments, how: `${SCRIPT_MODEL} (${bounds.how === "transcript" ? "paragraphs read against the audit transcript" : `paragraphs by ${bounds.how}`})` });
  await writeFile(join(dir, "transcript.json"), JSON.stringify(doc, null, 1), "utf8");
  let published = false;
  if (publish && ep.status === "published") {
    await copyFile(join(dir, "transcript.json"), join(PUBLIC, `${ep.slug}.json`));
    published = true;
  }
  return { id: draftId, slug: ep.slug, paragraphs: paras.length, segments: segments.length, how: bounds.how, extraPauses: bounds.extra.length, published };
}

const targets = [];
if (all) {
  for (const d of (await readdir(DRAFTS)).sort()) {
    try {
      const ep = JSON.parse(await readFile(join(DRAFTS, d, "episode.json"), "utf8"));
      if (ep.status === "published" && existsSync(join(DRAFTS, d, "voice.wav"))) targets.push(d);
    } catch { /* not a draft */ }
  }
} else if (id) targets.push(id);
else { console.error("usage: episode-transcript.mjs <draft-id> [--publish] | --all-published [--publish]"); process.exit(1); }

const results = [], failures = [];
for (const t of targets) {
  try {
    const r = await rebuild(t);
    results.push(r);
    say(`${r.slug}: ${r.paragraphs} paragraphs -> ${r.segments} segments (${r.how}${r.extraPauses ? `, ${r.extraPauses} pause(s) inside paragraphs` : ""})${r.published ? ", installed as the public transcript" : ""}`);
  } catch (e) {
    failures.push({ id: t, error: e.message });
    say(`FAILED ${t}: ${e.message}`);
  }
}
const out = { ok: failures.length === 0, rebuilt: results, failed: failures };
if (asJson) console.log(JSON.stringify(out));
process.exit(failures.length ? 2 : 0);
