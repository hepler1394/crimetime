#!/usr/bin/env node
// Podcast studio: the minute that stands in for the twenty.
//
//   node automation/episode-digest.mjs <draft-id> [--seconds 75] [--json]
//
// Cory does not have time to listen to every episode, and he should not have to in order to
// know it is not embarrassing. This cuts the places the gate is least sure about into one
// 60-90 second pass, worst first, and writes an index saying where each one is in the episode
// and what to listen for.
//
// HOW IT IS CUT, AND WHY IT MATTERS
//
// On 2026-09-20 a montage of six six-second windows went to Cory with hard ffmpeg boundaries.
// He listened and reported "lots of cut out of pauses" - and he was right, but he was hearing
// the montage, not the episode. A digest assembled with hard cuts manufactures the exact
// artifact it exists to detect, and the report it produces is worse than useless because it
// sends you looking for a defect that is not in the show.
//
// So: every window starts and ends in a pause the clone actually left, found by looking for
// them rather than by counting seconds; each excerpt is long enough to carry its own context;
// and the excerpts are crossfaded into each other, so there is never a boundary in the file
// where the sound stops. The digest is cut from episode.mp3, the mastered mix with the music
// on it, because that is what anybody listening will hear.

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { VOICE_STARTS_AT } from "./episode-music.mjs";
import { paragraphSpans, silences, probe } from "./audio-paragraphs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const STUDIO = join(here, "studio");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const say = (m) => { if (!asJson) console.log(m); };

const CLIP_MIN = 6, CLIP_MAX = 13, XFADE = 0.45;
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

// Rank: a confirmed defect first, then a seam, then the places the reading or the writing is
// worth an ear, then - on an episode with nothing flagged at all - wherever the transcriber was
// least certain, which is the best available guess at where the render is weakest.
const WEIGHT = { MISHEARD: 100, DROPPED: 104, ARTIFACT: 96, SEAM: 80, "DEAD AIR": 78, LEVEL: 70, REPEATS: 40, FLAT: 30, PACE: 25, UNSTABLE: 50, QUIET: 10 };

