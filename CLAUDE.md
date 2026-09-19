# CrimeTimeSnacks (crimetime)

Static true-crime podcast site at https://www.crimetimesnacks.com (Vercel, this
repo, push to main deploys) plus the automation that runs the show. Read
`automation/STUDIO.md` before touching anything under `automation/` or
`studio-shell/`; it is the source of truth for the podcast studio.

## What runs where

- Site pages are generated: edit `automation/*.json` and the `automation/build-*.mjs`
  generators, then `node automation/build-all.mjs`. Never hand-edit generated HTML.
- The podcast studio is local only: `npm run studio` (http://127.0.0.1:4177) or
  the desktop shell `cd studio-shell && npm start`. It runs the pipeline scripts
  `automation/episode-*.mjs` and writes into `automation/studio/drafts/<id>/`
  (gitignored). Publishing copies the finished files into `/audio`,
  `/images/episodes`, `automation/transcripts` and `automation/studio-episodes.json`.
- The RSS feed is `feed.xml` on this site (self-hosted since 2026-09-05; Spotify
  and Apple follow it). `automation/feed-mode.json` keeps `import-feed.mjs` off
  the old Anchor feed. Do not point anything back at Anchor or at crimetime.vercel.app.
- Community (follow a case by email, weekly digest) lives in `api/community/*`
  (Vercel functions) and Supabase tables prefixed `cts_`; schema in
  `automation/community/schema.sql`. Env: `automation/.env.community` locally
  (gitignored), the Vercel project, and GitHub Actions secrets.
- Schedules: Windows tasks "CTS Content Tue/Fri" (content run), "CTS Episode
  Draft" (Mon 08:00, the weekly episode), and GitHub Actions `sync.yml` every 6 h.
  One owner per job; see `automation/cron/README.md`.

## Rules

- Episodes are twenty minutes minimum, in Cory's cloned voice. Publishing is
  automatic and the gate is `automation/episode-verify.mjs`, not a human tick:
  every claim on an episode's fact list must be carried by that episode's own
  `research.md`, or it does not go out. Anything held blocks the publish and lands
  in the draft's `fact-check.md` and in Cory's Telegram. Changed 2026-09-11 at
  Cory's instruction; the manual gate meant finished episodes sat for weeks, which
  was slower rather than safer. A clean gate run means nothing is unsupported, not
  that the episode is right - it cannot see a claim that the notes support but that
  contradicts another line in the same script.
- Always audit the audio. Cory, 2026-09-18, in those words, after the Petito episode had been
  live for six days saying "Capra One" for Capital One and stuttering a word the script never
  had. The fact gate reads text; `automation/episode-audit.mjs` listens: levels on the mp3,
  then a word-level diff of a faster-whisper medium.en transcript of the dry voice against the
  script. `episode-repair.mjs` re-voices only the flagged paragraphs on another seed, checks
  each one, and swaps it in with `episode-splice.mjs` on the silent gaps between paragraphs.
  `episode-publish.mjs` refuses a render that has not been audited clean since it was made.
  This covers re-renders, splices, trailers and reels too. A clean audit means nothing was
  caught, not that a person would find nothing: it cannot hear a wrong vowel, and it cannot
  see a scene told twice. Read the whole script before a five-hour render. Never run the
  audit while a clone render is running; both want every core.
- Case updates publish themselves the same way. The gate is
  `automation/community/update-gate.mjs`, run by `case-watch.mjs`: an update goes onto
  the case page and into the Sunday digest only when its article was read, every name
  and number in it is in that article, and the sentence the model quotes as support is
  actually on the page. Held ones stay pending with the reason in `gate_note`, in the
  studio's Community panel and in Cory's Telegram. Changed 2026-09-13 at Cory's
  instruction; the human queue never approved a single update. The digest only mails
  updates dated within 45 days.
- No emojis anywhere. Plain, specific, factual writing; `automation/voice.md` is
  the voice. Presumption of innocence in every script.
- Secrets never go in the repo: keys live in env vars, `automation/config.json`
  and `automation/.env.community` (both gitignored).
- Scheduled-task wrappers in `automation/cron/*.ps1` must run native commands via
  `cmd /c ... >> log 2>&1`; Windows PowerShell 5.1 turns stderr into fatal errors otherwise.
- Test with `npm test` (build + link check) before pushing.
