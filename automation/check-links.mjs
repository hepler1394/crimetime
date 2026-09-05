#!/usr/bin/env node
// QA: scans every .html file for local asset references (src/href) and reports
// any that point at a file which does not exist on disk.
// Run: node automation/check-links.mjs   (exit 1 if anything is broken)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const toPosix = (p) => p.split(path.sep).join("/");

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const p = path.join(dir, e.name);
    // The podcast studio is a local app served by its own server, not a site page.
    if (toPosix(p).endsWith("automation/studio")) continue;
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const re =
  /(?:src|href)="([^"#?:]+\.(?:png|jpg|jpeg|webp|gif|svg|ico|css|js|xml|webmanifest|html))(?:\?[^"]*)?"/gi;

// Strip <script>/<style> blocks so JS template literals (e.g. src="images/
// ${name}.jpg") aren't mistaken for broken links.
const stripCode = (html) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

const missing = new Map();
for (const f of walk(ROOT)) {
  const html = stripCode(fs.readFileSync(f, "utf8"));
  const dir = path.dirname(f);
  let m;
  while ((m = re.exec(html))) {
    const ref = m[1];
    if (ref.startsWith("http") || ref.startsWith("//")) continue;
    if (ref.includes("${")) continue; // unresolved template literal
    const target = ref.startsWith("/")
      ? path.join(ROOT, ref)
      : path.join(dir, ref);
    if (!fs.existsSync(target)) {
      if (!missing.has(ref)) missing.set(ref, new Set());
      missing.get(ref).add(toPosix(path.relative(ROOT, f)));
    }
  }
}

if (missing.size === 0) {
  console.log("OK: no broken local asset references.");
  process.exit(0);
}
for (const [ref, files] of missing) {
  console.log(`BROKEN ${ref}  <- ${[...files].length} file(s): ${[...files].slice(0, 4).join(", ")}`);
}
process.exit(1);
