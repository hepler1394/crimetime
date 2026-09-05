// POST /api/community/unfollow { case }   (cookie required)
import { sb, isSlug, memberTokenFrom, memberByToken, readJsonBody } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const member = await memberByToken(memberTokenFrom(req));
    if (!member) return res.status(401).json({ error: "not signed in" });
    const { case: slug } = await readJsonBody(req);
    if (!isSlug(slug)) return res.status(400).json({ error: "bad case" });
    await sb(`cts_follows?member_id=eq.${member.id}&case_slug=eq.${slug}`, { method: "DELETE", prefer: "return=minimal" });
    return res.status(200).json({ ok: true, state: "unfollowed", case: slug });
  } catch (e) {
    console.error("unfollow:", e.message);
    return res.status(500).json({ error: "Something broke on our side." });
  }
}
