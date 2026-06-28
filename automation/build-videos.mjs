#!/usr/bin/env node
// Generates videos.html from videos.json and refreshes the homepage "Watch"
// region (between <!-- HOME-VIDEOS:START --> / <!-- HOME-VIDEOS:END -->).
// Matches the existing CrimeTimeSnacks design. No keys, no client-side AI.
// Run: node automation/build-videos.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://crimetime.vercel.app";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const data = JSON.parse(await readFile(join(__dirname, "videos.json"), "utf8"));
const all = data.videos || [];
const longs = all.filter((v) => !v.short);
const shorts = all.filter((v) => v.short);

function videoCard(v) {
  return `            <div class="video-card">
                <div class="video-container">
                    <iframe src="https://www.youtube.com/embed/${esc(v.id)}"
                            class="video"
                            title="${esc(v.title)}"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            loading="lazy"
                            allowfullscreen>
                    </iframe>
                </div>
                <div class="video-content">
                    <h3 class="video-title">${esc(v.title)}</h3>
                    <p class="video-description">${esc(v.description || "")}</p>
                </div>
            </div>`;
}

function shortCard(v) {
  return `            <div class="short-card">
                <div class="short-container">
                    <iframe src="https://www.youtube.com/embed/${esc(v.id)}"
                            class="short"
                            title="${esc(v.title)}"
                            frameborder="0"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            loading="lazy"
                            allowfullscreen>
                    </iframe>
                </div>
                <p class="short-title">${esc(v.title)}</p>
            </div>`;
}

const shortsSection = shorts.length
  ? `
    <div class="crime-scene-tape"></div>

    <section class="container">
        <h2 style="text-align: center; margin-bottom: 0.5rem;">Shorts</h2>
        <p style="text-align:center;color:#bbb;margin-bottom:1.5rem;">Quick case clips &mdash; swipe through.</p>
        <div class="shorts-rail">
${shorts.map(shortCard).join("\n")}
        </div>
    </section>
`
  : "";

