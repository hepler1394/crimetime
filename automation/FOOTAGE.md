# Footage reels — where this is and where it goes

Written 2026-09-06 for whoever picks this up next (Codex, most likely). The short
version: **reels are now cut over real case footage instead of stills**, the
plumbing is done and shipped, and the interesting work is what sits on top of it.

Cory's ask, in his words: *"reels need to have video of trial or like real footage
whether its body cam and or other"* — and then *"take this to the absolute
perfection next level"*.

## What exists

`automation/footage.mjs` — a per-case footage library at
`automation/studio/footage/<case-slug>/`.

```bash
node automation/footage.mjs --list
node automation/footage.mjs --add "<url>" --case <slug> --rights agency --note "..."
node automation/footage.mjs --find <sourceId> --case <slug> --q "needle in the haystack"
node automation/footage.mjs --clip <sourceId> --case <slug> --in 466 --out 480 \
     --label "Sacramento County DA, April 25, 2018" [--x 0.5]
node automation/footage.mjs --restore --case <slug>
```

The order matters and is the point of the design:

- `--add` fetches **metadata and auto-captions only**, never the video.
- `--find` searches those captions, so an hour of press conference becomes a
  timestamp without watching it.
- `--clip` is the only step that downloads, and it downloads that section alone
  (`yt-dlp --download-sections`). A 14 s cut is about 5 MB, not 400.
- `--restore` re-cuts every clip recorded in `sources.json` that is missing from
  disk. Clips are **gitignored**: they are downloads, not authored work.

`sources.json` is the record: URL, channel, upload date, caption count, rights
tier, and for each clip the in/out points, the crop centre and the on-screen
label. Everything is reproducible from it.

**Rights tiers, required on every source:** `agency`, `court`, `public`, `news`,
`owned`. `news` is accepted but warns — the hearing is public record, a news
organisation's video of it is not. Prefer the agency's own channel. The Golden
State Killer reel uses the Sacramento County District Attorney's Office channel's
own 25 April 2018 arrest press conference.

`automation/episode-trailer.mjs` composites in two passes:

1. the clips laid on black at the times their quotes land, graded down
   (`eq=brightness=-0.11:contrast=1.12:saturation=0.34`) with a bottom scrim so
   white type stays readable over daylight footage;
2. the Playwright recording of `studio/templates/trailer.html` **screen-blended**
   over that. The design is white and red type on black, and screen leaves black
   untouched, so the type lands on the footage with no keying and no quality loss.

The studio's **Art and reel** tab carries the library: clips with their rights
tags, add a source, caption search per source, cut from a hit. Server routes
`/api/footage`, `/api/footage/find`, `/api/footage/file`; jobs `footage-add`,
`footage-clip`, plus a `trailer` action that was previously CLI-only.

## Traps already paid for — do not rediscover these

- **Blend in RGB.** Screen-blending YUV blends the chroma planes too, drags U and
  V toward 255, and the entire reel comes out magenta. `format=gbrp` both inputs,
  blend, then `format=yuv420p`.
- **The transcript misspells names.** Captions come from transcribing the cloned
  voice, and a transcriber spells by ear: the script says DeAngelo 65 times, the
  transcript came back with DiAngelo and D'Angelo. `fixNames()` corrects caption
  proper nouns against the script. The published transcript still has the
  misspelling — worth fixing at the source.
- **A clip must stop before the title slam and the end card**, or a press
  conference plays behind "New episode. Link in bio."
- **`prompt()` and `alert()` are dead in the Electron shell.** `npm run test:studio`
  fails on them. Use a field.
- **Every studio write needs `X-CTS: 1`.** Without it, 403.
- **`yt-dlp` cuts on keyframes.** `--clip` asks 1.5 s wide and trims exactly with
  ffmpeg afterwards; keep that if you touch it.

## Where it goes next, in the order I would do it

**1. Match the clip to the line.** This is the biggest single jump in quality and
it is not done. Clips are currently handed to quotes in order, cycling. The Gemini
call in `episode-trailer.mjs` already reads the transcript to pick the three best
lines — give it the clip labels and each clip's caption text in the same call and
have it say which clip belongs under which line. The arrest line should sit over
the arrest announcement, not over whatever came next in the array.

**2. Use the clips' own audio.** Every clip already has a `.wav` written beside it
and nothing reads it. `episode-trailer.mjs` supports a cold open (`coldopen.mp3`
+ `coldopen.txt`, first 8 s) but only from a file dropped in the draft folder.
Wire the library to it: opening on the sheriff's real voice — *"yesterday
afternoon in a perfectly executed arrest my detectives arrested Joseph James
DeAngelo"* — then cutting to the show's title is a far stronger open than
narration over black. The label line already exists to caption it.

**3. Breadth of sources.** One press conference is one look, and it shows. Aim for
four to six clips per case from different rooms:
- the court's own stream (Sacramento Superior Court publishes hearings itself),
- FBI and other federal releases (federal works are public domain — the cleanest
  tier available, and `import-fbi.mjs` already talks to the Bureau),
- agency public-records portals for body-cam,
- archive.org for genuinely public-domain material.
Screen every candidate the way `--add` does: whose channel is it, not whose event
was it.

**4. Framing.** `--x 0.5` is a guess that happens to work on a centred podium. Pick
the crop centre by detecting where the speaker is, and generate a punch-in variant
so one source yields two or three visually distinct shots. A visible reframe
between quotes would remove the "same wide shot again" feeling.

**5. A real quality gate.** Nothing currently blocks a bad reel. Add
`--check <draft>`: extract frames at ~400 px wide (the real phone size), measure
contrast in the caption band, confirm loudness near -14 LUFS with true peak under
-1, confirm every clip on screen has a label and a rights tier, and confirm no
footage runs under the end card. Fail loudly. Cory's standing rule is that a
render is not verified until someone has looked at it — this makes part of that
mechanical.

**6. Put the sources on the episode page.** The reel names its sources on screen;
the site does not. A "Footage" block on the episode page listing each source with
its link and tier makes the rights basis public and costs almost nothing —
`sources.json` already holds it.

**7. More formats from the same timeline.** A 6-second hook cut for the top of the
feed, and a 4:5 version for the grid. The section timings are already computed;
this is a second pass over the same data, not a new renderer.

**8. Generalise it.** `footage.mjs` knows nothing about true crime. The ig-studio
portfolio reels (`D:\Dev\GitHub\ig-studio`) could use the identical compositor with
screen recordings in place of press conferences.

## House rules that apply to all of it

- Twenty-minute minimum, cloned voice, Cory ticks the fact list, **he** presses
  Publish and **he** presses Share. Never auto-publish, never auto-post.
- No emoji anywhere. Presumption of innocence in every line.
- Nothing invented. Every claim checkable, every clip sourced and labelled.
- **@coryhepla is frozen.** Nothing posts there until Cory lifts it himself.
- Verify by looking. A render that completed without an error has not been
  checked.
