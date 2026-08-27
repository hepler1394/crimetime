#!/usr/bin/env node
// THE ONE BUTTON. Refreshes everything and rebuilds the site:
//   1. Pull latest podcast episodes (Anchor RSS)        [network]
//   2. Pull latest YouTube uploads + Shorts (YT RSS)    [network]
//   3. Write one fresh, slop-free blog post             [local LLM first]
//   4. Add one new merch design                         [local LLM, offline-safe]
//   5. Rebuild the whole site (feed, episodes, blog, videos, merch, meta, sitemap)
//   6. QA internal links
//   7. (optional) commit + push -> Vercel auto-deploys
//
// Run:
//   node automation/weekly-update.mjs                 build only (no git)
//   node automation/weekly-update.mjs --commit        commit locally
//   node automation/weekly-update.mjs --commit --push publish (auto-deploys)
//
// Network/LLM steps are best-effort: if one fails (offline, LLM down), it logs a
// warning and the rebuild still runs from the JSON already on disk.

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const args = process.argv.slice(2);
const doCommit = args.includes("--commit");
const doPush = args.includes("--push");

const run = (script, scriptArgs = [], { required = false } = {}) => {
  const label = `${script} ${scriptArgs.join(" ")}`.trim();
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(process.execPath, [join(here, script), ...scriptArgs], { stdio: "inherit", cwd: ROOT });
  if (r.status !== 0) {
    if (required) { console.error(`FAILED (required): ${label}`); process.exit(r.status ?? 1); }
    console.warn(`WARN: ${label} failed (status ${r.status}) — continuing.`);
    return false;
  }
  return true;
};

const git = (gitArgs) => {
  console.log(`\n=== git ${gitArgs.join(" ")} ===`);
  return spawnSync("git", gitArgs, { stdio: "inherit", cwd: ROOT }).status === 0;
};

console.log("CrimeTimeSnacks content update —", new Date().toISOString());

// 0: start from the latest published state. The CI feed sync
// (.github/workflows/sync.yml) pushes every 6 hours, so building on a stale
// tree regenerates the whole site from old JSON and reverts its work.
if (doPush && !git(["pull", "--rebase", "--autostash"])) {
  console.error("\nABORTED: could not sync with origin. Fix the tree, then re-run.");
  process.exit(1);
}

// 1-3: refresh sources (best-effort; need network)
run("import-feed.mjs");        // podcast episodes
run("import-youtube.mjs");     // youtube videos + shorts
run("import-fbi.mjs");         // live case board (FBI public data)

// 4: fresh blog post (best-effort; needs an LLM — local first)
run("ai-write.mjs", ["--auto"]);

// 5: new merch design (best-effort LLM, falls back to the offline pool)
run("gen-merch.mjs", ["--ai", "1"]);

// 6: new quiz in Cory's voice (best-effort LLM)
run("gen-quiz.mjs");

// 7: rebuild everything from the updated JSON (REQUIRED — must succeed)
run("build-all.mjs", [], { required: true });

// 8: QA
run("check-links.mjs");

// 7: publish
if (doCommit) {
  git(["add", "-A"]);
  const stamp = new Date().toISOString().slice(0, 10);
  const committed = git(["commit", "-m", `Weekly auto-update (${stamp}): episodes, videos, blog, merch`]);
  if (committed && doPush) {
    // Rebase onto anything CI pushed while this run was building. Without this
    // the push is rejected and the commit strands here forever.
    if (!git(["pull", "--rebase", "--autostash"]) || !git(["push"])) {
      console.error("\nPUBLISH FAILED: could not rebase onto origin or push.");
      console.error("The commit is safe locally — resolve, then run: git push");
      process.exit(1);
    }
    console.log("\nPushed. Vercel will auto-deploy crimetime.vercel.app.");
  } else if (committed) {
    console.log("\nCommitted locally. Run `git push` (or re-run with --push) to publish.");
  } else {
    console.log("\nNothing to commit (no changes this run).");
  }
}

console.log("\nWeekly update complete.");
