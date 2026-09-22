// Adding or dropping a case from your saved list.
//
// One route for both directions, because the account page needs to put a case back: a
// "stop following" button that cannot be undone turns one mis-click into work the person
// has to redo from the case page, and they may not remember which case it was.
//
// Scoped to the signed-in member inside the write itself rather than checked first. A
// member id in the filter cannot be raced; a check-then-write can.
import { NextResponse } from "next/server";
import { currentMember } from "../../../../lib/session.js";

const say = (error, status) => NextResponse.json({ error }, { status });

export async function POST(request) {
  const session = await currentMember();
  if (!session) return say("Sign in first.", 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  const slug = String(body?.slug ?? "");
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(slug)) return say("That is not a case.", 400);
  if (typeof body?.following !== "boolean") return say("Say whether to follow it or not.", 400);

  if (body.following) await session.store.addFollows(session.member.id, [slug]);
  else await session.store.unfollow(session.member.id, slug);

  return NextResponse.json({ ok: true, slug, following: body.following });
}
