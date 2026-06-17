#!/usr/bin/env node
// Generates the blog from blog.json: a static blog.html (featured + grid) and
// one page per post under /blog-posts/. No client-side AI, no exposed keys.
//
// Automated workflow: add a post object to blog.json (eventually written by the
// AI pipeline / Hermes), run `node automation/build-blog.mjs`, deploy. Matches
// the existing CrimeTimeSnacks design exactly.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSS = "/css/style.css?v=2026c";
const FA = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css";
const FONTS =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Roboto:wght@300;400;500;700&display=swap";

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const fmtDate = (iso) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

const SITE = "https://crimetime.vercel.app";
const head = (title, desc, path = "/", image = "/images/logo.png", extra = "") => `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${SITE}${path}">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${SITE}${path}">
    <meta property="og:image" content="${SITE}${image}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${SITE}${image}">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="apple-touch-icon" href="/images/logo.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="${FA}">
    <link rel="stylesheet" href="${CSS}">${extra}
</head>`;

const header = (active) => `    <header>
        <div class="nav-container container">
            <div class="logo-container">
                <a href="/index.html"><img src="/images/logo.png" alt="CrimeTimeSnacks Logo" height="40"></a>
            </div>
            <button id="mobile-menu-btn" class="mobile-menu-btn"><i class="fas fa-bars"></i></button>
            <nav>
                <ul class="nav-menu">
                    <li><a href="/index.html"><i class="fas fa-home"></i> Home</a></li>
                    <li><a href="/episodes.html"><i class="fas fa-microphone"></i> Episodes</a></li>
                    <li><a href="/videos.html"><i class="fas fa-video"></i> Videos</a></li>
                    <li><a href="/blog.html"${active === "blog" ? ' class="active"' : ""}><i class="fas fa-newspaper"></i> Blog</a></li>
                    <li><a href="/about.html"><i class="fas fa-info-circle"></i> About</a></li>
                    <li><a href="/merch.html"><i class="fas fa-tshirt"></i> Merch</a></li>
                    <li><a href="/contact.html"><i class="fas fa-envelope"></i> Contact</a></li>
                </ul>
            </nav>
            <div class="utility-nav">
                <button id="dark-mode-toggle"><i class="fas fa-moon"></i></button>
            </div>
        </div>
    </header>`;

const footer = () => `    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div>
                    <img src="/images/logo.png" alt="CrimeTimeSnacks Logo" class="footer-logo">
                    <p>A true crime podcast exploring unsolved cases and mysteries with detailed analysis and compelling storytelling.</p>
                    <div class="footer-social">
                        <a href="#"><i class="fab fa-facebook-f"></i></a>
                        <a href="#"><i class="fab fa-instagram"></i></a>
                        <a href="#"><i class="fab fa-spotify"></i></a>
                        <a href="https://podcasts.apple.com/gb/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400"><i class="fab fa-apple"></i></a>
                    </div>
                </div>
                <div>
                    <h3 class="footer-heading">Quick Links</h3>
                    <ul class="footer-links">
                        <li><a href="/index.html"><i class="fas fa-chevron-right"></i> Home</a></li>
                        <li><a href="/episodes.html"><i class="fas fa-chevron-right"></i> Episodes</a></li>
                        <li><a href="/blog.html"><i class="fas fa-chevron-right"></i> Blog</a></li>
                        <li><a href="/about.html"><i class="fas fa-chevron-right"></i> About</a></li>
                        <li><a href="/contact.html"><i class="fas fa-chevron-right"></i> Contact</a></li>
                    </ul>
                </div>
                <div>
                    <h3 class="footer-heading">Listen On</h3>
                    <ul class="footer-links">
                        <li><a href="https://podcasts.apple.com/gb/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400"><i class="fab fa-apple"></i> Apple Podcasts</a></li>
                        <li><a href="#"><i class="fab fa-spotify"></i> Spotify</a></li>
                        <li><a href="/feed.xml"><i class="fas fa-rss"></i> RSS Feed</a></li>
                    </ul>
                </div>
                <div class="footer-newsletter">
                    <h3 class="footer-heading">Newsletter</h3>
                    <p>Subscribe for the latest episodes and updates.</p>
                    <input type="email" placeholder="Your Email Address">
                    <button class="btn btn-primary" style="width: 100%;">Subscribe</button>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${new Date().getFullYear()} CrimeTimeSnacks. All Rights Reserved.</p>
            </div>
        </div>
    </footer>`;

