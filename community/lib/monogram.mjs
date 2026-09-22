// The avatar for a member who has not got one.
//
// Phase one has no uploads, so every profile without a provider photo needs something that
// is theirs and is not a grey silhouette. Initials from the handle, on a colour derived
// from the handle: the same person gets the same tile every time, on every page, with
// nothing stored and nothing fetched.

// FNV-1a. Small, and it spreads short strings that differ by one character - which matters
// here, because handles are short and neighbouring ones would otherwise land on the same
// colour and look like the same person.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function monogram(handle) {
  const h = typeof handle === "string" ? handle.trim().toLowerCase() : "";
  if (!h) return { initials: "?", hue: 0 };

  const parts = h.split("_").filter(Boolean);
  const initials = parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "?";

  return { initials, hue: hash(h) % 360 };
}
