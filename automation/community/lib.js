// Shared helpers for the community functions (/api/community/*) and the
// automation scripts. Plain fetch against Supabase's REST layer with the
// service role key, plus Resend for mail. No SDKs, no build step.
//
// Env (Vercel project + automation/.env.community locally):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//   RESEND_API_KEY, MAIL_FROM, SITE_URL, CRON_SECRET

import { storageKeyFor, accessTokenFromCookieHeader } from "../../community/lib/session-cookie.mjs";

export const env = (k, d) => process.env[k] ?? d;
export const SITE = () => (env("SITE_URL", "https://www.crimetimesnacks.com")).replace(/\/$/, "");
export const FROM = () => env("MAIL_FROM", "CrimeTimeSnacks <updates@thebaseline.report>");

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Supabase REST. path like "cts_cases?select=*&slug=eq.foo". Returns parsed JSON (or null for 204).
// Reads retry on a network error or a 5xx: the Sunday digest of 2026-09-13 died on a single
// 504 from the REST gateway and sent nothing. Writes do not retry, because a write that
// timed out may still have landed.
export async function sb(path, { method = "GET", body, prefer, anon = false, headers = {} } = {}) {
  const key = anon ? env("SUPABASE_ANON_KEY") : env("SUPABASE_SERVICE_ROLE_KEY");
  if (!env("SUPABASE_URL") || !key) throw new Error("Supabase env missing (SUPABASE_URL / key)");
  const tries = method === "GET" ? 3 : 1;
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
        method,
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (attempt < tries) { await pause(1000 * attempt * attempt); continue; }
      throw e;
    }
    if (res.status >= 500 && attempt < tries) { await pause(1000 * attempt * attempt); continue; }
    if (!res.ok) throw new Error(`supabase ${method} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
}

// unsubToken: the member's token. Every mail used to carry a List-Unsubscribe header that
// pointed at the literal placeholder "t=UNSUB", so the mail client's unsubscribe button led
// to "Link not recognised". The endpoint answers POST as well, which is what one-click needs.
export async function sendMail({ to, subject, html, text, unsubToken }) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY missing");
  const headers = unsubToken
    ? { "List-Unsubscribe": `<${SITE()}/api/community/unsubscribe?t=${unsubToken}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
    : undefined;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text, ...(headers ? { headers } : {}) }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend: ${res.status} ${j.message || ""}`);
  return j.id || "";
}

// One confirmation or sign-in mail per address per ten minutes. /api/community/follow and
// /api/community/subscribe are open to anyone and every call sends real email, to an
// address that may not have asked for it.
//
// The claim is a single conditional UPDATE, so it holds across function instances and two
// simultaneous requests cannot both win it: whoever stamps last_mail_at first gets the
// row back and sends; the other gets nothing back and stays quiet. Both callers see the
// same answer, so nothing is revealed about who is already a member.
export const MAIL_COOLDOWN_MS = 10 * 60 * 1000;
export async function claimMailSlot(memberId) {
  const cutoff = new Date(Date.now() - MAIL_COOLDOWN_MS).toISOString();
  const won = await sb(
    `cts_members?id=eq.${memberId}&or=(last_mail_at.is.null,last_mail_at.lt.${cutoff})&select=id`,
    { method: "PATCH", body: { last_mail_at: new Date().toISOString() }, prefer: "return=representation" },
  );
  return Array.isArray(won) && won.length > 0;
}

export const isEmail = (s) => typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length < 200;
export const isSlug = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,80}$/.test(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Members are identified by a long random token carried in a cookie after they
// click a link we emailed them. No passwords, no third-party auth.
export function memberTokenFrom(req) {
  const c = req.headers.cookie || "";
  const m = c.match(/(?:^|;\s*)cts_m=([a-f0-9]{48})/);
  return m ? m[1] : null;
}
export function cookieFor(token) {
  return `cts_m=${token}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
}
export async function memberByToken(token) {
  if (!token) return null;
  const rows = await sb(`cts_members?select=*&token=eq.${token}&limit=1`);
  return rows?.[0] || null;
}

