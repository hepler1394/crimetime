// Signing out.
//
// POST only, and deliberately so: a sign-out that answers GET can be fired by an image tag
// or a link preview on any other site, and the member is logged out without touching
// anything. The account page posts a form here.
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase.js";
import { siteOrigin } from "../../../lib/site-url.mjs";

export async function POST(request) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  // 303 so the browser follows with GET rather than re-posting.
  const res = NextResponse.redirect(new URL("/signin", siteOrigin(request)), { status: 303 });
  // The old email-link cookie (cts_m, written by /api/community/confirm) signs a browser in
  // to the static pages on its own. Left alone, the header went on showing the handle of
  // someone who had just pressed Sign out. Same name, path and flags, expired.
  res.cookies.set("cts_m", "", { path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  return res;
}
