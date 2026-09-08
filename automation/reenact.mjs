// A 911-call re-enactment for the show: a court transcript in, a two-voice
// recording out, rendered with Deepgram Aura-2 and treated so it sounds like a
// dispatch logging recorder instead of a text-to-speech demo.
//
// This is a DRAMATIZATION and the output says so out loud, at the top of the
// file and in the label the trailer burns on screen. The words come from a
// court transcript; the voices are synthetic and belong to no one. Never point
// this at a real person's recording. No clone of a caller, a victim, a witness
// or a defendant, ever - that is a deepfake no matter how true the words are.
//
//   node automation/reenact.mjs --new "Lindsay Clancy"     scaffold a script
//   node automation/reenact.mjs <slug> --json              render it
//   node automation/reenact.mjs <slug> --to <draft-id>     also drop the cold open in a draft
//   node automation/reenact.mjs <slug> --cold-only         skip the full call, cold open only
//
// Reads  automation/studio/reenact/<slug>/script.json
// Writes call.mp3        the whole re-enactment
//        coldopen.mp3    the lines marked "cold": true, capped at 8 s for the trailer
//        coldopen.txt    the two label lines episode-trailer.mjs burns on screen
//
// Two providers, set per voice. ElevenLabs v3 takes direction and is the one
// worth using for anything with feeling in it; Deepgram Aura is a voice-agent
// engine that stays calm no matter what you write, which makes it fine for a
// steady read and useless for a 911 call. Direction goes in a line's "tag"
// field, never in "text" - the transcript has to stay verbatim and auditable.
//
// Needs ffmpeg and a key for whichever providers the script uses, in
// ELEVENLABS_API_KEY / DEEPGRAM_API_KEY or config.json elevenlabs.apiKey /
// deepgram.apiKey. Every line is cached by voice, text, direction and
// surrounding context, so a re-run costs nothing and only edited lines bill.

import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "studio", "reenact");
const DRAFTS = join(__dirname, "studio", "drafts");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message, code = 2) => { out({ ok: false, step, message }); process.exit(code); };
const say = (m) => { if (asJson) console.error(m); else console.log(m); };
const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const ff = (a, label) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...a], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) die("ffmpeg", `${label} failed: ${r.error?.message || (r.stderr || "").trim().slice(-400)}`);
};
// A length that cannot be read is a failure, not a zero. Same reasoning as
// episode-music.mjs: a silent zero here would desync every gap after it.
const seconds = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
  const n = parseFloat((r.stdout || "").trim());
  if (!Number.isFinite(n) || n <= 0) die("ffprobe", `could not read the length of ${file}`);
  return n;
};

// ---------------------------------------------------------------- scaffold

const TEMPLATE = {
  case: "",
  source: "Fill in: which court, which exhibit, what date. This is the line that keeps the show honest.",
  label: ["911 call. Dramatization.", "Words from the court transcript. Synthetic voices."],
  disclosure: "The following is a dramatization. The words are from the court transcript. The voices are not the real people.",
  voices: {
    DISPATCH: { provider: "elevenlabs", voiceId: "EXAVITQu4vr4xnSDxMaL", model: "eleven_v3", stability: 0.5, line: "console", speed: 1 },
    CALLER: { provider: "elevenlabs", voiceId: "iP95p4xoKVk53GoZ742B", model: "eleven_v3", stability: 0.5, line: "phone", speed: 1 },
  },
  lines: [{ who: "DISPATCH", text: "Nine one one, what is the address of your emergency?", tag: "", gap: 0.4, cold: false }],
};

if (args.includes("--new")) {
  const name = opt("--new", "");
  if (!name) die("args", 'usage: reenact.mjs --new "Case name"');
  const s = slugify(name);
  const d = join(ROOT, s);
  if (await exists(join(d, "script.json"))) die("new", `${s} already exists`);
  await mkdir(d, { recursive: true });
  await writeFile(join(d, "script.json"), JSON.stringify({ ...TEMPLATE, case: name }, null, 2));
  out({ ok: true, slug: s, file: join(d, "script.json"), message: `Scaffolded ${s}. Fill in the lines, then: node automation/reenact.mjs ${s}` });
  process.exit(0);
}

// ---------------------------------------------------------------- load

const slug = args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
if (!slug) die("args", 'usage: reenact.mjs <slug> [--to <draft-id>] [--cold-only] [--json]  |  reenact.mjs --new "Case name"');
const dir = join(ROOT, slug);
let script;
try { script = JSON.parse(await readFile(join(dir, "script.json"), "utf8")); }
catch (e) { die("script", `No script at ${join(dir, "script.json")} (${e.message})`); }

