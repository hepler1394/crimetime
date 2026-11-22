#!/usr/bin/env node
// Generates cases.html and /cases/<slug>.html from Supabase (cts_cases, approved
// cts_case_updates, follower counts) using the anon key: public data only.
// One page per case: rows that are the same subject (case-canon.mjs) are built as a single
// page carrying the updates of all of them, and the other slugs' pages are removed here and
// redirected in vercel.json by build-redirects.mjs.
// Falls back to the last good snapshot (automation/cases-live.json) when the
// database is unreachable, so a build never fails because of the network.
// Run: node automation/build-cases.mjs   (part of build-all)

import { readFile, writeFile, mkdir, stat, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts, summaryOf, followForm } from "./shell.mjs";
import { canonicalCases, mergeUpdates, aliasPairs } from "./case-canon.mjs";
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
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; } };
// The pages: one per subject. A subject's updates are those of every row in it, with the
// same article counted once and same-day repeats folded together (mergeUpdates).
const { subjects } = canonicalCases(live.cases, eps);
const updatesFor = (c) => mergeUpdates(live.updates.filter((u) => c.memberSlugs.includes(u.case_slug)));
const followersOf = (c) => c.memberSlugs.reduce((n, slug) => n + (live.counts[slug] || 0), 0);
// Newest first. A case can have more than one episode (three on JonBenet Ramsey).
const episodesOf = (c) => c.episodeSlugs.map((slug) => epBySlug[slug]).filter(Boolean).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
// What the public reads about the case. A row made from an episode carries a copy of that
// episode's show notes as they stood on the day it was synced; the episode's notes as they
// are now are the better source, so an edit to them reaches the case page.
const summaryFor = (c) => summaryOf((!c.angle && epBySlug[c.episode_slug]?.description) || c.summary);

// A case earns its place on the site by having an episode behind it. Listing a
// case we have not covered sends people to a page with nothing on it but a form,
// so the unbacked ones are built noindex, kept out of the sitemap and left off
// the index. Their URLs still resolve - they have been live and may be linked -
// but nothing on the site points at them until the episode exists.
const published = (c) => c.episodeSlugs.length > 0;

// Cut on a word boundary. The old .slice(0,180) chopped mid-word and shipped
// "sentenced to life in prison witho" to the card.
function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.55 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–-]+$/, "")}…`;
}

// The show covers are 3000x3000 and up to 2.5 MB each; five of them on one grid
// is 6 MB before a phone has read a word. Derive a 600px card copy once and
// reuse it until the source changes. No ffmpeg, no thumb: fall back to the
// original rather than losing the art again.
const THUMBS = join(ROOT, "images", "cases");
const mtime = async (p) => (await stat(p).then((s) => s.mtimeMs, () => 0));
async function cardArt(webPath) {
  if (!webPath) return "";
  const src = join(ROOT, webPath.replace(/^\//, ""));
  if (!(await mtime(src))) return "";
  const name = `${webPath.split("/").pop().replace(/\.[^.]+$/, "")}-600.jpg`;
  const out = join(THUMBS, name);
  const have = await mtime(out);
  if (have < (await mtime(src))) {
    const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", src,
      "-vf", "scale=600:600:force_original_aspect_ratio=increase,crop=600:600", "-q:v", "4", out], { windowsHide: true });
    // The CI runner has no ffmpeg, and a fresh checkout gives source and thumb the same
    // mtime give or take a millisecond, so it landed here on every sync and shipped the
    // full-size covers (about 13 MB on cases.html) until 2026-10-06. A committed thumb wins.
    if (r.status !== 0) {
      if (have) return `/images/cases/${name}`;
      console.warn(`cases: no thumb for ${webPath}, using the full-size cover`); return webPath;
    }
  }
  return `/images/cases/${name}`;
}

const css = `
<style>
.case-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.2rem;margin-top:1.4rem}
.case-card{background:var(--cts-panel);border:1px solid var(--cts-line);border-radius:var(--radius);display:flex;flex-direction:column;position:relative;isolation:isolate;overflow:hidden;transition:var(--cts-transition)}
.case-card:hover{border-color:var(--cts-line-strong);transform:translateY(-2px)}
.case-body{display:flex;flex-direction:column;gap:.55rem;flex:1;padding:1.3rem 1.3rem 1.1rem}
/* Cory draws these covers; the grid used to throw them away. They carry their own
   typography, so the art gets its own band rather than sitting under the copy -
   overlaid, the card heading landed on top of the cover's title and the meta line
   ran across the victims' names. The band fades into the panel so there is no seam. */
