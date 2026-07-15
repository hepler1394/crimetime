#!/usr/bin/env node
// Generates merch.html from merch.json — the Logo Collection (real print files
// of the show's cover art) up top, then the gallery of generated SVG designs.
// Honest CTA (no fake checkout): downloads + notify until the POD store opens.
// Uses the shared 2026 shell. Run: node automation/build-merch.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SITE, esc, head, header, footer, tape, scripts } from "./shell.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let merch;
try {
  merch = JSON.parse(await readFile(join(__dirname, "merch.json"), "utf8"));
} catch {
  console.log("No merch.json yet — run `node automation/gen-merch.mjs` first. Skipping.");
  process.exit(0);
}
const designs = merch.designs || [];
const collection = merch.collection || [];

/* --------------------------------------------------- structured data */
const products = [
  ...collection.map((c) => ({ name: `${c.name} — CrimeTimeSnacks`, image: `${SITE}/${c.file}`, price: c.price })),
  ...designs.map((d) => ({ name: `${d.slogan} — CrimeTimeSnacks`, image: `${SITE}/${d.svg}`, price: d.price })),
];
const merchLd = products.length
  ? `\n    <script type="application/ld+json">\n${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          name: p.name,
          image: p.image,
          brand: { "@type": "Brand", name: "CrimeTimeSnacks" },
          category: "Apparel",
          offers: { "@type": "Offer", price: p.price, priceCurrency: "USD", availability: "https://schema.org/PreOrder" },
        },
      })),
    }, null, 2)}\n    </script>\n    <script type="application/ld+json">\n${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Merch", item: `${SITE}/merch.html` },
      ],
    })}\n    </script>`
  : "";

/* ----------------------------------------------------------- notify link */
const NOTIFY = `onclick="var i=document.querySelector('.footer-newsletter input');if(i){i.focus();i.scrollIntoView({behavior:'smooth',block:'center'});}return false;"`;

/* ------------------------------------------------------- logo collection */
function collectionCard(c) {
  return `            <div class="merch-item">
                <img src="/${esc(c.preview || c.file)}" alt="${esc(c.name)} — CrimeTimeSnacks" class="merch-image" loading="lazy" decoding="async" width="280" height="250">
                <span class="episode-badge" style="margin-bottom:0.6rem;">${esc(c.kind)}</span>
                <h3 style="margin:0.35rem 0;color:var(--cts-white);">${esc(c.name)}</h3>
                <p style="color:var(--cts-muted);font-size:0.88rem;margin:0.3rem 0 0.9rem;">${esc(c.blurb || "")}</p>
                <p class="merch-price">from $${esc(c.price)}</p>
                <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:0.9rem;">
                    <a href="/${esc(c.file)}" download class="btn btn-secondary btn-sm"><i class="fas fa-download" aria-hidden="true"></i> Print File</a>
                    <a href="#notify" ${NOTIFY} class="btn btn-primary btn-sm"><i class="fas fa-bell" aria-hidden="true"></i> Notify Me</a>
                </div>
            </div>`;
}

const collectionSection = collection.length
  ? `    <section class="container" style="margin-top:1rem;">
        <div class="merch-hero">
            <div>
                <p class="eyebrow">The Logo Collection</p>
                <h2 style="font-family:var(--font-display);font-weight:400;text-transform:uppercase;font-size:clamp(2rem,4.4vw,3.2rem);line-height:1;">Wear the <span class="text-red">Cover Art</span></h2>
                <p style="color:var(--cts-muted);margin-top:1rem;max-width:46ch;">The official CrimeTimeSnacks logo — the mic, the snacks, the whole mood — as real, print-ready files. Grab the art now; the print-on-demand store opens soon.</p>
                <div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin-top:1.5rem;">
                    <a href="#notify" ${NOTIFY} class="btn btn-primary"><i class="fas fa-bell" aria-hidden="true"></i> Get First Access</a>
                </div>
            </div>
            <img src="/images/merch/logo-classic-web.jpg" alt="CrimeTimeSnacks cover art print" loading="eager">
        </div>
        <div class="merch-container" style="padding-top:0;">
${collection.map(collectionCard).join("\n")}
        </div>
    </section>

${tape()}`
  : "";

/* ------------------------------------------------------------ design grid */
function card(d) {
  return `            <div class="merch-item">
                <img src="/${esc(d.svg)}" alt="${esc(d.slogan)} — CrimeTimeSnacks design" class="merch-image" loading="lazy" decoding="async" width="280" height="250">
                <h3 style="margin:0.25rem 0;color:var(--cts-white);">${esc(d.slogan)}</h3>
                <div style="display:flex;gap:0.4rem;flex-wrap:wrap;justify-content:center;margin:0.75rem 0;">
                    <span class="episode-badge">Tee</span>
                    <span class="episode-badge">Hoodie</span>
                    <span class="episode-badge">Sticker</span>
                </div>
                <p class="merch-price">from $${esc(d.price)}</p>
                <div style="display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap;margin-top:0.9rem;">
                    <a href="/${esc(d.svg)}" download class="btn btn-secondary btn-sm"><i class="fas fa-download" aria-hidden="true"></i> Design</a>
                    <a href="#notify" ${NOTIFY} class="btn btn-primary btn-sm"><i class="fas fa-bell" aria-hidden="true"></i> Notify</a>
                </div>
            </div>`;
}

const page = `${head({
  title: "Merch | CrimeTimeSnacks",
  description: "Official CrimeTimeSnacks merch — the logo collection plus original true crime tee, hoodie, and sticker designs. Print-ready art, store opening on print-on-demand.",
  canonicalPath: "/merch.html",
  ogImage: `${SITE}/images/merch/logo-classic-web.jpg`,
  extraHead: merchLd,
})}
<body>
${header("merch")}
    <main id="main-content">
    <section class="page-hero">
        <div class="container">
            <p class="eyebrow" style="justify-content:center;">Evidence Locker</p>
            <h1 class="page-title">CrimeTimeSnacks <span class="text-red">Merch</span></h1>
            <p>${esc(merch.meta?.intro || "Original CrimeTimeSnacks prints — new designs drop automatically.")}</p>
        </div>
    </section>

${collectionSection}

    <section class="container" style="margin-top:2.6rem;">
        <div class="section-head">
            <span class="file-no">Drops</span>
            <h2>The Design Vault</h2>
            <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="merch-container">
${designs.map(card).join("\n")}
        </div>
        <p style="text-align:center;color:var(--cts-faint);margin-top:2rem;">Store opening soon on print-on-demand &mdash; tap Notify on any design to get first access.</p>
    </section>
    </main>

${footer()}

${scripts()}
</body>
</html>
`;

await writeFile(join(ROOT, "merch.html"), page, "utf8");
console.log(`merch.html generated: ${collection.length} logo-collection items + ${designs.length} designs.`);
