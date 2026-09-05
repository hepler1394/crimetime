#!/usr/bin/env node
// Podcast studio, step 3: render the episode artwork.
//
//   node automation/episode-art.mjs <draft-id>        cover 3000x3000, card 1080x1350, reel still 1080x1920
//   node automation/episode-art.mjs --avatar          Instagram profile picture 1080x1080 (studio/instagram/avatar.jpg)
//
// Renders studio/templates/art.html in a real browser (Playwright, borrowed
// from ig-studio's node_modules so nothing new is installed here). The look is
// the site's own: black, red, caution tape, Bebas Neue.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DRAFTS = join(__dirname, "studio", "drafts");
const TEMPLATE = pathToFileURL(join(__dirname, "studio", "templates", "art.html")).href;
const LOGO = pathToFileURL(join(ROOT, "images", "logo.png")).href;
const PW_CANDIDATES = ["D:/Dev/GitHub/ig-studio/node_modules/playwright/index.mjs", join(ROOT, "node_modules", "playwright", "index.mjs")];

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const out = (o) => { if (asJson) console.log(JSON.stringify(o)); else console.log(o.message || JSON.stringify(o)); };
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };

const pw = PW_CANDIDATES.find((p) => existsSync(p.replace(/^file:\/\/\//, "")));
if (!pw) die("playwright", "Playwright not found. Run `npm i` in D:\\Dev\\GitHub\\ig-studio (it owns the browser install).");
const { chromium } = await import(pathToFileURL(pw).href);

const fmtDate = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

async function render(browser, data, file, { w, h, scale = 1, quality = 92 }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.addInitScript((d) => { window.EP = d; }, { ...data, w, h, logo: LOGO });
  await page.goto(TEMPLATE, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: file, type: "jpeg", quality });
  await ctx.close();
}

const browser = await chromium.launch();
try {
  if (args.includes("--avatar")) {
    const dir = join(__dirname, "studio", "instagram");
    await mkdir(dir, { recursive: true });
    const file = join(dir, "avatar.jpg");
    await render(browser, { mode: "avatar" }, file, { w: 1080, h: 1080, quality: 95 });
    out({ ok: true, file, message: `Avatar -> ${file}` });
  } else {
    const id = args.find((a) => !a.startsWith("--"));
    if (!id) die("args", "usage: episode-art.mjs <draft-id> | --avatar");
    const dir = join(DRAFTS, id);
    const epPath = join(dir, "episode.json");
    let ep;
    try { ep = JSON.parse(await readFile(epPath, "utf8")); } catch { die("draft", `No draft at ${epPath}`); }
    const date = ep.publishDate || ep.created?.slice(0, 10) || new Date().toISOString().slice(0, 10);
    const base = {
      title: ep.title, hook: ep.hook, eyebrow: `New episode  /  ${fmtDate(date)}`, stamp: ep.caseTitle && ep.caseTitle !== ep.title ? "Case file" : "New episode",
      metaLeft: `${ep.duration ? `<b>${ep.duration.replace(/^00:/, "")}</b>  ` : ""}A true crime podcast`,
    };
    const cover = join(dir, "cover.jpg"), card = join(dir, "card.jpg"), reel = join(dir, "reel.jpg");
    await render(browser, { ...base, mode: "cover", titleScale: 0.15, titleMaxH: 0.38 }, cover, { w: 1500, h: 1500, scale: 2, quality: 90 });
    await render(browser, { ...base, mode: "card", titleScale: 0.16, titleMaxH: 0.32 }, card, { w: 1080, h: 1350, quality: 94 });
    await render(browser, { ...base, mode: "reel", titleScale: 0.17, titleMaxH: 0.30 }, reel, { w: 1080, h: 1920, quality: 94 });
    ep.files = { ...(ep.files || {}), cover: "cover.jpg", card: "card.jpg", reelStill: "reel.jpg" };
    if (ep.status === "voiced" || ep.status === "scripted") ep.status = ep.status === "voiced" ? "designed" : ep.status;
    await writeFile(epPath, JSON.stringify(ep, null, 2) + "\n", "utf8");
    out({ ok: true, id, files: [cover, card, reel], message: `Art for ${id}: cover.jpg (3000x3000), card.jpg (1080x1350), reel.jpg (1080x1920)` });
  }
} finally {
  await browser.close();
}
