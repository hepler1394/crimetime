# CrimeTimeSnacks — Full Automation Guide

> 2026-09 update: the show now has a **podcast studio** (`npm run studio`) that
> writes, voices, designs and publishes an episode a week, with a fact-check gate
> before anything goes public. Read `STUDIO.md`. Episodes it publishes appear in
> `feed.xml`, the episode pages, search and the Instagram kit automatically.

> 2026-07 update: the site now runs TWICE A WEEK (Tue + Fri) in Cory's voice
> (see `voice.md`), with a live FBI case board, auto-quizzes, and a shared
> design shell (`shell.mjs`). Dashboard: /dashboard.html. Cron: cron/README.md.

This is the "press one button and my whole website updates" system. It runs on
the static site you already have, costs ~$0 to run (local LLM first), and keeps
zero API keys in anything that ships to the browser.

---

## The one button

```
node automation/weekly-update.mjs --commit --push
```

That single command does all of this, in order:

1. **Podcast** — pulls your latest episodes from the live feed (`import-feed.mjs`).
2. **YouTube** — pulls your latest uploads + Shorts (`import-youtube.mjs`).
3. **Live board** — refreshes FBI Most Wanted + missing persons (`import-fbi.mjs`).
4. **Blog** — writes one fresh post in Cory's voice (`ai-write.mjs --auto`).
5. **Merch** — drops one new print-ready design (`gen-merch.mjs --ai`).
6. **Quiz** — writes a new 5-question case quiz (`gen-quiz.mjs`).
7. **Rebuild** — regenerates every page from the JSON (`build-all.mjs`).
8. **QA** — checks internal links (`check-links.mjs`).
9. **Publish** — commits and pushes. Vercel auto-deploys `www.crimetimesnacks.com`.

Network/LLM steps are best-effort: if you're offline or the LLM is down, that
step is skipped and the site still rebuilds from what's on disk. Nothing breaks.

---

## Make it automatic (every week, hands-off)

Register the scheduled job once (Windows, per-user, no admin):

```
schtasks /create /tn "CTS Content Tue" /sc WEEKLY /d TUE /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-content.ps1"

schtasks /create /tn "CTS Content Fri" /sc WEEKLY /d FRI /st 09:00 ^
  /tr "powershell -NoProfile -ExecutionPolicy Bypass -File D:\dev\github\crimetime\automation\cron\cts-content.ps1"
```

That's it. Every Tuesday and Friday at 9am the site writes, rebuilds, and
redeploys itself — in your voice. (GitHub Actions runs the same pipeline in the
cloud Tue/Fri + a feed sync every 6 hours, so it works even with the PC off.)
Remove later with: `schtasks /delete /tn "CTS Content Tue" /f` (and Fri)

Logs land in `automation/cron/cron.log`.

---

## Turn on YouTube auto-pull (one line, no API key)

The Videos page is driven by `automation/videos.json`. Today it has one curated
video. To make it auto-pull **your** channel's uploads forever, open
`automation/config.json` and set your handle:

```json
"youtube": { "handle": "@YourChannel", "shortsPlaylistId": "", "maxVideos": 24 }
```

- No API key needed — it reads YouTube's public RSS feed.
- `handle` OR `channelId` (either works).
- Anything marked `"curated": true` in `videos.json` is kept and never overwritten.
- **Shorts:** make a YouTube playlist of your Shorts and paste its id into
  `shortsPlaylistId`. Videos in it render in the vertical 9:16 Shorts rail.
  (Failing that, any title/description with `#shorts` is auto-detected.)

Then: `node automation/import-youtube.mjs` (or just let the weekly job do it).

---

## How your existing tools plug in

You already pay for these — here's where each one slots into the pipeline. The
golden rule: **every tool's job is to write into a JSON file or upload to
YouTube. The build scripts do the rest.**

### Opus.pro / opus-clip → Shorts
1. Feed Opus.pro a long video (an episode recording, a case deep-dive).
2. It produces vertical Short clips.
3. Upload those Shorts to your YouTube channel, in your **Shorts playlist**.
4. The next `import-youtube.mjs` run pulls them into the site's Shorts rail
   automatically. You never touch HTML.

