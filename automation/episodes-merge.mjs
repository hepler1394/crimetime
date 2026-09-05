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
  return [...feedEpisodes, ...extra].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
