// Handle rules for community members.
//
// Pure and dependency-free on purpose: it runs under node:test without the framework, and
// the same rules apply on the server, in the form, and in any script that backfills a row.
// A handle is the only name a member has in public, so the shape is deliberately narrow -
// no dots, no dashes, no unicode, nothing that lets one handle be mistaken for another.

// Words that would let someone impersonate the show, and words that collide with a route
// this zone owns or may own. Every entry here is a valid handle shape; a word that could
// never be typed anyway is dead weight that hides the ones that matter.
export const RESERVED = new Set([
  "admin", "administrator", "moderator", "mod", "staff", "support", "help", "root", "system",
  "cory", "crimetimesnacks", "crimetime", "official", "team",
  "account", "accounts", "signin", "signout", "login", "logout", "register", "auth", "api",
  "user", "users", "profile", "settings", "new", "edit", "delete", "null", "undefined",
  "about", "contact", "blog", "cases", "episodes", "search", "feed", "rss", "merch", "quiz",
]);

export const normalizeHandle = (input) => String(input ?? "").trim().toLowerCase();

// Returns null when the handle is fine, or a sentence to show the person. The message is
// the interface here: it is rendered as-is under the field.
export function handleError(input) {
  if (typeof input !== "string") return "Pick a handle.";
  const h = normalizeHandle(input);
  if (!h) return "Pick a handle.";
  if (h.length < 3) return "Handles are at least 3 characters.";
  if (h.length > 20) return "Handles are at most 20 characters.";
  if (!/^[a-z0-9_]+$/.test(h)) return "Handles use letters, numbers and underscores only.";
  if (!/^[a-z]/.test(h)) return "Handles start with a letter.";
  if (RESERVED.has(h)) return "That handle is not available.";
  return null;
}
