// Listen again, on purpose, before holding a finished episode.
//
// audio-compare.mjs works on spelling. It can prove two words are the same sound, and it cannot
// tell a clone that mispronounced a word from a transcriber that guessed one. The difference
// between those two is worth a great deal: one is an episode that should not go out, and the
// other is an episode sitting unpublished for nothing.
//
// The evidence that settles it was already on disk. On 2026-09-20 faster-whisper was run twice
// over byte-identical audio of the JonBenet episode: the 21:52 pass heard paragraph 16 cleanly
// and the 08:25 pass heard an extra "passed" in it at confidence 0.16. A finding that does not
// survive a second pass is the transcriber's, not the render's.
//
// So each flagged paragraph is cut out of voice.wav on the silence either side of it and
// transcribed on its own. Decoding one paragraph is a genuinely different draw from decoding it
// inside twenty minutes of speech - which is the point, because most of what was being reported
// were words whisper emits at segment boundaries, and a paragraph on its own has none of the
// boundaries the full file had. If the paragraph comes back clean, the first pass was noise.
//
// A finding has to come back as ITSELF. Two passes that disagree with the script in two
// different ways are two guesses, not a defect: on the JonBenet episode the first pass heard an
// extra "window" in paragraph 6 and the second heard "to miss" for "amiss" in the same
// paragraph, and neither is in the audio. A render that is genuinely wrong sounds wrong both
// times, because both passes are decoding the same waveform - that is why "Capra One" survives
// this and the boundary words do not.

import { spawnSync } from "node:child_process";
import { readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { compareWords, tokens } from "./audio-compare.mjs";

// The same complaint about the same words, however the second pass chose to spell it.
const overlaps = (a, b) => { const B = new Set(tokens(b || "")); return tokens(a || "").some((w) => B.has(w)); };
const sameComplaint = (f, g) => f.kind === g.kind &&
  (f.kind === "ARTIFACT" ? overlaps(f.heard, g.heard) : f.kind === "DROPPED" ? overlaps(f.said, g.said)
    : overlaps(f.said, g.said) || overlaps(f.heard, g.heard));

// findings: from compareWords, each with pi. spans: from paragraphSpans.
// Returns { kept, dropped, checked, ran } - findings partitioned, and which paragraphs were heard again.
export async function confirmFindings(voice, findings, paras, spans, { work, python = "python", asr, audioOk = [], pad = 0.15, say = () => {} } = {}) {
  const flagged = [...new Set(findings.filter((f) => f.pi != null && spans[f.pi]).map((f) => f.pi))].sort((a, b) => a - b);
  if (!flagged.length) return { kept: findings, dropped: [], checked: [], ran: false };

  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const cuts = [];
  for (const pi of flagged) {
    const [s, e] = spans[pi];
    const out = join(work, `p${String(pi).padStart(3, "0")}.wav`);
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-ss", Math.max(0, s - pad).toFixed(3), "-to", (e + pad).toFixed(3), "-i", voice, "-ac", "1", "-ar", "16000", out],
      { encoding: "utf8", windowsHide: true });
    if (r.status === 0) cuts.push({ pi, file: out });
  }
  if (!cuts.length) return { kept: findings, dropped: [], checked: [], ran: false };

  say(`Listening again to ${cuts.length} flagged paragraph(s) on their own...`);
  const heardPath = join(work, "heard.json");
  const r = spawnSync(python, [asr, "--batch", heardPath, ...cuts.map((c) => c.file)],
    { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  if (r.status !== 0) {
    say(`  second pass failed (${(r.stderr || "").trim().slice(-200)}); keeping every finding.`);
    return { kept: findings, dropped: [], checked: [], ran: false };
  }
  const words = JSON.parse(await readFile(heardPath, "utf8"));

  const checked = [], secondPass = new Map();
  for (const c of cuts) {
    const again = compareWords([paras[c.pi]], words[c.file] || [], audioOk).findings;
    secondPass.set(c.pi, again);
    checked.push({ pi: c.pi, clean: again.length === 0, again: again.map((f) => `${f.kind}: ${f.text}`) });
  }
  const kept = [], dropped = [];
  for (const f of findings) {
    if (f.pi == null || !secondPass.has(f.pi)) { kept.push(f); continue; }
    const again = secondPass.get(f.pi);
    const match = again.find((g) => sameComplaint(f, g));
    if (match) { kept.push(f); } else { dropped.push({ ...f, why: again.length ? `the second pass heard it differently again (${again[0].text})` : "not there on a second listen" }); }
  }
  for (const c of checked) {
    const heldHere = kept.filter((f) => f.pi === c.pi).length;
    say(`  paragraph ${c.pi}: ${heldHere ? `confirmed (${heldHere})` : c.clean ? "clean on a second listen" : `unstable - the second pass heard ${c.again[0]}`}`);
  }
  return { kept, dropped, checked, ran: true };
}
