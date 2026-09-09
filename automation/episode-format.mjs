// The show's fixed shape: the opener every episode starts on, the outro every
// episode ends on, and which theme bed a case gets.
//
// The writer is told to use these exact lines, but a model that paraphrases would
// put a slightly different opener on the show every week, which is the opposite of
// what a recognisable opener is for. So the script is corrected after it is written
// rather than trusted. enforceShowFormat is idempotent: running it on an already
// correct script is a no-op, so it is safe to apply to old drafts.

export const OPENER = "What's up guys, welcome back to CrimeTimeSnacks.";
export const OUTRO = "That's it for this one. Thanks for hanging out with me. This has been CrimeTimeSnacks, and I'll catch you next time.";

export const THEMES = ["cold-case", "active-investigation", "missing-person", "courtroom"];
export const DEFAULT_THEME = "cold-case";

// Openers the writer has actually produced, plus the shapes it drifts into. Anchored
// at the start so a mention of the show later in a paragraph is never eaten.
const OLD_OPENER = /^\s*(what'?s up,? guys[^.!?]*[.!?]|hey guys[^.!?]*[.!?]|welcome back[^.!?]*[.!?])\s*/i;
// A trailing sign-off, so a paraphrased one is replaced instead of stacked on ours.
// "stay curious ... stay safe" is the sign-off the drafter used to ask for; it is listed
// here so old drafts convert to the current one instead of ending on both.
const OLD_OUTRO = /(?:[^.!?]*\b(?:catch you next time|see you next time|that'?s it for this one|thanks for (?:hanging out|listening)|stay curious|stay safe)\b[^.!?]*[.!?]\s*)+$/i;

export function enforceShowFormat(script) {
  if (!Array.isArray(script) || !script.length) return Array.isArray(script) ? script : [];
  const out = script.map(String);

  const first = out[0].replace(OLD_OPENER, "").trimStart();
  out[0] = first ? `${OPENER} ${first}` : OPENER;

  const last = out.at(-1).replace(OLD_OUTRO, "").trimEnd();
  out[out.length - 1] = last ? `${last} ${OUTRO}` : OUTRO;
  return out;
}

// Which bed the episode gets. A heuristic on the case rather than another model call:
// it cannot fail halfway through a draft, it is the same answer every time, and Cory
// overrides it in the studio or with --theme when it reads the case wrong.
// Order matters: a case can be all three, and the most specific claim wins.
const SIGNALS = [
  ["courtroom", /\b(trial|retrial|verdict|appeal|parole|plea|sentencing|sentenced|convicted|acquitted|hearing|testimony|jury|indict\w*)\b/i],
  ["missing-person", /\b(missing|disappearance|disappeared|vanished|whereabouts|unaccounted|last seen)\b/i],
  ["active-investigation", /\b(manhunt|at large|arrest\w*|suspect|search warrant|ongoing|active investigation|task force|still open)\b/i],
];

export function pickTheme(kase = {}) {
  const hay = [kase.title, kase.caseTitle, kase.hook, ...(Array.isArray(kase.keywords) ? kase.keywords : [])]
    .filter(Boolean).join(" ");
  for (const [theme, re] of SIGNALS) if (re.test(hay)) return theme;
  return DEFAULT_THEME;
}

// Anything stored on a draft has to survive a typo without silently changing the sound.
export const normalizeTheme = (t) => (THEMES.includes(String(t)) ? String(t) : DEFAULT_THEME);
