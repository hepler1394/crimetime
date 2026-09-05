// GET /api/community/confirm?t=<token>&c=<case>
// Confirms the member (first click) and signs this browser in with the cookie,
// then lands on the case page.
import { sb, memberByToken, cookieFor, isSlug, SITE } from "../../automation/community/lib.js";

export default async function handler(req, res) {
  const t = String(req.query?.t || "");
  const c = String(req.query?.c || "");
  const back = isSlug(c) ? `${SITE()}/cases/${c}.html` : `${SITE()}/cases.html`;
  try {
    const member = /^[a-f0-9]{48}$/.test(t) ? await memberByToken(t) : null;
    if (!member) { res.setHeader("Location", `${back}?follow=invalid`); return res.status(302).end(); }
    const patch = { unsubscribed_at: null };
    if (!member.confirmed_at) patch.confirmed_at = new Date().toISOString();
    await sb(`cts_members?id=eq.${member.id}`, { method: "PATCH", body: patch, prefer: "return=minimal" });
    res.setHeader("Set-Cookie", cookieFor(member.token));
    res.setHeader("Location", `${back}?follow=confirmed`);
    return res.status(302).end();
  } catch (e) {
    console.error("confirm:", e.message);
    res.setHeader("Location", `${back}?follow=error`); return res.status(302).end();
  }
}
