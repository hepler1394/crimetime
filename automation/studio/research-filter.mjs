// Is a Wikipedia article actually about this case?
//
// The research step used to take the top two search hits on trust. Asked for
// "Chris Watts: The Interrogation murder case", Wikipedia returned "Mahmudiyah rape and
// murders" first, and 22,000 characters about an Iraq court-martial went into the Chris Watts
// notes - the same notes the fact gate checks episode scripts against, so a claim could have
// been marked supported by evidence from an entirely different crime. Search ranking is not
// relevance, and stripping the episode subtitle from the query only made the wrong answers
// rank lower: "Murder of Alice Gross" still came second for the corrected query.
//
// A hit is kept when a distinctive word of the case name is in the article title, or is used
// often enough in the article to be what the article is about. The frequency route earns its
// place: the Moscow case's article is "University of Idaho killings", whose title carries no
// word of the case name, so a title-only rule would throw the right article away.

const RESEARCH_STOP = new Set("the a an and or of in on at to for from with case murder murders murdered killing killings death deaths disappearance trial appeal file part update years story".split(/\s+/));
export const caseTokens = (name) => [...new Set(String(name || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")   // JonBenét and JonBenet must match
  .toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 4 && !RESEARCH_STOP.has(w)))];

export function articleIsAboutCase(caseName, title, extract = "") {
  // Index pages are never the case's article, and they are exactly what slips through the
  // frequency test: "List of unsolved murders (2000-present)" mentions a city often enough to
  // look relevant. Both articles that poisoned the Watts notes were lists.
  if (/^(list|timeline|index|outline) of /i.test(String(title || "").trim())) return false;
  const toks = caseTokens(caseName);
  if (!toks.length) return true;                        // nothing to judge on; let it through
  const flat = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const t = flat(title), x = flat(extract);
  if (toks.some((w) => t.includes(w))) return true;
  // NOTE: the escapes must be \b inside a template literal. A single \b there is a
  // backspace character, not a word boundary, and the count silently stays zero.
  // Otherwise the article has to be substantially about it. One or two passing mentions of a
  // common first name is exactly the false positive this guards against.
  return toks.some((w) => (x.match(new RegExp(`\\b${w}\\b`, "g")) || []).length >= 5);
}
