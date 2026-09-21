// The things a word-by-word comparison cannot hear: how fast a paragraph is read, how much the
// voice moves, whether a splice steps in level, and whether the episode tells a scene twice.
//
// Almost none of this blocks a publish, and that is deliberate. "Flat" and "rushed" are
// judgements, not defects, and a gate that holds a finished episode on a judgement is the gate
// that had two episodes sitting unpublished on 2026-09-20. These measurements exist to RANK
// what a person should spend a minute listening to (episode-digest.mjs), and to say so in the
// report.
//
// Two of them are hard enough to hold an episode:
//
//   REPEATS  a script that tells the same scene again. Measured by script-repeats.mjs, which
//            scores every recent episode between 2.1% and 6.0% - and the published Petito
//            episode, the one CLAUDE.md says walks the Moab stop three times, at 11.8%. The
//            threshold is its own verdict line, "edit before voicing", at 8%.
//   SEAM     a paragraph swapped in by episode-splice.mjs that sits at a different level from
//            the audio either side of it. That is a mechanical fault with a right answer.
//
// What the rate check must never do is flag good work. On the Gilgo episode the slowest
// paragraph by a wide margin is the eight victims' names read one at a time - the moment the
// episode is named after. It is 40% under the median pace and it is exactly right. So the note
// threshold sits far outside anything three finished episodes produced (their extremes were
// 1.41x and 0.58x of median), it skips short paragraphs, and it skips the open and the sign-off.

import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const median = (a) => { const s = [...a].filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

export const LIMITS = {
  pace: 0.35,          // fraction off the episode's own median before a paragraph is worth an ear
  paceMinWords: 25,    // below this a paragraph's pace is about its punctuation, not its reading
  flat: 0.78,          // share of the episode's median pitch movement
  seamDb: 3.0,         // a step this big across a splice join is audible
  repeatsHold: 0.08,   // script-repeats.mjs's own "edit before voicing"
  repeatsNote: 0.04,
};

// Runs studio/delivery.py over the dry voice track. Returns null when it cannot (no python,
// no librosa): the audit carries on without these notes rather than failing over them.
export async function measure(voice, spans, workJson, { python, say = () => {} } = {}) {
  const py = python || join(here, "studio", ".venv", "Scripts", "python.exe");
  const spansPath = workJson.replace(/\.json$/, "-spans.json");
  await writeFile(spansPath, JSON.stringify(spans), "utf8");
  const r = spawnSync(py, [join(here, "studio", "delivery.py"), voice, spansPath, workJson], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) { say(`  delivery measurements unavailable (${(r.stderr || "").trim().slice(-160)})`); return null; }
  return JSON.parse(await readFile(workJson, "utf8"));
}

// notes: never block. holds: do.
export function delivery(paras, meas, { joins = [], spliced = [] } = {}) {
  const notes = [], holds = [];
  if (!meas?.paragraphs?.length) return { notes, holds, stats: null };
  const rows = meas.paragraphs.map((p, i) => {
    const words = String(paras[i] || "").split(/\s+/).filter(Boolean).length;
    const speech = Math.max(0.5, p.seconds * (p.speech || 1));
    return { i, words, seconds: p.seconds, wps: words / speech, sd: p.f0SemitoneSd, db: p.rmsDb, headDb: p.headDb, tailDb: p.tailDb, pauses: p.pauses || [] };
  });
  const medWps = median(rows.map((r) => r.wps)), medSd = median(rows.map((r) => r.sd));
  const last = rows.length - 1;

  for (const r of rows) {
    if (r.i < 2 || r.i > last - 2 || r.words < LIMITS.paceMinWords) continue;
    const off = medWps ? r.wps / medWps - 1 : 0;
    if (Math.abs(off) > LIMITS.pace) notes.push({ kind: "PACE", pi: r.i, score: Math.abs(off),
      text: `read ${off > 0 ? "faster" : "slower"} than the rest of the episode (${(off * 100).toFixed(0)}%, ${r.wps.toFixed(2)} words a second against ${medWps.toFixed(2)})` });
    if (medSd && r.sd != null && r.sd < medSd * LIMITS.flat && r.words >= LIMITS.paceMinWords)
      notes.push({ kind: "FLAT", pi: r.i, score: 1 - r.sd / medSd, text: `the voice moves less here than anywhere else (${(r.sd / medSd * 100).toFixed(0)}% of this episode's usual pitch movement)` });
  }

  // A swapped paragraph that does not sit at the level of its neighbours. The indices in the
  // splice history only mean anything if nothing has been dropped since: a drop renumbers every
  // paragraph after it, and checking the wrong paragraph is worse than not checking.
  const everDropped = spliced.some((s) => (s.changes || []).some((c) => c.action === "dropped"));
  const swapped = everDropped ? new Set() : new Set(spliced.flatMap((s) => (s.changes || []).filter((c) => c.action === "replaced").map((c) => c.i)));
  for (const i of [...swapped].sort((a, b) => a - b)) {
    const r = rows[i]; if (!r || r.db == null) continue;
    let worst = null;
    for (const [side, nb] of [["before", rows[i - 1]], ["after", rows[i + 1]]]) {
      if (!nb || nb.db == null) continue;
      const step = Math.abs(r.db - nb.db);
      if (step > LIMITS.seamDb && (!worst || step > worst.step)) worst = { step, side, louder: r.db > nb.db };
    }
    // One finding per paragraph, on its worse side. Both neighbours reported separately is the
    // same seam twice, and a gate that says everything twice gets read as noise.
    if (worst) holds.push({ kind: "SEAM", pi: i, score: worst.step,
      text: `paragraph ${i} was swapped in and sits ${worst.step.toFixed(1)} dB ${worst.louder ? "above" : "below"} the paragraph ${worst.side} it` });
  }

  const js = joins.map((j) => j.seconds).filter((x) => x != null);
  const stats = { medianWps: medWps ? +medWps.toFixed(2) : null, medianSemitoneSd: medSd ? +medSd.toFixed(2) : null,
    joinSpread: js.length ? +(Math.max(...js) - Math.min(...js)).toFixed(3) : null, joins: js.length };
  return { notes, holds, stats, rows };
}

// script-repeats.mjs, as a check rather than a command.
export function repeats(id, { say = () => {} } = {}) {
  const r = spawnSync(process.execPath, [join(here, "script-repeats.mjs"), id, "--json"], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) { say("  repetition check unavailable"); return null; }
  try { return JSON.parse((r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"))); } catch { return null; }
}

