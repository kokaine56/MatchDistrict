import test from 'node:test';
import assert from 'node:assert';
import { calculateMatchPoints, sortAndRank } from '../server/leaderboardService.js';
import {
  MatchResultError,
  matchResultError,
  MATCH_RESULT_ERR,
  MATCH_TERMINAL_STATUSES,
  DEFAULT_SCORING_RULES,
  randomId,
  mapPublicMatchResult,
  validateScoringRulesPayload,
  validateResultEntries,
  computeFinalPlacementCollision,
} from '../server/matchResultService.js';

// Scoring + results-integrity engine (Phase 8A). Pure tests — no database.
// DB-backed behaviour (upsert, audit, rollback, collisions) lives in
// tests/matchResultsDb.test.js.

const scoringRules = {
  kill_points_multiplier: 1,
  placement_points_map: {
    "1": 15,
    "2": 12,
    "3": 10,
    "4": 8,
    "5": 6
  },
  wwcd_bonus: 5
};

test('public match result mapping omits internal actor and persistence fields', () => {
  const mapped = mapPublicMatchResult({
    id: 'RESULT-1',
    tournament_id: 'TOURNAMENT-1',
    match_id: 'MATCH-1',
    team_id: 'TEAM-1',
    team_name: 'Blue Team',
    leader_name: 'Leader',
    placement: 1,
    kills: 4,
    kill_points: 4,
    placement_points: 15,
    wwcd: true,
    total_points: 19,
    status: 'verified',
    submitted_by: 'USER-SUBMITTER',
    verified_by: 'USER-VERIFIER',
    secret: 'must not escape',
  });
  assert.equal(mapped.team_name, 'Blue Team');
  assert.equal(mapped.total_points, 19);
  assert.equal('submitted_by' in mapped, false);
  assert.equal('verified_by' in mapped, false);
  assert.equal('tournament_id' in mapped, false);
  assert.equal('secret' in mapped, false);
});

test('scoring: calculates points correctly for WWCD', () => {
  const result = calculateMatchPoints(5, 1, scoringRules);

  // Kills = 5 * 1 = 5
  // Placement = 15
  // WWCD Bonus = 5
  // Total = 25

  assert.strictEqual(result.kill_points, 5);
  assert.strictEqual(result.placement_points, 15);
  assert.strictEqual(result.wwcd, true);
  assert.strictEqual(result.total_points, 25);
});

test('scoring: calculates points correctly for non-WWCD', () => {
  const result = calculateMatchPoints(3, 4, scoringRules);

  // Kills = 3 * 1 = 3
  // Placement = 8
  // WWCD Bonus = 0
  // Total = 11

  assert.strictEqual(result.kill_points, 3);
  assert.strictEqual(result.placement_points, 8);
  assert.strictEqual(result.wwcd, false);
  assert.strictEqual(result.total_points, 11);
});

test('scoring: ranks teams using deterministic tiebreakers', () => {
  const rows = [
    { team_id: 'C', total_points: 10, total_kills: 2, wwcd_count: 0, best_placement: 4 },
    { team_id: 'A', total_points: 10, total_kills: 5, wwcd_count: 0, best_placement: 3 }, // More kills, but 0 WWCD
    { team_id: 'B', total_points: 10, total_kills: 2, wwcd_count: 1, best_placement: 1 }, // WWCD wins over A and C
    { team_id: 'D', total_points: 20, total_kills: 10, wwcd_count: 1, best_placement: 1 } // Highest points
  ];

  const ranked = sortAndRank(rows);

  assert.strictEqual(ranked[0].team_id, 'D'); // 20 pts
  assert.strictEqual(ranked[1].team_id, 'B'); // 10 pts, 1 WWCD (WWCD beats 0 WWCD)
  assert.strictEqual(ranked[2].team_id, 'A'); // 10 pts, 0 WWCD, 5 kills (more kills beats 2 kills)
  assert.strictEqual(ranked[3].team_id, 'C'); // 10 pts, 0 WWCD, 2 kills
});

