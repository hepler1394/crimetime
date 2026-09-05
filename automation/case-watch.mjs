#!/usr/bin/env node
// Case watcher: looks for new developments in every case people can follow and
// files them as PENDING updates for a person to approve in the studio.
//
//   node automation/case-watch.mjs            all cases
//   node automation/case-watch.mjs --case golden-state-killer
//   node automation/case-watch.mjs --json
//
// How: a DuckDuckGo search per case for recent developments, skip URLs we
// already have, then Gemini Flash reads the title and snippet and answers
// whether it is a real development (court date, ruling, arrest, filing, verdict,
// release, new charge, death, appeal) with a one-line summary and a date. Only
// relevant items are written, as status=pending. Nothing reaches a page or an
// email until it is approved.
// Runs from the content run, the CI sync (every 6 h) and the studio.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "./community/env.mjs";
import { sb } from "./community/lib.js";
import { chat, loadConfig } from "./llm.mjs";

await loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const only = opt("--case", null);
const say = (m) => { if (!asJson) console.log(m); };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CrimeTimeSnacksWatcher/1.0 (www.crimetimesnacks.com)";
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const SKIP = /duckduckgo\.com|wikipedia\.org|youtube\.com|facebook\.com|tiktok\.com|instagram\.com|reddit\.com|amazon\.com|pinterest\.|imdb\.com/;

async function search(q) {
  const c = new AbortController(); setTimeout(() => c.abort(), 20000).unref();
  const html = await (await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&df=m`, { signal: c.signal, headers: { "User-Agent": UA } })).text();
  const items = []; const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m; while ((m = re.exec(html)) && items.length < 12) {
    let url = m[1]; const u = url.match(/uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
    if (SKIP.test(url)) continue;
    items.push({ title: strip(m[2]), url: url.split("#")[0], snippet: strip(m[3]) });
  }
  return items;
}

const cases = await sb(`cts_cases?select=slug,title,years,status${only ? `&slug=eq.${only}` : ""}`);
const cfg = { ...(await loadConfig()), timeoutMs: 120000, jsonMode: true };
const today = new Date().toISOString().slice(0, 10);
let found = 0, considered = 0;
const report = [];
for (const c of cases) {
  let items = [];
  try { items = await search(`"${c.title.replace(/^The /, "")}" (trial OR sentenced OR verdict OR arrested OR charged OR appeal OR hearing OR ruling OR released) ${new Date().getFullYear()}`); } catch (e) { say(`  ${c.slug}: search failed ${e.message}`); continue; }
  if (!items.length) continue;
  const have = new Set((await sb(`cts_case_updates?select=url&case_slug=eq.${c.slug}`)).map((r) => r.url));
  const fresh = items.filter((i) => !have.has(i.url)).slice(0, 6);
  if (!fresh.length) { say(`  ${c.slug}: nothing new`); continue; }
  considered += fresh.length;
  let judged = [];
  try {
    const { text } = await chat(
      `You screen search results for a true crime case-tracking service. For each result decide if it reports a REAL, DATED development in the named case (court date set or held, ruling, verdict, sentence, arrest, new charge, plea, appeal filed or decided, release, death, major official statement, documentary or trial broadcast schedule). Retrospectives, listicles, recaps and unrelated cases are NOT developments. Today is ${today}. Output ONLY a JSON object: {"items": [{"i": number, "relevant": boolean, "happened_on": "YYYY-MM-DD" (best estimate from the text; today if unknown), "title": string (max 90 chars, plain, what happened), "summary": string (one or two sentences, only what the text supports), "source": string (publisher name)}]}`,
      `CASE: ${c.title} (${c.years}, status ${c.status})\n\nRESULTS:\n${fresh.map((f, i) => `[${i}] ${f.title}\n${f.snippet}\n${f.url}`).join("\n\n")}`, cfg);
    judged = JSON.parse(text).items || [];
  } catch (e) { say(`  ${c.slug}: screening failed ${e.message}`); continue; }
  const rows = judged.filter((j) => j && j.relevant && fresh[j.i]).map((j) => ({ case_slug: c.slug, happened_on: /^\d{4}-\d{2}-\d{2}$/.test(j.happened_on || "") ? j.happened_on : today, title: String(j.title || fresh[j.i].title).slice(0, 200), summary: String(j.summary || "").slice(0, 600), url: fresh[j.i].url, source: String(j.source || new URL(fresh[j.i].url).hostname).slice(0, 80), status: "pending", found_by: "watcher" }));
  if (rows.length) { await sb("cts_case_updates?on_conflict=case_slug,url", { method: "POST", body: rows, prefer: "resolution=ignore-duplicates,return=minimal" }); found += rows.length; report.push({ case: c.slug, pending: rows.map((r) => r.title) }); }
  say(`  ${c.slug}: ${fresh.length} new results, ${rows.length} filed as pending`);
}
const msg = `Case watch: ${cases.length} cases, ${considered} new results screened, ${found} pending update(s) filed for review.`;
console.log(asJson ? JSON.stringify({ ok: true, cases: cases.length, considered, found, report, message: msg }) : msg);
