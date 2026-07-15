#!/usr/bin/env node
// Generates episodes.html + /episodes/*.html from episodes.json (the imported
// feed), and refreshes the homepage HOME-EPISODES + HOME-STATS regions.
// Uses the shared 2026 shell (automation/shell.mjs) — the design lives there.
// Run: node automation/build-episodes.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, APPLE, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const fmtDate = (iso) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";
const fmtDur = (d) => (d ? d.replace(/^00:/, "") : "");
const epUrl = (ep) => `/episodes/${ep.slug}.html`;
const trunc = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

/* ---------------------------------------------------------- episode cards */
const durSeconds = (d) => {
  if (!d) return 0;
  const parts = String(d).split(":").map(Number);
  return parts.reduce((n, x) => n * 60 + (x || 0), 0);
};
const durISO = (d) => {
  const s = durSeconds(d);
  return s ? `PT${Math.floor(s / 60)}M${s % 60}S` : undefined;
};

function gridCard(p, ep) {
  return `                <article class="episode-card" data-categories="true-crime" data-date="${esc(ep.date || "")}" data-seconds="${durSeconds(ep.duration)}">
                    <a href="${epUrl(ep)}" aria-label="${esc(ep.title)}"><img src="${esc(ep.image)}" alt="Cover art: ${esc(ep.title)}" class="episode-image" loading="lazy" decoding="async" width="600" height="600"></a>
                    <div class="episode-content">
                        <div class="episode-badges">
                            <span class="episode-badge">True Crime</span>
                            ${ep.duration ? `<span class="episode-badge"><i class="far fa-clock" aria-hidden="true"></i> ${esc(fmtDur(ep.duration))}</span>` : ""}
                        </div>
                        <h3 class="episode-title"><a href="${epUrl(ep)}" style="color:inherit;text-decoration:none;">${esc(ep.title)}</a></h3>
                        <p class="episode-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${esc(fmtDate(ep.date))}</p>
                        <p class="episode-description">${esc(trunc(ep.description, 220))}</p>
                        <audio preload="none" controls>
                            <source src="${esc(ep.audio)}" type="${esc(ep.audioType)}">
                        </audio>
                        <div class="episode-actions">
                            <a href="${epUrl(ep)}" class="btn btn-primary btn-sm">Open Case</a>
                            <div class="episode-stats">
                                <a href="${ep.link || p.spotifyUrl}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;"><i class="fab fa-spotify" aria-hidden="true"></i> Spotify</a>
                                <a href="${APPLE}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;"><i class="fab fa-apple" aria-hidden="true"></i> Apple</a>
                            </div>
                        </div>
                    </div>
                </article>`;
}

