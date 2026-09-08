// Read account identity from the same isolated session used by Instagram tabs.
function createAccountReader({ session, known, saveKnown, saveAccount, now = Date.now }) {
  let cache = null;
  let cacheAt = 0;
  let pending = null;
  const persist = (value) => saveAccount({ ...value, at: new Date(now()).toISOString() });
  async function read() {
    let out = { signedIn: false, username: null, userId: null };
    try {
      const [cookie] = await session.cookies.get({ domain: '.instagram.com', name: 'ds_user_id' });
      if (cookie?.value) {
        out = { signedIn: true, username: null, userId: cookie.value };
        persist({ ...out, checking: true });
        try {
          const response = await session.fetch(`https://i.instagram.com/api/v1/users/${cookie.value}/info/`, {
            credentials: 'include', signal: AbortSignal.timeout(12000),
            headers: { 'x-ig-app-id': '936619743392459', 'User-Agent': session.getUserAgent() },
          });
          if (response.ok) out.username = (await response.json())?.user?.username || null;
          else { await response.body?.cancel(); out.error = `Instagram profile lookup returned ${response.status}`; }
        } catch { out.error = 'Instagram profile lookup is temporarily unavailable'; }
        const [current] = await session.cookies.get({ domain: '.instagram.com', name: 'ds_user_id' });
        if (current?.value !== cookie.value) {
          out = { signedIn: Boolean(current?.value), username: null, userId: current?.value || null, error: 'Instagram profile changed during lookup; check again' };
        } else if (out.username) {
          known[cookie.value] = out.username;
          saveKnown(known);
        } else if (known[cookie.value]) {
          out.username = known[cookie.value];
          out.fromCache = true;
        }
      }
    } catch { out.error = 'Could not read the Instagram session'; }
    persist(out);
    cache = out;
    cacheAt = now();
    return out;
  }
  return function account(force = false) {
    if (pending) return pending;
    if (!force && cache && now() - cacheAt < 30000) return Promise.resolve(cache);
    pending = read().finally(() => { pending = null; });
    return pending;
  };
}
module.exports = { createAccountReader };
