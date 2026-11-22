#!/usr/bin/env node
// Generates a valid Apple/Spotify-spec podcast RSS feed from episodes.json.
// Run:  node automation/build-feed.mjs
// Output: feed.xml at the site root (served at https://www.crimetimesnacks.com/feed.xml),
//         and transcripts/<slug>.vtt for every episode that has a transcript.
//
// This is the foundation for automated publishing: add an episode to
// episodes.json (eventually via the AI pipeline), re-run this, deploy, and the
// new <item> appears in the feed that Apple/Spotify poll. No look changes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalCases } from "./case-canon.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// Download measurement. Until 2026-11-21 nothing counted a download: the mp3s are static
// files on Vercel and static requests are not logged. OP3 (op3.dev) is an open prefix
// service: the app asks OP3 for the file, OP3 counts the request and answers with a 302 to
// the real URL. Only the feed's enclosures carry it; the players on the site keep the
// direct URL, so a page play is not counted as a download. Set to "" to turn it off, and
// the feed goes back to direct URLs on the next build. Spotify copies the audio to its
// own servers, so Spotify plays never reach OP3 or us.
const ENCLOSURE_PREFIX = "https://op3.dev/e/";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
// Element content inside CDATA is HTML, so it takes HTML escaping, not XML's &apos;.
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cdata = (s) => `<![CDATA[${String(s).replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;

const abs = (site, path) =>
  /^https?:\/\//.test(path) ? path : `${site.replace(/\/$/, "")}${path}`;

// OP3 takes the target without its scheme when that scheme is https.
const measured = (url) => (ENCLOSURE_PREFIX && /^https:\/\//.test(url) ? ENCLOSURE_PREFIX + url.slice("https://".length) : url);

// podcast:guid, per the Podcasting 2.0 spec: a UUIDv5 in the podcast namespace
// (ead4c236-bf58-58c6-a2c6-a6b28d128cb6) of the feed URL with its scheme and trailing
// slashes removed. It names the show across hosts, so it must not change if the feed moves:
// feedGuid in episodes.json overrides the derivation should that ever happen.
function podcastGuid(feedUrl) {
  const ns = Buffer.from("ead4c236bf5858c6a2c6a6b28d128cb6", "hex");
  const name = String(feedUrl).replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest().subarray(0, 16);
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const stampOf = (ep) => new Date(ep.pubDate || `${ep.date}T12:00:00Z`);

/* ---------------------------------------------------------------- transcripts */
// The site already publishes each episode's transcript on its page, from
// automation/transcripts/<slug>.json. Podcast apps read WebVTT, so the same segments are
// written out as transcripts/<slug>.vtt and the feed points at that. No file, or a file with
// no segments, means no <podcast:transcript> tag: the feed never points at a transcript
// that does not exist.
const vttTime = (sec) => {
  const ms = Math.max(0, Math.round(Number(sec) * 1000));
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};
async function writeVtt(slug) {
  let t;
  try { t = JSON.parse(await readFile(join(__dirname, "transcripts", `${slug}.json`), "utf8")); } catch { return false; }
  const segs = (t.segments || []).filter((s) => s && String(s.text || "").trim() && Number.isFinite(Number(s.start)) && Number(s.end) > Number(s.start));
  if (!segs.length) return false;
  // "-->" cannot appear in a cue or a note; nothing in a script should contain it, but a
  // transcript that did would produce a file no player can read.
  const clean = (s) => String(s).replace(/\s+/g, " ").replace(/-->/g, "->").trim();
  const head = ["WEBVTT", ""];
  if (t.note) head.push(`NOTE ${clean(t.note)}`, "");
  const cues = segs.map((s) => `${vttTime(s.start)} --> ${vttTime(s.end)}\n${clean(s.text).replace(/&/g, "&amp;").replace(/</g, "&lt;")}`);
  await writeFile(join(ROOT, "transcripts", `${slug}.vtt`), `${head.join("\n")}\n${cues.join("\n\n")}\n`, "utf8");
  return true;
}

/* ----------------------------------------------------------------------- items */
// Show notes. Apps that render HTML show this instead of <description>: the same words,
// then where the transcript is and where to follow the case. The links are the only way a
// listener in an app finds the site at all.
function notes(p, ep, link, caseUrl) {
  const paras = String(ep.description || "").split(/\n\s*\n/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out = paras.map((s) => `<p>${escHtml(s)}</p>`);
  out.push(`<p><a href="${escHtml(link)}">Read the full transcript of this episode</a></p>`);
  if (caseUrl) out.push(`<p><a href="${escHtml(caseUrl)}">Follow this case by email</a>: court dates, rulings and arrests, each checked against the article that reports it.</p>`);
  return out.join("\n");
}

function item(p, ep, { number, hasTranscript, caseUrl }) {
  const link = ep.link || abs(p.siteUrl, `/episodes/${ep.slug}.html`);
  const audio = measured(abs(p.siteUrl, ep.audio));
  const img = abs(p.siteUrl, ep.image);
  // Never emit a pubDate in the future; Spotify and Apple treat one as scheduled
  // and hide the episode. Same guard as publishedAt() in episode-publish.mjs.
  const stamp = stampOf(ep);
  const pub = (stamp > new Date() ? new Date() : stamp).toUTCString();
  const dur = ep.duration ? `\n      <itunes:duration>${esc(ep.duration)}</itunes:duration>` : "";
  const transcript = hasTranscript ? `\n      <podcast:transcript url="${esc(abs(p.siteUrl, `/transcripts/${ep.slug}.vtt`))}" type="text/vtt" language="${esc(p.language || "en")}" />` : "";
  return `    <item>
      <title>${esc(ep.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="false">${esc(ep.guid)}</guid>
      <pubDate>${pub}</pubDate>
      <description>${esc(ep.description)}</description>
      <content:encoded>${cdata(notes(p, ep, link, caseUrl))}</content:encoded>
      <itunes:summary>${esc(ep.description)}</itunes:summary>
      <itunes:author>${esc(p.author)}</itunes:author>${dur}
      <itunes:episode>${number}</itunes:episode>
      <itunes:episodeType>${esc(ep.episodeType || "full")}</itunes:episodeType>
      <enclosure url="${esc(audio)}" length="${ep.audioBytes ?? 0}" type="${esc(ep.audioType ?? ep.audioMime ?? "audio/mpeg")}" />
      <itunes:image href="${esc(img)}" />${transcript}
      <itunes:explicit>${ep.explicit ? "true" : "false"}</itunes:explicit>
    </item>`;
}

async function buildFeed({ podcast: p, episodes }, caseUrlFor) {
  // Newest first by the moment of publication, not the calendar day: three episodes on one
  // day used to come out oldest first inside a newest-first feed.
  const sorted = [...episodes].sort((a, b) => stampOf(b) - stampOf(a) || b.date.localeCompare(a.date));
  // Episode numbers count up from the first episode in order of publication, so a new
  // episode takes the next number and no existing one changes. An episode can pin its own
  // with episodeNumber.
  const number = new Map([...sorted].reverse().map((ep, i) => [ep.guid, ep.episodeNumber || i + 1]));
  await mkdir(join(ROOT, "transcripts"), { recursive: true });
  let transcripts = 0;
  const items = [];
  for (const ep of sorted) {
    const hasTranscript = await writeVtt(ep.slug);
    if (hasTranscript) transcripts++;
    items.push(item(p, ep, { number: number.get(ep.guid), hasTranscript, caseUrl: caseUrlFor(ep.slug) }));
  }
  const home = abs(p.siteUrl, "/");
  const self = p.feedUrl || abs(p.siteUrl, "/feed.xml");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(p.title)}</title>
    <link>${esc(home)}</link>
    <atom:link href="${esc(self)}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <language>${esc(p.language)}</language>
    <copyright>&#169; ${new Date().getFullYear()} ${esc(p.copyright || p.author)}</copyright>
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
    <podcast:guid>${esc(p.feedGuid || podcastGuid(self))}</podcast:guid>
${items.join("\n")}
  </channel>
</rss>
`;
  return { xml, transcripts };
}

const data = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
// The case page a listener can follow for this episode, when there is one.
let caseUrlFor = () => "";
try {
  const live = JSON.parse(await readFile(join(__dirname, "cases-live.json"), "utf8"));
  const canon = canonicalCases(live.cases || [], data.episodes);
  caseUrlFor = (epSlug) => {
    const c = canon.byEpisode[epSlug];
    return c ? abs(data.podcast.siteUrl, `/cases/${c.slug}.html`) : "";
  };
} catch { /* no case board yet: the notes carry the episode link only */ }
const { xml, transcripts } = await buildFeed(data, caseUrlFor);
await writeFile(join(ROOT, "feed.xml"), xml, "utf8");
console.log(`feed.xml written: ${data.episodes.length} episodes, ${transcripts} with a transcript${ENCLOSURE_PREFIX ? `, enclosures measured through ${ENCLOSURE_PREFIX}` : ""}.`);
