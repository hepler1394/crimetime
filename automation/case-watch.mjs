#!/usr/bin/env node
// Case watcher: looks for new developments in every case people can follow and publishes
// the ones that pass the update gate (automation/community/update-gate.mjs).
//
//   node automation/case-watch.mjs            all cases
//   node automation/case-watch.mjs --case golden-state-killer
//   node automation/case-watch.mjs --pending  run the gate over updates still pending
//   node automation/case-watch.mjs --json
//
// How: a DuckDuckGo search per case for recent developments, skip URLs we already have
// (compared normalised, so a story's /video/ twin is not filed again), fetch each page and
// drop any that never names the case, then Gemini Flash reads the article text and drafts
// the update: whether it is a real development, its date, a title and a summary.
//
// Each draft then goes through the gate, the way an episode goes through episode-verify:
// approved updates go onto the case page at the next build and into the Sunday digest with
// nobody ticking them; held ones stay pending with the reason in gate_note, for Cory in the
// studio's Community panel and in his Telegram; duplicates are rejected. Changed 2026-09-13
// at Cory's instruction. The human queue it replaced never approved a single update.
//
// Reading the page is not optional. Screening on the search snippet alone filed
// "Rex Heuermann sentenced to life without parole" with a HowStuffWorks listicle
// about uncaught serial killers as its source; that page never mentions him.
// Runs from the content run, the CI sync (every 6 h) and the studio.

import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadEnv } from "./community/env.mjs";
import { sb } from "./community/lib.js";
import { gateUpdate, modelCheck, normUrl } from "./community/update-gate.mjs";
import { chat, loadConfig } from "./llm.mjs";
import { notifyCory } from "./notify-cory.mjs";

await loadEnv();
const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
const asJson = args.includes("--json");
const pendingMode = args.includes("--pending");
const only = opt("--case", null);
const say = (m) => { if (!asJson) console.log(m); };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CrimeTimeSnacksWatcher/1.0 (www.crimetimesnacks.com)";
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
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

const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Words a page must contain to be about this case at all, from the slug and the title
// (the slug carries the names: btk-dennis-rader, where the title is "BTK: The Floppy Disk").
// Generic words are dropped so "serial" or "long" cannot carry a page on their own; when
// nothing distinctive is left, the whole title is the term.
const GENERIC = new Set("the and case file murders murder killer killing killings trial family disappearance appeal years escapes escape interrogation confession notebook plea parole serial long island golden state beach hotel bridge murdered death deaths".split(" "));
function keyTerms(c) {
  const words = [...new Set(fold(`${c.slug.replace(/-/g, " ")} ${c.title}`).split(/[^a-z]+/))].filter((w) => w.length > 3 && !GENERIC.has(w));
  return words.length ? words : [fold(c.title.replace(/^the /i, ""))];
}

