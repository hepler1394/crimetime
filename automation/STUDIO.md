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

## The desktop shell (studio-shell/)

`cd studio-shell && npm start` opens one window that holds the studio and a real
browser. Two workspaces: **Studio** (this control room) and **Instagram** (the
ig-studio renders with the posting checklist). The tab strip is a Chromium
browser on a persistent profile (`studio-shell/profile/`), so Instagram,
grok.com and anything else stay signed in between launches. Bookmarks: Instagram,
New post, Grok Imagine, FBI Wanted, CourtListener, Wikipedia, Zodiac Archive.

- **Episode selector** in the toolbar sets which project folder receives saves.
- **Right-click** any image or video on any page: Save to episode. Right-click a
  text selection: Save selection to episode notes (appends to `notes.md`).
- **Downloads** from browser tabs land in the selected episode's folder.
- **Generate** panel: Gemini Flash Image (cents), Gemini 3 Pro Image, Veo 3.1
  video (paid, about a dollar for 8 s), or Grok Imagine (opens grok.com on your
  SuperGrok quota; prompt copied to the clipboard; save the result with
  right-click). Files land in the episode folder and show in the studio.
- The shell starts `automation/studio/server.mjs` if nothing answers on 4177.

Pipeline jobs are spawned detached, so a long voice render survives a server
restart; the shell and the browser tab are just windows onto the same folder.

## Community (step one)

Anyone can follow a case on `/cases.html` or `/cases/<slug>.html` with an email.
They confirm once (link sets a year-long cookie), then get a weekly digest of
approved updates on the cases they follow. Nothing goes out unless a person
approved it in the studio.

- **Database:** the shared Supabase project, tables prefixed `cts_`
  (`automation/community/schema.sql`, apply with psql). Public reads (cases,
  approved updates, follower counts) use the anon key; every write goes through
  `/api/community/*` Vercel functions with the service role key.
- **Cases** come from `cases.json` plus published episodes:
  `node automation/community/sync-cases.mjs` (also the Sync cases button).
- **Updates** are found by `automation/case-watch.mjs` (DuckDuckGo results
  screened by Gemini Flash, filed as pending) every 6 hours in CI and on demand
  from the studio ("check cases"). The studio's Community panel is the review
  queue: Approve puts an update on the case page at the next build and into the
  next digest; Reject hides it.
- **Digest:** `/api/community/digest`, Vercel cron Sundays 14:00 UTC, Resend.
  Test to one address: `.../digest?key=<CRON_SECRET>&to=<email>&dry=1`.
- **Env:** `automation/.env.community` locally (gitignored), the same names on
  the Vercel project and as GitHub Actions secrets. `MAIL_FROM` moves to
  `updates@crimetimesnacks.com` once Resend finishes verifying the domain (DNS is
  in place at Porkbun; DKIM already verified).
- Step two is following FBI Most Wanted subjects; step three is discussion
  threads under each case.

## The trailer reel

`episode-trailer.mjs` (run by the Instagram step, or on its own) cuts the post
Cory actually wants: the shape of his JonBenet trailer.

