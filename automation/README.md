# CrimeTimeSnacks automation

Static, key-free content pipeline. Edit a JSON source, run a script, deploy.
Nothing here changes the site's look — it only generates content into the
existing design.

## One command

```
node automation/build-all.mjs
```

Runs all three generators below.

## Sources of truth

| File            | Generates                                              |
|-----------------|--------------------------------------------------------|
| `episodes.json` | `feed.xml` — Apple/Spotify podcast RSS                  |
| `blog.json`     | `blog.html`, `blog-posts/*.html`, homepage preview     |
| (page scan)     | `sitemap.xml`, `robots.txt`                            |

## Scripts

- `build-feed.mjs` — podcast RSS from `episodes.json`.
- `build-blog.mjs` — blog page + per-post pages, and refreshes the homepage
  region between `<!-- BLOG-PREVIEW:START -->` / `<!-- BLOG-PREVIEW:END -->`.
- `build-sitemap.mjs` — `sitemap.xml` + `robots.txt` from pages on disk.

## Adding content

1. Add an entry to `episodes.json` (with the audio file in `/audio/`) or
   `blog.json`.
2. `node automation/build-all.mjs`.
3. Commit and deploy.

This is the seam the AI writer / Hermes will fill automatically: it writes the
JSON, runs the build, and the new episode or post is published. No API keys are
ever embedded in the served site — any AI calls happen server-side with keys in
environment variables.

## Note on publishing

`feed.xml` is a self-hosted feed and does **not** change the live Anchor feed.
Pointing Apple/Spotify at it is a deliberate migration that must preserve all
existing episode GUIDs so current subscribers don't break.