async function pageText(url) {
  const c = new AbortController(); setTimeout(() => c.abort(), 15000).unref();
  const r = await fetch(url, { signal: c.signal, headers: { "User-Agent": UA }, redirect: "follow" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return strip((await r.text()).replace(/<(script|style|noscript|nav|footer|header|aside)\b[\s\S]*?<\/\1>/gi, " "));
}
// The stretch of the article around its first mention of the case, so the screener reads
// the story rather than the site's navigation.
function around(text, terms, n = 3500) {
  const low = fold(text);
  const hits = terms.map((t) => low.indexOf(t)).filter((i) => i > -1);
  const start = Math.max(0, (hits.length ? Math.min(...hits) : 0) - 500);
  return text.slice(start, start + n);
}

const cfg = { ...(await loadConfig()), timeoutMs: 120000, jsonMode: true };
const check = modelCheck(chat, cfg);
const today = new Date().toISOString().slice(0, 10);
const tally = { approved: 0, held: 0, rejected: 0 };
const outcomes = []; // { case, title, status, note }
const approvedOn = async (slug) => (await sb(`cts_case_updates?select=id,title,happened_on,url&case_slug=eq.${slug}&status=eq.approved`)) || [];

// Run one draft through the gate and turn the verdict into the row's status fields.
async function gate(update, articleText, existing, caseTitle) {
  const g = await gateUpdate({ update, articleText, existing, today, check });
  const status = g.decision === "approve" ? "approved" : g.decision === "reject" ? "rejected" : "pending";
  tally[g.decision === "approve" ? "approved" : g.decision === "reject" ? "rejected" : "held"]++;
  outcomes.push({ case: caseTitle, title: update.title, status, note: g.note });
  return { status, approved_at: status === "approved" ? new Date().toISOString() : null, gate_note: String(g.note).slice(0, 600) };
}

let found = 0, considered = 0, cases = [];
const report = [];

if (pendingMode) {
  // Updates filed before the gate existed, or held by an earlier run: read the article again
  // and let the gate decide. A held update stays held until something changes.
  const titles = Object.fromEntries((await sb("cts_cases?select=slug,title")).map((c) => [c.slug, c.title]));
  const rows = await sb(`cts_case_updates?select=id,case_slug,happened_on,title,summary,url&status=eq.pending${only ? `&case_slug=eq.${only}` : ""}&order=created_at.asc`);
  cases = [...new Set(rows.map((r) => r.case_slug))];
  for (const r of rows) {
    let text = "";
    if (r.url) { try { text = await pageText(r.url); } catch (e) { say(`  #${r.id}: could not read ${r.url} (${e.message})`); } }
    const existing = (await approvedOn(r.case_slug)).filter((e) => e.id !== r.id);
    const fields = await gate(r, text, existing, titles[r.case_slug] || r.case_slug);
    await sb(`cts_case_updates?id=eq.${r.id}`, { method: "PATCH", body: fields, prefer: "return=minimal" });
    considered++;
    say(`  #${r.id} ${r.case_slug}: ${fields.status} - ${fields.gate_note}`);
  }
} else {
  cases = await sb(`cts_cases?select=slug,title,years,status${only ? `&slug=eq.${only}` : ""}`);
  for (const c of cases) {
    let items = [];
    try { items = await search(`"${c.title.replace(/^The /, "")}" (trial OR sentenced OR verdict OR arrested OR charged OR appeal OR hearing OR ruling OR released) ${new Date().getFullYear()}`); } catch (e) { say(`  ${c.slug}: search failed ${e.message}`); continue; }
    if (!items.length) continue;
    const have = new Set((await sb(`cts_case_updates?select=url&case_slug=eq.${c.slug}`)).map((r) => normUrl(r.url)));
    const seen = new Set();
    const unseen = items.filter((i) => { const k = normUrl(i.url); if (have.has(k) || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
    if (!unseen.length) { say(`  ${c.slug}: nothing new`); continue; }
    considered += unseen.length;
    // Read each page. A page that loads but never names the case is dropped; one that will
    // not load (paywall, bot wall) is screened on its snippet, only if the snippet names the
    // case, and the gate then holds it because there is no article to check it against.
    const terms = keyTerms(c);
    const names = (s) => { const f = fold(s); return terms.some((t) => f.includes(t)); };
    const fresh = [];
    for (const item of unseen) {
      let text = "";
      try { text = await pageText(item.url); } catch { /* screened on the snippet below */ }
      if (text.length > 400) {
        if (!names(text)) { say(`  ${c.slug}: dropped ${item.url} (page does not name the case)`); continue; }
        fresh.push({ ...item, text: around(text, terms), full: text });
      } else if (names(`${item.title} ${item.snippet}`)) {
        fresh.push({ ...item, text: item.snippet, full: "" });
      }
    }
    if (!fresh.length) { say(`  ${c.slug}: ${unseen.length} new results, none name the case`); continue; }
    let judged = [];
    try {
      const { text } = await chat(
        `You screen news pages for a true crime case-tracking service. For each result decide if its TEXT reports a REAL, DATED development in the named case (court date set or held, ruling, verdict, sentence, arrest, new charge, plea, appeal filed or decided, release, death, major official statement, documentary or trial broadcast schedule). Retrospectives, listicles, recaps and unrelated cases are NOT developments. If the TEXT does not itself report the development, it is not relevant, whatever the headline says or whatever you know about the case. Today is ${today}. Output ONLY a JSON object: {"items": [{"i": number, "relevant": boolean, "happened_on": "YYYY-MM-DD" (the date of the development as the text gives it; today if the text gives none), "title": string (max 90 chars, plain sentence case, what happened), "summary": string (one or two sentences, only what the TEXT states), "source": string (publisher name)}]}`,
        `CASE: ${c.title} (${c.years}, status ${c.status})\n\nRESULTS:\n${fresh.map((f, i) => `[${i}] ${f.title}\n${f.url}\nTEXT: ${f.text}`).join("\n\n")}`, cfg);
      judged = JSON.parse(text).items || [];
    } catch (e) { say(`  ${c.slug}: screening failed ${e.message}`); continue; }
    const existing = await approvedOn(c.slug);
    const rows = [];
    for (const j of judged.filter((j) => j && j.relevant && fresh[j.i])) {
      const f = fresh[j.i];
      const draft = { case_slug: c.slug, happened_on: /^\d{4}-\d{2}-\d{2}$/.test(j.happened_on || "") ? j.happened_on : today, title: String(j.title || f.title).slice(0, 200), summary: String(j.summary || "").slice(0, 600), url: f.url, source: String(j.source || new URL(f.url).hostname).slice(0, 80), found_by: "watcher" };
      const fields = await gate(draft, f.full, existing, c.title);
      rows.push({ ...draft, ...fields });
      // Two results in one run can be the same story; the second is a duplicate of the first.
      if (fields.status === "approved") existing.push({ id: "this run", title: draft.title, happened_on: draft.happened_on, url: draft.url });
    }
    // No on_conflict target: the unique index on (case_slug, url) is partial (where url <> ''),
    // and Postgres will not infer a partial index, so naming it made every insert fail with
    // 42P10 and killed the whole run. Duplicates are already filtered by `have` above.
    if (rows.length) {
      try { await sb("cts_case_updates", { method: "POST", body: rows, prefer: "return=minimal" }); found += rows.length; report.push({ case: c.slug, filed: rows.map((r) => ({ title: r.title, status: r.status, note: r.gate_note })) }); }
      catch (e) { say(`  ${c.slug}: could not file ${rows.length} update(s): ${e.message}`); }
    }
    say(`  ${c.slug}: ${fresh.length} readable results, ${rows.length} developments (${rows.filter((r) => r.status === "approved").length} approved, ${rows.filter((r) => r.status === "pending").length} held)`);
  }
}

// Cory hears about anything that went up on its own and anything the gate held.
const published = outcomes.filter((o) => o.status === "approved");
const held = outcomes.filter((o) => o.status === "pending");
if (published.length || held.length) {
  const lines = [
    `CrimeTimeSnacks case watch: ${published.length} update${published.length === 1 ? "" : "s"} published, ${held.length} held.`,
    ...published.slice(0, 6).map((o) => `Published - ${o.case}: ${o.title}`),
    ...held.slice(0, 6).map((o) => `Held - ${o.case}: ${o.title} (${o.note})`),
    held.length ? "Held updates wait in the studio's Community panel. Published ones can be rejected there too." : "",
  ].filter(Boolean);
  await notifyCory(lines.join("\n"), say);
}

const msg = pendingMode
  ? `Case gate: ${considered} pending update(s) re-checked: ${tally.approved} approved, ${tally.held} held, ${tally.rejected} rejected.`
  : `Case watch: ${cases.length} cases, ${considered} new results, ${found} development(s) filed: ${tally.approved} approved, ${tally.held} held, ${tally.rejected} rejected as duplicates.`;
console.log(asJson ? JSON.stringify({ ok: true, cases: cases.length, considered, found, ...tally, report, outcomes, message: msg }) : msg);
