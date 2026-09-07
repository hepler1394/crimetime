# Posting reels to Instagram without a browser

The browser route posts images fine and has for months. It does **not** post
video: Instagram's web uploader accepts an mp4 into its file input and then
ignores it, and retrying it fast enough to debug gets the account rate limited
("Please wait a few minutes before you try again"). This is the supported path
for video, and once it is set up, `node automation/instagram-publish.mjs <draft>`
posts a reel with no browser involved.

Nothing here is urgent. It buys one thing: **reels post themselves.**

## Three one-time steps — Cory's, because they need his login

**1. Make @crimetimesnacks a Business or Creator account, linked to a Facebook Page.**
In the Instagram app: Settings → Account type and tools → Switch to professional
account. Pick Creator or Business, then connect a Facebook Page (make a new one
called CrimeTimeSnacks if there isn't one — it can stay empty).
*Why:* the publishing API only works for professional accounts. Personal accounts
are not eligible, and no token can get around it.

**2. Make a Meta app and get a long-lived token.**
developers.facebook.com → My Apps → Create App → Business. Add the
**Instagram Graph API** product, then use the Graph API Explorer to grant
`instagram_basic`, `instagram_content_publish`, `pages_show_list` and
`pages_read_engagement`, and exchange the short token for a long-lived one
(60 days, refreshable).

**3. Put the two values in `automation/.env.instagram`** (already gitignored):

```
IG_USER_ID=17841400000000000
IG_TOKEN=EAA...
```

`IG_USER_ID` is the **Instagram Business account id**, not the username — the
Graph API Explorer shows it under the connected Page's `instagram_business_account`.

Then check it, which asks Instagram who the token belongs to:

```bash
node automation/instagram-publish.mjs --check
```

It prints `Ready: posting as @crimetimesnacks (…)` or says exactly what is missing.

## The hosting wrinkle

Meta does not accept a file upload. It **fetches the video from a public HTTPS
URL** you hand it, so the mp4 has to be on the internet before it can be posted.
This is the part with real work left in it, and there is no way around it.

Either:

- pass `--video-url <url>` for something already public, or
- set `IG_VIDEO_BASE` to a folder that is served publicly, and the script appends
  `<draft-id>.mp4`.

Options that fit: a Vercel Blob store on the crimetime project (Pro is already
paid for), Cloudflare R2 (no egress charges, the account exists), or a public
folder on the site itself — though the site is in git, and a 5 MB mp4 per episode
in the repo is the thing that was just cleaned up in the footage library.

**Blob is the recommendation:** the token drops into the same `.env.instagram`,
and it is one upload call before the publish call.

## Then

```bash
node automation/instagram-publish.mjs 2026-09-05-the-golden-state-killer --dry
node automation/instagram-publish.mjs 2026-09-05-the-golden-state-killer
```

It reads `trailer.mp4` and `caption.txt` from the draft, so what goes out is
exactly what the studio rendered and what preflight checked. It creates the
container, waits for Meta to finish transcoding, publishes, then re-reads the
post and prints its permalink — the response is not treated as proof.

## What does not change

- Cory approves what goes out. This automates the mechanics, not the decision.
- @coryhepla stays frozen.
- Every claim in a caption stays checkable. The Golden State Killer caption was
  rewritten before posting because it linked to an episode page that 404s — the
  episode is rendered but not published.
