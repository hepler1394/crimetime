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

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(await readFile(join(__dirname, "config.json"), "utf8"));
  } catch {
    /* no config.json — fall back to env only */
  }
  const e = process.env;
  cfg.order = cfg.order || ["gemini", "deepseek", "anthropic", "openai", "local"];
  cfg.gemini = cfg.gemini || {};
  cfg.gemini.apiKey = e.GEMINI_API_KEY || cfg.gemini.apiKey || "";
  // Gemini speaks the OpenAI chat-completions dialect at this endpoint.
  cfg.gemini.baseUrl = cfg.gemini.baseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
  cfg.gemini.model = e.GEMINI_MODEL || cfg.gemini.model || "gemini-3.8-flash";
  // A stronger model for the writing passes (outline, chapters); Flash still does the checks.
  cfg.gemini.writerModel = e.GEMINI_WRITER_MODEL || cfg.gemini.writerModel || cfg.gemini.model;
  cfg.local = cfg.local || {};
  cfg.local.baseUrl = e.LLM_BASE_URL || cfg.local.baseUrl || "http://localhost:1234/v1";
  cfg.local.model = e.LLM_MODEL || cfg.local.model || "local-model";
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

async function openAiCompatible({ baseUrl, apiKey, model }, system, user, ms, { jsonMode = false } = {}) {
  // Streamed on purpose: Node's fetch aborts ("fetch failed") when response
  // headers take more than 5 minutes, and a non-streaming completion only sends
  // headers after the whole answer is generated. A 1,500-word episode script
  // from a local 14B/27B model takes longer than that. With stream: true the
  // headers arrive at once and the deadline below covers the whole body.
  const local = !apiKey;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    signal: timeout(ms),
    headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      temperature: 0.7,
      // Cloud models count hidden reasoning tokens against this cap; a chapter plus
      // its thinking needs headroom or the JSON comes back cut off.
      max_tokens: local ? 2500 : 8192,
      stream: true,
      ...(local ? { chat_template_kwargs: { enable_thinking: false } } : {}), // Qwen3 in LM Studio: answer, do not think for 10 minutes first
      ...(/generativelanguage\.googleapis\.com/.test(baseUrl) ? { reasoning_effort: "low" } : {}), // Gemini 3.x: write, do not deliberate
      ...(jsonMode && !local ? { response_format: { type: "json_object" } } : {}), // guaranteed-valid JSON object from cloud models
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  let text = "", buf = "";
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) > -1) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") continue;
      try { text += JSON.parse(payload).choices?.[0]?.delta?.content ?? ""; } catch { /* keep-alive noise */ }
    }
  }
  return text;
}

async function anthropic({ apiKey, model }, system, user, ms) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: timeout(ms),
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 2000, system, messages: [{ role: "user", content: user }] }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

// Returns { text, provider } using the first provider that works, in config order.
// cfg.timeoutMs: deadline for long generations. cfg.jsonMode: cloud models must
// return one JSON object. cfg.role === "writer": use the stronger Gemini model.
export async function chat(system, user, cfg) {
  cfg = cfg || (await loadConfig());
  const errors = [];
  const opts = { jsonMode: !!cfg.jsonMode };
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
        const text = await openAiCompatible(
          { baseUrl: cfg.local.baseUrl, apiKey: "", model },
          system, user, cfg.timeoutMs || 60000
        );
        if (text.trim()) return { text, provider: `local (${model})` };
        errors.push(`local (${model}): returned empty text (context overflow? check the loaded context length in LM Studio)`);
      } else if (name === "gemini" && cfg.gemini.apiKey) {
        const model = cfg.role === "writer" ? cfg.gemini.writerModel : cfg.gemini.model;
        const text = await openAiCompatible({ ...cfg.gemini, model }, system, user, cfg.timeoutMs || 120000, opts);
        if (text.trim()) return { text, provider: `gemini (${model})` };
        errors.push("gemini: returned empty text");
      } else if (name === "deepseek" && cfg.deepseek.apiKey) {
        return { text: await openAiCompatible(cfg.deepseek, system, user, cfg.timeoutMs || 60000, opts), provider: "deepseek" };
      } else if (name === "anthropic" && cfg.anthropic.apiKey) {
        return { text: await anthropic(cfg.anthropic, system, user, cfg.timeoutMs || 60000), provider: "anthropic" };
      } else if (name === "openai" && cfg.openai.apiKey) {
        return { text: await openAiCompatible(cfg.openai, system, user, cfg.timeoutMs || 60000, opts), provider: "openai" };
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`No LLM provider succeeded. Tried: ${cfg.order.join(", ")}.\n${errors.join("\n")}`);
}
