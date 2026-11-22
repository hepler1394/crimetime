#!/usr/bin/env node
// Tells IndexNow (Bing, Yandex, Seznam, Naver and the engines that read from them) which
// pages changed, so a new episode or case update is fetched in minutes rather than whenever
// a crawler next comes by. On 2026-11-21 Brave's copy of the homepage was still the one from
// before 2026-09-17. Google does not take IndexNow; Search Console is still how it is told.
//
//   node automation/indexnow.mjs            what would be sent (nothing is sent)
//   node automation/indexnow.mjs --submit   send it, and remember what was sent
//   node automation/indexnow.mjs --all      ignore what was sent before
//
// "Changed" is read from sitemap.xml: a URL whose <lastmod> differs from the one recorded in
// automation/indexnow-state.json the last time it was submitted, or a URL never submitted.
// A page with no lastmod is sent once and not again. Run it after a deploy, not before:
// the engines fetch the URL when they are told about it, and the key file has to be live.
//
// The key is not a secret. It is a file at the site root whose name and contents are the
// key, which is how IndexNow checks that whoever submits a URL controls the site. Do not
// delete or rename it.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const HOST = "www.crimetimesnacks.com";
const KEY = "dd8c627a9e1a5a020f36a8cbc315c308";
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = "https://api.indexnow.org/indexnow";
const STATE = join(here, "indexnow-state.json");
const submit = process.argv.includes("--submit");
const all = process.argv.includes("--all");

const keyFile = await readFile(join(ROOT, `${KEY}.txt`), "utf8").catch(() => "");
if (keyFile.trim() !== KEY) { console.error(`The key file ${KEY}.txt is missing from the site root or does not hold the key. Nothing sent.`); process.exit(1); }

const xml = await readFile(join(ROOT, "sitemap.xml"), "utf8");
const pages = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map((m) => ({
  url: (m[1].match(/<loc>([^<]+)<\/loc>/) || [])[1],
  lastmod: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || "",
})).filter((p) => p.url && p.url.startsWith(`https://${HOST}/`));

const state = all ? {} : JSON.parse(await readFile(STATE, "utf8").catch(() => "{}"));
const sent = state.sent || {};
const changed = pages.filter((p) => !(p.url in sent) || sent[p.url] !== p.lastmod);

console.log(`${pages.length} URLs in the sitemap, ${changed.length} new or changed since the last submission.`);
for (const p of changed.slice(0, 40)) console.log(`  ${p.lastmod || "(no date)"}  ${p.url}`);
if (changed.length > 40) console.log(`  ... and ${changed.length - 40} more`);
if (!changed.length) process.exit(0);
if (!submit) { console.log("Dry run: nothing sent. Add --submit to send."); process.exit(0); }

// Up to 10,000 URLs per request; this site has under a hundred.
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: changed.map((p) => p.url) }),
});
// 200 and 202 are both acceptance (202: received, key not yet checked). Anything else is
// reported and nothing is recorded, so the same URLs are offered again next time.
if (res.status !== 200 && res.status !== 202) {
  console.error(`IndexNow answered ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
for (const p of changed) sent[p.url] = p.lastmod;
await writeFile(STATE, JSON.stringify({ submitted: new Date().toISOString(), sent }, null, 2) + "\n", "utf8");
console.log(`Sent ${changed.length} URLs to IndexNow (${res.status}).`);
