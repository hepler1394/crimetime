#!/usr/bin/env node
// Pulls the FBI's PUBLIC Wanted API (api.fbi.gov — free, no key) and bakes a
// slim snapshot into automation/fbi.json. The Live Cases page + homepage teaser
// render from this file, then try a live client-side refresh on top.
// Best-effort: if the API is down, the previous snapshot is kept untouched.
// Run: node automation/import-fbi.mjs

import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "fbi.json");
const PAGES = 3; // 3 x 50 = up to 150 cases baked
// Browser-like UA: api.fbi.gov sits behind Akamai, which rejects obvious bots.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const timeout = (ms) => {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

// Akamai also fingerprints node's TLS stack and 403s it on some networks, while
// curl (Windows 10+, macOS, and CI runners all ship it) gets through fine.
function curlFetch(url) {
  const r = spawnSync("curl", ["-s", "--max-time", "25", "-A", UA, "-H", "Accept: application/json", url], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0 || !r.stdout || !r.stdout.trim().startsWith("{")) {
    throw new Error(`curl fallback failed (${r.status})`);
  }
  return JSON.parse(r.stdout);
}

function classify(item) {
  const poster = (item.poster_classification || "").toLowerCase();
  const person = (item.person_classification || "").toLowerCase();
  const subjects = (item.subjects || []).join(" ").toLowerCase();
  if (poster.includes("missing") || subjects.includes("missing") || subjects.includes("kidnap")) return "missing";
  if (poster.includes("information") || person.includes("victim") || subjects.includes("seeking information") || subjects.includes("victim")) return "victim";
  return "wanted";
}

function slim(item) {
  const img = (item.images || []).find((i) => i.large || i.original || i.thumb) || {};
  return {
    uid: item.uid,
    title: item.title || "",
    kind: classify(item),
    image: img.large || img.original || img.thumb || "",
    office: (item.field_offices || []).map((o) => String(o).replace(/\b\w/g, (c) => c.toUpperCase())).join(", ") || "FBI",
    reward: item.reward_text ? String(item.reward_text).replace(/^The FBI is offering a?\s*/i, "").replace(/^reward of up to/i, "Reward up to") : "",
    url: item.url || "",
    status: item.status || "",
    warning: item.warning_message || "",
    subjects: (item.subjects || []).slice(0, 3),
    publication: item.publication || "",
  };
}

async function fetchPage(page) {
  const url = `https://api.fbi.gov/wanted/v1/list?pageSize=50&page=${page}&sort_on=modified&sort_order=desc`;
  try {
    const res = await fetch(url, {
      signal: timeout(20000),
      headers: { "User-Agent": UA, Accept: "application/json", "Accept-Language": "en-US,en;q=0.9" },
    });
    if (!res.ok) throw new Error(`FBI API ${res.status}`);
    return await res.json();
  } catch (e) {
    return curlFetch(url); // node TLS blocked -> curl gets through
  }
}

try {
  const items = [];
  let total = 0;
  for (let p = 1; p <= PAGES; p++) {
    const data = await fetchPage(p);
    total = data.total || total;
    items.push(...(data.items || []).map(slim));
    if (!data.items || data.items.length < 50) break;
  }
  if (!items.length) throw new Error("FBI API returned no items");
  const out = {
    meta: {
      source: "FBI Wanted API (api.fbi.gov) — public data",
      totalOnFile: total,
      baked: items.length,
      updated: new Date().toISOString(),
    },
    items,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`fbi.json: ${items.length} cases baked (${total} total on FBI file).`);
} catch (e) {
  // keep previous snapshot; report and exit 0 so the pipeline continues
  let had = false;
  try { await readFile(OUT, "utf8"); had = true; } catch {}
  console.warn(`WARN: FBI import failed (${e.message}). ${had ? "Keeping previous fbi.json." : "No snapshot exists yet."}`);
}
