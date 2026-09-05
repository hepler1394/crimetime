#!/usr/bin/env node
// Generates a valid Apple/Spotify-spec podcast RSS feed from episodes.json.
// Run:  node automation/build-feed.mjs
// Output: feed.xml at the site root (served at https://crimetime.vercel.app/feed.xml).
//
// This is the foundation for automated publishing: add an episode to
// episodes.json (eventually via the AI pipeline), re-run this, deploy, and the
// new <item> appears in the feed that Apple/Spotify poll. No look changes.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const abs = (site, path) =>
  /^https?:\/\//.test(path) ? path : `${site.replace(/\/$/, "")}${path}`;

function item(p, ep) {
  const link = ep.link || abs(p.siteUrl, `/episodes/${ep.slug}.html`);
  const audio = abs(p.siteUrl, ep.audio);
  const img = abs(p.siteUrl, ep.image);
  const pub = ep.pubDate || new Date(`${ep.date}T12:00:00Z`).toUTCString();
  const dur = ep.duration ? `\n      <itunes:duration>${esc(ep.duration)}</itunes:duration>` : "";
  return `    <item>
      <title>${esc(ep.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(ep.guid)}</guid>
      <pubDate>${pub}</pubDate>
      <description>${esc(ep.description)}</description>
      <itunes:summary>${esc(ep.description)}</itunes:summary>
      <itunes:author>${esc(p.author)}</itunes:author>${dur}
      <enclosure url="${esc(audio)}" length="${ep.audioBytes ?? 0}" type="${esc(ep.audioType ?? ep.audioMime ?? "audio/mpeg")}" />
      <itunes:image href="${esc(img)}" />
      <itunes:explicit>${ep.explicit ? "true" : "false"}</itunes:explicit>
    </item>`;
}

function buildFeed({ podcast: p, episodes }) {
  const sorted = [...episodes].sort((a, b) => b.date.localeCompare(a.date));
  const items = sorted.map((ep) => item(p, ep)).join("\n");
  const home = abs(p.siteUrl, "/");
  const self = p.feedUrl || abs(p.siteUrl, "/feed.xml");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(p.title)}</title>
    <link>${esc(home)}</link>
    <atom:link href="${esc(self)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <language>${esc(p.language)}</language>
    <copyright>&#169; ${new Date().getFullYear()} ${esc(p.author)}</copyright>
    <description>${esc(p.description)}</description>
    <itunes:subtitle>${esc(p.subtitle)}</itunes:subtitle>
    <itunes:author>${esc(p.author)}</itunes:author>
    <itunes:summary>${esc(p.description)}</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner>
      <itunes:name>${esc(p.ownerName)}</itunes:name>
      <itunes:email>${esc(p.ownerEmail)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${esc(abs(p.siteUrl, p.image))}" />
    <itunes:category text="${esc(p.category)}" />
    <itunes:explicit>${p.explicit ? "true" : "false"}</itunes:explicit>
${items}
  </channel>
</rss>
`;
}

const data = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
const xml = buildFeed(data);
await writeFile(join(ROOT, "feed.xml"), xml, "utf8");
console.log(`feed.xml written: ${data.episodes.length} episodes.`);