test('defaults: DEFAULT_SCORING_RULES mirrors the tournament_scoring_rules DDL defaults', () => {
  assert.strictEqual(DEFAULT_SCORING_RULES.kill_points_multiplier, 1);
  assert.strictEqual(DEFAULT_SCORING_RULES.wwcd_bonus, 0);
  // Verified against the CREATE TABLE placement map in server.js (Phase 10).
  assert.deepStrictEqual(DEFAULT_SCORING_RULES.placement_points_map, {
    '1': 15, '2': 12, '3': 10, '4': 8, '5': 6, '6': 4, '7': 2, '8': 1, '9': 1,
    '10': 1, '11': 1, '12': 1, '13': 0, '14': 0, '15': 0, '16': 0, '17': 0,
    '18': 0, '19': 0, '20': 0,
  });
});

test('error codes: MATCH_RESULT_ERR is frozen and exposes the expected machine codes', () => {
  assert.ok(Object.isFrozen(MATCH_RESULT_ERR));
  for (const code of [
    'FORBIDDEN', 'NOT_FOUND', 'INVALID_INPUT', 'ROADMAP_NOT_APPROVED',
    'MATCH_TOURNAMENT_MISMATCH', 'MATCH_CLOSED', 'TEAM_NOT_ALLOCATED',
    'DUPLICATE_TEAM', 'DUPLICATE_PLACEMENT', 'INVALID_PLACEMENT', 'INVALID_KILLS', 'LOCKED_RESULT',
  ]) {
    assert.strictEqual(MATCH_RESULT_ERR[code], code);
  }
  assert.deepStrictEqual([...MATCH_TERMINAL_STATUSES], ['COMPLETED', 'CANCELLED', 'VERIFIED']);
  assert.ok(Object.isFrozen(MATCH_TERMINAL_STATUSES));
});

test('error: matchResultError produces a typed MatchResultError with code + status', () => {
  const err = matchResultError(MATCH_RESULT_ERR.DUPLICATE_PLACEMENT, 'collision', 409);
  assert.ok(err instanceof MatchResultError);
  assert.ok(err instanceof Error);
  assert.strictEqual(err.name, 'MatchResultError');
  assert.strictEqual(err.code, MATCH_RESULT_ERR.DUPLICATE_PLACEMENT);
  assert.strictEqual(err.message, 'collision');
  assert.strictEqual(err.status, 409);

  const defaulted = matchResultError(MATCH_RESULT_ERR.INVALID_INPUT, 'bad');
  assert.strictEqual(defaulted.status, 400);
});

test('ids: randomId prefixes results and audit ids deterministically', () => {
  const res = randomId('RES-');
  const audit = randomId('LAUD-');
  assert.match(res, /^RES-[0-9A-F]{12}$/);
  assert.match(audit, /^LAUD-[0-9A-F]{12}$/);
  assert.notStrictEqual(res, randomId('RES-'));
});

test('validation: a well-formed batch passes validateResultEntries', () => {
  const results = [
    { team_id: 'T1', placement: 1, kills: 5 },
    { team_id: 'T2', placement: 2, kills: 3 },
    { team_id: 'T3', placement: 3, kills: 0 },
    { team_id: 'T4', placement: 4, kills: 2 },
  ];
  assert.deepStrictEqual(validateResultEntries(results, 4), []);
});

test('validation: non-array or empty submissions are INVALID_INPUT', () => {
  assert.strictEqual(validateResultEntries(null, 4)[0].code, MATCH_RESULT_ERR.INVALID_INPUT);
  assert.strictEqual(validateResultEntries([], 4)[0].code, MATCH_RESULT_ERR.INVALID_INPUT);
  assert.strictEqual(validateResultEntries('teams', 4)[0].code, MATCH_RESULT_ERR.INVALID_INPUT);
});

test('validation: a duplicated team_id is DUPLICATE_TEAM', () => {
  const errors = validateResultEntries([
    { team_id: 'T1', placement: 1, kills: 1 },
    { team_id: 'T1', placement: 2, kills: 1 },
  ], 4);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].code, MATCH_RESULT_ERR.DUPLICATE_TEAM);
});

test('validation: two teams sharing a placement in the batch is INVALID_PLACEMENT', () => {
  const errors = validateResultEntries([
    { team_id: 'T1', placement: 2, kills: 1 },
    { team_id: 'T2', placement: 2, kills: 1 },
  ], 4);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].code, MATCH_RESULT_ERR.INVALID_PLACEMENT);
  assert.match(errors[0].message, /more than once/);
});

