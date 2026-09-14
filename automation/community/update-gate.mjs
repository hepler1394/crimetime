// The gate for case updates: what episode-verify.mjs is to an episode, this is to an update
// the watcher finds. Updates publish themselves, onto the case page and into the Sunday
// digest, when they pass; anything held stays pending for Cory with the reason on the row.
// Changed 2026-09-13 at Cory's instruction ("make case updates auto approve like episodes"):
// in eight days of a human queue nothing was ever approved, so every case page read
// "Nothing logged yet".
//
// An update is approved only when ALL of these hold:
//   1. The article itself was read. A search snippet is not enough to stand behind.
//   2. It is not dated in the future.
//   3. It is not a duplicate of an update already on the case (same story at another URL,
//      or a near-identical title within two weeks). Duplicates are rejected, not held.
//   4. Every name and number in the summary appears in the article (the check that earns
//      its keep in episode-verify too), and every number in the title.
//   5. A model reading the article says it reports this development, AND the sentence it
//      quotes as support is actually in the article. The model's word alone is not enough.
//
// What it cannot catch: an article that is itself wrong, or a development the article
// reports accurately but which a later article reverses. The case page shows each update
// with its date and source, and Cory can reject one from the studio after the fact.

/* ------------------------------------------------------------ text */
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60 };
export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\bjan(uary)?\b/g, "january").replace(/\bfeb(ruary)?\b/g, "february")
  .replace(/\bmar(ch)?\b/g, "march").replace(/\bapr(il)?\b/g, "april")
  .replace(/\bjun(e)?\b/g, "june").replace(/\bjul(y)?\b/g, "july")
  .replace(/\baug(ust)?\b/g, "august").replace(/\bsept?(ember)?\b/g, "september")
  .replace(/\boct(ober)?\b/g, "october").replace(/\bnov(ember)?\b/g, "november")
  .replace(/\bdec(ember)?\b/g, "december")
  // "US$41,000" in Wikipedia's notes: drop the country letters with the symbol, or the number
  // becomes "us41000" and no longer stands on a word boundary.
  .replace(/\b[a-z]{1,2}\$(?=\d)/g, "$")
  .replace(/[,$]/g, "")
  .replace(new RegExp(`\\b(${Object.keys(NUM).join("|")})\\b`, "g"), (m) => String(NUM[m]));
// For matching a quoted sentence: punctuation and spacing differ between a model's copy and
// the page (curly quotes, non-breaking spaces, dashes), so compare letters and digits only.
const flat = (s) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();

const LEADING = /^(The|This|That|These|Those|He|She|They|It|A|An|In|On|At|By|For|From|With|And|But|His|Her|Their|Its|After|Before|During|When|While|Police|Investigators|Prosecutors|Defense|Defence|Court|Judge|State|Attorneys|Lawyers|Family|Officials|Five|Four|Three|Two|One|Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

// The load-bearing parts of an update: numbers everywhere, and proper names in the summary.
// Titles are often Title Case, so their capitalised words say nothing; only their numbers count.
export function distinctive({ title = "", summary = "" }) {
  const out = new Set();
  // "$50M" in a headline is "$50 million" in the article: check the 50.
  // "US$41,000" is one number: take the currency prefix, and never start a match just after a
  // digit and comma, or the "000" is read on its own.
  const numbers = (s) => { for (const m of s.matchAll(/(?<![\w.,$])(?:[A-Z]{1,2}\$|\$)?(\d[\d,.:\/]*)(?:[KMB]\b|(?![\w]))/g)) out.add(m[1].replace(/[,.]$/, "").replace(/,/g, "")); };
  numbers(title); numbers(summary);
  for (const m of summary.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z.]+){0,3})\b/g)) {
    const first = m[1].split(/\s+/)[0];
    if (LEADING.test(first) && !m[1].includes(" ")) continue;
    out.add(LEADING.test(first) ? m[1].split(/\s+/).slice(1).join(" ") : m[1]);
  }
  return [...out].filter(Boolean);
}

// found(token) against one text, normalised once: the blog check calls it hundreds of times
// against 90,000 characters of research notes.
export function makeFinder(text) {
  const page = norm(text);
  return (t) => {
    const n = norm(t);
    // Numbers on a word boundary: "19" must not be found inside "2019".
    if (/^[\d.:\/]+$/.test(n)) return new RegExp(`(?<![\\w.])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w])`).test(page);
    if (page.includes(n)) return true;
    const parts = n.split(/\s+/).filter(Boolean);
    return parts.length > 1 && parts.every((p) => page.includes(p));
  };
}

