# CrimeTimeSnacks — where things stand

Snapshot after the **2026-07 full redesign + automation upgrade**. The site is
`D:\dev\github\crimetime` (static, deploys to crimetime.vercel.app on push to
`main`). Black + red, cinematic, runs itself twice a week **in Cory's voice**.

## What shipped in the redesign
- **New design system** (`css/style.css` + `js/effects.js`): smoke + grain
  atmosphere, refined caution tape, red glow, glass nav, Bebas/Inter type,
  rotating headline, count-up stats, 3D card tilt, hero parallax on the phone
  renders, custom audio player skin, review marquee. Reduced-motion safe.
- **One shared shell** (`automation/shell.mjs`): header/footer/head in ONE
  place. Every generator imports it — change it once, `build-all`, done.
- **Live Case Board** (`live.html` + `import-fbi.mjs`): FBI Most Wanted +
  missing persons from the Bureau's free public API. Baked snapshot in
  `automation/fbi.json`, live client-side refresh on top, homepage teaser.
- **Quizzes** (`quiz.html`, `quizzes.json`, `build-quiz.mjs`, `gen-quiz.mjs`):
  interactive scoring + share-your-result; a new AI quiz drops on schedule.
- **Voice profile** (`automation/voice.md`): every AI word (blog, quiz, merch
  slogans) follows Cory's voice. Edit that file to tune the sound of the show.
- **Logo merch** (`images/merch/logo-*.png` + merch.json `collection`): real
  print-ready files of the cover art — tee print, die-cut sticker, poster.
- **Mission Control** (`/dashboard.html`, noindexed): counts, latest drops,
  schedule, content queue, copy-paste commands. Powered by `status.json`.
- Exposed Gemini/Brave keys scrubbed from the docs (STILL ROTATE THEM — they
  live in git history).

## The schedule (runs itself)
- **Tue + Fri 09:00** — full content run (`cts-content.ps1` / CI `weekly.yml`)
- **Every 6 hours** — feed + FBI sync in the cloud (`.github/workflows/sync.yml`)
- **Daily 08:00** — optional local sync (`cts-feedsync.ps1`)
Register the Windows tasks with the commands in `automation/cron/README.md`,
or just let GitHub Actions do it all (add `DEEPSEEK_API_KEY` or
`ANTHROPIC_API_KEY` as a repo secret so CI can write posts/quizzes).

## Next, in priority order
1. **Rotate the old Gemini + Brave keys** — regenerate at their dashboards;
   they were public and are in git history forever.
2. **Custom domain** — crimetimesnacks.com is gone. Best available (checked
   2026-07-15, all free): `crimetimesnacks.show` ($14.99/yr, the pick),
   `.net` ($13.50), `.live` ($3.99 first yr), `ctspodcast.com` ($11.25).
   Buy in Vercel → Domains, attach to the project, done in 10 minutes.
3. **Forms backend (2-min fix)** — newsletter + contact are mailto/no-op until
   you add a free web3forms.com access key.
4. **YouTube auto-pull** — put your handle in `automation/config.json`
   (`youtube.handle`) and the Videos page + Shorts rail fill themselves.
5. **Print-on-demand store** — upload `images/merch/*.png|svg` to
   Printful/Fourthwall, link products from merch.json.
6. **Transcripts + audio search** (the "never re-record" play) — run Whisper
   locally over `audio/`, save transcripts per episode, add search over them.
   Big win for SEO too. Ask Claude to build `transcribe.mjs` next session.
7. **Sponsor kit** — one page with the numbers when they're worth showing.

## How to add content by hand (unchanged)
Edit `automation/blog.json` / `episodes.json` / `quizzes.json`, then:

```
node automation/build-all.mjs
git add -A && git commit -m "..." && git push
```
