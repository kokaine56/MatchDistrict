import test from 'node:test';
import assert from 'node:assert';
import { generateTournamentRoadmap, calculateProgressionPlan } from '../server/roadmapGenerator.js';

// ---------------------------------------------------------------------------
// Dynamic district roadmap generation — acceptance tests.
// These assert the DISTRICT contract: ceil(slots / teamsPerDistrict) districts,
// one qualifier match per district, configurable daily capacity, and
// configurable advancement.
// ---------------------------------------------------------------------------

const ROUND1 = (roadmap) => {
  const r1 = roadmap.rounds.find((r) => r.round_number === 1);
  return {
    round: r1,
    matches: roadmap.matches.filter((m) => m.round_id === r1.id),
  };
};

const distinctDays = (matches) => new Set(matches.map((m) => m.day_id)).size;

// Test A: eight district qualifiers -----------------------------------------
test('TEST A: 128 slots / 16 per district => 8 districts, 16 teams each, 8 qualifier matches', () => {
  const res = generateTournamentRoadmap({ id: 'A', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10' });
  assert.strictEqual(res.ok, true, res.error);
  const rm = res.roadmap;
  const { round: r1Round, matches } = ROUND1(rm);
  const r1Groups = rm.groups.filter((g) => g.round_id === r1Round.id);

  assert.strictEqual(r1Groups.length, 8, 'exactly 8 districts in Round 1');
  assert.strictEqual(rm.meta.num_groups, 8);
  assert.deepStrictEqual(rm.meta.district_sizes, [16, 16, 16, 16, 16, 16, 16, 16]);

  assert.strictEqual(matches.length, 8, 'one qualifier match per district');
  assert.strictEqual(new Set(matches.map((m) => m.group_id)).size, 8, 'unique district per match');
  assert.strictEqual(new Set(matches.map((m) => m.id)).size, 8, 'unique match ids');
  assert.deepStrictEqual(r1Groups.map((g) => g.group_name), [
    'District 1', 'District 2', 'District 3', 'District 4',
    'District 5', 'District 6', 'District 7', 'District 8',
  ]);
});

// District count formula ----------------------------------------------------
test('district count scales with capacity: 64=>4, 128=>8, 256=>16', () => {
  for (const [slots, expected] of [[64, 4], [128, 8], [256, 16]]) {
    const res = generateTournamentRoadmap({ id: `D${slots}`, slotsTotal: slots, teams_per_group: 16 });
    assert.strictEqual(res.ok, true, res.error);
    const r1Groups = res.roadmap.groups.filter((g) => g.round_id === res.roadmap.rounds[0].id);
    assert.strictEqual(r1Groups.length, expected, `${slots} slots => ${expected} districts`);
  }
});

test('non-divisible capacity yields the smallest imbalance and keeps every team', () => {
  const res = generateTournamentRoadmap({ id: 'ND', slotsTotal: 100, teams_per_group: 16 });
  assert.strictEqual(res.ok, true, res.error);
  const sizes = res.roadmap.meta.district_sizes;
  assert.strictEqual(sizes.length, 7);
  assert.strictEqual(sizes.reduce((a, b) => a + b, 0), 100);
  assert.strictEqual(Math.max(...sizes) - Math.min(...sizes) <= 1, true);
});

// Test B/C/D: configurable matches per day ----------------------------------
test('TEST B: 2 matches/day => 4 qualifier days, every district exactly once', () => {
  const res = generateTournamentRoadmap({ id: 'B', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10', matches_per_day: 2 });
  const { round: r1Round, matches } = ROUND1(res.roadmap);
  const r1Groups = res.roadmap.groups.filter((g) => g.round_id === r1Round.id);
  assert.strictEqual(matches.length, 8);
  assert.strictEqual(distinctDays(matches), 4);
  assert.deepStrictEqual(r1Groups.map((g) => g.group_name).sort(), [
    'District 1', 'District 2', 'District 3', 'District 4',
    'District 5', 'District 6', 'District 7', 'District 8',
  ]);
});

test('TEST C: 3 matches/day => 3 qualifier days, no match omitted', () => {
  const res = generateTournamentRoadmap({ id: 'C', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10', matches_per_day: 3 });
  const { matches } = ROUND1(res.roadmap);
  assert.strictEqual(matches.length, 8);
  assert.strictEqual(distinctDays(matches), 3);
  const byDay = {};
  for (const m of matches) byDay[m.day_id] = (byDay[m.day_id] || 0) + 1;
  assert.deepStrictEqual(Object.values(byDay).sort(), [2, 3, 3]);
});

test('TEST D: 4 matches/day => 2 qualifier days', () => {
  const res = generateTournamentRoadmap({ id: 'D', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10', matches_per_day: 4 });
  const { matches } = ROUND1(res.roadmap);
  assert.strictEqual(matches.length, 8);
  assert.strictEqual(distinctDays(matches), 2);
});

test('without an explicit matches_per_day the legacy 2/day default is preserved', () => {
  const res = generateTournamentRoadmap({ id: 'DEF', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10' });
  assert.strictEqual(res.roadmap.meta.matches_per_day, null);
  const { matches } = ROUND1(res.roadmap);
  assert.strictEqual(distinctDays(matches), 4);
});

// Test E: skip semi-finals ---------------------------------------------------
test('TEST E: 8 districts x 2 qualifiers, no semi-finals => 16 teams straight to the Grand Final', () => {
  const res = generateTournamentRoadmap({
    id: 'E', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10',
    teams_advancing_per_district: 2, enable_semi_finals: false,
  });
  assert.strictEqual(res.ok, true, res.error);
  const rm = res.roadmap;
  const plan = calculateProgressionPlan(128, 16, 16, { teamsAdvancingPerDistrict: 2 });
  assert.strictEqual(plan.length, 1, 'only the district round before the final');
  assert.strictEqual(plan[0].totalTeamsAfter, 16);
  const gf = rm.rounds.find((r) => r.is_grand_final);
  assert.ok(gf, 'a Grand Final exists');
  assert.strictEqual(rm.rounds.filter((r) => !r.is_grand_final).length, 1, 'no semi-final round generated');
});

// Test F: enable semi-finals ------------------------------------------------
test('TEST F: 8 districts x 4 qualifiers => 32 into two semi-final matches of 16', () => {
  const plan = calculateProgressionPlan(128, 16, 16, { teamsAdvancingPerDistrict: 4 });
  assert.strictEqual(plan[0].totalTeamsAfter, 32);
  assert.strictEqual(plan.length, 2, 'district round + one semi-final round');
  assert.strictEqual(plan[1].matchCount, 2);
  assert.deepStrictEqual(plan[1].matchSizes, [16, 16]);
  // Each semi-final advances the configured 4 teams => 8 finalists.
  assert.deepStrictEqual(plan[1].qualifiersPerMatch, [4, 4]);
  assert.strictEqual(plan[1].totalTeamsAfter, 8);

  const res = generateTournamentRoadmap({
    id: 'F', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10',
    teams_advancing_per_district: 4, enable_semi_finals: true,
  });
  assert.strictEqual(res.ok, true, res.error);
  const semiMatches = res.roadmap.matches.filter((m) => m.round_id === res.roadmap.rounds[1].id);
  assert.strictEqual(semiMatches.length, 2);
  assert.strictEqual(new Set(semiMatches.map((m) => m.id)).size, 2, 'no duplicate semi-final ids');
});

// Test G: invalid final-stage capacity --------------------------------------
test('TEST G: 32 qualifiers with semi-finals disabled is blocked with an actionable error', () => {
  const res = generateTournamentRoadmap({
    id: 'G', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10',
    teams_advancing_per_district: 4, enable_semi_finals: false,
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /FINAL_STAGE_CAPACITY_MISMATCH/);
  assert.match(res.error, /32 teams/);
});

// Capacity validation --------------------------------------------------------
test('zero or invalid capacity is rejected safely', () => {
  for (const slots of [0, -5, 'abc']) {
    const res = generateTournamentRoadmap({ id: 'Z', slotsTotal: slots });
    assert.strictEqual(res.ok, false, `slots=${slots} should be rejected`);
    assert.ok(res.error, 'an error message is provided');
  }
});

test('an unset capacity falls back to the platform default (64)', () => {
  const res = generateTournamentRoadmap({ id: 'DEFSLOTS' });
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.meta.total_slots, 64);
  const r1Groups = res.roadmap.groups.filter((g) => g.round_id === res.roadmap.rounds[0].id);
  assert.strictEqual(r1Groups.length, 4);
});

test('planned (empty) districts remain visible when deriving from capacity', () => {
  // Capacity drives district count, never the number of registered teams.
  const res = generateTournamentRoadmap({ id: 'EMPTY', slotsTotal: 128, teams_per_group: 16 });
  const r1Groups = res.roadmap.groups.filter((g) => g.round_id === res.roadmap.rounds[0].id);
  assert.strictEqual(r1Groups.length, 8);
  assert.strictEqual(r1Groups.length, 8);
  assert.ok(res.roadmap.matches.every((m) => m.group_id), 'every match in every round belongs to a district');
});

// Deterministic + idempotent structure --------------------------------------
test('district ids and match ids are stable within a single generation and unique across it', () => {
  const res = generateTournamentRoadmap({ id: 'U', slotsTotal: 256, teams_per_group: 16, startDate: '2026-10-10' });
  const ids = res.roadmap.matches.map((m) => m.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'no duplicate match ids');
  const groupIds = res.roadmap.groups.map((g) => g.id);
  assert.strictEqual(new Set(groupIds).size, groupIds.length, 'no duplicate district ids');
});

test('progression links connect every qualification round to the next stage', () => {
  const res = generateTournamentRoadmap({ id: 'P', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10' });
  const rm = res.roadmap;
  // Every non-grand-final match must point somewhere (next match or next round).
  for (const m of rm.matches) {
    const round = rm.rounds.find((r) => r.id === m.round_id);
    if (round?.is_grand_final) continue;
    assert.ok(m.next_match_id || m.next_round_id, `match ${m.id} has no progression link`);
  }
});

test('schedule respects the configured first match time and gap', () => {
  const res = generateTournamentRoadmap({
    id: 'S', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10',
    matches_per_day: 4, first_match_time: '15:00', match_gap_minutes: 45, match_duration_minutes: 40,
  });
  const { matches } = ROUND1(res.roadmap);
  const sorted = [...matches].sort((a, b) => a.match_number - b.match_number);
  assert.strictEqual(sorted[0].start_time, '15:00');
  assert.strictEqual(sorted[0].end_time, '15:40');
  assert.strictEqual(sorted[1].start_time, '15:45');
});
