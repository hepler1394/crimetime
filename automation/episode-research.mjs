#!/usr/bin/env node
// Podcast studio, step 0: research the case before anything is written.
//
//   node automation/episode-research.mjs "The Golden State Killer"
//   node automation/episode-research.mjs --case golden-state-killer
//   node automation/episode-research.mjs --draft 2026-09-08-the-golden-state-killer   (refresh an existing draft's notes)
//
// Cheapest sources that are actually reliable for a case summary, no keys:
//   1. Wikipedia (REST search + full article extract): the documented timeline,
//      names, dates, outcomes, with the article's own citations count.
//   2. DuckDuckGo HTML results for "<case> case update": recent coverage titles
//      and snippets, so the "where it stands now" section is not stale.
// Writes research.md (what the script writer reads) and research.json (sources)
// into automation/studio/research/<case-slug>/ and, with --draft, into the draft.
// The draft step feeds research.md into the prompt and tells the model to use
// nothing else, which is the single biggest hallucination reducer we have.

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
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const UA = "CrimeTimeSnacksStudio/1.0 (crimetime.vercel.app; coryh2014@gmail.com)";
const get = async (url, ms = 20000) => { const c = new AbortController(); setTimeout(() => c.abort(), ms); const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA, Accept: "application/json, text/html" } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

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
const sections = [];

// 1. Wikipedia: find the best article, pull the full plain-text extract.
try {
  const s = await (await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(kase.title + " murder case")}&srlimit=3&format=json&origin=*`)).json();
  const hit = s.query?.search?.[0];
  if (hit) {
    const page = await (await get(`https://en.wikipedia.org/w/api.php?action=query&prop=extracts|info&explaintext=1&exsectionformat=plain&inprop=url&titles=${encodeURIComponent(hit.title)}&format=json&origin=*`)).json();
    const p = Object.values(page.query?.pages || {})[0];
    if (p?.extract) {
      // Keep it to what a 2 minute script needs: the lead plus the first ~9000 chars.
      const text = p.extract.replace(/\n{3,}/g, "\n\n").trim();
      const clipped = text.length > 9000 ? text.slice(0, 9000).replace(/\s+\S*$/, "") + "\n\n[article continues]" : text;
      sections.push({ heading: `Wikipedia: ${p.title}`, body: clipped, url: p.fullurl });
      sources.push({ kind: "wikipedia", title: p.title, url: p.fullurl, fetched: new Date().toISOString() });
    }
  }
} catch (e) { sections.push({ heading: "Wikipedia", body: `Lookup failed: ${e.message}`, url: "" }); }

// 2. DuckDuckGo HTML: recent coverage, titles and snippets only.
try {
  const html = await (await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(kase.title + " case update")}`)).text();
  const items = [];
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && items.length < 8) {
    let url = m[1];
    const u = url.match(/uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
    if (/duckduckgo\.com/.test(url)) continue;
    items.push({ title: strip(m[2]), url, snippet: strip(m[3]) });
  }
  if (items.length) {
    sections.push({ heading: "Recent coverage (DuckDuckGo, titles and snippets)", body: items.map((i) => `- ${i.title}\n  ${i.snippet}\n  ${i.url}`).join("\n"), url: "" });
    for (const i of items) sources.push({ kind: "web", title: i.title, url: i.url, snippet: i.snippet });
  }
} catch (e) { sections.push({ heading: "Recent coverage", body: `Search failed: ${e.message}`, url: "" }); }

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
await writeFile(join(dir, "research.json"), JSON.stringify({ case: kase, generated: new Date().toISOString(), sources }, null, 2) + "\n", "utf8");
if (draftDir) {
  await writeFile(join(draftDir, "research.md"), md, "utf8");
  try { const epPath = join(draftDir, "episode.json"); const ep = JSON.parse(await readFile(epPath, "utf8")); ep.files = { ...(ep.files || {}), research: "research.md" }; ep.sources = sources; await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8"); } catch { /* fine */ }
}
out({ ok: true, case: kase.slug, dir, sources: sources.length, chars: md.length, message: `Research for "${kase.title}": ${sources.length} sources, ${md.length} chars -> ${dir}` });
