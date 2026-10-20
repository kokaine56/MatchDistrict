// tests/tieBreakRanking.test.js
// Tests for strict 4-level tie-break ranking rules:
// 1. Total WWCDs (1st place finishes), higher wins
// 2. Total placement points, higher wins
// 3. Total elimination (kill) points, higher wins
// 4. Best placement in the most recent match, higher wins (1st beats 2nd)
//
// Also tests:
// - True tie flagged at cutoff boundary
// - A team with no result in the last match
// - Per-district ranking using district-scoped most recent match
// - Equal results between getRoundStandings and getDetailedRoundStandings (qualify panel)
// - Client-server parity test

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortAndRank as serverSortAndRank,
  compareTeams as serverCompareTeams,
  TIE_BREAK_RULES_DESCRIPTION,
} from '../server/leaderboardService.js';
import {
  sortAndRank as clientSortAndRank,
  compareTeams as clientCompareTeams,
  detectCutoffTies,
  derivePlannedSelection,
} from '../src/components/qualification/qualificationLogic.js';
import {
  getRoundStandings,
  getDetailedRoundStandings,
} from '../server/roundProgressionService.js';

test('tie-break Level 1: total WWCDs (1st place finishes), higher wins', () => {
  const teams = [
    { team_id: 'TEAM_LOW_WWCD', team_name: 'Low WWCD', total_points: 35, wwcd_count: 0, total_placement_points: 20, total_kill_points: 15, last_match_placement: 1 },
    { team_id: 'TEAM_HIGH_WWCD', team_name: 'High WWCD', total_points: 35, wwcd_count: 2, total_placement_points: 15, total_kill_points: 20, last_match_placement: 3 },
  ];

  const ranked = serverSortAndRank(teams);
  assert.equal(ranked[0].team_id, 'TEAM_HIGH_WWCD', 'Team with 2 WWCDs must beat team with 0 WWCDs on equal total points');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].team_id, 'TEAM_LOW_WWCD');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[0].tie_broken, true, 'Row should be marked as requiring tie-break');
  assert.equal(ranked[1].tie_broken, true);
  assert.equal(ranked[0].is_true_tie, false, 'Level 1 tie-breaker resolved it, not a true tie');

  // Cutoff tie should NOT be flagged because Level 1 resolved it
  const tieCheck = detectCutoffTies(ranked, 1);
  assert.equal(tieCheck.hasTie, false, 'Cutoff tie must NOT be flagged when resolved by WWCD');
});

test('tie-break Level 2: total placement points, higher wins', () => {
  const teams = [
    { team_id: 'TEAM_LOW_PLACE', team_name: 'Low Placement', total_points: 40, wwcd_count: 1, total_placement_points: 15, total_kill_points: 25, last_match_placement: 1 },
    { team_id: 'TEAM_HIGH_PLACE', team_name: 'High Placement', total_points: 40, wwcd_count: 1, total_placement_points: 25, total_kill_points: 15, last_match_placement: 4 },
  ];

  const ranked = serverSortAndRank(teams);
  assert.equal(ranked[0].team_id, 'TEAM_HIGH_PLACE', 'Team with more placement points must beat team with fewer placement points');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].team_id, 'TEAM_LOW_PLACE');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[0].tie_broken, true);
  assert.equal(ranked[0].is_true_tie, false);

  const tieCheck = detectCutoffTies(ranked, 1);
  assert.equal(tieCheck.hasTie, false, 'Cutoff tie must NOT be flagged when resolved by placement points');
});

test('tie-break Level 3: total elimination (kill) points, higher wins', () => {
  const teams = [
    { team_id: 'TEAM_LOW_KILLS', team_name: 'Low Kills', total_points: 45, wwcd_count: 1, total_placement_points: 20, total_kill_points: 15, last_match_placement: 1 },
    { team_id: 'TEAM_HIGH_KILLS', team_name: 'High Kills', total_points: 45, wwcd_count: 1, total_placement_points: 20, total_kill_points: 25, last_match_placement: 4 },
  ];

  const ranked = serverSortAndRank(teams);
  assert.equal(ranked[0].team_id, 'TEAM_HIGH_KILLS', 'Team with more kill points must beat team with fewer kill points');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].team_id, 'TEAM_LOW_KILLS');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[0].tie_broken, true);
  assert.equal(ranked[0].is_true_tie, false);

  const tieCheck = detectCutoffTies(ranked, 1);
  assert.equal(tieCheck.hasTie, false, 'Cutoff tie must NOT be flagged when resolved by kill points');
});

