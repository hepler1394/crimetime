// GET /api/community/confirm?t=<token>&c=<case>   follow a case: lands on the case page
// GET /api/community/confirm?t=<token>&n=1        The Case File: lands on the homepage
// Confirms the member (first click) and signs this browser in with the cookie.
// The Case File flag is only ever set here, from a link the address itself received,
// so nobody can put someone else's address on the list.
import { sb, memberByToken, cookieFor, isSlug, SITE } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  const t = String(req.query?.t || "");
  const c = String(req.query?.c || "");
  const newsletter = String(req.query?.n || "") === "1";
  const land = (state) => newsletter
    ? `${SITE()}/?subscribed=${state}#the-case-file`
    : `${isSlug(c) ? `${SITE()}/cases/${c}.html` : `${SITE()}/cases.html`}?follow=${state}`;
  try {
    const member = /^[a-f0-9]{48}$/.test(t) ? await memberByToken(t) : null;
    if (!member) { res.setHeader("Location", land("invalid")); return res.status(302).end(); }
    const patch = { unsubscribed_at: null };
    if (!member.confirmed_at) patch.confirmed_at = new Date().toISOString();
    if (newsletter) patch.newsletter = true;
    await sb(`cts_members?id=eq.${member.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
    res.setHeader("Set-Cookie", cookieFor(member.token));
    res.setHeader("Location", land("confirmed"));
    return res.status(302).end();
  } catch (e) {
    console.error("confirm:", e.message);
    res.setHeader("Location", land("error")); return res.status(302).end();
  }
}
