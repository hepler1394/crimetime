// Intro and outro music for the podcast studio.
//
// Two ways to get a bed, in priority order:
//   1. Cory's own files in automation/studio/music/: intro.(mp3|wav|m4a) and
//      outro.(mp3|wav|m4a). Drop the track you used to add in Audacity there
//      once and every episode uses it. Trimmed and faded automatically.
//   2. Nothing there: an original bed is synthesized with ffmpeg (sub drone,
//      clock ticks, a slow kick, a riser into the voice). Owned outright, so no
//      platform can flag or mute it. Deterministic: same bed every episode,
//      which is what a show's theme should be.
//
// mixEpisode() lays voice over the intro tail and under the outro head:
//   |-- intro 9s (solo 5s, then ducked under the voice) --|
//                  |-- voice ------------------------------|
//                                            |-- outro 6s --|

import { access, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const MUSIC_DIR = join(__dirname, "studio", "music");
const CACHE = join(MUSIC_DIR, ".rendered");
export const INTRO_SECONDS = 9;
export const VOICE_STARTS_AT = 5;   // seconds into the intro
export const OUTRO_SECONDS = 6;
export const OUTRO_OVERLAP = 1.2;   // outro begins this long before the voice ends

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };
const ff = (args, label) => {
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", ...args], { encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`${label} failed: ${(r.stderr || "").trim().slice(-500)}`);
};
export const probeSeconds = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8", windowsHide: true });
  return parseFloat((r.stdout || "").trim()) || 0;
};

async function userTrack(name) {
  for (const ext of ["wav", "mp3", "m4a", "flac", "ogg"]) { const p = join(MUSIC_DIR, `${name}.${ext}`); if (await exists(p)) return p; }
  return null;
}

// Original theme. Everything is an ffmpeg expression, so there is no sample to license.
function synthIntro(out) {
  const T = INTRO_SECONDS;
  ff(["-f", "lavfi", "-i", `aevalsrc=exprs='0.16*sin(2*PI*55*t)*(0.8+0.2*sin(2*PI*0.5*t))+0.07*sin(2*PI*110.3*t)+0.05*sin(2*PI*82.4*t)*sin(2*PI*0.25*t)':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='0.55*sin(2*PI*52*t*exp(-9*mod(t,1)))*exp(-7*mod(t,1))':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='0.12*sin(2*PI*2400*t)*exp(-90*mod(t+0.25,0.5))':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `anoisesrc=color=brown:amplitude=0.06:d=${T}:seed=7`,
    "-filter_complex", `[3:a]highpass=f=200,lowpass=f=1200,afade=t=in:st=0:d=${T - 2}[riser];[0:a][1:a][2:a][riser]amix=inputs=4:normalize=0[m];[m]afade=t=in:st=0:d=0.8,afade=t=out:st=${VOICE_STARTS_AT + 0.8}:d=${T - VOICE_STARTS_AT - 0.8},alimiter=limit=0.9[a]`,
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "intro synth");
}
function synthOutro(out) {
  const T = OUTRO_SECONDS;
  ff(["-f", "lavfi", "-i", `aevalsrc=exprs='0.16*sin(2*PI*55*t)*(0.8+0.2*sin(2*PI*0.5*t))+0.07*sin(2*PI*110.3*t)':s=44100:d=${T}`,
    "-f", "lavfi", "-i", `aevalsrc=exprs='0.5*sin(2*PI*52*t*exp(-9*mod(t,1)))*exp(-7*mod(t,1))*lt(t,2.1)':s=44100:d=${T}`,
    "-filter_complex", `[0:a][1:a]amix=inputs=2:normalize=0[m];[m]afade=t=in:st=0:d=${OUTRO_OVERLAP},afade=t=out:st=${T - 2.5}:d=2.5,alimiter=limit=0.9[a]`,
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "outro synth");
}

// Returns { intro, outro, source: "cory" | "synth" } as wav paths ready to mix.
export async function ensureBeds() {
  await mkdir(CACHE, { recursive: true });
  const uIntro = await userTrack("intro"), uOutro = await userTrack("outro");
  const intro = join(CACHE, "intro.wav"), outro = join(CACHE, "outro.wav");
  if (uIntro) {
    ff(["-i", uIntro, "-t", String(INTRO_SECONDS), "-af", `afade=t=in:st=0:d=0.3,afade=t=out:st=${VOICE_STARTS_AT + 0.8}:d=${INTRO_SECONDS - VOICE_STARTS_AT - 0.8},loudnorm=I=-18:TP=-2`, "-ac", "2", "-ar", "44100", intro], "intro trim");
  } else if (!(await exists(intro))) synthIntro(intro);
  if (uOutro) {
    ff(["-i", uOutro, "-t", String(OUTRO_SECONDS), "-af", `afade=t=in:st=0:d=${OUTRO_OVERLAP},afade=t=out:st=${OUTRO_SECONDS - 2.5}:d=2.5,loudnorm=I=-18:TP=-2`, "-ac", "2", "-ar", "44100", outro], "outro trim");
  } else if (!(await exists(outro))) synthOutro(outro);
  return { intro, outro, source: uIntro || uOutro ? "cory" : "synth", introFile: uIntro, outroFile: uOutro };
}

// voiceWav in, mixed wav out. Returns the offset (seconds) the voice starts at,
// so transcript timings can be shifted.
export async function mixEpisode(voiceWav, out, { music = true } = {}) {
  if (!music) { ff(["-i", voiceWav, "-af", "adelay=500|500,apad=pad_dur=0.8", "-ac", "2", "-ar", "44100", out], "pad"); return 0.5; }
  const beds = await ensureBeds();
  const v = probeSeconds(voiceWav);
  const outroAt = Math.max(0, VOICE_STARTS_AT + v - OUTRO_OVERLAP);
  const ms = (s) => Math.round(s * 1000);
  ff(["-i", beds.intro, "-i", voiceWav, "-i", beds.outro,
    "-filter_complex", `[1:a]aformat=channel_layouts=stereo,adelay=${ms(VOICE_STARTS_AT)}|${ms(VOICE_STARTS_AT)}[v];[2:a]adelay=${ms(outroAt)}|${ms(outroAt)}[o];[0:a][v][o]amix=inputs=3:normalize=0:duration=longest[a]`,
    "-map", "[a]", "-ac", "2", "-ar", "44100", out], "mix");
  return VOICE_STARTS_AT;
}

// CLI: node automation/episode-music.mjs [--json]   renders (or refreshes) the beds and reports which source is in use.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const asJson = process.argv.includes("--json");
  try {
    const { rm } = await import("node:fs/promises");
    await rm(CACHE, { recursive: true, force: true });
    const b = await ensureBeds();
    const res = { ok: true, source: b.source, intro: b.intro, outro: b.outro, introFile: b.introFile, outroFile: b.outroFile, introSeconds: INTRO_SECONDS, outroSeconds: OUTRO_SECONDS, message: `Theme beds rendered from ${b.source === "cory" ? "Cory's tracks in studio/music" : "the synthesized theme"}.` };
    console.log(asJson ? JSON.stringify(res) : res.message);
  } catch (e) { console.log(asJson ? JSON.stringify({ ok: false, message: e.message }) : e.message); process.exit(2); }
}