export function missingFromArticle(update, articleText) {
  const found = makeFinder(articleText);
  return distinctive(update).filter((t) => !found(t));
}

/* -------------------------------------------------------- duplicates */
// One story often lives at two URLs (mysuncoast.com/2026/08/27/... and /video/2026/08/27/...).
export const normUrl = (u) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/video\//, "/").replace(/\/+$/, "")}`.toLowerCase(); } catch { return String(u || "").toLowerCase(); } };
const STOP = new Set("the a an and or of to in on at by for from with as is are was were be been has have had its his her their after over into against about new says said".split(" "));
const titleWords = (s) => new Set(flat(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
const DAY = 864e5;

export function findDuplicate(update, existing) {
  const mine = titleWords(update.title);
  const at = Date.parse(`${update.happened_on}T00:00:00Z`);
  for (const e of existing) {
    if (update.url && e.url && normUrl(update.url) === normUrl(e.url)) return e;
    const theirs = titleWords(e.title);
    const inter = [...mine].filter((w) => theirs.has(w)).length;
    const jaccard = inter / (new Set([...mine, ...theirs]).size || 1);
    const days = Math.abs(at - Date.parse(`${e.happened_on}T00:00:00Z`)) / DAY;
    if (jaccard >= 0.5 && days <= 14) return e;
  }
  return null;
}

/* ------------------------------------------------------------- gate */
const hold = (note) => ({ decision: "hold", note });

// update: { title, summary, happened_on, url }. articleText: the page as text ("" if it could
// not be read). existing: approved updates on the same case. check(update, articleText) ->
// { supported, quote, why }. today: "YYYY-MM-DD".
export async function gateUpdate({ update, articleText, existing = [], today, check }) {
  if (!articleText || articleText.length < 400) return hold("the article could not be read, so nothing in the update could be checked against it");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(update.happened_on || "")) return hold("the update has no date");
  if (update.happened_on > today) return hold(`dated ${update.happened_on}, which is in the future`);
  const dup = findDuplicate(update, existing);
  if (dup) return { decision: "reject", note: `duplicate of update ${dup.id ?? ""} "${String(dup.title).slice(0, 80)}"`.replace("update  ", "update ") };
  const missing = missingFromArticle(update, articleText);
  if (missing.length) return hold(`not in the article: ${missing.join(", ")}`);
  let verdict;
  try { verdict = await check(update, articleText); } catch (e) { return hold(`the article check did not run: ${e.message}`); }
  if (!verdict || verdict.supported !== true) return hold(`the article does not report this${verdict?.why ? `: ${String(verdict.why).slice(0, 200)}` : ""}`);
  const quote = flat(verdict.quote);
  if (quote.split(" ").length < 6 || !flat(articleText).includes(quote)) return hold("the sentence offered as support is not in the article");
  return { decision: "approve", note: `carried by the article: "${String(verdict.quote).replace(/\s+/g, " ").trim().slice(0, 300)}"` };
}

// The model half of check 5, over the chat() helper in llm.mjs.
const CHECK_SYSTEM = `You check one case update against the news article it cites, for a true crime case-tracking service that publishes these without a human reading them first. Judge ONLY from the ARTICLE text given, never from what you know about the case.
Answer "supported": true only if the ARTICLE itself reports the development in the update (the event, who, and roughly when), and the summary says nothing the ARTICLE does not. A retrospective, an anniversary piece, or an article that only mentions the case in passing does not support a development.
Output ONLY a JSON object: {"supported": boolean, "quote": string (one sentence copied EXACTLY, character for character, from the ARTICLE that states the development; empty if none), "why": string (one short sentence)}`;
export function modelCheck(chat, cfg) {
  return async (update, articleText) => {
    const { text } = await chat(CHECK_SYSTEM,
      `UPDATE\nDate: ${update.happened_on}\nTitle: ${update.title}\nSummary: ${update.summary}\n\nARTICLE\n${articleText.slice(0, 14000)}`,
      { ...cfg, jsonMode: true, timeoutMs: 120000 });
    return JSON.parse(text);
  };
}

// The digest only mails what happened recently. An older development the watcher finds late
// still goes on the case page timeline, dated, but is not sent out as this week's news.
export const DIGEST_MAX_AGE_DAYS = 45;
