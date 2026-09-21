// Where each paragraph sits in a dry voice track, and how long the joins between them are.
// Shared by episode-splice.mjs, episode-audit.mjs and episode-digest.mjs.
//
// episode-voice.mjs joins paragraphs with 0.55 s of digital silence, so the joins can be read
// back out of voice.wav. episode-splice.mjs used to assume the count would come out exactly
// right and refuse to run otherwise, and on 2026-09-20 that refused the finished Miami episode:
//
//   Found 80 paragraph gaps for 80 paragraphs; refusing to guess where they are.
//
// The extra gap was at 65.93 s, inside paragraph 3, where the clone put a beat after "That is in
// the notes for a reason." before "Let's unpack it." Nothing was wrong with the audio - the
// assumption was wrong. A rhetorical pause can be under -70 dB for longer than 0.45 s, and
// tightening the threshold only moves the problem, because a real join and a long beat are the
// same thing to a level detector.
//
// So the count is no longer the test. When a word-level transcript of the voice track is on hand
// - the audit makes one every time it runs - the joins are read from it: the last moment
// paragraph N is heard and the first moment paragraph N+1 is heard bracket exactly one gap, and
// which gap that is does not depend on any assumption about levels.
//
// Without a transcript it falls back to fitting paragraph lengths, since the clone's pace is
// steady enough that characters predict seconds. That fallback is second best, and on the Miami
// episode it is wrong: paragraph 3 is short text carrying a long beat, so the fit would rather
// split it than believe it. Prefer the transcript.

import { spawnSync } from "node:child_process";
import { compareWords } from "./audio-compare.mjs";

export function probe(file) {
  return parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file],
    { encoding: "utf8", windowsHide: true }).stdout) || 0;
}

