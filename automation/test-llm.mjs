#!/usr/bin/env node
// 5-second sanity check: confirms a model is reachable and which one.
// Run after putting a key in config.json (or starting LM Studio):
//   node automation/test-llm.mjs
import { chat, loadConfig } from "./llm.mjs";

const cfg = await loadConfig();
console.log("Provider order:", cfg.order.join(" -> "));
console.log("Local server:", cfg.local.baseUrl);
console.log("DeepSeek key set:", cfg.deepseek.apiKey ? "yes" : "NO");
try {
  const { text, provider } = await chat(
    "You are a test. Reply with exactly: OK",
    "Reply with exactly: OK",
    cfg
  );
  console.log(`\n✓ WORKING via ${provider}. Model said: ${text.trim().slice(0, 40)}`);
} catch (e) {
  console.error("\n✗ No provider reachable.\n" + e.message);
  console.error("\nFix: either start LM Studio's server (load a model -> Start Server),");
  console.error("or paste a DeepSeek key into automation/config.json (deepseek.apiKey).");
  process.exit(1);
}
