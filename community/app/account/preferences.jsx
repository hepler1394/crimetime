"use client";

import { useState } from "react";
import { post } from "./post.js";

// The two switches. Each saves on the spot, because a switch with a Save button beside it
// is a checkbox pretending to be a switch, and people leave the page thinking it took.
export default function Preferences({ initial }) {
  const [values, setValues] = useState({
    newsletter: Boolean(initial.newsletter),
    show_follows: Boolean(initial.show_follows),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function toggle(name) {
    const next = !values[name];
    setBusy(name);
    setError("");
    setValues((v) => ({ ...v, [name]: next }));
    const res = await post("/api/account", { [name]: next });
    setBusy("");
    if (res.error) {
      setValues((v) => ({ ...v, [name]: !next }));
      setError(res.error);
    }
  }

  return (
    <>
      {error ? <p className="error" role="alert">{error}</p> : null}

      <Switch
        name="newsletter" on={values.newsletter} busy={busy === "newsletter"} onToggle={toggle}
        title="The Case File"
        detail="One email on Sundays: new episodes and posts, and anything that happened in the cases you follow."
      />
      <Switch
        name="show_follows" on={values.show_follows} busy={busy === "show_follows"} onToggle={toggle}
        title="Show my saved cases on my profile"
        detail="Off unless you turn it on. Which murder cases someone follows is not a thing to publish about them by default."
      />
    </>
  );
}

function Switch({ name, on, busy, onToggle, title, detail }) {
  return (
    <div className="switch-row">
      <div>
        <p className="switch-title">{title}</p>
        <p className="note">{detail}</p>
      </div>
      <button
        type="button" role="switch" aria-checked={on} aria-label={title} disabled={busy}
        className={`switch${on ? " on" : ""}`} onClick={() => onToggle(name)}
      >
        <span className="knob" aria-hidden="true" />
      </button>
    </div>
  );
}
