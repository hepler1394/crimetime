#!/usr/bin/env node
// Generates episodes.html from episodes.json (the real imported feed).
// Run: node automation/build-episodes.mjs

import { readFile, writeFile } from "node:fs/promises";
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
                        <a href="#"><i class="fab fa-facebook-f"></i></a>
                        <a href="#"><i class="fab fa-instagram"></i></a>
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

function card(p, ep) {
  return `            <article class="episode-card" style="max-width:860px;margin:0 auto 2.5rem;">
                <img src="${esc(ep.image)}" alt="${esc(ep.title)}" class="episode-image" loading="lazy" style="height:auto;aspect-ratio:1/1;object-fit:cover;">
                <div class="episode-content">
                    <div class="episode-badges" style="margin-bottom:0.5rem;">
                        <span class="episode-badge">True Crime</span>
                        ${ep.duration ? `<span class="episode-badge">${esc(fmtDur(ep.duration))}</span>` : ""}
                    </div>
                    <h3 class="episode-title">${esc(ep.title)}</h3>
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

const data = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
await writeFile(join(ROOT, "episodes.html"), page(data), "utf8");
console.log(`episodes.html generated: ${data.episodes.length} episodes.`);
