// Supabase clients for the community zone.
//
// The session lives in HttpOnly cookies written by the server. Nothing hands a token to
// browser JavaScript, which is the whole reason this zone is server-rendered: the old
// cts_m cookie carried the member's permanent secret, the same one that went out in every
// email, and it never rotated.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cookies are set on the registrable domain so the static zone and this one see the same
// session. In development there is no domain to share, so it is left off.
const DOMAIN = process.env.COOKIE_DOMAIN || undefined;

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) {
            store.set(name, value, { ...options, domain: DOMAIN, httpOnly: true, secure: true, sameSite: "lax", path: "/" });
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The middleware and
          // route handlers do the writing; this is the documented no-op.
        }
      },
    },
  });
}

// The signed-in member, or null. Never returns the email to a caller that did not ask.
export async function currentUser() {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}
