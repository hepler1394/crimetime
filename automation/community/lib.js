// Shared helpers for the community functions (/api/community/*) and the
// automation scripts. Plain fetch against Supabase's REST layer with the
// service role key, plus Resend for mail. No SDKs, no build step.
//
// Env (Vercel project + automation/.env.community locally):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY,
//   RESEND_API_KEY, MAIL_FROM, SITE_URL, CRON_SECRET

export const env = (k, d) => process.env[k] ?? d;
export const SITE = () => (env("SITE_URL", "https://www.crimetimesnacks.com")).replace(/\/$/, "");
export const FROM = () => env("MAIL_FROM", "CrimeTimeSnacks <updates@thebaseline.report>");

// Supabase REST. path like "cts_cases?select=*&slug=eq.foo". Returns parsed JSON (or null for 204).
export async function sb(path, { method = "GET", body, prefer, anon = false, headers = {} } = {}) {
  const key = anon ? env("SUPABASE_ANON_KEY") : env("SUPABASE_SERVICE_ROLE_KEY");
  if (!env("SUPABASE_URL") || !key) throw new Error("Supabase env missing (SUPABASE_URL / key)");
  const res = await fetch(`${env("SUPABASE_URL")}/rest/v1/${path}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase ${method} ${path.split("?")[0]}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export async function sendMail({ to, subject, html, text }) {
  const key = env("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY missing");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM(), to: [to], subject, html, text, headers: { "List-Unsubscribe": `<${SITE()}/api/community/unsubscribe?t=UNSUB>` } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`resend: ${res.status} ${j.message || ""}`);
  return j.id || "";
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
export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = ""; for await (const c of req) raw += c;
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
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
export function digestEmail({ groups, unsubLink, manageLink }) {
  const sections = groups.map((g) => `
    <h2 style="font:600 17px/1.3 Inter,Helvetica,Arial,sans-serif;margin:26px 0 8px"><a href="${SITE()}/cases/${g.slug}.html" style="color:#f7f7f8;text-decoration:none">${esc(g.title)}</a></h2>
    ${g.updates.map((u) => `<div style="border-left:2px solid #e50914;padding:2px 0 2px 12px;margin:0 0 12px">
      <div style="color:#f4c20d;font:500 11px/1.4 Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase">${esc(u.happened_on)}</div>
      <div style="color:#f7f7f8;font-weight:600;font-size:15px;line-height:1.4">${esc(u.title)}</div>
      ${u.summary ? `<div style="color:#c9c9cf;font-size:14px;line-height:1.55">${esc(u.summary)}</div>` : ""}
      ${u.url ? `<div style="font-size:12px"><a href="${esc(u.url)}" style="color:#a3a3ad">${esc(u.source || new URL(u.url).hostname)}</a></div>` : ""}
    </div>`).join("")}`).join("");
  const n = groups.reduce((a, g) => a + g.updates.length, 0);
  return {
    subject: `${n} update${n === 1 ? "" : "s"} on the cases you follow`,
    html: shell("This week in the cases you follow", sections + p(`<a href="${manageLink}" style="color:#a3a3ad">Manage follows</a> &middot; <a href="${unsubLink}" style="color:#a3a3ad">Unsubscribe</a>`)),
    text: groups.map((g) => `${g.title}\n${g.updates.map((u) => `  ${u.happened_on}  ${u.title}${u.url ? `  ${u.url}` : ""}`).join("\n")}`).join("\n\n") + `\n\nManage: ${manageLink}\nUnsubscribe: ${unsubLink}`,
  };
}
