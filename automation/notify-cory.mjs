// Tell Cory something on his phone. Same two routes as episode-weekly.mjs, in the same
// order: the agent relay (HTTPS, Cortex forwards to=cory to Telegram), then the Hermes
// bridge on this PC. Never fatal: a job that finished must not fail because a message
// did not send.
//
// The relay key comes from CTS_RELAY_KEY (set it as a GitHub Actions secret and the
// six-hourly CI sync can reach him too) or from the Hermes key file on the studio PC.
// The bridge only exists on that PC, so CI does not try it.
export async function notifyCory(text, log = console.log) {
  try {
    let key = process.env.CTS_RELAY_KEY || "";
    if (!key) {
      const { readFile } = await import("node:fs/promises");
      key = (await readFile("C:/Users/cory/AppData/Local/hermes/relay-key.txt", "utf8")).trim();
    }
    const c = new AbortController(); setTimeout(() => c.abort(), 20000).unref?.();
    const r = await fetch("https://cortex-relay.vercel.app", { method: "POST", signal: c.signal,
      headers: { "x-relay-key": key, "content-type": "application/json" },
      body: JSON.stringify({ agent: "claude", to: "cory", body: text }) });
    if (r.ok) { log("Notice sent to Cory over the agent relay."); return true; }
    log(`Relay returned ${r.status}.`);
  } catch (e) { log(`Relay notice failed (${e.message}).`); }
  if (process.env.GITHUB_ACTIONS) { log("No Hermes bridge in CI; notice not sent."); return false; }
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 115000).unref?.();
    const r = await fetch("http://127.0.0.1:18789/", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: `Task from the CrimeTimeSnacks studio: send Cory (chat id 7463992102) exactly this message, plain text, no emojis:\n${text}` }) });
    if (r.ok) { log("Telegram notice sent via Hermes bridge."); return true; }
    log(`Hermes bridge returned ${r.status}.`);
  } catch (e) { log(`Telegram notice skipped: ${e.message}`); }
  return false;
}
