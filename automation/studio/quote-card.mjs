// The Instagram quote card: a real photograph of the case, a line from the record, and the
// mark. Same structure Crime Junkie uses, in this show's colours. Rendered through
// templates/post.html so a card and a carousel slide can never drift apart.
//
// The photograph is the point, and it is never generated. If the case has no still in
// studio/stills/<case>/ there is no card - a missing card is better than an invented image,
// and better than a stock photo of somebody who is not the person in the story.

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));   // automation/studio
const AUTO = join(here, "..");                          // automation
const ROOT = join(AUTO, "..");                          // repo root
const STILLS = join(here, "stills");
const TEMPLATE = pathToFileURL(join(here, "templates", "post.html")).href;
const LOGO = pathToFileURL(join(ROOT, "images", "logo.png")).href;
const PW = ["D:/Dev/GitHub/ig-studio/node_modules/playwright/index.mjs", join(ROOT, "node_modules", "playwright", "index.mjs")];

// A still, plus how it must be credited. Rights live beside it so the person deciding
// whether to post can see them; the card only renders the credit.
// A draft's caseSlug names the ANGLE, not the case: "moscow-idaho-the-plea",
// "delphi-the-appeal", "the-menendez-brothers-parole-years". A photograph belongs to the case,
// and the same case gets revisited, so a folder per angle would be wrong and would silently
// lose the photo on every follow-up. Look up by, in order: an explicit ep.stills, the exact
// slug, then a folder sharing a distinctive word with the slug or the case title.
const STOP = new Set(["the", "and", "of", "a", "an", "to", "in", "case", "file", "part", "years", "update"]);
const tokens = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w));

export async function stillFor(ep) {
  const caseSlug = typeof ep === "string" ? ep : ep?.caseSlug;
  const explicit = typeof ep === "string" ? null : ep?.stills;
  const read = async (folder) => {
    const dir = join(STILLS, folder);
    let book;
    try { book = JSON.parse(await readFile(join(dir, "sources.json"), "utf8")); } catch { return null; }
    for (const s of book.stills || []) {
      const file = join(dir, s.file || "");
      if (s.file && existsSync(file)) {
        return { file, folder, credit: s.credit || "", rights: s.rights || "", fit: s.fit || "cover", focus: s.focus || "center top" };
      }
    }
    return null;
  };

  if (explicit) return await read(explicit);
  if (caseSlug) { const exact = await read(caseSlug); if (exact) return exact; }

  const want = new Set([...tokens(caseSlug), ...tokens(typeof ep === "string" ? "" : ep?.caseTitle)]);
  if (!want.size || !existsSync(STILLS)) return null;
  const { readdir } = await import("node:fs/promises");
  for (const folder of await readdir(STILLS).catch(() => [])) {
    if (tokens(folder).some((t) => want.has(t))) { const hit = await read(folder); if (hit) return hit; }
  }
  return null;
}

// What the card says. Order matters: a real quotation beats a line of narration, and a line
// of narration must NOT be dressed up in quotation marks - that would put words in
// somebody's mouth on a card about a real crime.
export function cardText(ep) {
  const q = ep.quoteCard;
  if (q && q.quote) return { text: q.quote, attrib: q.attrib || "", quoted: true };
  if (q && q.line) return { text: q.line, attrib: q.attrib || "From the case file", quoted: false };
  // The hook is written for the ear and runs long. A card wants one line, so use the first
  // sentence - but only if a whole sentence fits. Never cut: a half sentence on a card about
  // a real crime reads as a claim nobody finished making, and clipped words look like a bug
  // because they are one. If nothing fits, skip the card and say why.
  if (ep.hook) {
    const line = String(ep.hook).trim();
    if (line.length <= 190) return { text: line, attrib: "From the case file", quoted: false };
    const first = (line.match(/^[^.!?]{20,190}[.!?]/) || [])[0];
    if (first) return { text: first.trim(), attrib: "From the case file", quoted: false };
    return null;
  }
  return null;
}

// The tag names the CASE, not the episode. Episode titles are written "Case: Angle"
// ("Murders in Moscow: The Plea", "Courtney Clenney: Six Years, No Trial"), so the part before
// the colon is the case and makes the tag. caseTitle is sometimes a raw slug, so a real title
// wins over a de-slugged one. Cut on a word boundary or not at all.
export function cardTag(ep) {
  const deslug = (s) => String(s || "").trim().includes(" ") ? String(s || "").trim() : String(s || "").replace(/-/g, " ").trim();
  // caseTitle names the case and wins when it is readable; title names the episode and is the
  // fallback for when caseTitle came through as a slug.
  const titled = String(ep.caseTitle || "").includes(" ") ? ep.caseTitle
               : String(ep.title || "").includes(" ") ? ep.title : null;
  let name = deslug(titled || ep.caseTitle || ep.title || "");
  name = name.split(":")[0].trim() || name;
  if (name.length > 36) {
    const cut = name.slice(0, 36);
    const sp = cut.lastIndexOf(" ");
    name = (sp > 12 ? cut.slice(0, sp) : cut).trim();
  }
  return `UPDATE: ${name.toUpperCase()}`.trim();
}

// Returns { file, credit } or { skipped: reason }.
export async function renderQuoteCard(ep, dir) {
  const still = await stillFor(ep);
  if (!still) return { skipped: `no photograph in automation/studio/stills/ for ${ep.caseSlug || "this case"}, so no card` };
  const said = cardText(ep);
  if (!said) return { skipped: "the draft has no hook and no quoteCard, so there is nothing to put on a card" };

  const pw = PW.find((p) => existsSync(p));
  if (!pw) return { skipped: "Playwright not found; run npm i in D:\\Dev\\GitHub\\ig-studio" };
  const { chromium } = await import(pathToFileURL(pw).href);
  const browser = await chromium.launch();
  const file = join(dir, "quote-card.jpg");
  try {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const slide = {
      kind: "quote", logo: LOGO,
      bg: pathToFileURL(still.file).href, fit: still.fit, focus: still.focus,
      tag: cardTag(ep),
      quote: said.text, quoted: said.quoted,
      attrib: said.attrib,
      credit: still.credit ? `Photo: ${still.credit}` : "",
    };
    await page.addInitScript((d) => { window.SLIDE = d; }, slide);
    await page.goto(TEMPLATE, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: file, type: "jpeg", quality: 94 });
  } finally { await browser.close(); }
  await stat(file);
  return { file, credit: still.credit, rights: still.rights, quoted: said.quoted };
}
