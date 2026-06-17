#!/usr/bin/env node
// Injects canonical + Open Graph/Twitter + RSS-alternate meta into the <head>
// of root-level pages that don't already have them. Idempotent (skips pages
// that already contain og:title). Run: node automation/build-meta.mjs

import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://crimetime.vercel.app";
const SKIP = new Set(["editor.html"]); // internal tool

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

let changed = 0;
for (const f of (await readdir(ROOT)).filter((x) => x.endsWith(".html"))) {
  if (SKIP.has(f)) continue;
  let html = await readFile(join(ROOT, f), "utf8");
  if (html.includes('property="og:title"')) continue; // already done (e.g. index.html)

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
    <meta property="og:image" content="${SITE}/images/logo.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${t}">
    <meta name="twitter:description" content="${d}">
    <meta name="twitter:image" content="${SITE}/images/logo.png">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">`;

  html = html.replace(/<\/title>/i, `</title>${block}`);
  await writeFile(join(ROOT, f), html, "utf8");
  changed++;
}
console.log(`meta injected into ${changed} page(s).`);
