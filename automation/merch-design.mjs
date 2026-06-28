// Builds a real, print-ready SVG tee/sticker design in the CrimeTimeSnacks
// brand (black garment, white + red type, crime-scene-tape accent). These are
// editable vector files you OWN — drop the SVG straight into Printful/Printify,
// or open in Illustrator/Inkscape. No fake product photos.

const RED = "#e11d2a";
const WHITE = "#f5f5f5";
const GREY = "#9a9a9a";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// slogan: words split on spaces become stacked lines (classic tee layout).
// Use " / " in the slogan to force a line break that keeps words together.
export function designSvg(slogan, { tagline = "CRIMETIMESNACKS", accent = "last" } = {}) {
  const lines = slogan.includes(" / ")
    ? slogan.split(" / ").map((s) => s.trim())
    : slogan.trim().split(/\s+/);
  const n = lines.length;

  // Fit the longest line within the art width.
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.max(52, Math.min(180, Math.floor(1500 / longest)));
  const lineH = size * 1.04;
  const blockH = lineH * n;
  const startY = 500 - blockH / 2 + size * 0.78;

  const accentIdx = accent === "last" ? n - 1 : accent === "first" ? 0 : Number(accent);

  const text = lines
    .map((l, i) => {
      const y = startY + i * lineH;
      const fill = i === accentIdx ? RED : WHITE;
      return `    <text x="500" y="${y.toFixed(0)}" font-family="'Montserrat','Arial Black',Impact,sans-serif" font-weight="900" font-size="${size}" letter-spacing="2" fill="${fill}" text-anchor="middle">${esc(l.toUpperCase())}</text>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="${esc(slogan)} design">
  <!-- transparent background: prints on dark garments -->
  <g>
    <rect x="180" y="150" width="640" height="8" fill="${RED}"/>
    <text x="500" y="138" font-family="'Montserrat',Arial,sans-serif" font-weight="700" font-size="34" letter-spacing="14" fill="${WHITE}" text-anchor="middle">${esc(tagline.toUpperCase())}</text>
${text}
    <rect x="320" y="${(startY + (n - 1) * lineH + size * 0.45).toFixed(0)}" width="360" height="6" fill="${RED}"/>
    <text x="500" y="900" font-family="'Montserrat',Arial,sans-serif" font-weight="600" font-size="26" letter-spacing="8" fill="${GREY}" text-anchor="middle">TRUE CRIME PODCAST</text>
  </g>
</svg>
`;
}

// A built-in pool so the generator works fully offline (no LLM required).
// Tasteful true-crime fan lines — no real victims, no glorifying violence.
export const SLOGAN_POOL = [
  { slogan: "Stay Suspicious", tagline: "CRIMETIMESNACKS", price: "28" },
  { slogan: "True Crime / O'Clock", tagline: "CRIMETIMESNACKS", price: "28" },
  { slogan: "Trust Your Gut", tagline: "CRIMETIMESNACKS", price: "28" },
  { slogan: "Lock The Doors", tagline: "CRIMETIMESNACKS", price: "28" },
  { slogan: "The Evidence Speaks", tagline: "CRIMETIMESNACKS", price: "30" },
  { slogan: "Case Still Open", tagline: "CRIMETIMESNACKS", price: "28" },
  { slogan: "Snacks & / Cold Cases", tagline: "CRIMETIMESNACKS", price: "30" },
  { slogan: "Read The / Case Files", tagline: "CRIMETIMESNACKS", price: "30" },
];

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
