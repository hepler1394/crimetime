// Intro, outro and body music for the podcast studio.
//
// Four themes, chosen per episode by case type (see episode-format.mjs): cold-case,
// active-investigation, missing-person, courtroom. Each theme has three pieces:
// an intro sting, an outro, and a bed that runs quietly under the whole read.
//
// Two ways to get each piece, in priority order:
//   1. Cory's own files in automation/studio/music/. Either per theme
//      (intro-courtroom.mp3, bed-cold-case.wav) or one file for every theme
//      (intro.mp3, outro.mp3, bed.mp3). Trimmed and faded automatically.
//   2. Nothing there: synthesized with ffmpeg (sub drone, ticks, a slow kick, a
//      riser into the voice). Owned outright, so no platform can flag or mute it.
//      Deterministic: the same bed every episode, which is what a theme should be.
//
// mixEpisode() lays voice over the intro tail, under the outro head, and over the
// bed the whole way:
//   |-- intro 9s (solo 5s, then ducked under the voice) --|
//                  |-- voice ------------------------------|
//                                            |-- outro 6s --|
//   |-- bed, -27dB, ducking further under the voice -------------------------|

import { access, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { THEMES, DEFAULT_THEME, normalizeTheme } from "./episode-format.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MUSIC_DIR = join(__dirname, "studio", "music");
const CACHE = join(MUSIC_DIR, ".rendered");
export const INTRO_SECONDS = 9;
export const VOICE_STARTS_AT = 5;   // seconds into the intro
export const OUTRO_SECONDS = 6;
export const OUTRO_OVERLAP = 1.2;   // outro begins this long before the voice ends
export const BED_SECONDS = 60;      // one loop of the body bed
// The synthesized bed measures about -12.8 dBFS on its own, so this gain puts it near
// -28 dBFS in the mix, which is where a bed sits under a voice at -16 LUFS. It ducks
// further under the words from there. Measured, not guessed: 0.045 was 12dB too quiet
// to hear at all.
export const BED_GAIN = 0.16;
export { THEMES };

// Per theme numbers. Every frequency has at most one decimal place, so each one
// completes a whole number of cycles in the 60s bed and the loop point is silent.
const THEME_SYNTH = {
  "cold-case":            { drone: 55,   partial: 110.3, sub: 82.4, tick: 2400, tickEvery: 0.5,  kick: 52, riser: "brown", bedTick: 2400, bedTickEvery: 2 },
  "active-investigation": { drone: 62,   partial: 124.1, sub: 93.2, tick: 3000, tickEvery: 0.25, kick: 58, riser: "white", bedPulse: 1 },
  "missing-person":       { drone: 49,   partial: 98.2,  sub: 73.4, tick: 1800, tickEvery: 1,    kick: 46, riser: "pink",  bedOpen: true },
  courtroom:              { drone: 58.2, partial: 116.4, sub: 87.3, tick: 2100, tickEvery: 1,    kick: 55, riser: "brown", bedPulse: 2 },
};

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const ff = (args, label) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`${label} failed: ${r.error?.message || (r.stderr || "").trim().slice(-500)}`);
};
// A zero here used to travel silently: the outro got mixed over the opening words, the
// episode was stamped 00:00:00 and every transcript timestamp was wrong, all reported as
// success. A duration that cannot be read is a failure, so it is thrown.
export const probeSeconds = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
  const n = parseFloat((r.stdout || "").trim());
  if (r.status !== 0 || !Number.isFinite(n) || n <= 0) throw new Error(`ffprobe could not read the length of ${file}: ${r.error?.message || (r.stderr || "").trim().slice(-300) || "no duration in the output"}`);
  return n;
};

// A file Cory dropped in, per theme first, then the one that covers every theme.
async function userTrack(kind, theme) {
  for (const stem of [`${kind}-${theme}`, kind]) {
    for (const ext of ["wav", "mp3", "m4a", "flac", "ogg"]) {
      const p = join(MUSIC_DIR, `${stem}.${ext}`);
      if (await exists(p)) return p;
    }
  }
  return null;
}

