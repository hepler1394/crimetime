# Lindsay Clancy - coming soon (vertical cut)

`cut.mp4`, 1080x1920, 23.4s, -14.0 LUFS, true peak -1.3 dBFS.
Rebuild with `node automation/snap-cut.mjs clancy-coming-soon`.

For Snapchat Stories, Instagram Reels and Stories. Snapchat cannot be posted to
from a browser, so this gets delivered to Cory's phone and he posts it there.

## Sources and credit

**Court footage - two excerpts, roughly 4.6 seconds each.**

| | |
|---|---|
| Uploader | LiveNOW from FOX |
| Video | "Judge declares mistrial in Lindsay Clancy trial" |
| URL | https://www.youtube.com/watch?v=z7VeOQ-3rU8 |
| Recorded | Plymouth Superior Court, Massachusetts, September 4, 2026 |
| Underlying camera | the court's pool feed |
| Rights tier | `news` - a news organisation's upload. Their video, not a public-domain record. |
| Excerpts used | source 263.2-267.8 and 638.8-643.4 |

Both excerpts carry the source on screen for their whole duration, in a band
under the picture: *"Plymouth Superior Court, Sept 4 2026 - via LiveNOW from
FOX."* The broadcaster's own lower third and news ticker are cropped off rather
than shown, because the ticker carried unrelated headlines.

The footage-library entry, with the full metadata and caption track, is
`automation/studio/footage/lindsay-clancy/sources.json`.

**Audio.** The music bed is synthesised from ffmpeg expressions in the same shape
as the show's theme (`automation/episode-music.mjs`) - no sample, nothing
licensed, nothing for a platform's content matcher to recognise. The sign-on is
Cory's cloned voice, rendered locally with `automation/studio/tts_clone.py`.

**Screenshot.** The phone frame is a real capture of the deployed
https://www.crimetimesnacks.com/ homepage, not a mockup.

## What it says, and what it does not

The trial ended in a **mistrial**. The jury deadlocked across seven days of
deliberation and reached no verdict, and Plymouth District Attorney Tim Cruz has
not said whether he will retry the case. Clancy pleaded not guilty.

Nothing on screen asserts guilt, because nothing has been decided. The copy is
limited to what happened procedurally: the date, the deadlock, the mistrial.

## A caveat worth keeping in mind

The excerpts are short, credited and used to introduce commentary on a public
court proceeding, and the show is free and non-commercial - all of which counts
in a fair-use argument. But Snapchat and Instagram run automated content
matching, and that system does not weigh fair use; it matches and then mutes or
removes. If this cut gets muted or pulled, that is the likely reason, and the
fix is to rebuild it against court-published video rather than a broadcaster's
upload.
