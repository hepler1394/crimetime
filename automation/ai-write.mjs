#!/usr/bin/env node
// Blog writer. One post per run, about a named case or a documented topic, written from
// research notes and published only when every name and number in it is in those notes.
//
//   node automation/ai-write.mjs --auto                      next case or topic (Tue/Fri content run)
//   node automation/ai-write.mjs "<case or topic>" [category]
//   node automation/ai-write.mjs --rewrite <post-slug> --topic "<case or topic>" [--case <case-slug>]
//                                                            expand an existing post, same URL
//   --dry     print the post and change nothing
//   --commit  commit the rebuild
//
// Why it changed (2026-09-13): the old writer asked a model for three paragraphs from memory.
// Every post came out 85 to 268 words, too thin to rank, and nothing in them could be checked.
// Now each run:
//   1. Researches first. episode-research.mjs fetches Wikipedia and current coverage into
//      automation/studio/research/<slug>/research.md; notes under 45 days old are reused.
//   2. Writes 1,100 to 1,500 words in sections with the studio's writer model (Gemini Pro),
//      from the notes only, in voice.md's voice.
//   3. Checks every name and number against the notes (blog-check.mjs). Anything missing
//      gets one rewrite; if it is still missing the post is not published: it is saved to
//      automation/studio/blog-held/ and Cory is told.
//   4. Publishes with its sources listed, linked to the case page and the episode.
// About 20 cents a post on Gemini Pro. The check runs locally and costs nothing.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chat, loadConfig } from "./llm.mjs";
import { unsupportedInPost, unsupportedQuotes, stockLines, STOCK_PHRASES, postWords } from "./blog-check.mjs";
import { notifyCory } from "./notify-cory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const RESEARCH = join(__dirname, "studio", "research");
const HELD = join(__dirname, "studio", "blog-held");
const CATEGORIES = { breaking: "Breaking", court: "Court", investigation: "Investigation", analysis: "Analysis", updates: "Case Updates" };
const FRESH_DAYS = 45;
const MIN_NOTES = 6000;
const MIN_WORDS = 900;

const args = process.argv.slice(2);
// What git already had dirty before this run: --commit stages only what the run itself
// changed, never another job's half-written work in the same tree.
const gitDirty = () => new Set((spawnSync("git", ["status", "--porcelain", "-uall"], { cwd: ROOT, encoding: "utf8" }).stdout || "")
  .split("\n").filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, "").replace(/^.* -> /, "")));
const dirtyBefore = args.includes("--commit") ? gitDirty() : new Set();
const opt = (n) => { const i = args.indexOf(n); return i > -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null; };
const dry = args.includes("--dry");
const commit = args.includes("--commit");
const rewriteSlug = opt("--rewrite");
const positional = args.filter((a, i) => !a.startsWith("--") && !["--rewrite", "--topic", "--case"].includes(args[i - 1]));
// Local date, not UTC: the Tuesday run that finished after 7 p.m. Central on 2026-10-06 dated
// its post October 7.
const today = new Date().toLocaleDateString("en-CA");

const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };
const finish = (message, code = 0) => { console.log(message); process.exit(code); };

const blogPath = join(__dirname, "blog.json");
const blog = await readJson(blogPath, { posts: [] });
const backlog = (await readJson(join(__dirname, "cases.json"), {})).cases || [];
const live = (await readJson(join(__dirname, "cases-live.json"), {})).cases || [];
const episodes = (await readJson(join(__dirname, "episodes.json"), {})).episodes || [];
const topics = (await readJson(join(__dirname, "topics.json"), {})).topics || [];

/* ------------------------------------------------------------ subject */
// --auto alternates a case post and a topic post. Case posts go first to cases with an
// episode to link, then the backlog; a case already carrying a post (caseSlug) is skipped.
function autoSubjects() {
  const covered = new Set(blog.posts.map((p) => p.caseSlug).filter(Boolean));
  const usedTopics = new Set(blog.posts.map((p) => p.sourceTopic).filter(Boolean));
  const withEpisode = live.filter((c) => c.episode_slug && episodes.some((e) => e.slug === c.episode_slug)).map((c) => ({ slug: c.slug, title: c.title }));
  const cases = [...withEpisode, ...backlog.map((c) => ({ slug: c.slug, title: c.title.split(":")[0].trim() }))]
    .filter((c, i, a) => a.findIndex((x) => x.slug === c.slug) === i && !covered.has(c.slug))
    .map((c) => ({ subject: c.title, caseSlug: c.slug, category: "investigation" }));
  const tops = topics.filter((t) => !usedTopics.has(t.topic))
    .map((t) => ({ subject: t.topic, sourceTopic: t.topic, category: CATEGORIES[t.category] ? t.category : "analysis" }));
  return blog.posts[0]?.caseSlug ? [...tops, ...cases] : [...cases, ...tops];
}

