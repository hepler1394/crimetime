// What happens to a request when the provider says 503.
//
// Gemini shed about two thirds of requests on 2026-09-22 and a thirteen-chapter fact
// rebuild never once got to the end. The two things worth pinning down are that a shed
// request is tried again on the SAME provider, and that a refusal which would say the
// same thing next time is not.
//
//   node --test automation/test-llm-retry.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { chat } from "./llm.mjs";

// The streamed shape openAiCompatible reads: SSE lines, then [DONE].
const ok = (text) => new Response(
  new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`));
    c.close();
  } }), { status: 200 });
const fail = (status) => new Response("upstream said no", { status });

// Nothing here should reach the network, and no test should wait on a real backoff.
function withFetch(replies) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    const next = replies.shift();
    if (!next) throw new Error("test ran out of scripted replies");
    return typeof next === "function" ? next() : next;
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const cfg = () => ({
  order: ["gemini", "openai"],
  retries: 4, retryBaseMs: 1, retryCapMs: 2,
  onRetry: () => {},
  gemini: { apiKey: "test-gemini", baseUrl: "https://gemini.test/v1", model: "flash" },
  openai: { apiKey: "test-openai", baseUrl: "https://openai.test/v1", model: "gpt" },
  deepseek: {}, anthropic: {}, xai: {}, local: {},
});

test("a 503 is tried again on the same provider, not handed to the next one", async () => {
  const f = withFetch([fail(503), fail(503), ok("answer")]);
  try {
    const r = await chat("s", "u", cfg());
    assert.equal(r.text, "answer");
    assert.match(r.provider, /^gemini/);
    assert.equal(f.calls.length, 3);
    assert.ok(f.calls.every((c) => c.url.startsWith("https://gemini.test")), "no call should have gone to the fallback");
  } finally { f.restore(); }
});

test("an empty answer from a cloud model is a shed request, and is tried again", async () => {
  const f = withFetch([ok(""), ok("answer")]);
  try {
    assert.equal((await chat("s", "u", cfg())).text, "answer");
    assert.equal(f.calls.length, 2);
  } finally { f.restore(); }
});

test("a bad key is not retried, and falls through at once", async () => {
  const f = withFetch([fail(401), ok("from the fallback")]);
  try {
    const r = await chat("s", "u", cfg());
    assert.equal(r.provider, "openai");
    assert.equal(f.calls.length, 2, "401 must cost exactly one call");
    assert.ok(f.calls[1].url.startsWith("https://openai.test"));
  } finally { f.restore(); }
});

test("the fallback is still reached once the retries are spent", async () => {
  const f = withFetch([fail(503), fail(503), fail(503), fail(503), ok("from the fallback")]);
  try {
    const r = await chat("s", "u", cfg());
    assert.equal(r.provider, "openai");
    assert.equal(f.calls.length, 5);
  } finally { f.restore(); }
});

test("an answer cut off at the output limit is not retried: the next one would be too", async () => {
  const cut = () => new Response(new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "half a" }, finish_reason: "length" }] })}\n\ndata: [DONE]\n\n`));
    c.close();
  } }), { status: 200 });
  const f = withFetch([cut, cut]);
  try {
    await assert.rejects(chat("s", "u", { ...cfg(), order: ["gemini"] }), /output limit/);
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
});

// The one that mattered. A batch job passes no onToken, and until 2026-09-22 the
// completion check was guarded on onToken, so a stream cut in half came back looking
// like a finished answer. Downstream that was half a JSON array: once it would not
// parse, once it parsed to nothing, and "nothing" is a chapter the fact gate waves through.
test("a stream that ends without [DONE] is a failure, not a short answer", async () => {
  const half = () => new Response(new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: '{"claims": [{"claim": "half of one' } }] })}\n\n`));
    c.close();   // no finish_reason, no [DONE]
  } }), { status: 200 });
  const f = withFetch([half, half, ok('{"claims": []}')]);
  try {
    const r = await chat("s", "u", { ...cfg(), order: ["gemini"] });
    assert.equal(r.text, '{"claims": []}', "the half answer must not be returned");
    assert.equal(f.calls.length, 3, "each truncated stream should have been retried");
  } finally { f.restore(); }
});

test("a half answer already streamed to a reader is not sent twice", async () => {
  const half = () => new Response(new ReadableStream({ start(c) {
    c.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "visible" } }] })}\n\n`));
    c.close();
  } }), { status: 200 });
  const seen = [];
  const f = withFetch([half, ok("second try")]);
  try {
    await assert.rejects(chat("s", "u", { ...cfg(), order: ["gemini"], onToken: (t) => seen.push(t) }), /ended before completion/);
    assert.deepEqual(seen, ["visible"]);
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
});

test("every provider shedding at once is reported as such, with the statuses", async () => {
  const f = withFetch([fail(503), fail(503), fail(503), fail(503), fail(503), fail(503), fail(503), fail(503)]);
  try {
    await assert.rejects(chat("s", "u", cfg()), (e) => {
      assert.match(e.message, /No LLM provider succeeded/);
      assert.match(e.message, /HTTP 503/);
      return true;
    });
  } finally { f.restore(); }
});

test("a stopped generation is not retried", async () => {
  const stop = new AbortController();
  const f = withFetch([() => { stop.abort(); return fail(503); }]);
  try {
    await assert.rejects(chat("s", "u", { ...cfg(), signal: stop.signal }), /stopped/);
    assert.equal(f.calls.length, 1);
  } finally { f.restore(); }
});