/* ------------------------------------------------------------- episodes.html */
function page({ podcast: p, episodes }) {
  const sorted = [...episodes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const itemsLd = `\n    <script type="application/ld+json">\n${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: sorted.map((ep, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: { "@type": "PodcastEpisode", name: ep.title, url: `${SITE}/episodes/${ep.slug}.html`, datePublished: ep.date },
    })),
  }, null, 2)}\n    </script>\n    <script type="application/ld+json">\n${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Episodes", item: `${SITE}/episodes.html` },
    ],
  })}\n    </script>`;

  return `${head({
    title: "Episodes | CrimeTimeSnacks • A True Crime Podcast",
    description: "Every episode of CrimeTimeSnacks — true crime cases explored in detail. Listen here, on Spotify, or on Apple Podcasts.",
    canonicalPath: "/episodes.html",
    extraHead: itemsLd,
  })}
<body>
${header("episodes")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">${esc(String(episodes.length))} Episodes on File</p>
            <h1 class="page-title">The Case <span class="text-red">Files</span></h1>
            <p>Every case, explored in detail. Press play right here, or take it to your favorite app.</p>
        </div>
    </section>

${tape()}

    <section class="container" style="padding-top:1rem;">
        <div class="episodes-toolbar">
            <div class="search-container" style="margin:0;max-width:340px;flex:1;">
                <input type="search" id="episode-search" aria-label="Search episodes" placeholder="Search cases... ( / )">
                <button aria-label="Search"><i class="fas fa-search" aria-hidden="true"></i></button>
            </div>
            <div style="display:flex;align-items:center;gap:0.8rem;">
                <label for="episode-sort" class="kbd-hint">Sort</label>
                <select id="episode-sort" aria-label="Sort episodes">
                    <option value="new">Newest first</option>
                    <option value="old">Oldest first</option>
                    <option value="long">Longest</option>
                    <option value="short">Shortest</option>
                </select>
            </div>
        </div>
        <div class="episode-grid" id="episode-grid">
${sorted.map((ep) => gridCard(p, ep)).join("\n")}
        </div>
        <p id="episode-empty" style="display:none;color:var(--cts-muted);text-align:center;padding:2.5rem 0;">No cases match that search.</p>
    </section>
    </main>

${footer({ spotifyUrl: p.spotifyUrl })}

${scripts()}
    <script>
    (function () {
        var grid = document.getElementById('episode-grid');
        var cards = Array.prototype.slice.call(grid.querySelectorAll('.episode-card'));
        var box = document.getElementById('episode-search');
        var sort = document.getElementById('episode-sort');
        var empty = document.getElementById('episode-empty');
        function apply() {
            var q = (box.value || '').toLowerCase();
            var mode = sort.value;
            var visible = 0;
            cards.sort(function (a, b) {
                var da = a.getAttribute('data-date') || '', db = b.getAttribute('data-date') || '';
                var sa = parseInt(a.getAttribute('data-seconds') || '0', 10), sb = parseInt(b.getAttribute('data-seconds') || '0', 10);
                if (mode === 'old') return da.localeCompare(db);
                if (mode === 'long') return sb - sa;
                if (mode === 'short') return sa - sb;
                return db.localeCompare(da);
            }).forEach(function (c) {
                grid.appendChild(c);
                var hit = !q || c.textContent.toLowerCase().indexOf(q) > -1;
                c.style.display = hit ? '' : 'none';
                if (hit) visible++;
            });
            empty.style.display = visible ? 'none' : '';
        }
        box.addEventListener('input', apply);
        sort.addEventListener('change', apply);
    })();
    </script>
</body>
</html>
`;
}

/* --------------------------------------------------------- episode pages */
function episodeLd(p, ep) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "PodcastEpisode",
    name: ep.title,
    datePublished: ep.date,
    description: ep.excerpt || ep.description,
    timeRequired: durISO(ep.duration),
    associatedMedia: { "@type": "MediaObject", contentUrl: ep.audio },
    partOfSeries: { "@type": "PodcastSeries", name: "CrimeTimeSnacks", url: `${SITE}/` },
    url: `${SITE}${epUrl(ep)}`,
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Episodes", item: `${SITE}/episodes.html` },
      { "@type": "ListItem", position: 3, name: ep.title, item: `${SITE}${epUrl(ep)}` },
    ],
  };
  return `\n    <script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n    </script>\n    <script type="application/ld+json">\n${JSON.stringify(crumbs)}\n    </script>`;
}

function shareRow(url, title) {
  return `        <div class="share-row">
            <span class="label">Share this case</span>
            <button class="share-btn" data-copy="${esc(url)}"><i class="fas fa-link" aria-hidden="true"></i> Copy Link</button>
            <a class="share-btn" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener"><i class="fab fa-x-twitter" aria-hidden="true"></i> Post</a>
            <a class="share-btn" href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener"><i class="fab fa-facebook-f" aria-hidden="true"></i> Share</a>
            <a class="share-btn" href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}"><i class="fas fa-envelope" aria-hidden="true"></i> Email</a>
        </div>`;
}

function relatedCard(ep) {
  return `                <a class="episode-card" href="${epUrl(ep)}" style="text-decoration:none;color:inherit;">
                    <img src="${esc(ep.image)}" alt="${esc(ep.title)}" class="episode-image" loading="lazy" style="height:150px;">
                    <div class="episode-content" style="padding:1rem 1.1rem;">
                        <h3 class="episode-title" style="font-size:1rem;">${esc(ep.title)}</h3>
                        <p class="episode-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${esc(fmtDate(ep.date))}</p>
                    </div>
                </a>`;
}

