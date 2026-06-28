// Generates real, print-ready SVG merch ART in the CrimeTimeSnacks brand.
// Not centered text — each design is a procedural graphic (police tape, evidence
// tag, fingerprint, case file, chalk outline) built from code, so every slogan
// gets a distinct piece of art. Transparent background = prints on dark garments.
// Editable vector you OWN — drop straight into Printful/Printify or Illustrator.

const RED = "#e11d2a";
const WHITE = "#f5f5f5";
const GREY = "#9a9a9a";
const TAPE = "#f4c20d";
const INK = "#0a0a0a";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const hash = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
};

// Stack the slogan's words as bold lines, sized to fit, last word in red.
function slogan(lines, { cx = 500, cy = 500, max = 760, color = WHITE, accent = RED } = {}) {
  const longest = Math.max(...lines.map((l) => l.length));
  const n = lines.length;
  let size = Math.max(46, Math.min(150, Math.floor(max * 1.85 / longest)));
  // Clamp by vertical room so the centered block always stays inside the
  // 1000-tall canvas (fixes tall 3-line slogans clipping off the bottom).
  const budget = 2 * Math.min(cy - 60, 970 - cy);
  size = Math.max(40, Math.min(size, Math.floor(budget / (n * 1.12))));
  const lineH = size * 1.05;
  const startY = cy - (lineH * (lines.length - 1)) / 2 + size * 0.34;
  return lines
    .map((l, i) => {
      const y = startY + i * lineH;
      const fill = i === lines.length - 1 ? accent : color;
      return `    <text x="${cx}" y="${y.toFixed(0)}" font-family="'Montserrat','Arial Black',Impact,sans-serif" font-weight="900" font-size="${size}" letter-spacing="1.5" fill="${fill}" text-anchor="middle">${esc(l.toUpperCase())}</text>`;
    })
    .join("\n");
}

const wordmark = (y, fill = WHITE) =>
  `    <text x="500" y="${y}" font-family="'Montserrat',Arial,sans-serif" font-weight="700" font-size="30" letter-spacing="12" fill="${fill}" text-anchor="middle">CRIMETIMESNACKS</text>`;

// ---- Templates -------------------------------------------------------------

function tplPoliceTape(lines) {
  const repeat = "CRIME SCENE • DO NOT CROSS • ";
  const tapeText = repeat.repeat(6);
  const band = (y, rot) => `
    <g transform="rotate(${rot} 500 ${y})">
      <rect x="-160" y="${y - 46}" width="1320" height="92" fill="${TAPE}"/>
      <rect x="-160" y="${y - 46}" width="1320" height="4" fill="${INK}"/>
      <rect x="-160" y="${y + 42}" width="1320" height="4" fill="${INK}"/>
      <text x="-150" y="${y + 11}" font-family="'Montserrat',Arial,sans-serif" font-weight="800" font-size="34" letter-spacing="2" fill="${INK}">${tapeText}</text>
    </g>`;
  return `${band(250, -12)}${band(770, 9)}
${wordmark(170)}
${slogan(lines, { cy: 510, max: 720 })}`;
}

function tplEvidenceTag(lines) {
  return `
    <g>
      <line x1="500" y1="70" x2="500" y2="190" stroke="${WHITE}" stroke-width="5"/>
      <circle cx="500" cy="60" r="14" fill="none" stroke="${WHITE}" stroke-width="6"/>
      <rect x="180" y="190" width="640" height="640" rx="26" fill="none" stroke="${WHITE}" stroke-width="8"/>
      <circle cx="500" cy="250" r="20" fill="none" stroke="${WHITE}" stroke-width="7"/>
      <rect x="210" y="300" width="580" height="74" fill="${RED}"/>
      <text x="500" y="352" font-family="'Montserrat',Arial,sans-serif" font-weight="800" font-size="44" letter-spacing="10" fill="${WHITE}" text-anchor="middle">EVIDENCE</text>
${slogan(lines, { cy: 540, max: 560 })}
      <text x="500" y="780" font-family="'Roboto',monospace,Arial" font-weight="500" font-size="26" letter-spacing="6" fill="${GREY}" text-anchor="middle">CASE NO. CTS-001</text>
    </g>`;
}

function tplFingerprint(lines) {
  // Concentric whorl loops approximate a thumbprint.
  let loops = "";
  for (let i = 0; i < 13; i++) {
    const rx = 60 + i * 17;
    const ry = 78 + i * 21;
    const dash = i % 2 === 0 ? "" : ` stroke-dasharray="${28 + i * 4} ${14}"`;
    loops += `\n      <ellipse cx="500" cy="350" rx="${rx}" ry="${ry}" fill="none" stroke="${i % 5 === 0 ? RED : WHITE}" stroke-width="6"${dash}/>`;
  }
  return `
    <g>${loops}
      <path d="M500 250 q40 60 0 130" fill="none" stroke="${RED}" stroke-width="6"/>
    </g>
${wordmark(660)}
${slogan(lines, { cy: 800, max: 720 })}`;
}

