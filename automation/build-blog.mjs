#!/usr/bin/env node
// Generates blog.html + blog-posts/*.html from blog.json and refreshes the
// homepage BLOG-PREVIEW region. Uses the shared 2026 shell (shell.mjs).
// Run: node automation/build-blog.mjs [--no-home]

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const fmtDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";
const postUrl = (p) => `/blog-posts/${p.slug}.html`;
const img = (p) => (p.image.startsWith("/") ? p.image : `/${p.image}`);
const readingTime = (p) =>
  Math.max(1, Math.round(p.body.join(" ").split(/\s+/).length / 220));

// Filter-button labels, in display order. ai-write.mjs writes the same category keys.
const CATEGORY_LABELS = { breaking: "Breaking", court: "Court", investigation: "Investigations", analysis: "Analysis", updates: "Case Updates" };

const readJson = async (p, fb) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return fb; } };
const liveCases = Object.fromEntries(((await readJson(join(__dirname, "cases-live.json"), {})).cases || []).map((c) => [c.slug, c]));
const epBySlug = Object.fromEntries(((await readJson(join(__dirname, "episodes.json"), {})).episodes || []).map((e) => [e.slug, e]));

/* ------------------------------------------------------------------ cards */
function card(p) {
  return `                <div class="blog-card" data-category="${esc(p.category)}">
                    <a href="${postUrl(p)}"><img src="${esc(img(p))}" alt="${esc(p.title)}" class="blog-image" loading="lazy" decoding="async" width="640" height="360"></a>
                    <div class="blog-content">
                        <div class="blog-tags"><span class="blog-tag">${esc(p.categoryLabel)}</span><span class="blog-tag">${readingTime(p)} min read</span></div>
                        <h3 class="blog-title"><a href="${postUrl(p)}" style="color:inherit;text-decoration:none;">${esc(p.title)}</a></h3>
                        <p class="blog-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${fmtDate(p.date)}</p>
                        <p class="blog-excerpt">${esc(p.excerpt)}</p>
                        <div><a href="${postUrl(p)}" class="btn btn-primary btn-sm">Read More</a></div>
                    </div>
                </div>`;
}

function featured(p) {
  return `        <article class="spotlight">
            <div class="spotlight-media">
                <img src="${esc(img(p))}" alt="${esc(p.title)}" loading="lazy">
            </div>
            <div class="spotlight-body">
                <div class="blog-tags"><span class="blog-tag">${esc(p.categoryLabel)}</span><span class="blog-tag">${readingTime(p)} min read</span></div>
                <h3><a href="${postUrl(p)}" style="color:inherit;text-decoration:none;">${esc(p.title)}</a></h3>
                <p class="blog-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${fmtDate(p.date)}</p>
                <p class="episode-description">${esc(p.excerpt)}</p>
                <div><a href="${postUrl(p)}" class="btn btn-primary">Read Full Post</a></div>
            </div>
        </article>`;
}

