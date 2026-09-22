import { redirect } from "next/navigation";
import { supabaseServer, currentUser } from "../../lib/supabase.js";
import { safeNext } from "../../lib/next-path.mjs";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sign in | CrimeTimeSnacks",
  description: "Sign in to follow cases and keep them in one place.",
};

// Google, or a six-digit code to your email. No passwords: there is nothing to steal here
// and nothing for anyone to forget.
export default async function SignIn({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp?.next);
  const sent = sp?.sent === "1";
  const email = typeof sp?.email === "string" ? sp.email : "";
  const error = typeof sp?.error === "string" ? sp.error : "";

  if (await currentUser()) redirect(next);

  async function withGoogle() {
    "use server";
    const sb = await supabaseServer();
    const site = process.env.SITE_URL || "https://www.crimetimesnacks.com";
    const { data, error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${site}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error || !data?.url) redirect(`/signin?error=${encodeURIComponent("Google sign-in is unavailable right now.")}`);
    redirect(data.url);
  }

  async function sendCode(formData) {
    "use server";
    const address = String(formData.get("email") || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
      redirect(`/signin?error=${encodeURIComponent("That does not look like an email address.")}&next=${encodeURIComponent(next)}`);
    }
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    if (error) redirect(`/signin?error=${encodeURIComponent("We could not send that code. Try again in a minute.")}&next=${encodeURIComponent(next)}`);
    redirect(`/signin?sent=1&email=${encodeURIComponent(address)}&next=${encodeURIComponent(next)}`);
  }

  async function checkCode(formData) {
    "use server";
    const address = String(formData.get("email") || "").trim();
    const token = String(formData.get("code") || "").replace(/\D/g, "");
    const back = `/signin?sent=1&email=${encodeURIComponent(address)}&next=${encodeURIComponent(next)}`;
    // Supabase decides how long the code is, and the setting can be changed from a dashboard
    // without anyone touching this file. The first live test arrived with eight digits against
    // a form that demanded exactly six, so the range is deliberately the whole range Supabase
    // allows: a length nobody here chose must never be the thing that refuses a valid code.
    if (token.length < 6 || token.length > 10) redirect(`${back}&error=${encodeURIComponent("Enter the code from the email.")}`);
    const sb = await supabaseServer();
    const { error } = await sb.auth.verifyOtp({ email: address, token, type: "email" });
    if (error) redirect(`${back}&error=${encodeURIComponent("That code is wrong or has expired.")}`);
    redirect(`/auth/landing?next=${encodeURIComponent(next)}`);
  }

  return (
    <main>
      <h1 className="h1">Sign in</h1>
      <p className="lede">
        Follow a case and we will tell you when something happens in it. Your email is never
        shown to anyone.
      </p>

      {error ? <p className="error" role="alert">{error}</p> : null}

      {sent ? (
        <form action={checkCode} className="stack">
          <input type="hidden" name="email" value={email} />
          <p className="note">
            We sent a six-digit code to <strong>{email}</strong>. It is good for an hour.
          </p>
          <label className="label" htmlFor="code">Your code</label>
          <input
            id="code" name="code" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]*" maxLength={10} required autoFocus
            className="field code" placeholder="123456" aria-describedby="code-help"
          />
          <p id="code-help" className="note">Six digits, from the email that just arrived.</p>
          <button className="btn primary" type="submit">Sign in</button>
          <a className="quiet" href={`/signin?next=${encodeURIComponent(next)}`}>Use a different address</a>
        </form>
      ) : (
        <>
          <form action={withGoogle}>
            <button className="btn google" type="submit">
              <span className="g" aria-hidden="true">G</span>
              Continue with Google
            </button>
          </form>

          <div className="or"><span>or</span></div>

          <form action={sendCode} className="stack">
            <label className="label" htmlFor="email">Your email</label>
            <input
              id="email" name="email" type="email" inputMode="email" autoComplete="email"
              required className="field" placeholder="you@example.com" aria-describedby="email-help"
            />
            <p id="email-help" className="note">We send a six-digit code. No password to set or forget.</p>
            <button className="btn primary" type="submit">Email me a code</button>
          </form>
        </>
      )}

      <p className="fine">
        By signing in you agree to the <a href="/terms.html">terms</a> and the{" "}
        <a href="/privacy.html">privacy policy</a>.
      </p>
    </main>
  );
}
