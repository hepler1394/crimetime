// node --test community/lib/members.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { linkMember, mergeMembers } from "./members.mjs";

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
  assert.equal(store.db[0].auth_user_id, "auth-9");
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

test("refuses to run without the things it needs", async () => {
  const store = fakeStore([]);
  await assert.rejects(() => linkMember(store, { authUserId: "", email: "a@b.com" }), /authUserId/);
  await assert.rejects(() => linkMember(store, { authUserId: "auth-1", email: "  " }), /email/);
  assert.equal(store.db.length, 0, "a refused call must not have written anything");
});

/* ------------------------------------------------------------------ merging */

// rows and byMember are left on the object so a test can assert against them afterwards.
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
