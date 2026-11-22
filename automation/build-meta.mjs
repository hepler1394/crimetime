#!/usr/bin/env node
// Injects canonical + Open Graph/Twitter + RSS-alternate meta into the <head>
// of root-level pages that don't already have them. Idempotent (skips pages
// that already contain og:title). Run: node automation/build-meta.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { DEFAULT_SHARE_IMAGE, SHARE_W, SHARE_H, SHARE_ALT } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://www.crimetimesnacks.com";
const SKIP = new Set(["editor.html"]); // internal tool

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

let changed = 0;
for (const f of (await readdir(ROOT)).filter((x) => x.endsWith(".html"))) {
  if (SKIP.has(f)) continue;
  let html = await readFile(join(ROOT, f), "utf8");
  if (html.includes('property="og:title"')) {
    // Already has OG — just back-fill image alt tags if they're missing.
    let touched = false;
    // The hand-written pages named the square logo as their share image (a WebP file under
    // a .png name, announced as a wide card). They take the site's 1200x630 card, with its
    // size, so a crawler does not have to fetch it to lay the preview out.
    const before = html;
    html = html
      .replace(/(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")[^"]*\/images\/logo\.png(">)/gi, `$1${SITE}${DEFAULT_SHARE_IMAGE}$2`)
      .replace(/(<meta\s+(?:property="og:image:alt"|name="twitter:image:alt")\s+content=")CrimeTimeSnacks logo(">)/gi, `$1${SHARE_ALT}$2`);
    if (html.includes(`property="og:image" content="${SITE}${DEFAULT_SHARE_IMAGE}"`) && !html.includes('property="og:image:width"')) {
      html = html.replace(/(<meta\s+property="og:image"\s+content="[^"]*">)/i, `$1\n    <meta property="og:image:width" content="${SHARE_W}">\n    <meta property="og:image:height" content="${SHARE_H}">`);
    }
    if (html !== before) touched = true;
    if (html.includes('property="og:image"') && !html.includes('property="og:image:alt"')) {
      html = html.replace(
        /(<meta\s+property="og:image"\s+content="[^"]*">)/i,
        `$1\n    <meta property="og:image:alt" content="CrimeTimeSnacks logo">`
      );
      touched = true;
    }
    if (html.includes('name="twitter:image"') && !html.includes('name="twitter:image:alt"')) {
      html = html.replace(
        /(<meta\s+name="twitter:image"\s+content="[^"]*">)/i,
        `$1\n    <meta name="twitter:image:alt" content="CrimeTimeSnacks logo">`
      );
      touched = true;
    }
    if (touched) { await writeFile(join(ROOT, f), html, "utf8"); changed++; }
    continue;
  }

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "CrimeTimeSnacks";
  const desc =
    (html.match(/<meta\s+name="description"\s+content="([\s\S]*?)"/i) || [])[1] ||
    "A true crime podcast exploring unsolved cases, murders, and mysteries.";
  const path = f === "index.html" ? "/" : "/" + f;
  const t = esc(title.trim());
  const d = esc(desc.trim());

  const block = `
    <link rel="canonical" href="${SITE}${encodeURI(path)}">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="${t}">
    <meta property="og:description" content="${d}">
    <meta property="og:url" content="${SITE}${encodeURI(path)}">
    <meta property="og:image" content="${SITE}${DEFAULT_SHARE_IMAGE}">
    <meta property="og:image:width" content="${SHARE_W}">
    <meta property="og:image:height" content="${SHARE_H}">
    <meta property="og:image:alt" content="${SHARE_ALT}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${t}">
    <meta name="twitter:description" content="${d}">
    <meta name="twitter:image" content="${SITE}${DEFAULT_SHARE_IMAGE}">
    <meta name="twitter:image:alt" content="${SHARE_ALT}">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">`;

  html = html.replace(/<\/title>/i, `</title>${block}`);
  await writeFile(join(ROOT, f), html, "utf8");
  changed++;
}
console.log(`meta injected into ${changed} page(s).`);