test('tie-break Level 4: best placement in most recent match, higher wins (1st beats 2nd)', () => {
  const teams = [
    { team_id: 'TEAM_WORSE_RECENT', team_name: 'Worse Recent', total_points: 50, wwcd_count: 1, total_placement_points: 25, total_kill_points: 25, last_match_placement: 6 },
    { team_id: 'TEAM_BETTER_RECENT', team_name: 'Better Recent', total_points: 50, wwcd_count: 1, total_placement_points: 25, total_kill_points: 25, last_match_placement: 2 },
  ];

  const ranked = serverSortAndRank(teams);
  assert.equal(ranked[0].team_id, 'TEAM_BETTER_RECENT', 'Team placing 2nd in most recent match beats team placing 6th');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].team_id, 'TEAM_WORSE_RECENT');
  assert.equal(ranked[1].rank, 2);
  assert.equal(ranked[0].tie_broken, true);
  assert.equal(ranked[0].is_true_tie, false);

  const tieCheck = detectCutoffTies(ranked, 1);
  assert.equal(tieCheck.hasTie, false, 'Cutoff tie must NOT be flagged when resolved by most recent match placement');
});

test('tie-break Level 4: team with result beats team with no result in last match', () => {
  const teams = [
    { team_id: 'TEAM_NO_RESULT', team_name: 'No Result in Last Match', total_points: 50, wwcd_count: 1, total_placement_points: 25, total_kill_points: 25, last_match_placement: null },
    { team_id: 'TEAM_WITH_RESULT', team_name: 'Finished 12th in Last Match', total_points: 50, wwcd_count: 1, total_placement_points: 25, total_kill_points: 25, last_match_placement: 12 },
  ];

  const ranked = serverSortAndRank(teams);
  assert.equal(ranked[0].team_id, 'TEAM_WITH_RESULT', 'Team that played and placed 12th must beat team with no result in the last match');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[1].team_id, 'TEAM_NO_RESULT');
  assert.equal(ranked[1].rank, 2);

  const tieCheck = detectCutoffTies(ranked, 1);
  assert.equal(tieCheck.hasTie, false, 'Cutoff tie must NOT be flagged when a team played and the other had no result');
});

test('true tie flagged ONLY when ALL 4 criteria are equal', () => {
  const teams = [
    { team_id: 'TEAM_CLEAR_FIRST', team_name: 'Clear First', total_points: 60, wwcd_count: 2, total_placement_points: 30, total_kill_points: 30, last_match_placement: 1 },
    { team_id: 'TEAM_TIED_A', team_name: 'Tied A', total_points: 40, wwcd_count: 1, total_placement_points: 20, total_kill_points: 20, last_match_placement: 4 },
    { team_id: 'TEAM_TIED_B', team_name: 'Tied B', total_points: 40, wwcd_count: 1, total_placement_points: 20, total_kill_points: 20, last_match_placement: 4 },
    { team_id: 'TEAM_FOURTH', team_name: 'Fourth', total_points: 20, wwcd_count: 0, total_placement_points: 10, total_kill_points: 10, last_match_placement: 8 },
  ];

  const ranked = serverSortAndRank(teams);
  assert.equal(ranked[1].is_true_tie, true, 'Team Tied A must be marked as true tie');
  assert.equal(ranked[2].is_true_tie, true, 'Team Tied B must be marked as true tie');

  // Cutoff at 2 (1 spot remains between Tied A and Tied B)
  const cutoffCheck = detectCutoffTies(ranked, 2);
  assert.equal(cutoffCheck.hasTie, true, 'Cutoff tie MUST be flagged when all 4 criteria are equal across boundary');
  assert.equal(cutoffCheck.cutoffScore, 40);
  assert.equal(cutoffCheck.tiedTeams.length, 2);
  assert.deepEqual(cutoffCheck.tiedTeams.map((t) => t.team_id), ['TEAM_TIED_A', 'TEAM_TIED_B']);

  // derivePlannedSelection should not decide silently: only Clear First is pre-selected
  const summary = {
    planned_rule: { advancement_type: 'overall', teams_advancing: 2 },
    standings: ranked,
    disqualified_team_ids: [],
  };
  const selection = derivePlannedSelection(summary, 'overall');
  assert.deepEqual(selection, ['TEAM_CLEAR_FIRST'], 'Must require organizer to choose manually; cannot pick Tied A or B silently');
});