test('validation: placements outside the allocated-team bound are INVALID_PLACEMENT', () => {
  const errors = validateResultEntries([{ team_id: 'T1', placement: 5, kills: 1 }], 4);
  assert.strictEqual(errors.length, 1);
  assert.strictEqual(errors[0].code, MATCH_RESULT_ERR.INVALID_PLACEMENT);
  assert.match(errors[0].message, /out of range \(1-4\)/);
});

test('validation: non-whole or negative kills are INVALID_KILLS', () => {
  for (const bad of ['abc', -1, 2.5, 1000001]) {
    const errors = validateResultEntries([{ team_id: 'T1', placement: 1, kills: bad }], 4);
    assert.strictEqual(errors.length, 1, `kills=${bad} must be rejected`);
    assert.strictEqual(errors[0].code, MATCH_RESULT_ERR.INVALID_KILLS);
  }
});

test('validation: a missing team_id or a non-object entry is INVALID_INPUT', () => {
  const missing = validateResultEntries([{ placement: 1, kills: 1 }], 4);
  assert.strictEqual(missing[0].code, MATCH_RESULT_ERR.INVALID_INPUT);
  const notObj = validateResultEntries([42], 4);
  assert.strictEqual(notObj[0].code, MATCH_RESULT_ERR.INVALID_INPUT);
});

test('collision: swapping two placements within one batch is legal', () => {
  const existing = new Map([['A', { placement: 1 }], ['B', { placement: 2 }]]);
  const submitted = new Map([['A', { placement: 2 }], ['B', { placement: 1 }]]);
  assert.strictEqual(computeFinalPlacementCollision(existing, submitted), null);
});

test('collision: a placement claimed by an un-updated team is DUPLICATE_PLACEMENT', () => {
  const existing = new Map([['A', { placement: 1 }], ['B', { placement: 2 }]]);
  const submitted = new Map([['C', { placement: 1 }]]); // C tries to take A's 1st place
  const err = computeFinalPlacementCollision(existing, submitted);
  assert.ok(err);
  assert.strictEqual(err.code, MATCH_RESULT_ERR.DUPLICATE_PLACEMENT);
  assert.match(err.message, /both team A and team C/);
});

test('collision: distinct free placements do not conflict', () => {
  const existing = new Map([['A', { placement: 1 }]]);
  const submitted = new Map([['B', { placement: 2 }]]);
  assert.strictEqual(computeFinalPlacementCollision(existing, submitted), null);
});

test('scoring rules: a complete valid rules payload passes', () => {
  const errors = validateScoringRulesPayload({
    kill_points_multiplier: 2,
    placement_points_map: { '1': 15, '2': 12 },
    wwcd_bonus: 5,
  });
  assert.deepStrictEqual(errors, []);
});

test('scoring rules: missing or invalid fields are INVALID_INPUT', () => {
  // Missing multiplier (undefined) — server must NOT wipe DB rules with defaults.
  const missing = validateScoringRulesPayload({ placement_points_map: { '1': 15 }, wwcd_bonus: 0 });
  assert.ok(missing.some((e) => e.code === MATCH_RESULT_ERR.INVALID_INPUT));

  const badMap = validateScoringRulesPayload({ kill_points_multiplier: 1, placement_points_map: 'map', wwcd_bonus: 0 });
  assert.ok(badMap.some((e) => e.code === MATCH_RESULT_ERR.INVALID_INPUT));

  const badPlacement = validateScoringRulesPayload({ kill_points_multiplier: 1, placement_points_map: { '0': 5 }, wwcd_bonus: 0 });
  assert.ok(badPlacement.some((e) => e.code === MATCH_RESULT_ERR.INVALID_INPUT));

  const negativeBonus = validateScoringRulesPayload({ kill_points_multiplier: 1, placement_points_map: { '1': 15 }, wwcd_bonus: -3 });
  assert.ok(negativeBonus.some((e) => e.code === MATCH_RESULT_ERR.INVALID_INPUT));
});
