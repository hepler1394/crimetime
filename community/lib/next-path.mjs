// Where to send someone after they sign in.
//
// An open redirect on a sign-in page is a phishing primitive: the link reads as
// crimetimesnacks.com, the person signs in trusting it, and lands somewhere else already
// past their own guard. So this is an allow-list of shape, not a block-list of tricks -
// anything that is not plainly a path on this site becomes /account.

const FALLBACK = "/account";

export function safeNext(input) {
  if (typeof input !== "string") return FALLBACK;
  const s = input.trim();
  if (!s.startsWith("/")) return FALLBACK;      // absolute URLs, scheme-relative, javascript:
  if (s.startsWith("//")) return FALLBACK;      // //evil.example.com is a URL, not a path
  if (/^\/[\\\t\r\n]/.test(s)) return FALLBACK; // /\evil and /<tab>/evil are read as hosts by some clients
  if (/[\r\n]/.test(s)) return FALLBACK;        // header splitting
  return s;
}
