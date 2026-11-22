// node --test automation/test-case-canon.mjs
// One page per case: which slug is the page, whose updates it carries, where the others go.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SUBJECTS, canonicalSlug, groupOf, aliasPairs, subjectTitle, mergeUpdates, canonicalCases } from "./case-canon.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const row = (slug, extra = {}) => ({ slug, title: slug, summary: "", status: "open", years: "", episode_slug: "", image: "", ...extra });

test("every slug belongs to at most one subject", () => {
  const seen = new Map();
  for (const s of SUBJECTS) for (const slug of [s.slug, ...s.aliases]) {
    assert.ok(!seen.has(slug), `${slug} is in both ${seen.get(slug)} and ${s.slug}`);
    seen.set(slug, s.slug);
  }
});

test("an alias resolves to its page and a slug in no subject to itself", () => {
  assert.equal(canonicalSlug("alex-murdaugh"), "the-murdaugh-family-murders");
  assert.equal(canonicalSlug("the-murdaugh-family-murders"), "the-murdaugh-family-murders");
  assert.equal(canonicalSlug("golden-state-killer"), "golden-state-killer");
  assert.deepEqual(groupOf("kohberger-trial"), ["murders-in-moscow", "moscow-idaho-the-plea", "kohberger-trial"]);
  assert.deepEqual(groupOf("adnan-syed"), ["adnan-syed"]);
  assert.equal(subjectTitle("delphi-richard-allen"), "The Delphi Murders");
  assert.equal(subjectTitle("gabby-petito"), "");
});

test("a subject is one page that carries every member's episodes", () => {
  const cases = [
    row("alex-murdaugh", { title: "Alex Murdaugh", angle: "brief" }),
    row("the-murdaugh-family-murders", { title: "The Murdaugh Family Murders", episode_slug: "the-murdaugh-family-murders" }),
    row("golden-state-killer", { episode_slug: "the-golden-state-killer" }),
    row("adnan-syed"),
  ];
  const { subjects, bySlug, byEpisode } = canonicalCases(cases, new Set(["the-murdaugh-family-murders", "the-golden-state-killer"]));
  assert.equal(subjects.length, 3);
  const m = bySlug["alex-murdaugh"];
  assert.equal(m.slug, "the-murdaugh-family-murders");
  assert.deepEqual(m.memberSlugs, ["the-murdaugh-family-murders", "alex-murdaugh"]);
  assert.deepEqual(m.aliases, ["alex-murdaugh"]);
  assert.equal(byEpisode["the-murdaugh-family-murders"], m);
  assert.deepEqual(bySlug["adnan-syed"].episodeSlugs, [], "a case with no episode is still a page, unpublished");
});

test("an unpublished episode does not make a case published", () => {
  const { bySlug } = canonicalCases([row("x", { episode_slug: "not-out-yet" })], new Set());
  assert.deepEqual(bySlug.x.episodeSlugs, []);
});

test("an episode that names its case lands on that case's page without a row of its own", () => {
  const cases = [row("jonbenet-ramsey-the-facts-96-22", { episode_slug: "jonbenet-ramsey-the-facts-96-22-part-1" }), row("jonbenet-ramsey-dna")];
  const episodes = [{ slug: "jonbenet-ramsey-the-facts-96-22-part-1" }, { slug: "the-touch-dna-of-jonbenet", caseSlug: "jonbenet-ramsey-dna" }];
  const { byEpisode } = canonicalCases(cases, episodes);
  assert.equal(byEpisode["the-touch-dna-of-jonbenet"].slug, "jonbenet-ramsey-the-facts-96-22");
  assert.equal(byEpisode["the-touch-dna-of-jonbenet"].episodeSlugs.length, 2);
});

