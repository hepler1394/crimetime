#!/usr/bin/env node
// The weekly episode job. Runs the whole studio pipeline for the next case in cases.json
// and publishes it: research, script, FACT GATE, voice, art, Instagram kit, publish, push.
//
// It used to stop at "ready" and wait for Cory to tick the fact list by hand. That gate was
// the right instinct and the wrong mechanism: an episode nobody had time to check sat
// unpublished for weeks, which is not safer, just slower. The check is now automatic and
// the standard is stricter than a tired person ticking two hundred boxes - every claim must
// be carried by that episode's own research notes, or the episode does not go out.
//
// What still reaches Cory: a Telegram message either way, and any claim the gate held.
//
//   node automation/episode-weekly.mjs                 next case, 20 minutes, publish if it passes
//   node automation/episode-weekly.mjs --minutes 3
//   node automation/episode-weekly.mjs --engine edge   skip the voice clone (fast)
//   node automation/episode-weekly.mjs --no-publish    build it, do not publish whatever the gate says
//   node automation/episode-weekly.mjs --retry-only    only give held drafts another go at the gates
//   node automation/episode-weekly.mjs --no-retry      skip that and go straight to the next case
//
// Exit codes: 0 published (or nothing asked for), 3 built but held, 1 the run failed.
//
// Scheduled by cron/cts-episode.ps1 (Windows task "CTS Episode Draft", Mondays 08:00).
// When it finishes it tells Cory over Telegram through the Hermes bridge on this PC.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..");
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i > -1 && args[i + 1] ? args[i + 1] : d; };
// Publishing is the default. The fact gate, not a flag, is what decides whether an episode
// actually goes out: episode-verify.mjs must find every claim carried by the research notes.
const publish = !args.includes("--no-publish");
const minutes = opt("--minutes", "22");   // two minutes of margin over the twenty-minute rule
const engine = opt("--engine", null);

const step = (script, a, { optional = false } = {}) => {
  console.log(`\n=== ${script} ${a.join(" ")} ===`);
  const r = spawnSync(process.execPath, [join(here, script), ...a, "--json"], { cwd: ROOT, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write((r.stdout || "") + (r.stderr || ""));
  const last = (r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{"));
  let res = null; try { res = last ? JSON.parse(last) : null; } catch { /* noise */ }
  if (r.status !== 0 || !res?.ok) {
    if (optional) { console.log(`(optional step failed, continuing) ${res?.message || `exit ${r.status}`}`); return null; }
    throw new Error(`${script}: ${res?.message || `exit ${r.status}`}`);
  }
  return res;
};

async function notify(text) {
  // Two ways to Cory's phone, tried in order. The agent relay is the reliable one: it is a
  // plain HTTPS POST and Cortex forwards a to=cory message to Telegram. The Hermes bridge
  // is local and has been the flakier of the two, so it is the fallback, not the first try.
  // Never fatal - a job that finished must not report failure because a message did not send.
  try {
    const { readFile: rf } = await import("node:fs/promises");
    const key = (await rf("C:/Users/cory/AppData/Local/hermes/relay-key.txt", "utf8")).trim();
    const c = new AbortController(); setTimeout(() => c.abort(), 20000);
    const r = await fetch("https://cortex-relay.vercel.app", { method: "POST", signal: c.signal,
      headers: { "x-relay-key": key, "content-type": "application/json" },
      body: JSON.stringify({ agent: "claude", to: "cory", body: text }) });
    if (r.ok) { console.log("Notice sent to Cory over the agent relay."); return; }
    console.log(`Relay returned ${r.status}; trying the Hermes bridge.`);
  } catch (e) { console.log(`Relay notice failed (${e.message}); trying the Hermes bridge.`); }
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 115000);
    await fetch("http://127.0.0.1:18789/", { method: "POST", signal: c.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: `Task from the CrimeTimeSnacks studio: send Cory (chat id 7463992102) exactly this message, plain text, no emojis:\n${text}` }) });
    console.log("Telegram notice sent via Hermes bridge.");
  } catch (e) { console.log(`Telegram notice skipped: ${e.message}`); }
}

// Which case is next? Same rule as episode-draft --auto, so research lands on the right one.
async function nextCase() {
  const readJson = async (p) => { try { return JSON.parse(await readFile(p, "utf8")); } catch { return null; } };
  const { cases = [] } = (await readJson(join(here, "cases.json"))) || {};
  const used = new Set();
  for (const e of ((await readJson(join(here, "episodes.json"))) || {}).episodes || []) used.add(e.slug);
  for (const e of ((await readJson(join(here, "studio-episodes.json"))) || {}).episodes || []) used.add(e.slug);
  try { const { readdir } = await import("node:fs/promises"); for (const d of await readdir(join(here, "studio", "drafts"))) { const ep = await readJson(join(here, "studio", "drafts", d, "episode.json")); if (ep?.caseSlug) used.add(ep.caseSlug); } } catch { /* none */ }
  return cases.find((c) => !used.has(c.slug)) || null;
}

