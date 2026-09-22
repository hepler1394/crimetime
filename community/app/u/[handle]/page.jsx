import { notFound } from "next/navigation";
import { restStore } from "../../../lib/store.js";
import { normalizeHandle, handleError } from "../../../lib/handle.mjs";
import { monogram } from "../../../lib/monogram.mjs";

export const dynamic = "force-dynamic";

// A member's page, not an entry in a search index. They picked a handle so other people
// here could see them, which is a different thing from agreeing to be findable by name
// from outside, and nobody was asked about the second one. Flip this the day somebody is.
const ROBOTS = { index: false, follow: false };

async function load(paramsPromise) {
  const { handle } = await paramsPromise;
  const wanted = normalizeHandle(Array.isArray(handle) ? handle[0] : handle);
  // A string that could never have been saved as a handle is a 404 without asking the
  // database, so the profile route is not a way to make the site run a query per request.
  if (handleError(wanted)) return null;
  const member = await restStore().byHandle(wanted);
  return member?.handle ? member : null;
}

export async function generateMetadata({ params }) {
  const member = await load(params);
  if (!member) return { title: "Not found | CrimeTimeSnacks", robots: ROBOTS };
  const name = member.display_name || `@${member.handle}`;
  return {
    title: `${name} | CrimeTimeSnacks`,
    description: member.bio || `${name} on CrimeTimeSnacks.`,
    robots: ROBOTS,
  };
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function Profile({ params }) {
  const member = await load(params);
  if (!member) notFound();

  const cases = member.show_follows ? await restStore().followedCases(member.id) : [];
  const { initials, hue } = monogram(member.handle);
  // Only an https image, and only one we put there. avatar_url is empty for everyone in
  // phase one; the guard is here so that whatever fills it later cannot be a javascript:
  // or data: URL arriving through a column.
  const photo = /^https:\/\//.test(member.avatar_url || "") ? member.avatar_url : "";

  return (
    <main>
      <header className="profile-head">
        {photo ? (
          <img className="avatar" src={photo} alt="" width={72} height={72} />
        ) : (
          <span
            className="avatar mono" aria-hidden="true"
            style={{ "--tile": `hsl(${hue} 46% 20%)`, "--ink": `hsl(${hue} 72% 76%)` }}
          >
            {initials}
          </span>
        )}
        <div>
          <h1 className="h1 name">{member.display_name || `@${member.handle}`}</h1>
          {member.display_name ? <p className="at">@{member.handle}</p> : null}
          <p className="note">Here since {MONTH.format(new Date(member.created_at))}</p>
        </div>
      </header>

      {member.bio ? <p className="profile-bio">{member.bio}</p> : null}

      {member.show_follows ? (
        <section className="section">
          <h2 className="section-head">Following</h2>
          {cases.length ? (
            <ul className="cases">
              {cases.map((c) => (
                <li key={c.slug}><a href={`/cases/${c.slug}.html`}>{c.title}</a></li>
              ))}
            </ul>
          ) : (
            <p className="note">No cases yet.</p>
          )}
        </section>
      ) : null}

      <p className="fine">
        <a href="/cases.html">The case files</a> &middot; <a href="/episodes.html">Episodes</a>
      </p>
    </main>
  );
}
