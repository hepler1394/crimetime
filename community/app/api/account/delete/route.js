// Deleting an account, for real.
//
// Order matters and is not arbitrary. The member row goes first, which cascades the
// follows, the digest log and the linked addresses; the auth user goes second. Done that
// way round, a failure in the middle leaves a sign-in with no data behind it, and the next
// sign-in quietly starts a fresh empty account. The other order would leave rows nobody can
// ever reach or delete - a person's saved cases sitting in a table with no way back in.
import { NextResponse } from "next/server";
import { currentMember } from "../../../../lib/session.js";
import { supabaseServer } from "../../../../lib/supabase.js";
import { deleteAuthUser } from "../../../../lib/auth-admin.js";

const say = (error, status) => NextResponse.json({ error }, { status });

export async function POST(request) {
  const session = await currentMember();
  if (!session) return say("Sign in first.", 401);

  let body;
  try { body = await request.json(); } catch { body = {}; }
  // Typed, not clicked. A delete that a mis-click can reach is a delete that happens by
  // mis-click, and there is nothing to restore afterwards.
  if (String(body?.confirm ?? "").trim().toLowerCase() !== "delete") {
    return say('Type "delete" to confirm.', 400);
  }

  await session.store.deleteMember(session.member.id);
  await deleteAuthUser(session.user.id);

  const sb = await supabaseServer();
  await sb.auth.signOut();

  return NextResponse.json({ ok: true });
}
