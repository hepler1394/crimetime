#!/usr/bin/env node
// Generates videos.html from videos.json — SHORTS-FIRST. Leads with a vertical
// 9:16 Shorts rail, then full videos, with an All/Shorts/Full filter. Also
// refreshes the homepage HOME-VIDEOS region. Uses the shared 2026 shell.
// Run: node automation/build-videos.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const data = JSON.parse(await readFile(join(__dirname, "videos.json"), "utf8"));
const all = data.videos || [];
const longs = all.filter((v) => !v.short);
const shorts = all.filter((v) => v.short);

// VideoObject / ItemList structured data for rich results.
const videoLd = all.length
  ? `\n    <script type="application/ld+json">\n${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: all.map((v, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "VideoObject",
          name: v.title,
          description: v.description || v.title,
          thumbnailUrl: v.thumb || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
          uploadDate: v.published || undefined,
          embedUrl: `https://www.youtube.com/embed/${v.id}`,
          contentUrl: `https://www.youtube.com/watch?v=${v.id}`,
        },
      })),
    }, null, 2)}\n    </script>`
  : "";

function videoCard(v) {
  return `            <div class="video-card" data-format="full">
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
                    <p class="video-description" style="color:var(--cts-muted);font-size:0.9rem;">${esc(v.description || "")}</p>
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

const shortsBody = shorts.length
  ? `        <div class="shorts-rail">
${shorts.map(shortCard).join("\n")}
        </div>`
  : `        <div class="shorts-empty">
            <i class="fas fa-bolt" aria-hidden="true"></i>
            <p>Shorts drop here automatically. New vertical clips appear the moment they're posted to the channel.</p>
        </div>`;

const fullSection = longs.length
  ? `
${tape()}

    <section class="container format-full">
        <div class="section-head">
            <span class="file-no">Full Length</span>
            <h2>Case Breakdowns</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="video-grid">
${longs.map(videoCard).join("\n")}
        </div>
    </section>
`
  : "";

const extraCss = `
    <style>
        .short-card { flex: 0 0 auto; width: 240px; scroll-snap-align: start; }
        .short-container {
            position: relative; width: 100%; padding-bottom: 177.78%;
            border-radius: 14px; overflow: hidden; background: #000;
            border: 1px solid var(--cts-line-strong);
            transition: transform 0.3s var(--ease), border-color 0.3s var(--ease), box-shadow 0.3s var(--ease);
        }
        .short-card:hover .short-container { transform: translateY(-5px); border-color: rgba(229,9,20,0.55); box-shadow: var(--shadow-red); }
        .short { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        .short-title {
            margin-top: 0.6rem; color: var(--cts-white); font-size: 0.92rem; font-weight: 600;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .shorts-rail {
            display: flex; gap: 1.25rem; overflow-x: auto; padding: 1rem 0 1.5rem;
            scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
        }
        .shorts-empty {
            text-align: center; color: var(--cts-muted); background: linear-gradient(180deg, var(--cts-panel), var(--cts-ink));
            border: 1px solid var(--cts-line); border-radius: 14px; padding: 3rem 2rem; max-width: 620px; margin: 0 auto;
        }
        .shorts-empty i { color: var(--cts-red); font-size: 2rem; margin-bottom: 0.75rem; }
        .format-filters { display: flex; justify-content: center; flex-wrap: wrap; gap: 0.7rem; margin: 0.5rem 0 1.5rem; }
    </style>`;

