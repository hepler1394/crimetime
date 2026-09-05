# The Podcast Studio

The studio is the local control room for putting out an episode a week without
touching HTML, RSS, or ffmpeg by hand. It lives in `automation/studio/` and runs
only on this PC (it drives LM Studio, edge-tts, ffmpeg and git), so it is never
deployed.

```
npm run studio          ->  http://127.0.0.1:4177
```

## The pipeline, one button per stage

| Stage | Script | What it makes |
|---|---|---|
| 1 Script | `episode-draft.mjs` | `episode.json`: title, hook, show notes, the spoken script as paragraphs, a **facts-to-verify** list, an Instagram caption. Local LM Studio model first (streamed, think mode off), cloud fallback. Voice rules from `voice.md`. |
| 2 Voice | `episode-voice.mjs` | `episode.mp3` (128k mono, -16 LUFS, half-second head room) and `transcript.json` timed from the TTS word boundaries. Or `--from <file>` to master a recording Cory made instead. |
| 3 Art | `episode-art.mjs` | `cover.jpg` 3000 square, `card.jpg` 1080x1350, `reel.jpg` 1080x1920. Rendered from `studio/templates/art.html` with Playwright (borrowed from ig-studio). |
| 4 Instagram | `episode-social.mjs` | `reel.mp4` 45-second audiogram with a live waveform, -14 LUFS, plus `caption.txt`. |
| 5 Publish | `episode-publish.mjs` | MP3 to `/audio`, art to `/images/episodes`, transcript to `automation/transcripts`, entry in `studio-episodes.json`, then `build-all`, link check, commit, `--push`. |

Drafts live in `automation/studio/drafts/<date>-<slug>/` (gitignored: the
renders are large and the published copies are what ship).

Every script takes `--json` and prints one JSON object as its last line; the
studio server reads that. They also run fine on their own:

```
node automation/episode-draft.mjs --auto --minutes 10
node automation/episode-voice.mjs 2026-09-08-the-golden-state-killer
node automation/episode-art.mjs   2026-09-08-the-golden-state-killer
node automation/episode-social.mjs 2026-09-08-the-golden-state-killer
node automation/episode-publish.mjs 2026-09-08-the-golden-state-killer --push
```

## Why publishing stays a click

The script is written by a model. It is told to use only well-documented facts
and to list every specific claim it used, and the studio locks Publish until each
item on that list is ticked. An AI-voiced episode about a real crime goes out
under Cory's name; the ten minutes it takes to read the fact list is the whole
editorial process, and it is not automated on purpose.

## Weekly, hands-off up to that click

`cron/cts-episode.ps1` runs `episode-weekly.mjs` every Monday at 08:00
(Windows task "CTS Episode Draft"): next case from `cases.json`, script, voice,
art, Instagram kit, then a Telegram message to Cory through the Hermes bridge
saying the episode is ready to review. Open the studio, read the script, tick
the facts, press Publish + push. Tuesday's content run and the 6-hour CI sync
pick it up from there.

To trust it unattended, change the task action to add `-AutoPublish`. Not
recommended until a few weeks of drafts have come back clean.

## Two feeds, for now

The site's own `feed.xml` is a complete, valid podcast feed and carries every
episode the studio publishes. Spotify and Apple, however, still poll the old
Anchor feed, so a studio episode reaches them only when its MP3 is also uploaded
in Spotify for Podcasters (the studio shows the file paths and copy buttons for
title and show notes after publishing).

The clean fix is a one-time move: in Spotify for Podcasters, redirect the show to
`https://crimetime.vercel.app/feed.xml`, and in Apple Podcasts Connect change the
feed URL to the same. After that, publishing in the studio is the only step.
`import-feed.mjs` keeps merging whatever the Anchor feed still returns, so
nothing is lost either way.

## Adding cases

`automation/cases.json` is the backlog: slug, title, angle, years. The weekly
job takes the first case with no draft and no episode. Keep it to cases with a
public court record or sustained major-outlet coverage; the model is only as
factual as the record it is asked about.

## Voice

Default is `en-US-AndrewNeural` at rate -3% and pitch -2Hz, which reads closest
to a podcast host among the free Microsoft voices. Change it per draft in the
studio, or set `voice` in `episode.json`. Cory's own recordings go through the
same mastering with `--from`.