function tplCaseFile(lines) {
  return `
    <g>
      <path d="M230 250 h220 l40 50 h280 v440 h-540 z" fill="none" stroke="${WHITE}" stroke-width="9"/>
      <text x="500" y="370" font-family="'Montserrat',Arial,sans-serif" font-weight="900" font-size="56" letter-spacing="6" fill="${WHITE}" text-anchor="middle">CASE FILE</text>
      <g transform="rotate(-11 500 470)">
        <rect x="300" y="420" width="400" height="100" fill="none" stroke="${RED}" stroke-width="7"/>
        <rect x="312" y="432" width="376" height="76" fill="none" stroke="${RED}" stroke-width="3"/>
        <text x="500" y="488" font-family="'Montserrat',Arial,sans-serif" font-weight="900" font-size="52" letter-spacing="8" fill="${RED}" text-anchor="middle">UNSOLVED</text>
      </g>
${slogan(lines, { cy: 640, max: 520 })}
    </g>
${wordmark(880, GREY)}`;
}

function tplChalkOutline(lines) {
  // Stylised chalk body outline.
  const body = `M500 250 c-46 0 -70 36 -56 76 c-70 18 -120 70 -120 150 l-30 230
    l46 6 l34 -180 l8 250 l-44 230 l46 12 l60 -250 l60 250 l46 -12 l-44 -230
    l8 -250 l34 180 l46 -6 l-30 -230 c0 -80 -50 -132 -120 -150 c14 -40 -10 -76 -56 -76 z`;
  return `
    <g>
      <path d="${body}" fill="none" stroke="${WHITE}" stroke-width="7" stroke-linejoin="round" stroke-dasharray="2 14" stroke-linecap="round"/>
    </g>
${wordmark(150)}
${slogan(lines, { cy: 540, max: 360, color: RED, accent: WHITE })}`;
}

function tplRedacted(lines) {
  // Redacted case document: text lines as bars, some blacked/red out, a stamp.
  const widths = [560, 620, 500, 600, 540, 590, 520];
  let body = "";
  let y = 470;
  for (let i = 0; i < widths.length; i++) {
    body += `\n      <rect x="220" y="${y}" width="${widths[i]}" height="14" rx="3" fill="${GREY}" opacity="0.55"/>`;
    // redact a couple of lines
    if (i === 1) body += `\n      <rect x="300" y="${y - 4}" width="240" height="22" fill="${INK}" stroke="${WHITE}" stroke-width="1.5"/>`;
    if (i === 4) body += `\n      <rect x="420" y="${y - 4}" width="200" height="22" fill="${RED}"/>`;
    y += 42;
  }
  return `
    <g>
      <rect x="190" y="180" width="620" height="640" rx="10" fill="none" stroke="${WHITE}" stroke-width="8"/>
${slogan(lines, { cx: 500, cy: 320, max: 520 })}
      <rect x="220" y="392" width="560" height="4" fill="${RED}"/>${body}
      <g transform="rotate(-13 660 760)">
        <rect x="520" y="715" width="280" height="78" fill="none" stroke="${RED}" stroke-width="6"/>
        <text x="660" y="770" font-family="'Montserrat',Arial,sans-serif" font-weight="900" font-size="40" letter-spacing="4" fill="${RED}" text-anchor="middle">CLASSIFIED</text>
      </g>
    </g>
${wordmark(880, GREY)}`;
}

const TEMPLATES = [tplPoliceTape, tplEvidenceTag, tplFingerprint, tplCaseFile, tplChalkOutline, tplRedacted];

export function designSvg(sloganText, { tagline = "CRIMETIMESNACKS", template } = {}) {
  const lines = sloganText.includes(" / ")
    ? sloganText.split(" / ").map((s) => s.trim())
    : sloganText.trim().split(/\s+/);
  const idx = template != null
    ? template % TEMPLATES.length
    : hash(sloganText) % TEMPLATES.length;
  const art = TEMPLATES[idx](lines);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-label="${esc(sloganText)} CrimeTimeSnacks design">
  <!-- transparent background: prints on dark garments. template #${idx} -->
${art}
</svg>
`;
}

// Tasteful true-crime fan lines — no real victims, no glorifying violence.
export const SLOGAN_POOL = [
  { slogan: "Stay Suspicious", price: "28", template: 0 },
  { slogan: "True Crime / O'Clock", price: "28", template: 1 },
  { slogan: "Trust Your Gut", price: "28", template: 2 },
  { slogan: "Lock The Doors", price: "28", template: 3 },
  { slogan: "The Evidence Speaks", price: "30", template: 4 },
  { slogan: "Case Still Open", price: "28", template: 1 },
  { slogan: "Snacks & / Cold Cases", price: "30", template: 0 },
  { slogan: "Read The / Case Files", price: "30", template: 3 },
  { slogan: "Follow The / Evidence", price: "30", template: 5 },
  { slogan: "Cold Case / Club", price: "28", template: 2 },
  { slogan: "Question / Everything", price: "28", template: 5 },
  { slogan: "Stay Curious", price: "28", template: 4 },
  { slogan: "Check The / Alibi", price: "28", template: 1 },
  { slogan: "Motive / Means / Opportunity", price: "30", template: 5 },
  { slogan: "Mind The / Details", price: "28", template: 2 },
  { slogan: "Never / Closed", price: "28", template: 3 },
];

export const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