// Every stretch quieter than `db` for at least `dur` seconds.
export function silences(file, db = -70, dur = 0.45) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${db}dB:d=${dur}`, "-f", "null", "-"],
    { encoding: "utf8", windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const err = r.stderr || "";
  const starts = [...err.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => +m[1]);
  const ends = [...err.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => +m[1]);
  return starts.map((s, i) => ({ start: s, end: ends[i] ?? null })).filter((g) => g.end != null && g.end > g.start);
}

// Pick N-1 gaps, in order, minimising a cost that depends only on which gap serves which join.
function chooseByCost(gaps, N, cost) {
  const M = gaps.length, INF = Infinity;
  const best = Array.from({ length: N - 1 }, () => new Array(M).fill(INF));
  const from = Array.from({ length: N - 1 }, () => new Array(M).fill(-1));
  for (let j = 0; j < M; j++) best[0][j] = cost(0, j);
  for (let b = 1; b < N - 1; b++) {
    let runBest = INF, runArg = -1;
    for (let j = b; j < M; j++) {
      if (best[b - 1][j - 1] < runBest) { runBest = best[b - 1][j - 1]; runArg = j - 1; }
      if (runBest === INF) continue;
      best[b][j] = runBest + cost(b, j);
      from[b][j] = runArg;
    }
  }
  let endJ = -1, endCost = INF;
  for (let j = N - 2; j < M; j++) if (best[N - 2][j] < endCost) { endCost = best[N - 2][j]; endJ = j; }
  if (endJ < 0) return null;
  const picked = new Array(N - 1);
  for (let b = N - 2, j = endJ; b >= 0; b--) { picked[b] = j; j = from[b][j]; }
  return picked;
}

// Boundary targets from the transcript: the silence between the last word of paragraph b and the
// first word of paragraph b+1. Paragraphs the transcriber lost entirely leave a null, and those
// boundaries fall back to cost by position alone.
function targetsFromWords(paras, words) {
  const { paraTimes } = compareWords(paras, words.map((w) => ({ w: w.w, s: w.s, e: w.e, p: w.p })), []);
  const t = [];
  for (let b = 0; b < paras.length - 1; b++) {
    const a = paraTimes[b], c = paraTimes[b + 1];
    t.push(a && c && c.first > a.last ? { lo: a.last, hi: c.first } : null);
  }
  return t;
}

// Pick which of `gaps` are the N-1 paragraph joins, by best fit to the script's shape.
function choose(gaps, chars, total) {
  const N = chars.length, M = gaps.length;
  const gapTime = gaps.reduce((a, g) => a + (g.end - g.start), 0);
  const speech = Math.max(1, total - gapTime);
  const totalChars = chars.reduce((a, b) => a + b, 0) || 1;
  const pred = chars.map((c) => Math.max(0.2, (c / totalChars) * speech));
  const err = (got, want) => ((got - want) ** 2) / want;

  // best[i][j]: paragraph i ends at gap j. Paragraphs 0..N-2 each end at a gap; the last runs to
  // the end of the file.
  const INF = Infinity;
  const best = Array.from({ length: N - 1 }, () => new Array(M).fill(INF));
  const from = Array.from({ length: N - 1 }, () => new Array(M).fill(-1));
  for (let j = 0; j < M; j++) best[0][j] = err(gaps[j].start - 0, pred[0]);
  for (let i = 1; i < N - 1; i++) {
    for (let j = i; j < M; j++) {
      for (let k = i - 1; k < j; k++) {
        if (best[i - 1][k] === INF) continue;
        const c = best[i - 1][k] + err(gaps[j].start - gaps[k].end, pred[i]);
        if (c < best[i][j]) { best[i][j] = c; from[i][j] = k; }
      }
    }
  }
  let endJ = -1, endCost = INF;
  for (let j = N - 2; j < M; j++) {
    if (best[N - 2][j] === INF) continue;
    const c = best[N - 2][j] + err(total - gaps[j].end, pred[N - 1]);
    if (c < endCost) { endCost = c; endJ = j; }
  }
  if (endJ < 0) return null;
  const picked = new Array(N - 1);
  for (let i = N - 2, j = endJ; i >= 0; i--) { picked[i] = j; j = from[i][j]; }
  return picked;
}

// Which gaps are the joins. Separated from the file work so it can be tested on its own: this
// is the decision that held the Miami episode.
export function selectJoins(gaps, paras, total, words) {
  const N = paras.length;
  if (words?.length) {
    const t = targetsFromWords(paras, words);
    if (t.filter(Boolean).length >= (N - 1) * 0.8) {
      const mid = gaps.map((g) => (g.start + g.end) / 2);
      // A gap that sits between the two paragraphs costs nothing; one that does not is judged on
      // how far outside it falls, so a boundary the transcript lost still lands somewhere sane.
      const picked = chooseByCost(gaps, N, (b, j) => {
        const w = t[b];
        if (!w) return Math.abs(mid[j] - (total * (b + 1)) / N) * 0.05;
        if (gaps[j].end >= w.lo - 0.05 && gaps[j].start <= w.hi + 0.05) return 0;
        return 1 + Math.min(Math.abs(mid[j] - w.lo), Math.abs(mid[j] - w.hi));
      });
      if (picked) return { picked, how: "transcript" };
    }
  }
  if (gaps.length === N - 1) return { picked: gaps.map((_, i) => i), how: "count" };
  return { picked: choose(gaps, paras.map((p) => String(p).length), total), how: "length fit" };
}

// Returns { spans: [[start, end], ...] one per paragraph, joins: [{start, end, seconds}] one per
// join, extra: [gaps that were not joins], ok, why }.
export function paragraphSpans(file, paras, { db = -70, dur = 0.45, words = null } = {}) {
  const total = probe(file);
  const gaps = silences(file, db, dur);
  const N = paras.length;
  if (N === 0) return { ok: false, why: "no paragraphs", spans: [], joins: [], extra: gaps, total };
  if (N === 1) return { ok: true, why: "one paragraph", spans: [[0, total]], joins: [], extra: gaps, total };
  if (gaps.length < N - 1) return { ok: false, why: `found ${gaps.length} gaps for ${N} paragraphs; there are fewer joins than the script needs`, spans: [], joins: [], extra: gaps, total };

  const { picked, how } = selectJoins(gaps, paras, total, words);
  if (!picked) return { ok: false, why: `could not fit ${N} paragraphs onto ${gaps.length} gaps`, spans: [], joins: [], extra: gaps, total, how };

  const joins = picked.map((j) => ({ ...gaps[j], seconds: +(gaps[j].end - gaps[j].start).toFixed(3) }));
  const spans = [];
  for (let i = 0; i < N; i++) spans.push([i ? joins[i - 1].end : 0, i < joins.length ? joins[i].start : total]);
  const pickedSet = new Set(picked);
  const extra = gaps.filter((_, j) => !pickedSet.has(j));

  // A segment far off its predicted length means the fit is guessing, not reading.
  const speech = spans.reduce((a, s) => a + (s[1] - s[0]), 0);
  const chars = paras.map((p) => String(p).length);
  const totalChars = chars.reduce((a, b) => a + b, 0) || 1;
  const worst = spans.reduce((w, s, i) => {
    const want = (chars[i] / totalChars) * speech, got = s[1] - s[0];
    const r = want > 0.5 ? Math.abs(got - want) / want : 0;
    return r > w.ratio ? { ratio: r, i } : w;
  }, { ratio: 0, i: -1 });
  // The length check is a sanity net on the fallback. Read from the transcript, a paragraph is
  // allowed to be the length it actually is: a short one carrying a long beat is not a fault.
  const ok = how === "transcript" || worst.ratio < 0.6;
  return { ok, why: ok ? "" : `paragraph ${worst.i} is ${(worst.ratio * 100).toFixed(0)}% off the length its text predicts; the joins do not line up with the script`,
    spans, joins, extra, total, worst, how };
}

// Which paragraph a moment in the voice track belongs to.
export function paragraphAt(spans, t) {
  for (let i = 0; i < spans.length; i++) if (t >= spans[i][0] && t <= spans[i][1]) return i;
  let bestI = 0, bestD = Infinity;
  for (let i = 0; i < spans.length; i++) {
    const d = t < spans[i][0] ? spans[i][0] - t : t - spans[i][1];
    if (d < bestD) { bestD = d; bestI = i; }
  }
  return bestI;
}