/* -------------------------------------------------------------- blog.html */
function blogPage(posts) {
  const feat = posts.find((p) => p.featured) || posts[0];
  const rest = posts.filter((p) => p !== feat);
  const blogLd = `\n    <script type="application/ld+json">\n${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "CrimeTimeSnacks Blog",
    url: `${SITE}/blog.html`,
    blogPost: posts.slice(0, 20).map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      datePublished: p.date,
      url: `${SITE}${postUrl(p)}`,
      author: { "@type": "Person", name: p.author },
    })),
  }, null, 2)}\n    </script>`;

  // Only the categories that have posts get a filter button: a "Breaking" button over no
  // breaking posts filtered the page to nothing.
  const present = Object.keys(CATEGORY_LABELS).filter((c) => posts.some((p) => p.category === c));
  return `${head({
    title: "Crime Blog | CrimeTimeSnacks",
    description: "True crime case explainers and court updates from CrimeTimeSnacks, written from research notes and published with their sources.",
    canonicalPath: "/blog.html",
    extraHead: blogLd,
  })}
<body>
${header("blog")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">Case Updates &middot; Analysis &middot; The Details</p>
            <h1 class="page-title">The Crime <span class="text-red">Blog</span></h1>
            <p>Case updates, analysis, and the stories behind the headlines. Each post is written from research notes, checked against them, and published with its sources listed.</p>
        </div>
    </section>

${tape()}

    <section class="container">
        <div class="category-filters" style="display:flex;justify-content:center;flex-wrap:wrap;gap:0.7rem;margin-bottom:2rem;">
            <button class="category-btn active" data-category="all">All Posts</button>
${present.map((c) => `            <button class="category-btn" data-category="${c}">${CATEGORY_LABELS[c]}</button>`).join("\n")}
        </div>
    </section>

    <section class="container">
        <div class="section-head">
            <span class="file-no">Pinned</span>
            <h2>Featured Post</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
${featured(feat)}
    </section>

    <section class="container" style="margin-top:3.4rem;">
        <div class="section-head">
            <span class="file-no">Archive</span>
            <h2>Latest Posts</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="blog-grid" id="blog-posts">
${rest.map(card).join("\n")}
        </div>
    </section>

    <section class="container" style="margin-top:4.4rem;">
        <div class="newsletter-block">
            <p class="eyebrow">The Case File</p>
            <h2>Get Case Updates in Your Inbox</h2>
            <p style="color:var(--cts-muted);max-width:52ch;margin-top:0.8rem;">The week's new episodes and posts, plus updates on the cases you follow. One email, Sundays.</p>
            <form class="newsletter-form">
                <input type="email" inputmode="email" autocomplete="email" required placeholder="Your email address" aria-label="Email address">
                <button type="submit" class="btn btn-primary" style="white-space:nowrap;">Get the Case File</button>
            </form>
        </div>
    </section>
    </main>

${footer()}

${scripts()}
    <script>
      // Static category filtering.
      document.querySelectorAll('.category-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cat = this.getAttribute('data-category');
          document.querySelectorAll('.category-btn').forEach(function (b) { b.classList.remove('active'); });
          this.classList.add('active');
          document.querySelectorAll('.blog-card').forEach(function (c) {
            c.style.display = (cat === 'all' || c.getAttribute('data-category') === cat) ? '' : 'none';
          });
        });
      });
    </script>
</body>
</html>
`;
}

/* -------------------------------------------------------------- post pages */
function articleLd(p) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.excerpt,
    image: `${SITE}${img(p)}`,
    datePublished: p.date,
    dateModified: p.updated || p.date,
    author: { "@type": "Person", name: p.author },
    publisher: {
      "@type": "Organization",
      name: "CrimeTimeSnacks",
      logo: { "@type": "ImageObject", url: `${SITE}/images/logo.png` },
    },
    mainEntityOfPage: `${SITE}${postUrl(p)}`,
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog.html` },
      { "@type": "ListItem", position: 3, name: p.title, item: `${SITE}${postUrl(p)}` },
    ],
  };
  return `\n    <script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n    </script>\n    <script type="application/ld+json">\n${JSON.stringify(crumbs)}\n    </script>`;
}

function shareRow(url, title) {
  return `        <div class="share-row">
            <span class="label">Share this post</span>
            <button class="share-btn" data-copy="${esc(url)}"><i class="fas fa-link" aria-hidden="true"></i> Copy Link</button>
            <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><i class="fab fa-x-twitter" aria-hidden="true"></i> Post</a>
            <a class="share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"><i class="fab fa-facebook-f" aria-hidden="true"></i> Share</a>
            <a class="share-btn" href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}"><i class="fas fa-envelope" aria-hidden="true"></i> Email</a>
        </div>`;
}

// Posts written from research notes (ai-write.mjs) carry "## " section headings, their
// sources, and the case they are about; older posts are plain paragraphs and render as before.
function caseBlock(p) {
  const kase = p.caseSlug && liveCases[p.caseSlug];
  if (!kase) return relatedBlock(p, "On the show");
  const ep = kase.episode_slug && epBySlug[kase.episode_slug];
  return `        <aside style="margin:2.4rem 0;padding:1.3rem 1.4rem;border:1px solid var(--cts-line-strong);border-radius:var(--radius);background:var(--cts-panel);">
            <p class="eyebrow" style="margin:0 0 .5rem;">The case file</p>
            <p style="margin:0 0 1rem;color:var(--cts-muted);">Follow ${esc(kase.title)} and we email you when something happens: a court date, a ruling, an arrest.${ep ? ` Or hear the whole case in the episode.` : ""}</p>
            <div style="display:flex;gap:.7rem;flex-wrap:wrap;">
                <a class="btn btn-primary btn-sm" href="/cases/${esc(kase.slug)}.html">Follow this case</a>
                ${ep ? `<a class="btn btn-secondary btn-sm" href="/episodes/${esc(ep.slug)}.html">Listen: ${esc(ep.title)}</a>` : ""}
            </div>
        </aside>
