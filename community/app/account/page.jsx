import { redirect } from "next/navigation";
import { currentMember } from "../../lib/session.js";
import { maskEmail } from "../../lib/profile.mjs";
import ProfileForm from "./profile-form.jsx";
import SavedCases from "./saved-cases.jsx";
import Preferences from "./preferences.jsx";
import LinkEmail from "./link-email.jsx";
import DeleteAccount from "./delete-account.jsx";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your account | CrimeTimeSnacks",
  robots: { index: false, follow: false },
};

const PROVIDER_NAMES = { google: "Google", email: "A code to your email" };

// What just happened, said once, against numbers the server has only now re-read. The
// values come off the URL, so they are treated as text and a count, never as markup.
function linkedNotice(sp) {
  const email = typeof sp?.linked === "string" ? sp.linked.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  const moved = Number.parseInt(sp?.moved, 10);
  if (!Number.isInteger(moved) || moved < 1) return `${email} added. It was not following anything.`;
  return `${email} added, and ${moved} saved ${moved === 1 ? "case" : "cases"} came across with it.`;
}

export default async function Account({ searchParams }) {
  const sp = await searchParams;
  const notice = linkedNotice(sp);
  const session = await currentMember();
  if (!session) redirect(`/signin?next=${encodeURIComponent("/account")}`);

  const { member, user, store } = session;
  if (!member.handle) redirect(`/account/handle?next=${encodeURIComponent("/account")}`);

  const [cases, linked] = await Promise.all([
    store.followedCases(member.id),
    store.linkedEmails(member.id),
  ]);

  const providers = [...new Set((user.identities || []).map((i) => i.provider))];

  return (
    <main>
      <h1 className="h1">Your account</h1>
      <p className="lede">
        <a className="handle" href={`/u/${member.handle}`}>@{member.handle}</a>
        {" is your profile. "}
        <a href="/account/handle">Change it</a>.
      </p>

      <Section title="About you">
        <ProfileForm initial={{ display_name: member.display_name, bio: member.bio }} />
      </Section>

      {/* No count in the heading: a removed case keeps its place in the list until the page
          is reloaded, so a server-rendered number beside it would disagree with what is on
          screen the moment anyone drops one. */}
      <Section title="Saved cases">
        <SavedCases initial={cases} />
      </Section>

      <Section title="Email">
        <dl className="facts">
          <dt>This account</dt>
          <dd>{maskEmail(member.email) || "Not set"}</dd>
          <dt>Ways in</dt>
          <dd>{providers.map((p) => PROVIDER_NAMES[p] || p).join(", ") || "A code to your email"}</dd>
        </dl>
        <p className="note">
          Your address is never shown to anyone else, and never appears on your profile.
        </p>
        <hr className="hair" />
        {notice ? <p className="said block" role="status">{notice}</p> : null}
        <LinkEmail initial={linked} />
      </Section>

      <Section title="Settings">
        <Preferences initial={{ newsletter: member.newsletter, show_follows: member.show_follows }} />
      </Section>

      <Section title="Leaving">
        {/* A plain form, not a fetch: signing out is the one thing that has to work even if
            the JavaScript on this page never loads. */}
        <form action="/auth/signout" method="post">
          <button className="btn ghost inline" type="submit">Sign out</button>
        </form>
        <hr className="hair" />
        <DeleteAccount followCount={cases.length} />
      </Section>
    </main>
  );
}

function Section({ title, children }) {
  return (
    <section className="section">
      <h2 className="section-head">{title}</h2>
      {children}
    </section>
  );
}
