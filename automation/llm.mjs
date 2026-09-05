// Local-first LLM helper. Tries your local LM Studio model first (free), then
// falls back to cloud providers (Deepseek → Claude → OpenAI) using keys from
// automation/config.json (gitignored) or env vars. NO keys are ever hardcoded.
//
// Gemini is intentionally NOT supported here — that key was compromised.

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
  cfg.order = cfg.order || ["local", "deepseek", "anthropic", "openai"];
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
  setTimeout(() => c.abort(), ms);
  return c.signal;
};

async function openAiCompatible({ baseUrl, apiKey, model }, system, user, ms) {
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
      max_tokens: 2500,
      stream: true,
      ...(local ? { chat_template_kwargs: { enable_thinking: false } } : {}), // Qwen3 in LM Studio: answer, do not think for 10 minutes first
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
// Pass cfg.timeoutMs to allow long generations (episode scripts need minutes locally).
export async function chat(system, user, cfg) {
  cfg = cfg || (await loadConfig());
  const errors = [];
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
      } else if (name === "deepseek" && cfg.deepseek.apiKey) {
        return { text: await openAiCompatible(cfg.deepseek, system, user, cfg.timeoutMs || 60000), provider: "deepseek" };
      } else if (name === "anthropic" && cfg.anthropic.apiKey) {
        return { text: await anthropic(cfg.anthropic, system, user, cfg.timeoutMs || 60000), provider: "anthropic" };
      } else if (name === "openai" && cfg.openai.apiKey) {
        return { text: await openAiCompatible(cfg.openai, system, user, cfg.timeoutMs || 60000), provider: "openai" };
      }
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`No LLM provider succeeded. Tried: ${cfg.order.join(", ")}.\n${errors.join("\n")}`);
}
