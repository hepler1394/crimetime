#!/usr/bin/env node
// Runs every generator in order. Use this before deploying.
// Run: node automation/build-all.mjs
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// Note: run import-feed.mjs / import-youtube.mjs / import-fbi.mjs separately to
// refresh the JSON sources from the network. build-all works fully offline.
for (const script of ["build-feed.mjs", "build-episodes.mjs", "build-blog.mjs", "build-blog-rss.mjs", "build-videos.mjs", "build-merch.mjs", "build-quiz.mjs", "build-meta.mjs", "build-sitemap.mjs", "build-status.mjs"]) {
  const r = spawnSync(process.execPath, [join(here, script)], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