// A draft that was built and held stays held until something tries again, and nothing did: on
// 2026-11-21 two finished episodes had been sitting for one and two weeks, one of them on a
// single misheard word. So each Monday starts by giving every recent held draft another go at
// the same two gates. Only what needs no new words is attempted here: a claim the gate still
// holds needs the sentence rewritten and re-voiced, which stays a person's (or Claude's) edit.
async function retryHeld() {
  const { readdir, stat } = await import("node:fs/promises");
  const dir = join(here, "studio", "drafts");
  const out = [];
  let names = []; try { names = await readdir(dir); } catch { return out; }
  for (const d of names.sort()) {
    let ep; try { ep = JSON.parse(await readFile(join(dir, d, "episode.json"), "utf8")); } catch { continue; }
    if (ep.status !== "ready") continue;
    let mp3; try { mp3 = await stat(join(dir, d, "episode.mp3")); } catch { continue; }
    if (Date.now() - mp3.mtimeMs > 35 * 86400000) continue;           // older than five weeks: leave it for a person
    try {
      console.log(`\n--- Held draft ${d}: trying the gates again ---`);
      const check = step("episode-verify.mjs", [d]);
      if (!check.publishable) { out.push(`"${ep.title}" still has ${check.held} claim(s) the notes do not carry (fact-check.md in ${d}).`); continue; }
      let audio = step("episode-audit.mjs", [d]);
      for (let round = 1; round <= 3 && !audio.clean && (audio.paragraphs || []).length; round++) {
        const fixed = step("episode-repair.mjs", [d]);
        if (!(fixed.repaired || fixed.dropped)) { audio = fixed; break; }
        audio = step("episode-audit.mjs", [d]);
      }
      if (!audio.clean) { out.push(`"${ep.title}" still fails the audio audit (audio-audit.md in ${d}).`); continue; }
      if (!publish) { out.push(`"${ep.title}" now passes both gates; publishing is off for this run.`); continue; }
      const pub = step("episode-publish.mjs", [d, "--push"]);
      out.push(`"${ep.title}" was held and is now published: ${pub.page}.`);
    } catch (e) { out.push(`"${ep.title}": the retry failed (${String(e.message).slice(0, 160)}).`); }
  }
  return out;
}