test("status and years come from the checked row where the page's own row has the publish year", () => {
  const cases = [row("the-zodiac-ciphers", { status: "open", years: "2026", episode_slug: "the-zodiac-ciphers" }), row("zodiac-killer", { status: "cold", years: "1968-1969" })];
  const { bySlug } = canonicalCases(cases, new Set(["the-zodiac-ciphers"]));
  assert.equal(bySlug["the-zodiac-ciphers"].status, "cold");
  assert.equal(bySlug["the-zodiac-ciphers"].years, "1968-1969");
});

test("the surviving row missing from a snapshot does not lose the case", () => {
  const { subjects } = canonicalCases([row("alex-murdaugh")], new Set());
  assert.equal(subjects.length, 1);
  assert.equal(subjects[0].slug, "alex-murdaugh");
});

test("merged updates: one entry per article, same-day repeats folded, nothing approved loses its link", () => {
  const u = (case_slug, happened_on, title, url, source = "") => ({ case_slug, happened_on, title, url, source, summary: "" });
  const merged = mergeUpdates([
    u("a", "2026-11-17", "Judge orders release of redacted juror records", "https://www.abcnews4.com/x?utm=1", "ABC News 4"),
    u("b", "2026-11-17", "Judge orders release of redacted juror records", "https://abcnews4.com/x", "ABC News 4"),
    u("b", "2026-11-17", "Judge orders redacted release of juror records in Murdaugh trial", "https://walb.com/y", "WALB"),
    u("a", "2026-11-17", "Defense files notice of appeal", "https://example.com/z", "Example"),
    u("a", "2026-11-13", "Judge orders release of redacted juror records", "https://other.com/w", "Other"),
  ]);
  assert.equal(merged.length, 3, "same article once, same-day repeat folded, a different event and a different day kept");
  assert.equal(merged[0].happened_on, "2026-11-17");
  const first = merged.find((m) => m.url.includes("abcnews4"));
  assert.deepEqual(first.also.map((a) => a.url), ["https://walb.com/y"]);
  const links = merged.flatMap((m) => [m.url, ...m.also.map((a) => a.url)]);
  for (const want of ["walb.com/y", "example.com/z", "other.com/w"]) assert.ok(links.some((l) => l.includes(want)), `${want} is still on the page`);
  assert.ok(!("_w" in merged[0]), "no working fields leak into the output");
});

// vercel.json: the redirects build-redirects.mjs owns, checked the way Vercel reads them
// (a path-to-regexp source: ":name(pattern)" is a capture group, the whole path must match).
const toRegExp = (source) => new RegExp(`^${source.replace(/:[a-z]+\(/g, "(")}$`);
test("vercel.json sends every folded slug to its page and leaves real pages and functions alone", async () => {
  const { redirects } = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));
  const pathRules = redirects.filter((r) => !r.has);
  const first = (path) => pathRules.find((r) => toRegExp(r.source).test(path));
  for (const [alias, slug] of aliasPairs()) {
    assert.equal(first(`/cases/${alias}.html`)?.destination, `/cases/${slug}.html`);
    assert.equal(first(`/cases/${alias}`)?.destination, `/cases/${slug}.html`, "the extensionless form goes there in one hop");
  }
  for (const path of ["/", "/index.html", "/episodes.html", "/episodes/the-zodiac-ciphers.html", "/cases/gabby-petito.html", "/blog-posts/x.html", "/feed.xml", "/api/community/follow", "/signin", "/account", "/u/cory", "/auth/callback", "/health", "/audio/x.mp3", "/transcripts/x.vtt"]) {
    assert.equal(first(path), undefined, `${path} must not be redirected`);
  }
  assert.equal(first("/episodes/the-zodiac-ciphers")?.destination, "/episodes/:slug.html");
  assert.equal(first("/cases/gabby-petito")?.destination, "/cases/:slug.html");
  assert.equal(first("/episodes")?.destination, "/:page.html");
  assert.equal(first("/blog")?.destination, "/:page.html");
  // No surviving page is itself redirected away.
  for (const s of SUBJECTS) assert.equal(first(`/cases/${s.slug}.html`), undefined);
});