### Manus AI → research + long-form drafts
- Use Manus for the heavy lifting: research a case, draft an episode script, or
  draft a long blog post with sources.
- Output goes into `automation/blog.json` as a post object
  (`{ slug, title, date, category, excerpt, body: [paragraphs] }`), then
  `node automation/build-blog.mjs`. Or paste the topic and let `ai-write.mjs`
  expand it.
- Keep the house style: measured, factual, no sensationalism, no emojis.

### Gemini / NotebookLM Pro → sources & summaries
- NotebookLM is great for grounding: drop case PDFs/articles in, get a sourced
  summary, and use that as the **input** to a blog post or episode script so the
  facts are right.
- Note: the old Gemini *key* was compromised and is retired here. Use Gemini
  through its own app/NotebookLM, not wired into this repo. The repo's LLM calls
  go local-first (LM Studio) → DeepSeek → Claude → OpenAI (see `llm.mjs`).

### n8n → the orchestrator / glue (optional, more advanced)
n8n is the layer that can run all of the above on a schedule or a webhook
without you at the keyboard. A typical weekly flow:

1. **Cron node** (weekly) →
2. **RSS node** watches your YouTube channel for new uploads →
3. **(optional) Opus.pro / HTTP node** to generate Shorts →
4. **Execute Command node** runs `node automation/weekly-update.mjs --commit --push`
   on this machine (or a **GitHub node** triggers it in CI) →
5. Vercel auto-deploys.

If you'd rather keep it simple, skip n8n entirely — the Windows scheduled task
above already gives you the weekly hands-off loop.

---

## What writes what (the seams)

| You / your tool write… | Run this…                     | And the site gets…              |
|------------------------|-------------------------------|---------------------------------|
| (nothing — your channel)| `import-youtube.mjs`         | Videos page + Shorts rail       |
| (nothing — your feed)  | `import-feed.mjs`             | Episodes page + podcast RSS     |
| a topic / `blog.json`  | `ai-write.mjs` / `build-blog` | Blog post + homepage preview    |
| (nothing — auto)       | `gen-merch.mjs`              | Merch designs (real SVG files)  |
| —                      | `build-all.mjs`              | Rebuilds everything + sitemap   |
| —                      | `weekly-update.mjs`          | **All of the above + publish**  |

No API keys ever touch the browser. All AI runs server-side, local-first.

---

## Command reference

```
node automation/weekly-update.mjs --commit --push   # THE button (full refresh + publish)
node automation/import-youtube.mjs                  # refresh Videos from your channel
node automation/import-feed.mjs                     # refresh Episodes from your podcast
node automation/ai-write.mjs --auto                 # write next blog post from the calendar
node automation/ai-write.mjs "The Delphi case" investigation
node automation/gen-merch.mjs                       # ensure base merch designs exist
node automation/gen-merch.mjs --ai 3                # add 3 AI-written merch slogans
node automation/build-all.mjs                       # rebuild every page from JSON
node automation/check-links.mjs                     # QA internal links
node automation/test-build.mjs                      # CI-style smoke test (build + assert)
```

Or via npm: `npm run weekly` · `npm run build:all` · `npm run videos` · `npm run merch`
· `npm run blog` · `npm run qa` · `npm test`.

### Editorial calendar
`automation/topics.json` is the blog backlog. `ai-write.mjs --auto` publishes the
next unused topic (tracked per post), so the auto-blog follows a plan instead of
repeating. Add your own topics any time.

### Run it in the cloud instead of your PC (optional)
`.github/workflows/weekly.yml` runs the same pipeline weekly on GitHub's servers
(schedule + manual dispatch, no push trigger so it can't loop). Add a
`DEEPSEEK_API_KEY` or `ANTHROPIC_API_KEY` repo secret to enable the AI steps in
CI, and a `YT_HANDLE` secret to auto-pull videos. Without secrets it still
refreshes feeds, rebuilds, and pushes.

## Merch designs

`gen-merch.mjs` writes **real editable SVG art** to `images/merch/` (brand black
+ red, bold type). These are yours — open them in Illustrator/Inkscape or upload
straight to Printful/Printify to make actual products. The Merch page is an
honest gallery + "Notify" until you wire a print-on-demand store; it does not
fake a checkout.
