#!/usr/bin/env node
// Generates real, print-ready SVG merch designs and keeps merch.json in sync.
// Works fully OFFLINE from a built-in slogan pool. With --ai it asks your
// local/cheapest LLM for fresh tasteful slogans (no keys in code; see llm.mjs).
//
// Usage:
//   node automation/gen-merch.mjs           ensure pool designs + SVGs exist
//   node automation/gen-merch.mjs --ai      add 2 new AI-written slogans
//   node automation/gen-merch.mjs --ai 4    add 4

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { designSvg, SLOGAN_POOL, slugify } from "./merch-design.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const MERCH = join(__dirname, "merch.json");
const SVG_DIR = join(ROOT, "images", "merch");

const args = process.argv.slice(2);
const ai = args.includes("--ai");
const aiCount = Number(args.find((a) => /^\d+$/.test(a))) || 2;

async function loadMerch() {
  try { return JSON.parse(await readFile(MERCH, "utf8")); }
  catch {
    return {
      meta: {
        intro: "Designs straight from the studio — new drops are added automatically. Every design is an original CrimeTimeSnacks print on a black tee, hoodie, or sticker. The store runs on print-on-demand, so everything ships made-to-order.",
        updated: "",
      },
      designs: [],
    };
  }
}

async function aiSlogans(count) {
  try {
    const { chat, loadConfig } = await import("./llm.mjs");
    const cfg = await loadConfig();
    const SYSTEM = `You write merch slogans for CrimeTimeSnacks, a true crime podcast. STRICT rules:
- Short, punchy tee slogans: 2 to 4 words. Tasteful. NO real victim names. No glorifying violence.
- True-crime-fan energy (suspicion, cold cases, lock the doors, trust your gut, evidence).
- NO emojis. Output ONLY minified JSON array: [{"slogan": string}, ...] with exactly ${count} items.`;
    const { text } = await chat(SYSTEM, `Give ${count} fresh slogans.`, cfg);
    const json = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    const arr = JSON.parse(json);
    return arr.map((x) => ({ slogan: String(x.slogan).trim(), tagline: "CRIMETIMESNACKS", price: "28" }));
  } catch (e) {
    console.warn(`AI slogans unavailable (${e.message}); using built-in pool.`);
    return [];
  }
}

async function main() {
  await mkdir(SVG_DIR, { recursive: true });
  const merch = await loadMerch();
  const have = new Set(merch.designs.map((d) => d.slug));

  // Decide what to add this run.
  let incoming;
  if (ai) {
    incoming = await aiSlogans(aiCount);
    if (!incoming.length) incoming = SLOGAN_POOL.filter((s) => !have.has(slugify(s.slogan))).slice(0, aiCount);
  } else {
    incoming = SLOGAN_POOL; // ensure the whole pool exists (idempotent)
  }

  let added = 0;
  for (const item of incoming) {
    const slug = slugify(item.slogan.replace(/\s*\/\s*/g, " "));
    if (have.has(slug)) continue;
    const svgRel = `images/merch/${slug}.svg`;
    await writeFile(join(ROOT, svgRel), designSvg(item.slogan, { tagline: item.tagline }), "utf8");
    merch.designs.unshift({
      slug,
      slogan: item.slogan.replace(/\s*\/\s*/g, " "),
      tagline: item.tagline || "CRIMETIMESNACKS",
      price: item.price || "28",
      svg: svgRel,
      created: new Date().toISOString().slice(0, 10),
    });
    have.add(slug);
    added++;
  }

  // Make sure every design actually has its SVG on disk (regenerate if missing).
  for (const d of merch.designs) {
    try { await readFile(join(ROOT, d.svg)); }
    catch { await writeFile(join(ROOT, d.svg), designSvg(d.slogan, { tagline: d.tagline }), "utf8"); }
  }

  merch.meta.updated = new Date().toISOString();
  await writeFile(MERCH, JSON.stringify(merch, null, 2) + "\n", "utf8");
  console.log(`merch.json: ${merch.designs.length} designs (${added} new this run). SVGs in images/merch/.`);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
