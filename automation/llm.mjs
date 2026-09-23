// LLM helper. Provider order comes from automation/config.json (gitignored) or
// the defaults below: Gemini Flash first (cents per episode, follows the JSON
// contract, 1M context), then DeepSeek, then Claude/OpenAI if keyed, and the
// local LM Studio model last as the free offline fallback. Keys come from
// config.json or env vars (GEMINI_API_KEY, DEEPSEEK_API_KEY, ...). NO keys are
// ever hardcoded. The Gemini key that leaked in 2026 was rotated; the one in
// use must never be written into a repo file.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { unlockConfig } from './studio/credential-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(await readFile(join(__dirname, "config.json"), "utf8"));
  } catch {
    /* no config.json — fall back to env only */
  }
  cfg = await unlockConfig(cfg);
  const e = process.env;
  cfg.order = cfg.order || ["gemini", "deepseek", "anthropic", "openai", "local"];
  cfg.gemini = cfg.gemini || {};
  // CTS_GEMINI_API_KEY lets the show bill to a key of its own. GEMINI_API_KEY is set
  // machine-wide and every other program on this PC reads it too, so on the shared key
  // the Gemini bill cannot say which program spent what.
  cfg.gemini.apiKey = e.CTS_GEMINI_API_KEY || e.GEMINI_API_KEY || cfg.gemini.apiKey || "";
  // Gemini speaks the OpenAI chat-completions dialect at this endpoint.
  cfg.gemini.baseUrl = cfg.gemini.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
  cfg.gemini.model = e.GEMINI_MODEL || cfg.gemini.model || "gemini-3.8-flash";
  // A stronger model for the writing passes (outline, chapters); Flash still does the checks.
  cfg.gemini.writerModel = e.GEMINI_WRITER_MODEL || cfg.gemini.writerModel || cfg.gemini.model;
  cfg.local = cfg.local || {};
  cfg.local.baseUrl = e.LLM_BASE_URL || cfg.local.baseUrl || "http://localhost:1234/v1";
  cfg.local.model = e.LLM_MODEL || cfg.local.model || "local-model";
  // The 60s default is right for a cloud call, where a long wait means something is wrong.
  // It is not right for a local model reading 44KB of research notes off a consumer GPU:
  // prompt processing alone runs past it, and the abort looks exactly like a failure. Set
  // LLM_TIMEOUT_MS when deliberately routing a big prompt at the local box.
  cfg.timeoutMs = Number(e.LLM_TIMEOUT_MS) || cfg.timeoutMs || 0;
  cfg.maxOutputTokens = Number(e.LLM_MAX_OUTPUT_TOKENS) || cfg.maxOutputTokens || 0;
  // One 503 says nothing about the provider, only about that second. Measured on
  // 2026-09-22, Gemini answered about a third of requests and shed the rest with
  // "high demand", in bursts of a few minutes, and a five-token request was shed as
  // readily as an eleven-thousand-token one - the size theory was wrong, it is simply
  // load. At that rate a thirteen-chapter pass has about one chance in eight thousand
  // of finishing without this, which is why the Elisa Lam fact list never rebuilt.
  cfg.retries = Number(e.LLM_RETRIES) || cfg.retries || 6;
  cfg.retryBaseMs = Number(e.LLM_RETRY_BASE_MS) || cfg.retryBaseMs || 2000;
  // Capped, not unbounded: when the next attempt is a coin flip, waiting four minutes
  // for it buys nothing that waiting thirty seconds did not.
  cfg.retryCapMs = Number(e.LLM_RETRY_CAP_MS) || cfg.retryCapMs || 30000;
  cfg.deepseek = cfg.deepseek || {};
  cfg.deepseek.apiKey = e.DEEPSEEK_API_KEY || cfg.deepseek.apiKey || "";
  cfg.deepseek.baseUrl = cfg.deepseek.baseUrl || "https://api.deepseek.com/v1";
  cfg.deepseek.model = cfg.deepseek.model || "deepseek-chat";
  cfg.anthropic = cfg.anthropic || {};
  cfg.anthropic.apiKey = e.ANTHROPIC_API_KEY || cfg.anthropic.apiKey || "";
  cfg.anthropic.model = cfg.anthropic.model || "claude-sonnet-4-6";
  cfg.openai = cfg.openai || {};
  cfg.openai.apiKey = e.OPENAI_API_KEY || cfg.openai.apiKey || "";
  cfg.openai.baseUrl = cfg.openai.baseUrl || "https://api.openai.com/v1";
  cfg.openai.model = cfg.openai.model || "gpt-4o-mini";
  cfg.brave = cfg.brave || {};
  cfg.xai = cfg.xai || {};
  cfg.xai.apiKey = e.XAI_API_KEY || cfg.xai.apiKey || "";
  cfg.xai.baseUrl = "https://api.x.ai/v1";
  cfg.brave.apiKey = e.BRAVE_API_KEY || cfg.brave.apiKey || "";
  return cfg;
}