// The signed-in member, from the Supabase session cookie the community zone writes.
//
// Two cookies can identify somebody on this site now. The old cts_m carries a permanent
// secret that also went out in every email and never rotates; the Supabase one carries a
// short-lived token that does. New code should reach for memberFrom, which prefers the
// session, so the old cookie fades out as people sign in rather than needing a migration.
//
// The token in a cookie is a claim, not a fact. Supabase is asked to verify it on every
// request: an expired or edited one comes back 401 and the caller is simply signed out.
export async function memberFromSession(req) {
  const key = storageKeyFor(env("SUPABASE_URL"));
  const token = accessTokenFromCookieHeader(req?.headers?.cookie, key);
  if (!token) return null;

  let res;
  try {
    res = await fetch(`${env("SUPABASE_URL")}/auth/v1/user`, {
      headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: `Bearer ${token}` },
    });
  } catch { return null; }
  if (!res.ok) return null;

  const user = await res.json().catch(() => null);
  if (!user?.id) return null;

  const rows = await sb(`cts_members?select=*&auth_user_id=eq.${encodeURIComponent(user.id)}&limit=1`);
  return rows?.[0] || null;
}

// Whoever is signed in, by either cookie.
export async function memberFrom(req) {
  return (await memberFromSession(req)) || (await memberByToken(memberTokenFrom(req)));
}
export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = ""; for await (const c of req) raw += c;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

/* ------------------------------------------------------- site content */
// What went up on the site after `sinceIso`, for The Case File. Read from the deployed
// JSON the site is built from, so the email can only ever list something already public.
// Episodes carry a full pubDate; blog posts only a date, taken as noon UTC.
export async function publishedSince(sinceIso, { fetchJson } = {}) {
  const get = fetchJson || (async (p) => { const r = await fetch(`${SITE()}${p}`); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); });
  const [eps, blog] = await Promise.all([get("/automation/episodes.json"), get("/automation/blog.json")]);
  const since = Date.parse(sinceIso), now = Date.now();
  const when = (x) => (x.pubDate ? Date.parse(x.pubDate) : Date.parse(`${x.date}T12:00:00Z`));
  const inWindow = (x) => { const t = when(x); return Number.isFinite(t) && t > since && t <= now; };
  return {
    episodes: (eps.episodes || []).filter(inWindow).sort((a, b) => when(b) - when(a))
      .map((e) => ({ title: e.title, url: `${SITE()}/episodes/${e.slug}.html`, duration: String(e.duration || "").replace(/^00:/, ""), blurb: e.description || "" })),
    posts: (blog.posts || []).filter(inWindow).sort((a, b) => when(b) - when(a))
      .map((p) => ({ title: p.title, url: `${SITE()}/blog-posts/${p.slug}.html`, blurb: p.excerpt || "" })),
  };
}

/* ------------------------------------------------------------ emails */
const shell = (title, inner) => `<!doctype html><html><body style="margin:0;background:#050505;font-family:Inter,Helvetica,Arial,sans-serif;color:#f7f7f8">
<div style="max-width:560px;margin:0 auto;padding:28px 22px">
  <div style="font:700 22px/1 Impact,'Bebas Neue',Helvetica,sans-serif;letter-spacing:.04em;margin-bottom:22px">CRIME<span style="color:#e50914">TIME</span>SNACKS</div>
  <h1 style="font:600 22px/1.3 Inter,Helvetica,Arial,sans-serif;margin:0 0 14px">${title}</h1>
  ${inner}
  <p style="color:#6b6b74;font-size:12px;line-height:1.6;margin-top:30px">CrimeTimeSnacks, a true crime podcast. <a href="${SITE()}" style="color:#a3a3ad">www.crimetimesnacks.com</a></p>
</div></body></html>`;
const btn = (href, label) => `<p style="margin:22px 0"><a href="${href}" style="background:#e50914;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:4px;display:inline-block">${label}</a></p>`;
const p = (t) => `<p style="color:#c9c9cf;font-size:15px;line-height:1.6;margin:0 0 12px">${t}</p>`;
const h2 = (t) => `<h2 style="font:600 17px/1.3 Inter,Helvetica,Arial,sans-serif;margin:26px 0 8px">${t}</h2>`;
const clip = (s, n) => { const t = String(s || "").replace(/\s+/g, " ").trim(); if (t.length <= n) return t; const cut = t.slice(0, n); const sp = cut.lastIndexOf(" "); return `${(sp > n * 0.55 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, "")}...`; };

