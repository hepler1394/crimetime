const test = require('node:test');
const assert = require('node:assert/strict');
const { createAccountReader } = require('../instagram-account.cjs');

function fixture({ fetch, known = {}, cookies } = {}) {
  const snapshots = [], requests = [];
  const session = {
    cookies: { get: cookies || (async () => [{ value: 'fixture-id' }]) },
    getUserAgent: () => 'Fixture Electron session',
    fetch: async (...args) => { requests.push(args); return fetch ? fetch(...args) : { ok: true, json: async () => ({ user: { username: 'crimetimesnacks' } }) }; },
  };
  const read = createAccountReader({ session, known, saveKnown: () => {}, saveAccount: (value) => snapshots.push(value) });
  return { read, snapshots, requests };
}

test('lookup uses the Instagram session, includes cookies and bounds its request', async () => {
  const f = fixture();
  const result = await f.read(true);
  assert.equal(result.username, 'crimetimesnacks');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0][1].credentials, 'include');
  assert.ok(f.requests[0][1].signal instanceof AbortSignal);
  assert.equal(f.requests[0][1].headers['User-Agent'], 'Fixture Electron session');
  assert.equal(f.snapshots[0].checking, true);
  assert.equal(f.snapshots.at(-1).checking, undefined);
});
test('temporary network failure retains a previously verified identity for that cookie', async () => {
  const f = fixture({ known: { 'fixture-id': 'crimetimesnacks' }, fetch: async () => { throw new Error('offline'); } });
  const result = await f.read(true);
  assert.equal(result.username, 'crimetimesnacks');
  assert.equal(result.fromCache, true);
  assert.equal(result.signedIn, true);
});
test('unknown sessions are never labeled as a different cached profile', async () => {
  const f = fixture({ known: { other: 'ai.techprojects' }, fetch: async () => { throw new Error('offline'); } });
  assert.equal((await f.read(true)).username, null);
});
test('simultaneous refresh requests share one lookup', async () => {
  const f = fixture();
  const results = await Promise.all([f.read(true), f.read(true), f.read(true)]);
  assert.equal(f.requests.length, 1);
  assert.ok(results.every((value) => value.username === 'crimetimesnacks'));
});
test('a profile switch during lookup invalidates the old account result', async () => {
  let reads = 0;
  const f = fixture({ cookies: async () => [{ value: ++reads === 1 ? 'fixture-id' : 'new-account' }] });
  const result = await f.read(true);
  assert.equal(result.username, null);
  assert.equal(result.userId, 'new-account');
  assert.match(result.error, /changed during lookup/);
});
test('signed-out sessions do not perform a profile API request', async () => {
  const f = fixture({ cookies: async () => [] });
  assert.equal((await f.read(true)).signedIn, false);
  assert.equal(f.requests.length, 0);
});
