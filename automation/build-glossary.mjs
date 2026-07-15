#!/usr/bin/env node
// Generates glossary.html from glossary.json — the True Crime Glossary with
// live filtering and DefinedTermSet structured data. Part of the "biggest true
// crime reference" push. Run: node automation/build-glossary.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const data = JSON.parse(await readFile(join(__dirname, "glossary.json"), "utf8"));
const sections = data.sections || [];
const total = sections.reduce((n, s) => n + s.terms.length, 0);

const ld = `\n    <script type="application/ld+json">\n${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "DefinedTermSet",
  name: "CrimeTimeSnacks True Crime Glossary",
  url: `${SITE}/glossary.html`,
  hasDefinedTerm: sections.flatMap((s) =>
    s.terms.map((t) => ({ "@type": "DefinedTerm", name: t.term, description: t.def }))
  ),
})}\n    </script>`;

function sectionBlock(s, i) {
  return `    <section class="container" style="margin-top:${i === 0 ? "1rem" : "3.4rem"};">
        <div class="section-head">
            <span class="file-no">${String(i + 1).padStart(2, "0")}</span>
            <h2>${esc(s.title)}</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <dl class="glossary-grid">
${s.terms.map((t) => `            <div class="glossary-item panel" data-term="${esc(t.term.toLowerCase())} ${esc(t.def.toLowerCase())}">
                <dt>${esc(t.term)}</dt>
                <dd>${esc(t.def)}</dd>
            </div>`).join("\n")}
        </dl>
    </section>`;
}

const page = `${head({
  title: `True Crime Glossary — ${total} Terms Explained | CrimeTimeSnacks`,
  description: `${total} true crime terms explained plainly — forensics, investigation, and courtroom vocabulary from the CrimeTimeSnacks case files.`,
  canonicalPath: "/glossary.html",
  extraHead: ld + `
    <style>
        .glossary-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.1rem; }
        .glossary-item { padding: 1.3rem 1.4rem; }
        .glossary-item dt { font-weight: 800; font-size: 1.02rem; margin-bottom: 0.45rem; color: var(--cts-white); }
        .glossary-item dd { color: var(--cts-muted); font-size: 0.9rem; margin: 0; line-height: 1.6; }
        .glossary-item:hover dt { color: var(--cts-red-hot); }
    </style>`,
})}
<body>
${header("")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">${total} Terms on File</p>
            <h1 class="page-title">The Case File <span class="text-red">Glossary</span></h1>
            <p>${esc(data.meta?.intro || "")}</p>
            <div class="search-container" style="margin-top:2rem;">
                <input type="search" id="glossary-search" aria-label="Search glossary" placeholder="Search terms... ( / )">
                <button aria-label="Search"><i class="fas fa-search" aria-hidden="true"></i></button>
            </div>
        </div>
    </section>

${tape()}

${sections.map(sectionBlock).join("\n\n")}

    <section class="container" style="margin-top:4rem;">
        <div class="newsletter-block" style="text-align:center;">
            <p class="eyebrow" style="justify-content:center;">Hear It Used Properly</p>
            <h2>Now Take It To The Case Files</h2>
            <div style="display:flex;gap:0.9rem;justify-content:center;margin-top:1.6rem;flex-wrap:wrap;">
                <a href="/episodes.html" class="btn btn-primary"><i class="fas fa-headphones" aria-hidden="true"></i> Episodes</a>
                <a href="/quiz.html" class="btn btn-secondary"><i class="fas fa-fingerprint" aria-hidden="true"></i> Test Yourself</a>
            </div>
        </div>
    </section>
    </main>

${footer()}

${scripts()}
    <script>
    (function () {
        var box = document.getElementById('glossary-search');
        if (!box) return;
        box.addEventListener('input', function () {
            var q = box.value.trim().toLowerCase();
            document.querySelectorAll('.glossary-item').forEach(function (el) {
                el.style.display = (!q || el.getAttribute('data-term').indexOf(q) > -1) ? '' : 'none';
            });
            document.querySelectorAll('main section.container').forEach(function (sec) {
                var items = sec.querySelectorAll('.glossary-item');
                if (!items.length) return;
                var any = Array.prototype.some.call(items, function (i) { return i.style.display !== 'none'; });
                sec.style.display = any ? '' : 'none';
            });
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); box.focus(); }
        });
    })();
    </script>
</body>
</html>
`;

await writeFile(join(ROOT, "glossary.html"), page, "utf8");
console.log(`glossary.html generated: ${total} terms, ${sections.length} sections.`);
