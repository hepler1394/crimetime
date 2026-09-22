"use client";

import { useState } from "react";
import { post } from "./post.js";

// The door out.
//
// Behind a disclosure and behind a typed word, in that order. Not because deleting should
// be hard, but because it cannot be undone and a stray click on a page full of switches is
// a real way to lose an account. The wording says exactly what goes, so nobody finds out
// afterwards that their follows went with it.
export default function DeleteAccount({ followCount }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function destroy(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const res = await post("/api/account/delete", { confirm: typed });
    if (res.error) { setBusy(false); return setError(res.error); }
    window.location.assign("/");
  }

  if (!open) {
    return (
      <button type="button" className="quiet danger-link" onClick={() => setOpen(true)}>
        Delete my account
      </button>
    );
  }

  return (
    <form onSubmit={destroy} className="stack danger-box">
      {error ? <p className="error" role="alert">{error}</p> : null}
      <p>
        This removes your account, your handle and your profile
        {followCount === 0 ? "" : followCount === 1 ? ", and the case you follow" : `, and the ${followCount} cases you follow`}.
        {" "}It cannot be undone, and the handle goes back on the shelf for someone else to take.
      </p>
      <label className="label" htmlFor="confirm">Type delete to confirm</label>
      <input
        id="confirm" className="field" value={typed} onChange={(e) => setTyped(e.target.value)}
        autoComplete="off" autoFocus placeholder="delete"
      />
      <div className="row-end">
        <button type="button" className="quiet" onClick={() => { setOpen(false); setTyped(""); setError(""); }}>
          Keep my account
        </button>
        <button className="btn danger inline" type="submit" disabled={busy || typed.trim().toLowerCase() !== "delete"}>
          {busy ? "Deleting" : "Delete my account"}
        </button>
      </div>
    </form>
  );
}
