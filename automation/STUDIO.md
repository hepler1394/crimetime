# The Podcast Studio

The studio is the local control room for putting out a twenty-minute episode
a week without touching Audacity, HTML, RSS, or ffmpeg by hand. It lives in
`automation/studio/` and runs only on this PC (it drives LM Studio, Chatterbox,
edge-tts, ffmpeg and git), so it is never deployed.

```
npm run studio          ->  http://127.0.0.1:4177
```

## One episode, start to finish

1. **New.** Type a case or leave the box empty for the next one in the backlog,
   press New, then walk away. The studio researches it (the full Wikipedia
   article plus the text of the top coverage pages), outlines the episode into
   chapters, writes each chapter from the notes that match it, and fact-checks
   each chapter against those notes. On this CPU a twenty-minute script takes
   an hour or more; nothing needs you until it is done.
2. **Read it.** Fix anything in the script box. The fact list on the right marks
   every claim the notes do not support; tick each one after you confirm it.
3. **Voice.** Press Make voice. Default is your cloned voice (Chatterbox, free,
   on this CPU: roughly five hours for twenty minutes; start it and leave it). Or press Record and read the
   script yourself; long pauses are trimmed, noise reduced, and the theme is
   mixed in either way. Or drop in a file you recorded elsewhere.
4. **Art, Instagram.** One button each: 3000 square cover, 1080x1350 card,
   1080x1920 reel still, then a 45-second audiogram reel and caption.
5. **Publish.** The big button. Site page, feed.xml, transcript, search, commit,
   push. Vercel deploys. It stays locked until voice and art exist and every
   fact is ticked.

After publishing the episode panel shows where it is: site and feed done,
Spotify and Apple pick it up from the feed, Instagram assets are in the folder
with the caption.

## The pipeline scripts

| Stage | Script | What it makes |
|---|---|---|
| 0 Research | `episode-research.mjs` | `research.md` + `research.json`: full Wikipedia article(s) split by section, plus the article text of the top four coverage pages. No keys. |
| 1 Script | `episode-draft.mjs` | `episode.json`: title, hook, show notes, the script in chapters, fact list, caption. Outline pass, then one write pass and one fact-check pass per chapter, each fed only the research chunks that match the chapter (keyword retrieval), so the model's 8k context never overflows. |
| both | `episode-new.mjs` | Research then script, what the New button and the weekly job run. |
| 2 Voice | `episode-voice.mjs` | `episode.mp3` (-16 LUFS, theme mixed), `voice.wav` (dry), `transcript.json`. Engines: `clone` (Chatterbox + `voice/cory-reference.wav`), `edge` (edge-tts), or `--from <file>` for a recording. |
| theme | `episode-music.mjs` | Intro (9 s) and outro (6 s) beds. Your `studio/music/intro.mp3` and `outro.mp3` if present, else an original synthesized theme. |
| 3 Art | `episode-art.mjs` | `cover.jpg`, `card.jpg`, `reel.jpg` from `studio/templates/art.html` via Playwright (borrowed from ig-studio). |
| 4 Instagram | `episode-social.mjs` | `reel.mp4` audiogram (-14 LUFS) and `caption.txt`. |
| 5 Publish | `episode-publish.mjs` | MP3 to `/audio`, art to `/images/episodes`, transcript to `automation/transcripts`, entry in `studio-episodes.json`, `build-all`, link check, commit, `--push`. |
| weekly | `episode-weekly.mjs` | Research, script, voice, art, Instagram for the next case; Telegram note; no publish. |

Every script takes `--json` and prints one JSON object as its last line, which
is what the studio server reads. Drafts live in `automation/studio/drafts/<date>-<slug>/`
(gitignored; the published copies are what ship). The folder is the project:
script, research notes, takes, renders, all in one place, "Open folder" opens it.

## Voice clone

Chatterbox (Resemble AI, MIT) runs in `automation/studio/.venv` (Python 3.11,
CPU torch). The reference is `automation/studio/voice/cory-reference.wav`, an
18-second cut from the Moscow episode intro. Replace it from the studio's Voice
panel with any clean 10 to 20 second clip. Two knobs per episode: exaggeration
(calm to dramatic) and cfg (deliberate to quick). Cory's verdict on the first
test, 2026-09-05: "sounds just like me."

Speed on this PC (Ryzen 5 5500, AMD GPU so no CUDA): about 15 seconds of compute
per second of audio, so a twenty-minute episode is around five hours. Cory's
call (2026-09-05): length matters, time does not; the studio works while he is
away. For a quick preview of a script use edge-tts.

Rebuild the venv if it is ever lost:

```
cd automation/studio
py -3.11 -m venv .venv
.venv\Scripts\python -m pip install chatterbox-tts --extra-index-url https://download.pytorch.org/whl/cpu
```

## Theme music

Nothing to download or license. `episode-music.mjs` synthesizes an intro and
outro from ffmpeg expressions (sub drone, clock ticks, a slow kick, a riser),
identical every episode. The voice starts five seconds into the intro while the
bed fades under it; the outro fades in over the last second of speech.

To use your own track instead, drop `intro.mp3` (and optionally `outro.mp3`)
into `automation/studio/music/` or upload them from the Theme panel. They are
trimmed to length, faded, and level-matched automatically.

## Recording in the studio

The Record button uses the browser microphone (Chrome asks once). Takes are
saved into the episode folder as `take-<timestamp>.webm` plus a `.wav` twin,
then mastered: leading silence and pauses over 1.2 s cut to half a second,
70 Hz high-pass, light noise reduction, gentle compression, theme, -16 LUFS.
Dropped files (wav, mp3, m4a) go through the same chain. `--no-trim` keeps every
pause.

## Why Publish is a click and not a schedule

The script is written by a 14B model running on a CPU. Left alone it invents
detail and pads endings; chaptering, retrieval and the per-chapter fact check
catch most of it, and the fact list makes the rest a focused read. An AI-voiced episode about a
real crime under Cory's name is not something to ship unread. The Monday task
does everything up to that read; `-AutoPublish` on the task action removes the
gate, and is not recommended.

A DeepSeek key in `automation/config.json` would raise script quality a lot for
about a cent per episode; the pipeline already falls back to it when set.

## One feed, everywhere

Since 2026-09-05 the show's RSS is `https://www.crimetimesnacks.com/feed.xml`.
Spotify for Creators was permanently redirected to it (the back catalogue was
mirrored to `/audio` and `/images/episodes` first; `legacy-episodes.json` +
`feed-mode.json` with `selfHosted: true` keep `import-feed.mjs` off the Anchor
feed). Spotify and Apple follow the redirect and poll our feed, so Publish in
the studio is the whole release: site, feed, and every app that reads it.

If the feed ever needs to move again, `episode-mirror.mjs` and the self-hosted
mode are the pattern; do not point anything at Anchor again.

## Weekly, hands-off up to the click

`cron/cts-episode.ps1` runs `episode-weekly.mjs` every Monday at 08:00 (task
"CTS Episode Draft"): research, twenty-minute script, cloned voice, art,
Instagram kit, then a Telegram message through the Hermes bridge saying it is
ready. Expect it done by mid-afternoon. Open the
studio, read, tick, Publish.

## Adding cases

`automation/cases.json` is the backlog: slug, title, angle, years. Keep it to
cases with a public court record or sustained major-outlet coverage; the
research step can only ground what it can find.