const timeout = (ms) => {
  const c = new AbortController();
  // unref: otherwise a 30-minute deadline keeps the process alive for 30 minutes
  // after the last answer, and the studio's job runner waits with it.
  setTimeout(() => c.abort(), ms).unref();
  return c.signal;
};

const HTTP_NOTE = { 401: 'Replace the invalid or expired provider key.', 403: 'Check provider permissions.', 402: 'Check provider credits and billing.', 404: 'Select a model available to this account.', 429: 'Rate limit or quota reached; check credits and retry later.', 500: 'The provider had an internal error.', 502: 'The provider gateway failed.', 503: 'The provider is shedding load; this is usually over in minutes.', 504: 'The provider timed out on its own side.' };
// Worth trying again: the request never produced an answer, and nothing about it says
// the next one will fail the same way. 401/403/404 and an output-limit truncation are
// facts about the request, so they are not here.
const TRANSIENT = new Set([408, 425, 429, 500, 502, 503, 504, 529]);
const httpError = (status) => Object.assign(new Error('HTTP ' + status + '. ' + (HTTP_NOTE[status] || 'The provider request did not finish.')), { status, retryable: TRANSIENT.has(status) });

function isRetryable(err) {
  // Half a streamed answer is already on the reader's screen; sending a second one
  // would append it to the first.
  if (err.emitted) return false;
  if (typeof err.retryable === 'boolean') return err.retryable;
  if (err.status != null) return TRANSIENT.has(err.status);
  // No status means the answer never arrived: our own deadline fired, or DNS/TCP/TLS
  // gave up. Both are worth one more try.
  return err.name === 'AbortError' || err.name === 'TimeoutError' || /fetch failed|network|socket|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(err.message || '');
}

// Deliberately NOT unref'd, unlike the deadline above: during a backoff there is no
// request in flight, so an unref'd timer lets Node decide the work is finished and exit
// between two attempts.
const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const done = () => { clearTimeout(t); signal?.removeEventListener('abort', stop); };
  const stop = () => { done(); reject(new Error('Generation stopped.')); };
  const t = setTimeout(() => { done(); resolve(); }, ms);
  if (signal?.aborted) stop(); else signal?.addEventListener('abort', stop, { once: true });
});

// Retry the SAME provider before falling through to the next one, because falling
// through is a downgrade and not a recovery: the provider after Gemini on a fact check
// is a 4B model on the desk that cannot read 45KB of notes and hand back clean JSON.
// Answering a burst of 503s by quietly swapping in a weaker checker would give the gate
// a worse opinion of the same episode and never say so.
async function withRetry(cfg, name, fn) {
  const tries = Math.max(1, Number(cfg.retries) || 1);
  for (let attempt = 1; ; attempt++) {
    try { return await fn(); } catch (err) {
      if (cfg.signal?.aborted) throw err;
      if (attempt >= tries || !isRetryable(err)) throw err;
      const step = Math.min(Number(cfg.retryCapMs) || 30000, (Number(cfg.retryBaseMs) || 2000) * 2 ** (attempt - 1));
      const wait = Math.round(step * (0.7 + Math.random() * 0.6)); // jitter, so parallel jobs do not all come back at once
      (cfg.onRetry || defaultOnRetry)({ provider: name, attempt, of: tries, waitMs: wait, message: err.message });
      await sleep(wait, cfg.signal);
    }
  }
}

// stderr, never stdout: the episode scripts put one JSON object on stdout and are parsed
// by the studio and by the watcher.
const defaultOnRetry = ({ provider, attempt, of, waitMs, message }) =>
  process.stderr.write(`llm: ${provider} attempt ${attempt}/${of} failed (${message}); retrying in ${Math.round(waitMs / 100) / 10}s\n`);

