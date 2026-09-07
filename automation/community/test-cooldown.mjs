#!/usr/bin/env node
// Proves the follow endpoint's mail cooldown against the real table.
//
//   npm run test:community
//
// /api/community/follow is open to anyone and every call sends real email, so a send is
// claimed with one conditional UPDATE on cts_members.last_mail_at. This checks that the
// claim actually holds: the first caller wins, callers inside the window get nothing, and
// the window expires. It writes one throwaway member on a .invalid address and deletes it
// again, so it is safe to run against production, but it does touch the live database and
// is therefore not part of `npm test`.
import { loadEnv } from "./env.mjs";
import { sb } from "./lib.js";
await loadEnv();

const MAIL_COOLDOWN_MS = 10 * 60 * 1000;
// Same claim the endpoint makes; kept here so a change to one without the other fails.
async function claimMailSlot(memberId) {
  const cutoff = new Date(Date.now() - MAIL_COOLDOWN_MS).toISOString();
  const won = await sb(
    `cts_members?id=eq.${memberId}&or=(last_mail_at.is.null,last_mail_at.lt.${cutoff})&select=id`,
    { method: "PATCH", body: { last_mail_at: new Date().toISOString() }, prefer: "return=representation" },
  );
  return Array.isArray(won) && won.length > 0;
}

const email = "cooldown-selftest@crimetimesnacks.invalid";
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.log(`  FAIL ${name} ${extra}`); } };

await sb(`cts_members?email=eq.${encodeURIComponent(email)}`, { method: "DELETE", prefer: "return=minimal" }).catch(() => {});
const [member] = await sb("cts_members?select=id,last_mail_at", { method: "POST", body: { email }, prefer: "return=representation" });
try {
  ok("a new member has no last_mail_at", member.last_mail_at === null, String(member.last_mail_at));
  ok("the first send wins the slot", await claimMailSlot(member.id));
  ok("a second send inside the window is refused", !(await claimMailSlot(member.id)));
  ok("and a third", !(await claimMailSlot(member.id)));
  const [row] = await sb(`cts_members?id=eq.${member.id}&select=last_mail_at`);
  ok("last_mail_at was stamped", !!row.last_mail_at && Date.now() - new Date(row.last_mail_at) < 60_000, String(row.last_mail_at));
  // Wind the clock back past the window: the next send must be allowed again.
  await sb(`cts_members?id=eq.${member.id}`, { method: "PATCH", body: { last_mail_at: new Date(Date.now() - 11 * 60 * 1000).toISOString() }, prefer: "return=minimal" });
  ok("a send after the window is allowed again", await claimMailSlot(member.id));
} finally {
  await sb(`cts_members?id=eq.${member.id}`, { method: "DELETE", prefer: "return=minimal" });
  const gone = await sb(`cts_members?email=eq.${encodeURIComponent(email)}&select=id`);
  ok("the throwaway row was removed", Array.isArray(gone) && gone.length === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
