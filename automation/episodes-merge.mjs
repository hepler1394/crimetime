// Merges the episodes the studio publishes (automation/studio-episodes.json)
// into the episode list imported from the Anchor/Spotify feed.
//
// Why this exists: import-feed.mjs rewrites episodes.json from the live Anchor
// feed on every run (locally and in CI every 6 hours). Any episode produced in
// the studio and published straight to the site would be erased on the next
// sync. Studio episodes live in their own file and are merged in here, so both
// sources survive. If Cory later uploads the same episode to Spotify, the feed
// copy wins (matched by slug) and the studio copy is dropped from the output.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const STUDIO_EPISODES = join(__dirname, "studio-episodes.json");

export async function loadStudioEpisodes() {
  try {
    const j = JSON.parse(await readFile(STUDIO_EPISODES, "utf8"));
    return Array.isArray(j.episodes) ? j.episodes : [];
  } catch {
    return [];
  }
}

export function mergeEpisodes(feedEpisodes, studioEpisodes) {
  const feedSlugs = new Set(feedEpisodes.map((e) => e.slug));
  const extra = studioEpisodes.filter((e) => e.slug && !feedSlugs.has(e.slug));
  // Newest first by the moment of publication. Sorting on the calendar day alone left three
  // episodes published on one day in oldest-first order, so "the latest episode" on the
  // homepage was the first of the three rather than the last. Every later sort in the
  // generators is by day and stable, so this order is the one that survives within a day.
  const stamp = (e) => Date.parse(e.pubDate || `${e.date || ""}T12:00:00Z`) || 0;
  return [...feedEpisodes, ...extra].sort((a, b) => (b.date || "").localeCompare(a.date || "") || stamp(b) - stamp(a));
}
