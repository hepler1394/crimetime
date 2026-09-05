#!/usr/bin/env node
// Generates cases.html and /cases/<slug>.html from Supabase (cts_cases, approved
// cts_case_updates, follower counts) using the anon key: public data only.
// Falls back to the last good snapshot (automation/cases-live.json) when the
// database is unreachable, so a build never fails because of the network.
// Run: node automation/build-cases.mjs   (part of build-all)

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts } from "./shell.mjs";
import { loadEnv } from "./community/env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
await loadEnv();

const SNAP = join(__dirname, "cases-live.json");
async function fetchLive() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("no anon credentials");
  const get = async (path) => { const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); if (!r.ok) throw new Error(`${r.status} ${path}`); return r.json(); };
  const [cases, updates, counts] = await Promise.all([
    get("cts_cases?select=*&order=featured.desc,updated_at.desc"),
    get("cts_case_updates?select=case_slug,happened_on,title,summary,url,source&status=eq.approved&order=happened_on.desc&limit=2000"),
    get("cts_case_follow_counts?select=*"),
  ]);
  return { fetched: new Date().toISOString(), cases, updates, counts: Object.fromEntries(counts.map((c) => [c.slug, c.followers])) };
}
let live;
try { live = await fetchLive(); await writeFile(SNAP, JSON.stringify(live, null, 2) + "\n", "utf8"); }
catch (e) { try { live = JSON.parse(await readFile(SNAP, "utf8")); console.warn(`cases: using snapshot (${e.message})`); } catch { console.warn(`cases: no data and no snapshot (${e.message}); skipping`); process.exit(0); } }

const eps = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8")).episodes || [];
const epBySlug = Object.fromEntries(eps.map((e) => [e.slug, e]));
const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");
const STATUS = { open: "Open", trial: "At trial", convicted: "Convicted", cold: "Cold case", closed: "Closed" };
const updatesFor = (slug) => live.updates.filter((u) => u.case_slug === slug);

const css = `
<style>
.case-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.2rem;margin-top:1.4rem}
.case-card{background:var(--cts-panel);border:1px solid var(--cts-line);border-radius:var(--radius);padding:1.3rem 1.3rem 1.1rem;display:flex;flex-direction:column;gap:.55rem;position:relative;transition:var(--cts-transition)}
.case-card:hover{border-color:var(--cts-line-strong);transform:translateY(-2px)}
.case-card h3{font-family:var(--font-display);font-size:1.7rem;letter-spacing:.02em;margin:0;line-height:1}
.case-card h3 a{color:inherit;text-decoration:none}
.case-card p{color:var(--cts-muted);margin:0;font-size:.95rem;line-height:1.5}
.case-meta{display:flex;gap:.6rem;flex-wrap:wrap;font-family:var(--font-body);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--cts-faint)}
.case-meta .st{color:var(--cts-tape)}
.case-meta .up{color:var(--cts-red-hot)}
.case-foot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:.6rem;border-top:1px solid var(--cts-line);font-size:.85rem;color:var(--cts-muted)}
.follow{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}
.follow input[type=email]{background:var(--cts-black);border:1px solid var(--cts-line-strong);border-radius:var(--radius-sm);padding:.7rem .9rem;color:var(--cts-white);min-width:230px;flex:1}
.follow .btn{white-space:nowrap}
.follow-state{font-size:.9rem;color:var(--cts-muted);min-height:1.4em}
.follow-state.ok{color:#9fe3b8}
.follow-state.err{color:var(--cts-red-hot)}
.btn.following{background:#123d24;border-color:#1d6b3f;color:#9fe3b8}
.timeline{list-style:none;margin:1.2rem 0 0;padding:0;border-left:2px solid var(--cts-red);}
.timeline li{padding:0 0 1.2rem 1.2rem;position:relative}
.timeline li::before{content:"";position:absolute;left:-7px;top:.45rem;width:12px;height:12px;border-radius:50%;background:var(--cts-red);box-shadow:0 0 0 4px var(--cts-black)}
.timeline time{display:block;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--cts-tape);margin-bottom:.2rem}
.timeline h4{margin:0 0 .25rem;font-size:1.05rem}
.timeline p{margin:0;color:var(--cts-muted);line-height:1.55}
.timeline a{color:var(--cts-muted)}
.case-hero{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,1fr);gap:2rem;align-items:start}
@media(max-width:820px){.case-hero{grid-template-columns:1fr}}
.case-side{background:var(--cts-panel);border:1px solid var(--cts-line);border-radius:var(--radius);padding:1.3rem}
.case-side h3{font-family:var(--font-display);font-size:1.5rem;letter-spacing:.02em;margin:0 0 .6rem}
.case-side .kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;font-size:.9rem;color:var(--cts-muted)}
.case-side .kv b{color:var(--cts-white);font-weight:500}
.empty-note{color:var(--cts-faint);font-style:italic}
</style>`;

