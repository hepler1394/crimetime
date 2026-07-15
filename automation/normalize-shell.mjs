#!/usr/bin/env node
// One-time-ish normalizer: gives the hand-written root pages the same 2026
// header as the generated pages (shared shell), and ensures main.js/effects.js
// are loaded. Idempotent — safe to re-run.
// Run: node automation/normalize-shell.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { header } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// page file -> active nav key
const PAGES = {
  "index.html": "home",
  "about.html": "about",
  "contact.html": "contact",
  "listen.html": "home",
  "live.html": "live",
  "404.html": "",
};

let changed = 0;
for (const [file, active] of Object.entries(PAGES)) {
  const path = join(ROOT, file);
  let html;
  try { html = await readFile(path, "utf8"); } catch { continue; }

  // Replace skip-link + header with the canonical shell header.
  const canonical = header(active);
  let out = html.replace(
    /[ \t]*<a href="#main-content" class="skip-link">[\s\S]*?<\/header>/,
    canonical
  );
  if (out === html) {
    out = html.replace(/<header>[\s\S]*?<\/header>/, canonical.replace(/^[\s\S]*?<header>/, "<header>"));
  }

  // Ensure the script pair is loaded.
  if (!/src="\/?js\/main\.js"/.test(out)) {
    out = out.replace(/<\/body>/i, '    <script src="/js/main.js"></script>\n</body>');
  }
  if (!/src="\/?js\/effects\.js"/.test(out)) {
    out = out.replace(/<\/body>/i, '    <script src="/js/effects.js"></script>\n</body>');
  }

  if (out !== html) { await writeFile(path, out, "utf8"); changed++; console.log(`normalized ${file}`); }
}
console.log(`Done. ${changed} page(s) updated.`);