const page = `${head({
  title: "Shorts & Videos | CrimeTimeSnacks",
  description: "Quick true-crime clips and full case breakdowns from CrimeTimeSnacks on YouTube.",
  canonicalPath: "/videos.html",
  extraHead: videoLd + extraCss,
})}
<body>
${header("videos")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">On Camera</p>
            <h1 class="page-title">Shorts &amp; <span class="text-red">Videos</span></h1>
            <p>Quick true-crime clips and full case breakdowns.</p>
${data.meta.channelUrl ? `            <p style="margin-top:1.6rem;"><a href="${esc(data.meta.channelUrl)}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fab fa-youtube" aria-hidden="true"></i> Subscribe on YouTube</a></p>\n` : ""}        </div>
    </section>

    <section class="container">
        <div class="format-filters">
            <button class="category-btn format-btn active" data-filter="all">All</button>
            <button class="category-btn format-btn" data-filter="shorts">Shorts</button>
            <button class="category-btn format-btn" data-filter="full">Full Videos</button>
        </div>
    </section>

    <section class="container format-shorts">
        <div class="section-head">
            <span class="file-no">Vertical</span>
            <h2>Shorts</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
${shortsBody}
    </section>
${fullSection}
    </main>

${footer()}

${scripts()}
    <script>
      (function () {
        var btns = document.querySelectorAll('.format-btn');
        var shortsSec = document.querySelector('.format-shorts');
        var fullSec = document.querySelector('.format-full');
        btns.forEach(function (b) {
          b.addEventListener('click', function () {
            btns.forEach(function (x) { x.classList.remove('active'); });
            b.classList.add('active');
            var f = b.getAttribute('data-filter');
            if (shortsSec) shortsSec.style.display = (f === 'full') ? 'none' : '';
            if (fullSec) fullSec.style.display = (f === 'shorts') ? 'none' : '';
          });
        });
      })();
    </script>
</body>
</html>
`;

await writeFile(join(ROOT, "videos.html"), page, "utf8");

// Homepage "Watch" region — prefers Shorts, falls back to full videos.
function homeShort(v) {
  return `                <a class="home-short" href="https://www.youtube.com/shorts/${esc(v.id)}" target="_blank" rel="noopener" title="${esc(v.title)}">
                    <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="${esc(v.title)}" loading="lazy" decoding="async">
                    <span class="home-short-play"><i class="fas fa-play" aria-hidden="true"></i></span>
                </a>`;
}
function homeVideo(v) {
  return `                <div class="video-card">
                    <div class="video-container">
                        <iframe src="https://www.youtube.com/embed/${esc(v.id)}" class="video" title="${esc(v.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" loading="lazy" allowfullscreen></iframe>
                    </div>
                    <div class="video-content"><h3 class="video-title">${esc(v.title)}</h3></div>
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

  let inner;
  if (shorts.length) {
    inner = `
        <div style="display:flex;gap:1rem;overflow-x:auto;padding:0.5rem 0 1rem;justify-content:center;flex-wrap:wrap;">
${shorts.slice(0, 5).map(homeShort).join("\n")}
        </div>
        <style>
          .home-short{position:relative;flex:0 0 auto;width:150px;aspect-ratio:9/16;border-radius:12px;overflow:hidden;display:block;border:1px solid var(--cts-line-strong);transition:transform .3s var(--ease),border-color .3s var(--ease);}
          .home-short:hover{transform:translateY(-4px);border-color:rgba(229,9,20,.6);}
          .home-short img{width:100%;height:100%;object-fit:cover;}
          .home-short-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.6rem;background:rgba(0,0,0,.25);}
        </style>`;
  } else {
    inner = `
        <div class="video-grid">
${longs.slice(0, 3).map(homeVideo).join("\n")}
        </div>`;
  }

  const block = `
    <section class="container" style="margin-top: 1rem;">
        <div class="section-head">
            <span class="file-no">On Camera</span>
            <h2>${shorts.length ? "Latest Shorts" : "Watch on YouTube"}</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
${inner}
        <div style="text-align: center; margin-top: 1.5rem;">
            <a href="/videos.html" class="btn btn-secondary">Watch More</a>
        </div>
    </section>
    `;
  const next = html.slice(0, i + start.length) + block + html.slice(j);
  await writeFile(indexPath, next, "utf8");
  return true;
}

const home = await updateHomeWatch();
console.log(
  `videos.html generated: ${shorts.length} shorts, ${longs.length} full videos.` +
  (home ? " Homepage Watch region refreshed." : " (no HOME-VIDEOS markers — skipped)")
);
