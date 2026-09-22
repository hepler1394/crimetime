// GET /api/community/me -> who is signed in, for the generated pages to read.
//
// The header on every static page calls this to decide whether to show "Sign in" or the
// member's handle. It answers 200 either way: signed out is an answer, not an error, and a
// 401 here would put a red line in the console of every page a logged-out reader opens.
//
// It never returns the raw address. The masking rule is the one from the community zone,
// so this endpoint and the account page cannot drift into masking the same person's
// address two different ways.
import { sb, memberFrom } from "../../automation/community/lib.js";
import { maskEmail } from "../../community/lib/profile.mjs";

const SIGNED_OUT = { signedIn: false, follows: [] };

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const member = await memberFrom(req);
    if (!member || member.unsubscribed_at) return res.status(200).json(SIGNED_OUT);

    const rows = await sb(`cts_follows?select=case_slug&member_id=eq.${member.id}`);
    return res.status(200).json({
      signedIn: true,
      handle: member.handle || null,
      displayName: member.display_name || null,
      email: maskEmail(member.email),
      confirmed: !!member.confirmed_at,
      follows: rows.map((r) => r.case_slug),
    });
  } catch (e) {
    console.error("me:", e.message);
    return res.status(200).json(SIGNED_OUT);
  }
}