const lines = (script.lines || []).filter((l) => !l.skip && (l.text || "").trim());
if (!lines.length) die("script", "No usable lines. Every line is skipped or empty.");
for (const l of lines) if (!script.voices?.[l.who]) die("script", `Line "${(l.text || "").slice(0, 40)}" has who "${l.who}", which is not in voices.`);
const overLimit = lines.find((l) => l.text.length > 1900);
if (overLimit) die("script", `A line is ${overLimit.text.length} characters; Deepgram caps a request at 2000. Split it.`);

const keys = { deepgram: process.env.DEEPGRAM_API_KEY || "", elevenlabs: process.env.ELEVENLABS_API_KEY || "" };
try {
  const { unlockConfig } = await import("./studio/credential-store.mjs");
  const c = await unlockConfig(JSON.parse(await readFile(join(__dirname, "config.json"), "utf8")));
  keys.deepgram ||= (c.deepgram || {}).apiKey || "";
  keys.elevenlabs ||= (c.elevenlabs || {}).apiKey || "";
} catch { /* no config */ }
const providerOf = (who) => (script.voices[who]?.provider || "deepgram").toLowerCase();
for (const p of new Set([...lines.map((l) => providerOf(l.who)), script.disclosure ? providerOf("NARRATOR") : null].filter(Boolean))) {
  if (!["deepgram", "elevenlabs"].includes(p)) die("script", `Unknown provider "${p}". Use "deepgram" or "elevenlabs".`);
  if (!keys[p]) die("key", `No ${p} key. Set ${p.toUpperCase()}_API_KEY, or add {"${p}":{"apiKey":"..."}} to automation/config.json (gitignored). Do not paste the key into chat.`);
}

// ---------------------------------------------------------------- render

const cache = join(dir, ".cache");
const work = join(dir, ".work");
await mkdir(cache, { recursive: true });
await mkdir(work, { recursive: true });

