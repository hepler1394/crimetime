// Google sends the person back here with a code. Exchange it for a session, then hand off
// to /auth/landing, which decides whether they still need a handle.
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase.js";
import { safeNext } from "../../../lib/next-path.mjs";
import { siteOrigin } from "../../../lib/site-url.mjs";

export async function GET(request) {
  const url = new URL(request.url);
  // Deliberately not url.origin: behind the rewrite that is this zone's own vercel.app
  // host, and a redirect there walks the person off the site mid sign-in, onto a host the
  // session cookie cannot even be set on. See lib/site-url.mjs.
  const origin = siteOrigin(request);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent("That sign-in link did not carry a code.")}`, origin));
  }
  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent("That sign-in link has already been used or has expired.")}`, origin));
  }
  return NextResponse.redirect(new URL(`/auth/landing?next=${encodeURIComponent(next)}`, origin));
}
