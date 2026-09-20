// Shared by episode-audit.mjs and episode-repair.mjs: line a transcript up against the script
// and say which differences are worth a person's ear. See episode-audit.mjs for what each kind
// means and what this cannot hear.

const NUMS = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20", thirty: "30", forty: "40", fifty: "50", sixty: "60", seventy: "70", eighty: "80", ninety: "90", hundred: "100", thousand: "1000" };
// Accents fold to their base letter BEFORE the strip below, which turns anything
// outside [a-z0-9] into a space. Without that, "JonBenét's" came apart into
// "jonben" and "ts", and the audit then reported the script saying "jonben ts"
// against a transcriber's perfectly good "jonbenese" - a name the show says in
// every other sentence, flagged on every episode about her.
export const tokens = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, "").replace(/(\d),(\d)/g, "$1$2").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean).map((w) => NUMS[w] || w.replace(/(\d+)(st|nd|rd|th)$/, "$1"));

const SMALL = new Set("a an the of to in on at by for from with as it its is was are were be that this these those they there their he she his her him them and or but so if then than not no".split(" "));

// Consonant skeleton: what is left when spelling guesses are taken out. "laundrie" and
// "laundry" match, "capital" and "capra" do not.
// Soft c is an s ("Cervi"/"Servi"), and s and z are one sound to a transcriber ("Coonts"/"Koontz").
const skel = (w) => w.replace(/x/g, "ks").replace(/c(?=[eiy])/g, "s").replace(/z/g, "s").replace(/[cq]/g, "k").replace(/ph/g, "f").replace(/[aeiouyhw]/g, "").replace(/(.)\1+/g, "$1");

// paras: the script's paragraphs. heardWords: [{ w, s, p }] (word, start second, confidence).
// Returns findings as { kind, at (seconds into the voice track), pi (paragraph index), text }.
export function compareWords(paras, heardWords, audioOk = []) {
  const A = []; paras.forEach((t, pi) => tokens(t).forEach((w) => A.push({ w, pi })));
  const B = []; heardWords.forEach((h) => tokens(h.w).forEach((w) => B.push({ w, s: h.s, p: h.p })));

  // Greedy alignment with three-word anchors: both sides are the same text almost everywhere,
  // so a full edit-distance table over 4,000 x 4,000 words buys nothing.
  const diffs = []; let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (A[i].w === B[j].w) { i++; j++; continue; }
    // Resync on the nearest run of k matching words. Three is safe in running text; near the
    // end of a paragraph there is no room for three, so fall back to two, then one. Without
    // that, a harmless "the the" five words before the end read as a mispronounced last line.
    let best = null;
    for (const k of [3, 2, 1]) {
      const reach = k === 3 ? 40 : 8;
      for (let d = 1; d <= reach && !best; d++) for (let a = 0; a <= d; a++) { const b = d - a;
        if (i + a + k > A.length || j + b + k > B.length) continue;
        let same = true; for (let n = 0; n < k; n++) if (A[i + a + n].w !== B[j + b + n].w) { same = false; break; }
        if (same) { best = [a, b]; break; } }
      if (best) break;
      if (A.length - i > 6 && B.length - j > 6) break;                       // mid-text: do not resync on one word
    }
    if (!best) best = (A.length - i <= 6 || B.length - j <= 6) ? [A.length - i, B.length - j] : [1, 1];
    diffs.push({ pi: A[Math.min(i, A.length - 1)].pi, at: B[Math.min(j, B.length - 1)].s, script: A.slice(i, i + best[0]).map((x) => x.w), heard: B.slice(j, j + best[1]), next: B[j + best[1]]?.w || "", nextScript: A[i + best[0]]?.w || "" });
    i += best[0]; j += best[1];
  }
  if (i < A.length) diffs.push({ pi: A[i].pi, at: B.length ? B[B.length - 1].s : 0, script: A.slice(i).map((x) => x.w), heard: [], next: "", nextScript: "" });
  if (j < B.length) diffs.push({ pi: A.length ? A[A.length - 1].pi : 0, at: B[j].s, script: [], heard: B.slice(j), next: "", nextScript: "" });

  const okNames = new Set(audioOk.flatMap((n) => tokens(n)));
  const findings = [];
  for (const d of diffs) {
    const sJoin = d.script.join(""), hJoin = d.heard.map((x) => x.w).join("");
    if (sJoin === hJoin) continue;                                             // "van life" / "vanlife"
    if (sJoin === hJoin + d.next || sJoin + d.nextScript === hJoin) continue;  // "bodycam" heard as "body cam", split across the anchor
    if (/\d/.test(sJoin) || /\d/.test(hJoin)) continue;                         // numbers are written a dozen ways
    // A plural or a tense the model rounded off: "passenger"/"passengers", "dispersed"/"disperse".
    const [shortW, longW] = sJoin.length <= hJoin.length ? [sJoin, hJoin] : [hJoin, sJoin];
    if (shortW.length >= 4 && longW.startsWith(shortW) && longW.length - shortW.length <= 2) continue;
    // A past tense swallowed by the next word: "planned to spend" is said, and heard, as
    // "plan to spend". Three tries at re-voicing that paragraph all "failed" on it.
    if (shortW.length >= 4 && shortW.endsWith("y") && longW === shortW.slice(0, -1) + "ies") continue;   // "families" heard as "family"
    if (shortW.length >= 4 && /ed$/.test(longW) && longW.replace(/(.)\1ed$/, "$1").replace(/ed$/, "") === shortW.replace(/e$/, "")) continue;
    if (!d.script.length) {
      const weak = d.heard.filter((x) => x.p < 0.2);
      if (weak.length) findings.push({ kind: "ARTIFACT", at: d.at, pi: d.pi, text: `heard "${d.heard.map((x) => x.w).join(" ")}", which is not in the script (confidence ${Math.min(...weak.map((x) => x.p)).toFixed(2)}): a stutter or a stray sound` });
      continue;
    }
    if (!d.heard.length) { if (d.script.length >= 3) findings.push({ kind: "DROPPED", at: d.at, pi: d.pi, text: `"${d.script.join(" ")}" is in the script and was not heard` }); continue; }
    if (skel(sJoin) === skel(hJoin)) continue;
    if (d.script.every((w) => okNames.has(w))) continue;
    // A run of names comes back as one difference ("mogen xana kernodle and kaylee" against
    // "mogan zana kernodle and kaley"). When the word counts line up, judge it word by word:
    // every pair has to be the same sound, or a name on the allow list.
    if (d.script.length > 1 && d.script.length === d.heard.length &&
        d.script.every((w, n) => w === d.heard[n].w || okNames.has(w) || skel(w) === skel(d.heard[n].w))) continue;
    if (Math.max(sJoin.length, hJoin.length) < 4) continue;
    if (d.script.length === 1 && d.heard.length === 1 && SMALL.has(sJoin) && SMALL.has(hJoin)) continue;  // from/for, that/it: the model's own coin flips
    findings.push({ kind: "MISHEARD", at: d.at, pi: d.pi, text: `script says "${d.script.join(" ")}", it sounds like "${d.heard.map((x) => x.w).join(" ")}"` });
  }
  return { findings, scriptWords: A.length, heardWordCount: B.length };
}
