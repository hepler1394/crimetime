#!/usr/bin/env node
// Generates episodes.html from episodes.json (the real imported feed).
// Run: node automation/build-episodes.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CSS = "/css/style.css?v=2026f";
const FA = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css";
const FONTS =
  "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&family=Roboto:wght@300;400;500;700&display=swap";
const APPLE = "https://podcasts.apple.com/us/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const fmtDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";
const fmtDur = (d) => (d ? d.replace(/^00:/, "") : "");

const header = (active) => `    <header>
        <div class="nav-container container">
            <div class="logo-container">
                <a href="/index.html"><img src="/images/logo.png" alt="CrimeTimeSnacks Logo" height="40"></a>
            </div>
            <button id="mobile-menu-btn" class="mobile-menu-btn"><i class="fas fa-bars"></i></button>
            <nav>
                <ul class="nav-menu">
                    <li><a href="/index.html"><i class="fas fa-home"></i> Home</a></li>
                    <li><a href="/episodes.html"${active === "episodes" ? ' class="active"' : ""}><i class="fas fa-microphone"></i> Episodes</a></li>
                    <li><a href="/videos.html"><i class="fas fa-video"></i> Videos</a></li>
                    <li><a href="/blog.html"><i class="fas fa-newspaper"></i> Blog</a></li>
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

const footer = (p) => `    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div>
                    <img src="/images/logo.png" alt="CrimeTimeSnacks Logo" class="footer-logo">
                    <p>A true crime podcast exploring unsolved cases and mysteries with detailed analysis and compelling storytelling.</p>
                    <div class="footer-social">
                        <a href="${p.spotifyUrl}"><i class="fab fa-spotify"></i></a>
                        <a href="${APPLE}"><i class="fab fa-apple"></i></a>
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
                        <li><a href="${APPLE}"><i class="fab fa-apple"></i> Apple Podcasts</a></li>
                        <li><a href="${p.spotifyUrl}"><i class="fab fa-spotify"></i> Spotify</a></li>
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
            <div class="footer-bottom"><p>&copy; ${new Date().getFullYear()} CrimeTimeSnacks. All Rights Reserved.</p></div>
        </div>
    </footer>`;

const epUrl = (ep) => `/episodes/${ep.slug}.html`;

function card(p, ep) {
  return `            <article class="episode-card" style="max-width:860px;margin:0 auto 2.5rem;">
                <a href="${epUrl(ep)}"><img src="${esc(ep.image)}" alt="${esc(ep.title)}" class="episode-image" loading="lazy" style="height:auto;aspect-ratio:1/1;object-fit:cover;"></a>
                <div class="episode-content">
                    <div class="episode-badges" style="margin-bottom:0.5rem;">
                        <span class="episode-badge">True Crime</span>
                        ${ep.duration ? `<span class="episode-badge">${esc(fmtDur(ep.duration))}</span>` : ""}
                    </div>
                    <h3 class="episode-title"><a href="${epUrl(ep)}" style="color:inherit;text-decoration:none;">${esc(ep.title)}</a></h3>
                    <p class="episode-date"><i class="far fa-calendar-alt"></i> ${esc(fmtDate(ep.date))}</p>
                    <p class="episode-description">${esc(ep.description)}</p>
                    <audio controls preload="none" style="width:100%;margin:1rem 0;">
                        <source src="${esc(ep.audio)}" type="${esc(ep.audioType)}">
                        Your browser does not support the audio element.
                    </audio>
                    <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                        <a href="${ep.link || p.spotifyUrl}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fab fa-spotify"></i> Listen on Spotify</a>
                        <a href="${APPLE}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fab fa-apple"></i> Apple Podcasts</a>
                    </div>
                </div>
            </article>`;
}

function page({ podcast: p, episodes }) {
  const sorted = [...episodes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Episodes | CrimeTimeSnacks • A True Crime Podcast</title>
    <meta name="description" content="Every episode of CrimeTimeSnacks — true crime cases explored in detail. Listen here, on Spotify, or on Apple Podcasts.">
    <link rel="canonical" href="${p.siteUrl}/episodes.html">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="Episodes | CrimeTimeSnacks">
    <meta property="og:description" content="Every episode of CrimeTimeSnacks — true crime cases explored in detail.">
    <meta property="og:url" content="${p.siteUrl}/episodes.html">
    <meta property="og:image" content="${p.siteUrl}/images/logo.png">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="apple-touch-icon" href="/images/logo.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="${FA}">
    <link rel="stylesheet" href="${CSS}">
</head>
<body>
${header("episodes")}

    <section class="hero" style="padding: 5rem 0;">
        <div class="container">
            <div class="hero-content" style="text-align:center;">
                <p class="hero-eyebrow" style="text-align:center;">${esc(episodes.length)} Episodes</p>
                <h1>Crime<span class="text-red">Time</span>Snacks Episodes</h1>
                <p>Every case, explored in detail. Listen below, or on your favorite app.</p>
            </div>
        </div>
    </section>

    <div class="crime-scene-tape"></div>

    <section class="container" style="padding-top:3rem;">
${sorted.map((ep) => card(p, ep)).join("\n")}
    </section>

${footer(p)}

    <script src="/js/main.js"></script>
</body>
</html>
`;
}

