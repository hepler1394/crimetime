#!/usr/bin/env node
// Smoke test: rebuilds the site and asserts the expected output exists and is
// well-formed. Exit 1 on any failure. Run: node automation/test-build.mjs
// This is the CI-style guard for the automation — run it before publishing.

import { spawnSync } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let failures = 0;
const ok = (name) => console.log(`  ok  ${name}`);
const fail = (name, detail) => { console.error(`FAIL  ${name}${detail ? " — " + detail : ""}`); failures++; };

const exists = async (rel) => { try { await access(join(ROOT, rel)); return true; } catch { return false; } };
const read = (rel) => readFile(join(ROOT, rel), "utf8");

// 1. Build must succeed.
console.log("Rebuilding...");
const b = spawnSync(process.execPath, [join(__dirname, "build-all.mjs")], { stdio: "inherit", cwd: ROOT });
if (b.status !== 0) { fail("build-all.mjs exits 0"); process.exit(1); } else ok("build-all.mjs exits 0");

// 2. Core pages exist.
for (const f of ["index.html", "videos.html", "merch.html", "blog.html", "episodes.html", "feed.xml", "sitemap.xml", "robots.txt", "blog-feed.xml"]) {
  (await exists(f)) ? ok(`exists ${f}`) : fail(`exists ${f}`);
}

// 3. Generated pages contain valid JSON-LD blocks.
for (const f of ["videos.html", "merch.html"]) {
  const html = await read(f);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) { fail(`${f} has JSON-LD`); continue; }
  let allValid = true;
  for (const m of blocks) { try { JSON.parse(m[1]); } catch { allValid = false; } }
  allValid ? ok(`${f} JSON-LD valid`) : fail(`${f} JSON-LD valid`, "parse error");
}

// 4. Merch designs all reference an SVG that exists.
const merch = JSON.parse(await read("automation/merch.json"));
let svgMissing = 0;
for (const d of merch.designs) if (!(await exists(d.svg))) svgMissing++;
svgMissing === 0 ? ok(`all ${merch.designs.length} merch SVGs present`) : fail("merch SVGs present", `${svgMissing} missing`);

// 5. videos.html has the shorts-first sections + filter.
const vhtml = await read("videos.html");
vhtml.includes('class="format-filters"') && vhtml.includes("format-shorts")
  ? ok("videos.html shorts-first layout") : fail("videos.html shorts-first layout");

// 6. Feeds are well-formed-ish (have closing root tags).
for (const [f, tag] of [["feed.xml", "</rss>"], ["blog-feed.xml", "</rss>"], ["sitemap.xml", "</urlset>"]]) {
  (await read(f)).trim().endsWith(tag) ? ok(`${f} closed`) : fail(`${f} closed`, `missing ${tag}`);
}

// 7. Link check.
const lc = spawnSync(process.execPath, [join(__dirname, "check-links.mjs")], { stdio: "inherit", cwd: ROOT });
lc.status === 0 ? ok("check-links clean") : fail("check-links clean");

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
