// GET /api/community/digest        weekly cron (vercel.json), Bearer CRON_SECRET
// GET /api/community/digest?key=<CRON_SECRET>&to=<email>&dry=1   test to one member
//
// For every confirmed, subscribed member: the approved updates on the cases
// they follow since their last digest (first digest: the last 30 days). One
// email per member, none if nothing happened. Logged in cts_digest_log.
import { sb, sendMail, digestEmail, SITE } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET || "";
  const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query?.key || "");
  if (!secret || given !== secret) return res.status(401).json({ error: "unauthorized" });
  const only = String(req.query?.to || "").toLowerCase();
  const dry = String(req.query?.dry || "") === "1";
  const report = { members: 0, sent: 0, skipped: 0, errors: [] };
  try {
    let members = await sb(`cts_members?select=id,email,token,last_digest_at&confirmed_at=not.is.null&unsubscribed_at=is.null${only ? `&email=eq.${encodeURIComponent(only)}` : ""}`);
    const cases = Object.fromEntries((await sb("cts_cases?select=slug,title")).map((c) => [c.slug, c]));
    for (const m of members) {
      report.members++;
      try {
        const follows = (await sb(`cts_follows?select=case_slug&member_id=eq.${m.id}`)).map((f) => f.case_slug);
        if (!follows.length) { report.skipped++; continue; }
        const since = m.last_digest_at || new Date(Date.now() - 30 * 864e5).toISOString();
        const updates = await sb(`cts_case_updates?select=case_slug,happened_on,title,summary,url,source&status=eq.approved&approved_at=gt.${encodeURIComponent(since)}&case_slug=in.(${follows.map(encodeURIComponent).join(",")})&order=happened_on.desc&limit=60`);
        if (!updates.length) { report.skipped++; continue; }
        const groups = [];
        for (const slug of follows) { const us = updates.filter((u) => u.case_slug === slug); if (us.length) groups.push({ slug, title: cases[slug]?.title || slug, updates: us }); }
        const mail = digestEmail({ groups, unsubLink: `${SITE()}/api/community/unsubscribe?t=${m.token}`, manageLink: `${SITE()}/api/community/confirm?t=${m.token}` });
        if (dry) { report.sent++; report.preview = { to: m.email, subject: mail.subject, updates: updates.length }; continue; }
        const id = await sendMail({ to: m.email, ...mail });
        await sb(`cts_members?id=eq.${m.id}`, { method: "PATCH", body: { last_digest_at: new Date().toISOString() }, prefer: "return=minimal" });
        await sb("cts_digest_log", { method: "POST", body: { member_id: m.id, update_count: updates.length, resend_id: id }, prefer: "return=minimal" });
        report.sent++;
      } catch (e) { report.errors.push(`${m.email}: ${e.message}`); }
    }
    return res.status(200).json(report);
  } catch (e) {
    console.error("digest:", e.message);
    return res.status(500).json({ error: e.message, ...report });
  }
}
