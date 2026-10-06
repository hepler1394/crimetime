#!/usr/bin/env node
// Generates sitemap.xml (and robots.txt) from the HTML pages on disk.
// Run: node automation/build-sitemap.mjs

import { readdir, writeFile, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://www.crimetimesnacks.com";

// Map content URLs to their real publish date for accurate <lastmod>.
const dateBySlug = {};
async function loadDates(file, prefix) {
  try {
    const data = JSON.parse(await readFile(join(__dirname, file), "utf8"));
    for (const item of data.posts || data.episodes || []) {
      if (item.slug && item.date) dateBySlug[`${prefix}${item.slug}.html`] = item.date;
    }
  } catch { /* optional */ }
}
await loadDates("blog.json", "/blog-posts/");
await loadDates("episodes.json", "/episodes/");

// Until 2026-10-06 every page without a dated item got today's date, so all forty-odd of
// them claimed a change on every six-hourly CI build. Google stops trusting a sitemap's
// lastmod when it is always "now". Index pages take the date of their newest item; a page
// with nothing to date it by gets no lastmod rather than a made-up one.
const json = async (f) => { try { return JSON.parse(await readFile(join(__dirname, f), "utf8")); } catch { return {}; } };
const newest = (dates) => dates.filter(Boolean).map((d) => String(d).slice(0, 10)).sort().pop();
{
  const eps = (await json("episodes.json")).episodes || [];
  const posts = (await json("blog.json")).posts || [];
  const live = await json("cases-live.json");
  const epDate = Object.fromEntries(eps.map((e) => [e.slug, e.date]));
  const caseDates = [];
  for (const c of live.cases || []) {
    const d = newest([epDate[c.episode_slug], ...(live.updates || []).filter((u) => u.case_slug === c.slug).map((u) => u.happened_on)]);
    if (d) { dateBySlug[`/cases/${c.slug}.html`] = d; if (epDate[c.episode_slug]) caseDates.push(d); }
  }
  const latestEp = newest(eps.map((e) => e.date));
  Object.assign(dateBySlug, {
    "/": newest([latestEp, newest(posts.map((p) => p.date))]),
    "/episodes.html": latestEp,
    "/blog.html": newest(posts.map((p) => p.date)),
    "/cases.html": newest(caseDates),
    "/corrections.html": newest(((await json("corrections.json")).corrections || []).map((c) => c.date)),
    "/videos.html": newest(((await json("videos.json")).videos || []).map((v) => v.published)),
    "/quiz.html": newest(((await json("quizzes.json")).quizzes || []).map((q) => q.created)),
  });
  for (const k of Object.keys(dateBySlug)) if (!dateBySlug[k]) delete dateBySlug[k];
}

// Canonical site pages live at the root. The episode DETAIL pages are canonical
// under /episodes/. Everything else under /episodes/ (and the root copies of the
// case pages) are orphaned duplicates with broken paths — keep them out of the
// sitemap so search engines don't index broken pages.
const CANONICAL_ROOT = new Set([
  "index.html", "about.html", "blog.html", "contact.html",
  "episodes.html", "merch.html", "videos.html", "listen.html",
  "live.html", "quiz.html", "glossary.html", "cases.html",
  // Required by Google before an OAuth app can be published, and required of any site
  // that collects an email address in the first place.
  "privacy.html", "terms.html", "corrections.html",
]);

const htmlIn = async (dir) =>
  (await readdir(dir)).filter((f) => f.endsWith(".html"));

// Internal tools and superseded/duplicate files to keep out of the sitemap.
const EXCLUDE = new Set([
  "editor.html",
  "courtney clenney.html", // space-named duplicate of courtney-clenney.html
  "wilmington-dmv-blog.html", // superseded by wilmington-dmv-what-we-know.html
]);

// A page that tells robots not to index it has no business in the sitemap; the
// two together are a contradiction search engines report as an error.
async function isNoindex(file) {
  try { return /<meta\s+name="robots"\s+content="noindex/i.test(await readFile(file, "utf8")); }
  catch { return false; }
}

async function collect() {
  const urls = [];
  for (const f of await htmlIn(ROOT)) {
    if (CANONICAL_ROOT.has(f) && !EXCLUDE.has(f)) urls.push("/" + f);
  }
  for (const f of await htmlIn(join(ROOT, "blog-posts"))) {
    if (!EXCLUDE.has(f)) urls.push("/blog-posts/" + f);
  }
  // Case pages people can follow. A case with no episode yet is built noindex and
  // stays out of here - the URL keeps working for anyone who already has it, but
  // it is not something we are publishing.
  try {
    for (const f of await htmlIn(join(ROOT, "cases"))) {
      if (await isNoindex(join(ROOT, "cases", f))) continue;
      urls.push("/cases/" + f);
    }
  } catch { /* none yet */ }
  // Only episode detail pages under /episodes/, not the duplicate site pages.
  for (const f of await htmlIn(join(ROOT, "episodes"))) {
    if (!CANONICAL_ROOT.has(f) && !EXCLUDE.has(f)) urls.push("/episodes/" + f);
  }
  // index.html collapses to "/"
  return [...new Set(urls.map((u) => (u === "/index.html" ? "/" : u)))].sort();
}

const urls = await collect();
const today = new Date().toISOString().slice(0, 10);

// Priority + change frequency hints by page type.
function hints(u) {
  if (u === "/") return { p: "1.0", c: "weekly" };
  if (u === "/live.html") return { p: "0.8", c: "daily" };
  if (["/blog.html", "/episodes.html", "/videos.html", "/quiz.html"].includes(u)) return { p: "0.8", c: "weekly" };
  if (u === "/glossary.html") return { p: "0.7", c: "monthly" };
  if (u.startsWith("/blog-posts/") || u.startsWith("/episodes/")) return { p: "0.7", c: "monthly" };
  return { p: "0.6", c: "monthly" };
}

const body = urls
  .map((u) => {
    const { p, c } = hints(u);
    const lastmod = dateBySlug[u] && dateBySlug[u] <= today ? `\n    <lastmod>${dateBySlug[u]}</lastmod>` : "";
    return `  <url>\n    <loc>${SITE}${encodeURI(u)}</loc>${lastmod}\n    <changefreq>${c}</changefreq>\n    <priority>${p}</priority>\n  </url>`;
  })
  .join("\n");

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
await writeFile(join(ROOT, "sitemap.xml"), sitemap, "utf8");

const robots = `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
await writeFile(join(ROOT, "robots.txt"), robots, "utf8");

console.log(`sitemap.xml written: ${urls.length} URLs. robots.txt written.`);