// The two providers differ in what they are for. Deepgram Aura is a voice-agent
// engine: calm, clear, unflappable, and no amount of filtering makes it sound
// like a person in trouble. ElevenLabs v3 takes direction. For a 911 call that
// difference is the whole job, so v3 is the default here and Deepgram stays for
// anything that only needs a steady read.
const speak = async (v, text, dest, ctx = {}) => {
  const provider = (v.provider || "deepgram").toLowerCase();
  let res;
  if (provider === "elevenlabs") {
    // previous_text / next_text keep a one-word answer ("Yeah.") from drifting
    // into a different-sounding read, but v3 rejects them outright - the API
    // returns unsupported_model. So they are sent only to the older models that
    // accept them, and usesContext() below keeps the cache key honest about it.
    const body = {
      text,
      model_id: v.model || "eleven_v3",
      voice_settings: { stability: v.stability ?? 0.5, similarity_boost: v.similarity ?? 0.75 },
      ...(usesContext(v) && ctx.prev ? { previous_text: ctx.prev } : {}),
      ...(usesContext(v) && ctx.next ? { next_text: ctx.next } : {}),
    };
    try {
      res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(v.voiceId)}?output_format=mp3_44100_128`,
        { method: "POST", headers: { "xi-api-key": keys.elevenlabs, "Content-Type": "application/json", Accept: "audio/mpeg" }, body: JSON.stringify(body) });
    } catch (e) { die("elevenlabs", `request failed: ${e.message}`); }
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      die("elevenlabs", `returned ${res.status}: ${b.slice(0, 300)}`
        + (res.status === 401 ? " (check the key)" : "")
        + (res.status === 422 ? ` (is voiceId "${v.voiceId}" on this account?)` : "")
        + (res.status === 429 ? " (out of characters on this plan)" : ""));
    }
  } else {
    try {
      res = await fetch(`https://api.deepgram.com/v1/speak?model=${encodeURIComponent(v.model || "aura-2-thalia-en")}&encoding=linear16&container=wav&sample_rate=24000`,
        { method: "POST", headers: { Authorization: `Token ${keys.deepgram}`, "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    } catch (e) { die("deepgram", `request failed: ${e.message}`); }
    if (!res.ok) {
      const b = await res.text().catch(() => "");
      die("deepgram", `returned ${res.status}: ${b.slice(0, 300)}`
        + (res.status === 401 ? " (check the key)" : "")
        + (res.status === 400 ? ` (is "${v.model}" a model on your plan?)` : ""));
    }
  }
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
};

// The direction lives in its own field so the transcript in script.json stays
// verbatim and auditable. Tags are prepended at render time, never stored as
// part of what the person is quoted as saying.
const withTag = (l) => (l.tag ? `[${l.tag}] ${l.text.trim()}` : l.text.trim());
// Only ElevenLabs models older than v3 receive the surrounding turns, so only
// those may have them in the cache key - otherwise editing a neighbouring line
// would silently re-bill every v3 line around it for identical audio.
const usesContext = (v) => (v.provider || "deepgram").toLowerCase() === "elevenlabs" && (v.model || "eleven_v3") !== "eleven_v3";
const cacheKey = (v, text, ctx) => createHash("sha1")
  .update(JSON.stringify([v.provider || "deepgram", v.model || "", v.voiceId || "", v.stability ?? "", text,
    usesContext(v) ? ctx.prev || "" : "", usesContext(v) ? ctx.next || "" : ""]))
  .digest("hex").slice(0, 16);

// Recorded at the dispatch console: the call-taker's own mic is close and
// clean, the caller arrives down a narrowband phone line. That asymmetry is
// most of why real released 911 audio sounds the way it does, and most of why
// this does not sound like two chatbots taking turns.
const TREAT = {
  phone: "highpass=f=310,lowpass=f=3200,acompressor=threshold=-18dB:ratio=4:attack=5:release=90:makeup=5,alimiter=limit=0.94",
  console: "highpass=f=180,lowpass=f=6500,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120:makeup=3,alimiter=limit=0.94",
};
// A line marked "distance": "away" is someone who has walked off with the phone
// still live - quieter, duller, and bouncing off the room. In the Clancy call
// that is most of the ending, and it is the difference between a man shouting
// into a handset and a man shouting somewhere inside a house.
const AWAY = "volume=0.42,lowpass=f=2100,aecho=0.8:0.75:55:0.28";

let billed = 0, cached = 0;
const rendered = [];

// --cold-only renders only what the cold open needs, but the prev/next context
// still comes from the full script so those lines hash - and sound - identical
// to the ones a later full render produces. Iterating cheaply must not mean
// paying twice for the same audio.
const coldOnly = args.includes("--cold-only");
for (const [i, l] of lines.entries()) {
  if (coldOnly && !l.cold) continue;
  const v = script.voices[l.who];
  const text = withTag(l);
  const ctx = { prev: lines[i - 1]?.text?.trim() || "", next: lines[i + 1]?.text?.trim() || "" };
  const raw = join(cache, `${cacheKey(v, text, ctx)}.${(v.provider || "deepgram") === "elevenlabs" ? "mp3" : "wav"}`);

  if (await exists(raw)) cached++;
  else {
    say(`${v.provider || "deepgram"} ${i + 1}/${lines.length} (${l.who}): ${text.slice(0, 56)}${text.length > 56 ? "..." : ""}`);
    await speak(v, text, raw, ctx);
    billed++;
  }

  // Speed is the urgency dial. Aura-2 will not panic for you, but a caller
  // running 6 to 12 percent hot against a dispatcher holding steady at 1.0
  // reads as pressure, which is the part of a 911 call that actually carries.
  const speed = Math.min(2, Math.max(0.5, l.speed ?? v.speed ?? 1));
  const chain = [
    speed !== 1 ? `atempo=${speed.toFixed(3)}` : null,
    TREAT[v.line === "console" ? "console" : "phone"],
    l.distance === "away" ? AWAY : null,
  ].filter(Boolean).join(",");
  const wav = join(work, `line-${String(i).padStart(3, "0")}.wav`);
  ff(["-i", raw, "-af", chain, "-ac", "1", "-ar", "44100", wav], `treat line ${i + 1}`);
  rendered.push({ ...l, file: wav, dur: seconds(wav), cold: !!l.cold });
}

// ---------------------------------------------------------------- assemble

// Everything is placed on a timeline rather than concatenated, because a
// concatenation can only ever produce polite turn-taking - each person waiting
// for the other to stop. That is what makes a re-enactment sound like two
// people chatting. A negative "gap" starts a line before the previous one has
// finished, which is how real calls actually go: the caller talks over the
// dispatcher, the dispatcher repeats a question into nothing.
//
// A dead-quiet gap is the other giveaway, so the whole thing sits on a faint
// hiss-and-hum bed rather than cutting to digital black.
async function assemble(items, outFile, o = {}) {
  if (!items.length) return null;

  let cursor = 0;
  const placed = items.map((s, i) => {
    const at = Math.max(0, cursor);
    cursor = at + s.dur + (i === items.length - 1 ? 0 : (s.gap ?? 0.4));
    return { ...s, at };
  });
  const total = Math.max(...placed.map((p) => p.at + p.dur)) + (o.tail ?? 0.6);
  const cap = o.maxSeconds && total > o.maxSeconds ? o.maxSeconds : null;
  const end = cap || total;

  const inputs = [];
  for (const p of placed) inputs.push("-i", p.file);
  inputs.push("-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.0055:d=${total.toFixed(2)}:seed=11`);
  inputs.push("-f", "lavfi", "-i", `sine=frequency=60:duration=${total.toFixed(2)}`);

  const n = placed.length;
  const steps = placed.map((p, i) => `[${i}:a]adelay=${Math.round(p.at * 1000)}:all=1[v${i}]`);
  steps.push(`[${n}:a]highpass=f=140,lowpass=f=4200[hiss]`);
  steps.push(`[${n + 1}:a]volume=0.006[hum]`);
  const mixIn = placed.map((_, i) => `[v${i}]`).join("") + "[hiss][hum]";
  steps.push(`${mixIn}amix=inputs=${n + 2}:normalize=0:duration=longest[m]`);
  steps.push(`[m]${cap ? `atrim=0:${cap.toFixed(2)},` : `atrim=0:${total.toFixed(2)},`}`
    + `afade=t=in:st=0:d=0.25,afade=t=out:st=${Math.max(0, end - 0.6).toFixed(2)}:d=0.6,`
    + "loudnorm=I=-18:TP=-2,alimiter=limit=0.95[a]");

  ff([...inputs, "-filter_complex", steps.join(";"), "-map", "[a]", "-ac", "2", "-ar", "44100", "-b:a", "192k", outFile], `mix ${o.name || "call"}`);
  return seconds(outFile);
}

const results = {};

if (!coldOnly) {
  // The spoken disclosure leads the full cut so the file can never be mistaken
  // for evidence if it ever travels on its own.
  const head = [];
  if (script.disclosure) {
    const dv = script.voices.NARRATOR || { model: "aura-2-thalia-en" };
    const raw = join(cache, `${cacheKey(dv, script.disclosure, {})}.${(dv.provider || "deepgram") === "elevenlabs" ? "mp3" : "wav"}`);
    if (await exists(raw)) cached++;
    else { say(`${dv.provider || "deepgram"} (NARRATOR): disclosure`); await speak(dv, script.disclosure, raw, {}); billed++; }
    const w = join(work, "disclosure.wav");
    ff(["-i", raw, "-af", "highpass=f=90,acompressor=threshold=-20dB:ratio=2:makeup=2", "-ac", "1", "-ar", "44100", w], "disclosure");
    head.push({ file: w, dur: seconds(w), gap: 1.1 });
  }
  results.call = await assemble([...head, ...rendered], join(dir, "call.mp3"), { name: "call" });
}

const coldLines = rendered.filter((l) => l.cold);
let coldWarning = null;
if (coldLines.length) {
  // episode-trailer.mjs only ever uses the first 8 seconds. Cutting here rather
  // than letting ffmpeg chop it later means the truncation is at least visible -
  // a cold open that ends mid-word is the jump-cut that makes a trailer feel
  // machine-made, so it is reported instead of shipped quietly.
  const raw = coldLines.reduce((n, l, i) => n + l.dur + (i === coldLines.length - 1 ? 0.25 : (l.gap ?? 0.4)), 0);
  if (raw > 8) coldWarning = `The cold-open lines run ${raw.toFixed(1)}s and the trailer only uses 8s, so the last line is cut mid-word. Drop a line or shorten one.`;
  results.cold = await assemble(coldLines, join(dir, "coldopen.mp3"), { name: "cold", maxSeconds: 8, tail: 0.25 });
  await writeFile(join(dir, "coldopen.txt"), (script.label || []).slice(0, 2).join("\n") + "\n");
}

const toDraft = opt("--to", null);
if (toDraft) {
  const d = join(DRAFTS, toDraft);
  if (!(await exists(d))) die("draft", `No draft at ${d}`);
  if (!results.cold) die("draft", 'Nothing marked "cold": true, so there is no cold open to copy.');
  await copyFile(join(dir, "coldopen.mp3"), join(d, "coldopen.mp3"));
  await copyFile(join(dir, "coldopen.txt"), join(d, "coldopen.txt"));
}

out({
  ok: true, slug, lines: rendered.length, billedLines: billed, cachedLines: cached,
  call: results.call ? +results.call.toFixed(1) : null,
  coldOpen: results.cold ? +results.cold.toFixed(1) : null,
  copiedTo: toDraft || null,
  warning: coldWarning,
  message: `${rendered.length} lines (${billed} billed, ${cached} cached)`
    + (results.call ? `, call.mp3 ${results.call.toFixed(0)}s` : "")
    + (results.cold ? `, coldopen.mp3 ${results.cold.toFixed(1)}s` : ", no cold open marked")
    + (toDraft ? ` -> draft ${toDraft}` : "")
    + (coldWarning ? `. ${coldWarning}` : ""),
});
