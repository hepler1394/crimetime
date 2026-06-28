#!/usr/bin/env node
// Generates merch.html from merch.json — a real gallery of the generated SVG
// designs. Matches the existing CrimeTimeSnacks design. Honest CTA (no fake
// checkout): each design is downloadable and the store opens on print-on-demand.
// Run: node automation/build-merch.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SITE = "https://crimetime.vercel.app";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

let merch;
try {
  merch = JSON.parse(await readFile(join(__dirname, "merch.json"), "utf8"));
} catch {
  console.log("No merch.json yet — run `node automation/gen-merch.mjs` first. Skipping.");
  process.exit(0);
}
const designs = merch.designs || [];

// Product / ItemList structured data.
const merchLd = designs.length
  ? `\n    <script type="application/ld+json">\n${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: designs.map((d, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: `${d.slogan} — CrimeTimeSnacks`,
          image: `${SITE}/${d.svg}`,
          brand: { "@type": "Brand", name: "CrimeTimeSnacks" },
          category: "Apparel",
          offers: {
            "@type": "Offer",
            price: d.price,
            priceCurrency: "USD",
            availability: "https://schema.org/PreOrder",
          },
        },
      })),
    }, null, 2)}\n    </script>`
  : "";

function card(d) {
  return `            <div class="merch-item">
                <img src="${esc(d.svg)}" alt="${esc(d.slogan)} — CrimeTimeSnacks design" class="merch-image" loading="lazy" style="background:#0a0a0a;border-radius:6px;border:1px solid #2a2a2a;">
                <h3 style="margin:0.25rem 0;color:var(--cts-white);">${esc(d.slogan)}</h3>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;justify-content:center;margin:0.75rem 0;">
                    <span class="episode-badge">Tee</span>
                    <span class="episode-badge">Hoodie</span>
                    <span class="episode-badge">Sticker</span>
                </div>
                <p style="color:#bbb;margin:0.25rem 0 1rem;">from $${esc(d.price)}</p>
                <div class="customize-options" style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;">
                    <a href="${esc(d.svg)}" download class="btn btn-secondary"><i class="fas fa-download"></i> Design</a>
                    <a href="#notify" onclick="var i=document.querySelector('.footer-newsletter input');if(i){i.focus();i.scrollIntoView({behavior:'smooth',block:'center'});}return false;" class="btn btn-primary"><i class="fas fa-bell"></i> Notify</a>
                </div>
            </div>`;
}

const page = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Merchandise | CrimeTimeSnacks</title>
    <meta name="description" content="Shop CrimeTimeSnacks merch — original true crime tee, hoodie, and sticker designs for fans who follow our deep-dives into unsolved cases.">
    <link rel="canonical" href="${SITE}/merch.html">
    <meta name="theme-color" content="#0a0a0a">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="Merchandise | CrimeTimeSnacks">
    <meta property="og:description" content="A true crime podcast exploring unsolved cases, murders, and mysteries.">
    <meta property="og:url" content="${SITE}/merch.html">
    <meta property="og:image" content="${SITE}/images/logo.png">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Merchandise | CrimeTimeSnacks">
    <meta name="twitter:description" content="A true crime podcast exploring unsolved cases, murders, and mysteries.">
    <meta name="twitter:image" content="${SITE}/images/logo.png">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">
    <link rel="icon" href="favicon.ico" type="image/x-icon">
    <link rel="apple-touch-icon" href="images/logo.png">
    <link rel="manifest" href="site.webmanifest">${merchLd}
    <script type="application/ld+json">
{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Home","item":"${SITE}/"},{"@type":"ListItem","position":2,"name":"Merch","item":"${SITE}/merch.html"}]}
    </script>
    <link rel="stylesheet" href="css/style.css?v=2026f"> <style>
        .merch-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            justify-content: center;
            gap: 2rem;
            padding: 2rem 0;
        }
        .merch-item {
            background-color: var(--cts-medium-gray);
            border-radius: 5px;
            padding: 1.5rem;
            text-align: center;
        }
        .merch-image { width: 100%; height: 260px; object-fit: contain; margin-bottom: 1rem; }
        .customize-options { margin-top: 1rem; }
    </style>
</head>
<body>
        <!-- Header & Navigation -->
    <header>
        <div class="nav-container container">
            <div class="logo-container">
                <a href="index.html"><img src="images/logo.png" alt="CrimeTimeSnacks Logo" height="40"></a>
            </div>
            <button id="mobile-menu-btn" class="mobile-menu-btn" aria-label="Open menu"><i class="fas fa-bars"></i></button>
            <nav>
                <ul class="nav-menu">
                    <li><a href="index.html"><i class="fas fa-home"></i> Home</a></li>
                    <li><a href="episodes.html"><i class="fas fa-microphone"></i> Episodes</a></li>
                    <li><a href="videos.html"><i class="fas fa-video"></i> Videos</a></li>
                    <li><a href="blog.html"><i class="fas fa-newspaper"></i> Blog</a></li>
                    <li><a href="about.html"><i class="fas fa-info-circle"></i> About</a></li>
                    <li><a href="merch.html" class="active"><i class="fas fa-tshirt"></i> Merch</a></li>
                    <li><a href="contact.html"><i class="fas fa-envelope"></i> Contact</a></li>
                </ul>
            </nav>
            <div class="utility-nav">
                <button id="dark-mode-toggle" aria-label="Toggle dark mode"><i class="fas fa-moon"></i></button>
            </div>
        </div>
    </header>

    <section class="container">
        <h1 style="text-align: center; margin-bottom: 0.5rem;">CrimeTimeSnacks Merch</h1>
        <p style="text-align: center; max-width: 640px; margin: 0 auto 2.5rem auto; color: #bbb;">${esc(merch.meta?.intro || "Original true crime designs. New drops added automatically.")}</p>
        <div class="merch-container">
${designs.map(card).join("\n")}
        </div>
        <p style="text-align:center;color:#888;margin-top:2.5rem;">Store opening soon on print-on-demand &mdash; tap Notify on any design to get first access.</p>
    </section>

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

await writeFile(join(ROOT, "merch.html"), page, "utf8");
console.log(`merch.html generated: ${designs.length} designs.`);
