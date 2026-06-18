# CrimeTimeSnacks — where to go next

Snapshot of the 2026 AI relaunch. The site is `D:\dev\github\crimetime`
(static, deploys to crimetime.vercel.app on push to `main`). Keep the existing
look. No emojis, no AI slop, no robotic copy, AI kept discreet.

## Already done (live)
- 2026 sitewide; two-column render-ready hero.
- Automated content pipeline: `node automation/build-all.mjs`
  (`episodes.json` → feed.xml; `blog.json` → blog + posts + homepage preview;
  meta injection; sitemap + robots). No client-side AI, no embedded keys.
- 8 blog posts; podcast RSS at `/feed.xml`; 404 page; OG/social meta sitewide;
  `vercel.json` security headers.
- Security: removed hardcoded Gemini + Brave API keys from served files.

## Next, in priority order
1. **Add `images/renders.png`** — the phones promo render. It auto-swaps into
   the hero (right card currently falls back to the logo).
2. **Rotate the exposed API keys** — Gemini + Brave were public and are in git
   history. Regenerate them, then keep replacements server-side only.
3. **Real Spotify show URL** — replace the dead `#` Spotify links. (Apple ID is
   1655384400; Spotify URL unknown — do not fabricate.)
4. **AI writer / Hermes hook** — a cron job that writes new entries into
   `blog.json` / `episodes.json` (Claude, server-side), runs `build-all`, and
   commits. This is the last "fully automated" piece.
5. **Feed migration off Anchor** — preserve every existing episode GUID and set
   `itunes:new-feed-url`, then resubmit to Apple/Spotify so subscribers keep
   their history. Deliberate step — verify before flipping.

## Known cleanup (low priority, not blocking, left for a human call)
- **Orphaned duplicate pages.** The canonical episode pages live in `/episodes/`
  (every live link points there). The root-level case pages
  (`menendez-brothers.html`, `jonbenet-ramsey-part-1.html`, etc.) and the
  `/episodes/` copies of site pages (`episodes/about.html`, etc.) are unlinked
  duplicates with broken relative paths. Not indexed (excluded from sitemap),
  but they could be deleted. Verify nothing external links to them first.
- **Merch placeholders.** `merch.html` references placeholder product images
  (`t-shirt-placeholder.png`, etc.) that were never added.
- **Forms need a backend (2-min fix).** The contact form + newsletter signups
  don't submit yet. Best privacy-safe option: sign up free at web3forms.com (your
  email stays on their side, NOT in the page). It gives an access key UUID; paste
  it and add `action="https://api.web3forms.com/submit"` +
  `<input type="hidden" name="access_key" value="UUID">` to each form. Tell Claude
  the key and it'll wire all forms. Gmail intentionally not exposed; fake
  `@crimetimesnack.com` emails removed.
- All dead `#` placeholder links removed (social/iHeart/Amazon). Add real social
  URLs when you have handles.
- Run `node automation/check-links.mjs` any time to re-audit broken local refs.

## How to add content now
Edit `automation/blog.json` or `automation/episodes.json`, then:

```
node automation/build-all.mjs
git add -A && git commit -m "..." && git push
```