const t0 = Date.now();
try {
  if (!process.argv.includes("--draft") && !args.includes("--no-retry")) {
    const retried = await retryHeld();
    if (retried.length) await notify(`CrimeTimeSnacks, held episodes:\n${retried.map((l) => `- ${l}`).join("\n")}`);
    if (args.includes("--retry-only")) process.exit(0);
  }
  // --draft <id>: take a script that already exists (re-drafted, revised or edited by hand) and
  // run it through the rest of the line: gate, voice, audio audit and repair, art, kit, publish.
  const given = (() => { const i = process.argv.indexOf("--draft"); return i > -1 ? process.argv[i + 1] : null; })();
  let draft;
  if (given) draft = { id: given };
  else {
    const kase = await nextCase();
    if (!kase) throw new Error("cases.json is exhausted. Add cases.");
    step("episode-research.mjs", ["--case", kase.slug], { optional: true });
    draft = step("episode-draft.mjs", ["--case", kase.slug, "--minutes", String(minutes)]);
    // Fix what the drafter's own checker flagged before any of it is voiced.
    step("episode-revise.mjs", [draft.id], { optional: true });
  }

  // The fact gate. It runs before the render so its verdict is in hand early. Most holds do
  // not stop the render: the checker being literal about a name leaves the script, and so
  // the audio, perfectly good, so the episode is built either way and the gate decides only
  // whether it goes out. The exception is directly below.
  let check = step("episode-verify.mjs", [draft.id]);

  // With one exception, and it is the one that cost a night. The reasoning above holds for a
  // gate being literal - a name or a figure the notes phrase differently leaves the script,
  // and so the audio, perfectly good. It does not hold when the drafter's OWN fact-checker
  // has marked a claim UNSUPPORTED: that sentence has to be cut or sourced before this can
  // publish, cutting or sourcing it rewrites the paragraph, and the paragraph has to be read
  // aloud again. On 2026-09-21 the Elisa Lam run carried three of those into a 408-minute
  // render of an episode that could never have gone out as written.
  //
  // So those stop the run here, while the fix is still a text edit. Every other kind of hold
  // still builds, exactly as before.
  const unsupportedIn = (c) => (c.heldClaims || []).filter((h) => /fact-checker/.test(h.reason || ""));
  // Called here and again after the repetition cut. The cut rebuilds the claim list, and until
  // 2026-11-21 the gate was never asked again: five episodes in a row (Zodiac, Doomsday Mom,
  // Maura Murray, Laci Peterson, Adnan Syed) carried new UNSUPPORTED claims into the render that
  // this stop exists to prevent, and the last two drafts reached the publish step with none of
  // their claims ticked. The script is still unvoiced at both call sites, so the writer gets one
  // more pass at cutting or correcting what is unsupported before the run gives up.
  const stopOnUnsupported = async (when) => {
    let unsupported = unsupportedIn(check);
    if (unsupported.length) {
      console.log(`\n${unsupported.length} unsupported claim(s) ${when}. Revising before anything is voiced...`);
      if (step("episode-revise.mjs", [draft.id], { optional: true })) {
        check = step("episode-verify.mjs", [draft.id]);
        unsupported = unsupportedIn(check);
      }
    }
    if (!unsupported.length) return;
    const lines = unsupported.map((h) => `  - ${String(h.claim).replace(/^UNSUPPORTED:\s*/, "").split(" (notes:")[0]}`).join("\n");
    const msg = `${draft.id} has ${unsupported.length} claim(s) the drafter's own fact-checker marked unsupported ${when}, and a revision pass did not clear them. Each has to be cut or sourced, which rewrites the paragraph and means re-voicing it, so nothing was rendered:\n${lines}\nFix them in the draft and run it again.`;
    await notify(`CrimeTimeSnacks: ${msg}`);
    throw new Error(msg);
  };
  await stopOnUnsupported("at the fact gate");

  // Length preflight. episode-publish.mjs refuses a render under twenty minutes, and
  // finding that out afterwards costs the whole render. Measure the script against the
  // pace of the episodes already published and say so now, while the fix is still a
  // text edit. A thin margin is a warning; a script the ordinary pace cannot carry
  // over the floor stops the run here rather than spending the hours first.
  const len = step("episode-length.mjs", [draft.id], { optional: true });
  if (len && !len.safe) {
    console.log(`\nLength preflight: ${len.words} words, expected ${len.expected}, worst case ${len.worst}.`);
    if (len.willFail) {
      const msg = `${draft.id} is too short to publish: ${len.words} words runs about ${len.expected}, under the twenty-minute floor. Add roughly ${len.wordsShort} words from research.md and run it again. Nothing was rendered.`;
      await notify(`CrimeTimeSnacks: ${msg}`);
      throw new Error(msg);
    }
    console.log(`  Thin margin (${len.marginSeconds}s in the worst case). Rendering anyway; about ${len.wordsShort} more words would make it comfortable.`);
  }

  // Repetition preflight, for the same reason as the length one: a script that tells the same
  // scene three times is the thing a listener calls filler, and the audio audit cannot hear it.
  // The published Petito episode scores 11.8% here and walks the Moab traffic stop three times;
  // every episode since is between 2.1% and 6.0%. Over its own "edit before voicing" line the
  // script is rewritten before five hours are spent reading it aloud.
  let rep = step("script-repeats.mjs", [draft.id], { optional: true });
  if (rep?.ok && rep.verdict === "edit before voicing") {
    // Cut the second telling rather than handing back a list of paragraph numbers. This is
    // still cheap: it is a text edit before the render, which is the whole point of doing the
    // check here instead of after five hours of audio.
    console.log(`\nRepetition preflight: ${rep.retold} of ${rep.sentences} sentences retell an earlier one (${(rep.share * 100).toFixed(1)}%). Cutting the repeats...`);
    const cut = step("episode-revise.mjs", [draft.id, "--repeats"], { optional: true });
    if (cut?.ok) rep = step("script-repeats.mjs", [draft.id], { optional: true });
    if (!rep?.ok || rep.verdict === "edit before voicing") {
      const msg = `${draft.id} tells the same scenes over: ${rep?.retold ?? "?"} of ${rep?.sentences ?? "?"} sentences retell an earlier one (${((rep?.share ?? 0) * 100).toFixed(1)}%)${rep?.paragraphs?.length ? `, in paragraphs ${rep.paragraphs.join(", ")}` : ""}, and the automatic cut did not clear it. Edit those and run it again. Nothing was rendered.`;
      await notify(`CrimeTimeSnacks: ${msg}`);
      throw new Error(msg);
    }
    console.log(`  Now ${(rep.share * 100).toFixed(1)}% (${rep.verdict}).`);
    // The cut replaced the claim list. Ask the gate again about the script that will be voiced.
    check = step("episode-verify.mjs", [draft.id]);
    await stopOnUnsupported("after the repetition cut");
    // Cutting repetition takes words out, and the floor is judged on words. Ask again.
    const after = step("episode-length.mjs", [draft.id], { optional: true });
    if (after?.willFail) {
      const msg = `${draft.id} came in under the twenty-minute floor once the repeated scenes were cut: ${after.words} words runs about ${after.expected}. Add roughly ${after.wordsShort} words from research.md and run it again. Nothing was rendered.`;
      await notify(`CrimeTimeSnacks: ${msg}`);
      throw new Error(msg);
    }
  } else if (rep?.ok && rep.retold) {
    console.log(`Repetition preflight: ${(rep.share * 100).toFixed(1)}% (${rep.verdict}).`);
  }

  // --remote puts both clone renders (the episode and any repair) on the GPU box in
  // render-host.json. Everything else in the run is unchanged and still happens here.
  const remote = args.includes("--fal") ? ["--fal"] : args.includes("--remote") ? ["--remote"] : [];
  step("episode-voice.mjs", [draft.id, ...(engine ? ["--engine", engine] : []), ...remote]);

  // The audio gate: listen to the render, re-voice the paragraphs the clone got wrong, and only
  // then cut the reel and trailer from it. episode-publish.mjs refuses an unaudited render.
  let audio = step("episode-audit.mjs", [draft.id]);
  // Up to three rounds. One was not enough: every full listen is a new transcriber draw, so the
  // re-audit of a clean repair can flag a paragraph the first listen passed (Adnan Syed, 11-16:
  // 7, 14 and 82 repaired, then 8 flagged), and with a single round that left a finished episode
  // held on one word. Six Monday runs in a row ended that way.
  for (let round = 1; round <= 3 && !audio.clean && (audio.paragraphs || []).length; round++) {
    const fixed = step("episode-repair.mjs", [draft.id, ...remote]);
    // A splice makes a different file, and the rule is that the audio that goes out is the audio
    // that was audited. Re-audit the render the repair produced rather than trusting the
    // paragraph-by-paragraph check that built it; that is also what cuts the digest for it.
    if (!(fixed.repaired || fixed.dropped)) { audio = fixed; break; }
    audio = step("episode-audit.mjs", [draft.id]);
  }
  step("episode-art.mjs", [draft.id]);
  step("episode-social.mjs", [draft.id]);

  let pub = null;
  if (publish && check.publishable && audio.clean) pub = step("episode-publish.mjs", [draft.id, "--push"]);
  const ep = JSON.parse(await readFile(join(here, "studio", "drafts", draft.id, "episode.json"), "utf8"));
  const mins = Math.round((Date.now() - t0) / 60000);
  const held = check.heldClaims || [];
  const msg = pub
    ? `CrimeTimeSnacks: published "${ep.title}" (${ep.duration}). ${pub.page}. All ${check.total} claims are carried by the research notes. Spotify and Apple pick it up from the feed. Took ${mins} min.${audio.digest ? `\nIf you want to spot-check it, digest.mp3 in the draft folder is ${Math.round(audio.digest.seconds)}s of the ${audio.digest.clips} places the gate was least sure about, worst first; digest.md says where each one is in the episode.` : ""}`
    : !audio.clean
      ? `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and NOT published: the audio audit still hears a problem after the automatic re-voice (paragraphs ${(audio.unresolved || audio.paragraphs || []).join(", ") || "levels"}). See automation/studio/drafts/${draft.id}/audio-audit.md. Took ${mins} min.`
    : check.publishable
      ? `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and all ${check.total} claims check out, but publishing was turned off for this run. Publish it with: node automation/episode-publish.mjs ${draft.id} --push`
      : `CrimeTimeSnacks: "${ep.title}" (${ep.duration}) is built and NOT published. ${check.ticked} of ${check.total} claims check out against the notes; ${check.held} need you.\n` +
        held.slice(0, 3).map((h) => `- ${h.reason}: ${h.claim.slice(0, 110)}`).join("\n") +
        `\nThe full list is in automation/studio/drafts/${draft.id}/fact-check.md. Clear them in the studio and press Publish, or tell Claude to. Took ${mins} min.`;
  console.log(`\n${msg}`);
  await notify(msg);
  // Built and held is not a success. This used to exit 0, so Task Scheduler showed Last Result 0
  // and cron.log said EPISODE OK for seven Mondays in which nothing was published.
  if (publish && !pub) process.exit(3);
} catch (e) {
  const msg = `CrimeTimeSnacks: the weekly episode job failed. ${e.message}`.slice(0, 600);
  console.error(`\n${msg}`);
  await notify(msg);
  process.exit(1);
}
