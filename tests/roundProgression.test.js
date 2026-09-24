import test from 'node:test';
import assert from 'node:assert';
import {
  resolveQualificationCutoff,
  selectQualifiedTeams,
  nextRoundNumberOf,
  getRoundStandings,
  qualifyRound,
  ROUND_STATUS,
  PROGRESSION_ERR,
  ProgressionError,
  progressionError,
} from '../server/roundProgressionService.js';
import {
  ALLOCATED_STATUS,
  ALLOCATION_SOURCES,
  ALLOCATION_PENDING_STATUS,
  AWAITING_MEMBERS_STATUS,
  MEMBERS_COMPLETE_STATUS,
  VERIFIED_STATUS,
  buildAutomaticAssignmentRows,
  canTransitionFromStatus,
  normalizeSource,
  selectRoomForTeam,
} from '../server/allocationService.js';

// Phase 8B — Round Qualification & Progression (pure unit tests). The
// transactional flow (round marking, advancement placement, audits) lives in
// `roundProgressionDb.test.js`; here we exercise the pure policy functions with
// no database.

function room(id, { capacity, dayNumber = 1, groupSequence = 1, roomNumber = 1, round = 1 } = {}) {
  return {
    id,
    capacity,
    day_number: dayNumber,
    dayNumber,
    group_sequence: groupSequence,
    groupSequence,
    room_number: roomNumber,
    roomNumber,
    round_number: round,
    roundNumber: round,
  };
}

// --- qualification cutoff ---
test('progression: cutoff resolves the wizard-authored teams_advancing, else 0', () => {
  assert.strictEqual(resolveQualificationCutoff(16), 16);
  assert.strictEqual(resolveQualificationCutoff('16'), 16);
  assert.strictEqual(resolveQualificationCutoff(24), 24);
  assert.strictEqual(resolveQualificationCutoff(null), 0);
  assert.strictEqual(resolveQualificationCutoff(undefined), 0);
  assert.strictEqual(resolveQualificationCutoff(0), 0);
  assert.strictEqual(resolveQualificationCutoff(-3), 0);
  assert.strictEqual(resolveQualificationCutoff(''), 0);
  assert.strictEqual(resolveQualificationCutoff('abc'), 0);
  assert.strictEqual(resolveQualificationCutoff(NaN), 0);
});

// --- qualified-teams selection ---
function standingsRow(teamId, rank, points = 10) {
  return { team_id: teamId, team_name: teamId, total_points: points, rank };
}

test('progression: no qualifiers for empty standings or cutoff 0', () => {
  assert.deepStrictEqual(selectQualifiedTeams([], 4), []);
  assert.deepStrictEqual(selectQualifiedTeams([standingsRow('A', 1)], 0), []);
  assert.deepStrictEqual(selectQualifiedTeams([standingsRow('A', 1)], -1), []);
});

test('progression: selects the top N strictly in rank order', () => {
  const standings = [standingsRow('B', 2), standingsRow('C', 3), standingsRow('A', 1)];
  const picked = selectQualifiedTeams(standings, 2);
  assert.deepStrictEqual(picked.map((t) => t.team_id), ['A', 'B']);
});

test('progression: cutoff larger than the results still returns everything ranked', () => {
  const standings = [standingsRow('A', 1), standingsRow('B', 2)];
  const picked = selectQualifiedTeams(standings, 10);
  assert.deepStrictEqual(picked.map((t) => t.team_id), ['A', 'B']);
});

test('progression: rows without a team_id are never advanceable', () => {
  const standings = [standingsRow('A', 1), { team_id: null, rank: 2 }, { rank: 3 }];
  const picked = selectQualifiedTeams(standings, 5);
  assert.deepStrictEqual(picked.map((t) => t.team_id), ['A']);
});

