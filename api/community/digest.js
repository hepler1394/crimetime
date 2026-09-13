// GET /api/community/digest        weekly cron (vercel.json), Bearer CRON_SECRET
// GET /api/community/digest?key=<CRON_SECRET>&to=<email>&dry=1   test to one member
//
// For every confirmed, subscribed member, one email holding:
//   - the approved updates on the cases they follow since their last digest
//     (first digest: the last 30 days), and
//   - for members on The Case File, the episodes and blog posts that went up on the
//     site since their last digest (first digest: the last 7 days).
// None if both are empty. Logged in cts_digest_log.
import { sb, sendMail, digestEmail, publishedSince, SITE } from "../../automation/community/lib.js";

const DAY = 864e5;

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET || "";
  const given = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query?.key || "");
  if (!secret || given !== secret) return res.status(401).json({ error: "unauthorized" });
  const only = String(req.query?.to || "").toLowerCase();
  const dry = String(req.query?.dry || "") === "1";
  const report = { members: 0, sent: 0, skipped: 0, errors: [] };
  try {
    const members = await sb(`cts_members?select=id,email,token,last_digest_at,newsletter&confirmed_at=not.is.null&unsubscribed_at=is.null${only ? `&email=eq.${encodeURIComponent(only)}` : ""}`);
    const cases = Object.fromEntries((await sb("cts_cases?select=slug,title")).map((c) => [c.slug, c]));
    // The site content is the same for everyone; fetch it once, window it per member.
    const siteJson = {};
    const fetchJson = async (p) => { if (!siteJson[p]) siteJson[p] = fetch(`${SITE()}${p}`).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); }); return siteJson[p]; };
    for (const m of members) {
      report.members++;
      try {
        const follows = (await sb(`cts_follows?select=case_slug&member_id=eq.${m.id}`)).map((f) => f.case_slug);
        if (!follows.length && !m.newsletter) { report.skipped++; continue; }
        const updatesSince = m.last_digest_at || new Date(Date.now() - 30 * DAY).toISOString();
        const updates = follows.length
          ? await sb(`cts_case_updates?select=case_slug,happened_on,title,summary,url,source&status=eq.approved&approved_at=gt.${encodeURIComponent(updatesSince)}&case_slug=in.(${follows.map(encodeURIComponent).join(",")})&order=happened_on.desc&limit=60`)
          : [];
        const fresh = m.newsletter
          ? await publishedSince(m.last_digest_at || new Date(Date.now() - 7 * DAY).toISOString(), { fetchJson })
          : { episodes: [], posts: [] };
        const freshCount = fresh.episodes.length + fresh.posts.length;
        if (!updates.length && !freshCount) { report.skipped++; continue; }
        const groups = [];
        for (const slug of follows) { const us = updates.filter((u) => u.case_slug === slug); if (us.length) groups.push({ slug, title: cases[slug]?.title || slug, updates: us }); }
        const mail = digestEmail({ groups, fresh, unsubLink: `${SITE()}/api/community/unsubscribe?t=${m.token}`, manageLink: `${SITE()}/api/community/confirm?t=${m.token}` });
        if (dry) { report.sent++; report.preview = { to: m.email, subject: mail.subject, updates: updates.length, fresh: freshCount }; continue; }
        const id = await sendMail({ to: m.email, ...mail, unsubToken: m.token });
        await sb(`cts_members?id=eq.${m.id}`, { method: "PATCH", body: { last_digest_at: new Date().toISOString() }, prefer: "return=minimal" });
        await sb("cts_digest_log", { method: "POST", body: { member_id: m.id, update_count: updates.length + freshCount, resend_id: id }, prefer: "return=minimal" });
        report.sent++;
      } catch (e) { report.errors.push(`${m.email}: ${e.message}`); }
    }
    return res.status(200).json(report);
  } catch (e) {
    console.error("digest:", e.message);
    return res.status(500).json({ error: e.message, ...report });
  }
}