/* ------------------------------------------------------------- index */
function followBlock(slug, compact = false) {
  return `<form class="follow" data-case="${esc(slug)}" novalidate>
    <input type="email" name="email" placeholder="you@email.com" aria-label="Your email" autocomplete="email" required>
    <button class="btn btn-primary${compact ? " btn-sm" : ""}" type="submit">Follow this case</button>
    <div class="follow-state" role="status"></div>
  </form>`;
}
function indexPage() {
  const cards = live.cases.map((c) => {
    const ups = updatesFor(c.slug);
    const n = live.counts[c.slug] || 0;
    return `<article class="case-card">
      <div class="case-meta"><span class="st">${esc(STATUS[c.status] || c.status)}</span>${c.years ? `<span>${esc(c.years)}</span>` : ""}${ups.length ? `<span class="up">${ups.length} update${ups.length === 1 ? "" : "s"}</span>` : ""}${c.episode_slug ? `<span>Episode</span>` : ""}</div>
      <h3><a href="/cases/${esc(c.slug)}.html">${esc(c.title)}</a></h3>
      <p>${esc((c.summary || c.angle || "").slice(0, 180))}</p>
      ${c.next_date ? `<p><b style="color:var(--cts-white)">${esc(c.next_label || "Next")}:</b> ${esc(fmtDate(c.next_date))}</p>` : ""}
      <div class="case-foot"><span>${n ? `${n} following` : "Be the first to follow"}</span><a class="btn btn-sm" href="/cases/${esc(c.slug)}.html">Open</a></div>
    </article>`;
  }).join("\n");
  return `${head({ title: "Cases | CrimeTimeSnacks", description: "Follow the cases CrimeTimeSnacks covers and get an email when something happens: a court date, a verdict, an arrest. Free.", canonicalPath: "/cases.html", extraHead: css })}
<body>
${header("cases")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">${live.cases.length} cases on file</p>
            <h1 class="page-title">Follow the <span class="text-red">Case</span></h1>
            <p>Trials take years. Updates get buried. Follow a case and we email you when something actually happens: a court date set, a verdict, a filing, an arrest. One note a week at most, nothing else, free.</p>
        </div>
    </section>
${tape()}
    <section class="container" style="padding-top:1rem;">
        <div class="case-grid">
${cards}
        </div>
    </section>
    </main>
${footer({})}
${scripts(["/js/community.js"])}
</body>
</html>
`;
}

/* -------------------------------------------------------------- pages */
function casePage(c) {
  const ups = updatesFor(c.slug);
  const ep = epBySlug[c.episode_slug];
  const n = live.counts[c.slug] || 0;
  const ld = { "@context": "https://schema.org", "@type": "WebPage", name: `${c.title} | CrimeTimeSnacks`, url: `${SITE}/cases/${c.slug}.html`, description: c.summary || c.angle };
  return `${head({ title: `${c.title} | Cases | CrimeTimeSnacks`, description: (c.summary || c.angle || `Follow ${c.title} on CrimeTimeSnacks.`).slice(0, 160), canonicalPath: `/cases/${c.slug}.html`, extraHead: css + `\n<script type="application/ld+json">${JSON.stringify(ld)}</script>` })}
<body>
${header("cases")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">${esc(STATUS[c.status] || c.status)}${c.years ? ` &middot; ${esc(c.years)}` : ""}</p>
            <h1 class="page-title">${esc(c.title)}</h1>
            <p>${esc(c.summary || c.angle || "")}</p>
        </div>
    </section>
${tape()}
    <section class="container case-hero" style="padding-top:1.5rem;">
        <div>
            <h2 style="font-family:var(--font-display);font-size:2rem;letter-spacing:.02em;margin:0 0 .4rem;">Case <span class="text-red">Updates</span></h2>
            <p style="color:var(--cts-muted);margin:0;">What has happened, newest first. Every entry is checked by a person before it appears here or in an email.</p>
            ${ups.length ? `<ol class="timeline">
${ups.map((u) => `                <li><time datetime="${esc(u.happened_on)}">${esc(fmtDate(u.happened_on))}</time><h4>${esc(u.title)}</h4>${u.summary ? `<p>${esc(u.summary)}</p>` : ""}${u.url ? `<p><a href="${esc(u.url)}" rel="noopener nofollow" target="_blank">${esc(u.source || new URL(u.url).hostname)}</a></p>` : ""}</li>`).join("\n")}
            </ol>` : `<p class="empty-note" style="margin-top:1.2rem;">Nothing logged yet. Follow the case and you will hear about the first update.</p>`}
        </div>
        <aside class="case-side">
            <h3>Follow this case</h3>
            <p style="color:var(--cts-muted);font-size:.95rem;margin:0 0 .9rem;">${n ? `${n} ${n === 1 ? "person is" : "people are"} following.` : "Be the first to follow."} We email you when something happens. Confirm once, unsubscribe any time.</p>
            ${followBlock(c.slug)}
            ${c.next_date ? `<div class="kv" style="margin-top:1.2rem;"><span>${esc(c.next_label || "Next")}</span><b>${esc(fmtDate(c.next_date))}</b></div>` : ""}
            ${ep ? `<hr style="border:0;border-top:1px solid var(--cts-line);margin:1.2rem 0;"><h3>The episode</h3><p style="margin:0 0 .6rem;"><a href="/episodes/${esc(ep.slug)}.html" style="color:var(--cts-white);">${esc(ep.title)}</a> <span style="color:var(--cts-faint);">${esc((ep.duration || "").replace(/^00:/, ""))}</span></p><audio controls preload="none" style="width:100%"><source src="${esc(ep.audio)}" type="${esc(ep.audioType || "audio/mpeg")}"></audio>` : `<hr style="border:0;border-top:1px solid var(--cts-line);margin:1.2rem 0;"><p style="color:var(--cts-faint);font-size:.9rem;margin:0;">No episode on this case yet. Following it is the fastest way to know when one drops.</p>`}
        </aside>
    </section>
    </main>
${footer({})}
${scripts(["/js/community.js"])}
</body>
</html>
`;
}

await mkdir(join(ROOT, "cases"), { recursive: true });
await writeFile(join(ROOT, "cases.html"), indexPage(), "utf8");
for (const c of live.cases) await writeFile(join(ROOT, "cases", `${c.slug}.html`), casePage(c), "utf8");
console.log(`cases.html + ${live.cases.length} case pages generated (${live.updates.length} approved updates).`);