async function openAiCompatible({ baseUrl, apiKey, model, maxOutputTokens }, system, user, ms, { jsonMode = false, onToken, signal } = {}) {
  // Streamed on purpose: Node's fetch aborts ("fetch failed") when response
  // headers take more than 5 minutes, and a non-streaming completion only sends
  // headers after the whole answer is generated. A 1,500-word episode script
  // from a local 14B/27B model takes longer than that. With stream: true the
  // headers arrive at once and the deadline below covers the whole body.
  const local = !apiKey;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: signal ? AbortSignal.any([timeout(ms),signal]) : timeout(ms),
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.7,
      // Cloud models count hidden reasoning tokens against this cap; a chapter plus
      // its thinking needs headroom or the JSON comes back cut off.
      //
      // 2500 is right for a local model loaded at the usual 8k, where a longer answer
      // could not fit anyway. It is the binding limit once one is loaded at 32k and asked
      // for every claim in a chapter: the answer stops mid-array and the JSON will not
      // parse. maxOutputTokens raises it for that case without touching the default.
      max_tokens: maxOutputTokens || (local ? 2500 : 8192),
      stream: true,
      ...(local ? { chat_template_kwargs: { enable_thinking: false } } : {}), // Qwen3 in LM Studio: answer, do not think for 10 minutes first
      ...(/generativelanguage\.googleapis\.com/.test(baseUrl) ? { reasoning_effort: "low" } : {}), // Gemini 3.x: write, do not deliberate
      ...(jsonMode && !local ? { response_format: { type: "json_object" } } : {}), // guaranteed-valid JSON object from cloud models
    }),
  });
  if (!res.ok) { await res.body?.cancel(); throw httpError(res.status); }
  let text = "", buf = "", truncated = false, completed = false, emitted = false;
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) > -1) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") { completed=true;continue; }
        try { const choice=JSON.parse(payload).choices?.[0],delta=choice?.delta?.content ?? ""; text += delta; if(delta){emitted=emitted||!!onToken;onToken?.(delta);} if(choice?.finish_reason)completed=true;if(choice?.finish_reason==='length')truncated=true; } catch { /* keep-alive noise */ }
      }
    }
  } catch (err) { throw Object.assign(err, { emitted }); } // the connection died mid-answer
  // Deterministic: the same request would be cut off at the same place.
  // Deterministic: the same request would be cut off at the same place.
  if(truncated)throw Object.assign(new Error('The model reached its output limit. Ask for a shorter section.'),{retryable:false});
  // Checked whether or not anyone is watching the tokens go by. It used to be guarded on
  // onToken, so a batch job - which passes no callback - was handed the first half of an
  // answer as if it were the whole thing. On 2026-09-22 that ended a stream inside a JSON
  // array twice: once the fragment would not parse, and once it had no closing brace at all,
  // which read as a chapter containing no factual claims. A chapter with nothing to check
  // does not hold an episode; it waves it through. Silence is the worst thing this can do.
  if(!completed)throw Object.assign(new Error('The provider stream ended before completion.'),{emitted,retryable:!emitted});
  return text;
}

async function anthropic({ apiKey, model, maxOutputTokens = 2000 }, system, user, ms, {onToken,signal}={}) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: signal ? AbortSignal.any([timeout(ms),signal]) : timeout(ms),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: maxOutputTokens, system, messages: [{ role: "user", content: user }], ...(onToken?{stream:true}:{}) }),
  });
  if (!res.ok) { await res.body?.cancel(); throw httpError(res.status); }
  if(onToken){let buffer='',text='',truncated=false,completed=false,emitted=false;const decoder=new TextDecoder();try{for await(const c of res.body){buffer+=decoder.decode(c,{stream:true});let nl;while((nl=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,nl).trim();buffer=buffer.slice(nl+1);if(!line.startsWith('data:'))continue;let data;try{data=JSON.parse(line.slice(5));}catch{continue;}if(data.type==='message_stop')completed=true;if(data.type==='error')throw new Error('The provider stream stopped.');const delta=data.delta?.text;if(delta){text+=delta;emitted=true;onToken(delta);}if(data.delta?.stop_reason==='max_tokens')truncated=true;}}}catch(err){throw Object.assign(err,{emitted});}if(truncated)throw Object.assign(new Error('The model reached its output limit. Ask for a shorter section.'),{retryable:false});if(!completed)throw Object.assign(new Error('The provider stream ended before completion.'),{emitted,retryable:!emitted});return text;}
  const data = await res.json();
  if(data.stop_reason==='max_tokens')throw Object.assign(new Error('The model reached its output limit. Ask for a shorter section.'),{retryable:false});
  return data.content?.[0]?.text ?? "";
}