const postUrl = (p) => `/blog-posts/${p.slug}.html`;

function card(p) {
  return `                <div class="blog-card" data-category="${esc(p.category)}">
                    <a href="${postUrl(p)}"><img src="/${esc(p.image)}" alt="${esc(p.title)}" class="blog-image" loading="lazy"></a>
                    <div class="blog-content">
                        <div class="blog-tags"><span class="blog-tag">${esc(p.categoryLabel)}</span></div>
                        <h3 class="blog-title"><a href="${postUrl(p)}" style="color:inherit;text-decoration:none;">${esc(p.title)}</a></h3>
                        <p class="blog-date"><i class="far fa-calendar-alt"></i> ${fmtDate(p.date)}</p>
                        <p class="blog-excerpt">${esc(p.excerpt)}</p>
                        <a href="${postUrl(p)}" class="btn btn-primary">Read More</a>
                    </div>
                </div>`;
}

function featured(p) {
  return `        <div style="display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:center;background-color:var(--cts-medium-gray);border-radius:8px;overflow:hidden;box-shadow:var(--cts-box-shadow);">
            <img src="/${esc(p.image)}" alt="${esc(p.title)}" style="width:100%;height:100%;min-height:320px;object-fit:cover;">
            <div style="padding:2rem;">
                <div class="blog-tags"><span class="blog-tag">${esc(p.categoryLabel)}</span></div>
                <h3 style="font-size:2rem;margin:0.5rem 0;"><a href="${postUrl(p)}" style="color:var(--cts-white);text-decoration:none;">${esc(p.title)}</a></h3>
                <p class="blog-date"><i class="far fa-calendar-alt"></i> ${fmtDate(p.date)}</p>
                <p style="color:#ddd;margin:1rem 0 1.5rem;">${esc(p.excerpt)}</p>
                <a href="${postUrl(p)}" class="btn btn-primary">Read Full Post</a>
            </div>
        </div>`;
}

function blogPage(posts) {
  const feat = posts.find((p) => p.featured) || posts[0];
  const rest = posts.filter((p) => p !== feat);
  return `<!DOCTYPE html>
<html lang="en">
${head("Crime Blog | CrimeTimeSnacks", "The latest true crime news, case updates, and analysis from CrimeTimeSnacks.", "/blog.html")}
<body>
${header("blog")}

    <section class="hero" style="padding: 5rem 0;">
        <div class="container">
            <div class="hero-content" style="text-align:center;">
                <h1>Crime<span class="text-red">Time</span>Snacks Blog</h1>
                <p>Case updates, analysis, and the stories behind the headlines</p>
            </div>
        </div>
    </section>

    <div class="crime-scene-tape"></div>

    <section class="container">
        <div class="category-filters" style="display:flex;justify-content:center;flex-wrap:wrap;gap:1rem;margin-bottom:2rem;">
            <button class="category-btn active" data-category="all">All Posts</button>
            <button class="category-btn" data-category="breaking">Breaking</button>
            <button class="category-btn" data-category="court">Court</button>
            <button class="category-btn" data-category="investigation">Investigations</button>
            <button class="category-btn" data-category="analysis">Analysis</button>
        </div>
    </section>

    <section class="container">
        <h2 style="text-align:center;margin-bottom:2rem;">Featured Post</h2>
${featured(feat)}
    </section>

    <div class="crime-scene-tape"></div>

    <section class="container">
        <h2 style="text-align:center;margin-bottom:2rem;">Latest Posts</h2>
        <div class="blog-grid" id="blog-posts">
${rest.map(card).join("\n")}
        </div>
    </section>

    <section class="container" style="margin-top:5rem;background-color:var(--cts-dark-gray);padding:3rem;border-radius:8px;">
        <h2 style="text-align:center;">Get Crime Updates in Your Inbox</h2>
        <p style="text-align:center;max-width:600px;margin:0 auto 2rem auto;">Subscribe to receive the latest case updates and exclusive content.</p>
        <form style="max-width:500px;margin:0 auto;" onsubmit="return false;">
            <div style="display:flex;gap:1rem;">
                <input type="email" placeholder="Your Email Address" style="flex-grow:1;padding:0.8rem;border:none;border-radius:8px;">
                <button type="submit" class="btn btn-primary" style="white-space:nowrap;">Subscribe</button>
            </div>
        </form>
    </section>

${footer()}

    <script src="/js/main.js"></script>
    <script>
      // Static category filtering (replaces the old client-side AI blog script).
      document.querySelectorAll('.category-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var cat = this.getAttribute('data-category');
          document.querySelectorAll('.category-btn').forEach(function (b) { b.classList.remove('active'); });
          this.classList.add('active');
          document.querySelectorAll('.blog-card').forEach(function (c) {
            c.style.display = (cat === 'all' || c.getAttribute('data-category') === cat) ? 'flex' : 'none';
          });
        });
      });
    </script>
</body>
</html>
`;
}

