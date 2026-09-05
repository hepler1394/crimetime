#!/usr/bin/env node
// Pulls the real CrimeTimeSnacks podcast feed (Anchor/Spotify) and writes
// episodes.json — the source of truth the rest of the build reads.
// Run: node automation/import-feed.mjs
//
// This keeps the website's episode list in sync with what Cory actually
// publishes: re-run it after releasing an episode, then build + deploy.

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadStudioEpisodes, mergeEpisodes } from "./episodes-merge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEED_URL = "https://anchor.fm/s/7289c700/podcast/rss";

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return "";
  return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
};
const attr = (block, name, a) => {
  const m = block.match(new RegExp(`<${name}\\b[^>]*\\b${a}="([^"]*)"`, "i"));
  return m ? m[1] : "";
};
const stripHtml = (s) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
   .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

// Anchor enclosure URLs wrap the real CDN file: .../play/<id>/<urlencoded-cdn-url>
const directAudio = (u) => {
  const m = u.match(/\/play\/\d+\/(https?%3A.*)$/);
  return m ? decodeURIComponent(m[1]) : u.split("?")[0];
};
const slugify = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents: é -> e
   .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

// Self-hosted mode: once the show's feed is redirected from Spotify to this
// site's feed.xml, the Anchor feed is no longer the source of anything. The
// back catalogue lives in legacy-episodes.json (episode-mirror.mjs), new
// episodes in studio-episodes.json. Flip with automation/feed-mode.json:
// {"selfHosted": true}
let selfHosted = false;
try { selfHosted = !!JSON.parse(await readFile(join(__dirname, "feed-mode.json"), "utf8")).selfHosted; } catch { /* default: pull Anchor */ }
if (selfHosted) {
  const legacy = JSON.parse(await readFile(join(__dirname, "legacy-episodes.json"), "utf8"));
  const studio = await loadStudioEpisodes();
  const merged = mergeEpisodes(legacy.episodes || [], studio);
  const podcast = { ...legacy.podcast, siteUrl: "https://crimetime.vercel.app", feedUrl: "https://crimetime.vercel.app/feed.xml" };
  await writeFile(join(__dirname, "episodes.json"), JSON.stringify({ podcast, episodes: merged }, null, 2) + "\n", "utf8");
  console.log(`Self-hosted feed: ${legacy.episodes.length} legacy + ${merged.length - legacy.episodes.length} studio episodes (Anchor not consulted).`);
  merged.forEach((e, i) => console.log(`  ${i + 1}. [${e.date}] ${e.title} (${e.duration})${e.source === "studio" ? "  [studio]" : ""}`));
  process.exit(0);
}

const res = await fetch(FEED_URL);
const xml = await res.text();
const channel = xml.split("<item>")[0];

const podcast = {
  title: tag(channel, "title") || "CrimeTimeSnacks • A True Crime Podcast",
  subtitle: stripHtml(tag(channel, "itunes:subtitle")) || "Exploring unsolved cases, murders, and mysteries.",
  description: stripHtml(tag(channel, "description")),
  siteUrl: "https://crimetime.vercel.app",
  author: tag(channel, "itunes:author") || "Cory",
  ownerName: tag(channel, "itunes:name") || "Cory",
  ownerEmail: "coryh2014@gmail.com",
  language: tag(channel, "language") || "en-us",
  category: "True Crime",
  image: attr(channel, "itunes:image", "href") || tag(channel, "url"),
  explicit: /<itunes:explicit>\s*(true|yes)/i.test(channel),
  appleId: "1655384400",
  spotifyUrl: "https://open.spotify.com/show/6wbA1mrLHjEegphMPnsAiZ",
};

const items = xml.split("<item>").slice(1).map((s) => s.split("</item>")[0]);
const episodes = items.map((b) => {
  const title = stripHtml(tag(b, "title"));
  const date = tag(b, "pubDate");
  const iso = date ? new Date(date).toISOString().slice(0, 10) : "";
  return {
    guid: tag(b, "guid") || slugify(title),
    title,
    slug: slugify(title),
    date: iso,
    pubDate: date,
    duration: tag(b, "itunes:duration"),
    description: stripHtml(tag(b, "description")) || stripHtml(tag(b, "itunes:summary")),
    audio: directAudio(attr(b, "enclosure", "url")),
    audioType: attr(b, "enclosure", "type") || "audio/mpeg",
    image: attr(b, "itunes:image", "href") || podcast.image,
    link: tag(b, "link"),
    explicit: /<itunes:explicit>\s*(true|yes)/i.test(b),
  };
}).filter((e) => e.title);

// Episodes produced in the studio and published straight to the site are kept
// alongside the feed's (see episodes-merge.mjs) so a feed sync never erases them.
const studio = await loadStudioEpisodes();
const merged = mergeEpisodes(episodes, studio);
const out = { podcast, episodes: merged };
await writeFile(join(__dirname, "episodes.json"), JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`Imported ${episodes.length} episodes from the live feed (+${merged.length - episodes.length} studio):`);
merged.forEach((e, i) => console.log(`  ${i + 1}. [${e.date}] ${e.title} (${e.duration})${e.source === "studio" ? "  [studio]" : ""}`));
