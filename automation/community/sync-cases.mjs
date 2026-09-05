#!/usr/bin/env node
// Pushes the case list into Supabase (cts_cases): every entry in cases.json,
// plus one case per published episode, linked to that episode. Upsert by slug,
// so hand edits made in the studio or the database are kept (only the fields
// below are written, and summary/status only when empty).
//
//   node automation/community/sync-cases.mjs [--json]
// Env from automation/.env.community (local) or the process (CI/Vercel).

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv } from "./env.mjs";
import { sb } from "./lib.js";

const here = dirname(fileURLToPath(import.meta.url));
const AUTO = join(here, "..");
await loadEnv();
const asJson = process.argv.includes("--json");
const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };

const { cases = [] } = await readJson(join(AUTO, "cases.json"), {});
const eps = (await readJson(join(AUTO, "episodes.json"), { episodes: [] })).episodes || [];
const existing = Object.fromEntries((await sb("cts_cases?select=slug,summary,status,episode_slug,image")).map((c) => [c.slug, c]));

const rows = [];
for (const c of cases) {
  const ex = existing[c.slug] || {};
  // An episode about this case? Match by caseSlug recorded at publish time, else by title.
  const ep = eps.find((e) => e.caseSlug === c.slug) || eps.find((e) => e.title.toLowerCase().includes(c.title.toLowerCase().replace(/^the /, "")));
  rows.push({
    slug: c.slug, title: c.title, angle: c.angle || "", years: c.year || "",
    summary: ex.summary || c.angle || "",
    status: ex.status || (/present/.test(c.year || "") ? "open" : "closed"),
    episode_slug: ex.episode_slug || ep?.slug || "",
    image: ex.image || ep?.image || "",
    sources: [],
  });
}
// Episodes with no backlog entry become cases of their own.
for (const e of eps) {
  if (rows.some((r) => r.episode_slug === e.slug)) continue;
  const slug = e.caseSlug || e.slug.replace(/^crimetimesnacks-/, "").replace(/-part-\d+$/, "");
  if (rows.some((r) => r.slug === slug)) continue;
  const ex = existing[slug] || {};
  rows.push({ slug, title: e.title.replace(/^CrimeTimeSnacks:\s*/i, "").replace(/\s*\|.*$/, "").trim(), angle: "", years: (e.date || "").slice(0, 4), summary: ex.summary || e.description || "", status: ex.status || "open", episode_slug: e.slug, image: ex.image || e.image || "", sources: [] });
}
await sb("cts_cases?on_conflict=slug", { method: "POST", body: rows, prefer: "resolution=merge-duplicates,return=minimal" });
const msg = `Synced ${rows.length} cases to Supabase (${rows.filter((r) => r.episode_slug).length} linked to episodes).`;
console.log(asJson ? JSON.stringify({ ok: true, cases: rows.length, message: msg }) : msg);
