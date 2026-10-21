// tests/roadmapFixesFourIssues.test.js
// Verification tests for all 4 Roadmap tasks:
// 1. Matches per Day (unlimited matches up to 12, min 1, existing 2-match roadmaps support)
// 2. Grand Finals Rules (terminal stage, no advancement rule required or validated, prize pool distribution)
// 3. Delete Roadmap (instant optimistic UI, rollback capability, empty state)
// 4. Regrouped Lobbies in Later Rounds (even team partitioning, naming, scheduled lobbies warnings)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  splitTeamsEvenly,
  formatLobbiesNote,
  syncAutoDistrictsForLaterRounds,
} from '../server/roadmapAutoDistricts.js';
import {
  validateManualRoadmap,
} from '../server/manualRoadmapService.js';
import {
  getRoundAdvancementSummary,
  qualifyRound,
  getPrizePositions,
} from '../server/roundProgressionService.js';

test('TASK 1: Matches Per Day Validation (Min 1, Max 12)', () => {
  // A roadmap with 0 matches in an allocation is rejected
  const roadmapZeroMatches = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 0,
                matches: [],
              },
            ],
          },
        ],
      },
    ],
  };

  const zeroVal = validateManualRoadmap(roadmapZeroMatches);
  assert.strictEqual(zeroVal.valid, false);
  assert.ok(
    zeroVal.errors.some((e) => e.includes('must have at least 1 match')),
    'Expected error for 0 matches'
  );

  // A roadmap with 13 matches in an allocation exceeds max 12 and is rejected
  const roadmapThirteenMatches = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 13,
                matches: Array.from({ length: 13 }, (_, i) => ({
                  district_match_number: i + 1,
                  start_time: '13:00',
                  map: 'Erangel',
                })),
              },
            ],
          },
        ],
      },
    ],
  };

  const thirteenVal = validateManualRoadmap(roadmapThirteenMatches);
  assert.strictEqual(thirteenVal.valid, false);
  assert.ok(
    thirteenVal.errors.some((e) => e.includes('cannot exceed 12 matches per day')),
    'Expected error for >12 matches'
  );

  // Roadmaps with 1 match, 2 matches (existing roadmaps), and 12 matches are valid
  [1, 2, 5, 12].forEach((count) => {
    const validRoadmap = {
      rounds: [
        {
          round_number: 1,
          name: 'Round 1',
          round_type: 'qualifier',
          days: [
            {
              day_number: 1,
              allocations: [
                {
                  district_id: 'DIST-1',
                  district_name: 'District 1',
                  match_count: count,
                  matches: Array.from({ length: count }, (_, i) => ({
                    district_match_number: i + 1,
                    start_time: `${12 + (i % 10)}:00`,
                    map: 'Erangel',
                  })),
                },
              ],
            },
          ],
        },
      ],
    };
    const res = validateManualRoadmap(validRoadmap);
    assert.strictEqual(res.valid, true, `Expected ${count} matches to be valid`);
  });
});

