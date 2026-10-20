// tests/qualificationLogic.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  derivePlannedSelection,
  getPlannedCount,
  detectCutoffTies,
  computeSnakePlacement,
  reconcileManualPlacement,
  formatAdvancementError,
} from '../src/components/qualification/qualificationLogic.js';

test('derivePlannedSelection: per_district selects top N eligible teams per district, skipping disqualified', () => {
  const summary = {
    planned_rule: { advancement_type: 'per_district', teams_advancing_per_district: 2 },
    disqualified_team_ids: ['T-DQ'],
    districts: [
      {
        district_id: 'D1',
        teams: [
          { team_id: 'T1', total_points: 20 },
          { team_id: 'T-DQ', total_points: 18, is_disqualified: true },
          { team_id: 'T2', total_points: 15 },
          { team_id: 'T3', total_points: 10 },
        ],
      },
      {
        district_id: 'D2',
        teams: [
          { team_id: 'T4', total_points: 25 },
          { team_id: 'T5', total_points: 22 },
          { team_id: 'T6', total_points: 12 },
        ],
      },
    ],
  };

  const selected = derivePlannedSelection(summary, 'per_district');
  // D1: T1 and T2 (skipping T-DQ); D2: T4 and T5
  assert.deepEqual(selected, ['T1', 'T2', 'T4', 'T5']);
});

test('derivePlannedSelection: overall selects top N eligible teams, skipping disqualified', () => {
  const summary = {
    planned_rule: { advancement_type: 'overall', teams_advancing: 3 },
    disqualified_team_ids: ['T2'],
    standings: [
      { team_id: 'T1', total_points: 30 },
      { team_id: 'T2', total_points: 25, is_disqualified: true },
      { team_id: 'T3', total_points: 20 },
      { team_id: 'T4', total_points: 15 },
      { team_id: 'T5', total_points: 10 },
    ],
  };

  const selected = derivePlannedSelection(summary, 'overall');
  // Top 3 eligible: T1, T3, T4 (skipping T2)
  assert.deepEqual(selected, ['T1', 'T3', 'T4']);
});

test('getPlannedCount calculates expected count based on active mode', () => {
  const summary = {
    planned_rule: { advancement_type: 'per_district', teams_advancing_per_district: 3, teams_advancing: 8 },
    districts: [{ id: 'D1' }, { id: 'D2' }, { id: 'D3' }],
  };

  assert.equal(getPlannedCount(summary, 'per_district'), 9); // 3 districts * 3
  assert.equal(getPlannedCount(summary, 'overall'), 8);
});

test('detectCutoffTies: flags ties at the cutoff boundary', () => {
  const standings = [
    { team_id: 'T1', team_name: 'Team 1', total_points: 30 },
    { team_id: 'T2', team_name: 'Team 2', total_points: 20 },
    { team_id: 'T3', team_name: 'Team 3', total_points: 20 }, // Tied with T2 at cutoff 2
    { team_id: 'T4', team_name: 'Team 4', total_points: 10 },
  ];

  const tieCheck = detectCutoffTies(standings, 2);
  assert.equal(tieCheck.hasTie, true);
  assert.equal(tieCheck.cutoffScore, 20);
  assert.equal(tieCheck.tiedTeams.length, 2);
  assert.deepEqual(tieCheck.tiedTeams.map((t) => t.team_id), ['T2', 'T3']);
});

test('detectCutoffTies: reports no tie when boundary scores differ', () => {
  const standings = [
    { team_id: 'T1', total_points: 30 },
    { team_id: 'T2', total_points: 20 },
    { team_id: 'T3', total_points: 19 },
    { team_id: 'T4', total_points: 10 },
  ];

  const tieCheck = detectCutoffTies(standings, 2);
  assert.equal(tieCheck.hasTie, false);
  assert.equal(tieCheck.cutoffScore, 20);
  assert.equal(tieCheck.tiedTeams.length, 0);
});