${relatedBlock(p, "Also on the show")}`;
}
// relatedCases is a list of case slugs a post names besides its own: a topic post (fingerprints,
// genealogy) is about no single case but cites ones the show has covered, and a case post can
// point at the follow-up episode (Delphi to the appeal). Rendered as links to the case page and
// its episode; unknown slugs are skipped rather than linked.
function relatedBlock(p, label) {
  const kases = (p.relatedCases || []).filter((s) => s !== p.caseSlug).map((s) => liveCases[s]).filter(Boolean);
  if (!kases.length) return "";
  const items = kases.map((k) => {
    const ep = k.episode_slug && epBySlug[k.episode_slug];
    return `                <li style="margin-bottom:.4rem;"><a href="/cases/${esc(k.slug)}.html">${esc(k.title)}</a>${ep ? ` &middot; <a href="/episodes/${esc(ep.slug)}.html">Listen to the episode</a>` : ""}</li>`;
  }).join("\n");
  return `        <aside style="margin:2.4rem 0;padding:1.3rem 1.4rem;border:1px solid var(--cts-line-strong);border-radius:var(--radius);background:var(--cts-panel);">
            <p class="eyebrow" style="margin:0 0 .5rem;">${label}</p>
            <ul style="margin:0;padding-left:1.1rem;color:var(--cts-muted);line-height:1.7;">
${items}
            </ul>
        </aside>`;
}
function sourcesBlock(p) {
  if (!p.sources?.length) return "";
  return `        <h2 style="font-family:var(--font-display);font-size:1.6rem;letter-spacing:.02em;margin:2.6rem 0 .8rem;">Sources</h2>
        <ol style="color:var(--cts-muted);line-height:1.7;padding-left:1.2rem;margin:0 0 1.6rem;">
${p.sources.map((s) => `            <li><a href="${esc(s.url)}" rel="noopener" target="_blank" style="color:var(--cts-muted);">${esc(s.title || s.url)}</a></li>`).join("\n")}
        </ol>
        <p style="color:var(--cts-muted);font-size:.92rem;margin:0 0 1.6rem;">Found an error? <a href="/contact.html" style="color:var(--cts-muted);">Tell us</a>. Corrections are dated and listed on the <a href="/corrections.html" style="color:var(--cts-muted);">corrections page</a>.</p>`;
}

// Keep Reading: posts that share a case (own or related) first, then the same category, then
// the newest.
const casesOf = (x) => new Set([x.caseSlug, ...(x.relatedCases || [])].filter(Boolean));
function relatedPosts(p, posts) {
  const others = posts.filter((x) => x.slug !== p.slug);
  const mine = casesOf(p);
  const rank = (x) => ([...casesOf(x)].some((c) => mine.has(c)) ? 0 : x.category === p.category ? 1 : 2);
  return others.map((x, i) => ({ x, i })).sort((a, b) => rank(a.x) - rank(b.x) || a.i - b.i).slice(0, 3).map((o) => o.x);
}

function postPage(p, posts) {
  const paras = p.body.map((t) => t.startsWith("## ")
    ? `        <h2 style="font-family:var(--font-display);font-size:clamp(1.6rem,3vw,2.1rem);letter-spacing:.02em;margin:2.6rem 0 1rem;color:var(--cts-white);">${esc(t.slice(3))}</h2>`
    : `        <p style="color:var(--cts-muted);line-height:1.9;font-size:1.03rem;margin-bottom:1.3rem;">${esc(t)}</p>`).join("\n");
  const articleMeta = `\n    <meta property="article:published_time" content="${p.date}">${p.updated ? `\n    <meta property="article:modified_time" content="${p.updated}">` : ""}\n    <meta property="article:author" content="${esc(p.author)}">`;
  const more = relatedPosts(p, posts);
  return `${head({
    title: `${p.title} | CrimeTimeSnacks Blog`,
    description: p.excerpt,
    canonicalPath: postUrl(p),
    ogImage: `${SITE}${img(p)}`,
    ogType: "article",
    extraHead: articleMeta + articleLd(p),
  })}