test('per-district ranking uses district-scoped most recent match', async () => {
  // Mock DB with 2 districts, each with 2 matches
  // District A played Match 1 & Match 2 (Match 2 is most recent for District A)
  // District B played Match 3 & Match 4 (Match 4 is most recent for District B)
  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('tournament_match_results tm')) {
        // District A: T1 and T2 tied on points (20), WWCD (1), place pts (10), kill pts (10)
        // In M2 (District A's last match): T1 placed 2nd, T2 placed 5th
        // District B: T3 and T4 tied on points (20), WWCD (1), place pts (10), kill pts (10)
        // In M4 (District B's last match): T3 placed 6th, T4 placed 1st
        return {
          rows: [
            // M1 (Dist A)
            { match_id: 'M1', team_id: 'T1', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 0, best_placement: 4 },
            { match_id: 'M1', team_id: 'T2', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 0, best_placement: 4 },
            // M2 (Dist A - Last match of Dist A)
            { match_id: 'M2', team_id: 'T1', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 1, best_placement: 2 },
            { match_id: 'M2', team_id: 'T2', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 1, best_placement: 5 },
            // M3 (Dist B)
            { match_id: 'M3', team_id: 'T3', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 0, best_placement: 3 },
            { match_id: 'M3', team_id: 'T4', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 0, best_placement: 3 },
            // M4 (Dist B - Last match of Dist B)
            { match_id: 'M4', team_id: 'T3', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 1, best_placement: 6 },
            { match_id: 'M4', team_id: 'T4', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 1, best_placement: 1 },
          ],
        };
      }
      if (sql.includes('tournament_match_assignments a')) {
        return {
          rows: [
            { tournament_team_id: 'T1', match_id: 'M1', group_id: 'DIST_A', team_name: 'Team 1', group_name: 'District A' },
            { tournament_team_id: 'T2', match_id: 'M1', group_id: 'DIST_A', team_name: 'Team 2', group_name: 'District A' },
            { tournament_team_id: 'T3', match_id: 'M3', group_id: 'DIST_B', team_name: 'Team 3', group_name: 'District B' },
            { tournament_team_id: 'T4', match_id: 'M3', group_id: 'DIST_B', team_name: 'Team 4', group_name: 'District B' },
          ],
        };
      }
      if (sql.includes('FROM tournament_matches m')) {
        return {
          rows: [
            { id: 'M1', match_number: 1, group_id: 'DIST_A', day_id: 'D1', day_number: 1, group_name: 'District A' },
            { id: 'M2', match_number: 2, group_id: 'DIST_A', day_id: 'D1', day_number: 1, group_name: 'District A' },
            { id: 'M3', match_number: 1, group_id: 'DIST_B', day_id: 'D2', day_number: 2, group_name: 'District B' },
            { id: 'M4', match_number: 2, group_id: 'DIST_B', day_id: 'D2', day_number: 2, group_name: 'District B' },
          ],
        };
      }
      if (sql.includes('round_number >')) {
        return { rows: [] };
      }
      if (sql.includes('tournament_rounds')) {
        return {
          rows: [{ id: 'R1', round_number: 1, name: 'Round 1', status: 'live', teams_advancing_per_district: 2 }],
        };
      }
      if (sql.includes('tournament_registrations r')) {
        return {
          rows: [
            { team_id: 'T1', registration_id: 'R1', team_name: 'Team 1', slot_number: 1, group_id: 'DIST_A', group_name: 'District A' },
            { team_id: 'T2', registration_id: 'R2', team_name: 'Team 2', slot_number: 2, group_id: 'DIST_A', group_name: 'District A' },
            { team_id: 'T3', registration_id: 'R3', team_name: 'Team 3', slot_number: 3, group_id: 'DIST_B', group_name: 'District B' },
            { team_id: 'T4', registration_id: 'R4', team_name: 'Team 4', slot_number: 4, group_id: 'DIST_B', group_name: 'District B' },
          ],
        };
      }
      if (sql.includes('tournament_registration_groups')) {
        return {
          rows: [
            { id: 'DIST_A', name: 'District A', group_index: 0, capacity: 16 },
            { id: 'DIST_B', name: 'District B', group_index: 1, capacity: 16 },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const detailed = await getDetailedRoundStandings(mockClient, 'TRN-1', 'R1');
  const distA = detailed.districts.find((d) => d.id === 'DIST_A');
  const distB = detailed.districts.find((d) => d.id === 'DIST_B');

  // District A: T1 (2nd in M2) beats T2 (5th in M2)
  assert.equal(distA.teams[0].team_id, 'T1');
  assert.equal(distA.teams[0].district_rank, 1);
  assert.equal(distA.teams[1].team_id, 'T2');
  assert.equal(distA.teams[1].district_rank, 2);

  // District B: T4 (1st in M4) beats T3 (6th in M4)
  assert.equal(distB.teams[0].team_id, 'T4');
  assert.equal(distB.teams[0].district_rank, 1);
  assert.equal(distB.teams[1].team_id, 'T3');
  assert.equal(distB.teams[1].district_rank, 2);
});

test('equal results between round standings and the qualify panel', async () => {
  const resultsData = [
    { team_id: 'T1', team_name: 'Alpha', total_kills: 8, total_kill_points: 8, total_placement_points: 15, total_points: 23, wwcd_count: 1, best_placement: 1 },
    { team_id: 'T2', team_name: 'Bravo', total_kills: 10, total_kill_points: 10, total_placement_points: 13, total_points: 23, wwcd_count: 1, best_placement: 3 },
    { team_id: 'T3', team_name: 'Charlie', total_kills: 4, total_kill_points: 4, total_placement_points: 6, total_points: 10, wwcd_count: 0, best_placement: 5 },
  ];

  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('tournament_matches m') && sql.includes('GROUP BY m.id, d.day_number')) {
        return { rows: [{ id: 'MATCH_LAST' }] };
      }
      if (sql.includes('tournament_matches m') && sql.includes('ORDER BY COALESCE(d.day_number')) {
        return {
          rows: [
            { id: 'MATCH_1', match_number: 1, day_id: 'D1', day_number: 1 },
            { id: 'MATCH_LAST', match_number: 2, day_id: 'D1', day_number: 1 },
          ],
        };
      }
      if (sql.includes('MIN(placement)::int AS placement') && sql.includes('WHERE match_id = $1')) {
        // T1 placed 1st in MATCH_LAST, T2 placed 3rd in MATCH_LAST, T3 placed 5th
        return {
          rows: [
            { team_id: 'T1', placement: 1 },
            { team_id: 'T2', placement: 3 },
            { team_id: 'T3', placement: 5 },
          ],
        };
      }
      if (sql.includes('FROM tournament_match_results tm') && sql.includes('GROUP BY tm.match_id')) {
        return {
          rows: [
            { match_id: 'MATCH_1', team_id: 'T1', total_kills: 4, total_kill_points: 4, total_placement_points: 5, total_points: 9, wwcd_count: 0, best_placement: 4 },
            { match_id: 'MATCH_1', team_id: 'T2', total_kills: 5, total_kill_points: 5, total_placement_points: 5, total_points: 10, wwcd_count: 0, best_placement: 4 },
            { match_id: 'MATCH_LAST', team_id: 'T1', total_kills: 4, total_kill_points: 4, total_placement_points: 10, total_points: 14, wwcd_count: 1, best_placement: 1 },
            { match_id: 'MATCH_LAST', team_id: 'T2', total_kills: 5, total_kill_points: 5, total_placement_points: 8, total_points: 13, wwcd_count: 1, best_placement: 3 },
            { match_id: 'MATCH_LAST', team_id: 'T3', total_kills: 4, total_kill_points: 4, total_placement_points: 6, total_points: 10, wwcd_count: 0, best_placement: 5 },
          ],
        };
      }
      if (sql.includes('FROM tournament_match_results tm') && sql.includes('GROUP BY tm.team_id')) {
        return { rows: resultsData };
      }
      if (sql.includes('tournament_rounds')) {
        return { rows: [{ id: 'R1', round_number: 1, name: 'Round 1', teams_advancing: 2 }] };
      }
      if (sql.includes('tournament_registrations')) {
        return {
          rows: [
            { team_id: 'T1', registration_id: 'R1', team_name: 'Alpha', slot_number: 1 },
            { team_id: 'T2', registration_id: 'R2', team_name: 'Bravo', slot_number: 2 },
            { team_id: 'T3', registration_id: 'R3', team_name: 'Charlie', slot_number: 3 },
          ],
        };
      }
      if (sql.includes('tournament_registration_groups')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const roundStandings = await getRoundStandings(mockClient, 'TRN-1', 'R1');
  const detailed = await getDetailedRoundStandings(mockClient, 'TRN-1', 'R1');

  assert.equal(roundStandings.length, 3);
  assert.equal(detailed.overallStandings.length, 3);

  // Both must have the identical team order: T1 (rank 1), T2 (rank 2), T3 (rank 3)
  assert.deepEqual(
    roundStandings.map((t) => ({ team_id: t.team_id, rank: t.rank, points: t.total_points })),
    detailed.overallStandings.map((t) => ({ team_id: t.team_id, rank: t.rank, points: t.total_points })),
    'getRoundStandings and qualify panel detailed round standings must yield identical ranks and order'
  );
});

test('client-server parity: sortAndRank and compareTeams produce identical outputs', () => {
  const testScenarios = [
    // Scenario 1: WWCD tiebreaker
    [
      { team_id: 'A', total_points: 20, wwcd_count: 0, total_placement_points: 10, total_kill_points: 10, last_match_placement: 1 },
      { team_id: 'B', total_points: 20, wwcd_count: 1, total_placement_points: 10, total_kill_points: 10, last_match_placement: 5 },
    ],
    // Scenario 2: Placement points tiebreaker
    [
      { team_id: 'A', total_points: 30, wwcd_count: 1, total_placement_points: 15, total_kill_points: 15, last_match_placement: 2 },
      { team_id: 'B', total_points: 30, wwcd_count: 1, total_placement_points: 20, total_kill_points: 10, last_match_placement: 4 },
    ],
    // Scenario 3: Kill points tiebreaker
    [
      { team_id: 'A', total_points: 35, wwcd_count: 1, total_placement_points: 15, total_kill_points: 20, last_match_placement: 3 },
      { team_id: 'B', total_points: 35, wwcd_count: 1, total_placement_points: 15, total_kill_points: 10, last_match_placement: 1 },
    ],
    // Scenario 4: Recent match placement tiebreaker
    [
      { team_id: 'A', total_points: 40, wwcd_count: 1, total_placement_points: 20, total_kill_points: 20, last_match_placement: 2 },
      { team_id: 'B', total_points: 40, wwcd_count: 1, total_placement_points: 20, total_kill_points: 20, last_match_placement: 7 },
    ],
    // Scenario 5: Missing recent match placement
    [
      { team_id: 'A', total_points: 40, wwcd_count: 1, total_placement_points: 20, total_kill_points: 20, last_match_placement: null },
      { team_id: 'B', total_points: 40, wwcd_count: 1, total_placement_points: 20, total_kill_points: 20, last_match_placement: 10 },
    ],
    // Scenario 6: True tie across all 4 criteria
    [
      { team_id: 'A', total_points: 50, wwcd_count: 2, total_placement_points: 25, total_kill_points: 25, last_match_placement: 3 },
      { team_id: 'B', total_points: 50, wwcd_count: 2, total_placement_points: 25, total_kill_points: 25, last_match_placement: 3 },
    ],
  ];

  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];

    // compareTeams parity
    const sCmp = serverCompareTeams(scenario[0], scenario[1]);
    const cCmp = clientCompareTeams(scenario[0], scenario[1]);
    assert.equal(
      Math.sign(sCmp),
      Math.sign(cCmp),
      `compareTeams parity failed on scenario ${i + 1}`
    );

    // sortAndRank parity
    const sRanked = serverSortAndRank(scenario);
    const cRanked = clientSortAndRank(scenario);

    assert.deepEqual(
      sRanked.map((t) => ({ id: t.team_id, rank: t.rank, tie_broken: t.tie_broken, is_true_tie: t.is_true_tie })),
      cRanked.map((t) => ({ id: t.team_id, rank: t.rank, tie_broken: t.tie_broken, is_true_tie: t.is_true_tie })),
      `sortAndRank parity failed on scenario ${i + 1}`
    );
  }
});
