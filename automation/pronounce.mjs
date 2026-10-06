// How the voice clone should say the names it gets wrong.
//
// The clone reads spelling, and a case's names are rarely spelled the way the family says
// them: it read "Murdaugh" as "Mur-daw" (the family says MUR-dock) and "Goncalves" as
// "GON-cal-ves" (gon-SAL-vez), and the audit could not hear either, because a transcriber
// writes the famous spelling whatever it hears. Cory caught both by ear on 2026-10-02.
//
// automation/pronunciations.json maps a written word to a spelling the clone says right.
// Only what is sent to the voice changes: the script, the transcript, the site and the
// captions keep the real spelling. episode-voice.mjs and episode-repair.mjs voice
// spoken(text); episode-audit.mjs compares what it hears with spoken(text) and also accepts
// both spellings, so a transcriber that writes the real name is not a finding.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const FILE = join(dirname(fileURLToPath(import.meta.url)), "pronunciations.json");
let cache = null;
function table() {
  if (cache) return cache;
  try { cache = JSON.parse(readFileSync(FILE, "utf8")).words || {}; } catch { cache = {}; }
  return cache;
}

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Whole words only, any case the script used; a possessive or plural rides along
// ("Murdaugh's" becomes "Murdock's").
export function spoken(text) {
  let out = String(text ?? "");
  for (const [word, say] of Object.entries(table())) {
    // Letter boundaries rather than \b, which does not count an accented letter as part of a
    // word ("Rosselló"). The respelling is voiced as written: in capitals it can be read out
    // letter by letter.
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${esc(word)}(?![\\p{L}\\p{N}])`, "giu"), () => say);
  }
  return out;
}

// Both spellings of every listed name, for the audit's allow list.
export function pronounceOk() {
  return Object.entries(table()).flatMap(([w, s]) => [w, s]);
}
