// Refreshing a session from the static site.
//
// The static pages (case pages, episodes, the home page) never pass through this zone, so
// nothing there can renew an expired session. When /api/community/me finds a session cookie
// whose access token Supabase no longer accepts, it says so, and js/account.js posts here
// once. proxy.js has already done the refresh by the time this runs and put the new cookies
// on the response; all this answers is whether somebody is signed in now.
//
// POST, so a link preview or a prefetch cannot spend a refresh token.
import { NextResponse } from "next/server";
import { currentUser } from "../../../lib/supabase.js";

export async function POST() {
  const user = await currentUser();
  return NextResponse.json({ signedIn: Boolean(user) }, { headers: { "Cache-Control": "private, no-store" } });
}
