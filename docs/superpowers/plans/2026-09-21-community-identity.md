# Community Phase One (Identity) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members sign in with Google or a six-digit email code, pick a handle, get a profile at `/u/<handle>`, and see their saved cases in one place.

**Architecture:** A Next.js app in `community/` deployed as its own Vercel project, reached from `www.crimetimesnacks.com` through rewrites in the existing project's `vercel.json`. The generated site and the episode publish pipeline are untouched. Pure logic (handle rules, member linking, merging) lives in `community/lib/` as dependency-free ES modules tested with `node:test` from the repo root, so it runs without the framework.

**Tech Stack:** Next.js (App Router), `@supabase/ssr`, Supabase Auth (Google + email OTP), Supabase Postgres via REST, Vercel multi-zone rewrites.

**Spec:** `docs/superpowers/specs/2026-09-21-community-identity-design.md`

## Global Constraints

- **No emojis anywhere** — not in UI, code, comments, or commit messages.
- **The publish pipeline must stay green.** `npm test` (build + `check-links.mjs`) passes after every task.
- **Never render a member's email.** Masked on `/account` only; never on a public page.
- **Handles:** lowercase, `^[a-z][a-z0-9_]{2,19}$`, stored lowercase, unique.
- **`show_follows` defaults to `false`.**
- **No avatar uploads in phase one.**
- **Secrets stay in env.** Never commit a key; `community/.env.local` is gitignored.
- **Brand:** background `#050505`, text `#f7f7f8`, red `#e50914`, yellow `#f4c20d`, display Impact/Bebas Neue, body Inter.
- Existing files to follow for style: `automation/community/lib.js`, `cases.html`.

---

### Task 1: Stop the link checker walking the community app

**Files:**
- Modify: `automation/check-links.mjs`
- Test: `automation/test-check-links.mjs` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable. Guarantees `npm test` stays green once `community/` exists.

This lands before the app exists. `check-links.mjs` walks every `.html` under the repo root, skipping only `node_modules`, `.git` and anything ending `automation/studio`. A Next.js `.next/` build output contains HTML with hashed asset references that do not resolve from the root, so without this the first build breaks `npm test`, which breaks the publish.

- [x] **Step 1: Write the failing test**

Create `automation/test-check-links.mjs`:

```js
// node --test automation/test-check-links.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

test("a build output under community/ is not walked", async () => {
  const root = await mkdtemp(join(tmpdir(), "cts-links-"));
  try {
    await mkdir(join(root, "community", ".next", "server"), { recursive: true });
    // Exactly the shape that breaks it: an extensionful asset ref that cannot resolve.
    await writeFile(join(root, "community", ".next", "server", "page.html"),
      '<link href="/_next/static/abc123.css"><img src="/_next/static/def456.png">', "utf8");
    await writeFile(join(root, "index.html"), "<p>fine</p>", "utf8");
    const r = spawnSync(process.execPath, [join(here, "check-links.mjs")], { cwd: root, encoding: "utf8", env: { ...process.env, CTS_LINK_ROOT: root } });
    assert.equal(r.status, 0, `check-links should pass but said:\n${r.stdout}`);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a genuinely broken reference is still caught", async () => {
  const root = await mkdtemp(join(tmpdir(), "cts-links-"));
  try {
    await writeFile(join(root, "index.html"), '<img src="/images/nope.jpg">', "utf8");
    const r = spawnSync(process.execPath, [join(here, "check-links.mjs")], { cwd: root, encoding: "utf8", env: { ...process.env, CTS_LINK_ROOT: root } });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /nope\.jpg/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `node --test automation/test-check-links.mjs`
Expected: FAIL. The checker has no `CTS_LINK_ROOT` override, so it scans the real repo and the temp-dir assertions do not hold.

- [x] **Step 3: Make the root overridable and skip `community`**

In `automation/check-links.mjs`, replace the `ROOT` line:

```js
// CTS_LINK_ROOT lets the test point this at a scratch tree instead of the repo.
const ROOT = process.env.CTS_LINK_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
```

and replace the studio skip inside `walk()` with:

```js
    // Not site pages: the podcast studio is a local app with its own server, and
    // community/ is a separate Vercel project whose .next build output carries
    // hashed asset refs that never resolve from this root.
    const rel = toPosix(path.relative(ROOT, p));
    if (rel === "automation/studio" || rel === "community" || toPosix(p).endsWith("automation/studio")) continue;
