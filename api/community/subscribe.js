// POST /api/community/subscribe  { email }
// The Case File: the week's new episodes and blog posts in one Sunday email, sent by
// /api/community/digest alongside the updates on any cases the member follows.
//
// A signed-in, confirmed member (cookie, same email or none) is added at once. Anyone
// else gets one email with a confirm link; the newsletter flag is set only when that link
// is clicked (confirm.js with n=1). The answer is the same whether or not the address is
// already a member, and the send shares the follow endpoint's ten-minute cooldown.
import { sb, sendMail, isEmail, memberTokenFrom, memberByToken, readJsonBody, claimMailSlot, newsletterEmail, SITE } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();

    const cookieMember = await memberByToken(memberTokenFrom(req));
    if (cookieMember?.confirmed_at && (!email || cookieMember.email === email)) {
      await sb(`cts_members?id=eq.${cookieMember.id}`, { method: "PATCH", body: { newsletter: true, unsubscribed_at: null }, prefer: "return=minimal" });
      return res.status(200).json({ ok: true, state: "subscribed" });
    }

    if (!isEmail(email)) return res.status(400).json({ error: "Enter a valid email." });
    // on_conflict=email: see follow.js; without it a returning member gets a 409.
    await sb("cts_members?on_conflict=email", { method: "POST", body: { email }, prefer: "resolution=ignore-duplicates,return=minimal" });
    const member = (await sb(`cts_members?select=id,token&email=eq.${encodeURIComponent(email)}&limit=1`))?.[0];
    if (!member) throw new Error("member upsert failed");

    if (await claimMailSlot(member.id)) {
      await sendMail({ to: email, ...newsletterEmail({ link: `${SITE()}/api/community/confirm?t=${member.token}&n=1` }), unsubToken: member.token });
    }
    return res.status(200).json({ ok: true, state: "check-email" });
  } catch (e) {
    console.error("subscribe:", e.message);
    return res.status(500).json({ error: "Something broke on our side. Try again in a minute." });
  }
}