export function confirmEmail({ caseTitle, link }) {
  return {
    subject: `Confirm: follow ${caseTitle} on CrimeTimeSnacks`,
    html: shell(`Follow ${esc(caseTitle)}?`, p(`You asked to follow <b>${esc(caseTitle)}</b>. Confirm and we will email you when something happens in the case: a court date set, a verdict, a filing, an arrest. One weekly note at most, nothing else.`) + btn(link, "Yes, follow this case") + p(`If you did not ask for this, ignore this email and nothing happens.`)),
    text: `You asked to follow ${caseTitle} on CrimeTimeSnacks. Confirm here: ${link}\nIf you did not ask for this, ignore this email.`,
  };
}
export function signinEmail({ caseTitle, link }) {
  return {
    subject: `Your CrimeTimeSnacks follows`,
    html: shell(`Now following ${esc(caseTitle)}`, p(`We added <b>${esc(caseTitle)}</b> to your follows. Open the link below on this device to manage them without another email.`) + btn(link, "Open my follows")),
    text: `We added ${caseTitle} to your CrimeTimeSnacks follows. Manage them here: ${link}`,
  };
}
export function newsletterEmail({ link }) {
  return {
    subject: "Confirm: The Case File from CrimeTimeSnacks",
    html: shell("One click and you are on the list", p(`You asked for The Case File: every new CrimeTimeSnacks episode and crime blog post from the week, in one email on Sunday. If you follow cases, their court dates, rulings and arrests come in the same email.`) + btn(link, "Yes, send me The Case File") + p(`If you did not ask for this, ignore this email and nothing happens.`)),
    text: `You asked for The Case File from CrimeTimeSnacks: the week's new episodes and posts, one email on Sunday. Confirm here: ${link}\nIf you did not ask for this, ignore this email.`,
  };
}

// groups: case updates for the cases this member follows. fresh: { episodes, posts } new on
// the site, only for members on The Case File. Either may be empty, not both.
export function digestEmail({ groups = [], fresh = { episodes: [], posts: [] }, unsubLink, manageLink }) {
  const n = groups.reduce((a, g) => a + g.updates.length, 0);
  const cases = groups.map((g) => `
    ${h2(`<a href="${SITE()}/cases/${g.slug}.html" style="color:#f7f7f8;text-decoration:none">${esc(g.title)}</a>`)}
    ${g.updates.map((u) => `<div style="border-left:2px solid #e50914;padding:2px 0 2px 12px;margin:0 0 12px">
      <div style="color:#f4c20d;font:500 11px/1.4 Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase">${esc(u.happened_on)}</div>
      <div style="color:#f7f7f8;font-weight:600;font-size:15px;line-height:1.4">${esc(u.title)}</div>
      ${u.summary ? `<div style="color:#c9c9cf;font-size:14px;line-height:1.55">${esc(u.summary)}</div>` : ""}
      ${u.url ? `<div style="font-size:12px"><a href="${esc(u.url)}" style="color:#a3a3ad">${esc(u.source || new URL(u.url).hostname)}</a></div>` : ""}
    </div>`).join("")}`).join("");
  const item = (x, label) => `<div style="margin:0 0 16px">
      <div style="color:#f4c20d;font:500 11px/1.4 Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase">${label}</div>
      <a href="${esc(x.url)}" style="color:#f7f7f8;font-weight:600;font-size:15px;line-height:1.4;text-decoration:none">${esc(x.title)}</a>
      ${x.blurb ? `<div style="color:#c9c9cf;font-size:14px;line-height:1.55">${esc(clip(x.blurb, 220))}</div>` : ""}
    </div>`;
  const fresher = fresh.episodes.length + fresh.posts.length
    ? h2("New on CrimeTimeSnacks") + fresh.episodes.map((e) => item(e, `Episode${e.duration ? ` &middot; ${esc(e.duration)}` : ""}`)).join("") + fresh.posts.map((x) => item(x, "Crime blog")).join("")
    : "";
  const lead = fresh.episodes[0] || fresh.posts[0];
  const subject = n
    ? `${n} update${n === 1 ? "" : "s"} on the cases you follow`
    : `The Case File: ${lead ? lead.title : "this week on CrimeTimeSnacks"}`;
  const text = [
    fresh.episodes.length + fresh.posts.length ? `NEW ON CRIMETIMESNACKS\n${[...fresh.episodes.map((e) => `  Episode: ${e.title}  ${e.url}`), ...fresh.posts.map((x) => `  Blog: ${x.title}  ${x.url}`)].join("\n")}` : "",
    groups.map((g) => `${g.title}\n${g.updates.map((u) => `  ${u.happened_on}  ${u.title}${u.url ? `  ${u.url}` : ""}`).join("\n")}`).join("\n\n"),
  ].filter(Boolean).join("\n\n");
  return {
    subject,
    html: shell(n ? "This week in the cases you follow" : "This week on CrimeTimeSnacks", cases + fresher + p(`<a href="${manageLink}" style="color:#a3a3ad">Manage follows</a> &middot; <a href="${unsubLink}" style="color:#a3a3ad">Unsubscribe</a>`)),
    text: `${text}\n\nManage: ${manageLink}\nUnsubscribe: ${unsubLink}`,
  };
}
