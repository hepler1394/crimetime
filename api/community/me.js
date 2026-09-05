// GET /api/community/me  -> { signedIn, email (masked), follows: [slug] }
import { sb, memberTokenFrom, memberByToken } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const member = await memberByToken(memberTokenFrom(req));
    if (!member || member.unsubscribed_at) return res.status(200).json({ signedIn: false, follows: [] });
    const rows = await sb(`cts_follows?select=case_slug&member_id=eq.${member.id}`);
    const [user, domain] = member.email.split("@");
    return res.status(200).json({ signedIn: true, email: `${user.slice(0, 2)}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`, confirmed: !!member.confirmed_at, follows: rows.map((r) => r.case_slug) });
  } catch (e) {
    console.error("me:", e.message);
    return res.status(200).json({ signedIn: false, follows: [] });
  }
}
