// Who is signed in, as a member row rather than an auth user.
//
// Every page and route in this zone needs the same three things - the auth user, the
// cts_members row that carries their follows, and a store to write through - and needs
// them resolved the same way. Resolving through linkMember means a session that somehow
// reached a page without passing /auth/landing still lands on the right row instead of a
// crash: linkMember finds by auth id, falls back to the address, and only creates a row
// when neither exists.
import { currentUser } from "./supabase.js";
import { linkMember } from "./members.mjs";
import { restStore } from "./store.js";

export async function currentMember() {
  const user = await currentUser();
  if (!user) return null;
  const store = restStore();
  const { member } = await linkMember(store, { authUserId: user.id, email: user.email });
  return { user, member, store };
}