.case-card .art-wrap{position:relative;overflow:hidden;background:var(--cts-black)}
/* height:auto is load-bearing: the img carries height="600" as a presentational
   hint, and without a CSS height that hint wins and aspect-ratio is ignored. */
.case-card .art{display:block;width:100%;height:auto;aspect-ratio:3/2;object-fit:cover;object-position:center 30%;transition:transform .5s cubic-bezier(.16,.84,.32,1)}
.case-card .art-wrap::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:34%;background:linear-gradient(180deg,transparent 0%,rgba(16,16,19,.55) 55%,var(--cts-panel) 100%);pointer-events:none}
.case-card.has-art:hover .art{transform:scale(1.035)}
.case-card.has-art .case-body{padding-top:.55rem}
/* No cover yet: a file-folder hatch rather than an empty grey box, drawn in CSS so
   nothing has to be sourced or invented for a case we have not covered. */
.case-card.no-art::before{content:"";position:absolute;inset:0;z-index:-1;opacity:.5;background:repeating-linear-gradient(115deg,transparent 0 13px,rgba(255,255,255,.022) 13px 26px)}
@media(prefers-reduced-motion:reduce){.case-card,.case-card .art{transition:none}.case-card:hover{transform:none}.case-card.has-art:hover .art{transform:none}}
.case-card h3{font-family:var(--font-display);font-size:1.7rem;letter-spacing:.02em;margin:0;line-height:1}
.case-card h3 a{color:inherit;text-decoration:none}
.case-card p{color:var(--cts-muted);margin:0;font-size:.95rem;line-height:1.5}
.case-meta{display:flex;gap:.6rem;flex-wrap:wrap;font-family:var(--font-body);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--cts-faint)}
.case-meta .st{color:var(--cts-tape)}
.case-meta .up{color:var(--cts-red-hot)}
.case-foot{display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:.6rem;border-top:1px solid var(--cts-line);font-size:.85rem;color:var(--cts-muted)}
.timeline{list-style:none;margin:1.2rem 0 0;padding:0;border-left:2px solid var(--cts-red);}
.timeline li{padding:0 0 1.2rem 1.2rem;position:relative}
.timeline li::before{content:"";position:absolute;left:-7px;top:.45rem;width:12px;height:12px;border-radius:50%;background:var(--cts-red);box-shadow:0 0 0 4px var(--cts-black)}
.timeline time{display:block;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--cts-tape);margin-bottom:.2rem}
.timeline h3{margin:0 0 .25rem;font-size:1.05rem}
.timeline p{margin:0;color:var(--cts-muted);line-height:1.55}
.timeline a{color:var(--cts-muted)}
.timeline .also{font-size:.85rem;color:var(--cts-faint)}
.timeline .also a{color:var(--cts-faint)}
.case-hero{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(280px,1fr);gap:2rem;align-items:start}
/* One column on a phone, and the follow form first: under the timeline it sat below every
   update the case has, 96 percent of the way down the Murdaugh page. */
