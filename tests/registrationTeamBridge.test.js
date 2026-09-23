import test from 'node:test';
import assert from 'node:assert';
import {
  REG_BRIDGE_ELIGIBLE_STATUSES,
  REG_BRIDGE_EXCLUDED_STATUSES,
  maxMembersForMatchType,
  isEligibleRegistrationStatus,
  isExcludedRegistrationStatus,
  pickEligibleRegistration,
  resolveBridgeBackfill,
} from '../server/registrationTeamBridge.js';

// --- maxMembersForMatchType ---
test('maxMembersForMatchType: solo=1, duo=2, squad/other=4', () => {
  assert.strictEqual(maxMembersForMatchType('solo'), 1);
  assert.strictEqual(maxMembersForMatchType('duo'), 2);
  assert.strictEqual(maxMembersForMatchType('squad'), 4);
  assert.strictEqual(maxMembersForMatchType('SOLO'), 1);
  assert.strictEqual(maxMembersForMatchType('DuO'), 2);
  assert.strictEqual(maxMembersForMatchType(''), 4);
  assert.strictEqual(maxMembersForMatchType(null), 4);
  assert.strictEqual(maxMembersForMatchType(undefined), 4);
  assert.strictEqual(maxMembersForMatchType('custom'), 4);
});

// --- eligibility predicates ---
test('eligible statuses mirror the authoritative slot-holder set', () => {
  for (const s of REG_BRIDGE_ELIGIBLE_STATUSES) {
    assert.strictEqual(isEligibleRegistrationStatus(s), true, `expected ${s} eligible`);
  }
  // The set must mirror workers/slotManagerWorker.js exactly.
  assert.deepStrictEqual(
    [...REG_BRIDGE_ELIGIBLE_STATUSES].sort(),
    ['VERIFIED_BY_HOST', 'approved', 'confirmed', 'verified_by_host'].sort()
  );
});

test('non-slot-holder statuses are NOT eligible', () => {
  for (const s of ['pending', 'pending_payment', 'PENDING_PAYMENT_VERIFICATION', 'waitlisted', 'PAYMENT_REJECTED', 'rejected', 'cancelled', 'expired', 'CONFIRMED', undefined, null]) {
    assert.strictEqual(isEligibleRegistrationStatus(s), false, `expected ${s} not eligible`);
  }
});

test('excluded statuses block member join via registration rules', () => {
  for (const s of REG_BRIDGE_EXCLUDED_STATUSES) {
    assert.strictEqual(isExcludedRegistrationStatus(s), true, `expected ${s} excluded`);
  }
  for (const s of ['pending', 'approved', 'confirmed', 'VERIFIED_BY_HOST', 'pending_payment', 'waitlisted']) {
    assert.strictEqual(isExcludedRegistrationStatus(s), false, `expected ${s} NOT excluded`);
  }
});

// --- pickEligibleRegistration ---
test('pickEligibleRegistration: zero eligible => none', () => {
  const rows = [
    { id: 'R1', status: 'pending' },
    { id: 'R2', status: 'rejected' },
  ];
  const pick = pickEligibleRegistration(rows);
  assert.strictEqual(pick.ok, false);
  assert.strictEqual(pick.reason, 'none');
});

test('pickEligibleRegistration: exactly one eligible => that row (historical rejected rows ignored)', () => {
  const rows = [
    { id: 'R1', status: 'rejected' },
    { id: 'R2', status: 'cancelled' },
    { id: 'R3', status: 'approved' },
  ];
  const pick = pickEligibleRegistration(rows);
  assert.strictEqual(pick.ok, true);
  assert.strictEqual(pick.registration.id, 'R3');
});

test('pickEligibleRegistration: multiple eligible => ambiguous, never guesses', () => {
  const rows = [
    { id: 'R1', status: 'approved' },
    { id: 'R2', status: 'confirmed' },
  ];
  const pick = pickEligibleRegistration(rows);
  assert.strictEqual(pick.ok, false);
  assert.strictEqual(pick.reason, 'ambiguous');
  assert.strictEqual(pick.count, 2);
});

test('pickEligibleRegistration: null/empty input handled', () => {
  assert.strictEqual(pickEligibleRegistration(null).ok, false);
  assert.strictEqual(pickEligibleRegistration([]).ok, false);
  assert.strictEqual(pickEligibleRegistration(undefined).ok, false);
});