// Returns { text, provider } using the first provider that works, in config order.
// cfg.timeoutMs: deadline for long generations. cfg.jsonMode: cloud models must
// return one JSON object. cfg.role === "writer": use the stronger Gemini model.
// Each provider is retried on a transient failure before the next one is tried at all
// (cfg.retries, cfg.onRetry); see withRetry above for why that order matters.
export async function chat(system, user, cfg) {
  cfg = cfg || (await loadConfig());
  const errors = [];
  const task=cfg.taskDefaults?.[cfg.role==='writer'?'writing':'checking'];
  if(task&&!cfg.explicitProvider){cfg={...cfg,order:[task.provider],[task.provider]:{...cfg[task.provider],model:task.model,writerModel:task.model}};}
  const opts = { jsonMode: !!cfg.jsonMode, onToken:cfg.onToken, signal:cfg.signal };
  for (const name of cfg.order) {
    try {
      if (name === "local") {
        // Auto-detect the loaded model so any model in LM Studio just works.
        let model = cfg.local.model;
        if (!model || model === "local-model") {
          try {
            const m = await fetch(`${cfg.local.baseUrl}/models`, { signal: timeout(4000) });
            const j = await m.json();
            model = j.data?.[0]?.id || model;
          } catch { /* server down -> falls through to cloud */ }
        }
        const text = await withRetry(cfg, `local (${model})`, () => openAiCompatible(
          { baseUrl: cfg.local.baseUrl, apiKey: "", model, maxOutputTokens: cfg.maxOutputTokens },
          system, user, cfg.timeoutMs || 60000, opts
        ));
        // Not retried: empty from LM Studio is the prompt overflowing the loaded context,
        // and it will overflow it again.
        if (text.trim()) return { text, provider: `local (${model})` };
        errors.push(`local (${model}): returned empty text (context overflow? check the loaded context length in LM Studio)`);
      } else if (name === "gemini" && cfg.gemini.apiKey) {
        const model = cfg.role === "writer" ? cfg.gemini.writerModel : cfg.gemini.model;
        const text = await withRetry(cfg, `gemini (${model})`, async () => {
          const t = await openAiCompatible({ ...cfg.gemini, model }, system, user, cfg.timeoutMs || 120000, opts);
          // A cloud model answering nothing at all is another shape of shed load, not a
          // verdict on the prompt; the local one below means it by "empty".
          if (!t.trim()) throw Object.assign(new Error("returned empty text"), { retryable: true });
          return t;
        });
        return { text, provider: `gemini (${model})` };
      } else if (name === "deepseek" && cfg.deepseek.apiKey) {
        return { text: await withRetry(cfg, "deepseek", () => openAiCompatible(cfg.deepseek, system, user, cfg.timeoutMs || 60000, opts)), provider: "deepseek" };
      } else if (name === "anthropic" && cfg.anthropic.apiKey) {
        return { text: await withRetry(cfg, "anthropic", () => anthropic({ ...cfg.anthropic, maxOutputTokens: cfg.maxOutputTokens || 2000 }, system, user, cfg.timeoutMs || 60000, opts)), provider: "anthropic" };
      } else if (name === "xai" && cfg.xai.apiKey && cfg.xai.model) {
        return { text: await withRetry(cfg, "xai", () => openAiCompatible(cfg.xai, system, user, cfg.timeoutMs || 60000, opts)), provider: "xai" };
      } else if (name === "openai" && cfg.openai.apiKey) {
        return { text: await withRetry(cfg, "openai", () => openAiCompatible(cfg.openai, system, user, cfg.timeoutMs || 60000, opts)), provider: "openai" };
      }
    } catch (err) {
      if(cfg.signal?.aborted)throw new Error('Generation stopped.');
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`No LLM provider succeeded. Tried: ${cfg.order.join(", ")}.\n${errors.join("\n")}`);
}
