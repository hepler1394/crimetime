// Linking another address, which is how someone gets back the cases they saved before
// they had an account.
//
// The shape of the problem: they followed cases as kate@work.com, then signed in with
// Google as kate@gmail.com, and their saved cases look like they are gone. They are not -
// they are on a cts_members row keyed to the old address. Proving the old address is what
// lets those two rows be folded into one.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { currentMember } from "../../../../lib/session.js";
import { mergeMembers } from "../../../../lib/members.mjs";

const say = (error, status) => NextResponse.json({ error }, { status });
const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

// A Supabase client that writes no cookies.
//
// Verifying a code hands back a session for the address that was verified. If that were
// written to the cookie store, adding an address to your account would sign you out of it
// and into a different one - so this proof runs entirely in memory and is thrown away.
const detached = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

export async function POST(request) {
  const session = await currentMember();
  if (!session) return say("Sign in first.", 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const step = String(body?.step ?? "");
  const email = String(body?.email ?? "").trim();

  if (step === "remove") {
    if (!ADDRESS.test(email)) return say("That does not look like an email address.", 400);
    await session.store.removeLinkedEmail(session.member.id, email);
    return NextResponse.json({ ok: true, removed: email.toLowerCase() });
  }

  if (!ADDRESS.test(email)) return say("That does not look like an email address.", 400);
  if (same(email, session.member.email)) return say("That is the address this account already uses.", 400);

  if (step === "start") {
    const mine = await session.store.linkedEmails(session.member.id);
    if (mine.some((row) => same(row.email, email))) return say("You have already added that address.", 400);

    // Deliberately not checked here: whether the address belongs to somebody else. Saying
    // so before they have proved they can read the inbox would turn this form into a way
    // of asking the site which addresses have accounts. It is checked after the code
    // comes back, when they have proved the inbox is theirs and the answer is about them.
    const { error } = await detached().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) return say("We could not send a code to that address. Try again in a minute.", 400);
    return NextResponse.json({ ok: true, sent: true });
  }

  if (step !== "verify") return say("Nothing to do.", 400);

  const token = String(body?.code ?? "").replace(/\D/g, "");
  if (token.length < 6 || token.length > 10) return say("Enter the code from the email.", 400);

  const { error } = await detached().auth.verifyOtp({ email, token, type: "email" });
  if (error) return say("That code is wrong or has expired.", 400);

  const owner = await session.store.findByEmail(email);
  const linkedTo = await session.store.linkedEmailOwner(email);

  if (linkedTo && linkedTo !== session.member.id) {
    return say("That address is already on another account.", 409);
  }
  if (owner && owner.id !== session.member.id && owner.auth_user_id) {
    // Two live accounts. Folding them would take a decision that is not ours to take, and
    // it cannot be undone, so it stops here and says why.
    return say("That address is already signed in to another account.", 409);
  }

  let moved = 0;
  if (owner && owner.id !== session.member.id) {
    // A row with no auth_user_id: an email follower from before accounts existed. This is
    // the case the whole feature is for.
    ({ moved } = await mergeMembers(session.store, { keepId: session.member.id, mergeId: owner.id }));
  }
  await session.store.addLinkedEmail(session.member.id, email);

  return NextResponse.json({ ok: true, linked: email.toLowerCase(), moved });
}