test('computeSnakePlacement: orders teams descending by points and snake-seeds across target districts', () => {
  const targetDistricts = [
    { id: 'DIST-A', group_name: 'District A' },
    { id: 'DIST-B', group_name: 'District B' },
  ];

  const standings = [
    { team_id: 'T1', team_name: 'Team 1', total_points: 40 },
    { team_id: 'T2', team_name: 'Team 2', total_points: 30 },
    { team_id: 'T3', team_name: 'Team 3', total_points: 20 },
    { team_id: 'T4', team_name: 'Team 4', total_points: 10 },
  ];

  // Passing unordered IDs
  const selectedTeamIds = ['T3', 'T1', 'T4', 'T2'];
  const { placementMap, districtBuckets } = computeSnakePlacement(selectedTeamIds, standings, targetDistricts);

  // Sorted: T1 (40 pts) -> DIST-A, T2 (30 pts) -> DIST-B, T3 (20 pts) -> DIST-B (snake reverse), T4 (10 pts) -> DIST-A
  assert.equal(placementMap['T1'], 'DIST-A');
  assert.equal(placementMap['T2'], 'DIST-B');
  assert.equal(placementMap['T3'], 'DIST-B');
  assert.equal(placementMap['T4'], 'DIST-A');

  assert.equal(districtBuckets['DIST-A'].length, 2);
  assert.equal(districtBuckets['DIST-B'].length, 2);
});

test('reconcileManualPlacement: overlays manual overrides on snake placements', () => {
  const defaultMap = { T1: 'DIST-A', T2: 'DIST-B', T3: 'DIST-B', T4: 'DIST-A' };
  const overrides = { T3: 'DIST-A' }; // User manually moved T3 to DIST-A

  const reconciled = reconcileManualPlacement(defaultMap, overrides);
  assert.equal(reconciled['T1'], 'DIST-A');
  assert.equal(reconciled['T3'], 'DIST-A'); // overridden
  assert.equal(reconciled['T2'], 'DIST-B');
});

test('formatAdvancementError: converts server error codes into helpful user messages', () => {
  assert.match(formatAdvancementError('SOURCE_MATCHES_UNVERIFIED'), /lack verified results/i);
  assert.match(formatAdvancementError('TARGET_ROUND_HAS_RESULTS'), /target round already has recorded match results/i);
  assert.match(formatAdvancementError('TEAM_DISQUALIFIED'), /disqualified and cannot advance/i);
  assert.equal(formatAdvancementError('UNKNOWN_CODE', 'Custom error'), 'Custom error');
});

// Parity test: Client computeSnakePlacement vs Server computeDefaultSnakePlacement
test('Placement parity: client computeSnakePlacement and server computeDefaultSnakePlacement produce identical placements', async () => {
  const { computeDefaultSnakePlacement } = await import('../server/roundProgressionService.js');

  const testCases = [
    // Case 1: 4 teams into 2 districts
    {
      numTeams: 4,
      targetDistricts: [{ id: 'D1' }, { id: 'D2' }],
    },
    // Case 2: 16 teams into 4 districts
    {
      numTeams: 16,
      targetDistricts: [{ id: 'D1' }, { id: 'D2' }, { id: 'D3' }, { id: 'D4' }],
    },
    // Case 3: 7 teams (odd count) into 3 districts
    {
      numTeams: 7,
      targetDistricts: [{ id: 'D1' }, { id: 'D2' }, { id: 'D3' }],
    },
    // Case 4: 8 teams into 1 district
    {
      numTeams: 8,
      targetDistricts: [{ id: 'D1' }],
    },
    // Case 5: 32 teams into 8 districts
    {
      numTeams: 32,
      targetDistricts: Array.from({ length: 8 }, (_, i) => ({ id: `D${i + 1}` })),
    },
  ];

  for (const tc of testCases) {
    const standings = Array.from({ length: tc.numTeams }, (_, i) => ({
      team_id: `TEAM-${i + 1}`,
      total_points: (tc.numTeams - i) * 10,
    }));
    const selectedTeamIds = standings.map((t) => t.team_id);

    // Client placement map
    const clientResult = computeSnakePlacement(selectedTeamIds, standings, tc.targetDistricts);

    // Server placement map (takes sorted team IDs according to standings points desc)
    const pointsMap = new Map(standings.map((t) => [t.team_id, Number(t.total_points) || 0]));
    const sortedIds = [...selectedTeamIds].sort((a, b) => (pointsMap.get(b) || 0) - (pointsMap.get(a) || 0));
    const serverResult = computeDefaultSnakePlacement(sortedIds, tc.targetDistricts);

    assert.deepEqual(
      clientResult.placementMap,
      serverResult,
      `Client and server placement maps must match exactly for ${tc.numTeams} teams into ${tc.targetDistricts.length} districts`
    );
  }
});

