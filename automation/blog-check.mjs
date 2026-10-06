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

// Quotations: a quoted run of four or more words must be in the notes, letters and digits
// compared, so curly quotes and dashes do not matter. The name-and-number check cannot see an
// invented quote made of ordinary words; this can. Shorter quoted runs are usually a term
// ("touch DNA", "Bridge Guy") and are left to the name check.
const flatText = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function quotesIn(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/["“]([^"“”]{3,400})["”]/g)) {
    const q = m[1].trim();
    if (q.split(/\s+/).length >= 4) out.push(q);
  }
  return out;
}
export function unsupportedQuotes(post, notes) {
  const page = flatText(notes);
  const missing = [];
  for (const block of post.body || []) for (const q of quotesIn(block)) if (!page.includes(flatText(q))) missing.push(q);
  return missing;
}

// Stock lines. On 2026-10-05, 13 of 20 posts opened "You have probably heard the headline
// version", 10 ended "Read the file. Form your own conclusion." and 12 said "I went back
// through the case file", which Cory did not: the posts are written from research notes.
// The voice guide's examples were being copied as templates. Each of these sends the draft
// back for one rewrite; a post's opening must also not repeat a recent post's opening.
export const STOCK_PHRASES = [
  "headline version", "strangest true detail", "read the file. form your own conclusion", "form your own conclusion",
  "i went back through", "let's unpack", "let us unpack", "delve", "in conclusion", "in this article", "in this post",
  "shockwaves", "gripped the nation", "gripped the entire country", "sent ripples", "tapestry", "it's important to note",
  "it is important to note", "today, we are going to", "today we are going to", "our episode", "stay tuned",
];
const opening = (post) => flatText((post.body || []).find((b) => !b.startsWith("## ")) || "").split(" ").slice(0, 6).join(" ");
export function stockLines(post, recent = []) {
  const text = flatText([post.title, ...(post.body || [])].join(" \n "));
  const hits = STOCK_PHRASES.filter((p) => text.includes(flatText(p)));
  const mine = opening(post);
  const clash = mine && recent.find((r) => opening(r) === mine);
  if (clash) hits.push(`opens with the same words as "${clash.title}"`);
  return hits;
}
