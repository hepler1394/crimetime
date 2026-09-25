#!/usr/bin/env node
// Generates corrections.html from corrections.json: the public log of what was wrong,
// where, and what changed. The terms page promised "corrections are published, not
// quietly edited away"; until 2026-09-24 there was nowhere they were published.
// Run: node automation/build-corrections.mjs   (part of build-all)

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, EMAIL, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const data = JSON.parse(await readFile(join(__dirname, "corrections.json"), "utf8"));
const items = [...(data.corrections || [])].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
const fmtDate = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "");

const css = `
<style>
.corr{list-style:none;margin:1.6rem 0 0;padding:0;border-left:2px solid var(--cts-red)}
.corr li{position:relative;padding:0 0 1.8rem 1.4rem}
.corr li::before{content:"";position:absolute;left:-7px;top:.5rem;width:12px;height:12px;border-radius:50%;background:var(--cts-red);box-shadow:0 0 0 4px var(--cts-black)}
.corr time{display:block;font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--cts-tape);margin-bottom:.25rem}
.corr h3{font-family:var(--font-display);font-size:1.5rem;letter-spacing:.02em;margin:0 0 .5rem;line-height:1.05}
.corr h3 a{color:inherit;text-decoration:none}
.corr h3 a:hover{color:var(--cts-red-hot)}
.corr dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:.35rem 1rem;font-size:.95rem}
.corr dt{color:var(--cts-faint);text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;padding-top:.25rem}
.corr dd{margin:0;color:var(--cts-muted);line-height:1.6}
@media(max-width:600px){.corr dl{grid-template-columns:1fr}.corr dt{padding-top:.6rem}}
</style>`;

const ld = {
  "@context": "https://schema.org", "@type": "WebPage", name: "Corrections | CrimeTimeSnacks", url: `${SITE}/corrections.html`,
  description: "Every correction made to a CrimeTimeSnacks episode, transcript, post or page, with the date and what changed.",
};

const page = `${head({
  title: "Corrections | CrimeTimeSnacks",
  description: "Every correction made to a CrimeTimeSnacks episode, transcript, post or page: the date, what was wrong, and what changed.",
  canonicalPath: "/corrections.html",
  extraHead: `${css}\n    <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
})}
<body>
${header("about")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">The Record, Corrected</p>
            <h1 class="page-title">Corrections</h1>
            <p>What was wrong, where, and what changed. Nothing here is edited away quietly.</p>
        </div>
    </section>
${tape()}
    <section class="container" style="margin-top:1rem;max-width:860px;">
        <p style="color:var(--cts-muted);">A true crime show gets things wrong sometimes. The rule here is that a mistake in a published episode, transcript, post or page is fixed and then logged on this page with the date, so anyone who heard or read the wrong version can find out. If you have found one, write to <a href="mailto:${EMAIL}?subject=Correction">${EMAIL}</a>.</p>
        ${items.length ? `<ol class="corr">
${items.map((c) => `            <li>
                <time datetime="${esc(c.date)}">${esc(fmtDate(c.date))}</time>
                <h3>${c.url ? `<a href="${esc(c.url)}">${esc(c.where)}</a>` : esc(c.where)}</h3>
                <dl>
                    <dt>Wrong</dt><dd>${esc(c.wrong)}</dd>
                    <dt>Fixed</dt><dd>${esc(c.fixed)}</dd>
                </dl>
            </li>`).join("\n")}
        </ol>` : `<p class="empty-note" style="color:var(--cts-faint);font-style:italic;margin-top:1.4rem;">Nothing logged yet.</p>`}
    </section>
    </main>
${footer()}
${scripts()}
</body>
</html>
`;

await writeFile(join(ROOT, "corrections.html"), page, "utf8");
console.log(`corrections.html generated: ${items.length} entries.`);