1. **Cold open.** If the episode folder holds `coldopen.mp3` (or wav, m4a, mp4)
   plus a one-line `coldopen.txt` label ("911 call, December 26, 1996. Public
   record."), the first eight seconds play over black with a slow red pulse and
   the label. Without one, the hook line from the episode opens the trailer.
2. **Title slam.** The theme's first three seconds under the wordmark, the
   episode title, and the tape.
3. **The lines.** Gemini Flash reads the transcript and picks the two or three
   most gripping self-contained lines (never the opener, never the ending). Each
   plays in Cory's voice over a slow push on a generated or saved photo from the
   folder (`art-*.jpg`, `saved-*.jpg`; never the cover or card, which carry their
   own type), the words landing on screen as they are spoken, a faint drone under.
4. **End card.** "New episode. Link in bio.", the site, and the case's plug if
   `cases.json` has one (the Zodiac episode plugs thezodiacarchive.com).

Rendered by recording `studio/templates/trailer.html` in Playwright at 1080x1920,
then muxed with the audio timeline in ffmpeg at -14 LUFS. About 40 seconds.
`trailer.mp4` is what Post sends to Instagram; `reel.mp4` (the audiogram) stays
as the fallback.

## Projects (research that is not an episode yet)

Projects live in `automation/studio/projects/<id>/`: `notes.md` (every clipping
with its source and time), the PDFs and images you save, `chat.json`. In the
studio, the Projects section lists them; each has Notes (editable), Files, and
Ask. In the shell, right-click any page: **Save page as PDF to project** (the
page is printed to PDF by Chromium and filed, with a note), **Save selection to
project** (the highlighted text with source), **Save image to project**, or
**New project from this page**.

- **Ask** sends the notes, PDFs and images (under about 18 MB) to Gemini Flash
  with the history; it answers only from the project and says when the material
  does not cover something.
- **Export for NotebookLM** writes one Markdown file (notes, faithful summaries
  of each PDF, the questions asked) to the project folder. NotebookLM has no API;
  open it from Sites in the shell and paste or upload. The PDFs themselves upload
  to NotebookLM directly.
- **Turn into episode** converts the project into research notes for the
  pipeline and starts a twenty-minute script from them, so an episode can be
  written from your own reading rather than from Wikipedia.

## Posts that are not episodes (studio/posts/)

Instagram carousels and single cards for @crimetimesnacks that stand on their
own: a case update, a plea, an anniversary. Each post is a folder under
`automation/studio/posts/<date>-<slug>/` with a `post.json` spec, an optional
background image, and the rendered `slide-N.jpg` files plus `caption.txt`.

    node automation/social-post.mjs --new "Courtney Clenney: no trial"   scaffold a spec
    node automation/social-post.mjs <post-id>                              render 1080x1350 slides + caption.txt
    node automation/social-post.mjs --list

Slide kinds: `hook` (photo background, big Bebas line, eyebrow), `text` (dark,
body paragraphs), `end` (reveal plus the kicker and footer with the handle and
domain). Inline `<span class="r">` turns a phrase red, `<span class="q">`
makes it quiet. Backgrounds come from `gen-image.mjs --out <file> --aspect 4:5`.

The spec and caption are versioned; renders are ignored by git and regenerate.
Every fact on a slide is checked against at least two current sources before
the post is approved. Statuses: draft, approved, posted, rejected.

## The Instagram board (/instagram)

The studio serves a second page at `http://127.0.0.1:4177/instagram`, which
the shell shows as its Instagram workspace. It lists the CrimeTimeSnacks posts
above (render, approve, mark posted, edit caption, Post) and, below them, the
portfolio queue from `D:/Dev/GitHub/ig-studio` (`content/queue.json`, renders
in `out/`): a 3-wide grid preview in publish order, Render, Preflight,
Re-capture, Build board, per-post status and captions.

Post opens Instagram in a shell tab with the file (or every slide of a
carousel) attached to the create dialog and the caption on the clipboard. The
Share button is yours; the studio never posts on its own.

Jobs that run in the ig-studio repo are declared in `ACTIONS` with a `cwd`.
Set `IG_STUDIO` in the environment if that repo moves.

## Security model of the local server

The studio runs pipeline scripts, so it is treated as a privileged local
service, not a web page:

- Binds to 127.0.0.1 only. A request whose Host header is not the loopback
  address is refused (421), which blocks DNS rebinding.
- Every non-GET request must carry `X-CTS: 1` and, when a browser sends an
  Origin, it must be the studio's own origin or a shell scheme. A web page in
  another tab cannot start jobs, write drafts, or approve updates.
- `/site/` serves only `images/`, `css/`, `js/`, `audio/`, `videos/`. No
  `automation/`, no dotfiles, no traversal.
- File routes accept plain names only and refuse dotfiles.
- JSON bodies are capped at 1 MB; uploads at 200 MB.
- The UI ships with a Content-Security-Policy, X-Frame-Options DENY and
  nosniff.
- In the shell, the `cts-shell://` and `cts-file://` schemes answer only pages
  we ship (file://, the studio origin, the shell schemes). `cts-file` serves
  media from the ig-studio out folder, drafts, projects and posts, nothing
  else. Web tabs cannot navigate to file:// or the shell schemes.

`npm run test:studio` starts a throwaway server and checks all of the above.


## What the studio refuses to do

These are enforced in the server and the scripts, not only by a disabled button, because
the button is not the only way in (the shell, the weekly task and curl all reach the same
routes):

- **Publish with unticked claims.** `episode-publish.mjs` counts `factsToVerify` against
  `factsChecked` and exits 2, and `/api/run` answers 409. The weekly job passes
  `--skip-facts` explicitly, so any bypass is visible in the log.
- **Report a publish that did not happen.** The checkout is synced with origin *before*
  anything is written; the episode is only marked `published` once `git push` succeeds.
  A failed push leaves it `committed`, exits non-zero, and the studio says so. Press
  Publish again to retry; the built files are reused.
- **Commit the whole working tree.** Publishing stages only what it produces. The voice
  reference, theme tracks, research projects and browser downloads are gitignored: this
  is a public repo.
- **Run a page from a folder anyone can write to.** Files in drafts, projects, posts and
  the ig out folder are served inline only when they are media, PDF, JSON or text.
  `.html` and `.svg` download instead, with nosniff, so a planted page cannot run in the
  studio's own origin and use its write access.
- **Lock an episode after a crash.** A `tts` folder that has not changed for half an hour,
  or that holds `failed.txt`, is reported as a stopped render, not a running one. The
  episode shows what went wrong and offers to start again, and the render resumes from
  the paragraphs already voiced.

## Community: what stops the endpoint being an email cannon

`/api/community/follow` is public and every call sends real mail, so a send is claimed
with one conditional UPDATE on `cts_members.last_mail_at`: one mail per address per ten
minutes, and two simultaneous requests cannot both win the row. The answer to the caller
is the same either way, so nothing is revealed about who is already a member.

    npm run test:community      # writes one throwaway .invalid member and deletes it

That test hits the live database, so it is deliberately not part of `npm test`.

## Recovering from the two failures that actually happen

- **The voice render died.** Open the episode. The red panel says why. "Start the voice
  again" re-uses every paragraph already rendered, so a five-hour job that died at hour
  four finishes in minutes.
- **The push failed.** Publish says so and the episode stays `committed`. Fix the repo
  (usually `git status` shows a conflict from the six-hourly CI sync), then press Publish
  again: it skips the build and just pushes.
