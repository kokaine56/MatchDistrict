import test from 'node:test';
import assert from 'node:assert/strict';
import { syncMissingProfiles } from './profileSync.js';

function createProfileFixture(users, profiles = []) {
  const state = { users: structuredClone(users), profiles: structuredClone(profiles) };
  const client = {
    async query(sql) {
      assert.match(sql, /ON CONFLICT DO NOTHING/);
      assert.match(sql, /existing\.email = candidates\.email AND existing\.id <> candidates\.uid/);
      const candidates = state.users.filter(user => user.uid && !user.uid.startsWith('ADM-'));
      const conflicts = candidates.filter(user => state.profiles.some(profile => profile.email === user.email && profile.id !== user.uid));
      let inserted = 0;

      for (const user of candidates) {
        const emailConflict = state.profiles.some(profile => profile.email === user.email && profile.id !== user.uid);
        const idConflict = state.profiles.some(profile => profile.id === user.uid);
        if (emailConflict || idConflict) continue;
        state.profiles.push({ id: user.uid, uid: user.uid, name: user.name, email: user.email, username: user.username });
        inserted += 1;
      }

      return { rows: [{ email_conflicts_skipped: conflicts.length, profiles_inserted: inserted }] };
    },
  };
  return { client, state };
}

test('inserts a missing user profile without changing the user identity', async () => {
  const fixture = createProfileFixture([{ uid: 'user-1', name: 'Player', email: 'player@example.test' }]);
  const result = await syncMissingProfiles(fixture.client);
  assert.deepEqual(result, { inserted: 1, conflicts: 0 });
  assert.equal(fixture.state.profiles[0].id, 'user-1');
});

test('leaves an existing profile unchanged and repeated initialization is idempotent', async () => {
  const existing = { id: 'user-1', uid: 'user-1', email: 'player@example.test', name: 'Existing', username: 'kept' };
  const fixture = createProfileFixture(
    [{ uid: 'user-1', name: 'New source name', email: 'player@example.test', username: 'new-name' }],
    [existing]
  );

  assert.deepEqual(await syncMissingProfiles(fixture.client), { inserted: 0, conflicts: 0 });
  assert.deepEqual(await syncMissingProfiles(fixture.client), { inserted: 0, conflicts: 0 });
  assert.deepEqual(fixture.state.profiles, [existing]);
});

test('skips an email owned by another profile ID without merging or changing either account', async () => {
  const existing = { id: 'profile-owner', uid: 'profile-owner', email: 'shared@example.test', name: 'Existing owner' };
  const fixture = createProfileFixture(
    [{ uid: 'different-user', name: 'Other user', email: 'shared@example.test' }],
    [existing]
  );

  assert.deepEqual(await syncMissingProfiles(fixture.client), { inserted: 0, conflicts: 1 });
  assert.deepEqual(fixture.state.profiles, [existing]);
});