function episodePage(p, ep, sorted) {
  const desc = (ep.excerpt || ep.description || "").slice(0, 200);
  const idx = sorted.findIndex((e) => e.slug === ep.slug);
  const prev = sorted[idx + 1]; // older
  const next = sorted[idx - 1]; // newer
  const related = sorted.filter((e) => e.slug !== ep.slug).slice(0, 3);

  return `${head({
    title: `${ep.title} | CrimeTimeSnacks`,
    description: desc,
    canonicalPath: epUrl(ep),
    ogImage: ep.image,
    ogType: "article",
    extraHead: episodeLd(p, ep),
  })}
<body>
${header("episodes")}
    <main id="main-content">
    <section class="episode-header">
        <div class="container">
            <div class="episode-badges" style="justify-content:center;display:flex;margin-bottom:0.9rem;">
                <span class="episode-badge">True Crime</span>
                ${ep.duration ? `<span class="episode-badge"><i class="far fa-clock" aria-hidden="true"></i> ${esc(fmtDur(ep.duration))}</span>` : ""}
            </div>
            <h1>${esc(ep.title)}</h1>
            <p class="episode-date" style="justify-content:center;margin-top:0.7rem;"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${esc(fmtDate(ep.date))} &nbsp;&middot;&nbsp; ${esc(p.author)}</p>
        </div>
    </section>

    <div class="container" style="max-width:820px;margin:2.6rem auto;">
        <img src="${esc(ep.image)}" alt="${esc(ep.title)}" style="width:100%;max-width:440px;display:block;margin:0 auto 2rem;border-radius:16px;border:1px solid var(--cts-line-strong);box-shadow:var(--shadow-2);">
        <audio preload="none" controls>
            <source src="${esc(ep.audio)}" type="${esc(ep.audioType)}">
        </audio>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin:1.4rem 0 2rem;">
            <a href="${ep.link || p.spotifyUrl}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fab fa-spotify" aria-hidden="true"></i> Listen on Spotify</a>
            <a href="${APPLE}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fab fa-apple" aria-hidden="true"></i> Apple Podcasts</a>
        </div>
        <p style="color:var(--cts-muted);line-height:1.85;font-size:1.02rem;">${esc(ep.description)}</p>
${shareRow(`${SITE}${epUrl(ep)}`, `${ep.title} — CrimeTimeSnacks`)}
        <div style="display:flex;justify-content:space-between;gap:0.8rem;flex-wrap:wrap;margin-top:2.6rem;">
            ${prev ? `<a href="${epUrl(prev)}" class="btn btn-secondary btn-sm"><i class="fas fa-arrow-left" aria-hidden="true"></i> ${esc(trunc(prev.title, 26))}</a>` : "<span></span>"}
            <a href="/episodes.html" class="btn btn-secondary btn-sm">All Episodes</a>
            ${next ? `<a href="${epUrl(next)}" class="btn btn-secondary btn-sm">${esc(trunc(next.title, 26))} <i class="fas fa-arrow-right" aria-hidden="true"></i></a>` : "<span></span>"}
        </div>
    </div>

    <section class="container" style="margin-top:3.4rem;">
        <div class="section-head">
            <span class="file-no">Related</span>
            <h2>More Cases</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="episode-grid" style="margin-top:1rem;">
${related.map(relatedCard).join("\n")}
        </div>
    </section>
    </main>

${footer({ spotifyUrl: p.spotifyUrl })}

${scripts()}
</body>
</html>
`;
}

