#!/usr/bin/env node
// One-time-ish normalizer: gives the hand-written root pages the same header as
// the rest of the site (logo, full nav, working mobile menu + dark mode) and
// ensures main.js is loaded. Idempotent — safe to re-run.
// Run: node automation/normalize-shell.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// page file -> active nav key
const PAGES = {
  "about.html": "about",
  "contact.html": "contact",
  "listen.html": "episodes",
  "merch.html": "merch",
  "videos.html": "videos",
};

const NAV = [
  ["index.html", "home", "fa-home", "Home"],
  ["episodes.html", "episodes", "fa-microphone", "Episodes"],
  ["videos.html", "videos", "fa-video", "Videos"],
  ["blog.html", "blog", "fa-newspaper", "Blog"],
  ["about.html", "about", "fa-info-circle", "About"],
  ["merch.html", "merch", "fa-tshirt", "Merch"],
  ["contact.html", "contact", "fa-envelope", "Contact"],
];

const header = (active) => `    <!-- Header & Navigation -->
    <header>
        <div class="nav-container container">
            <div class="logo-container">
                <a href="index.html"><img src="images/logo.png" alt="CrimeTimeSnacks Logo" height="40"></a>
            </div>
            <button id="mobile-menu-btn" class="mobile-menu-btn"><i class="fas fa-bars"></i></button>
            <nav>
                <ul class="nav-menu">
${NAV.map(([href, key, icon, label]) =>
  `                    <li><a href="${href}"${key === active ? ' class="active"' : ""}><i class="fas ${icon}"></i> ${label}</a></li>`
).join("\n")}
                </ul>
            </nav>
            <div class="utility-nav">
                <button id="dark-mode-toggle"><i class="fas fa-moon"></i></button>
            </div>
        </div>
    </header>`;

let changed = 0;
for (const [file, active] of Object.entries(PAGES)) {
  const path = join(ROOT, file);
  let html;
  try { html = await readFile(path, "utf8"); } catch { continue; }

  const newHtml = html
    .replace(/[ \t]*<!-- Header & Navigation -->\s*<header>[\s\S]*?<\/header>/, header(active))
    .replace(/<header>[\s\S]*?<\/header>/, (m) => (m.includes("nav-container container") ? m : header(active)));

  let out = newHtml;
  // Ensure main.js is loaded (mobile menu + dark mode depend on it).
  if (!/src="js\/main\.js"/.test(out)) {
    out = out.replace(/<\/body>/i, '    <script src="js/main.js"></script>\n</body>');
  }
  if (out !== html) { await writeFile(path, out, "utf8"); changed++; console.log(`normalized ${file}`); }
}
console.log(`Done. ${changed} page(s) updated.`);
