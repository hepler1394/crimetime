#!/usr/bin/env node
// Re-transcribes the episodes that predate the studio - Cory's own recordings, which have
// no script to lay over the audio - with the audit's medium.en model, primed with the names
// in each case, and fixes the spellings the transcriber still gets wrong.
//
//   node automation/transcript-legacy.mjs            all six
//   node automation/transcript-legacy.mjs <slug>     one
//   node automation/transcript-legacy.mjs --fix-only [slug]   re-apply the spelling lists only
//
// Why: the 2022-2025 transcripts were made with the small model and no priming, and the
// public pages carried "Jean-Benet" for JonBenet across a whole episode, "Coburger" for
// Kohberger, "Zana Cronodal" for Xana Kernodle, "Shanaen" for Shanann, "Oseol" for Oziel.
// A transcript of a real recording can only ever be a transcription, so the note on the
// page keeps saying so; but it can at least spell the victims' names.
//
// Output goes straight to automation/transcripts/<slug>.json. Run build-all afterwards.
// Do not run while a clone render is going; both want every core.

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const STUDIO = join(__dirname, "studio");

// Per episode: the names to prime the model with, and the spellings to correct afterwards
// (whole words, case-sensitive unless a flag says otherwise).
const LEGACY = {
  "crimetimesnacks-the-delphi-murder-case-2017": {
    prompt: "Delphi, Indiana. Abigail Williams, Abby. Liberty German, Libby. Monon High Bridge. Kelsi German. Ronald Logan. Richard Allen, CVS. Andrew Baldwin and Bradley Rozzi, defense attorneys. Carroll County. Bridge Guy. Down the hill.",
    fixes: [[/\bRossi(?='s|\b)/g, "Rozzi"], [/\bRazi(?='s|\b)/g, "Rozzi"], [/\bKelsey\b/g, "Kelsi"], [/\bEncharged\b/g, "In charge"]],
  },
  "murders-in-moscow": {
    prompt: "Moscow, Idaho. University of Idaho. Bryan Kohberger. Kaylee Goncalves, Madison Mogen, Xana Kernodle, Ethan Chapin. King Road. Sigma Chi. Hyundai Elantra. Latah County. Albrightsville, Pennsylvania. Washington State University, Pullman. Judge Steven Hippler. Chief James Fry. Governor Brad Little. Dylan Mortensen, Bethany Funke.",
    fixes: [[/\bCoburger(?='s|\b)/g, "Kohberger"], [/\bBrian Kohberger\b/g, "Bryan Kohberger"], [/\bBrian\b/g, "Bryan"], [/\bZana\b/g, "Xana"], [/\bCronodal\b/g, "Kernodle"], [/\bLeyta\b/g, "Latah"], [/\bLattacounty\b/g, "Latah County"], [/\bAlbrightville\b/g, "Albrightsville"], [/\bStephen Hippler\b/g, "Steven Hippler"]],
  },
  "watts-family-murders": {
    prompt: "Chris Watts, Christopher Watts. Shanann Watts. Bella and Celeste, CeCe. Nico. Frederick, Colorado. Nickole Atkinson, Nikki. Nichol Kessinger. Anadarko Petroleum. Thrive, Le-Vel. Cervi Ranch. Sandra Rzucek, Frank Rzucek. Weld County. North Carolina.",
    fixes: [[/\bShanaen(?='s|\b)/g, "Shanann"], [/\bShanaan(?='s|\b)/g, "Shanann"], [/\bShanan(?='s|\b)/g, "Shanann"], [/\bCadel\b/g, "CeCe"]],
  },
  "erik-and-lyle-the-menendez-brothers": {
    prompt: "Erik Menendez and Lyle Menendez. Jose Menendez, Kitty Menendez. Beverly Hills. Dr. L. Jerome Oziel. Judalon Smyth. Princeton. LIVE Entertainment. Leslie Abramson. Judge Stanley Weisberg. Calabasas. Elm Drive.",
    fixes: [[/\bEric(?='s|\b)/g, "Erik"], [/\bOseol(?='s|\b)/g, "Oziel"], [/\bOziel\b/g, "Oziel"], [/\bJudellaan\b/g, "Judalon"], [/\bJudalon Smith\b/g, "Judalon Smyth"]],
  },
  "jonbenet-ramsey-the-facts-96-22-part-1": {
    prompt: "JonBenet Ramsey. John Ramsey, Patsy Ramsey, Burke Ramsey. Boulder, Colorado. Boulder Police Department. Lou Smit. Fleet White. Linda Arndt. Alex Hunter. Mary Lacy. Governor Bill Owens. John Mark Karr. Access Graphics. SBTC. CODIS. Touch DNA. Bode Technology. Ancestry.com, 23andMe. Golden State Killer. CNN.",
    fixes: [[/\bJean[- ]?Benet(?='s|\b)/g, "JonBenét"], [/\bJonBenet(?='s|\b)/g, "JonBenét"], [/\bRamses\b/g, "Ramseys"], [/\bLou Smith\b/g, "Lou Smit"], [/\bancestryinme\.com\b/gi, "Ancestry.com"], [/\bancestryinme\b/gi, "Ancestry"], [/\b123inme\.com\b/gi, "23andMe.com"], [/\b123inme\b/gi, "23andMe"], [/\b23 and me\b/gi, "23andMe"], [/\bMark Carr\b/g, "Mark Karr"]],
  },
  "jonbenet-ramsey-americas-child-beauty-queen": {
    prompt: "JonBenet Ramsey. John Ramsey, Patsy Ramsey, Burke Ramsey. Boulder, Colorado. CrimeTimeSnacks.",
    fixes: [[/\bJean[- ]?Benet(?='s|\b)/g, "JonBenét"], [/\bJonBenet(?='s|\b)/g, "JonBenét"]],
  },
};

// Applied to every legacy episode after its own list.
const GLOBAL_FIXES = [[/\bCrime Time Snacks\b/g, "CrimeTimeSnacks"], [/\bCrimeTime Snacks\b/g, "CrimeTimeSnacks"]];

const NOTE = "Transcribed from the recording by faster-whisper (medium.en), primed with the names in the case and checked for their spelling. Wording may contain minor errors.";

const fixOnly = process.argv.includes("--fix-only");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const eps = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8")).episodes;
const slugs = only ? [only] : Object.keys(LEGACY);
for (const slug of slugs) {
  const spec = LEGACY[slug];
  const ep = eps.find((e) => e.slug === slug);
  if (!spec || !ep) { console.error(`skip ${slug}: ${spec ? "not in episodes.json" : "no legacy spec"}`); continue; }
  const audio = join(ROOT, ep.audio.replace(/^\//, ""));
  const out = join(tmpdir(), `cts-legacy-${slug}.json`);
  const target = join(__dirname, "transcripts", `${slug}.json`);
  let res;
  if (fixOnly) {
    // --fix-only re-applies the spelling lists to the transcript already on disk, so a fix
    // added after a two-hour run does not cost another two hours.
    res = JSON.parse(await readFile(target, "utf8"));
  } else {
    console.log(`${slug}: transcribing ${ep.audio} with medium.en...`);
    const r = spawnSync("python", [join(STUDIO, "transcribe_file.py"), audio, out, "--model", "medium.en", "--prompt", spec.prompt], { stdio: "inherit", env: { ...process.env, PYTHONIOENCODING: "utf-8" }, windowsHide: true });
    if (r.status !== 0) { console.error(`${slug}: transcription failed (${r.status})`); process.exitCode = 2; continue; }
    res = JSON.parse(await readFile(out, "utf8"));
  }
  let fixed = 0;
  const segments = res.segments.map((s) => {
    let text = s.text;
    for (const [re, to] of [...spec.fixes, ...GLOBAL_FIXES]) { const before = text; text = text.replace(re, to); if (text !== before) fixed++; }
    return { start: s.start, end: s.end, text };
  });
  const doc = { slug, title: ep.title, language: "en", duration: res.duration, model: res.model, generated: new Date().toISOString().slice(0, 10), note: NOTE, segments };
  await writeFile(target, JSON.stringify(doc, null, 1), "utf8");
  console.log(`${slug}: ${segments.length} segments written, ${fixed} spelling fix(es) applied.`);
}