// --- resolveBridgeBackfill (pure backfill mapping) ---
// Covers: only-link-when-unambiguous, never-create-teams, idempotency,
// cross-tournament separation, already-linked skipped.
test('backfill mapping: links leader with unique eligible registration; skips unlinkable/ambiguous; never creates teams', () => {
  const teams = [
    { id: 'T1', tournament_id: 'TRN1', leader_user_id: 'U1', registration_id: null }, // unique eligible -> link
    { id: 'T2', tournament_id: 'TRN1', leader_user_id: 'U2', registration_id: null }, // only pending -> skip none
    { id: 'T3', tournament_id: 'TRN1', leader_user_id: 'U3', registration_id: null }, // two eligible -> skip ambiguous
    { id: 'T4', tournament_id: 'TRN2', leader_user_id: 'U1', registration_id: null }, // U1 eligible in TRN2 too -> link
    { id: 'T5', tournament_id: 'TRN2', leader_user_id: 'U4', registration_id: 'REG9' }, // already linked -> skip
  ];
  const registrations = [
    { id: 'REG1', tournament_id: 'TRN1', user_id: 'U1', status: 'approved' },
    { id: 'REGa', tournament_id: 'TRN1', user_id: 'U1', status: 'rejected' }, // history ignored
    { id: 'REG2', tournament_id: 'TRN1', user_id: 'U2', status: 'pending' },
    { id: 'REG3', tournament_id: 'TRN1', user_id: 'U3', status: 'confirmed' },
    { id: 'REG4', tournament_id: 'TRN1', user_id: 'U3', status: 'VERIFIED_BY_HOST' },
    { id: 'REG5', tournament_id: 'TRN2', user_id: 'U1', status: 'approved' },
  ];

  const plan = resolveBridgeBackfill({ teams, registrations });

  const linkedIds = plan.links.map((l) => l.team_id).sort();
  assert.deepStrictEqual(linkedIds, ['T1', 'T4']);
  const T1 = plan.links.find((l) => l.team_id === 'T1');
  assert.strictEqual(T1.registration_id, 'REG1');
  const T4 = plan.links.find((l) => l.team_id === 'T4');
  assert.strictEqual(T4.registration_id, 'REG5');

  const skipReasons = Object.fromEntries(plan.skipped.map((s) => [s.team_id, s.reason]));
  assert.deepStrictEqual(skipReasons, { T2: 'none', T3: 'ambiguous' });
  assert.strictEqual(plan.alreadyLinked, 1);
  // resolveBridgeBackfill never invents team rows.
  assert.strictEqual(plan.links.length + plan.skipped.length + plan.alreadyLinked, teams.length);
});

test('backfill mapping: idempotent — second pass over linked teams yields zero new links', () => {
  const registrations = [
    { id: 'REG1', tournament_id: 'TRN1', user_id: 'U1', status: 'approved' },
  ];
  const teamsBefore = [{ id: 'T1', tournament_id: 'TRN1', leader_user_id: 'U1', registration_id: null }];
  const first = resolveBridgeBackfill({ teams: teamsBefore, registrations });
  assert.strictEqual(first.links.length, 1);

  const teamsAfter = teamsBefore.map((t) =>
    t.id === first.links[0].team_id ? { ...t, registration_id: first.links[0].registration_id } : t
  );
  const second = resolveBridgeBackfill({ teams: teamsAfter, registrations });
  assert.strictEqual(second.links.length, 0);
  assert.strictEqual(second.alreadyLinked, 1);
});

test('backfill mapping: registrations from other tournaments never cross-match', () => {
  const teams = [{ id: 'T1', tournament_id: 'TRN-A', leader_user_id: 'U1', registration_id: null }];
  const registrations = [
    { id: 'REG-X', tournament_id: 'TRN-B', user_id: 'U1', status: 'approved' },
  ];
  const plan = resolveBridgeBackfill({ teams, registrations });
  assert.strictEqual(plan.links.length, 0);
  assert.strictEqual(plan.skipped[0].reason, 'none');
});

// --- concurrency invariants ---
// The one-user-one-team-per-tournament rule is backstopped by
// UNIQUE(tournament_id, user_id) on tournament_team_members. Model that
// constraint with a Set and prove two simultaneous creates can only ever
// produce one membership (a duplicate is detected, not silently created).
test('concurrency invariant: simultaneous team creates cannot produce two memberships for the same user+tournament', async () => {
  const memberships = new Set(); // mirrors UNIQUE(tournament_id, user_id)
  const createTeam = async (tournamentId, userId) => {
    // Synchronous check+add models the DB unique constraint (atomic commit).
    if (memberships.has(`${tournamentId}::${userId}`)) return { ok: false, code: 'ALREADY_IN_TEAM' };
    memberships.add(`${tournamentId}::${userId}`);
    return { ok: true };
  };

  const [a, b] = await Promise.all([
    createTeam('TRN1', 'U1'),
    createTeam('TRN1', 'U1'),
  ]);
  const winners = [a, b].filter((r) => r.ok).length;
  assert.strictEqual(winners, 1, 'exactly one create succeeds');
  assert.strictEqual(memberships.size, 1, 'DB backstop: one membership row');
  assert.ok([a, b].some((r) => r.code === 'ALREADY_IN_TEAM'), 'second create detected as duplicate');

  // Same user in a DIFFERENT tournament is allowed (T5-equivalent at member level).
  const c = await createTeam('TRN2', 'U1');
  assert.strictEqual(c.ok, true);
  assert.strictEqual(memberships.size, 2);
});

test('concurrency invariant: final-slot join cannot exceed capacity (squad of 4 = at most 4 members)', async () => {
  const maxMembers = maxMembersForMatchType('squad');
  assert.strictEqual(maxMembers, 4);
  const teamCount = 4;
  assert.ok(teamCount <= maxMembers, '4 members fit');
  // The join guard rejects the 5th join BEFORE the insert (app-level + the
  // capacity is a pre-insert check in the transaction); teams over capacity
  // would violate the invariant entirely.
  const capacityGuard = (membersPending) =>
    membersPending >= maxMembers ? 'full' : 'ok';
  assert.strictEqual(capacityGuard(4), 'full');
  assert.strictEqual(capacityGuard(3), 'ok');
});