<body>
${header("blog")}
    <main id="main-content">
    <section class="episode-header">
        <div class="container">
            <div class="blog-tags" style="justify-content:center;display:flex;margin-bottom:0.9rem;"><span class="blog-tag">${esc(p.categoryLabel)}</span><span class="blog-tag">${readingTime(p)} min read</span></div>
            <h1>${esc(p.title)}</h1>
            <p class="episode-date" style="justify-content:center;margin-top:0.7rem;"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${fmtDate(p.date)}${p.updated ? ` &nbsp;&middot;&nbsp; Updated ${fmtDate(p.updated)}` : ""} &nbsp;&middot;&nbsp; ${esc(p.author)}</p>
        </div>
    </section>

    <div class="container" style="max-width:780px;margin:3rem auto;">
        <img src="${esc(img(p))}" alt="${esc(p.title)}" decoding="async" style="width:100%;border-radius:16px;margin-bottom:2.2rem;border:1px solid var(--cts-line-strong);box-shadow:var(--shadow-2);">
${paras}
${caseBlock(p)}
${sourcesBlock(p)}
${shareRow(`${SITE}${postUrl(p)}`, `${p.title} — CrimeTimeSnacks`)}
        <div style="margin-top:2.5rem;">
            <a href="/blog.html" class="btn btn-secondary"><i class="fas fa-arrow-left" aria-hidden="true"></i> All Posts</a>
        </div>
    </div>

    <section class="container" style="margin-top:3rem;">
        <div class="section-head">
            <span class="file-no">Related</span>
            <h2>Keep Reading</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="blog-grid" style="margin-top:1rem;">
${more.map(card).join("\n")}
        </div>
    </section>
    </main>

${footer()}

${scripts()}
</body>
</html>
`;
}

/* ------------------------------------------------------- homepage preview */
function previewCard(p) {
  return `            <div class="blog-card">
                <a href="${postUrl(p)}"><img src="${esc(img(p))}" alt="${esc(p.title)}" class="blog-image" loading="lazy"></a>
                <div class="blog-content">
                    <div class="blog-tags"><span class="blog-tag">${esc(p.categoryLabel)}</span></div>
                    <h3 class="blog-title">${esc(p.title)}</h3>
                    <p class="blog-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${fmtDate(p.date)}</p>
                    <p class="blog-excerpt">${esc(p.excerpt)}</p>
                    <div><a href="${postUrl(p)}" class="btn btn-primary btn-sm">Read More</a></div>
                </div>
            </div>`;
}

async function updateHomePreview(posts) {
  const indexPath = join(ROOT, "index.html");
  let html;
  try {
    html = await readFile(indexPath, "utf8");
  } catch {
    return false;
  }
  const start = "<!-- BLOG-PREVIEW:START (auto-filled by automation/build-blog.mjs) -->";
  const end = "<!-- BLOG-PREVIEW:END -->";
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1) return false;
  const cards = posts.slice(0, 3).map(previewCard).join("\n");
  const next =
    html.slice(0, i + start.length) + "\n" + cards + "\n            " + html.slice(j);
  await writeFile(indexPath, next, "utf8");
  return true;
}

const data = JSON.parse(await readFile(join(__dirname, "blog.json"), "utf8"));
const posts = [...data.posts].sort((a, b) => b.date.localeCompare(a.date));

await writeFile(join(ROOT, "blog.html"), blogPage(posts), "utf8");
await mkdir(join(ROOT, "blog-posts"), { recursive: true });
for (const p of posts) {
  await writeFile(join(ROOT, "blog-posts", `${p.slug}.html`), postPage(p, posts), "utf8");
}
// --no-home rebuilds the blog without rewriting index.html (for a blog-only rebuild while
// someone else is working on the homepage; build-all.mjs refreshes the preview).
const skipHome = process.argv.includes("--no-home");
const homeUpdated = skipHome ? false : await updateHomePreview(posts);
console.log(
  `blog.html + ${posts.length} post pages generated.` +
    (skipHome ? " Homepage preview left alone (--no-home)." : homeUpdated ? " Homepage preview refreshed." : " (homepage markers not found)")
);
