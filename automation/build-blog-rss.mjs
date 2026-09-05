#!/usr/bin/env node
// Generates /blog-feed.xml — an RSS feed of the blog so readers can subscribe.
// Sourced from blog.json. Run: node automation/build-blog-rss.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://www.crimetimesnacks.com";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const data = JSON.parse(await readFile(join(__dirname, "blog.json"), "utf8"));
const posts = [...data.posts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);

const pubDate = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString();

const items = posts
  .map(
    (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${SITE}/blog-posts/${p.slug}.html</link>
      <guid isPermaLink="true">${SITE}/blog-posts/${p.slug}.html</guid>
      <category>${esc(p.categoryLabel || p.category)}</category>
      <pubDate>${pubDate(p.date)}</pubDate>
      <description>${esc(p.excerpt)}</description>
    </item>`
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CrimeTimeSnacks Blog</title>
    <link>${SITE}/blog.html</link>
    <atom:link href="${SITE}/blog-feed.xml" rel="self" type="application/rss+xml"/>
    <description>True crime case updates, analysis, and the stories behind the headlines.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

await writeFile(join(ROOT, "blog-feed.xml"), xml, "utf8");
console.log(`blog-feed.xml written: ${posts.length} posts.`);
