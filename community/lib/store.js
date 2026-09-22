// The Supabase-backed store that members.mjs runs against.
//
// Plain fetch against the REST layer with the service role key, the same way
// automation/community/lib.js does it, so there is one way of talking to this database and
// not two. The service key never leaves the server: every caller here is a route handler or
// a server action.
//
// members.mjs is pure and takes this as an argument, which is why the linking and merging
// rules are tested without a database at all.

const URL_BASE = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(path, { method = "GET", body, prefer } = {}) {
  const key = KEY();
  if (!URL_BASE() || !key) throw new Error("Supabase env missing on the community zone");
  const res = await fetch(`${URL_BASE()}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`supabase ${method} ${path.split("?")[0]}: ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    // Postgres puts the constraint that refused the write in `code` - 23505 for a unique
    // index, 23514 for a check. A caller that wants to turn one of those into a sentence a
    // member can read needs the code, not a string to sniff.
    try { err.code = JSON.parse(text)?.code; } catch { /* not JSON, leave it undefined */ }
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// PostgREST puts the filter value in the query string, so anything interpolated has to be
// encoded or a comma in an address would read as a second filter.
const q = (v) => encodeURIComponent(String(v));

export function restStore() {
  return {
    /* ---- linkMember ---- */
    async findByAuthId(id) {
      const rows = await sb(`cts_members?select=*&auth_user_id=eq.${q(id)}&limit=1`);
      return rows?.[0] || null;
    },
    async findByEmail(email) {
      // Addresses were stored as typed, so the match has to ignore case rather than assume it.
      //
      // Deliberately does NOT read cts_member_emails. A linked address is a record that an
      // address belongs to someone, not a second way in: a row reached through one would
      // already hold a different auth_user_id, and linkMember refuses that rather than
      // overwrite it - so making linked addresses sign-in routes would turn a helpful link
      // into a locked door. Sign-in stays on the address the account was opened with.
      const rows = await sb(`cts_members?select=*&email=ilike.${q(String(email).trim())}&limit=1`);
      return rows?.[0] || null;
    },
    async setAuthId(memberId, authUserId) {
      const rows = await sb(`cts_members?id=eq.${q(memberId)}`, {
        method: "PATCH", body: { auth_user_id: authUserId }, prefer: "return=representation",
      });
      return rows?.[0] || null;
    },
    async insertMember({ auth_user_id, email }) {
      const rows = await sb("cts_members", {
        method: "POST",
        // confirmed_at: arriving through Supabase Auth means the address is already proven,
        // so they should not be asked to confirm it a second time by email.
        body: [{ auth_user_id, email, confirmed_at: new Date().toISOString() }],
        prefer: "return=representation",
      });
      return rows?.[0] || null;
    },

    /* ---- mergeMembers ---- */
    async get(id) {
      const rows = await sb(`cts_members?select=*&id=eq.${q(id)}&limit=1`);
      return rows?.[0] || null;
    },
    async follows(memberId) {
      const rows = await sb(`cts_follows?select=case_slug&member_id=eq.${q(memberId)}`);
      return (rows || []).map((r) => r.case_slug);
    },
    async addFollows(memberId, slugs) {
      if (!slugs.length) return;
      await sb("cts_follows", {
        method: "POST",
        body: slugs.map((case_slug) => ({ member_id: memberId, case_slug })),
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
    },
    async update(id, patch) {
      await sb(`cts_members?id=eq.${q(id)}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
    },
    async deleteMember(id) {
      await sb(`cts_members?id=eq.${q(id)}`, { method: "DELETE", prefer: "return=minimal" });
    },

    /* ---- profiles ---- */
    async byHandle(handle) {
      const rows = await sb(`cts_members?select=handle,display_name,avatar_url,bio,show_follows,created_at&handle=eq.${q(handle)}&limit=1`);
      return rows?.[0] || null;
    },
    async setProfile(memberId, patch) {
      const rows = await sb(`cts_members?id=eq.${q(memberId)}`, {
        method: "PATCH", body: patch, prefer: "return=representation",
      });
      return rows?.[0] || null;
    },
    /* ---- the account page ---- */
    // Saved cases with the titles to show them under. Two calls rather than an embedded
    // join: cts_follows.case_slug has no foreign key to cts_cases, so a case that has not
    // been imported yet still has to appear, under its slug, instead of dropping out.
    async followedCases(memberId) {
      const rows = await sb(`cts_follows?select=case_slug,created_at&member_id=eq.${q(memberId)}&order=created_at.desc`);
      const slugs = (rows || []).map((r) => r.case_slug);
      if (!slugs.length) return [];
      const cases = await sb(`cts_cases?select=slug,title&slug=in.(${slugs.map(q).join(",")})`);
      const titles = new Map((cases || []).map((c) => [c.slug, c.title]));
      return slugs.map((slug) => ({ slug, title: titles.get(slug) || slug }));
    },
    async unfollow(memberId, slug) {
      await sb(`cts_follows?member_id=eq.${q(memberId)}&case_slug=eq.${q(slug)}`, { method: "DELETE", prefer: "return=minimal" });
    },

    /* ---- linked addresses ---- */
    async linkedEmails(memberId) {
      const rows = await sb(`cts_member_emails?select=email,added_at&member_id=eq.${q(memberId)}&order=added_at`);
      return rows || [];
    },
    async linkedEmailOwner(email) {
      const rows = await sb(`cts_member_emails?select=member_id&email=ilike.${q(String(email).trim())}&limit=1`);
      return rows?.[0]?.member_id || null;
    },
    async addLinkedEmail(memberId, email) {
      await sb("cts_member_emails", {
        method: "POST",
        body: [{ member_id: memberId, email: String(email).trim().toLowerCase() }],
        prefer: "resolution=ignore-duplicates,return=minimal",
      });
    },
    async removeLinkedEmail(memberId, email) {
      await sb(`cts_member_emails?member_id=eq.${q(memberId)}&email=ilike.${q(String(email).trim())}`, { method: "DELETE", prefer: "return=minimal" });
    },

    async handleTaken(handle, exceptMemberId) {
      const rows = await sb(`cts_members?select=id&handle=eq.${q(handle)}&limit=1`);
      const row = rows?.[0];
      return !!row && row.id !== exceptMemberId;
    },
  };
}
