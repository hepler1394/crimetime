// GET /api/community/me -> who is signed in, for the generated pages to read.
//
// The header on every static page calls this to decide whether to show "Sign in" or the
// member's handle. It answers 200 either way: signed out is an answer, not an error, and a
// 401 here would put a red line in the console of every page a logged-out reader opens.
//
// It never returns the raw address. The masking rule is the one from the community zone,
// so this endpoint and the account page cannot drift into masking the same person's
// address two different ways.
//
// refresh: true means a session cookie was there but its hour was up. Only the community
// zone can renew it (POST /auth/refresh); js/account.js does that once and asks again.
//
// Unsubscribing from email is not signing out. Until 2026-10-05 a member who had used the
// unsubscribe link was answered as signed out here, so the header said "Sign in" to someone
// who was, and the follow form asked them for an email address.
import { sb, sessionMember, memberByToken, memberTokenFrom } from "../../automation/community/lib.js";
import { maskEmail } from "../../community/lib/profile.mjs";

const SIGNED_OUT = { signedIn: false, follows: [] };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const session = await sessionMember(req);
    const member = session.member || (await memberByToken(memberTokenFrom(req)));
    if (!member) return res.status(200).json(session.stale ? { ...SIGNED_OUT, refresh: true } : SIGNED_OUT);

    const rows = await sb(`cts_follows?select=case_slug&member_id=eq.${member.id}`);
    return res.status(200).json({
      signedIn: true,
      handle: member.handle || null,
      displayName: member.display_name || null,
      email: maskEmail(member.email),
      confirmed: !!member.confirmed_at,
      emailOff: !!member.unsubscribed_at,
      follows: rows.map((r) => r.case_slug),
    });
  } catch (e) {
    console.error("me:", e.message);
    return res.status(200).json(SIGNED_OUT);
  }
}
