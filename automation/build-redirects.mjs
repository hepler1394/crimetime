#!/usr/bin/env node
// Keeps two families of redirects in vercel.json in step with the site. Part of build-all.
// Run: node automation/build-redirects.mjs
//
// 1. Case pages that are now part of another page. A case with several rows in the database
//    is one page (case-canon.mjs); the other slugs' URLs were live, so they answer with a
//    301 to the page that carries their updates rather than a 404.
// 2. Addresses typed or shared without ".html". /episodes/the-zodiac-ciphers and /cases
//    were 404s. They go to the real page, which keeps its .html address: cleanUrls would
//    have turned every canonical URL, sitemap entry and feed link on the site into a
//    redirect, so this is redirects in one direction only.
//
// Only the entries this script owns are touched: a /cases/<slug> to /cases/<slug>.html
// pair, or a source listed in CLEAN below. Everything else in vercel.json (the host
// redirects, the community-zone rewrites, headers, crons) is left exactly as it is, and
// the file is rewritten only when the result differs.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { aliasPairs } from "./case-canon.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "vercel.json");

// Root pages that may be asked for without their extension. Not /signin, /account, /u,
// /auth, /health or /api: those are rewrites to the community zone or functions, and a
// redirect here would be evaluated before them.
const ROOT_PAGES = ["episodes", "cases", "blog", "about", "listen", "contact", "quiz", "glossary", "live", "corrections", "privacy", "terms", "search", "videos", "merch"];
const SLUG = "([a-z0-9][a-z0-9-]*)"; // no dot: /episodes/x.html never matches
const CLEAN = [
  { source: `/episodes/:slug${SLUG}`, destination: "/episodes/:slug.html", statusCode: 301 },
  { source: `/cases/:slug${SLUG}`, destination: "/cases/:slug.html", statusCode: 301 },
  { source: `/blog-posts/:slug${SLUG}`, destination: "/blog-posts/:slug.html", statusCode: 301 },
  { source: `/:page(${ROOT_PAGES.join("|")})`, destination: "/:page.html", statusCode: 301 },
];

// Both spellings of a folded slug go straight to the page, in one hop.
const aliases = aliasPairs().flatMap(([alias, slug]) => [
  { source: `/cases/${alias}.html`, destination: `/cases/${slug}.html`, statusCode: 301 },
  { source: `/cases/${alias}`, destination: `/cases/${slug}.html`, statusCode: 301 },
]);

const raw = await readFile(FILE, "utf8");
const config = JSON.parse(raw);
const cleanSources = new Set(CLEAN.map((r) => r.source));
const owned = (r) => !r.has && (cleanSources.has(r.source) || (/^\/cases\/[a-z0-9-]+(\.html)?$/.test(r.source) && /^\/cases\/[a-z0-9-]+\.html$/.test(r.destination)));
// Order matters: the first match wins. Host redirects stay first, then the exact case
// addresses, then the patterns.
config.redirects = [...(config.redirects || []).filter((r) => !owned(r)), ...aliases, ...CLEAN];

const next = JSON.stringify(config, null, 2) + "\n";
if (next === raw) console.log(`vercel.json redirects up to date (${aliases.length / 2} case slugs folded, ${CLEAN.length} extensionless rules).`);
else { await writeFile(FILE, next, "utf8"); console.log(`vercel.json: ${aliases.length / 2} case slugs redirected to their page, ${CLEAN.length} extensionless rules.`); }
