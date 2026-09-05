# @crimetimesnacks on Instagram: launch package

Prepared 2026-09-05. The account itself has to be created by Cory: creating
accounts and entering passwords is the one thing the automation will not do.
Everything else is ready here.

## Handle

Checked 2026-09-05 from a logged-out browser (a control handle resolved, these
did not, which on Instagram means free or deactivated):

| Handle | Result |
|---|---|
| `crimetimesnacks` | available (first choice, matches the show and the site) |
| `crimetime.snacks` | available |
| `crimetimesnackspod` | available |
| `crimetimesnackspodcast` | available |

Create it from the phone (the app is the only place the bio link field can be
edited) with the show's Gmail, `crimetimesnacks@gmail.com`, so it stays separate
from the personal and builder accounts.

## Profile

- **Name:** CrimeTimeSnacks
- **Category:** Podcast
- **Avatar:** `avatar.jpg` in this folder (1080 square, the show mark sized for
  the circle crop). Re-render any time: `node automation/episode-art.mjs --avatar`
- **Bio** (150 char limit, 141 used):

  ```
  A true crime podcast. Snack-sized cases, fully examined.
  One host, one mic, the case file.
  New episodes weekly | Spotify, Apple, and the site
  ```

- **Links** (the link field holds up to five, phone only):
  1. `https://www.crimetimesnacks.com`
  2. `https://open.spotify.com/show/6wbA1mrLHjEegphMPnsAiZ`
  3. `https://podcasts.apple.com/us/podcast/crimetimesnacks-a-true-crime-podcast/id1655384400`

## What each episode gives the account

The studio's Instagram step writes, per episode, into the draft folder:

| File | Use |
|---|---|
| `reel.mp4` | 1080x1920 audiogram, the first 45 seconds of the episode with a live waveform. Post as a Reel. Set the crop to 9:16 explicitly. |
| `card.jpg` | 1080x1350 feed post. Title, hook, tape. |
| `caption.txt` | Caption for both. Ends with the episode URL and "Also on Spotify and Apple Podcasts." No hashtags, no emoji. |

Publish order per episode: Reel first (reach), card second. Instagram places the
newest post top-left, so on a week with both, post the card last if the card is
the stronger tile.

## Grid direction

The site is black, red, and caution-tape yellow, and the art follows it, so the
grid reads as one hand without effort. Vary the tile: the reel cover (title
high, waveform band) against the card (title low, hook under it). Never three
identical compositions in a row. Reels-first is the growth format; static cards
are the grid's rhythm.

## Rules carried over from the other accounts

- No emoji in artwork or captions. Bio is the exception, and this bio uses none.
- Every claim in a caption comes from the episode script, which was fact-checked
  in the studio before publishing. Nothing goes on Instagram that has not gone
  out on the site first.
- Follow buttons on the web must be clicked by coordinate, not by accessibility
  ref, and the following count verified afterwards.
- `politicaldominance` is out of scope. Never touch it.
