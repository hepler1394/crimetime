# Community, phase one: identity

Design agreed with Cory on 2026-09-21. Phase one of three. Phases two (comments)
and three (member posts) are out of scope here and are sketched only where a
phase-one decision constrains them.

## Where this starts

The community today is one thing: follow a case by email, get a Sunday digest.

- `api/community/*` — seven Vercel serverless functions, plain `fetch` against
  Supabase REST with the service key, Resend for mail. No SDKs, no build step.
- `cts_members` — email, a permanent 48-hex `token`, `confirmed_at`,
  `newsletter`. No name, no handle, no avatar, no profile of any kind.
- `cts_follows` — member to case. This is "saved cases" already; it has nowhere
  to live in the interface.
- Everything a reader sees is generated HTML committed to the repo. The publish
  pipeline (`build-all` then commit then push then Vercel) is what puts episodes
  on Apple and Spotify.

Two problems worth naming before the design:

**The session cookie is the member's permanent secret.** `cts_m` carries the same
`cts_members.token` that goes out in every email. It never rotates. A forwarded
email or a shared device is permanent account access, and there is no way to
revoke it short of changing the row.

**Signing in always costs an email round trip**, even for someone already known,
because there is no session concept beyond that cookie.

## Decisions

1. **The publish pipeline is not touched.** Episodes and cases stay generated.
2. **Member posts live on member profiles**, behind an automatic gate, with
   optional promotion to the main blog. Phase three.
3. **Supabase Auth**, with Google and a six-digit email code.
4. **Handles, not real names.** Display name optional, email never rendered.
5. **Identity first.** Comments and member posts both need an account to hang
   off, so this phase is the foundation for both.

## Architecture: two zones, one domain

Two Vercel projects.

- `crimetime` (existing, `prj_mUPBTyGru95OW0KrUYlmHmjPIe4S`) keeps the static
  pages, `/api/community/*`, the digest cron and the canonical-domain redirects.
  Unchanged.
- `crimetime-community` (new) is the Next.js app.

The static project's `vercel.json` gains rewrites:

    /u/:path*         -> crimetime-community
    /account/:path*   -> crimetime-community
    /signin/:path*    -> crimetime-community

This is Vercel's multi-zone pattern, and it is the whole answer to the risk of
adding a framework to this repo. The alternative — Next.js owning the root, with
the generated site in `public/` — would move every path the publish pipeline
writes to and change every `build-*.mjs` output path. That is a new way for the
Monday episode to fail, in exchange for nothing phase one needs.

With rewrites, the pipeline never learns the community exists.

Two mechanical consequences:

- The Next app sets `assetPrefix` so its `/_next/*` bundles do not collide with
  static routes, and that prefix is rewritten too.
- Both zones serve from `www.crimetimesnacks.com`, so one cookie covers both and
  the session works across the seam.

## Auth and session

Supabase Auth in the existing project (`iwsjhiplpbagqkepogmg`), providers Google
and email OTP. The session lives in HttpOnly cookies set server-side; no token
reaches browser JavaScript.

`cts_m` is retired. During the transition `confirm.js` keeps honouring links
already in inboxes, but establishes a real session rather than setting the old
cookie.

### Linking to existing members

This is the part that silently costs somebody their follows if it is wrong.

`cts_members` gains `auth_user_id uuid unique`. On first sign-in:

1. Look up `cts_members` by `auth_user_id`. Found: done.
2. Otherwise match on email, case-insensitively and trimmed. Found: set
   `auth_user_id` on that row. `cts_follows.member_id` never changes, so follows
   survive untouched.
3. Otherwise insert a new member row.

Step 2 is what carries an existing follower across the change.

**The edge case:** someone who followed cases as `kate@example.com` and signs in
with a Google account on a different address lands in a new row, and their
follows look lost. `/account` offers "link another email", which runs the same
six-digit code flow against the second address and merges the two member rows:
follows are unioned, `newsletter` is true if either was, the older `created_at`
wins, the merged-away row is deleted.

Merging must be idempotent and must never delete a row whose follows have not
been copied first.

## Data model

`cts_members` gains:

| column | notes |
|---|---|
| `auth_user_id` | uuid, unique, nullable until first sign-in |
| `handle` | lowercase, unique, `^[a-z0-9_]{3,20}$`, reserved list |
| `display_name` | optional, 40 chars, no newlines |
| `avatar_url` | from the provider, or empty for a generated monogram |
| `bio` | optional, 280 chars |
| `show_follows` | boolean, default **false** |