```

- [x] **Step 4: Run the tests**

Run: `node --test automation/test-check-links.mjs`
Expected: PASS, both tests.

- [x] **Step 5: Confirm the real repo still passes**

Run: `npm test`
Expected: `ALL TESTS PASSED`, ending with `OK: no broken local asset references.`

- [x] **Step 6: Wire it into the test family and commit**

In `package.json`, add to `scripts`: `"test:links": "node --test automation/test-check-links.mjs"`

```bash
git add automation/check-links.mjs automation/test-check-links.mjs package.json
git commit -m "Keep the link checker out of the community build output"
```

---

### Task 2: Handle rules

**Files:**
- Create: `community/lib/handle.mjs`
- Test: `community/lib/handle.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeHandle(input: string): string` — trims and lowercases.
  - `handleError(input: unknown): string | null` — a reader-facing message, or `null` when valid.
  - `RESERVED: Set<string>`

- [x] **Step 1: Write the failing test**

Create `community/lib/handle.test.mjs`:

```js
// node --test community/lib/handle.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHandle, handleError, RESERVED } from "./handle.mjs";

test("normalises case and surrounding space", () => {
  assert.equal(normalizeHandle("  Detective_Kate "), "detective_kate");
});

test("accepts a reasonable handle", () => {
  assert.equal(handleError("detective_kate"), null);
  assert.equal(handleError("kate99"), null);
});

test("rejects what it should, with a message a reader understands", () => {
  assert.match(handleError(""), /pick a handle/i);
  assert.match(handleError("ab"), /3 characters/);
  assert.match(handleError("a".repeat(21)), /20 characters/);
  assert.match(handleError("kate smith"), /letters, numbers/i);
  assert.match(handleError("kate-smith"), /letters, numbers/i);
  assert.match(handleError("9lives"), /start with a letter/i);
  assert.match(handleError("_kate"), /start with a letter/i);
  assert.match(handleError(null), /pick a handle/i);
});

test("reserves the words that would impersonate the show or collide with a route", () => {
  for (const w of ["admin", "cory", "crimetimesnacks", "account", "signin", "u", "api", "support"]) {
    assert.ok(RESERVED.has(w), `${w} should be reserved`);
    assert.match(handleError(w), /not available/i);
  }
});

