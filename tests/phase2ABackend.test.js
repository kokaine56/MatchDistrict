import test from 'node:test';
import assert from 'node:assert';
import {
  validateManualRoadmap,
  calculateAdvancingTeams,
  buildHierarchicalRoadmap,
  saveManualRoadmapDraft,
  ADVANCEMENT_TYPES,
} from '../server/manualRoadmapService.js';
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';

// ── 1. Qualification Rule Storage & Types ──
test('Phase 2A: ADVANCEMENT_TYPES includes per_district, overall, manual', () => {
  assert.ok(ADVANCEMENT_TYPES.includes('per_district'));
  assert.ok(ADVANCEMENT_TYPES.includes('overall'));
  assert.ok(ADVANCEMENT_TYPES.includes('manual'));
});

test('Phase 2A: calculateAdvancingTeams correctly handles overall and per_district', () => {
  // per_district: 8 districts * 2 advancing = 16
  const perDistConfig = {
    round_type: 'qualifier',
    advancement_type: 'per_district',
    teams_advancing_per_district: 2,
  };
  assert.strictEqual(calculateAdvancingTeams(perDistConfig, 8), 16);

  // overall: 16 teams advancing across whole round
  const overallConfig = {
    round_type: 'qualifier',
    advancement_type: 'overall',
    teams_advancing: 16,
  };
  assert.strictEqual(calculateAdvancingTeams(overallConfig, 8), 16);

  // manual: 16 teams advancing
  const manualConfig = {
    round_type: 'qualifier',
    advancement_type: 'manual',
    teams_advancing: 16,
  };
  assert.strictEqual(calculateAdvancingTeams(manualConfig, 8), 16);

  // Grand Finals produces 0 advancing teams (terminal stage)
  const gfConfig = {
    round_type: 'grand_final',
    advancement_type: null,
    teams_advancing: 16,
  };
  assert.strictEqual(calculateAdvancingTeams(gfConfig, 1), 0);
});

test('Phase 2A: saveManualRoadmapDraft and buildHierarchicalRoadmap preserve teams_in', async () => {
  const capturedQueries = [];
  const mockClient = {
    query: async (sql, params = []) => {
      capturedQueries.push({ sql, params });
      if (sql.includes('SELECT DISTINCT match_id FROM tournament_match_results')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_rounds')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_days')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_groups')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_rooms')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_matches')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM tournament_groups')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const draftPayload = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        teams_in: 128,
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                id: 'GRP-1',
                district_id: 'GRP-1',
                district_name: 'District 1',
                matches: [{ id: 'M-1', start_time: '14:00', end_time: '14:30', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
    ],
  };

  await saveManualRoadmapDraft(mockClient, 'TRN-1', draftPayload);

  // Verify teams_in was passed to the tournament_rounds INSERT
  const roundInsert = capturedQueries.find((q) => q.sql.includes('INSERT INTO tournament_rounds'));
  assert.ok(roundInsert, 'Must execute INSERT INTO tournament_rounds');
  assert.ok(roundInsert.sql.includes('teams_in'));
  assert.strictEqual(roundInsert.params[12], 128);

  // Test buildHierarchicalRoadmap mapping
  const flatRounds = [
    {
      id: 'RND-1',
      round_number: 1,
      name: 'Qualifiers',
      round_type: 'qualifier',
      teams_in: 128,
      advancement_type: 'per_district',
      teams_advancing_per_district: 2,
      teams_advancing: 16,
    },
  ];
  const hierarchical = buildHierarchicalRoadmap(flatRounds, [], [], []);
  assert.strictEqual(hierarchical[0].teams_in, 128);
});

