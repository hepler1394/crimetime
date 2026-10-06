// Keeping the session alive.
//
// A Supabase access token lasts an hour. When it runs out, the client swaps the refresh token
// for a new pair, and the refresh token is single-use: the old one is spent the moment the
// new one is issued. The pages in this zone are Server Components, which cannot write
// cookies, so before this file existed the new pair was thrown away on every page render and
// the browser kept the spent one. About an hour after signing in, the next refresh failed and
// the member was signed out without having done anything.
//
// This runs before every page and route in the zone, refreshes the session when it needs
// it, and writes the new cookies onto both the request (so the page rendering right now sees
// them) and the response (so the browser keeps them). It is the documented @supabase/ssr
// pattern for Next; Next 16 calls the file proxy.js rather than middleware.js.
//
// The static site's pages never pass through here. /api/community/me tells js/account.js
// when the session it found had expired, and that script calls /auth/refresh, which does.
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// The same attributes lib/supabase.js writes, so a refreshed cookie replaces the original
// instead of sitting beside it under a different domain.
const DOMAIN = process.env.COOKIE_DOMAIN || undefined;
const COOKIE = { domain: DOMAIN, httpOnly: true, secure: true, sameSite: "lax", path: "/" };

export async function proxy(request) {
  let response = NextResponse.next({ request });

  // Nobody signed in: nothing to refresh, and no reason to ask Supabase anything.
  if (!request.cookies.getAll().some((c) => /^sb-.+-auth-token/.test(c.name))) return response;

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers = {}) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, { ...options, ...COOKIE });
        // A response carrying someone's session must never be cached and served to someone else.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getUser, not getSession: it asks Supabase whether the token is still good, and it is the
  // call that triggers the refresh when it is not.
  try { await supabase.auth.getUser(); } catch { /* signed out is an answer, not a crash */ }
  return response;
}

export const config = {
  // Everything except the zone's own static files and the health probe.
  matcher: ["/((?!_community|_next/static|_next/image|favicon.ico|health).*)"],
};
