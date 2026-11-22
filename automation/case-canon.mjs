// One page per case, however many rows the database holds for it.
//
// cts_cases grew two rows for most subjects: the backlog entry from cases.json
// ("alex-murdaugh", where case-watch.mjs files most of the news) and a second row that
// sync-cases.mjs made when the episode was published ("the-murdaugh-family-murders", the
// one the episode page links to and the only one that was indexed). On 2026-11-21 that was
// 44 pages for about 22 subjects, with 90 of the 165 approved updates sitting on pages
// marked noindex and linked from nowhere.
//
// Nothing in the database is deleted or moved: follows and updates stay keyed to the slug
// they were written under. This file says which slugs are the same case and which one is
// the page. The generators build one page per subject and fold the others' updates into it;
// vercel.json redirects the other URLs to it (build-redirects.mjs); the Sunday digest sends
// a follower of any slug in a subject the updates filed under all of them; and
// sync-cases.mjs links a new episode to the subject instead of making another row.
//
// `slug` is the page that survives. It is always a page that was already indexed and
// linked, so no URL a search engine or a listener could have kept changes; the ones that
// redirect were noindex, or were a second page for the same case.
// `title` is the subject's name where the surviving row's title is one episode's title.
// `facts` names the row whose status and years have been checked (case-facts.json) where
// the surviving row still carries the episode's publish year and a default "open".
// Imported by api/community/digest.js as well, so this file stays free of Node-only imports.

export const SUBJECTS = [
  { slug: "the-murdaugh-family-murders", aliases: ["alex-murdaugh"] },
  { slug: "murders-in-moscow", aliases: ["moscow-idaho-the-plea", "kohberger-trial"] },
  { slug: "the-delphi-murder-case-2017", title: "The Delphi Murders", aliases: ["delphi-the-appeal", "delphi-richard-allen"] },
  { slug: "erik-and-lyle-the-menendez-brothers", title: "The Menendez Brothers", aliases: ["the-menendez-brothers-parole-years", "menendez-the-parole-years"] },
  { slug: "jonbenet-ramsey-the-facts-96-22", aliases: ["jonbenet-thirty-years", "jonbenet-ramsey-americas-child-beauty-queen", "jonbenet-ramsey-dna"] },
  { slug: "gilgo-beach-eight-names", aliases: ["long-island-serial-killer"] },
  { slug: "watts-family-murders", title: "The Watts Family Murders", aliases: ["the-interrogation-of-chris-watts", "chris-watts-confession"] },
  { slug: "the-btk-floppy-disk", aliases: ["btk-dennis-rader"] },
  { slug: "the-zodiac-ciphers", aliases: ["zodiac-killer"], facts: "zodiac-killer" },
  { slug: "the-doomsday-mom", aliases: ["lori-vallow"], facts: "lori-vallow" },
  { slug: "the-disappearance-of-laci-peterson", aliases: ["scott-peterson"], facts: "scott-peterson" },
  { slug: "ted-bundy-and-the-murder-of-kimberly-leach", aliases: ["ted-bundy-escape"], facts: "ted-bundy-escape" },
  { slug: "gabby-petito", aliases: ["brian-laundrie-notebook"] },
];

const CANON = new Map();
for (const s of SUBJECTS) { CANON.set(s.slug, s); for (const a of s.aliases) CANON.set(a, s); }

// The slug of the page a case slug lives on. A slug in no subject is its own page.
export const canonicalSlug = (slug) => CANON.get(slug)?.slug || slug;
// Every slug that is the same case as this one, the surviving page first.
export const groupOf = (slug) => { const s = CANON.get(slug); return s ? [s.slug, ...s.aliases] : [slug]; };
// The subject's own name, where the surviving row's title is one episode's title.
export const subjectTitle = (slug) => CANON.get(slug)?.title || "";
// [alias, canonical] for every slug that is not its own page: the redirects.
export const aliasPairs = () => SUBJECTS.flatMap((s) => s.aliases.map((a) => [a, s.slug]));

