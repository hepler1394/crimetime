// GET /api/community/unsubscribe?t=<token>
// Stops every email to this member. Follows are kept so a later confirm brings them back.
import { sb, memberByToken, esc } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  const t = String(req.query?.t || "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const page = (title, body) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body style="margin:0;background:#050505;color:#f7f7f8;font-family:Inter,Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh"><div style="max-width:480px;padding:32px;text-align:center"><h1 style="font-weight:600">${title}</h1><p style="color:#a3a3ad;line-height:1.6">${body}</p><p><a href="/" style="color:#ff2b33">Back to CrimeTimeSnacks</a></p></div></body></html>`;
  try {
    const member = /^[a-f0-9]{48}$/.test(t) ? await memberByToken(t) : null;
    if (!member) return res.status(404).send(page("Link not recognised", "That unsubscribe link is not valid. If you keep getting email from us, reply to it and a human will sort it out."));
    await sb(`cts_members?id=eq.${member.id}`, { method: "PATCH", body: { unsubscribed_at: new Date().toISOString() }, prefer: "return=minimal" });
    return res.status(200).send(page("You are unsubscribed", `No more case updates will be sent to ${esc(member.email)}. Your follows are kept; follow any case again to turn email back on.`));
  } catch (e) {
    console.error("unsubscribe:", e.message);
    return res.status(500).send(page("Something broke", "Try the link again in a minute."));
  }
}
