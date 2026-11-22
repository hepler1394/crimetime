#!/usr/bin/env node
// Renders automation/share-card.html to images/share-card.jpg (1200x630), the image a link
// to the site shows when it is pasted into a message or a post.
//
// Until 2026-11-21 that image was /images/logo.png: a 2048x2048 square, WebP bytes under a
// .png name, announced as a wide card (twitter:card=summary_large_image) with no size given.
// Whatever a network did with that, it was not what was intended.
//
// Not part of build-all: the card changes when the show's cover or headline does, not when
// an episode is published. It needs a browser to draw it; this repo has none, so it borrows
// Playwright from ig-studio next door, or from wherever PLAYWRIGHT_FROM points.
//
//   node automation/make-share-card.mjs
//   PLAYWRIGHT_FROM=D:/somewhere/node_modules/playwright/index.js node automation/make-share-card.mjs

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const from = process.env.PLAYWRIGHT_FROM || join(ROOT, "..", "ig-studio", "node_modules", "playwright", "index.js");
if (!existsSync(from)) { console.error(`No Playwright at ${from}. Set PLAYWRIGHT_FROM to a playwright/index.js.`); process.exit(1); }
const { chromium } = (await import(pathToFileURL(from).href)).default;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(here, "share-card.html")).href, { waitUntil: "networkidle" });
  // The headline is Bebas Neue from Google Fonts; a card drawn before it arrives is drawn in Impact.
  const fonts = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")); });
  if (!fonts.includes("Bebas Neue")) throw new Error("Bebas Neue did not load; not writing a card in a fallback face");
  const out = join(ROOT, "images", "share-card.jpg");
  await page.screenshot({ path: out, type: "jpeg", quality: 88, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(`wrote ${out}`);
} finally { await browser.close(); }
