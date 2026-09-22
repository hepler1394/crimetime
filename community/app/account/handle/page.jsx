import { redirect } from "next/navigation";
import { currentMember } from "../../../lib/session.js";
import { safeNext } from "../../../lib/next-path.mjs";
import { suggestHandle } from "../../../lib/handle.mjs";
import HandleForm from "./handle-form.jsx";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Choose a handle | CrimeTimeSnacks",
  robots: { index: false, follow: false },
};

// Where a first sign-in lands, and where the account page sends anyone changing their
// handle later. It is the only name a member has in public, so it gets its own screen
// rather than a field buried in a settings form.
export default async function ChooseHandle({ searchParams }) {
  const sp = await searchParams;
  const next = safeNext(sp?.next);

  const session = await currentMember();
  if (!session) redirect(`/signin?next=${encodeURIComponent("/account/handle")}`);

  const { member, user } = session;
  const shownName = user.user_metadata?.full_name || user.user_metadata?.name || "";
  const changing = Boolean(member.handle);

  return (
    <main>
      <h1 className="h1">{changing ? "Change your handle" : "Choose a handle"}</h1>
      <p className="lede">
        {changing
          ? "Your old handle stops working the moment this one saves, and anyone who linked to it will land on a page that is not there."
          : "This is the only name other people see. Your email is never shown, and neither is the name on your Google account unless you add it yourself."}
      </p>

      <HandleForm
        next={next}
        current={member.handle || ""}
        suggestion={changing ? "" : suggestHandle(shownName)}
      />

      <p className="fine">
        You can change it later from your <a href="/account">account</a>.
      </p>
    </main>
  );
}
