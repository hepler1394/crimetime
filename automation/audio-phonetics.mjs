// Shared by audio-compare.mjs: decide whether two spellings are the same sound.
//
// The clone speaks and the transcriber spells, and almost everything the audio gate used to
// report was the gap between those two jobs rather than a defect in the audio. On 2026-09-20
// two finished episodes were held on four and six findings, and every one of them was a
// spelling difference: "Knight" (Turner Guilford Knight Correctional Center) written as
// "night", "Arndt" as "Arendt", "Stephen" as "Steven", "Redfearn" as "Redfern". The clone said
// all of them correctly.
//
// The consonant skeleton in audio-compare.mjs already caught "Laundrie"/"laundry", but it works
// on letters, so a silent k or a silent gh defeats it. This works on sounds.
//
// What it must NOT do is swallow a real mispronunciation. The case that defines the floor is
// "Capital One" read as "Capra One", live on Apple Podcasts for six days: KPTL against KPR,
// still two different words here, still reported.
//
// Where it is deliberately loose: one consonant out of a word of eight letters or more is
// forgiven, because that is what the transcriber does to a surname it has never seen - the
// Moscow episode alone produced "Kohberger" as "cobreter", "kolberger" and "koberter". The cost
// of that rule is a pair like "defendant" and "defended", which it will not report. That is a
// real hole and it is a smaller one than holding finished episodes on people's names, which is
// what happened on 2026-09-20.

// Letters that carry no sound at the front of a word.
const HEAD = [[/^(kn|gn|pn|ps)/, (m) => m[1]], [/^wr/, () => "r"], [/^wh/, () => "w"], [/^x/, () => "z"]];

// A reduced pronunciation is speech, not a defect. Both sides are tokens (see tokens() in
// audio-compare.mjs), so apostrophes are already gone: "'cause" arrives as "cause".
// Keep this list short and defensible; every entry suppresses a real difference.
export const ELISION = new Map(Object.entries({
  because: ["cause", "cuz", "coz"],
  them: ["em"],
  him: ["im"],
  his: ["is"],
  her: ["er"],
  and: ["an", "n"],
  about: ["bout"],
  around: ["round"],
  until: ["til", "till"],
  have: ["of"],                       // "could have" written as "could of"
  "going to": ["gonna"],
  "want to": ["wanna"],
  "got to": ["gotta"],
  "kind of": ["kinda"],
  "sort of": ["sorta"],
  "out of": ["outta"],
}));

// Every way a word could reasonably come out, as a consonant key. Forks where English does
// ("ch" is two sounds; "gh" after a vowel is silent in "night" and an f in "laugh").
export function soundKeys(word) {
  let w = String(word).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z]/g, "");
  if (!w) return new Set();
  for (const [re, fn] of HEAD) w = w.replace(re, fn);
  w = w.replace(/mb$/, "m");                                          // comb, thumb

  let outs = [""];
  const push = (opts) => { const next = []; for (const o of outs) for (const c of opts) next.push(o + c); outs = next.slice(0, 32); };
  for (let i = 0; i < w.length; ) {
    const two = w.slice(i, i + 2), three = w.slice(i, i + 3), ch = w[i], nxt = w[i + 1] || "";
    if (three === "sch") { push(["sk"]); i += 3; continue; }
    if (two === "ph") { push(["f"]); i += 2; continue; }
    if (two === "gh") { push(i > 0 && /[aeiou]/.test(w[i - 1]) ? ["", "f"] : ["k"]); i += 2; continue; }
    if (two === "ch") { push(["X", "k"]); i += 2; continue; }
    if (two === "sh") { push(["X"]); i += 2; continue; }
    if (two === "th") { push(["0", "t"]); i += 2; continue; }        // Thomas, Thames, thyme
    if (two === "ck") { push(["k"]); i += 2; continue; }
    if (two === "dg") { push(["j"]); i += 2; continue; }
    if (two === "qu") { push(["kw"]); i += 2; continue; }
    if (ch === "c") { push(/[eiy]/.test(nxt) ? ["s"] : ["k"]); i++; continue; }
    if (ch === "g") { push(/[eiy]/.test(nxt) ? ["j", "k"] : ["k"]); i++; continue; }
    if (ch === "v") { push(["f"]); i++; continue; }                   // Stephen / Steven
    if (ch === "z") { push(["s"]); i++; continue; }                   // Coonts / Koontz
    if (ch === "x") { push(["ks"]); i++; continue; }
    if (ch === "d") { push(["t"]); i++; continue; }                   // the flap in "writer" / "rider"
    if ("aeiouyhw".includes(ch)) { i++; continue; }
    push([ch]); i++;
  }
  const collapse = (s) => s.replace(/(.)\1+/g, "$1");
  const set = new Set();
  for (const o of outs) {
    const k = collapse(o);
    // An empty key means the word was all vowels ("he", "you"). Those must not all look alike,
    // so fall back to the letters themselves.
    if (!k) { set.add("#" + w); continue; }
    set.add(k);
    if (/ts$/.test(k)) set.add(collapse(k.replace(/ts$/, "s")));       // "JonBenet's" heard as "JonBenese"
    // A possessive or a plural the transcriber rounded off - but only when the word really ends
    // in an s. Without that check the key for "Publix" ends in the s of its x, dropping it turns
    // the name into "public", and a genuine mispronunciation stops being reported.
    if (/s$/.test(w) && /s$/.test(k) && k.length > 2) set.add(k.slice(0, -1));
  }
  return set;
}

// Two spellings of one sound. Both words have to be long enough to be worth the doubt: without
// that floor, "night" and "not" are the same key and a real substitution would be swallowed.
export function sameSound(a, b) {
  if (a === b) return true;
  if (a.length < 4 || b.length < 4) return false;
  const A = soundKeys(a), B = soundKeys(b);
  for (const k of A) if (k && B.has(k)) return true;
  // One consonant out of a long word is a transcriber losing a syllable in something it has
  // never seen - "centimorgans" written "cinamorgans". A long word carries enough of itself
  // that one slip is not a mispronunciation. Short words get no such benefit, and two slips
  // get none at all, which is what keeps "capital" and "capra" apart (KPTL against KPR).
  if (Math.min(a.length, b.length) < 8) return false;
  for (const k of A) for (const j of B) if (k && j && oneEdit(k, j)) return true;
  return false;
}

// Exactly one insertion, deletion or substitution apart.
function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
    return diff === 1;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0, j = 0, skipped = false;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (skipped) return false;
    skipped = true; j++;
  }
  return true;
}

// A reduction of the script's words, not a different reading of them.
export function isElision(scriptWords, heardWords) {
  const s = scriptWords.join(" "), h = heardWords.join(" ");
  if (ELISION.get(s)?.includes(h)) return true;
  if (scriptWords.length !== heardWords.length) return false;
  return scriptWords.every((w, i) => w === heardWords[i] || (ELISION.get(w) || []).includes(heardWords[i]));
}
