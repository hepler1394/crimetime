"use client";

import { useState } from "react";
import { LIMITS } from "../../lib/profile.mjs";
import { post } from "./post.js";

// A display name and a bio. Both optional, both public, and the counter turns when there
// is a reason to look at it rather than sitting there counting at you from zero.
export default function ProfileForm({ initial }) {
  const [displayName, setDisplayName] = useState(initial.display_name || "");
  const [bio, setBio] = useState(initial.bio || "");
  const [state, setState] = useState({ busy: false, error: "", saved: false });

  const dirty = displayName !== (initial.display_name || "") || bio !== (initial.bio || "");

  async function save(event) {
    event.preventDefault();
    setState({ busy: true, error: "", saved: false });
    const res = await post("/api/account", { display_name: displayName, bio });
    if (res.error) return setState({ busy: false, error: res.error, saved: false });
    initial.display_name = res.member.display_name;
    initial.bio = res.member.bio;
    setDisplayName(res.member.display_name);
    setBio(res.member.bio);
    setState({ busy: false, error: "", saved: true });
  }

  return (
    <form onSubmit={save} className="stack">
      {state.error ? <p className="error" role="alert">{state.error}</p> : null}

      <label className="label" htmlFor="display_name">Display name</label>
      <input
        id="display_name" className="field" value={displayName} maxLength={LIMITS.display_name}
        onChange={(e) => { setDisplayName(e.target.value); setState((s) => ({ ...s, saved: false })); }}
        autoComplete="off" placeholder="Optional"
      />
      <Counter value={displayName} limit={LIMITS.display_name} />

      <label className="label" htmlFor="bio" style={{ marginTop: "1.1rem" }}>Bio</label>
      <textarea
        id="bio" className="field" rows={3} value={bio} maxLength={LIMITS.bio}
        onChange={(e) => { setBio(e.target.value); setState((s) => ({ ...s, saved: false })); }}
        placeholder="Optional. A couple of lines about what you are here for."
      />
      <Counter value={bio} limit={LIMITS.bio} />

      <div className="row-end">
        {state.saved && !dirty ? <span className="said" role="status">Saved</span> : null}
        <button className="btn primary inline" type="submit" disabled={state.busy || !dirty}>
          {state.busy ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}

// Silent until the last quarter, loud in the last tenth. A counter that shouts from the
// first character trains people to ignore it by the time it matters.
function Counter({ value, limit }) {
  const left = limit - value.length;
  if (left > limit * 0.25) return null;
  return <p className={`note count${left <= limit * 0.1 ? " close" : ""}`}>{left} characters left</p>;
}
