// Reading the Supabase session cookie without a Supabase client.
//
// This lives here, in the zone that writes the cookie, because the static site's
// /api/community/* functions have to read the same cookie and there must be exactly one
// description of its shape. They are plain Vercel functions with no SDK, so they import
// this rather than growing a dependency on @supabase/ssr.
//
// Pure and dependency-free: everything here is string work on a header. Nothing in this
// file decides whether a token is valid - it only finds it. A token pulled out of a cookie
// is a claim, and the caller has to check it with Supabase before trusting a word of it.

// @supabase/ssr stores the session under sb-<project ref>-auth-token by default, where the
// ref is the first label of the project host.
export function storageKeyFor(supabaseUrl) {
  const host = String(supabaseUrl ?? "").trim().replace(/^https?:\/\//, "").split("/")[0];
  const ref = host.split(".")[0];
  // The charset is the real guard: it rejects an empty value, a path, a port, and the
  // spaces in something that was never a URL. No length bound beyond that, because the
  // length of a project ref is Supabase's business and not something to hard-code here.
  return /^[a-z0-9]{3,}$/i.test(ref) ? `sb-${ref}-auth-token` : null;
}

function parseCookies(header) {
  const out = new Map();
  for (const part of String(header ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    out.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return out;
}

function fromBase64Url(s) {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

export function accessTokenFromCookieHeader(header, storageKey) {
  if (!storageKey) return null;
  const jar = parseCookies(header);

  let raw = jar.get(storageKey);
  if (raw === undefined) {
    // Chunked. The browser sends cookies in no guaranteed order, and a gap in the
    // sequence means a partial write: joining what is there would produce a token that
    // looks plausible and is not one, so a gap is treated as no cookie at all.
    const chunks = [];
    for (let i = 0; ; i++) {
      const part = jar.get(`${storageKey}.${i}`);
      if (part === undefined) break;
      chunks.push(part);
    }
    if (!chunks.length) return null;
    let seen = 0;
    for (const name of jar.keys()) if (name.startsWith(`${storageKey}.`)) seen++;
    if (seen !== chunks.length) return null;
    raw = chunks.join("");
  }

  let text = decodeURIComponent(raw);
  if (text.startsWith("base64-")) {
    try { text = fromBase64Url(text.slice("base64-".length)); } catch { return null; }
  }

  let session;
  try { session = JSON.parse(text); } catch { return null; }
  const token = session?.access_token;
  return typeof token === "string" && token ? token : null;
}
