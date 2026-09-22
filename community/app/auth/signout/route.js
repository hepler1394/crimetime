// Signing out.
//
// POST only, and deliberately so: a sign-out that answers GET can be fired by an image tag
// or a link preview on any other site, and the member is logged out without touching
// anything. The account page posts a form here.
import { NextResponse } from "next/server";
import { supabaseServer } from "../../../lib/supabase.js";

export async function POST(request) {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  // 303 so the browser follows with GET rather than re-posting.
  return NextResponse.redirect(new URL("/signin", new URL(request.url).origin), { status: 303 });
}
