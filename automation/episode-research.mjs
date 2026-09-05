#!/usr/bin/env node
// Podcast studio, step 0: research the case before anything is written.
//
//   node automation/episode-research.mjs "The Golden State Killer"
//   node automation/episode-research.mjs --case golden-state-killer
//   node automation/episode-research.mjs --draft 2026-09-08-the-golden-state-killer   (refresh an existing draft's notes)
//
// Free sources, no keys, deep enough for a twenty-minute episode:
//   1. Wikipedia: the full plain-text article (up to ~40k chars) for the case
//      and, when the case has one, the separate article for the offender or
//      the victim. Timeline, names, dates, outcomes, with citations behind them.
//   2. DuckDuckGo results for "<case> case": the top pages are fetched and their
//      article text extracted (paragraphs only, scripts and menus stripped), so
//      "where it stands now" comes from actual reporting, not a snippet.
// Writes research.md (what the writer reads, chunked by heading) and
// research.json (sources) into automation/studio/research/<case-slug>/ and, with
// --draft, into the draft. The draft step retrieves the chunks that match each
// chapter, so the whole file can be far bigger than the model's context.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH = join(__dirname, "studio", "research");
const DRAFTS = join(__dirname, "studio", "drafts");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const say = (m) => { if (!asJson) console.log(m); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CrimeTimeSnacksStudio/1.0 (www.crimetimesnacks.com)";
const get = async (url, ms = 25000) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); const r = await fetch(url, { signal: c.signal, redirect: "follow", headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*" } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const decode = (h) => h.replace(/&amp;/g, "&").replace(/&#x27;|&#39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&mdash;/g, ", ").replace(/&ndash;/g, "-").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const strip = (h) => decode(h.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Article text from an HTML page: paragraphs only, junk removed.
function articleText(html, cap = 7000) {
  let h = html.replace(/<(script|style|nav|header|footer|aside|form|noscript|svg|figure|iframe)[\s\S]*?<\/\1>/gi, " ");
  const paras = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => strip(m[1])).filter((t) => t.length > 80 && !/cookie|subscribe|newsletter|sign up|all rights reserved|©/i.test(t));
  let text = "";
  for (const p of paras) { if ((text + p).length > cap) break; text += p + "\n\n"; }
  return text.trim();
}

// Which case?
let kase = null, draftDir = null;
const draftId = opt("--draft", null);
if (draftId) {
  draftDir = join(DRAFTS, draftId);
  try { const ep = JSON.parse(await readFile(join(draftDir, "episode.json"), "utf8")); kase = { slug: ep.caseSlug || ep.slug, title: ep.caseTitle || ep.title, angle: "" }; } catch { die("draft", `No draft ${draftId}`); }
}
if (!kase) {
  const { cases = [] } = JSON.parse(await readFile(join(__dirname, "cases.json"), "utf8").catch(() => "{}"));
  const wanted = opt("--case", null) || args.find((a, i) => !a.startsWith("--") && !(args[i - 1] || "").startsWith("--"));
  if (!wanted) die("args", "usage: episode-research.mjs <case title> | --case <slug> | --draft <id>");
  kase = cases.find((c) => c.slug === wanted || c.slug === slugify(wanted) || c.title.toLowerCase() === wanted.toLowerCase()) || { slug: slugify(wanted), title: wanted, angle: "" };
}

const sources = [];
const sections = []; // { heading, url, body }

// 1. Wikipedia: best two articles for the query, full extracts.
async function wikiArticle(title) {
  const page = await (await get(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&explaintext=1&exsectionformat=wiki&inprop=url&redirects=1&titles=${encodeURIComponent(title)}&format=json&origin=*`)).json();
  const p = Object.values(page.query?.pages || {})[0];
  return p?.extract ? { title: p.title, url: p.fullurl, text: p.extract } : null;
}
try {
  const s = await (await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(kase.title + " murder case")}&srlimit=4&format=json&origin=*`)).json();
  const hits = (s.query?.search || []).slice(0, 2);
  for (const hit of hits) {
    const a = await wikiArticle(hit.title).catch(() => null);
    if (!a) continue;
    // Drop the reference tail; split into sections on the == Heading == markers so the writer can retrieve by topic.
    const text = a.text.replace(/\n==+\s*(References|External links|Further reading|See also|Notes|Bibliography)\s*==+[\s\S]*$/i, "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 40000);
    const parts = text.split(/\n(?===+ )/);
    for (const part of parts) {
      const m = part.match(/^==+\s*(.+?)\s*==+\s*\n?([\s\S]*)$/);
      const heading = m ? `${a.title}: ${m[1]}` : `${a.title}: Lead`;
      const body = (m ? m[2] : part).trim();
      if (body.length > 120) sections.push({ heading, url: a.url, body });
    }
    sources.push({ kind: "wikipedia", title: a.title, url: a.url, chars: text.length, fetched: new Date().toISOString() });
    say(`  wikipedia: ${a.title} (${text.length} chars)`);
  }
} catch (e) { say(`  wikipedia failed: ${e.message}`); }

// 2. DuckDuckGo: top pages, fetched and read.
try {
  const html = await (await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(kase.title + " case")}`)).text();
  const items = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && items.length < 10) {
    let url = m[1];
    const u = url.match(/uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
    if (/duckduckgo\.com|wikipedia\.org|youtube\.com|facebook\.com|tiktok\.com|instagram\.com|reddit\.com|amazon\.com/.test(url)) continue;
    items.push({ title: strip(m[2]), url, snippet: strip(m[3]) });
  }
  let fetched = 0;
  for (const it of items) {
    if (fetched >= 4) break;
    try {
      const page = await (await get(it.url, 20000)).text();
      const text = articleText(page);
      if (text.length < 600) continue;
      sections.push({ heading: `Coverage: ${it.title}`, url: it.url, body: text });
      sources.push({ kind: "web", title: it.title, url: it.url, chars: text.length, snippet: it.snippet });
      say(`  coverage: ${it.title.slice(0, 70)} (${text.length} chars)`);
      fetched++;
    } catch (e) { say(`  skip ${it.url.slice(0, 60)}: ${e.message.slice(0, 60)}`); }
  }
  const rest = items.filter((i) => !sources.some((s) => s.url === i.url));
  if (rest.length) sections.push({ heading: "More coverage (titles and snippets only)", url: "", body: rest.map((i) => `- ${i.title}\n  ${i.snippet}\n  ${i.url}`).join("\n") });
} catch (e) { say(`  search failed: ${e.message}`); }

if (!sources.length) die("sources", "No sources could be fetched. Offline? The draft step still runs, but with nothing to ground on.");

const md = [
  `# Research notes: ${kase.title}`,
  `Generated ${new Date().toISOString().slice(0, 10)} by episode-research.mjs. Angle: ${kase.angle || "the documented facts and where the case stands"}.`,
  "",
  "Rules for the writer: use ONLY facts that appear below. If a detail is not here, leave it out or say it generally. Every name, date, number and quote in the script must be traceable to a line in these notes.",
  "",
  ...sections.flatMap((s) => [`## ${s.heading}`, s.url ? `Source: ${s.url}` : "", "", s.body, ""]),
].join("\n");

const dir = join(RESEARCH, kase.slug);
await mkdir(dir, { recursive: true });
await writeFile(join(dir, "research.md"), md, "utf8");
await writeFile(join(dir, "research.json"), JSON.stringify({ case: kase, generated: new Date().toISOString(), sources, sections: sections.length }, null, 2) + "\n", "utf8");
if (draftDir) {
  await writeFile(join(draftDir, "research.md"), md, "utf8");
  try { const epPath = join(draftDir, "episode.json"); const ep = JSON.parse(await readFile(epPath, "utf8")); ep.files = { ...(ep.files || {}), research: "research.md" }; ep.sources = sources; await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8"); } catch { /* fine */ }
}
out({ ok: true, case: kase.slug, dir, sources: sources.length, sections: sections.length, chars: md.length, message: `Research for "${kase.title}": ${sources.length} sources, ${sections.length} sections, ${Math.round(md.length / 1000)}k chars -> ${dir}` });
