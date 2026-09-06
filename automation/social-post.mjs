#!/usr/bin/env node
// Instagram posts for @crimetimesnacks that are not tied to an episode render:
// carousels and single cards built from a small JSON spec, in the house look.
//
//   node automation/social-post.mjs <post-id>            render studio/posts/<id>/post.json -> slide-N.jpg + caption.txt
//   node automation/social-post.mjs --new "<slug>"       scaffold a post folder with an example spec
//   node automation/social-post.mjs --list               posts and their status
//
// post.json:
//   { "title": "...", "status": "draft|approved|posted", "caption": "...",
//     "slides": [ { "kind": "hook", "eyebrow": "...", "big": "...", "bg": "bg-house.png" },
//                 { "kind": "text", "eyebrow": "...", "body": ["para", "para"] },
//                 { "kind": "end",  "eyebrow": "...", "body": [...], "kicker": "...", "foot": ["@crimetimesnacks", "crimetimesnacks.com"] } ] }
// Slides are 1080x1350 (4:5), the feed format Instagram gives the most height.
// Text inside big/body/kicker may use <span class="r">red</span> and <span class="q">quiet</span>.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
export const POSTS = join(__dirname, "studio", "posts");
const TEMPLATE = pathToFileURL(join(__dirname, "studio", "templates", "post.html")).href;
const LOGO = pathToFileURL(join(ROOT, "images", "logo.png")).href;
const PW_CANDIDATES = ["D:/Dev/GitHub/ig-studio/node_modules/playwright/index.mjs", join(ROOT, "node_modules", "playwright", "index.mjs")];

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const out = (o) => console.log(asJson ? JSON.stringify(o) : (o.message || JSON.stringify(o)));
const die = (step, message) => { out({ ok: false, step, message }); process.exit(2); };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

if (args.includes("--list")) {
  const ids = existsSync(POSTS) ? (await readdir(POSTS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  const rows = [];
  for (const id of ids) { try { const p = JSON.parse(await readFile(join(POSTS, id, "post.json"), "utf8")); rows.push({ id, title: p.title, status: p.status || "draft", slides: (p.slides || []).length, rendered: existsSync(join(POSTS, id, "slide-1.jpg")) }); } catch { rows.push({ id, title: id, status: "broken" }); } }
  out({ ok: true, posts: rows, message: rows.map((r) => `${r.id}  ${r.status}  ${r.slides || 0} slides${r.rendered ? "" : "  (not rendered)"}`).join("\n") || "No posts yet." });
  process.exit(0);
}
if (args.includes("--new")) {
  const title = args[args.indexOf("--new") + 1] || "untitled";
  const id = `${new Date().toISOString().slice(0, 10)}-${slug(title)}`;
  const dir = join(POSTS, id);
  if (existsSync(dir)) die("exists", `Post ${id} already exists.`);
  await mkdir(dir, { recursive: true });
  const spec = { title, status: "draft", created: new Date().toISOString(), caption: `${title}\n\nFull episode: link in bio.\n\n#truecrime #crimetimesnacks`, slides: [
    { kind: "hook", eyebrow: "Case file", big: "The line that stops the thumb." },
    { kind: "text", eyebrow: "What happened", body: ["Two or three sentences. Specific, verified, no adjectives doing the work."] },
    { kind: "end", eyebrow: "The reveal", body: ["What it turned out to be."], kicker: "Full episode this week.", foot: ["@crimetimesnacks", "crimetimesnacks.com"] },
  ] };
  await writeFile(join(dir, "post.json"), JSON.stringify(spec, null, 2) + "\n", "utf8");
  out({ ok: true, id, dir, message: `New post ${id}. Edit ${join(dir, "post.json")} then render.` });
  process.exit(0);
}

const id = args.find((a) => !a.startsWith("--"));
if (!id) die("args", "usage: social-post.mjs <post-id> | --new <title> | --list");
const dir = join(POSTS, id);
let spec;
try { spec = JSON.parse(await readFile(join(dir, "post.json"), "utf8")); } catch { die("post", `No post.json in ${dir}`); }
if (!Array.isArray(spec.slides) || !spec.slides.length) die("post", "post.json needs a slides array");

const pw = PW_CANDIDATES.find((p) => existsSync(p));
if (!pw) die("playwright", "Playwright not found. Run `npm i` in D:\\Dev\\GitHub\\ig-studio (it owns the browser install).");
const { chromium } = await import(pathToFileURL(pw).href);
const browser = await chromium.launch();
const files = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (let i = 0; i < spec.slides.length; i++) {
    const s = spec.slides[i];
    const page = await ctx.newPage();
    const data = { ...s, index: i + 1, count: spec.slides.length, logo: LOGO, bg: s.bg ? pathToFileURL(join(dir, s.bg)).href : null, swipe: s.swipe ?? (i < spec.slides.length - 1 && i === 0 ? "swipe" : null) };
    await page.addInitScript((d) => { window.SLIDE = d; }, data);
    await page.goto(TEMPLATE, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const file = join(dir, `slide-${i + 1}.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 94 });
    files.push(file);
    await page.close();
  }
  await ctx.close();
} finally { await browser.close(); }
await writeFile(join(dir, "caption.txt"), (spec.caption || "").trim() + "\n", "utf8");
spec.rendered = new Date().toISOString(); spec.files = files.map((f) => f.slice(dir.length + 1));
await writeFile(join(dir, "post.json"), JSON.stringify(spec, null, 2) + "\n", "utf8");
out({ ok: true, id, files, caption: join(dir, "caption.txt"), message: `${files.length} slide${files.length === 1 ? "" : "s"} -> ${dir}\ncaption -> caption.txt` });
