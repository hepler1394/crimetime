#!/usr/bin/env node
// Generates blog.html + blog-posts/*.html from blog.json and refreshes the
// homepage BLOG-PREVIEW region. Uses the shared 2026 shell (shell.mjs).
// Run: node automation/build-blog.mjs

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

  return `${head({
    title: "Crime Blog | CrimeTimeSnacks",
    description: "The latest true crime news, case updates, and analysis from CrimeTimeSnacks.",
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
            <p>Case updates, analysis, and the stories behind the headlines &mdash; written in-house, checked against sources.</p>
        </div>
    </section>

${tape()}

    <section class="container">
        <div class="category-filters" style="display:flex;justify-content:center;flex-wrap:wrap;gap:0.7rem;margin-bottom:2rem;">
            <button class="category-btn active" data-category="all">All Posts</button>
            <button class="category-btn" data-category="breaking">Breaking</button>
            <button class="category-btn" data-category="court">Court</button>
            <button class="category-btn" data-category="investigation">Investigations</button>
            <button class="category-btn" data-category="analysis">Analysis</button>
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
            <p style="color:var(--cts-muted);max-width:52ch;margin-top:0.8rem;">New posts, new episodes, and the live board &mdash; twice a week, no spam.</p>
            <form class="newsletter-form" onsubmit="return false;">
                <input type="email" inputmode="email" autocomplete="email" placeholder="Your email address" aria-label="Email address">
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
    "@type": "NewsArticle",
    headline: p.title,
    description: p.excerpt,
    image: `${SITE}${img(p)}`,
    datePublished: p.date,
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

function postPage(p, posts) {
  const paras = p.body.map((t) => `        <p style="color:var(--cts-muted);line-height:1.9;font-size:1.03rem;margin-bottom:1.3rem;">${esc(t)}</p>`).join("\n");
  const articleMeta = `\n    <meta property="article:published_time" content="${p.date}">\n    <meta property="article:author" content="${esc(p.author)}">`;
  const more = posts.filter((x) => x.slug !== p.slug).slice(0, 3);
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
            <p class="episode-date" style="justify-content:center;margin-top:0.7rem;"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${fmtDate(p.date)} &nbsp;&middot;&nbsp; ${esc(p.author)}</p>
        </div>
    </section>

    <div class="container" style="max-width:780px;margin:3rem auto;">
        <img src="${esc(img(p))}" alt="${esc(p.title)}" decoding="async" style="width:100%;border-radius:16px;margin-bottom:2.2rem;border:1px solid var(--cts-line-strong);box-shadow:var(--shadow-2);">
${paras}
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
const homeUpdated = await updateHomePreview(posts);
console.log(
  `blog.html + ${posts.length} post pages generated.` +
    (homeUpdated ? " Homepage preview refreshed." : " (homepage markers not found)")
);
