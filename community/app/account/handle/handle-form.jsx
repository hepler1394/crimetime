"use client";

// The rules live under the field and answer as you type, so nobody submits a handle to
// find out it was never going to be allowed. The same module runs here and in the route:
// this is the courtesy, /api/handle is the gate.
import { useState } from "react";
import { normalizeHandle, handleError } from "../../../lib/handle.mjs";

const RULES = [
  { text: "3 to 20 characters", met: (h) => h.length >= 3 && h.length <= 20 },
  { text: "letters, numbers and underscores", met: (h) => /^[a-z0-9_]*$/.test(h) && h.length > 0 },
  { text: "starts with a letter", met: (h) => /^[a-z]/.test(h) },
];

export default function HandleForm({ next, current, suggestion }) {
  const [value, setValue] = useState(current || suggestion || "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const handle = normalizeHandle(value);

  async function submit(event) {
    event.preventDefault();
    const bad = handleError(handle);
    if (bad) return setError(bad);

    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBusy(false);
        return setError(body.error || "That did not save. Try again.");
      }
      // A full load rather than a router push: the handle changes what the account page
      // and the header render, and none of that should come from a stale cache.
      window.location.assign(next);
    } catch {
      setBusy(false);
      setError("That did not save. Check your connection and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="stack" noValidate>
      {error ? <p className="error" role="alert">{error}</p> : null}

      <label className="label" htmlFor="handle">Your handle</label>
      <div className="handle-input">
        <span className="at" aria-hidden="true">@</span>
        <input
          id="handle"
          name="handle"
          className="field"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={20}
          required
          autoFocus
          aria-describedby="handle-rules"
        />
      </div>

      <p className={`preview${handle ? "" : " empty"}`}>
        crimetimesnacks.com/u/<b>{handle || "your_handle"}</b>
      </p>

      <ul className="rules" id="handle-rules">
        {RULES.map((rule) => (
          <li key={rule.text} className={rule.met(handle) ? "met" : ""}>{rule.text}</li>
        ))}
      </ul>

      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Saving" : current ? "Change my handle" : "That is my handle"}
      </button>
    </form>
  );
}
