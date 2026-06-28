#!/usr/bin/env node
// Generates sitemap.xml (and robots.txt) from the HTML pages on disk.
// Run: node automation/build-sitemap.mjs

import { readdir, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://crimetime.vercel.app";

// Canonical site pages live at the root. The episode DETAIL pages are canonical
// under /episodes/. Everything else under /episodes/ (and the root copies of the
// case pages) are orphaned duplicates with broken paths — keep them out of the
// sitemap so search engines don't index broken pages.
const CANONICAL_ROOT = new Set([
  "index.html", "about.html", "blog.html", "contact.html",
  "episodes.html", "merch.html", "videos.html", "listen.html",
]);

const htmlIn = async (dir) =>
  (await readdir(dir)).filter((f) => f.endsWith(".html"));

// Internal tools and superseded/duplicate files to keep out of the sitemap.
const EXCLUDE = new Set([
  "editor.html",
  "courtney clenney.html", // space-named duplicate of courtney-clenney.html
  "wilmington-dmv-blog.html", // superseded by wilmington-dmv-what-we-know.html
]);

async function collect() {
  const urls = [];
  for (const f of await htmlIn(ROOT)) {
    if (CANONICAL_ROOT.has(f) && !EXCLUDE.has(f)) urls.push("/" + f);
  }
  for (const f of await htmlIn(join(ROOT, "blog-posts"))) {
    if (!EXCLUDE.has(f)) urls.push("/blog-posts/" + f);
  }
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
  if (["/blog.html", "/episodes.html", "/videos.html"].includes(u)) return { p: "0.8", c: "weekly" };
  if (u.startsWith("/blog-posts/") || u.startsWith("/episodes/")) return { p: "0.7", c: "monthly" };
  return { p: "0.6", c: "monthly" };
}

const body = urls
  .map((u) => {
    const { p, c } = hints(u);
    return `  <url>\n    <loc>${SITE}${encodeURI(u)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${c}</changefreq>\n    <priority>${p}</priority>\n  </url>`;
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
