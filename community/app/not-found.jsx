export const metadata = {
  title: "Not found | CrimeTimeSnacks",
  robots: { index: false, follow: false },
};

// Most arrivals here are a handle that has been changed or an account that has been
// deleted, so it says that rather than blaming the person for typing it wrong.
export default function NotFound() {
  return (
    <main>
      <h1 className="h1">Not here</h1>
      <p className="lede">
        There is no page at this address. If you followed a link to someone&rsquo;s profile,
        they may have changed their handle or closed their account.
      </p>
      <p className="fine">
        <a href="/cases.html">The case files</a> &middot; <a href="/episodes.html">Episodes</a>
        {" "}&middot; <a href="/account">Your account</a>
      </p>
    </main>
  );
}
