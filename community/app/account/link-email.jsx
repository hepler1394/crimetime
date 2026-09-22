"use client";

import { useState } from "react";
import { post } from "./post.js";

// Proving another address, and pulling whatever it was following onto this account.
//
// Two steps in one place: the address, then the code. The result line says how many cases
// came across, because that number is the entire reason a person is doing this and "Linked"
// on its own does not tell them whether it worked.
export default function LinkEmail({ initial }) {
  const [linked, setLinked] = useState(initial);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event) {
    event.preventDefault();
    setBusy(true); setError(""); setResult("");
    const res = await post("/api/account/email", { step: "start", email });
    setBusy(false);
    if (res.error) return setError(res.error);
    setSent(true);
  }

  async function check(event) {
    event.preventDefault();
    setBusy(true); setError("");
    const res = await post("/api/account/email", { step: "verify", email, code });
    if (res.error) { setBusy(false); return setError(res.error); }

    // A full load rather than patching state. The cases that just came across belong to a
    // list this component does not own, and a page that says "2 cases came across" above a
    // list still showing the old count is worse than a reload. The sentence survives it by
    // travelling in the URL, where the server renders it against the fresh numbers.
    const moved = res.moved ? `&moved=${res.moved}` : "";
    window.location.assign(`/account?linked=${encodeURIComponent(res.linked)}${moved}`);
  }

  async function remove(address) {
    setBusy(true); setError(""); setResult("");
    const res = await post("/api/account/email", { step: "remove", email: address });
    setBusy(false);
    if (res.error) return setError(res.error);
    setLinked(linked.filter((row) => row.email !== address));
  }

  return (
    <>
      {error ? <p className="error" role="alert">{error}</p> : null}

      {linked.length ? (
        <ul className="addresses">
          {linked.map((row) => (
            <li key={row.email}>
              <span>{row.email}</span>
              <button type="button" className="drop" onClick={() => remove(row.email)} disabled={busy}
                aria-label={`Remove ${row.email}`}>Remove</button>
            </li>
          ))}
        </ul>
      ) : null}

      {sent ? (
        <form onSubmit={check} className="stack">
          <p className="note">We sent a code to <strong>{email}</strong>.</p>
          <label className="label" htmlFor="link_code">Code</label>
          <input
            id="link_code" className="field code" value={code} inputMode="numeric" pattern="[0-9]*"
            maxLength={10} autoComplete="one-time-code" autoFocus
            onChange={(e) => setCode(e.target.value)} placeholder="123456"
          />
          <div className="row-end">
            <button type="button" className="quiet" onClick={() => { setSent(false); setCode(""); }}>
              Use a different address
            </button>
            <button className="btn primary inline" type="submit" disabled={busy}>
              {busy ? "Checking" : "Add this address"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={send} className="stack">
          <label className="label" htmlFor="link_email">Another address</label>
          <input
            id="link_email" className="field" type="email" value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)} placeholder="the one you followed cases with"
          />
          <p className="note">
            We send a code to prove it is yours. Anything that address was following moves onto
            this account.
          </p>
          <div className="row-end">
            <button className="btn ghost inline" type="submit" disabled={busy || !email}>
              {busy ? "Sending" : "Send a code"}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