let existing = null;
let subjects;
if (rewriteSlug) {
  existing = blog.posts.find((p) => p.slug === rewriteSlug);
  if (!existing) finish(`No post with slug ${rewriteSlug}.`, 1);
  subjects = [{ subject: opt("--topic") || existing.title, caseSlug: opt("--case") || existing.caseSlug || null, sourceTopic: existing.sourceTopic || null, category: existing.category }];
} else if (positional[0]) {
  const caseHit = [...live, ...backlog].find((c) => c.slug === slugify(positional[0]) || c.title.toLowerCase() === positional[0].toLowerCase());
  subjects = [{ subject: positional[0], caseSlug: caseHit?.slug || null, category: CATEGORIES[positional[1]] ? positional[1] : "analysis" }];
} else {
  subjects = autoSubjects();
}
if (!subjects.length) finish("Nothing left to write about: every case and calendar topic has a post.");

/* ----------------------------------------------------------- research */
async function loadNotes(dir) {
  const notes = await readFile(join(dir, "research.md"), "utf8");
  const meta = await readJson(join(dir, "research.json"), { sources: [] });
  return { notes, sources: (meta.sources || []).filter((s) => s.url).map((s) => ({ title: s.title, url: s.url })) };
}
async function research(s) {
  const slug = s.caseSlug || slugify(s.subject);
  const dir = join(RESEARCH, slug);
  try {
    const st = await stat(join(dir, "research.md"));
    if (Date.now() - st.mtimeMs < FRESH_DAYS * 864e5) { console.log(`Research: reusing ${dir}`); return loadNotes(dir); }
  } catch { /* none yet */ }
  const inBacklog = backlog.some((c) => c.slug === slug);
  console.log(`Research: fetching sources for "${s.subject}"`);
  const r = spawnSync(process.execPath, [join(__dirname, "episode-research.mjs"), ...(inBacklog ? ["--case", slug] : [s.subject]), "--json"], { cwd: ROOT, encoding: "utf8", timeout: 300000, windowsHide: true });
  const last = (r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"));
  let res = null; try { res = last ? JSON.parse(last) : null; } catch { /* noise */ }
  if (!res?.ok) return { error: res?.message || `research exited ${r.status}` };
  return loadNotes(res.dir);
}

/* ------------------------------------------------------------ writing */
let VOICE = "";
try { VOICE = await readFile(join(__dirname, "voice.md"), "utf8"); } catch { /* optional */ }
const SYSTEM = `You write long-form posts for the CrimeTimeSnacks blog, in Cory's voice.

${VOICE}

For this post, these rules override the format defaults in the voice guide:
- 1,100 to 1,500 words. An opening of two or three paragraphs with no heading, then 5 to 7 sections, each with a plain, descriptive heading and 2 to 4 paragraphs.
- Use ONLY facts in the RESEARCH NOTES. Every name, date, number and quotation must appear in the notes. If the notes do not say it, leave it out. Do not add anything you remember about the case.
- A quotation goes in quote marks only when the notes contain those exact words. Otherwise paraphrase it without quote marks. Never make up something a person said.
- Write numbers as digits and give full names the way the notes give them.
- Presumption of innocence: anyone the notes do not show convicted is "accused", "charged" or "suspected". Say what the record shows, never what you believe. Someone acquitted, cleared or never charged is never written as if they did it.
- Where the case stands: date it. Write "As of <month year in the notes>, ..." for the latest event the notes give, never "today" or "recently", and do not say a court "has not ruled" unless the notes say so; the post will be read for months.
- You are a writer working from research notes. Do not claim Cory personally read files, interviewed anyone or went back through anything. This is a blog post, not a podcast script: no "today we're going to", no "our episode", no "stay tuned".
- The voice guide's example lines are illustrations of tone. Do not copy them. Never use these phrases: ${STOCK_PHRASES.map((p) => `"${p}"`).join(", ")}. Open with a specific, true detail from the notes, said plainly, and make the opening unlike the RECENT OPENINGS listed after the notes. Vary sentence shapes.
- The title names the case or subject plainly, the way a person would search for it. Under 70 characters. No clickbait.
- No emojis, no "in this article", no "delve", no strings of rhetorical questions. End by handing the case to the reader, never with a lecture.
Output ONLY a JSON object: {"title": string, "excerpt": string (one factual sentence, under 155 characters; it is the meta description), "intro": [string], "sections": [{"heading": string, "paragraphs": [string]}]}`;

// Meta descriptions over ~155 characters are cut off in search results: trim on a word.
const clip = (t, n = 155) => { t = String(t || "").trim(); if (t.length <= n) return t; const c = t.slice(0, n - 1); return c.slice(0, c.lastIndexOf(" ")).replace(/[,;:.\s]+$/, "") + "."; };
const toPost = (o) => ({
  title: String(o.title || "").trim(),
  excerpt: clip(o.excerpt),
  body: [...(o.intro || []), ...(o.sections || []).flatMap((s) => [`## ${String(s.heading || "").trim()}`, ...(s.paragraphs || [])])].map((t) => String(t).trim()).filter((t) => t && t !== "##"),
});

// maxOutputTokens: the cap counts Gemini Pro's hidden reasoning, and on this brief it has
// thought for about 6,500 tokens before writing. At the old 8192 the 2026-10-06 post was cut
// off 1,630 tokens into its answer. A 1,500-word post is about 2,500 tokens of JSON.
const cfg = { ...(await loadConfig()), role: "writer", jsonMode: true, timeoutMs: 300000, maxOutputTokens: 32768 };
let subject = null, notesPack = null;
for (const s of subjects.slice(0, 3)) {
  const pack = await research(s);
  if (pack.error) { console.log(`Skipping "${s.subject}": ${pack.error}`); continue; }
  if (pack.notes.length < MIN_NOTES || pack.sources.length < 2) { console.log(`Skipping "${s.subject}": only ${pack.sources.length} source(s), ${pack.notes.length} characters of notes`); continue; }
  subject = s; notesPack = pack; break;
}
if (!subject) finish("No subject had enough research to write from. Nothing published.");

const category = subject.category;
const notes = notesPack.notes.slice(0, 90000);
console.log(`Writing: ${subject.subject} (${CATEGORIES[category]}), notes ${Math.round(notes.length / 1000)}k chars, ${notesPack.sources.length} sources`);
// Recent openings, so the writer does not reuse one: the posts of September 2026 opened the
// same way thirteen times.
const recent = blog.posts.filter((p) => p.slug !== existing?.slug).slice(0, 12);
const openings = recent.map((p) => (p.body.find((b) => !b.startsWith("## ")) || "").split(/(?<=[.!?])\s/)[0]).filter(Boolean);
const user = `TODAY: ${today}\nSUBJECT: ${subject.subject}\nCATEGORY: ${CATEGORIES[category]}\n\nRESEARCH NOTES\n${notes}\n\nRECENT OPENINGS (do not echo these)\n${openings.map((o) => `- ${o}`).join("\n")}`;

let draft, provider;
try {
  const r = await chat(SYSTEM, user, cfg);
  provider = r.provider;
  draft = toPost(JSON.parse(r.text));
} catch (e) { finish(`Writer failed: ${e.message}`, 1); }

// Three checks, one rewrite: names and numbers not in the notes, quotations not in the notes
// word for word, and stock lines (blog-check.mjs). The first two hold a post; stock lines only
// send it back once, and any left are logged.
const check = (d) => ({ missing: unsupportedInPost(d, notes), quotes: unsupportedQuotes(d, notes), stock: stockLines(d, recent) });
const factIssues = (f) => [...f.missing, ...f.quotes.map((q) => `quote "${q.slice(0, 60)}"`)];
let found = check(draft);
if (found.missing.length || found.quotes.length || found.stock.length) {
  const asks = [
    ...(found.missing.length ? [`These names and numbers in your draft are not in the research notes: ${found.missing.join(", ")}. Remove each one or correct it to exactly what the notes say.`] : []),
    ...(found.quotes.length ? [`These quotations are not in the research notes word for word: ${found.quotes.map((q) => `"${q}"`).join("; ")}. Use the exact words from the notes or paraphrase without quote marks.`] : []),
    ...(found.stock.length ? [`Remove these stock lines and write those sentences fresh: ${found.stock.join("; ")}.`] : []),
  ];
  console.log(`Check: ${asks.join(" ")} One rewrite.`);
  try {
    const r = await chat(SYSTEM, `${user}\n\nYOUR PREVIOUS DRAFT\n${JSON.stringify(draft)}\n\n${asks.join("\n")}\nKeep everything else. Same JSON shape.`, cfg);
    const second = toPost(JSON.parse(r.text));
    if (second.body.length) draft = second;
  } catch (e) { console.log(`Rewrite failed: ${e.message}`); }
  found = check(draft);
}
let missing = factIssues(found);
// A short draft gets one expansion pass before it is held. Gemini Pro handed back 769 words
// on an 80k-character research file (2026-09-24, the fingerprint post), which is a model
// stopping early, not a shortage of material; asking again with the count in front of it is
// cheaper than holding a post that is otherwise clean.
let words = postWords(draft);
if (words < MIN_WORDS && draft.body.length) {
  console.log(`Check: ${words} words, under ${MIN_WORDS}. One expansion.`);
  try {
    const r = await chat(SYSTEM, `${user}\n\nYOUR PREVIOUS DRAFT\n${JSON.stringify(draft)}\n\nThis draft is ${words} words. The post must be 1,100 to 1,500 words. Expand it with more of what the RESEARCH NOTES contain: more of the record, more specifics, more sections where the notes support them. Add nothing that is not in the notes. Keep the title. Same JSON shape.`, cfg);
    const bigger = toPost(JSON.parse(r.text));
    if (postWords(bigger) > words) { draft = bigger; found = check(draft); missing = factIssues(found); }
  } catch (e) { console.log(`Expansion failed: ${e.message}`); }
  words = postWords(draft);
}
const problems = [...(missing.length ? [`not in the notes: ${missing.join(", ")}`] : []), ...(words < MIN_WORDS ? [`only ${words} words`] : []), ...(!draft.title ? ["no title"] : [])];
console.log(`Draft: "${draft.title}", ${words} words, via ${provider}. ${problems.length ? `Held: ${problems.join("; ")}` : "Check passed."}${found.stock.length ? ` Stock lines left in: ${found.stock.join("; ")}.` : ""}`);

if (dry) { console.log(JSON.stringify(draft, null, 2)); finish("Dry run: nothing written."); }

const slug = existing ? existing.slug : slugify(draft.title);
if (problems.length) {
  await mkdir(HELD, { recursive: true });
  const file = join(HELD, `${today}-${slug}.json`);
  await writeFile(file, JSON.stringify({ subject, problems, draft, sources: notesPack.sources }, null, 2) + "\n", "utf8");
  await notifyCory(`CrimeTimeSnacks blog: held "${draft.title || subject.subject}" (${problems.join("; ")}). Not published. Draft saved at ${file}.`);
  finish(`Held. Draft saved to ${file}.`);
}
if (!existing && blog.posts.some((p) => p.slug === slug)) finish(`A post with slug "${slug}" already exists. Nothing published.`, 1);

const kase = live.find((c) => c.slug === subject.caseSlug);
function relatedCasesFor(d) {
  const text = [d.title, ...d.body].join(" ").toLowerCase();
  return live.filter((c) => c.episode_slug && episodes.some((e) => e.slug === c.episode_slug))
    .filter((c) => { const name = c.title.split(":")[0].replace(/^the\s+/i, "").trim().toLowerCase(); return name.length > 4 && text.includes(name); })
    .map((c) => c.slug).slice(0, 4);
}
const post = {
  slug,
  title: draft.title,
  date: existing ? existing.date : today,
  ...(existing ? { updated: today } : {}),
  category,
  categoryLabel: CATEGORIES[category],
  image: existing && existing.image !== "images/logo.png" ? existing.image : (kase?.image || "images/logo.png"),
  author: blog.meta?.author || "Cory",
  featured: false,
  excerpt: draft.excerpt || clip(draft.body.find((b) => !b.startsWith("## ")) || ""),
  body: draft.body,
  sourceTopic: subject.sourceTopic || null,
  caseSlug: subject.caseSlug || null,
  // A topic post links the cases it names that the show has an episode for (build-blog.mjs
  // renders them under "On the show").
  ...(!subject.caseSlug ? { relatedCases: relatedCasesFor(draft) } : {}),
  sources: notesPack.sources,
};
if (existing) blog.posts[blog.posts.indexOf(existing)] = post; else blog.posts.unshift(post);
await writeFile(blogPath, JSON.stringify(blog, null, 2) + "\n", "utf8");
console.log(`${existing ? "Rewrote" : "Added"} post: ${post.title} (${slug}), ${words} words`);
try {
  const { logImprovement } = await import("./ledger.mjs");
  await logImprovement(`${existing ? "Expanded" : "Published"} blog post from research notes: "${post.title}" (${words} words, ${post.sources.length} sources)`);
} catch { /* ledger optional */ }

const r = spawnSync(process.execPath, [join(__dirname, "build-all.mjs")], { stdio: "inherit", cwd: ROOT });
if (r.status !== 0) process.exit(r.status ?? 1);
if (commit) {
  // Until 2026-10-06 this was "git add -A", which swept in whatever else was dirty: an
  // episode publish half-way through, another session's edits. Now: the post's own data,
  // plus files this run's rebuild changed that were clean when it started. Audio and studio
  // working files are never staged from here.
  const mine = new Set(["automation/blog.json", "automation/improvements.md"]);
  for (const f of gitDirty()) if (!dirtyBefore.has(f) && !/^(audio\/|automation\/studio\/)/.test(f)) mine.add(f);
  const paths = [...mine].filter((f) => gitDirty().has(f));
  if (paths.length) {
    spawnSync("git", ["add", "--", ...paths], { cwd: ROOT, stdio: "inherit" });
    spawnSync("git", ["commit", "-m", `Blog: ${existing ? "expand" : "add"} "${post.title}"`, "--", ...paths], { cwd: ROOT, stdio: "inherit" });
  }
}
console.log("Done.");