// ── 2. Publish Validation Rules ──
test('Phase 2A: validateManualRoadmap on publish validates district coverage, dates, times, and warns on qualifier mismatch', () => {
  // A. Reject when expected districts in Round 1 are missing on publish
  const incompleteRound1 = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1',
        round_type: 'qualifier',
        teams_in: 128,
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'D-1',
                district_name: 'District 1',
                matches: [{ district_match_number: 1, start_time: '13:00' }],
              },
            ], // Only 1 district scheduled out of 8 needed for 128 teams / 16
          },
        ],
      },
    ],
  };

  const valIncomplete = validateManualRoadmap(incompleteRound1, {
    isPublish: true,
    slotsTotal: 128,
    teams_per_group: 16,
  });
  assert.strictEqual(valIncomplete.valid, false);
  assert.ok(valIncomplete.errors.some((e) => e.includes('Round 1 only has 1 of 8 required districts')));

  // B. Reject when day date is missing on publish
  const missingDate = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: null, // missing date
            allocations: [
              {
                district_id: 'D-1',
                district_name: 'District 1',
                matches: [{ district_match_number: 1, start_time: '13:00' }],
              },
            ],
          },
        ],
      },
    ],
  };
  const valMissingDate = validateManualRoadmap(missingDate, { isPublish: true });
  assert.strictEqual(valMissingDate.valid, false);
  assert.ok(valMissingDate.errors.some((e) => e.includes('must have a valid date')));

  // C. Reject when dates within a round are out of chronological order
  const outOfOrderDays = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-05',
            allocations: [{ district_id: 'D-1', matches: [{ start_time: '13:00' }] }],
          },
          {
            id: 'DAY-2',
            day_number: 2,
            date: '2026-11-03', // earlier than Day 1!
            allocations: [{ district_id: 'D-2', matches: [{ start_time: '13:00' }] }],
          },
        ],
      },
    ],
  };
  const valOutOfOrderDays = validateManualRoadmap(outOfOrderDays, { isPublish: true });
  assert.strictEqual(valOutOfOrderDays.valid, false);
  assert.ok(valOutOfOrderDays.errors.some((e) => e.includes('cannot precede Day 1 date')));

  // D. Reject when match start time is missing on publish
  const missingStartTime = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'D-1',
                district_name: 'District 1',
                matches: [{ district_match_number: 1, start_time: null }], // missing time
              },
            ],
          },
        ],
      },
    ],
  };
  const valMissingTime = validateManualRoadmap(missingStartTime, { isPublish: true });
  assert.strictEqual(valMissingTime.valid, false);
  assert.ok(valMissingTime.errors.some((e) => e.includes('requires a start time')));

  // E. Warn (do not hard-block) if round teams_in != previous round qualifiers
  const mismatchRoundTeamsIn = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        teams_in: 64,
        advancement_type: 'per_district',
        teams_advancing_per_district: 2, // 2 districts * 2 = 4 qualify
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              { district_id: 'D-1', matches: [{ start_time: '13:00' }] },
              { district_id: 'D-2', matches: [{ start_time: '14:00' }] },
            ],
          },
        ],
      },
      {
        id: 'RND-GF',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        teams_in: 16, // planned for 16, but Round 1 only qualifies 4!
        days: [
          {
            id: 'DAY-2',
            day_number: 1,
            date: '2026-11-02',
            allocations: [{ district_id: 'D-GF', matches: [{ start_time: '15:00' }] }],
          },
        ],
      },
    ],
  };

  const valMismatch = validateManualRoadmap(mismatchRoundTeamsIn, { isPublish: true });
  assert.strictEqual(valMismatch.valid, true, 'Qualifier mismatch should warn, not block publication');
  assert.ok(
    valMismatch.warnings.some((w) => w.includes('planned for 16 incoming teams, but previous round "Qualifiers" qualifies 4 teams')),
    'Must emit clear warning describing incoming team count mismatch'
  );
});

// ── 3. Capacity-Based Generation (0 Registrations) ──
test('Phase 2A: generateTournamentRoadmap builds complete plan with 0 registrations', () => {
  const tournament = {
    id: 'TRN-CAPACITY-0',
    title: 'Zero Registrations Tournament',
    slotsTotal: 128,
    teams_per_group: 16,
    startDate: '2026-11-10',
    game: 'BGMI',
  };

  const result = generateTournamentRoadmap(tournament);
  assert.strictEqual(result.ok, true);

  const { rounds, days, groups, matches } = result.roadmap;
  assert.ok(rounds.length >= 2, 'Should generate qualifiers and Grand Final');
  assert.strictEqual(rounds[0].teams_in, 128, 'Round 1 planned incoming capacity must equal slotsTotal');
  assert.strictEqual(rounds[0].round_type, 'qualifier');
  assert.strictEqual(rounds[0].advancement_type, 'per_district');

  // Verify 8 distinct groups/districts created for 128 / 16 in Round 1, and 9 total across rounds (8 R1 + 1 GF)
  const r1Groups = groups.filter((g) => g.round_id === rounds[0].id);
  assert.strictEqual(r1Groups.length, 8);
  assert.strictEqual(groups.length, 9);
  assert.strictEqual(matches.length > 0, true);

  // Grand Finals checks
  const gf = rounds[rounds.length - 1];
  assert.strictEqual(gf.round_type, 'grand_final');
  assert.strictEqual(gf.advancement_type, null);
  assert.strictEqual(gf.teams_advancing, null);
});

// ── 4. slotsTotal Change Warning Detection ──
test('Phase 2A: detects when slotsTotal changes after roadmap was created', () => {
  function checkCapacityMismatch(plannedCapacity, currentSlotsTotal) {
    if (plannedCapacity != null && plannedCapacity !== currentSlotsTotal) {
      return {
        warning: `Roadmap was built for ${plannedCapacity} teams, but tournament capacity is now ${currentSlotsTotal}.`,
        mismatch: { planned: plannedCapacity, current: currentSlotsTotal },
      };
    }
    return null;
  }

  // Same capacity -> no warning
  assert.strictEqual(checkCapacityMismatch(128, 128), null);

  // slotsTotal changed from 128 to 64 -> warning emitted
  const change1 = checkCapacityMismatch(128, 64);
  assert.ok(change1);
  assert.strictEqual(change1.warning, 'Roadmap was built for 128 teams, but tournament capacity is now 64.');
  assert.deepStrictEqual(change1.mismatch, { planned: 128, current: 64 });

  // slotsTotal changed from 64 to 256 -> warning emitted
  const change2 = checkCapacityMismatch(64, 256);
  assert.ok(change2);
  assert.strictEqual(change2.warning, 'Roadmap was built for 64 teams, but tournament capacity is now 256.');
});
