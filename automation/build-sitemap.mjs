#!/usr/bin/env node
// Generates sitemap.xml (and robots.txt) from the HTML pages on disk.
// Run: node automation/build-sitemap.mjs

import { readdir, writeFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://crimetime.vercel.app";

// Orphaned duplicate copies that live under /episodes/ (not canonical pages).
const EPISODE_DUPES = new Set([
  "index.html", "about.html", "blog.html", "contact.html",
  "episodes.html", "merch.html", "videos.html", "listen.html",
]);

const htmlIn = async (dir) =>
  (await readdir(dir)).filter((f) => f.endsWith(".html"));

async function collect() {
  const urls = [];
  for (const f of await htmlIn(ROOT)) {
    if (f === "editor.html") continue; // internal tool, not public content
    urls.push("/" + f);
  }
  for (const f of await htmlIn(join(ROOT, "blog-posts"))) {
    urls.push("/blog-posts/" + f);
  }
  for (const f of await htmlIn(join(ROOT, "episodes"))) {
    if (!EPISODE_DUPES.has(f)) urls.push("/episodes/" + f);
  }
  // index.html collapses to "/"
  return [...new Set(urls.map((u) => (u === "/index.html" ? "/" : u)))].sort();
}

const urls = await collect();
const today = new Date().toISOString().slice(0, 10);
const body = urls
  .map(
    (u) =>
      `  <url>\n    <loc>${SITE}${encodeURI(u)}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`
  )
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