@media(max-width:820px){.case-hero{grid-template-columns:1fr}.case-side{order:-1}}
.case-side{background:var(--cts-panel);border:1px solid var(--cts-line);border-radius:var(--radius);padding:1.3rem}
.case-side h3{font-family:var(--font-display);font-size:1.5rem;letter-spacing:.02em;margin:0 0 .6rem}
.case-side .kv{display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;font-size:.9rem;color:var(--cts-muted)}
.case-side .kv b{color:var(--cts-white);font-weight:500}
.empty-note{color:var(--cts-faint);font-style:italic}
.case-photo{margin:0 0 1.6rem}
.case-photo img{display:block;width:100%;height:auto;border-radius:var(--radius);border:1px solid var(--cts-line)}
.case-photo figcaption{margin-top:.5rem;font-size:.8rem;color:var(--cts-faint)}
</style>`;

/* ------------------------------------------------------------- index */
async function indexPage() {
  const shown = subjects.filter(published);
  const cards = (await Promise.all(shown.map(async (c) => {
    const ups = updatesFor(c);
    const n = followersOf(c);
    const art = await cardArt(c.image);
    const epCount = c.episodeSlugs.length;
    return `<article class="case-card ${art ? "has-art" : "no-art"}">
      ${art ? `<div class="art-wrap"><img class="art" src="${esc(art)}" alt="" loading="lazy" decoding="async" width="600" height="600"></div>` : ""}
      <div class="case-body">
        <div class="case-meta"><span class="st">${esc(STATUS[c.status] || c.status)}</span>${c.years ? `<span>${esc(c.years)}</span>` : ""}${ups.length ? `<span class="up">${ups.length} update${ups.length === 1 ? "" : "s"}</span>` : ""}<span>${epCount === 1 ? "Episode" : `${epCount} episodes`}</span></div>
        <h3><a href="/cases/${esc(c.slug)}.html">${esc(c.title)}</a></h3>
        <p>${esc(clip(summaryFor(c), 180))}</p>
        ${c.next_date ? `<p><b style="color:var(--cts-white)">${esc(c.next_label || "Next")}:</b> ${esc(fmtDate(c.next_date))}</p>` : ""}
        <div class="case-foot"><span>${n ? `${n} following` : "Updates by email"}</span><a class="btn btn-sm" href="/cases/${esc(c.slug)}.html">Open</a></div>
      </div>
    </article>`;
  }))).join("\n");
  return `${head({ title: "Cases | CrimeTimeSnacks", description: "Follow the cases CrimeTimeSnacks covers and get an email when something happens: a court date, a verdict, an arrest. Free.", canonicalPath: "/cases.html", extraHead: css })}
<body>
${header("cases")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">${shown.length} case${shown.length === 1 ? "" : "s"} on file</p>
            <h1 class="page-title">Follow the <span class="text-red">Case</span></h1>
            <p>Trials take years. Updates get buried. Follow a case and we email you when something actually happens: a court date set, a verdict, a filing, an arrest. One note a week at most, nothing else, free.</p>
        </div>
    </section>
${tape()}
    <section class="container" style="padding-top:1rem;">
        <h2 class="sr-only">Cases on file</h2>
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
// A photograph of the person the case is about, when Cory has supplied one:
// images/cases/<slug>-photo.jpg, captioned from PHOTOS. Never generated, and no
// file means no figure rather than a placeholder.
const PHOTOS = { "gabby-petito": { alt: "Gabby Petito smiling in front of a painted angel-wings mural, set against the Teton range", caption: "Gabby Petito. Memorial image." } };
function casePhoto(c) {
  const meta = PHOTOS[c.slug];
  if (!meta || !existsSync(join(ROOT, "images", "cases", `${c.slug}-photo.jpg`))) return "";
  return `<figure class="case-photo"><img src="/images/cases/${esc(c.slug)}-photo.jpg" alt="${esc(meta.alt)}" loading="lazy" decoding="async" width="1600" height="910"><figcaption>${esc(meta.caption)}</figcaption></figure>`;
}
// The page text and description are the case's public summary only. The writer's brief
// (angle) is an instruction to the script model and never goes on a public page; it used
// to be the fallback here.
function casePage(c) {
  const ups = updatesFor(c);
  const episodes = episodesOf(c);
  const ep = episodes[0];
  const n = followersOf(c);
  const summary = summaryFor(c);
  const url = `${SITE}/cases/${c.slug}.html`;
  const ld = { "@context": "https://schema.org", "@type": "WebPage", name: `${c.title} | CrimeTimeSnacks`, url, description: summary };
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Cases", item: `${SITE}/cases.html` },
      { "@type": "ListItem", position: 3, name: c.title, item: url },
    ],
  };
  // The share card is the cover Cory drew for the newest episode on the case; a case with no
  // episode falls back to the site's card (shell.mjs).
  return `${head({ title: `${c.title} | Cases | CrimeTimeSnacks`, description: clip(`Follow the case by email; every update links its source. ${summary}`, 158), canonicalPath: `/cases/${c.slug}.html`, ogImage: ep?.image || "", noindex: !published(c), extraHead: css + `\n<script type="application/ld+json">${JSON.stringify(ld)}</script>\n<script type="application/ld+json">${JSON.stringify(crumbs)}</script>` })}
<body>
${header("cases")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">${esc(STATUS[c.status] || c.status)}${c.years ? ` &middot; ${esc(c.years)}` : ""}</p>
            <h1 class="page-title">${esc(c.title)}</h1>
            <p>${esc(summary)}</p>
        </div>
    </section>
${tape()}
    <section class="container case-hero" style="padding-top:1.5rem;">
        <div>
            ${casePhoto(c)}
            <h2 style="font-family:var(--font-display);font-size:2rem;letter-spacing:.02em;margin:0 0 .4rem;">Case <span class="text-red">Updates</span></h2>
            <p style="color:var(--cts-muted);margin:0;">What has happened, newest first, each with the article it comes from. An entry goes up only after that article is read and found to report it.</p>
            ${ups.length ? `<ol class="timeline">