// Original themes. Everything is an ffmpeg expression, so there is no sample to license.
function synthIntro(out, t) {
  const T = INTRO_SECONDS;
  ff(["-f", "lavfi", "-i", `aevalsrc=exprs='0.16*sin(2*PI*${t.drone}*t)*(0.8+0.2*sin(2*PI*0.5*t))+0.07*sin(2*PI*${t.partial}*t)+0.05*sin(2*PI*${t.sub}*t)*sin(2*PI*0.25*t)':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='0.55*sin(2*PI*${t.kick}*t*exp(-9*mod(t,1)))*exp(-7*mod(t,1))':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='0.12*sin(2*PI*${t.tick}*t)*exp(-90*mod(t+${t.tickEvery / 2},${t.tickEvery}))':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `anoisesrc=color=${t.riser}:amplitude=0.06:d=${T}:seed=7`,
    "-filter_complex", `[3:a]highpass=f=200,lowpass=f=1200,afade=t=in:st=0:d=${T - 2}[riser];[0:a][1:a][2:a][riser]amix=inputs=4:normalize=0[m];[m]afade=t=in:st=0:d=0.8,afade=t=out:st=${VOICE_STARTS_AT + 0.8}:d=${T - VOICE_STARTS_AT - 0.8},alimiter=limit=0.9[a]`,
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "intro synth");
}
function synthOutro(out, t) {
  const T = OUTRO_SECONDS;
  ff(["-f", "lavfi", "-i", `aevalsrc=exprs='0.16*sin(2*PI*${t.drone}*t)*(0.8+0.2*sin(2*PI*0.5*t))+0.07*sin(2*PI*${t.partial}*t)':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='0.5*sin(2*PI*${t.kick}*t*exp(-9*mod(t,1)))*exp(-7*mod(t,1))*lt(t,2.1)':s=44100:d=${T}`,
    "-filter_complex", `[0:a][1:a]amix=inputs=2:normalize=0[m];[m]afade=t=in:st=0:d=${OUTRO_OVERLAP},afade=t=out:st=${T - 2.5}:d=2.5,alimiter=limit=0.9[a]`,
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "outro synth");
}
// The body bed. Purely tonal on purpose: noise would not loop seamlessly, and a click
// every sixty seconds under a twenty minute read is exactly the kind of fault nobody
// notices in a test and everybody notices in a podcast.
function synthBed(out, t) {
  const T = BED_SECONDS;
  const drone = `0.5*sin(2*PI*${t.drone}*t)*(0.75+0.25*sin(2*PI*0.05*t))+0.22*sin(2*PI*${t.partial}*t)*(0.6+0.4*sin(2*PI*0.1*t))`;
  // missing-person sits on an unresolved interval and never lands on the root.
  const colour = t.bedOpen ? `+0.18*sin(2*PI*${(t.drone * 1.5).toFixed(1)}*t)` : "";
  const layers = [`aevalsrc=exprs='${drone}${colour}':s=44100:d=${T}`];
  if (t.bedPulse) layers.push(`aevalsrc=exprs='0.3*sin(2*PI*${t.kick}*t)*exp(-6*mod(t,${t.bedPulse}))':s=44100:d=${T}`);
  if (t.bedTick) layers.push(`aevalsrc=exprs='0.05*sin(2*PI*${t.bedTick}*t)*exp(-70*mod(t,${t.bedTickEvery}))':s=44100:d=${T}`);
  const inputs = layers.flatMap((l) => ["-f", "lavfi", "-i", l]);
  const mix = layers.map((_, i) => `[${i}:a]`).join("");
  ff([...inputs, "-filter_complex", `${mix}amix=inputs=${layers.length}:normalize=0[m];[m]lowpass=f=1600,alimiter=limit=0.9[a]`,
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "bed synth");
}

// Returns { intro, outro, bed, source } as wav paths ready to mix.
export async function ensureBeds(theme = DEFAULT_THEME) {
  const name = normalizeTheme(theme);
  const t = THEME_SYNTH[name];
  await mkdir(CACHE, { recursive: true });
  const uIntro = await userTrack("intro", name), uOutro = await userTrack("outro", name), uBed = await userTrack("bed", name);
  const intro = join(CACHE, `${name}-intro.wav`), outro = join(CACHE, `${name}-outro.wav`), bed = join(CACHE, `${name}-bed.wav`);

  if (uIntro) {
    ff(["-i", uIntro, "-t", String(INTRO_SECONDS), "-af", `afade=t=in:st=0:d=0.3,afade=t=out:st=${VOICE_STARTS_AT + 0.8}:d=${INTRO_SECONDS - VOICE_STARTS_AT - 0.8},loudnorm=I=-18:TP=-2`, "-ac", "2", "-ar", "44100", intro], "intro trim");
  } else if (!(await exists(intro))) synthIntro(intro, t);
  if (uOutro) {
    ff(["-i", uOutro, "-t", String(OUTRO_SECONDS), "-af", `afade=t=in:st=0:d=${OUTRO_OVERLAP},afade=t=out:st=${OUTRO_SECONDS - 2.5}:d=2.5,loudnorm=I=-18:TP=-2`, "-ac", "2", "-ar", "44100", outro], "outro trim");
  } else if (!(await exists(outro))) synthOutro(outro, t);
  if (uBed) {
    ff(["-i", uBed, "-t", String(BED_SECONDS), "-af", "loudnorm=I=-24:TP=-6", "-ac", "2", "-ar", "44100", bed], "bed trim");
  } else if (!(await exists(bed))) synthBed(bed, t);

  return { theme: name, intro, outro, bed, source: uIntro || uOutro || uBed ? "cory" : "synth", introFile: uIntro, outroFile: uOutro, bedFile: uBed };
}
// voiceWav in, mixed wav out. Returns the offset (seconds) the voice starts at,
// so transcript timings can be shifted.
export async function mixEpisode(voiceWav, out, { music = true, bed = true, theme = DEFAULT_THEME } = {}) {
  if (!music) { ff(["-i", voiceWav, "-af", "adelay=500|500,apad=pad_dur=0.8", "-ac", "2", "-ar", "44100", out], "pad"); return 0.5; }
  const beds = await ensureBeds(theme);
  const v = probeSeconds(voiceWav);
  const outroAt = Math.max(0, VOICE_STARTS_AT + v - OUTRO_OVERLAP);
  const total = outroAt + OUTRO_SECONDS;
  const ms = (s) => Math.round(s * 1000);

  if (!bed) {
    ff(["-i", beds.intro, "-i", voiceWav, "-i", beds.outro,
      "-filter_complex", `[1:a]aformat=channel_layouts=stereo,adelay=${ms(VOICE_STARTS_AT)}|${ms(VOICE_STARTS_AT)}[v];[2:a]adelay=${ms(outroAt)}|${ms(outroAt)}[o];[0:a][v][o]amix=inputs=3:normalize=0:duration=longest[a]`,
      "-map", "[a]", "-ac", "2", "-ar", "44100", out], "mix");
    return VOICE_STARTS_AT;
  }
  // The bed is keyed off the voice, so it opens up in the pauses and gets out of the
  // way under the words instead of sitting at one level and fighting them.
  ff(["-i", beds.intro, "-i", voiceWav, "-i", beds.outro, "-stream_loop", "-1", "-t", String(total), "-i", beds.bed,
    "-filter_complex", [
      `[1:a]aformat=channel_layouts=stereo,adelay=${ms(VOICE_STARTS_AT)}|${ms(VOICE_STARTS_AT)}[vd]`,
      `[vd]asplit=2[v][vkey]`,
      `[2:a]adelay=${ms(outroAt)}|${ms(outroAt)}[o]`,
      `[3:a]aformat=channel_layouts=stereo,volume=${BED_GAIN}[b0]`,
      `[b0][vkey]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[bc]`,
      `[bc]afade=t=in:st=0:d=2,afade=t=out:st=${Math.max(0, total - 3).toFixed(2)}:d=3[b]`,
      `[0:a][v][o][b]amix=inputs=4:normalize=0:duration=longest[a]`,
    ].join(";"),
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "mix");
  return VOICE_STARTS_AT;
}

// A short audition of a theme: the intro, a slice of the bed, then the outro.
export async function renderSample(theme, out, bedSeconds = 12) {
  const b = await ensureBeds(theme);
  const ms = (s) => Math.round(s * 1000);
  const bedAt = VOICE_STARTS_AT, outroAt = bedAt + bedSeconds;
  ff(["-i", b.intro, "-t", String(bedSeconds + 1), "-i", b.bed, "-i", b.outro,
    "-filter_complex", [
      `[1:a]aformat=channel_layouts=stereo,volume=${BED_GAIN * 4},adelay=${ms(bedAt)}|${ms(bedAt)}[bed]`,
      `[2:a]adelay=${ms(outroAt)}|${ms(outroAt)}[o]`,
      `[0:a][bed][o]amix=inputs=3:normalize=0:duration=longest[a]`,
    ].join(";"),
    "-map", "[a]", "-ac", "2", "-ar", "44100", "-b:a", "128k", out], "sample");
  return out;
}

// CLI:
//   node automation/episode-music.mjs [--theme <name>] [--json]   render one theme's beds
//   node automation/episode-music.mjs --all                       render every theme
//   node automation/episode-music.mjs --samples                   audition mp3s for all four
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const asJson = argv.includes("--json");
  const opt = (f, d) => { const i = argv.indexOf(f); return i > -1 && argv[i + 1] ? argv[i + 1] : d; };
  try {
    const { rm } = await import("node:fs/promises");
    const samples = argv.includes("--samples");
    const list = argv.includes("--all") || samples ? THEMES : [normalizeTheme(opt("--theme", DEFAULT_THEME))];
    if (!samples) await rm(CACHE, { recursive: true, force: true });
    const done = [];
    for (const name of list) {
      const b = await ensureBeds(name);
      const entry = { theme: name, source: b.source, intro: b.intro, outro: b.outro, bed: b.bed };
      if (samples) entry.sample = await renderSample(name, join(CACHE, `sample-${name}.mp3`));
      done.push(entry);
    }
    const res = {
      ok: true, themes: done, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS, bedSeconds: BED_SECONDS,
      source: done[0]?.source, intro: done[0]?.intro, outro: done[0]?.outro,
      message: samples
        ? `Auditions written: ${done.map((d) => d.sample).join(", ")}`
        : `Rendered ${done.length} theme${done.length === 1 ? "" : "s"} (${done.map((d) => d.theme).join(", ")}) from ${done[0]?.source === "cory" ? "Cory's tracks in studio/music" : "the synthesized themes"}.`,
    };
    console.log(asJson ? JSON.stringify(res) : res.message);
  } catch (e) { console.log(asJson ? JSON.stringify({ ok: false, message: e.message }) : e.message); process.exit(2); }
}
