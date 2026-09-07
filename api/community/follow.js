// POST /api/community/follow  { email, case }
// Follow a case by email. A member with the cookie follows at once; anyone else
// gets one email: a confirmation link (new member) or a sign-in link (known
// member) that also sets the cookie. Never reveals whether an email exists.
import { sb, sendMail, isEmail, isSlug, memberTokenFrom, memberByToken, readJsonBody, confirmEmail, signinEmail, SITE } from "../../automation/community/lib.js";

// One confirmation or sign-in mail per address per ten minutes. Anyone can post to this
// endpoint and every call sends real email, to an address that may not have asked for it.
//
// The claim is a single conditional UPDATE, so it holds across function instances and two
// simultaneous requests cannot both win it: whoever stamps last_mail_at first gets the
// row back and sends; the other gets nothing back and stays quiet. Both callers see the
// same answer, so nothing is revealed about who is already a member.
const MAIL_COOLDOWN_MS = 10 * 60 * 1000;
async function claimMailSlot(memberId) {
  const cutoff = new Date(Date.now() - MAIL_COOLDOWN_MS).toISOString();
  const won = await sb(
    `cts_members?id=eq.${memberId}&or=(last_mail_at.is.null,last_mail_at.lt.${cutoff})&select=id`,
    { method: "PATCH", body: { last_mail_at: new Date().toISOString() }, prefer: "return=representation" },
  );
  return Array.isArray(won) && won.length > 0;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const slug = String(body.case || "").trim();
    if (!isSlug(slug)) return res.status(400).json({ error: "bad case" });
    const kase = (await sb(`cts_cases?select=slug,title&slug=eq.${slug}&limit=1`))?.[0];
    if (!kase) return res.status(404).json({ error: "no such case" });

    // Signed-in path: cookie member follows immediately.
    const cookieMember = await memberByToken(memberTokenFrom(req));
    if (cookieMember && (!email || cookieMember.email === email)) {
      await sb("cts_follows", { method: "POST", body: { member_id: cookieMember.id, case_slug: slug }, prefer: "resolution=ignore-duplicates,return=minimal" });
      if (cookieMember.unsubscribed_at) await sb(`cts_members?id=eq.${cookieMember.id}`, { method: "PATCH", body: { unsubscribed_at: null }, prefer: "return=minimal" });
      return res.status(200).json({ ok: true, state: "following", case: slug });
    }

    if (!isEmail(email)) return res.status(400).json({ error: "enter a valid email" });
    // on_conflict=email is required: id is the primary key, so without naming the email
    // constraint PostgREST cannot write ON CONFLICT and a returning member gets a 409.
    await sb("cts_members?on_conflict=email", { method: "POST", body: { email }, prefer: "resolution=ignore-duplicates,return=minimal" });
    const member = (await sb(`cts_members?select=*&email=eq.${encodeURIComponent(email)}&limit=1`))?.[0];
    if (!member) throw new Error("member upsert failed");
    await sb("cts_follows", { method: "POST", body: { member_id: member.id, case_slug: slug }, prefer: "resolution=ignore-duplicates,return=minimal" });

    if (await claimMailSlot(member.id)) {
      const link = `${SITE()}/api/community/confirm?t=${member.token}&c=${slug}`;
      const mail = member.confirmed_at ? signinEmail({ caseTitle: kase.title, link }) : confirmEmail({ caseTitle: kase.title, link });
      await sendMail({ to: email, ...mail });
    }
    return res.status(200).json({ ok: true, state: "check-email", case: slug });
  } catch (e) {
    console.error("follow:", e.message);
    return res.status(500).json({ error: "Something broke on our side. Try again in a minute." });
  }
}