const page = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Videos | CrimeTimeSnacks</title>
    <meta name="description" content="${esc(data.meta.description)}">
    <link rel="canonical" href="${SITE}/videos.html">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="Videos | CrimeTimeSnacks">
    <meta property="og:description" content="A true crime podcast exploring unsolved cases, murders, and mysteries.">
    <meta property="og:url" content="${SITE}/videos.html">
    <meta property="og:image" content="${SITE}/images/logo.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Videos | CrimeTimeSnacks">
    <meta name="twitter:description" content="A true crime podcast exploring unsolved cases, murders, and mysteries.">
    <meta name="twitter:image" content="${SITE}/images/logo.png">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">
    <link rel="stylesheet" href="css/style.css?v=2026f">
    <style>
        /* Updated styles for video grid */
        .video-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 2rem;
            padding: 2rem 0;
        }
        .video-card {
            background-color: var(--cts-medium-gray);
            border-radius: 5px;
            overflow: hidden;
            transition: transform 0.3s ease;
        }
        .video-card:hover { transform: translateY(-5px); }
        .video-container { position: relative; width: 100%; padding-bottom: 56.25%; }
        .video { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .video-content { padding: 1.5rem; }
        .video-title { font-size: 1.2rem; margin-bottom: 0.5rem; color: var(--cts-white); }
        .video-description { color: #ddd; }
        /* Shorts rail (9:16 vertical) */
        .shorts-rail {
            display: flex;
            gap: 1.25rem;
            overflow-x: auto;
            padding: 1rem 0 1.5rem;
            scroll-snap-type: x mandatory;
            -webkit-overflow-scrolling: touch;
        }
        .short-card { flex: 0 0 auto; width: 230px; scroll-snap-align: start; }
        .short-container {
            position: relative; width: 100%; padding-bottom: 177.78%;
            border-radius: 8px; overflow: hidden; background: #000;
        }
        .short { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .short-title {
            margin-top: 0.6rem; color: var(--cts-white); font-size: 0.95rem;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
    </style>
</head>
<body>
        <!-- Header & Navigation -->
    <header>
        <div class="nav-container container">
            <div class="logo-container">
                <a href="index.html"><img src="images/logo.png" alt="CrimeTimeSnacks Logo" height="40"></a>
            </div>
            <button id="mobile-menu-btn" class="mobile-menu-btn"><i class="fas fa-bars"></i></button>
            <nav>
                <ul class="nav-menu">
                    <li><a href="index.html"><i class="fas fa-home"></i> Home</a></li>
                    <li><a href="episodes.html"><i class="fas fa-microphone"></i> Episodes</a></li>
                    <li><a href="videos.html" class="active"><i class="fas fa-video"></i> Videos</a></li>
                    <li><a href="blog.html"><i class="fas fa-newspaper"></i> Blog</a></li>
                    <li><a href="about.html"><i class="fas fa-info-circle"></i> About</a></li>
                    <li><a href="merch.html"><i class="fas fa-tshirt"></i> Merch</a></li>
                    <li><a href="contact.html"><i class="fas fa-envelope"></i> Contact</a></li>
                </ul>
            </nav>
            <div class="utility-nav">
                <button id="dark-mode-toggle"><i class="fas fa-moon"></i></button>
            </div>
        </div>
    </header>

    <section class="container">
        <h1 style="text-align: center; margin-bottom: 2rem;">${esc(data.meta.title)}</h1>
        <div class="video-grid">
${longs.map(videoCard).join("\n")}
        </div>
    </section>
${shortsSection}
    <footer class="footer">
        <div class="container">
            <div class="footer-content">
                <div>
                    <img src="images/logo.png" alt="CrimeTimeSnacks Logo" class="footer-logo">
                    <p>A true crime podcast exploring unsolved cases and mysteries with detailed analysis and compelling storytelling.</p>
                    <div class="footer-social">
                        <a href="https://open.spotify.com/show/6wbA1mrLHjEegphMPnsAiZ"><i class="fab fa-spotify"></i></a>
                        <a href="https://podcasts.apple.com/us/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400"><i class="fab fa-apple"></i></a>
                    </div>
                </div>

                <div>
                    <h3 class="footer-heading">Quick Links</h3>
                    <ul class="footer-links">
                        <li><a href="index.html">Home</a></li>
                        <li><a href="episodes.html">Episodes</a></li>
                        <li><a href="about.html">About</a></li>
                        <li><a href="listen.html">Listen</a></li>
                        <li><a href="contact.html">Contact</a></li>
                    </ul>
                </div>

                <div>
                    <h3 class="footer-heading">Listen On</h3>
                    <ul class="footer-links">
                        <li><a href="https://podcasts.apple.com/us/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400">Apple Podcasts</a></li>
                        <li><a href="https://open.spotify.com/show/6wbA1mrLHjEegphMPnsAiZ">Spotify</a></li>
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
    </footer>
    <script src="js/main.js"></script>
</body>
</html>
`;

await writeFile(join(ROOT, "videos.html"), page, "utf8");

// Homepage "Watch" region (optional — only if markers exist in index.html).
function homeCard(v) {
  return `                <div class="video-card">
                    <div class="video-container">
                        <iframe src="https://www.youtube.com/embed/${esc(v.id)}" class="video" title="${esc(v.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="lazy" allowfullscreen></iframe>
                    </div>
                    <div class="video-content">
                        <h3 class="video-title">${esc(v.title)}</h3>
                    </div>
                </div>`;
}

async function updateHomeWatch() {
  const indexPath = join(ROOT, "index.html");
  let html;
  try { html = await readFile(indexPath, "utf8"); } catch { return false; }
  const start = "<!-- HOME-VIDEOS:START (auto-filled by automation/build-videos.mjs) -->";
  const end = "<!-- HOME-VIDEOS:END -->";
  const i = html.indexOf(start);
  const j = html.indexOf(end);
  if (i === -1 || j === -1) return false;
  const picks = longs.slice(0, 3);
  const block = `
    <section class="container" style="margin-top: 4rem;">
        <h2 class="slide-in-left animate-on-scroll" style="text-align: center; margin-bottom: 2rem;">Watch on YouTube</h2>
        <div class="video-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:2rem;">
${picks.map(homeCard).join("\n")}
        </div>
        <div style="text-align: center; margin-top: 2rem;">
            <a href="videos.html" class="btn btn-secondary">Watch More Videos</a>
        </div>
    </section>
    `;
  const next = html.slice(0, i + start.length) + block + html.slice(j);
  await writeFile(indexPath, next, "utf8");
  return true;
}

const home = await updateHomeWatch();
console.log(
  `videos.html generated: ${longs.length} videos, ${shorts.length} shorts.` +
  (home ? " Homepage Watch region refreshed." : " (no HOME-VIDEOS markers on homepage — skipped)")
);
