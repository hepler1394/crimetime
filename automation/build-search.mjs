#!/usr/bin/env node
// Builds the site-wide search: automation/search-index.json + search.html.
// Indexes episodes, TRANSCRIPTS (with timestamps — search what Cory said and
// jump to the exact second), blog posts, quizzes, and glossary terms.
// Run: node automation/build-search.mjs

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const readJson = async (p) => {
  try { return JSON.parse(await readFile(join(__dirname, p), "utf8")); } catch { return null; }
};

const docs = [];

// Episodes (title + description)
const episodes = (await readJson("episodes.json"))?.episodes || [];
for (const ep of episodes) {
  docs.push({ k: "episode", title: ep.title, url: `/episodes/${ep.slug}.html`, text: (ep.description || "").slice(0, 400) });
}

// Transcripts — chunked into ~top-of-paragraph windows with timestamps
let transcribed = 0;
try {
  const files = (await readdir(join(__dirname, "transcripts"))).filter((f) => f.endsWith(".json"));
  for (const f of files) {
    const t = await readJson(`transcripts/${f}`);
    if (!t?.segments?.length) continue;
    transcribed++;
    let buf = [], start = t.segments[0].start;
    const flush = () => {
      if (!buf.length) return;
      docs.push({ k: "transcript", title: t.title, url: `/episodes/${t.slug}.html?t=${Math.floor(start)}`, text: buf.join(" ").slice(0, 420), ts: Math.floor(start) });
      buf = [];
    };
    for (const s of t.segments) {
      if (!buf.length) start = s.start;
      buf.push(s.text);
      if (buf.join(" ").length > 340) flush();
    }
    flush();
  }
} catch { /* no transcripts yet */ }

// Blog posts
const posts = (await readJson("blog.json"))?.posts || [];
for (const p of posts) {
  docs.push({ k: "post", title: p.title, url: `/blog-posts/${p.slug}.html`, text: (p.excerpt + " " + p.body.join(" ")).slice(0, 420) });
}

// Quizzes
const quizzes = (await readJson("quizzes.json"))?.quizzes || [];
for (const q of quizzes) {
  docs.push({ k: "quiz", title: q.title, url: "/quiz.html", text: (q.description + " " + q.questions.map((x) => x.q).join(" ")).slice(0, 420) });
}

// Glossary
const glossary = (await readJson("glossary.json"))?.sections || [];
for (const s of glossary) {
  for (const t of s.terms) {
    docs.push({ k: "term", title: t.term, url: "/glossary.html", text: t.def.slice(0, 300) });
  }
}

await writeFile(join(__dirname, "search-index.json"), JSON.stringify({ built: new Date().toISOString(), docs }), "utf8");

