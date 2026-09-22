// The one place a fresh sign-in passes through, whichever way they came in. It links the
// auth user to their cts_members row - the row that already holds their follows - and sends
// them to pick a handle if they have not got one.
import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/supabase.js";
import { safeNext } from "../../../lib/next-path.mjs";
import { siteOrigin } from "../../../lib/site-url.mjs";
import { linkMember } from "../../../lib/members.mjs";
import { restStore } from "../../../lib/store.js";

export async function GET(request) {
  const url = new URL(request.url);
  const origin = siteOrigin(request);
  const next = safeNext(url.searchParams.get("next"));
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL("/signin", origin));

  let member;
  try {
    const { member: m } = await linkMember(restStore(), { authUserId: user.id, email: user.email });
    member = m;
  } catch (e) {
    return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent(e.message.replace(/^linkMember: /, ""))}`, origin));
  }

  if (!member.handle) {
    return NextResponse.redirect(new URL(`/account/handle?next=${encodeURIComponent(next)}`, origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