/* ------------------------------- homepage regions (spotlight + recent grid) */
function homeRecentCard(p, ep) {
  return `                <div class="episode-card" data-categories="true-crime">
                    <a href="${epUrl(ep)}" aria-label="${esc(ep.title)}"><img src="${esc(ep.image)}" alt="${esc(ep.title)}" class="episode-image" loading="lazy"></a>
                    <div class="episode-content">
                        <div class="episode-badges">
                            <span class="episode-badge">True Crime</span>
                            ${ep.duration ? `<span class="episode-badge"><i class="far fa-clock" aria-hidden="true"></i> ${esc(fmtDur(ep.duration))}</span>` : ""}
                        </div>
                        <h3 class="episode-title">${esc(ep.title)}</h3>
                        <p class="episode-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${esc(fmtDate(ep.date))}</p>
                        <p class="episode-description">${esc(trunc(ep.description, 150))}</p>
                        <div class="episode-actions">
                            <a href="${epUrl(ep)}" class="btn btn-primary btn-sm">Listen Now</a>
                            <div class="episode-stats"><span><i class="far fa-clock" aria-hidden="true"></i> ${esc(fmtDur(ep.duration))}</span></div>
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
    <section id="latest-episode" class="container" style="margin-top:1.5rem;">
        <div class="section-head">
            <span class="file-no">File 02</span>
            <h2>Latest Episode</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <article class="spotlight">
            <div class="spotlight-media">
                <img src="${esc(latest.image)}" alt="${esc(latest.title)}" loading="lazy">
            </div>
            <div class="spotlight-body">
                <div class="episode-badges">
                    <span class="episode-badge">True Crime</span>
                    ${latest.duration ? `<span class="episode-badge"><i class="far fa-clock" aria-hidden="true"></i> ${esc(fmtDur(latest.duration))}</span>` : ""}
                </div>
                <h3>${esc(latest.title)}</h3>
                <p class="episode-date"><i class="far fa-calendar-alt" aria-hidden="true"></i> ${esc(fmtDate(latest.date))}</p>
                <p class="episode-description">${esc(latest.description)}</p>
                <audio preload="none" controls>
                    <source src="${esc(latest.audio)}" type="${esc(latest.audioType)}">
                </audio>
                <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
                    <a href="${latest.link || p.spotifyUrl}" target="_blank" rel="noopener" class="btn btn-primary"><i class="fab fa-spotify" aria-hidden="true"></i> Listen on Spotify</a>
                    <a href="${APPLE}" target="_blank" rel="noopener" class="btn btn-secondary"><i class="fab fa-apple" aria-hidden="true"></i> Apple Podcasts</a>
                </div>
            </div>
        </article>
    </section>

    <!-- Crime Scene Tape -->
    <div class="crime-scene-tape" aria-hidden="true"></div>

    <!-- Recent Episodes Section -->
    <section class="container">
        <div class="section-head">
            <span class="file-no">File 03</span>
            <h2>Recent Episodes</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="episode-grid">
${recent.map((ep) => homeRecentCard(p, ep)).join("\n")}
        </div>
        <div style="text-align: center; margin-top: 2rem;">
            <a href="/episodes.html" class="btn btn-secondary">View All Episodes</a>
        </div>
    </section>
    <!-- HOME-EPISODES:END -->`;
}

function statsBlock(count) {
  return `                <!-- HOME-STATS:START (auto-filled by automation/build-episodes.mjs) -->
                <div class="stat-row">
                    <div class="stat"><div class="stat-num"><span data-count="${count}">0</span><em>+</em></div><div class="stat-label">Cases Covered</div></div>
                    <div class="stat"><div class="stat-num"><span data-count="${count}">0</span></div><div class="stat-label">Episodes</div></div>
                    <div class="stat"><div class="stat-num">5.0<em>★</em></div><div class="stat-label">Listener Rated</div></div>
                    <div class="stat"><div class="stat-num">2<em>×</em>/wk</div><div class="stat-label">New Drops</div></div>
                </div>
                <!-- HOME-STATS:END -->`;
}

function replaceRegion(html, startMark, endMark, block) {
  const i = html.indexOf(startMark);
  const j = html.indexOf(endMark);
  if (i === -1 || j === -1) return null;
  const lineStart = html.lastIndexOf("\n", i) + 1;
  return html.slice(0, lineStart) + block + html.slice(j + endMark.length);
}

async function updateHome(data) {
  const indexPath = join(ROOT, "index.html");
  let html;
  try { html = await readFile(indexPath, "utf8"); } catch { return false; }

  const epi = replaceRegion(
    html,
    "<!-- HOME-EPISODES:START (auto-filled by automation/build-episodes.mjs) -->",
    "<!-- HOME-EPISODES:END -->",
    homeBlock(data)
  );
  if (epi) html = epi;

  const stats = replaceRegion(
    html,
    "<!-- HOME-STATS:START (auto-filled by automation/build-episodes.mjs) -->",
    "<!-- HOME-STATS:END -->",
    statsBlock(data.episodes.length)
  );
  if (stats) html = stats;

  if (!epi && !stats) return false;
  await writeFile(indexPath, html, "utf8");
  return true;
}

const data = JSON.parse(await readFile(join(__dirname, "episodes.json"), "utf8"));
const sorted = [...data.episodes].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
await writeFile(join(ROOT, "episodes.html"), page(data), "utf8");
await mkdir(join(ROOT, "episodes"), { recursive: true });
for (const ep of data.episodes) {
  await writeFile(join(ROOT, "episodes", `${ep.slug}.html`), episodePage(data.podcast, ep, sorted), "utf8");
}
const home = await updateHome(data);
console.log(
  `episodes.html + ${data.episodes.length} episode pages generated.` +
    (home ? " Homepage episodes + stats refreshed." : " (home markers not found)")
);
