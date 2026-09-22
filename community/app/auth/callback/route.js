// Google sends the person back here with a code. Exchange it for a session, then hand off
// to /auth/landing, which decides whether they still need a handle.
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase.js";
import { safeNext } from "../../../lib/next-path.mjs";

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent("That sign-in link did not carry a code.")}`, url.origin));
  }
  const sb = await supabaseServer();
  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/signin?error=${encodeURIComponent("That sign-in link has already been used or has expired.")}`, url.origin));
  }
  return NextResponse.redirect(new URL(`/auth/landing?next=${encodeURIComponent(next)}`, url.origin));
}
