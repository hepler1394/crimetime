// The public transcript of a cloned episode is the script, timed against the recording.
//
// Until 2026-09-24 episode-voice.mjs ran faster-whisper "small" over the finished voice
// track and shipped whatever it heard as the transcript, labelled "generated from the
// episode script". It was not. The Murdaugh page went live saying "Maggie Murdoff",
// "Eilinton" for Islandton, "Mowry Beach" for Mallory Beach, a blood alcohol content of
// "28.6" for .286, and "10,006 p.m." for 10:06 p.m. - none of it in the script, all of
// it the transcriber guessing at a name it had never seen. On a page about real murder
// victims that reads as a fact error, and an outside audit called it exactly that.
//
// The script is the checked artifact: every claim in it passed the fact gate and the
// audio gate confirmed the render says those words. So the transcript IS the script.
// The recording only supplies the clock: where each paragraph sits in the voice track
// (exact, from the paragraph renders that were joined; or read back from the audio by
// audio-paragraphs.mjs), and sentences inside a paragraph are spread across its span in
// proportion to their length. A timestamp is within a few seconds, which is what a
// tap-to-seek transcript needs; the words are exact.
//
// Shared by episode-voice.mjs (fresh renders), episode-splice.mjs (repaired ones) and
// episode-transcript.mjs (rebuilding published episodes from their drafts).

export const SCRIPT_NOTE = "This transcript is the episode script as written and fact-checked, timed to the recording. Timestamps are approximate within a sentence.";
export const SCRIPT_MODEL = "episode script, timed to the recording";

// Abbreviations a full stop does not end a sentence after.
const ABBR = /\b(?:Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|No|Lt|Sgt|Det|Gov|Sen|Rep|Capt|Col|Gen|Prof|Inc|Co|Mt|Ft|Ave|Blvd|Rd|Hon|Rev|Cpl|Pvt|Mgr|Dept|Est|Approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|U\.S|D\.C|L\.A|N\.Y|a\.m|p\.m)\.$/i;
const INITIAL = /(?:^|\s)[A-Z]\.$/;

// Split a paragraph into sentences. Conservative: a boundary is end punctuation, optional
// closing quote or bracket, whitespace, then a capital letter, digit or opening quote - and
// not after an abbreviation or a single-letter initial. A paragraph that never splits comes
// back whole, which is fine: the span is still right, only coarser.
export function splitSentences(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const out = [];
  let start = 0;
  const re = /[.!?]+["'’”)\]]*\s+(?=["'“(\[]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(s))) {
    const cut = m.index + m[0].length;
    const before = s.slice(start, m.index + 1).trimEnd();
    // Abbreviation or initial: "Dr. Smith", "J. R. Ramsey", "10:06 p.m. Alex called". A missed
    // split only makes a segment longer; a false one cuts a sentence in half on the page.
    const tail = before.split(/\s+/).pop() || "";
    if (ABBR.test(tail) || INITIAL.test(before.slice(-3))) continue;
    out.push(s.slice(start, cut).trim());
    start = cut;
  }
  if (start < s.length) out.push(s.slice(start).trim());
  return out.filter(Boolean);
}

// paras: the script paragraphs; spans: [[start, end], ...] one per paragraph, in seconds of
// the voice track; offset: where the voice track starts in the finished episode.
// Returns [{ start, end, text }, ...] at sentence granularity.
export function segmentsFromSpans(paras, spans, offset = 0) {
  if (paras.length !== spans.length) throw new Error(`segmentsFromSpans: ${paras.length} paragraphs but ${spans.length} spans`);
  const segs = [];
  for (let i = 0; i < paras.length; i++) {
    const [s, e] = spans[i];
    const sentences = splitSentences(paras[i]);
    if (!sentences.length) continue;
    const weights = sentences.map((t) => Math.max(1, t.replace(/\s+/g, "").length));
    const total = weights.reduce((a, b) => a + b, 0);
    const len = Math.max(0, e - s);
    let at = s;
    for (let j = 0; j < sentences.length; j++) {
      const dur = (weights[j] / total) * len;
      const start = +(at + offset).toFixed(1), end = +(at + dur + offset).toFixed(1);
      segs.push({ start, end: Math.max(end, start), text: sentences[j] });
      at += dur;
    }
  }
  return segs;
}

// Spans from a list of paragraph renders that were concatenated with a silent gap after each
// one: the exact clock, no listening required. lengths: seconds of each part; gaps: seconds of
// silence after part i (a number for a flat gap, or an array of N-1).
export function spansFromParts(lengths, gaps = 0.55) {
  const spans = [];
  let at = 0;
  for (let i = 0; i < lengths.length; i++) {
    spans.push([at, at + lengths[i]]);
    at += lengths[i] + (Array.isArray(gaps) ? (gaps[i] ?? 0) : gaps);
  }
  return spans;
}

export function transcriptDoc({ slug, title, seconds, segments, how = SCRIPT_MODEL }) {
  return {
    slug, title, language: "en", duration: +Number(seconds).toFixed(1), model: how,
    generated: new Date().toISOString().slice(0, 10), note: SCRIPT_NOTE, segments,
  };
}
