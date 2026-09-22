#!/usr/bin/env node
// Is a model reachable, and which one.
//
//   node automation/test-llm.mjs           one small request: is anything answering at all
//   node automation/test-llm.mjs --real    six real-size requests: what share of them land
//
// Read the second mode before trusting the first. On 2026-09-22 Gemini spent the day
// shedding load with 503 "high demand", and the shedding was not a property of the
// request: across six calls, two five-token ones were refused and one 45KB one went
// through. So a single OK here does not mean a thirteen-chapter run will finish, and a
// single 503 does not mean the provider is down. The number that decides both is the
// share that land, which is what --real measures, and the fix for a bad share is the
// retry in llm.mjs rather than a better probe.
import { chat, loadConfig } from "./llm.mjs";

const real = process.argv.includes("--real");
const cfg = await loadConfig();
console.log("Provider order:", cfg.order.join(" -> "));
console.log("Local server:", cfg.local.baseUrl);
console.log("DeepSeek key set:", cfg.deepseek.apiKey ? "yes" : "NO");
console.log("Retries per provider:", cfg.retries);

if (!real) {
  try {
    const { text, provider } = await chat("You are a test. Reply with exactly: OK", "Reply with exactly: OK", cfg);
    console.log(`\nWORKING via ${provider}. Model said: ${text.trim().slice(0, 40)}`);
    console.log("One small request answered. For whether a long job will finish, run --real.");
  } catch (e) {
    console.error("\nNo provider reachable.\n" + e.message);
    console.error("\nFix: either start LM Studio's server (load a model -> Start Server),");
    console.error("or paste a DeepSeek key into automation/config.json (deepseek.apiKey).");
    process.exit(1);
  }
  process.exit(0);
}

// A prompt the size the pipeline actually sends, no retries, and ONLY the provider that
// would do the work. The first version of this measured the whole chain and reported 100%
// while Gemini was refusing two calls in three, because every refusal fell through to the
// 4B model on the desk and answered. That is the failure this is meant to see, not a pass.
const first = cfg.order.find((n) => n === "local" || cfg[n]?.apiKey);
if (!first) { console.error("No provider is configured."); process.exit(1); }
console.log(`\nSix real-size requests at ${first} alone (no retries, no fall-through):`);
const filler = "The notes for this episode run to tens of thousands of words. ".repeat(700);
const probe = { ...cfg, order: [first], retries: 1, onRetry: () => {} };
const N = 6;
let ok = 0;
for (let i = 1; i <= N; i++) {
  const t = Date.now();
  try {
    const { provider } = await chat("Reply with the single word: ok", `${filler}\n\nReply with the single word: ok`, probe);
    ok++;
    console.log(`  ${i}/${N}  answered in ${Date.now() - t}ms via ${provider}`);
  } catch (e) {
    console.log(`  ${i}/${N}  refused after ${Date.now() - t}ms: ${e.message.split("\n").slice(-1)[0].slice(0, 110)}`);
  }
}
const share = ok / N;
console.log(`\n${ok} of ${N} real-size requests landed at ${first} (${Math.round(share * 100)}%).`);
if (ok === N) console.log("A long multi-call job should finish.");
else if (ok === 0) console.log("Nothing is getting through; a long job will not finish yet.");
else {
  // Each call gets cfg.retries attempts, so the chance of one call failing outright is
  // (1 - share) ** retries, and a 13-call pass has to win that thirteen times.
  const perCall = 1 - (1 - share) ** cfg.retries;
  console.log(`Shedding load. With ${cfg.retries} retries a single call gets through ${Math.round(perCall * 1000) / 10}% of the time,`);
  console.log(`so a thirteen-chapter pass finishes about ${Math.round(perCall ** 13 * 100)}% of the time. Progress is kept between runs, so re-running resumes.`);
}