function episodeLd(p, ep) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: ep.title,
    datePublished: ep.date,
    description: ep.excerpt || ep.description,
    associatedMedia: { "@type": "MediaObject", contentUrl: ep.audio },
    partOfSeries: { "@type": "PodcastSeries", name: "CrimeTimeSnacks", url: `${p.siteUrl}/` },
    url: `${p.siteUrl}${epUrl(ep)}`,
  };
  return `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n    </script>`;
}

function episodePage(p, ep) {
  const desc = (ep.excerpt || ep.description || "").slice(0, 200);
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(ep.title)} | CrimeTimeSnacks</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${p.siteUrl}${epUrl(ep)}">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="${esc(ep.title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:url" content="${p.siteUrl}${epUrl(ep)}">
    <meta property="og:image" content="${esc(ep.image)}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="apple-touch-icon" href="/images/logo.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="${FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="${FA}">
    <link rel="stylesheet" href="${CSS}">
    ${episodeLd(p, ep)}
</head>
<body>
${header("episodes")}

    <section class="episode-header">
        <div class="container">
            <div class="episode-badges" style="justify-content:center;display:flex;margin-bottom:0.75rem;">
                <span class="episode-badge">True Crime</span>
                ${ep.duration ? `<span class="episode-badge">${esc(fmtDur(ep.duration))}</span>` : ""}
            </div>
            <h1 class="episode-title" style="color:var(--cts-white);text-align:center;">${esc(ep.title)}</h1>
            <p class="episode-date" style="justify-content:center;"><i class="far fa-calendar-alt"></i> ${esc(fmtDate(ep.date))} &nbsp;&middot;&nbsp; ${esc(p.author)}</p>
        </div>
    </section>

    <main class="container" style="max-width:780px;margin:2.5rem auto;">
        <img src="${esc(ep.image)}" alt="${esc(ep.title)}" style="width:100%;max-width:460px;display:block;margin:0 auto 2rem;border-radius:8px;box-shadow:var(--cts-box-shadow);">
        <audio controls preload="none" style="width:100%;margin:0 0 1.5rem;">
            <source src="${esc(ep.audio)}" type="${esc(ep.audioType)}">
            Your browser does not support the audio element.
        </audio>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-bottom:2rem;">
            <a href="${ep.link || p.spotifyUrl}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fab fa-spotify"></i> Listen on Spotify</a>
            <a href="${APPLE}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fab fa-apple"></i> Apple Podcasts</a>
        </div>
        <p style="color:#ddd;line-height:1.8;">${esc(ep.description)}</p>
        <div style="margin-top:2.5rem;">
            <a href="/episodes.html" class="btn btn-secondary"><i class="fas fa-arrow-left"></i> All Episodes</a>
        </div>
    </main>

${footer(p)}

    <script src="/js/main.js"></script>
</body>
</html>
`;
}

// ---- Homepage "Latest Episode" + "Recent Episodes" (real feed) ----
const trunc = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

function homeRecentCard(p, ep) {
  return `                <div class="episode-card" data-categories="true-crime">
                    <img src="${esc(ep.image)}" alt="${esc(ep.title)}" class="episode-image" loading="lazy">
                    <div class="episode-content">
                        <div class="episode-badges">
                            <span class="episode-badge">True Crime</span>
                            ${ep.duration ? `<span class="episode-badge">${esc(fmtDur(ep.duration))}</span>` : ""}
                        </div>
                        <h3 class="episode-title">${esc(ep.title)}</h3>
                        <p class="episode-date"><i class="far fa-calendar-alt"></i> ${esc(fmtDate(ep.date))}</p>
                        <p class="episode-description">${esc(trunc(ep.description, 150))}</p>
                        <div class="episode-actions">
                            <a href="${epUrl(ep)}" class="btn btn-primary">Listen Now</a>
                            <div class="episode-stats"><span><i class="far fa-clock"></i> ${esc(fmtDur(ep.duration))}</span></div>
                        </div>
                    </div>
                </div>`;
}

function homeBlock({ podcast: p, episodes }) {
  const sorted = [...episodes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const latest = sorted[0];
  const recent = sorted.slice(1, 4);
  return `    <!-- HOME-EPISODES:START (auto-filled by automation/build-episodes.mjs) -->
    <!-- Latest Episode Section -->
    <section id="latest-episode" class="container">
        <h2 class="slide-in-left animate-on-scroll" style="text-align: center; margin-bottom: 2rem;">Latest Episode</h2>
        <article class="episode-card" style="max-width: 820px; margin: 0 auto;">
            <img src="${esc(latest.image)}" alt="${esc(latest.title)}" class="episode-image" style="height:auto;aspect-ratio:1/1;object-fit:cover;max-height:380px;">
            <div class="episode-content">
                <div class="episode-badges" style="margin-bottom: 0.5rem;">
                    <span class="episode-badge">True Crime</span>
                    ${latest.duration ? `<span class="episode-badge">${esc(fmtDur(latest.duration))}</span>` : ""}
                </div>
                <h3 class="episode-title">${esc(latest.title)}</h3>
                <p class="episode-date"><i class="far fa-calendar-alt"></i> ${esc(fmtDate(latest.date))}</p>
                <p class="episode-description">${esc(latest.description)}</p>
                <audio controls preload="none" style="width:100%;margin:1rem 0;">
                    <source src="${esc(latest.audio)}" type="${esc(latest.audioType)}">
                    Your browser does not support the audio element.
                </audio>
                <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                    <a href="${latest.link || p.spotifyUrl}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fab fa-spotify"></i> Listen on Spotify</a>
                    <a href="${APPLE}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fab fa-apple"></i> Apple Podcasts</a>
                </div>
            </div>
        </article>
    </section>

    <!-- Crime Scene Tape -->
    <div class="crime-scene-tape"></div>

    <!-- Recent Episodes Section -->
    <section class="container">
        <h2 class="slide-in-left animate-on-scroll" style="text-align: center; margin-bottom: 2rem;">Recent Episodes</h2>
        <div class="episode-grid">
${recent.map((ep) => homeRecentCard(p, ep)).join("\n")}
        </div>
        <div style="text-align: center; margin-top: 2rem;">
            <a href="episodes.html" class="btn btn-secondary">View All Episodes</a>
        </div>
    </section>
    <!-- HOME-EPISODES:END -->`;
}

async function updateHome(data) {
  const indexPath = join(ROOT, "index.html");
  let html;
  try { html = await readFile(indexPath, "utf8"); } catch { return false; }
  const block = homeBlock(data);
  const START = "<!-- HOME-EPISODES:START (auto-filled by automation/build-episodes.mjs) -->";
  const END = "<!-- HOME-EPISODES:END -->";
  const i = html.indexOf(START);
  const j = html.indexOf(END);
  if (i !== -1 && j !== -1) {
    // Replace existing marker region (preserve indentation before START).
    const lineStart = html.lastIndexOf("\n", i) + 1;
    html = html.slice(0, lineStart) + block + html.slice(j + END.length);
  } else {
    // One-time migration: replace the hand-written sections between these anchors.
    const a = html.indexOf("<!-- Latest Episode Section -->");
    const b = html.indexOf("<!-- AI Blog Preview Section -->");
    if (a === -1 || b === -1) return false;
    const lineStart = html.lastIndexOf("\n", a) + 1;
    html = html.slice(0, lineStart) + block + "\n\n    " + html.slice(b);
  }
  await writeFile(indexPath, html, "utf8");
  return true;
}

const data = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
await writeFile(join(ROOT, "episodes.html"), page(data), "utf8");
await mkdir(join(ROOT, "episodes"), { recursive: true });
for (const ep of data.episodes) {
  await writeFile(join(ROOT, "episodes", `${ep.slug}.html`), episodePage(data.podcast, ep), "utf8");
}
const home = await updateHome(data);
console.log(
  `episodes.html + ${data.episodes.length} episode pages generated.` +
    (home ? " Homepage episodes refreshed." : " (home markers not found)")
);