`email` stays, and is never rendered anywhere in the interface.

Handles are stored lowercase with a unique index rather than relying on `citext`,
so no extension is required. A reserved list blocks `admin`, `cory`,
`crimetimesnacks`, `api`, `account`, `signin`, `u`, `support`, `help`, `mod`,
`staff` and the like.

`show_follows` defaults to false on purpose. Following a murder case is a
sensitive thing to publish about a person; the profile shows saved cases only if
the member opts in.

## Pages

**`/signin`** — Google button, or email then a six-digit code typed in the same
tab. No tab switching. First sign-in goes to handle selection, then returns to
wherever the member came from via `?next=`, which is validated as a same-origin
path to avoid an open redirect.

**`/account`** — handle, display name, bio, the masked email and which providers
are linked, saved cases with one-click unfollow, The Case File toggle (the
existing `newsletter` column), the `show_follows` toggle, link another email,
sign out, delete account. Delete removes the member row, which cascades
`cts_follows`, and the auth user with it.

**`/u/<handle>`** — avatar, display name, handle, bio, member since, and saved
cases if `show_follows`. Nothing else: no email, no activity log. A member with
no handle yet is a 404, so half-finished accounts are not public.

**No avatar uploads in phase one.** The provider photo if there is one, otherwise
a monogram generated from the handle. Uploads mean storage and a moderation
surface for whatever people put in them, and neither earns its place yet.

**Saved cases** get the real win. Following a case today costs an email round
trip even for a known member; signed in it becomes one click with no email. The
logged-out email path is unchanged.

## What this could break

**`check-links.mjs` runs inside `npm test`, which runs inside the publish
pipeline.** An earlier draft of this spec claimed that static pages linking to
`/signin` or `/u/<handle>` would be reported broken and stop an episode
shipping. That was checked on 2026-09-21 and it is **wrong**: the checker's
regex only matches references that end in a file extension
(`png|jpg|...|css|js|xml|webmanifest|html`), so an extensionless path is never
examined. No allowlist is needed and none will be built.

The real version of the risk is the build output. `check-links.mjs` walks every
`.html` file under the repo root, skipping only `node_modules`, `.git`, and
anything ending `automation/studio`. A Next.js app living in this repo as
`community/` would be walked, `.next/` included, and its generated HTML carries
hashed asset references that do not resolve relative to the repo root. That
fails `npm test`, which fails the publish.

The fix is one line: skip `community` the same way `automation/studio` is
already skipped. It lands first, with a test, before the app exists.

The app lives in this repo under `community/` rather than a second repo, with
the Vercel project's Root Directory set to `community`. One repo keeps the
design system and the agents in one place; the separate Vercel project keeps the
deploys apart. `episode-publish.mjs` stages an explicit allowlist, so nothing
under `community/` can be swept into an episode commit.

Untouched throughout: `/api/community/*`, the Sunday digest cron, the
follow-by-email flow for logged-out readers, and every generated page.

The static header needs to show signed-in state, which a generated page cannot
know. A small fetch to `/api/community/me` swaps "Sign in" for the avatar. That
is progressive enhancement on a static page, not a dynamic page.

## Testing

`node:test`, in the existing `test:*` family, as `test:community`:

- handle validation and the reserved list
- the link step: by `auth_user_id`, by email, and the insert path
- the merge: follows unioned, newsletter sticky, no row deleted before its
  follows are copied, idempotent on repeat
- the `?next=` validator rejects absolute URLs and protocol-relative paths
- the link-checker allowlist

`npm test` must stay green throughout.

Manual, in a real browser: Google sign-in, code sign-in, follow a case while
signed in, profile renders, `show_follows` actually hides, delete account
actually deletes.

## Not in this phase

Comments (phase two) and member posts (phase three). Both need the automatic
gate, which is designed when they are. Phase one deliberately adds no
user-authored free text to the site beyond a 280-character bio on a profile that
is not indexed for discovery.

## Open, not blocking

Grok reported on 2026-09-21 that a Supabase invoice (QWADAI-00008, 45 dollars) is
in payment failure with a pending-shutdown notice. The community tables already
live in that project, so this phase adds no new dependency, but it raises the
stakes on one that exists. Cory to confirm the billing state. Not self-paid, per
Grok's standing note.