const normUrl = (u) => String(u || "").trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
const STOP = new Set("a an and the of in on at to for from with by as is are was were be after ahead before over into his her their its s".split(" "));
const words = (t) => new Set(String(t || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
const overlap = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };

// The approved updates of several rows as one timeline, newest first.
//  - The same article filed under two rows is one update.
//  - Two entries on the same day whose headlines say the same thing (three quarters of the
//    shorter one's words) are one event reported twice: the first stays as the entry and
//    the other's article is kept beside it under `also`, so every source that was read and
//    approved is still on the page.
// Nothing is rewritten and nothing approved is dropped without its link surviving.
export function mergeUpdates(updates) {
  const sorted = [...updates].sort((a, b) => String(b.happened_on).localeCompare(String(a.happened_on)));
  const out = [];
  const seenUrl = new Map();
  for (const u of sorted) {
    const key = normUrl(u.url);
    if (key && seenUrl.has(key)) continue;
    const w = words(u.title);
    const twin = out.find((o) => o.happened_on === u.happened_on && overlap(w, o._w) >= 0.75);
    if (twin) {
      if (key) { seenUrl.set(key, twin); twin.also.push({ url: u.url, source: u.source || "" }); }
      continue;
    }
    const entry = { ...u, also: [], _w: w };
    if (key) seenUrl.set(key, entry);
    out.push(entry);
  }
  return out.map(({ _w, ...u }) => u);
}

// cases: rows of cts_cases. episodes: the episodes that are on the site (episodes.json), or
// just a Set of their slugs. Returns the subjects (one per page), and lookups by episode slug
// and by any member slug.
//
// An episode belongs to a case in one of two ways: a row names it (episode_slug, one per
// row), or the episode names the case it was drafted from (caseSlug, recorded at publish
// since 2026-11-21). The second is what lets a case have a third episode without a third row.
export function canonicalCases(cases, episodes = new Set()) {
  const list = Array.isArray(episodes) ? episodes : [];
  const publishedEpisodes = Array.isArray(episodes) ? new Set(list.map((e) => e.slug)) : episodes;
  const drafted = {};
  for (const e of list) if (e.caseSlug) (drafted[e.caseSlug] = drafted[e.caseSlug] || []).push(e.slug);
  const bySlugRow = Object.fromEntries(cases.map((c) => [c.slug, c]));
  const done = new Set();
  const subjects = [];
  for (const c of cases) {
    if (done.has(c.slug)) continue;
    const spec = CANON.get(c.slug);
    const memberSlugs = (spec ? [spec.slug, ...spec.aliases] : [c.slug]).filter((s) => bySlugRow[s]);
    memberSlugs.forEach((s) => done.add(s));
    const members = memberSlugs.map((s) => bySlugRow[s]);
    // The surviving page is the named one; if the snapshot does not have that row yet, the
    // first row that is present stands in so the case does not vanish from the site.
    const base = members[0];
    const facts = (spec?.facts && bySlugRow[spec.facts]) || base;
    const episodeSlugs = [...new Set([...members.map((m) => m.episode_slug), ...memberSlugs.flatMap((s) => drafted[s] || [])].filter((e) => e && publishedEpisodes.has(e)))];
    subjects.push({
      ...base,
      title: spec?.title || base.title,
      status: facts.status || base.status,
      years: facts.years || base.years,
      next_date: members.find((m) => m.next_date)?.next_date || null,
      next_label: members.find((m) => m.next_date)?.next_label || null,
      image: base.image || members.find((m) => m.image)?.image || "",
      featured: members.some((m) => m.featured),
      memberSlugs,
      aliases: memberSlugs.slice(1),
      episodeSlugs,
    });
  }
  const bySlug = {};
  const byEpisode = {};
  for (const s of subjects) {
    for (const m of s.memberSlugs) bySlug[m] = s;
    for (const e of s.episodeSlugs) byEpisode[e] = s;
  }
  return { subjects, bySlug, byEpisode };
}
