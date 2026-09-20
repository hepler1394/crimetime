#!/usr/bin/env node
// How long will this script actually run? Answer it before the render, not after.
//
//   node automation/episode-length.mjs <draft-id> [--json]
//   node automation/episode-length.mjs --calibrate        show the curve and the episodes behind it
//
// Every episode has a twenty-minute floor and episode-publish.mjs refuses a
// render that misses it. On 2026-09-19 the Miami script was 4126 words, which the
// measured pace put at 20:23 - twenty-three seconds of margin, and nothing would
// have said so until roughly six hours of CPU had already been spent. This turns
// that into a number you can read in a second.
//
// The pace is measured, not assumed: every published episode whose draft is still
// on disk contributes a words-per-minute reading, taken from the finished mp3 so
// the theme and bed are counted the same way they will be on the next one. The
// floor check deliberately uses the FASTEST reading rather than the average,
// because the risk is one-sided - a script that runs long is fine, a script that
// runs short does not go out.

import { readFile, readdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const DRAFTS = join(here, "studio", "drafts");
const PUBLISHED = join(here, "studio-episodes.json");
const FLOOR_SECONDS = 20 * 60;

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const id = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message, code = 2) => { out({ ok: false, step, message }); process.exit(code); };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const hms = (s) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

const parseDuration = (d) => {
  if (typeof d === "number") return d;
  const p = String(d || "").split(":").map(Number);
  if (p.some(Number.isNaN)) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return null;
};

const wordsOf = (ep) => {
  if (Number.isFinite(ep.scriptWords)) return ep.scriptWords;
  return (ep.script || []).join(" ").split(/\s+/).filter(Boolean).length;
};

// --- the measured pace --------------------------------------------------------

export async function calibrate() {
  let published = [];
  if (await exists(PUBLISHED)) {
    const raw = JSON.parse(await readFile(PUBLISHED, "utf8"));
    published = Array.isArray(raw) ? raw : (raw.episodes || []);
  }
  const bySlug = new Map();
  for (const p of published) {
    const secs = parseDuration(p.duration);
    if (p.slug && secs) bySlug.set(p.slug, secs);
  }

  // A case can be rewritten from scratch under the same slug, leaving an older
  // draft on disk that never became audio. Pairing every draft against the one
  // published duration would count that stale script as a real reading, so keep
  // only the newest draft per slug - the ids are date-prefixed, so the highest
  // id is the one that actually shipped.
  const newest = new Map();
  for (const dir of (await readdir(DRAFTS).catch(() => [])).sort()) {
    const f = join(DRAFTS, dir, "episode.json");
    if (!(await exists(f))) continue;
    let ep;
    try { ep = JSON.parse(await readFile(f, "utf8")); } catch { continue; }
    if (ep.slug) newest.set(ep.slug, { dir, ep });
  }

  const points = [];
  for (const { dir, ep } of newest.values()) {
    const secs = bySlug.get(ep.slug);
    const words = wordsOf(ep);
    // A draft that was re-cut after publishing no longer matches its own audio,
    // so only trust a pairing that lands in a believable range.
    if (!secs || !words || secs < 240) continue;
    const wpm = words / (secs / 60);
    if (wpm < 100 || wpm > 320) continue;
    points.push({ id: dir, slug: ep.slug, words, seconds: secs, wpm });
  }
  points.sort((a, b) => a.wpm - b.wpm);
  return points;
}

export function modelFrom(points) {
  if (!points.length) return null;
  const rates = points.map((p) => p.wpm);
  const median = rates[Math.floor(rates.length / 2)];
  const fastest = rates[rates.length - 1];
  // The floor is judged against a rate slightly beyond anything yet seen: the
  // clone has drifted faster over time (188 to 203 wpm across September), and a
  // margin that only just survives today's rate is not a margin.
  const planning = fastest * 1.02;
  return { median, fastest, planning, n: points.length };
}

// Pure, and separate from calibrate() so a caller pricing many drafts at once -
// the studio listing every draft - measures the pace once instead of per draft.
export function predictWith(m, words) {
  if (!m || !words) return null;
  const expected = words / m.median * 60;
  const worst = words / m.planning * 60;
  return {
    words,
    expectedSeconds: expected,
    worstSeconds: worst,
    expected: hms(expected),
    worst: hms(worst),
    marginSeconds: Math.round(worst - FLOOR_SECONDS),
    safe: worst >= FLOOR_SECONDS,
    willFail: expected < FLOOR_SECONDS,
    // Words that would put even the fastest plausible read safely over the floor.
    wordsForFloor: Math.ceil(m.planning * (FLOOR_SECONDS / 60)),
    wordsShort: Math.max(0, Math.ceil(m.planning * (FLOOR_SECONDS / 60)) - words),
  };
}

export async function predict(words) {
  const points = await calibrate();
  const m = modelFrom(points);
  if (!m) return null;
  return { ...predictWith(m, words), rates: m, points };
}

// --- cli ----------------------------------------------------------------------

if (process.argv[1] && process.argv[1].endsWith("episode-length.mjs")) {
  if (args.includes("--calibrate")) {
    const points = await calibrate();
    const m = modelFrom(points);
    if (!m) die("calibrate", "No published episode still has its draft on disk, so there is no pace to measure yet.");
    const rows = points.map((p) => `  ${p.wpm.toFixed(1).padStart(6)} wpm   ${String(p.words).padStart(5)} words   ${hms(p.seconds).padStart(6)}   ${p.slug}`);
    out({
      ok: true, step: "calibrate", n: m.n, median: m.median, fastest: m.fastest, planning: m.planning, points,
      message: [`Pace measured from ${m.n} published episode(s):`, ...rows, "",
        `  median   ${m.median.toFixed(1)} wpm  (what to expect)`,
        `  fastest  ${m.fastest.toFixed(1)} wpm  (worst case seen)`,
        `  planning ${m.planning.toFixed(1)} wpm  (what the floor is judged against)`,
        `  a script needs about ${Math.ceil(m.planning * 20)} words to clear twenty minutes safely`].join("\n"),
    });
  } else {
    if (!id) die("args", "usage: episode-length.mjs <draft-id> [--json] | --calibrate");
    const f = join(DRAFTS, id, "episode.json");
    if (!(await exists(f))) die("draft", `No draft at ${f}`);
    const ep = JSON.parse(await readFile(f, "utf8"));
    const words = wordsOf(ep);
    const p = await predict(words);
    if (!p) die("calibrate", "No pace data yet; cannot predict.");
    const safe = p.marginSeconds >= 0;
    // safe=false means the margin is thin enough to be worth a look; willFail
    // means even the ordinary pace lands under the floor, so the render is
    // going to be refused and there is no point spending the hours on it.
    const willFail = p.expectedSeconds < FLOOR_SECONDS;
    const short = Math.max(0, p.wordsForFloor - words);
    out({
      ok: true, step: "length", id, words, safe, willFail,
      expected: hms(p.expectedSeconds), worst: hms(p.worstSeconds),
      marginSeconds: Math.round(p.marginSeconds), wordsShort: short,
      message: [
        `${id}: ${words} words`,
        `  expected   ${hms(p.expectedSeconds)}  at ${p.rates.median.toFixed(1)} wpm`,
        `  worst case ${hms(p.worstSeconds)}  at ${p.rates.planning.toFixed(1)} wpm`,
        safe
          ? `  clears the twenty-minute floor with ${Math.round(p.marginSeconds)}s to spare.`
          : `  MISSES the floor by ${Math.round(-p.marginSeconds)}s in the worst case. Add about ${short} words from research.md before rendering.`,
      ].join("\n"),
    });
  }
}