/* ------------------------------------------------------------ search.html */
const page = `${head({
  title: "Search | CrimeTimeSnacks",
  description: "Search everything CrimeTimeSnacks — episodes, full transcripts (jump to the exact second), blog posts, quizzes, and the glossary.",
  canonicalPath: "/search.html",
  extraHead: `
    <style>
        .result { display:block; text-decoration:none; color:inherit; padding:1.1rem 1.3rem; border:1px solid var(--cts-line); border-radius: var(--radius-sm); background: linear-gradient(180deg, var(--cts-panel), var(--cts-ink)); margin-bottom: 0.8rem; transition: var(--cts-transition); }
        .result:hover { border-color: rgba(229,9,20,0.55); transform: translateX(4px); }
        .result .kind { font-size: 0.62rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; padding: 0.2rem 0.6rem; border-radius: 4px; margin-right: 0.6rem; }
        .kind--episode { background: rgba(229,9,20,0.15); color: #ff9096; border: 1px solid rgba(229,9,20,0.4); }
        .kind--transcript { background: rgba(29,185,84,0.12); color: #6fdf9b; border: 1px solid rgba(29,185,84,0.35); }
        .kind--post { background: rgba(255,255,255,0.06); color: #cfcfd6; border: 1px solid var(--cts-line-strong); }
        .kind--quiz { background: rgba(244,194,13,0.1); color: #ffd75e; border: 1px solid rgba(244,194,13,0.35); }
        .kind--term { background: rgba(120,120,255,0.1); color: #b9b9ff; border: 1px solid rgba(120,120,255,0.3); }
        .result h3 { display: inline; font-size: 1.02rem; }
        .result p { color: var(--cts-muted); font-size: 0.88rem; margin-top: 0.5rem; }
        .result mark { background: rgba(229,9,20,0.3); color: #fff; border-radius: 3px; padding: 0 2px; }
        .result .ts { color: var(--cts-tape); font-size: 0.76rem; font-weight: 700; }
    </style>`,
})}
<body>
${header("")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">Every Word On File</p>
            <h1 class="page-title">Search the <span class="text-red">Archive</span></h1>
            <p>Episodes, full transcripts, blog posts, quizzes, and the glossary — including what was actually said on the mic, down to the second.</p>
            <div class="search-container" style="margin-top:2rem;">
                <input type="search" id="site-search" aria-label="Search the site" placeholder="Try a name, a case, a phrase you heard... ( / )" autofocus>
                <button aria-label="Search"><i class="fas fa-search" aria-hidden="true"></i></button>
            </div>
        </div>
    </section>

${tape()}

    <section class="container" style="max-width:860px;">
        <p id="search-stats" class="kbd-hint" style="margin-bottom:1.2rem;"></p>
        <div id="search-results" aria-live="polite"></div>
    </section>
    </main>

${footer()}

${scripts()}
    <script>
    (function () {
        var box = document.getElementById('site-search');
        var out = document.getElementById('search-results');
        var stats = document.getElementById('search-stats');
        var docs = null;
        var KINDS = { episode: 'Episode', transcript: 'Said on the show', post: 'Blog', quiz: 'Quiz', term: 'Glossary' };

        function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
        function fmtTs(t) { var m = Math.floor(t / 60), s = t % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

        function load() {
            if (docs) return Promise.resolve(docs);
            return fetch('/automation/search-index.json').then(function (r) { return r.json(); }).then(function (d) { docs = d.docs || []; return docs; });
        }

        function highlight(text, terms) {
            var t = esc(text);
            terms.forEach(function (w) {
                if (w.length < 3) return;
                t = t.replace(new RegExp('(' + w.replace(/[.*+?^$()\\[\\]{}|]/g, '') + ')', 'ig'), '<mark>$1</mark>');
            });
            return t;
        }

        function search(q) {
            var terms = q.toLowerCase().split(/\\s+/).filter(Boolean);
            if (!terms.length) { out.innerHTML = ''; stats.textContent = ''; return; }
            load().then(function (ds) {
                var scored = [];
                ds.forEach(function (d) {
                    var hay = (d.title + ' ' + d.text).toLowerCase();
                    var score = 0;
                    terms.forEach(function (w) {
                        if (d.title.toLowerCase().indexOf(w) > -1) score += 5;
                        var idx = -1, hits = 0;
                        while ((idx = hay.indexOf(w, idx + 1)) > -1 && hits < 6) { score += 1; hits++; }
                    });
                    if (score > 0) scored.push([score, d]);
                });
                scored.sort(function (a, b) { return b[0] - a[0]; });
                var top = scored.slice(0, 40);
                stats.textContent = scored.length + ' result' + (scored.length === 1 ? '' : 's') + (scored.length > 40 ? ' — showing top 40' : '');
                out.innerHTML = top.map(function (x) {
                    var d = x[1];
                    return '<a class="result" href="' + d.url + '">' +
                        '<span class="kind kind--' + d.k + '">' + KINDS[d.k] + '</span>' +
                        '<h3>' + esc(d.title) + '</h3>' +
                        (d.ts !== undefined ? ' <span class="ts"><i class="fas fa-play" aria-hidden="true"></i> ' + fmtTs(d.ts) + '</span>' : '') +
                        '<p>' + highlight(d.text.slice(0, 260), terms) + '&hellip;</p></a>';
                }).join('') || '<p style="color:var(--cts-muted);text-align:center;padding:2rem 0;">Nothing on file for that. Try fewer words.</p>';
            });
        }

        var t;
        box.addEventListener('input', function () { clearTimeout(t); t = setTimeout(function () { search(box.value.trim()); }, 160); });
        var params = new URLSearchParams(location.search);
        if (params.get('q')) { box.value = params.get('q'); search(box.value); }
    })();
    </script>
</body>
</html>
`;

await writeFile(join(ROOT, "search.html"), page, "utf8");
console.log(`search-index.json: ${docs.length} documents (${transcribed} transcripts). search.html generated.`);