test('progression: selection preserves the deterministic rank values', () => {
  const picked = selectQualifiedTeams([standingsRow('X', 2, 5), standingsRow('Y', 1, 9)], 1);
  assert.strictEqual(picked.length, 1);
  assert.strictEqual(picked[0].team_id, 'Y');
  assert.strictEqual(picked[0].rank, 1);
});

// --- next-round resolution ---
test('progression: nextRoundNumberOf finds the smallest strictly-greater round', () => {
  assert.strictEqual(nextRoundNumberOf([{ round_number: 2 }, { round_number: 1 }], 1), 2);
  assert.strictEqual(nextRoundNumberOf([{ round_number: 3 }, { round_number: 1 }], 1), 3);
  assert.strictEqual(nextRoundNumberOf([{ round_number: 1 }, { round_number: 2 }, { round_number: 3 }], 2), 3);
  assert.strictEqual(nextRoundNumberOf([{ round_number: 1 }], 1), null);
  assert.strictEqual(nextRoundNumberOf([], 1), null);
  assert.strictEqual(nextRoundNumberOf([{ round_number: 1 }], 1), null);
  // number-strings and camelCase are tolerated; the current round itself is never returned.
  assert.strictEqual(nextRoundNumberOf([{ roundNumber: '2' }, { roundNumber: 1 }], 1), 2);
  assert.strictEqual(nextRoundNumberOf([{ round_number: 5 }], '3'), 5);
  assert.strictEqual(nextRoundNumberOf([{ round_number: 2 }], '2'), null);
});

// --- round-status constant contract ---
test('progression: rounds use the existing configured/live/completed status values', () => {
  assert.deepStrictEqual(ROUND_STATUS, { CONFIGURED: 'configured', LIVE: 'live', COMPLETED: 'completed' });
});

// --- error surface ---
test('progression: ProgressionError carries stable machine codes', () => {
  assert.ok(progressionError(PROGRESSION_ERR.NO_NEXT_ROUND, 'x') instanceof ProgressionError);
  const err = progressionError(PROGRESSION_ERR.ROUND_NO_RESULTS, 'no results');
  assert.strictEqual(err.code, PROGRESSION_ERR.ROUND_NO_RESULTS);
  assert.strictEqual(err.message, 'no results');
  assert.ok(err instanceof Error);
  for (const code of Object.values(PROGRESSION_ERR)) {
    const e = progressionError(code, 'm');
    assert.strictEqual(e.code, code);
  }
});

// --- allocation-service integration contract for advancement ---
test('progression: normalizeSource recognises the advancement source', () => {
  assert.strictEqual(normalizeSource(ALLOCATION_SOURCES.ADVANCEMENT), ALLOCATION_SOURCES.ADVANCEMENT);
  assert.strictEqual(normalizeSource('advancement'), ALLOCATION_SOURCES.ADVANCEMENT);
  assert.strictEqual(normalizeSource('organizer'), ALLOCATION_SOURCES.ORGANIZER);
  assert.strictEqual(normalizeSource('automatic'), ALLOCATION_SOURCES.AUTOMATIC);
  assert.strictEqual(normalizeSource(null), ALLOCATION_SOURCES.AUTOMATIC);
  assert.strictEqual(normalizeSource('manual'), ALLOCATION_SOURCES.AUTOMATIC);
});

test('progression: allocated teams are advanceable only via the advancement source', () => {
  assert.strictEqual(canTransitionFromStatus(ALLOCATED_STATUS, ALLOCATION_SOURCES.ADVANCEMENT), true);
  assert.strictEqual(canTransitionFromStatus(VERIFIED_STATUS, ALLOCATION_SOURCES.ADVANCEMENT), true);
  assert.strictEqual(canTransitionFromStatus(ALLOCATION_PENDING_STATUS, ALLOCATION_SOURCES.ADVANCEMENT), true);
  assert.strictEqual(canTransitionFromStatus(MEMBERS_COMPLETE_STATUS, ALLOCATION_SOURCES.ADVANCEMENT), false, 'incomplete cannot advance');
  assert.strictEqual(canTransitionFromStatus(AWAITING_MEMBERS_STATUS, ALLOCATION_SOURCES.ADVANCEMENT), false, 'unverified cannot advance');
  // Sanity: the automatic flow is unchanged (allocated stays non-transitionable).
  assert.strictEqual(canTransitionFromStatus(ALLOCATED_STATUS, ALLOCATION_SOURCES.AUTOMATIC), false);
});

