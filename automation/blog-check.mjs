// The blog's fact check: every name and number in a post must be in the research notes it
// was written from. Same matching as the case update gate (community/update-gate.mjs), with
// extraction tuned for long prose: the first word of a sentence is capitalised anyway, so it
// only counts when it starts a run of capitalised words ("Joseph DeAngelo pleaded").
//
// What it catches: an invented name, a transposed year, a figure the notes never give.
// What it cannot: a sentence that uses only names and numbers from the notes but gets the
// relationship between them wrong. Same limit as episode-verify.mjs, said plainly there.
import { makeFinder } from "./community/update-gate.mjs";

const NOT_NAMES = new Set(["I", "I'm", "I've", "I'd", "I'll", "CrimeTimeSnacks", "Cory", "OK"]);
const clean = (w) => w.replace(/^[("“‘'\[]+/, "").replace(/[)"”’'\]]+$/, "").replace(/[.,;:!?]+$/, "").replace(/['’]s$/, "");

export function postTokens(text, { numbersOnly = false } = {}) {
  const s = String(text || "");
  const out = new Set();
  // A currency prefix is part of the number ("US$41,000"), and a match may never start right
  // after a digit and comma: without both, "US$41,000" was read as the number "000".
  for (const m of s.matchAll(/(?<![\w.,$])(?:[A-Z]{1,2}\$|\$)?(\d[\d,.:\/]*)(?:[KMB]\b|(?![\w]))/g)) {
    const n = m[1].replace(/[,.:\/]+$/, "").replace(/,/g, "");
    if (n) out.add(n);
  }
  if (numbersOnly) return [...out];
  for (const sentence of s.split(/(?<=[.!?]["”’)]?)\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    let run = [], start = -1;
    const flush = () => {
      if (run.length) {
        const name = (start === 0 ? run.slice(1) : run).filter((w) => !NOT_NAMES.has(w));
        if (name.length) out.add(name.join(" "));
      }
      run = []; start = -1;
    };
    words.forEach((raw, i) => {
      const w = clean(raw);
      const capital = /^[A-Z][A-Za-z.'’-]*$/.test(w) && !/^\d/.test(w);
      if (capital) { if (!run.length) start = i; run.push(w); } else flush();
      // A run ends at punctuation even when the next word is capitalised ("Utah, Idaho").
      if (capital && /[,;:.!?)"”]$/.test(raw)) flush();
    });
    flush();
  }
  return [...out].filter((t) => t.length > 1);
}

// post: { title, body: [paragraph | "## heading"] }. Returns the tokens the notes lack.
export function unsupportedInPost(post, notes) {
  const found = makeFinder(notes);
  const missing = new Set();
  for (const t of postTokens(post.title, { numbersOnly: true })) if (!found(t)) missing.add(t);
  for (const block of post.body || []) {
    const heading = block.startsWith("## ");
    for (const t of postTokens(heading ? block.slice(3) : block, { numbersOnly: heading })) if (!found(t)) missing.add(t);
  }
  return [...missing];
}

export const postWords = (post) => (post.body || []).filter((b) => !b.startsWith("## ")).join(" ").split(/\s+/).filter(Boolean).length;
