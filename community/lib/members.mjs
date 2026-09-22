// Turning a Supabase Auth user into a cts_members row, and folding two rows into one.
//
// The rule that matters: an existing email follower must keep their member row, because
// cts_follows.member_id points at it. Create a second row for the same person and their
// saved cases silently disappear - they are still in the database, attached to an account
// nobody can now sign in to.
//
// Pure over an injected store so both paths can be tested without a database.

export async function linkMember(store, { authUserId, email }) {
  if (!authUserId) throw new Error("linkMember: authUserId is required");
  const address = String(email ?? "").trim();
  if (!address) throw new Error("linkMember: email is required");

  const byAuth = await store.findByAuthId(authUserId);
  if (byAuth) return { member: byAuth, created: false, linked: false };

  const byEmail = await store.findByEmail(address);
  if (byEmail) {
    // Two different auth users claiming one address is not something to resolve silently.
    if (byEmail.auth_user_id && byEmail.auth_user_id !== authUserId) {
      throw new Error(`linkMember: ${address} is already linked to another account`);
    }
    const member = await store.setAuthId(byEmail.id, authUserId);
    return { member: member || byEmail, created: false, linked: true };
  }

  const member = await store.insertMember({ auth_user_id: authUserId, email: address });
  return { member, created: true, linked: false };
}

// Fold mergeId into keepId. Follows are copied first and the row is deleted last, so a
// failure halfway leaves a duplicate account rather than a member with no saved cases.
// Safe to repeat: a row that is already gone is a no-op.
export async function mergeMembers(store, { keepId, mergeId }) {
  if (!keepId || !mergeId) throw new Error("mergeMembers: both ids are required");
  if (keepId === mergeId) return { moved: 0 };

  const [keep, merge] = await Promise.all([store.get(keepId), store.get(mergeId)]);
  if (!keep) throw new Error("mergeMembers: the account to keep does not exist");
  if (!merge) return { moved: 0 };

  const [keepFollows, mergeFollows] = await Promise.all([store.follows(keepId), store.follows(mergeId)]);
  const have = new Set(keepFollows);
  const moving = mergeFollows.filter((slug) => !have.has(slug));
  if (moving.length) await store.addFollows(keepId, moving);

  const patch = {};
  if (merge.newsletter && !keep.newsletter) patch.newsletter = true;
  if (merge.created_at && (!keep.created_at || merge.created_at < keep.created_at)) patch.created_at = merge.created_at;
  if (Object.keys(patch).length) await store.update(keepId, patch);

  await store.deleteMember(mergeId);
  return { moved: moving.length };
}