test('progression: advancement placement targets only the given round', () => {
  // Round 1 room is whatever exists; advancement must look at Round 2 only.
  const rooms = [room('R1', { capacity: 4, round: 1 }), room('R2A', { capacity: 2, round: 2 }), room('R2B', { capacity: 2, round: 2 })];
  // Round 1 empty but ignored when targeting Round 2.
  assert.strictEqual(selectRoomForTeam(rooms, {}, 2).id, 'R2A');
  // Round 2 first room fills before the second.
  assert.strictEqual(selectRoomForTeam(rooms, { R2A: 2 }, 2).id, 'R2B');
  // Both Round 2 rooms full → no position, even though Round 1 has space.
  assert.strictEqual(selectRoomForTeam(rooms, { R2A: 2, R2B: 2 }, 2), null);
  // Default (initial placement) still targets Round 1 only.
  assert.strictEqual(selectRoomForTeam(rooms, {}).id, 'R1');
  assert.strictEqual(selectRoomForTeam(rooms, { R1: 4 }, 2).id, 'R2A');
  // Mixed round_number shapes are normalised the same way.
  assert.strictEqual(selectRoomForTeam([room('RX', { capacity: 1, round: 2 })], {}, 2).id, 'RX');
});

test('progression: assignment rows carry the advancement source verbatim', () => {
  const rows = buildAutomaticAssignmentRows({
    tournamentId: 'T1',
    teamId: 'TEAM1',
    room: { id: 'R2', group_id: 'G2', day_id: 'D2' },
    matchIds: ['M3', 'M4'],
    source: ALLOCATION_SOURCES.ADVANCEMENT,
  });
  assert.strictEqual(rows.length, 2);
  for (const row of rows) {
    assert.strictEqual(row.source, ALLOCATION_SOURCES.ADVANCEMENT);
    assert.strictEqual(row.room_id, 'R2');
    assert.strictEqual(row.group_id, 'G2');
    assert.strictEqual(row.day_id, 'D2');
  }
});

// Guards: qualifyRound/getRoundStandings need a live client; misuse must reject
// rather than silently no-op.
test('progression: qualifyRound guards a missing client and invalid round number', async () => {
  await assert.rejects(qualifyRound(null, { tournamentId: 'T', roundNumber: 1 }), (err) => {
    assert.ok(err instanceof ProgressionError);
    assert.strictEqual(err.code, PROGRESSION_ERR.ROUND_NOT_FOUND);
    return true;
  });
  const fakeClient = { query: async () => ({ rows: [] }) };
  await assert.rejects(qualifyRound(fakeClient, { tournamentId: 'T', roundNumber: '?' }), (err) => {
    assert.strictEqual(err.code, PROGRESSION_ERR.ROUND_NOT_FOUND);
    return true;
  });
});

test('progression: getRoundStandings tolerates a missing tournament as empty (query-only)', async () => {
  let capturedSql = '';
  const fakeClient = {
    query: async (sql) => {
      capturedSql = sql;
      return { rows: [{ team_id: 'T1', total_points: 5 }] };
    },
  };
  const standings = await getRoundStandings(fakeClient, 'TRN-X', 'RND-X');
  assert.match(capturedSql, /tm\.status = 'verified'/);
  assert.ok(Array.isArray(standings));
  assert.strictEqual(standings[0].team_id, 'T1');
  assert.strictEqual(standings[0].rank, 1);
});