function articleLd(p) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: p.title,
    description: p.excerpt,
    image: `${SITE}/${p.image}`,
    datePublished: p.date,
    author: { "@type": "Person", name: p.author },
    publisher: {
      "@type": "Organization",
      name: "CrimeTimeSnacks",
      logo: { "@type": "ImageObject", url: `${SITE}/images/logo.png` },
    },
    mainEntityOfPage: `${SITE}${postUrl(p)}`,
  };
  return `\n    <script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n    </script>`;
}

function postPage(p) {
  const paras = p.body.map((t) => `        <p>${esc(t)}</p>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
${head(`${p.title} | CrimeTimeSnacks Blog`, p.excerpt, postUrl(p), `/${p.image}`, articleLd(p))}
<body>
${header("blog")}

    <section class="episode-header">
        <div class="container">
            <div class="blog-tags" style="justify-content:center;display:flex;margin-bottom:0.75rem;"><span class="blog-tag">${esc(p.categoryLabel)}</span></div>
            <h1 class="episode-title" style="color:var(--cts-white);">${esc(p.title)}</h1>
            <p class="episode-date" style="justify-content:center;"><i class="far fa-calendar-alt"></i> ${fmtDate(p.date)} &nbsp;&middot;&nbsp; ${esc(p.author)}</p>
        </div>
    </section>

    <main class="container" style="max-width:760px;margin:3rem auto;">
        <img src="/${esc(p.image)}" alt="${esc(p.title)}" style="width:100%;border-radius:8px;margin-bottom:2rem;box-shadow:var(--cts-box-shadow);">
${paras}
        <div style="margin-top:2.5rem;">
            <a href="/blog.html" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> All Posts</a>
        </div>
    </main>

${footer()}

    <script src="/js/main.js"></script>
</body>
</html>
`;
}

// Homepage preview card uses relative paths (index.html lives at the root).
function previewCard(p) {
  const url = `blog-posts/${p.slug}.html`;
  return `            <div class="blog-card">
                <a href="${url}"><img src="${esc(p.image)}" alt="${esc(p.title)}" class="blog-image" loading="lazy"></a>
                <div class="blog-content">
                    <div class="blog-tags"><span class="blog-tag">${esc(p.categoryLabel)}</span></div>
                    <h3 class="blog-title">${esc(p.title)}</h3>
                    <p class="blog-date"><i class="far fa-calendar-alt"></i> ${fmtDate(p.date)}</p>
                    <p class="blog-excerpt">${esc(p.excerpt)}</p>
                    <a href="${url}" class="btn btn-primary">Read More</a>
                </div>
            </div>`;
}

// Refresh the homepage "Latest from the Crime Blog" region between markers,
// leaving the rest of index.html untouched.
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
  await writeFile(join(ROOT, "blog-posts", `${p.slug}.html`), postPage(p), "utf8");
}
const homeUpdated = await updateHomePreview(posts);
console.log(
  `blog.html + ${posts.length} post pages generated.` +
    (homeUpdated ? " Homepage preview refreshed." : " (homepage markers not found)")
);