export async function buildDigest(dir, { seconds = 75, say: log = () => {} } = {}) {
  const ep = JSON.parse(await readFile(join(dir, "episode.json"), "utf8"));
  const paras = (ep.script || []).filter(Boolean);
  const voice = join(dir, "voice.wav"), mp3 = join(dir, "episode.mp3");
  if (!existsSync(voice) || !existsSync(mp3)) return { ok: false, message: "no voice.wav / episode.mp3 to cut from" };

  const wordsFile = join(dir, "audit-words.json");
  const words = existsSync(wordsFile) ? (JSON.parse(await readFile(wordsFile, "utf8")).words || []) : [];
  const sp = paragraphSpans(voice, paras, { words: words.length ? words : null });
  const spans = sp.spans.length ? sp.spans : [[0, probe(voice)]];
  // Every pause the clone left, at a level a listener would call silence.
  const pauses = silences(voice, -45, 0.16);
  const total = probe(voice);

  /* ---------------------------------------------------------------- moments */
  const A = ep.audioAudit || {};
  const moments = [];
  const add = (kind, at, pi, text, bump = 0) => moments.push({ kind, at, pi, text, score: (WEIGHT[kind] ?? 20) + bump });
  // audioAudit.findings is the count; audioAudit.list is the findings themselves.
  for (const f of A.list || []) add(f.kind, (f.seconds?.[0] ?? f.at - VOICE_STARTS_AT), f.pi, f.text);
  for (const f of A.unstable || []) add("UNSTABLE", (f.seconds?.[0] ?? 0), f.pi, `the two passes disagreed here: ${f.text}`);
  // A note about the whole script has no moment to play; it belongs in the report, not here.
  for (const n of A.notes || []) if (n.pi != null && spans[n.pi]) add(n.kind, (spans[n.pi][0] + spans[n.pi][1]) / 2, n.pi, n.text, (n.score || 0) * 20);
  for (const p of A.retold || []) if (spans[p.pi]) add("REPEATS", (spans[p.pi][0] + spans[p.pi][1]) / 2, p.pi, p.text);

  if (words.length) {
    // The stretches the transcriber was least sure of. On an episode with nothing flagged these
    // are the whole digest; otherwise they fill it out to a usable minute behind the real
    // findings, so a spot check is always worth the same amount of listening.
    const W = 9;
    const buckets = new Map();
    for (const w of words) { const k = Math.floor(w.s / W); const b = buckets.get(k) || { n: 0, sum: 0, at: k * W }; b.n++; b.sum += w.p; buckets.set(k, b); }
    const ranked = [...buckets.values()].filter((b) => b.n >= 8).map((b) => ({ ...b, mean: b.sum / b.n })).sort((a, b) => a.mean - b.mean).slice(0, 8);
    for (const b of ranked) add("QUIET", b.at + W / 2, null, `the transcriber was least sure of this stretch (mean confidence ${b.mean.toFixed(2)})`, (1 - b.mean) * 25);
  }
  if (!moments.length) return { ok: false, message: "nothing to put in a digest" };

  /* ------------------------------------------------- windows, cut on pauses */
  const pauseMid = pauses.map((p) => (p.start + p.end) / 2);
  const before = (t) => { let best = 0; for (const m of pauseMid) if (m <= t) best = m; else break; return best; };
  const after = (t) => { for (const m of pauseMid) if (m >= t) return m; return total; };

  moments.sort((a, b) => b.score - a.score);
  const picked = [];
  const perKind = new Map();
  let budget = seconds;
  for (const m of moments) {
    if (budget <= CLIP_MIN * 0.5) break;
    // A minute of one kind of complaint teaches nothing. Spread it.
    const n = perKind.get(m.kind) || 0;
    if (n >= (m.kind === "QUIET" ? 6 : 3) && moments.length > 6) continue;
    const span = m.pi != null && spans[m.pi] ? spans[m.pi] : [Math.max(0, m.at - 6), Math.min(total, m.at + 6)];
    // Start in the pause before the moment, end in the pause after it, and keep it inside the
    // paragraph unless the paragraph is too short to stand on its own.
    let a = before(Math.max(span[0], m.at - 4.5));
    let b = after(Math.min(span[1], m.at + 4.5));
    if (b - a < CLIP_MIN) { a = before(m.at - CLIP_MIN / 2); b = after(m.at + CLIP_MIN / 2); }
    if (b - a > CLIP_MAX) { a = before(m.at - CLIP_MAX / 2); b = after(m.at + CLIP_MAX / 2); if (b - a > CLIP_MAX) b = a + CLIP_MAX; }
    a = Math.max(0, a); b = Math.min(total, b);
    if (b - a < 2) continue;
    if (picked.some((p) => a < p.b + 0.5 && b > p.a - 0.5)) continue;      // already covered
    picked.push({ ...m, a, b });
    perKind.set(m.kind, n + 1);
    budget -= (b - a) - XFADE;
  }
  if (!picked.length) return { ok: false, message: "nothing to put in a digest" };

  /* ------------------------------------------------------------- cut and join */
  const work = join(dir, "digest-work");
  await rm(work, { recursive: true, force: true }); await mkdir(work, { recursive: true });
  const run = (a, label) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-y", "-v", "error", ...a], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 }); if (r.status !== 0) throw new Error(`${label}: ${(r.stderr || "").trim().slice(-300)}`); };

  const clips = [];
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i];
    const f = join(work, `c${String(i).padStart(2, "0")}.wav`);
    // The mastered mix, at the same moment: the voice track starts VOICE_STARTS_AT into it.
    run(["-ss", (p.a + VOICE_STARTS_AT).toFixed(3), "-to", (p.b + VOICE_STARTS_AT).toFixed(3), "-i", mp3, "-ac", "2", "-ar", "44100", f], "cut");
    clips.push(f);
  }
  const digest = join(dir, "digest.mp3");
  if (clips.length === 1) {
    run(["-i", clips[0], "-af", "afade=t=in:d=0.3,afade=t=out:st=" + Math.max(0, (picked[0].b - picked[0].a) - 0.3).toFixed(2) + ":d=0.3,loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "libmp3lame", "-b:a", "128k", digest], "master");
  } else {
    // Crossfade each excerpt into the next, so the file never stops. A fade to silence and back
    // would put a gap between them, and a gap is the artifact this is meant to find.
    const ins = clips.flatMap((c) => ["-i", c]);
    let graph = "", prev = "0:a";
    for (let i = 1; i < clips.length; i++) { const lbl = `x${i}`; graph += `[${prev}][${i}:a]acrossfade=d=${XFADE}:c1=tri:c2=tri[${lbl}];`; prev = lbl; }
    graph += `[${prev}]afade=t=in:d=0.35,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
    run([...ins, "-filter_complex", graph, "-map", "[out]", "-c:a", "libmp3lame", "-b:a", "128k", digest], "join");
  }
  const dur = probe(digest);

  /* -------------------------------------------------------------------- index */
  let atDigest = 0;
  const lines = picked.map((p, i) => {
    const start = atDigest; atDigest += (p.b - p.a) - (i ? XFADE : 0);
    return `${i + 1}. digest ${clock(start)} - episode ${clock(p.a + VOICE_STARTS_AT)}${p.pi != null ? `, paragraph ${p.pi}` : ""}: **${p.kind}** ${p.text}`;
  });
  const md = [`# Worst moments: ${ep.title}`, "", `${clock(dur)} of the ${ep.duration || ""} episode, worst first. Each excerpt starts and ends in a pause the clone left and is crossfaded into the next, so any clipped pause you hear is in the episode, not in this file.`, "", ...lines, ""].join("\n");
  await writeFile(join(dir, "digest.md"), md, "utf8");
  await rm(work, { recursive: true, force: true });
  return { ok: true, file: digest, seconds: +dur.toFixed(1), clips: picked.length,
    items: picked.map((p) => ({ kind: p.kind, pi: p.pi, at: +(p.a + VOICE_STARTS_AT).toFixed(1), seconds: +(p.b - p.a).toFixed(1), text: p.text })),
    message: `Digest of ${ep.title}: ${picked.length} moment(s), ${clock(dur)}.` };
}

const invokedDirectly = process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;
if (invokedDirectly) {
  const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
  if (!id) { out({ ok: false, message: "usage: episode-digest.mjs <draft-id> [--seconds 75]" }); process.exit(2); }
  const dir = join(STUDIO, "drafts", id);
  if (!existsSync(dir)) { out({ ok: false, message: `No draft ${id}.` }); process.exit(2); }
  try {
    const r = await buildDigest(dir, { seconds: parseInt(opt("--seconds", "75"), 10) || 75, say });
    out(r); process.exit(r.ok ? 0 : 2);
  } catch (e) { out({ ok: false, message: String(e.message || e) }); process.exit(2); }
}