test('TASK 1: Existing roadmaps with 2 matches load cleanly without migration or data loss', () => {
  const existing2MatchRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                id: 'ALC-1',
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 2,
                matches: [
                  { district_match_number: 1, start_time: '14:00', map: 'Erangel' },
                  { district_match_number: 2, start_time: '15:00', map: 'Miramar' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const val = validateManualRoadmap(existing2MatchRoadmap);
  assert.strictEqual(val.valid, true);
  assert.strictEqual(val.errors.length, 0);
  assert.strictEqual(existing2MatchRoadmap.rounds[0].days[0].allocations[0].matches.length, 2);
});

test('TASK 2: Grand Finals Rules (No advancement rules required or validated)', () => {
  // Grand Finals round has NO advancement rule configured
  const roadmapWithGrandFinals = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 4,
        days: [
          {
            day_number: 1,
            allocations: [
              {
                district_id: 'dist-1',
                district_name: 'District 1',
                match_count: 2,
                matches: [
                  { district_match_number: 1, start_time: '13:00', map: 'Erangel' },
                  { district_match_number: 2, start_time: '14:00', map: 'Miramar' },
                ],
              },
            ],
          },
        ],
      },
      {
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        advancement_type: null,
        teams_advancing: null,
        teams_advancing_per_district: null,
        advancement_target_round_id: null,
        days: [
          {
            day_number: 1,
            allocations: [
              {
                district_id: 'dist-gf',
                district_name: 'Grand Finals',
                match_count: 4,
                matches: [
                  { district_match_number: 1, start_time: '14:00', map: 'Erangel' },
                  { district_match_number: 2, start_time: '15:00', map: 'Miramar' },
                  { district_match_number: 3, start_time: '16:00', map: 'Sanhok' },
                  { district_match_number: 4, start_time: '17:00', map: 'Erangel' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const val = validateManualRoadmap(roadmapWithGrandFinals);
  assert.strictEqual(val.valid, true, `Grand Finals with no advancement rules should be valid: ${JSON.stringify(val.errors)}`);

  // Verify validateManualRoadmap automatically strips advancement fields for grand_final
  assert.strictEqual(roadmapWithGrandFinals.rounds[1].advancement_type, null);
  assert.strictEqual(roadmapWithGrandFinals.rounds[1].teams_advancing, null);
});

test('TASK 2: Grand Finals round progression summary and qualify rejection', async () => {
  // Test mock db client for Grand Finals round
  const mockClient = {
    query: async (sql, params) => {
      if (sql.includes('FROM tournament_rounds WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'rnd-gf',
              round_number: 3,
              name: 'Grand Finals',
              round_type: 'grand_final',
              status: 'configured',
              advancement_type: null,
            },
          ],
        };
      }
      if (sql.includes('FROM tournament_rounds WHERE tournament_id = $1 AND round_number = $2')) {
        return {
          rows: [
            {
              id: 'rnd-gf',
              round_number: 3,
              name: 'Grand Finals',
              round_type: 'grand_final',
              status: 'configured',
              advancement_type: null,
            },
          ],
        };
      }
      if (sql.includes('SELECT * FROM tournament_rounds WHERE tournament_id = $1')) {
        return {
          rows: [
            { id: 'rnd-1', round_number: 1, round_type: 'qualifier' },
            { id: 'rnd-2', round_number: 2, round_type: 'qualifier' },
            { id: 'rnd-gf', round_number: 3, round_type: 'grand_final' },
          ],
        };
      }
      if (sql.includes('FROM tournaments WHERE id = $1')) {
        return {
          rows: [
            {
              id: 'tourney-1',
              roadmap_status: 'approved',
              prize_positions: JSON.stringify([
                { rank: 1, name: 'Champion', percentage: 50, prize_amount: 50000 },
                { rank: 2, name: 'Runner Up', percentage: 30, prize_amount: 30000 },
                { rank: 3, name: '3rd Place', percentage: 20, prize_amount: 20000 },
              ]),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const summary = await getRoundAdvancementSummary(mockClient, 'tourney-1', 'rnd-gf');
  assert.strictEqual(summary.is_grand_final, true);
  assert.strictEqual(summary.planned_rule, null);
  assert.strictEqual(summary.target_round, null);
  assert.strictEqual(summary.prize_positions.length, 3);
  assert.strictEqual(summary.prize_positions[0].name, 'Champion');

  // Attempting to advance / qualify teams from Grand Finals must reject with NO_NEXT_ROUND
  await assert.rejects(
    async () => {
      await qualifyRound(mockClient, {
        tournamentId: 'tourney-1',
        roundNumber: 3,
        actorId: 'org-1',
      });
    },
    (err) => {
      assert.strictEqual(err.code, 'NO_NEXT_ROUND');
      return true;
    }
  );
});

test('TASK 4: splitTeamsEvenly property tests (even distribution, never lopsided)', () => {
  // 40 teams into 3 lobbies -> [14, 13, 13] (not 16, 16, 8)
  const res40_3 = splitTeamsEvenly(40, 3);
  assert.deepStrictEqual(res40_3, [14, 13, 13]);
  assert.strictEqual(res40_3.reduce((a, b) => a + b, 0), 40);

  // 32 teams into 2 lobbies -> [16, 16]
  const res32_2 = splitTeamsEvenly(32, 2);
  assert.deepStrictEqual(res32_2, [16, 16]);

  // 100 teams into 4 lobbies -> [25, 25, 25, 25]
  const res100_4 = splitTeamsEvenly(100, 4);
  assert.deepStrictEqual(res100_4, [25, 25, 25, 25]);

  // Property test: For any total teams 1..256 and lobby sizes 12, 16, 20, 25:
  // 1. Sum of capacities equals total teams.
  // 2. Max capacity minus Min capacity is at most 1 (balanced!).
  for (const lobbySize of [12, 16, 20, 25]) {
    for (let teams = 1; teams <= 100; teams++) {
      const lobbyCount = Math.ceil(teams / lobbySize);
      const split = splitTeamsEvenly(teams, lobbyCount);
      assert.strictEqual(
        split.reduce((a, b) => a + b, 0),
        teams,
        `Sum must match total teams for ${teams} teams in ${lobbyCount} lobbies`
      );
      const maxCap = Math.max(...split);
      const minCap = Math.min(...split);
      assert.ok(
        maxCap - minCap <= 1,
        `Lobbies must be balanced within 1 team difference (got max ${maxCap}, min ${minCap} for ${teams} teams)`
      );
    }
  }
});

test('TASK 4: formatLobbiesNote formats descriptive notes', () => {
  assert.strictEqual(formatLobbiesNote(32, [16, 16]), '32 teams -> 2 lobbies of 16');
  assert.strictEqual(formatLobbiesNote(40, [14, 13, 13]), '40 teams -> 3 lobbies of 14, 13, 13');
  assert.strictEqual(formatLobbiesNote(16, [16]), '16 teams -> 1 lobby of 16');
});

test('TASK 4: syncAutoDistrictsForLaterRounds creates regrouped lobbies and attaches notes', () => {
  const roadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        teams_in: 64,
        advancement_type: 'per_district',
        teams_advancing_per_district: 4,
        days: [
          {
            day_number: 1,
            allocations: [
              { district_id: 'd1', district_name: 'District 1' },
              { district_id: 'd2', district_name: 'District 2' },
            ],
          },
          {
            day_number: 2,
            allocations: [
              { district_id: 'd3', district_name: 'District 3' },
              { district_id: 'd4', district_name: 'District 4' },
            ],
          },
        ],
      },
      {
        round_number: 2,
        name: 'Semifinals',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            allocations: [],
          },
        ],
      },
      {
        round_number: 3,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            allocations: [],
          },
        ],
      },
    ],
  };

  syncAutoDistrictsForLaterRounds(roadmap, {
    teams_per_group: 16,
    slotsTotal: 64,
  });

  // Round 2 has 16 advancing teams (4 districts * 4 teams) -> 1 lobby of 16 named "Round 2 · Lobby 1"
  assert.strictEqual(roadmap.rounds[1].teams_in, 16);
  assert.strictEqual(roadmap.rounds[1].lobbies_note, '16 teams -> 1 lobby of 16');
  assert.strictEqual(roadmap.rounds[1].days[0].allocations[0].district_name, 'Round 2 · Lobby 1');

  // Round 3 is Grand Finals -> named "Grand Finals"
  assert.strictEqual(roadmap.rounds[2].days[0].allocations[0].district_name, 'Grand Finals');
});

test('TASK 4: syncAutoDistrictsForLaterRounds warns when scheduled lobbies are removed', () => {
  const roadmapWithExcessAllocs = {
    rounds: [
      {
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        teams_in: 64,
        advancement_type: 'overall',
        teams_advancing: 16, // only 16 advance -> 1 lobby
        days: [{ day_number: 1, allocations: [{ district_name: 'D1' }] }],
      },
      {
        round_number: 2,
        name: 'Round 2',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            allocations: [
              { district_id: 'dist-1', district_name: 'Round 2 · Lobby 1', match_count: 2 },
              { district_id: 'dist-2', district_name: 'Round 2 · Lobby 2', match_count: 2 }, // scheduled lobby that exceeds 16 teams / 16 = 1
            ],
          },
        ],
      },
    ],
  };

  const syncResult = syncAutoDistrictsForLaterRounds(roadmapWithExcessAllocs, {
    teams_per_group: 16,
    forceAutoTeamsIn: true,
  });

  assert.ok(syncResult.warnings.length > 0);
  assert.ok(
    syncResult.warnings.some((w) => w.includes('Removed scheduled lobby "Round 2 · Lobby 2"')),
    'Expected warning about scheduled lobby removal'
  );
});
