"use client";

// One way for this page's forms to talk to its routes, so every failure reads the same.
//
// A route that answers with { error } is answering the person, not the developer: that
// sentence goes straight under the control they pressed. Anything else - a proxy, a dropped
// connection, HTML from an error page - has no sentence worth showing, so it gets one.
export async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "That did not save. Check your connection and try again." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error || "That did not save. Try again." };
  return data;
}
