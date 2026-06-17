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

## How to add content now
Edit `automation/blog.json` or `automation/episodes.json`, then:

```
node automation/build-all.mjs
git add -A && git commit -m "..." && git push
```