${ups.map((u) => `                <li><time datetime="${esc(u.happened_on)}">${esc(fmtDate(u.happened_on))}</time><h3>${esc(u.title)}</h3>${u.summary ? `<p>${esc(u.summary)}</p>` : ""}${u.url ? `<p><a href="${esc(u.url)}" rel="noopener nofollow" target="_blank">${esc(u.source || host(u.url))}</a>${u.also.length ? ` <span class="also">&middot; also reported by ${u.also.map((a) => `<a href="${esc(a.url)}" rel="noopener nofollow" target="_blank">${esc(a.source || host(a.url))}</a>`).join(", ")}</span>` : ""}</p>` : ""}</li>`).join("\n")}
            </ol>` : `<p class="empty-note" style="margin-top:1.2rem;">Nothing logged yet. Follow the case and you will hear about the first update.</p>`}
        </div>
        <aside class="case-side">
            <h3>Follow this case</h3>
            <p style="color:var(--cts-muted);font-size:.95rem;margin:0 0 .9rem;">${n ? `${n} ${n === 1 ? "person is" : "people are"} following. ` : ""}We email you when something happens. Confirm once, unsubscribe any time.</p>
            ${followForm(c.slug, c.aliases)}
            ${c.next_date ? `<div class="kv" style="margin-top:1.2rem;"><span>${esc(c.next_label || "Next")}</span><b>${esc(fmtDate(c.next_date))}</b></div>` : ""}
            ${ep ? `<hr style="border:0;border-top:1px solid var(--cts-line);margin:1.2rem 0;"><h3>${episodes.length > 1 ? "The episodes" : "The episode"}</h3><p style="margin:0 0 .6rem;"><a href="/episodes/${esc(ep.slug)}.html" style="color:var(--cts-white);">${esc(ep.title)}</a> <span style="color:var(--cts-faint);">${esc((ep.duration || "").replace(/^00:/, ""))}</span></p><audio controls preload="none" style="width:100%"><source src="${esc(ep.audio)}" type="${esc(ep.audioType || "audio/mpeg")}"></audio>${episodes.slice(1).map((e) => `<p style="margin:.7rem 0 0;"><a href="/episodes/${esc(e.slug)}.html" style="color:var(--cts-white);">${esc(e.title)}</a> <span style="color:var(--cts-faint);">${esc((e.duration || "").replace(/^00:/, ""))}</span></p>`).join("")}` : `<hr style="border:0;border-top:1px solid var(--cts-line);margin:1.2rem 0;"><p style="color:var(--cts-faint);font-size:.9rem;margin:0;">No episode on this case yet. Following it is the fastest way to know when one drops.</p>`}
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
await mkdir(THUMBS, { recursive: true });
await writeFile(join(ROOT, "cases.html"), await indexPage(), "utf8");
for (const c of subjects) await writeFile(join(ROOT, "cases", `${c.slug}.html`), casePage(c), "utf8");
// A slug that is now part of another page has no page of its own: vercel.json sends its URL
// to the subject (build-redirects.mjs), and a file left here would still be walked by the
// sitemap, the search index and the link check as if it were a page.
let folded = 0;
for (const [alias] of aliasPairs()) { await rm(join(ROOT, "cases", `${alias}.html`), { force: true }); folded++; }
console.log(`cases.html + ${subjects.length} case pages generated from ${live.cases.length} rows (${folded} slugs folded into another page, ${live.updates.length} approved updates).`);
