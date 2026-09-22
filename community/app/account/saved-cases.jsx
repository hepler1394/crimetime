"use client";

import { useState } from "react";
import { post } from "./post.js";

// The cases a member follows, and the way out of each one.
//
// A removed case keeps its place in the list and turns into "Removed. Put it back." rather
// than vanishing. Two reasons, and the second is the one that matters: a list that closes
// up under the cursor moves the next row onto the pointer, so a second click lands on a
// case the person never meant to touch; and saved cases are the one thing on this page
// that took real effort to collect, so dropping one should not be a one-way door.
export default function SavedCases({ initial }) {
  const [cases, setCases] = useState(initial.map((c) => ({ ...c, following: true })));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function setFollowing(slug, following) {
    setBusy(slug);
    setError("");
    setCases((list) => list.map((c) => (c.slug === slug ? { ...c, following } : c)));
    const res = await post("/api/account/follow", { slug, following });
    setBusy("");
    if (res.error) {
      setCases((list) => list.map((c) => (c.slug === slug ? { ...c, following: !following } : c)));
      setError(res.error);
    }
  }

  const kept = cases.filter((c) => c.following).length;

  if (!cases.length) {
    return (
      <div className="empty">
        <p>You are not following any case yet.</p>
        <p className="note">
          Follow one from <a href="/cases.html">the case files</a> and anything that happens in
          it turns up in your Sunday email.
        </p>
      </div>
    );
  }

  return (
    <>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <ul className="cases">
        {cases.map((c) => (
          <li key={c.slug} className={c.following ? "" : "dropped"}>
            {c.following
              ? <a href={`/cases/${c.slug}.html`}>{c.title}</a>
              : <span>{c.title}</span>}
            <button
              type="button" className="drop" disabled={busy === c.slug}
              onClick={() => setFollowing(c.slug, !c.following)}
              aria-label={`${c.following ? "Stop following" : "Follow"} ${c.title}`}
            >
              {busy === c.slug ? "Saving" : c.following ? "Stop following" : "Removed. Put it back."}
            </button>
          </li>
        ))}
      </ul>
      {kept !== cases.length ? (
        <p className="note">Reload the page and the ones you removed will be gone from the list.</p>
      ) : null}
    </>
  );
}
