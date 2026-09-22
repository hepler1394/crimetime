// Supabase Auth's admin API, over plain fetch with the service role key.
//
// Separate from store.js because this reaches the auth schema rather than our tables, and
// because the service key doing this is a different kind of power: it can delete a person's
// sign-in. Everything here is called from a route handler, never from a page.

const URL_BASE = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function deleteAuthUser(id) {
  const key = KEY();
  if (!URL_BASE() || !key) throw new Error("Supabase env missing on the community zone");
  const res = await fetch(`${URL_BASE()}/auth/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  // Already gone is the outcome we were asking for, so it is not a failure.
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`auth admin delete: ${res.status} ${(await res.text()).slice(0, 200)}`);
}
