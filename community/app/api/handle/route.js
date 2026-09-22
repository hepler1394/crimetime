// Claiming a handle.
//
// The shape rules are checked here as well as in the form, because the form is a
// convenience and this is the gate. Uniqueness is left to the unique index rather than a
// read-then-write: two people submitting the same handle in the same second both pass a
// check and one of them has to lose, and the database is the only place that can decide
// which. So the 23505 that comes back is not an error to log, it is the answer.
import { NextResponse } from "next/server";
import { normalizeHandle, handleError } from "../../../lib/handle.mjs";
import { currentMember } from "../../../lib/session.js";

const say = (error, status) => NextResponse.json({ error }, { status });

export async function POST(request) {
  const session = await currentMember();
  if (!session) return say("Sign in first.", 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const handle = normalizeHandle(body?.handle);

  const bad = handleError(handle);
  if (bad) return say(bad, 400);

  // Re-picking the handle you already have is not a collision.
  if (session.member.handle === handle) return NextResponse.json({ ok: true, handle });

  try {
    await session.store.setProfile(session.member.id, { handle });
  } catch (e) {
    if (e.code === "23505") return say("That handle is taken.", 409);
    if (e.code === "23514") return say("Handles use letters, numbers and underscores only.", 400);
    throw e;
  }
  return NextResponse.json({ ok: true, handle });
}
