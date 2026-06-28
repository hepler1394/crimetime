#!/usr/bin/env node
// Pulls your latest YouTube uploads into videos.json — NO API KEY NEEDED.
// It reads the public channel RSS feed (videos.xml). Set your channel ONCE in
// automation/config.json:
//
//   "youtube": {
//     "handle": "@YourChannel",        // OR "channelId": "UC..."
//     "shortsPlaylistId": "",          // optional: a playlist of your Shorts
//     "maxVideos": 24                  // how many to keep on the page
//   }
//
// Run:  node automation/import-youtube.mjs
//
// - Entries marked "curated": true in videos.json are NEVER touched.
// - Shorts are detected from the optional shortsPlaylistId, or from a "#shorts"
//   tag in the title/description.
// - This is the seam Opus.pro / n8n fill: they upload Shorts to YouTube, and the
//   next run of this script publishes them to the site automatically.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEOS = join(__dirname, "videos.json");

const timeout = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

async function loadYtConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(await readFile(join(__dirname, "config.json"), "utf8")).youtube || {};
  } catch { /* no config.json */ }
  const e = process.env;
  return {
    handle: e.YT_HANDLE || cfg.handle || "",
    channelId: e.YT_CHANNEL_ID || cfg.channelId || "",
    shortsPlaylistId: e.YT_SHORTS_PLAYLIST || cfg.shortsPlaylistId || "",
    maxVideos: Number(e.YT_MAX || cfg.maxVideos || 24),
  };
}

async function resolveChannelId({ channelId, handle }) {
  if (channelId) return channelId;
  if (!handle) return "";
  const h = handle.startsWith("@") ? handle : "@" + handle;
  const res = await fetch(`https://www.youtube.com/${h}`, { signal: timeout(15000) });
  const html = await res.text();
  const m = html.match(/"externalId":"(UC[^"]+)"/) ||
            html.match(/channel\/(UC[0-9A-Za-z_-]{20,})/);
  return m ? m[1] : "";
}

// Minimal Atom parser for the YouTube feed (no XML dependency).
function parseFeed(xml) {
  const out = [];
  const entries = xml.split("<entry>").slice(1);
  for (const raw of entries) {
    const e = raw.split("</entry>")[0];
    const pick = (re) => (e.match(re) || [])[1] || "";
    const id = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    if (!id) continue;
    const decode = (s) =>
      s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
       .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
    out.push({
      id,
      title: decode(pick(/<title>([^<]*)<\/title>/)).trim(),
      published: (pick(/<published>([^<]+)<\/published>/) || "").slice(0, 10),
      description: decode(pick(/<media:description>([\s\S]*?)<\/media:description>/)).trim(),
      thumb: pick(/<media:thumbnail url="([^"]+)"/) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    });
  }
  return out;
}

async function fetchFeed(url) {
  const res = await fetch(url, { signal: timeout(20000) });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return parseFeed(await res.text());
}

const looksShort = (v) => /#shorts?\b/i.test(`${v.title} ${v.description}`);

async function main() {
  const cfg = await loadYtConfig();
  const data = JSON.parse(await readFile(VIDEOS, "utf8"));
  const curated = data.videos.filter((v) => v.curated);
  const curatedIds = new Set(curated.map((v) => v.id));

  const channelId = await resolveChannelId(cfg);
  if (!channelId) {
    console.log(
      "No YouTube channel configured. Keeping curated videos only.\n" +
      'Add  "youtube": { "handle": "@YourChannel" }  to automation/config.json to auto-pull.'
    );
    data.meta.updated = new Date().toISOString();
    await writeFile(VIDEOS, JSON.stringify(data, null, 2) + "\n", "utf8");
    return;
  }
  console.log(`Channel: ${channelId}`);
  data.meta.channelId = channelId;
  data.meta.channelUrl = cfg.handle
    ? `https://www.youtube.com/${cfg.handle.startsWith("@") ? cfg.handle : "@" + cfg.handle}`
    : `https://www.youtube.com/channel/${channelId}`;

  const feed = await fetchFeed(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
  console.log(`Feed returned ${feed.length} videos.`);

  // Which ids are Shorts (from the optional Shorts playlist)?
  const shortIds = new Set();
  if (cfg.shortsPlaylistId) {
    try {
      const sp = await fetchFeed(`https://www.youtube.com/feeds/videos.xml?playlist_id=${cfg.shortsPlaylistId}`);
      sp.forEach((v) => shortIds.add(v.id));
      console.log(`Shorts playlist: ${sp.length} videos.`);
    } catch (e) {
      console.warn(`Shorts playlist failed (${e.message}); using #shorts tag heuristic.`);
    }
  }

  // Preserve any short flags already set by hand in videos.json.
  const prevShort = new Map(data.videos.map((v) => [v.id, v.short]));

  const fresh = feed
    .filter((v) => !curatedIds.has(v.id))
    .slice(0, cfg.maxVideos)
    .map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description.slice(0, 240),
      published: v.published,
      short: shortIds.has(v.id) || looksShort(v) || prevShort.get(v.id) === true,
      curated: false,
      thumb: v.thumb,
    }));

  data.videos = [...curated, ...fresh];
  data.meta.updated = new Date().toISOString();
  await writeFile(VIDEOS, JSON.stringify(data, null, 2) + "\n", "utf8");

  const nShort = fresh.filter((v) => v.short).length;
  console.log(`videos.json updated: ${curated.length} curated + ${fresh.length} from feed (${nShort} shorts).`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
