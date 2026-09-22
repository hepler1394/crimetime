// Changing what an account says about itself.
//
// One route for the profile fields and the two switches, because they are the same kind of
// change and a member pressing Save expects one answer, not three. Fields absent from the
// body are left alone: sending only { newsletter: false } must not blank a bio.
import { NextResponse } from "next/server";
import { cleanProfile, profileError } from "../../../lib/profile.mjs";
import { currentMember } from "../../../lib/session.js";

const say = (error, status) => NextResponse.json({ error }, { status });
const FLAGS = ["newsletter", "show_follows"];

export async function POST(request) {
  const session = await currentMember();
  if (!session) return say("Sign in first.", 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  if (!body || typeof body !== "object") return say("Nothing to change.", 400);

  const patch = {};

  if ("display_name" in body || "bio" in body) {
    const bad = profileError(body);
    if (bad) return say(bad, 400);
    const clean = cleanProfile(body);
    if ("display_name" in body) patch.display_name = clean.display_name;
    if ("bio" in body) patch.bio = clean.bio;
  }

  for (const flag of FLAGS) {
    if (!(flag in body)) continue;
    if (typeof body[flag] !== "boolean") return say("That setting is either on or off.", 400);
    patch[flag] = body[flag];
  }

  if (!Object.keys(patch).length) return say("Nothing to change.", 400);

  // Unsubscribing from the digest has to clear unsubscribed_at's opposite too, or the
  // sender keeps skipping someone who has just asked to be back on the list.
  if (patch.newsletter === true) patch.unsubscribed_at = null;
  if (patch.newsletter === false) patch.unsubscribed_at = new Date().toISOString();

  const saved = await session.store.setProfile(session.member.id, patch);

  // Only the fields the page renders go back. The row carries an address and a token.
  return NextResponse.json({
    ok: true,
    member: {
      display_name: saved.display_name,
      bio: saved.bio,
      newsletter: saved.newsletter,
      show_follows: saved.show_follows,
    },
  });
}
