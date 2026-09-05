// Shared page shell for CrimeTimeSnacks — ONE source of truth for the <head>,
// header, footer, tape divider and script tags used by every generated page.
// The 2026 redesign lives here: change it once, run build-all, whole site updates.

export const SITE = "https://www.crimetimesnacks.com";
export const APPLE = "https://podcasts.apple.com/us/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400";
export const SPOTIFY = "https://open.spotify.com/show/6wbA1mrLHjEegphMPnsAiZ";
export const EMAIL = "crimetimesnacks@gmail.com";
export const CSS = "/css/style.css?v=2026r";
export const FA = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
export const FONTS = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap";

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const NAV = [
  ["/index.html", "home", "Home"],
  ["/episodes.html", "episodes", "Episodes"],
  ["/cases.html", "cases", "Cases"],
  ["/videos.html", "videos", "Videos"],
  ["/blog.html", "blog", "Blog"],
  ["/live.html", "live", "Live"],
  ["/quiz.html", "quiz", "Quizzes"],
  ["/merch.html", "merch", "Merch"],
  ["/about.html", "about", "About"],
  ["/contact.html", "contact", "Contact"],
];

// <head> block. opts: { title, description, canonicalPath, ogImage, ogType,
//                       extraHead, noindex }
export function head(opts = {}) {
  const title = opts.title || "CrimeTimeSnacks • A True Crime Podcast";
  const description =
    opts.description ||
    "CrimeTimeSnacks is a true crime podcast exploring unsolved cases, murders, and mysteries with detailed analysis and compelling storytelling.";
  const canonical = `${SITE}${opts.canonicalPath || "/"}`;
  const ogImage = opts.ogImage || `${SITE}/images/logo.png`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="author" content="Cory">
    ${opts.noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large">'}
    <link rel="canonical" href="${canonical}">
    <meta name="theme-color" content="#050505">
    <meta property="og:type" content="${opts.ogType || "website"}">
    <meta property="og:site_name" content="CrimeTimeSnacks">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${esc(ogImage)}">
    <meta property="og:image:alt" content="CrimeTimeSnacks — A True Crime Podcast">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(description)}">
    <meta name="twitter:image" content="${esc(ogImage)}">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Podcast" href="/feed.xml">
    <link rel="alternate" type="application/rss+xml" title="CrimeTimeSnacks Blog" href="/blog-feed.xml">
    <link rel="icon" href="/favicon.ico" type="image/x-icon">
    <link rel="apple-touch-icon" href="/images/logo.png">
    <link rel="manifest" href="/site.webmanifest">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossorigin>
    <link rel="dns-prefetch" href="https://cdnjs.cloudflare.com">
    <meta name="format-detection" content="telephone=no">
    <link href="${FONTS}" rel="stylesheet">
    <link rel="stylesheet" href="${FA}">
    <link rel="stylesheet" href="${CSS}">${opts.extraHead || ""}
</head>`;
}

// Sticky glass header. active: nav key.
export function header(active = "") {
  return `    <a href="#main-content" class="skip-link">Skip to main content</a>
    <header>
        <div class="nav-container container">
            <div class="logo-container">
                <a href="/index.html" aria-label="CrimeTimeSnacks home">
                    <img src="/images/logo.png" alt="CrimeTimeSnacks Logo" height="42" width="42">
                    <span class="logo-word">Crime<em>Time</em>Snacks<span class="logo-sub">A True Crime Podcast</span></span>
                </a>
            </div>
            <button id="mobile-menu-btn" class="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="primary-nav"><i class="fas fa-bars" aria-hidden="true"></i></button>
            <nav id="primary-nav" aria-label="Primary">
                <ul class="nav-menu">
${NAV.map(([href, key, label]) => `                    <li><a href="${href}"${key === active ? ' class="active" aria-current="page"' : ""}>${label}</a></li>`).join("\n")}
                </ul>
            </nav>
            <div class="utility-nav">
                <a href="/search.html" aria-label="Search the site" style="color:var(--cts-muted);font-size:1.05rem;padding:0.6rem;display:inline-flex;"><i class="fas fa-magnifying-glass" aria-hidden="true"></i></a>
                <a class="nav-cta" href="/listen.html"><i class="fas fa-headphones" aria-hidden="true"></i> Listen</a>
            </div>
        </div>
    </header>`;
}

// Caution-tape section divider.
export const tape = (reverse = false) =>
  `    <div class="crime-scene-tape${reverse ? " crime-scene-tape--reverse" : ""}" aria-hidden="true"></div>`;

// Footer. opts: { spotifyUrl } (falls back to the show URL)
export function footer(opts = {}) {
  const spotify = opts.spotifyUrl || SPOTIFY;
  const year = new Date().getFullYear();
  return `    <footer class="footer">
        <span class="footer-watermark" aria-hidden="true">SNACKS</span>
        <div class="container">
            <div class="footer-content">
                <div>
                    <img src="/images/logo.png" alt="CrimeTimeSnacks Logo" class="footer-logo">
                    <p>A true crime podcast exploring unsolved cases and mysteries with detailed analysis and compelling storytelling. Researched, written, and hosted by Cory.</p>
                    <div class="footer-social">
                        <a href="${spotify}" aria-label="Spotify" target="_blank" rel="noopener"><i class="fab fa-spotify" aria-hidden="true"></i></a>
                        <a href="${APPLE}" aria-label="Apple Podcasts" target="_blank" rel="noopener"><i class="fab fa-apple" aria-hidden="true"></i></a>
                        <a href="/feed.xml" aria-label="RSS feed"><i class="fas fa-rss" aria-hidden="true"></i></a>
                        <a href="mailto:${EMAIL}" aria-label="Email CrimeTimeSnacks"><i class="fas fa-envelope" aria-hidden="true"></i></a>
                    </div>
                </div>
                <div>
                    <h3 class="footer-heading">Case Files</h3>
                    <ul class="footer-links">
                        <li><a href="/episodes.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Episodes</a></li>
                        <li><a href="/videos.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Videos</a></li>
                        <li><a href="/blog.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Crime Blog</a></li>
                        <li><a href="/live.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Live Cases</a></li>
                        <li><a href="/quiz.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Quizzes</a></li>
                        <li><a href="/glossary.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Glossary</a></li>
                    </ul>
                </div>
                <div>
                    <h3 class="footer-heading">The Show</h3>
                    <ul class="footer-links">
                        <li><a href="${APPLE}" target="_blank" rel="noopener"><i class="fab fa-apple" aria-hidden="true"></i> Apple Podcasts</a></li>
                        <li><a href="${spotify}" target="_blank" rel="noopener"><i class="fab fa-spotify" aria-hidden="true"></i> Spotify</a></li>
                        <li><a href="/merch.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> Merch</a></li>
                        <li><a href="/about.html"><i class="fas fa-chevron-right" aria-hidden="true"></i> About</a></li>
                        <li><a href="mailto:${EMAIL}?subject=Case%20suggestion%20for%20CrimeTimeSnacks"><i class="fas fa-folder-plus" aria-hidden="true"></i> Suggest a Case</a></li>
                    </ul>
                </div>
                <div class="footer-newsletter">
                    <h3 class="footer-heading">The Case File</h3>
                    <p>One bite-size case brief and every new episode — twice a week, no spam.</p>
                    <input type="email" inputmode="email" autocomplete="email" aria-label="Email address" placeholder="Your email address">
                    <button class="btn btn-primary" style="width: 100%;">Get the Case File</button>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${year} CrimeTimeSnacks. All Rights Reserved. Made with respect for victims and their families.</p>
                <span class="crisis">If you have information about an unsolved case, contact your local authorities or <a href="https://tips.fbi.gov" target="_blank" rel="noopener" style="color:inherit;">tips.fbi.gov</a>.</span>
            </div>
        </div>
    </footer>`;
}

// Script tags. extras: array of additional script srcs.
export function scripts(extras = []) {
  const tags = ["/js/main.js", "/js/effects.js", ...extras]
    .map((s) => `    <script src="${s}"></script>`)
    .join("\n");
  return tags;
}
