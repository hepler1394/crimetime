// POST /api/community/follow  { email, case }
// Follow a case by email. A member with the cookie follows at once; anyone else
// gets one email: a confirmation link (new member) or a sign-in link (known
// member) that also sets the cookie. Never reveals whether an email exists.
// One mail per address per ten minutes: see claimMailSlot in lib.js.
import { sb, sendMail, isEmail, isSlug, memberFrom, readJsonBody, claimMailSlot, confirmEmail, signinEmail, SITE } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = await readJsonBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const slug = String(body.case || "").trim();
    if (!isSlug(slug)) return res.status(400).json({ error: "bad case" });
    const kase = (await sb(`cts_cases?select=slug,title&slug=eq.${slug}&limit=1`))?.[0];
    if (!kase) return res.status(404).json({ error: "no such case" });

    // Signed-in path: follow at once, no mail, no waiting for an inbox. Takes either
    // cookie - the Supabase session written by the community zone, or the old cts_m - so
    // somebody halfway through the move is never told to go and check their email for a
    // case they are already signed in to follow.
    const cookieMember = await memberFrom(req);
    if (cookieMember && (!email || cookieMember.email === email)) {
      await sb("cts_follows", { method: "POST", body: { member_id: cookieMember.id, case_slug: slug }, prefer: "resolution=ignore-duplicates,return=minimal" });
      if (cookieMember.unsubscribed_at) await sb(`cts_members?id=eq.${cookieMember.id}`, { method: "PATCH", body: { unsubscribed_at: null }, prefer: "return=minimal" });
      return res.status(200).json({ ok: true, followed: true, state: "following", case: slug });
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
      await sendMail({ to: email, ...mail, unsubToken: member.token });
    }
    return res.status(200).json({ ok: true, state: "check-email", case: slug });
  } catch (e) {
    console.error("follow:", e.message);
    return res.status(500).json({ error: "Something broke on our side. Try again in a minute." });
  }
}