test("reserved words are matched after normalising", () => {
  assert.match(handleError("  ADMIN "), /not available/i);
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `node --test community/lib/handle.test.mjs`
Expected: FAIL, cannot find module `./handle.mjs`.

- [x] **Step 3: Write it**

Create `community/lib/handle.mjs`:

```js
// Handle rules. Pure and dependency-free so it runs under node:test without the
// framework, and so the same rules apply on the server and in the form.

// Words that would let someone impersonate the show, or that collide with a route
// this zone owns or may own.
export const RESERVED = new Set([
  "admin", "administrator", "moderator", "mod", "staff", "support", "help", "root", "system",
  "cory", "crimetimesnacks", "crimetime", "official", "team",
  "account", "accounts", "signin", "signout", "login", "logout", "register", "auth", "api",
  "u", "user", "users", "me", "profile", "settings", "new", "edit", "delete", "null", "undefined",
  "about", "contact", "blog", "cases", "episodes", "search", "feed", "rss", "merch", "quiz",
]);

export const normalizeHandle = (input) => String(input ?? "").trim().toLowerCase();

// Returns null when the handle is fine, or a sentence to show the person.
export function handleError(input) {
  if (typeof input !== "string") return "Pick a handle.";
  const h = normalizeHandle(input);
  if (!h) return "Pick a handle.";
  if (h.length < 3) return "Handles are at least 3 characters.";
  if (h.length > 20) return "Handles are at most 20 characters.";
  if (!/^[a-z0-9_]+$/.test(h)) return "Handles use letters, numbers and underscores only.";
  if (!/^[a-z]/.test(h)) return "Handles start with a letter.";
  if (RESERVED.has(h)) return "That handle is not available.";
  return null;
}
```

- [x] **Step 4: Run the tests**

Run: `node --test community/lib/handle.test.mjs`
Expected: PASS, five tests.

- [x] **Step 5: Commit**

```bash
git add community/lib/handle.mjs community/lib/handle.test.mjs
git commit -m "Handle rules, with the reserved list that stops someone becoming @cory"
```

---

### Task 3: Linking a sign-in to an existing member

**Files:**
- Create: `community/lib/members.mjs`
- Test: `community/lib/members.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `linkMember(store, { authUserId, email }): Promise<{ member, created: boolean, linked: boolean }>`
  - `store` shape: `{ findByAuthId(id), findByEmail(email), setAuthId(memberId, authUserId), insertMember({ auth_user_id, email }) }`

This is where a bug silently costs somebody their follows, so it gets the most tests. `cts_follows.member_id` must never change.

- [x] **Step 1: Write the failing test**

Create `community/lib/members.test.mjs`:

```js
// node --test community/lib/members.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { linkMember } from "./members.mjs";

function fakeStore(rows = []) {
  const db = rows.map((r) => ({ ...r }));
  return {
    db,
    async findByAuthId(id) { return db.find((r) => r.auth_user_id === id) || null; },
    async findByEmail(email) { return db.find((r) => r.email.toLowerCase() === String(email).trim().toLowerCase()) || null; },
    async setAuthId(memberId, authUserId) { const r = db.find((x) => x.id === memberId); r.auth_user_id = authUserId; return r; },
    async insertMember({ auth_user_id, email }) { const r = { id: `new-${db.length + 1}`, auth_user_id, email }; db.push(r); return r; },
  };
}

test("an already-linked member is returned untouched", async () => {
  const store = fakeStore([{ id: "m1", email: "kate@example.com", auth_user_id: "auth-1" }]);
  const r = await linkMember(store, { authUserId: "auth-1", email: "kate@example.com" });
  assert.equal(r.member.id, "m1");
  assert.equal(r.created, false);
  assert.equal(r.linked, false);
});

test("an existing email follower keeps their member row, so their follows survive", async () => {
  const store = fakeStore([{ id: "m1", email: "kate@example.com", auth_user_id: null }]);
  const r = await linkMember(store, { authUserId: "auth-1", email: "Kate@Example.com " });
  assert.equal(r.member.id, "m1", "must reuse the existing row, not create one");
  assert.equal(r.linked, true);
  assert.equal(r.created, false);
  assert.equal(store.db.length, 1);
  assert.equal(store.db[0].auth_user_id, "auth-1");
});

test("a brand new person gets a row", async () => {
  const store = fakeStore([]);
  const r = await linkMember(store, { authUserId: "auth-9", email: "new@example.com" });
  assert.equal(r.created, true);
  assert.equal(store.db.length, 1);
});

test("auth id wins over email when both match different rows", async () => {
  const store = fakeStore([
    { id: "m1", email: "old@example.com", auth_user_id: "auth-1" },
    { id: "m2", email: "kate@example.com", auth_user_id: null },
  ]);
  const r = await linkMember(store, { authUserId: "auth-1", email: "kate@example.com" });
  assert.equal(r.member.id, "m1");
  assert.equal(store.db[1].auth_user_id, null, "must not steal the other row");
});

test("refuses to link when the email row already belongs to someone else", async () => {
  const store = fakeStore([{ id: "m1", email: "kate@example.com", auth_user_id: "auth-other" }]);
  await assert.rejects(() => linkMember(store, { authUserId: "auth-new", email: "kate@example.com" }), /already linked/i);
});

test("is idempotent when run twice", async () => {
  const store = fakeStore([{ id: "m1", email: "kate@example.com", auth_user_id: null }]);
  await linkMember(store, { authUserId: "auth-1", email: "kate@example.com" });
  const again = await linkMember(store, { authUserId: "auth-1", email: "kate@example.com" });
  assert.equal(again.member.id, "m1");
  assert.equal(store.db.length, 1);
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `node --test community/lib/members.test.mjs`
Expected: FAIL, cannot find module `./members.mjs`.

- [x] **Step 3: Write it**

Create `community/lib/members.mjs`:

```js
// Turning a Supabase Auth user into a cts_members row.
//
// The one rule that matters: an existing email follower must keep their member row,
// because cts_follows.member_id points at it. Create a second row for the same person
// and their saved cases silently disappear.
//
// Pure over an injected store so it can be tested without a database.

export async function linkMember(store, { authUserId, email }) {
  if (!authUserId) throw new Error("linkMember: authUserId is required");
  const address = String(email ?? "").trim();
  if (!address) throw new Error("linkMember: email is required");

  const byAuth = await store.findByAuthId(authUserId);
  if (byAuth) return { member: byAuth, created: false, linked: false };

  const byEmail = await store.findByEmail(address);
  if (byEmail) {
    if (byEmail.auth_user_id && byEmail.auth_user_id !== authUserId) {
      throw new Error(`linkMember: ${address} is already linked to another account`);
    }
    const member = await store.setAuthId(byEmail.id, authUserId);
    return { member: member || byEmail, created: false, linked: true };
  }

  const member = await store.insertMember({ auth_user_id: authUserId, email: address });
  return { member, created: true, linked: false };
}
```

- [x] **Step 4: Run the tests**

Run: `node --test community/lib/members.test.mjs`
Expected: PASS, six tests.

- [x] **Step 5: Wire both lib tests into the test family and commit**

In `package.json`, add: `"test:community": "node --test community/lib/*.test.mjs"`

Run: `npm run test:community` — expected PASS.

```bash
git add community/lib/members.mjs community/lib/members.test.mjs package.json
git commit -m "Link a sign-in to the member row that already holds their follows"
```

---

### Task 4: Merging two member rows

**Files:**
- Modify: `community/lib/members.mjs`
- Modify: `community/lib/members.test.mjs`

**Interfaces:**
- Produces: `mergeMembers(store, { keepId, mergeId }): Promise<{ moved: number }>`
- `store` gains: `follows(memberId)`, `addFollows(memberId, slugs)`, `get(memberId)`, `update(memberId, patch)`, `deleteMember(memberId)`

Needed when someone followed cases on one address and signs in with a Google account on another. Follows are copied **before** the row is deleted, and the operation is safe to repeat.

- [x] **Step 1: Write the failing test**

Append to `community/lib/members.test.mjs`:

```js
import { mergeMembers } from "./members.mjs";

// The store the merge runs against. `rows` and `byMember` are left on the object so a
// test can assert against them after the call.
function mergeStore() {
  const rows = [
    { id: "keep", email: "kate@gmail.com", auth_user_id: "auth-1", newsletter: false, created_at: "2026-09-10T00:00:00Z" },
    { id: "old", email: "kate@work.com", auth_user_id: null, newsletter: true, created_at: "2026-01-02T00:00:00Z" },
  ];
  const byMember = { keep: ["delphi"], old: ["delphi", "gilgo-beach", "moscow"] };
  const deleted = [];
  return {
    rows, byMember, deleted,
    async get(id) { return rows.find((r) => r.id === id) || null; },
    async follows(id) { return byMember[id] || []; },
    async update(id, patch) { Object.assign(rows.find((r) => r.id === id), patch); },
    async addFollows(id, slugs) { const s = new Set(byMember[id] || []); for (const x of slugs) s.add(x); byMember[id] = [...s]; },
    async deleteMember(id) { deleted.push(id); const i = rows.findIndex((r) => r.id === id); if (i > -1) rows.splice(i, 1); delete byMember[id]; },
  };
}

test("merging moves every follow before deleting anything", async () => {
  const store = mergeStore();
  const r = await mergeMembers(store, { keepId: "keep", mergeId: "old" });
  assert.equal(r.moved, 2, "gilgo-beach and moscow move across");
  assert.deepEqual([...store.byMember.keep].sort(), ["delphi", "gilgo-beach", "moscow"]);
  assert.deepEqual(store.deleted, ["old"]);
});

test("follows are copied before the row is deleted, never after", async () => {
  const store = mergeStore();
  const order = [];
  const addFollows = store.addFollows, deleteMember = store.deleteMember;
  store.addFollows = async (...a) => { order.push("add"); return addFollows(...a); };
  store.deleteMember = async (...a) => { order.push("delete"); return deleteMember(...a); };
  await mergeMembers(store, { keepId: "keep", mergeId: "old" });
  assert.deepEqual(order, ["add", "delete"], "a failure halfway must leave a duplicate, not an empty account");
});

test("the newsletter flag is sticky and the older join date wins", async () => {
  const store = mergeStore();
  await mergeMembers(store, { keepId: "keep", mergeId: "old" });
  const kept = store.rows.find((r) => r.id === "keep");
  assert.equal(kept.newsletter, true);
  assert.equal(kept.created_at, "2026-01-02T00:00:00Z");
});

test("merging the same row into itself does nothing", async () => {
  const store = mergeStore();
  const r = await mergeMembers(store, { keepId: "keep", mergeId: "keep" });
  assert.equal(r.moved, 0);
  assert.deepEqual(store.deleted, []);
});

test("merging a row that is already gone is a no-op, so a retry is safe", async () => {
  const store = mergeStore();
  await mergeMembers(store, { keepId: "keep", mergeId: "old" });
  const again = await mergeMembers(store, { keepId: "keep", mergeId: "old" });
  assert.equal(again.moved, 0);
  assert.deepEqual(store.deleted, ["old"], "must not delete twice");
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npm run test:community`
Expected: FAIL, `mergeMembers` is not exported.

- [x] **Step 3: Write it**

Append to `community/lib/members.mjs`:

```js
// Fold mergeId into keepId. Follows are copied first and the row is deleted last, so a
// failure halfway leaves a duplicate account rather than a member with no saved cases.
export async function mergeMembers(store, { keepId, mergeId }) {
  if (!keepId || !mergeId) throw new Error("mergeMembers: both ids are required");
  if (keepId === mergeId) return { moved: 0 };

  const [keep, merge] = await Promise.all([store.get(keepId), store.get(mergeId)]);
  if (!keep) throw new Error("mergeMembers: the account to keep does not exist");
  if (!merge) return { moved: 0 };                       // already merged

  const [keepFollows, mergeFollows] = await Promise.all([store.follows(keepId), store.follows(mergeId)]);
  const have = new Set(keepFollows);
  const moving = mergeFollows.filter((slug) => !have.has(slug));
  if (moving.length) await store.addFollows(keepId, moving);

  const patch = {};
  if (merge.newsletter && !keep.newsletter) patch.newsletter = true;
  if (merge.created_at && (!keep.created_at || merge.created_at < keep.created_at)) patch.created_at = merge.created_at;
  if (Object.keys(patch).length) await store.update(keepId, patch);

  await store.deleteMember(mergeId);
  return { moved: moving.length };
}
```

- [x] **Step 4: Run the tests**

Run: `npm run test:community`
Expected: PASS, eleven tests.

- [x] **Step 5: Commit**

```bash
git add community/lib/members.mjs community/lib/members.test.mjs
git commit -m "Merge two member rows without losing a saved case"
```

---

### Task 5: Schema

**Files:**
- Modify: `automation/community/schema.sql`

**Interfaces:**
- Produces: `cts_members.auth_user_id`, `.handle`, `.display_name`, `.avatar_url`, `.bio`, `.show_follows`.

- [x] **Step 1: Append the columns**

Append to `automation/community/schema.sql`:

```sql
-- Community phase one (2026-09-21): identity. Members get an account, a handle and a
-- profile. auth_user_id links the row to Supabase Auth; it stays null for the email-only
-- followers who came before, and is filled on their first sign-in so their follows carry
-- across (see community/lib/members.mjs).
alter table public.cts_members add column if not exists auth_user_id uuid;
alter table public.cts_members add column if not exists handle        text;
alter table public.cts_members add column if not exists display_name  text not null default '';
alter table public.cts_members add column if not exists avatar_url    text not null default '';
alter table public.cts_members add column if not exists bio           text not null default '';
-- Following a murder case is a sensitive thing to publish about a person, so a profile
-- shows saved cases only when the member opts in.
alter table public.cts_members add column if not exists show_follows  boolean not null default false;

create unique index if not exists cts_members_auth_user_id_uq on public.cts_members (auth_user_id) where auth_user_id is not null;
create unique index if not exists cts_members_handle_uq        on public.cts_members (lower(handle))  where handle is not null;
alter table public.cts_members drop constraint if exists cts_members_handle_shape;
alter table public.cts_members add  constraint cts_members_handle_shape
  check (handle is null or handle ~ '^[a-z][a-z0-9_]{2,19}$');
```

- [x] **Step 2: Apply it to the live project and verify**

Apply with the service key from `automation/.env.community`, then confirm every column exists:

```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('automation/.env.community','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z_]+)=(.*)\$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const k=env.SUPABASE_SERVICE_ROLE_KEY;
fetch(env.SUPABASE_URL+'/rest/v1/cts_members?select=id,auth_user_id,handle,display_name,avatar_url,bio,show_follows&limit=1',{headers:{apikey:k,Authorization:'Bearer '+k}})
 .then(async r=>console.log(r.status, r.ok?'all columns present':(await r.text()).slice(0,200)));
"
```

Expected: `200 all columns present`.

- [x] **Step 3: Confirm no existing member was disturbed**

```bash
node -e "
const fs=require('fs');
const env=Object.fromEntries(fs.readFileSync('automation/.env.community','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z_]+)=(.*)\$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const k=env.SUPABASE_SERVICE_ROLE_KEY;
const h={apikey:k,Authorization:'Bearer '+k};
Promise.all([
 fetch(env.SUPABASE_URL+'/rest/v1/cts_members?select=id',{headers:{...h,Prefer:'count=exact',Range:'0-0'}}),
 fetch(env.SUPABASE_URL+'/rest/v1/cts_follows?select=member_id',{headers:{...h,Prefer:'count=exact',Range:'0-0'}}),
]).then(async ([m,f])=>console.log('members',m.headers.get('content-range'),'follows',f.headers.get('content-range')));
"
```

Record both counts in the commit message. They must be unchanged at the end of the phase.

- [x] **Step 4: Commit**

```bash
git add automation/community/schema.sql
git commit -m "Schema: accounts, handles and profiles on cts_members"
```

---

### Task 6: The Next.js app, deployed and reachable

**Files:**
- Create: `community/package.json`, `community/next.config.mjs`, `community/app/layout.jsx`, `community/app/globals.css`, `community/app/health/page.jsx`, `community/.gitignore`
- Modify: `vercel.json`

**Interfaces:**
- Produces: a deployed zone answering `/health`, and rewrites from the main site.

- [x] **Step 1: Scaffold the app**

`community/package.json` with `next`, `react`, `react-dom`, and `@supabase/ssr` plus `@supabase/supabase-js`. `community/next.config.mjs` sets `assetPrefix: "/_community"` so `/_next/*` does not collide with static routes.

`community/.gitignore`: `node_modules`, `.next`, `.env*.local`.

`community/app/health/page.jsx` renders the string `community zone ok` and nothing else.

- [x] **Step 2: Build it locally**

Run: `cd community && npm install && npm run build`
Expected: a successful build. Then `npm run dev` and confirm `http://localhost:3000/health` shows `community zone ok`.

- [x] **Step 3: Confirm the repo's own tests are unaffected**

Run (from the repo root): `npm test`
Expected: `ALL TESTS PASSED`. This proves Task 1 did its job now that `community/.next` exists.

- [x] **Step 4: Create the Vercel project and deploy a preview**

Create a second Vercel project from this repo with Root Directory `community`. Set env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Deploy a preview and open `/health` on the preview URL in a browser to confirm it renders.

- [x] **Step 5: Add the rewrites**

In `vercel.json`, add a `rewrites` array before `redirects`:

```json
"rewrites": [
  { "source": "/signin", "destination": "https://<community-project>.vercel.app/signin" },
  { "source": "/signin/:path*", "destination": "https://<community-project>.vercel.app/signin/:path*" },
  { "source": "/account", "destination": "https://<community-project>.vercel.app/account" },
  { "source": "/account/:path*", "destination": "https://<community-project>.vercel.app/account/:path*" },
  { "source": "/u/:path*", "destination": "https://<community-project>.vercel.app/u/:path*" },
  { "source": "/_community/:path*", "destination": "https://<community-project>.vercel.app/_community/:path*" }
]
```

- [ ] **Step 6: Prove the seam in a real browser** - blocked on merging to main, which is
  the production cutover and Cory's call. The zone is deployed and answers at
  https://crimetime-community.vercel.app/health; the rewrites are written in
  vercel.json on this branch and take effect the moment it merges.

Deploy, then open `https://www.crimetimesnacks.com/health` — it must render `community zone ok` served through the rewrite. Screenshot it. Then confirm `https://www.crimetimesnacks.com/episodes/` still lists episodes and an episode page still plays, proving the static zone is untouched.

- [x] **Step 7: Commit**

```bash
git add community vercel.json
git commit -m "The community zone: a second Vercel project behind rewrites"
```

---

### Task 7: Sign in

**Files:**
- Create: `community/lib/supabase.js`, `community/app/signin/page.jsx`, `community/app/auth/callback/route.js`, `community/app/api/otp/route.js`, `community/lib/next-path.mjs`, `community/lib/next-path.test.mjs`

**Interfaces:**
- Produces: a session cookie valid across the domain; `safeNext(input): string` returning a same-origin path or `/account`.

- [x] **Step 1: Write the failing test for the redirect validator**

Create `community/lib/next-path.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./next-path.mjs";

test("keeps a same-origin path", () => {
  assert.equal(safeNext("/cases/delphi.html"), "/cases/delphi.html");
  assert.equal(safeNext("/u/kate"), "/u/kate");
});

test("refuses anything that leaves the site", () => {
  assert.equal(safeNext("https://evil.example.com"), "/account");
  assert.equal(safeNext("//evil.example.com"), "/account");
  assert.equal(safeNext("http://evil.example.com/x"), "/account");
  assert.equal(safeNext("javascript:alert(1)"), "/account");
  assert.equal(safeNext(""), "/account");
  assert.equal(safeNext(null), "/account");
  assert.equal(safeNext("not-a-path"), "/account");
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `node --test community/lib/next-path.test.mjs` — FAIL, module missing.

- [x] **Step 3: Write it**

```js
// Where to send someone after signing in. Anything that could leave the site becomes
// /account: an open redirect on a sign-in page is a phishing primitive.
export function safeNext(input) {
  const s = String(input ?? "");
  if (!s.startsWith("/")) return "/account";
  if (s.startsWith("//")) return "/account";
  if (/[\r\n]/.test(s)) return "/account";
  return s;
}
```

- [x] **Step 4: Run the tests**

Run: `npm run test:community` — PASS.

- [x] **Step 5: Build the sign-in page**

`/signin` renders, in the site's colours: a "Continue with Google" button, and an email field that swaps to a six-digit code field in the same tab. Supabase `signInWithOtp` for the code, `signInWithOAuth` for Google, both driven server-side via `@supabase/ssr` so the session lands in HttpOnly cookies. `/auth/callback` exchanges the code and redirects to `safeNext(next)`.

Cookies are set on `.crimetimesnacks.com` so both zones see the session.

- [x] **Step 6: Prove both flows in a real browser**

On the preview: sign in with Google and confirm you land back signed in; sign in with an email code and confirm the same. Screenshot both. Confirm in the database that exactly one `cts_members` row exists for that address and `auth_user_id` is set.

- [x] **Step 7: Prove the migration path with a real legacy row**

Insert a test member with an email and no `auth_user_id`, give it two follows, sign in with that address, then confirm: the same `id`, `auth_user_id` now set, both follows still attached, and no second row. Delete the test row afterwards.

- [x] **Step 8: Commit**

```bash
git add community
git commit -m "Sign in with Google or a code, and keep the follows you already had"
```

---

### Task 8: Choose a handle

**Files:**
- Create: `community/app/account/handle/page.jsx`, `community/app/api/handle/route.js`

- [x] **Step 1: Server-side validation**

`POST /api/handle` normalises, runs `handleError`, and on success writes `handle` to the signed-in member's row. A duplicate must return a readable "That handle is taken." rather than a database error — catch the unique-violation and translate it.

- [x] **Step 2: The page**

First sign-in redirects here. Shows the rules as you type, live. On success, continues to `safeNext`.

- [x] **Step 3: Prove it in a browser**

Take a handle, then try to take the same handle from a second account and confirm the readable error. Try `admin`, `9lives` and `kate smith` and confirm each is refused with the right message. Screenshot.

- [x] **Step 4: Commit**

```bash
git add community
git commit -m "Pick a handle, with the collisions and reserved words refused readably"
```

---

### Task 9: The account page

**Files:**
- Create: `community/app/account/page.jsx`, `community/app/api/account/route.js`, `community/app/api/account/delete/route.js`

- [x] **Step 1: Read and edit**

`/account` shows handle, display name, bio, masked email, linked providers, saved cases with one-click unfollow, The Case File toggle, the `show_follows` toggle, sign out, and delete account. Every field is length-checked server-side against the Global Constraints.

- [x] **Step 2: Delete means delete**

Deleting removes the `cts_members` row (cascading `cts_follows`) and the Supabase Auth user. Confirm in the database that both are gone.

- [x] **Step 3: Link another email, which is what makes Task 4 reachable**

This is the recovery path for the edge case in the spec: someone followed cases as `kate@work.com` and signed in with Google as `kate@gmail.com`, so their saved cases appear to have vanished.

`/account` gets a "Link another email" form. It runs the same six-digit code flow against the second address. On a verified code:

- if that address has no `cts_members` row, set its email as a secondary on the signed-in row and stop;
- if it has a row with no `auth_user_id`, call `mergeMembers(store, { keepId: signedInMemberId, mergeId: thatRowId })`;
- if it has a row that is already linked to a different `auth_user_id`, refuse with "That address is already signed in to another account." Never merge two live accounts silently.

The store passed in is the real Supabase-backed one implementing `get`, `follows`, `update`, `addFollows`, `deleteMember`.

- [x] **Step 4: Prove the recovery path end to end**

Create a throwaway member row with a second address and two follows and no `auth_user_id`. Signed in as the first account, link that address with a real code. Confirm: the follows now appear on the signed-in account, the throwaway row is gone, and the follow count for the account went up by exactly two. Screenshot the account page before and after.

- [x] **Step 5: Prove the rest in a browser**

Edit each field and reload to confirm it persisted. Unfollow a case and confirm the row is gone. Toggle The Case File and confirm `newsletter` changed. Delete a throwaway account and confirm both rows are gone. Screenshot.

- [x] **Step 6: Commit**

```bash
git add community
git commit -m "The account page: your handle, your cases, your data, and the door out"
```

---

### Task 10: The public profile

**Files:**
- Create: `community/app/u/[handle]/page.jsx`, `community/lib/monogram.mjs`, `community/lib/monogram.test.mjs`

**Interfaces:**
- Produces: `monogram(handle): { initials: string, hue: number }` — deterministic.

- [x] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { monogram } from "./monogram.mjs";

test("is deterministic and in range", () => {
  const a = monogram("detective_kate");
  assert.equal(a.initials, "DK");
  assert.equal(monogram("detective_kate").hue, a.hue);
  assert.ok(a.hue >= 0 && a.hue < 360);
});

test("falls back to one letter when there is no separator", () => {
  assert.equal(monogram("kate").initials, "K");
});
```

- [x] **Step 2: Run it and watch it fail, then write it, then pass**

Run: `node --test community/lib/monogram.test.mjs`

- [x] **Step 3: The page**

`/u/<handle>` renders avatar (provider photo or monogram), display name, handle, bio, member since, and saved cases only when `show_follows` is true. A handle that does not exist, or a member with no handle, is a 404. The email never appears in the markup — grep the rendered HTML to prove it.

- [x] **Step 4: Prove it in a browser**

Open a profile with `show_follows` off and confirm no cases are listed. Turn it on, reload, confirm they appear. Open a nonexistent handle and confirm a real 404 page, not a crash. Screenshot each. Run `curl` on the profile and grep for the email address to prove it is absent.

- [x] **Step 5: Commit**

```bash
git add community
git commit -m "Public profiles at /u/<handle>, closed by default"
```

---

### Task 11: One-click follow, and signed-in state on the static pages

**Files:**
- Modify: `api/community/follow.js`, `automation/build-cases.mjs`

- [x] **Step 1: Follow without the email round trip**

`POST /api/community/follow` gains a path: if the request carries a valid session, add the follow immediately and return `{ ok: true, followed: true }` with no mail sent. The logged-out email flow is unchanged, including its ten-minute cooldown.

- [x] **Step 2: Header state on generated pages**

`build-cases.mjs` (and the shared header it emits) gains a small script that fetches `/api/community/me` and swaps "Sign in" for the member's handle linking to `/account`. It degrades to "Sign in" if the fetch fails.

- [x] **Step 3: Prove both**

Signed out, follow a case and confirm the email flow still works. Signed in, follow a case and confirm it is instant, no mail, and the row exists. Reload a case page signed in and confirm the header shows the handle. Screenshot.

- [x] **Step 4: Confirm the pipeline is still green**

Run: `npm test`, `npm run test:community`, `npm run test:links`
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add api/community/follow.js automation/build-cases.mjs
git commit -m "Follow a case in one click when you are already signed in"
```

---

## Done when

- A new person signs in with Google, picks a handle, and has a profile.
- A pre-existing email follower signs in and their saved cases are still there, on the same member row.
- `/u/<handle>` shows nothing sensitive and 404s cleanly.
- `npm test` is green, and the member and follow counts recorded in Task 5 are unchanged.
- No page anywhere renders a member's email.
