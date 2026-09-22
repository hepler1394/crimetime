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

// A first guess at a handle, from the display name the provider gave us. Never from the
// email address: someone pressing enter on a prefilled field should not be publishing the
// local part of their inbox. Returns "" when there is nothing usable in the name, because
// an empty field is honest and a bad suggestion is a trap.
export function suggestHandle(name) {
  let h = String(name ?? "").trim().toLowerCase()
    .replace(/['’]/g, "")     // o'brien is obrien, not o_brien
    .replace(/[^a-z0-9]+/g, "_")   // every other run of punctuation or space is one underscore
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "");      // handles start with a letter, so drop what comes before one
  if (h.length > 20) h = h.slice(0, 20).replace(/_+$/, "");
  if (RESERVED.has(h)) h = `${h.slice(0, 19)}_`;
  return handleError(h) ? "" : h;
}
