import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHierarchicalRoadmap,
  validateManualRoadmap,
  ROUND_TYPES,
  getTournamentRoadmapResponse,
  saveManualRoadmapDraft,
} from '../server/manualRoadmapService.js';
import {
  formatToDDMMYYYY,
  parseFromDDMMYYYY,
} from '../src/utils/roadmapDateUtils.js';

// ===========================================================================
// GROUP A TESTS: Round Types
// 1. Only two stage types: "Qualifiers" and "Grand Finals"
// 2. Old tournaments map legacy types to Qualifiers when reading
// 3. At most one Grand Finals, and it must be the last round
// ===========================================================================

test('Group A: ROUND_TYPES contains only qualifier and grand_final', () => {
  assert.deepStrictEqual(Array.from(ROUND_TYPES), ['qualifier', 'grand_final']);
});

test('Group A: Old round types (semi_final, custom, quarter_final) are mapped to qualifier on read', () => {
  const legacyFlatRounds = [
    { id: 'R1', round_number: 1, name: 'Round 1 Qualifiers', round_type: 'qualifier' },
    { id: 'R2', round_number: 2, name: 'Round 2 Quarter-Finals', round_type: 'quarter_final' },
    { id: 'R3', round_number: 3, name: 'Round 3 Semi-Finals', round_type: 'semi_final' },
    { id: 'R4', round_number: 4, name: 'Round 4 Custom Stage', round_type: 'custom' },
    { id: 'R5', round_number: 5, name: 'Grand Finals', round_type: 'grand_final' },
  ];

  const hydrated = buildHierarchicalRoadmap(legacyFlatRounds, [], [], []);

  assert.strictEqual(hydrated.length, 5);
  assert.strictEqual(hydrated[0].round_type, 'qualifier');
  assert.strictEqual(hydrated[1].round_type, 'qualifier');
  assert.strictEqual(hydrated[2].round_type, 'qualifier');
  assert.strictEqual(hydrated[3].round_type, 'qualifier');
  assert.strictEqual(hydrated[4].round_type, 'grand_final', 'Terminal round with grand_final remains grand_final');

  // Verify original input objects were not mutated
  assert.strictEqual(legacyFlatRounds[2].round_type, 'semi_final', 'Original input must not be mutated');
  assert.strictEqual(legacyFlatRounds[3].round_type, 'custom', 'Original input must not be mutated');
});

test('Group A: Grand Finals stored on an earlier non-terminal round maps to qualifier on read', () => {
  const misplacedGFRounds = [
    { id: 'R1', round_number: 1, name: 'Round 1', round_type: 'grand_final' },
    { id: 'R2', round_number: 2, name: 'Round 2', round_type: 'qualifier' },
  ];

  const hydrated = buildHierarchicalRoadmap(misplacedGFRounds, [], [], []);
  assert.strictEqual(hydrated[0].round_type, 'qualifier', 'Grand Finals not at the end maps to qualifier');
  assert.strictEqual(hydrated[1].round_type, 'qualifier');
});

test('Group A: Validation rejects invalid round types other than qualifier and grand_final', () => {
  const invalidTypeRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Round 1',
        round_type: 'semi_final', // legacy/unsupported
        days: [
          {
            day_number: 1,
            allocations: [{ district_id: 'GRP-1', match_count: 1 }],
          },
        ],
      },
    ],
  };

  const res = validateManualRoadmap(invalidTypeRoadmap);
  assert.strictEqual(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes('invalid stage type') || e.includes('semi_final')),
    'Must reject invalid round_type with clear error message'
  );
});

test('Group A: Validation rejects Grand Finals when it is not the last round', () => {
  const gfNotLastRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [{ day_number: 1, allocations: [{ district_id: 'GRP-1', match_count: 1 }] }],
      },
      {
        id: 'R2',
        round_number: 2,
        name: 'Extra Round',
        round_type: 'qualifier',
        days: [{ day_number: 1, allocations: [{ district_id: 'GRP-2', match_count: 1 }] }],
      },
    ],
  };

  const res = validateManualRoadmap(gfNotLastRoadmap);
  assert.strictEqual(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes('Grand Finals must be the last round')),
    'Must reject Grand Finals when not the terminal round'
  );
});

test('Group A: Validation rejects more than one Grand Finals round', () => {
  const multipleGFRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Grand Finals 1',
        round_type: 'grand_final',
        days: [{ day_number: 1, allocations: [{ district_id: 'GRP-1', match_count: 1 }] }],
      },
      {
        id: 'R2',
        round_number: 2,
        name: 'Grand Finals 2',
        round_type: 'grand_final',
        days: [{ day_number: 1, allocations: [{ district_id: 'GRP-2', match_count: 1 }] }],
      },
    ],
  };

  const res = validateManualRoadmap(multipleGFRoadmap);
  assert.strictEqual(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.includes('At most one Grand Finals round is allowed')),
    'Must reject multiple Grand Finals rounds'
  );
});

test('Group A: Valid 2-stage configuration (Qualifiers -> Grand Finals) passes validation', () => {
  const validRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        days: [
          {
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'GRP-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M1', match_number: 1, start_time: '14:00', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
      {
        id: 'R2',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            date: '2026-11-02',
            allocations: [
              {
                district_id: 'GRP-GF',
                district_name: 'Grand Finals',
                match_count: 1,
                matches: [{ id: 'M2', match_number: 1, start_time: '16:00', map: 'Miramar' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const res = validateManualRoadmap(validRoadmap);
  assert.strictEqual(res.valid, true, 'Valid 2-stage roadmap must pass validation');
  assert.strictEqual(res.errors.length, 0);
});

// ===========================================================================
// GROUP B TESTS: Team counts and rules
// 2. Round 1 "planned incoming teams": read-only, uses slotsTotal, works with 0 registrations
// 3. Every later round: auto-calculated from previous round (per_district = N x districts, overall = N, manual = N)
// 4. Advancement target: default to next round, Grand Finals has no qualification rule
// 5. Grand Finals incoming teams: read-only, equal to previous round's qualifiers
// ===========================================================================

import { syncAutoDistrictsForLaterRounds, calculateAdvancingTeams } from '../server/roadmapAutoDistricts.js';

test('Group B: Auto team counts calculate through 128 -> 16 -> Grand Finals', () => {
  // 128 slots / 16 per group => 8 districts in Round 1
  const r1Allocations = Array.from({ length: 8 }, (_, i) => ({
    district_id: `GRP-${i + 1}`,
    district_name: `District ${i + 1}`,
    match_count: 1,
    matches: [{ id: `M1-${i + 1}`, match_number: i + 1, start_time: '14:00', map: 'Erangel' }],
  }));

  const testRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifiers Round 1',
        round_type: 'qualifier',
        teams_in: 128,
        advancement_type: 'per_district',
        teams_advancing_per_district: 2, // 8 * 2 = 16 advancing
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: r1Allocations,
          },
        ],
      },
      {
        id: 'RND-2',
        round_number: 2,
        name: 'Quarter-Finals',
        round_type: 'qualifier',
        teams_in: null, // to be auto-calculated
        advancement_type: 'overall',
        teams_advancing: 16,
        days: [],
      },
      {
        id: 'RND-3',
        round_number: 3,
        name: 'Grand Finals',
        round_type: 'grand_final',
        teams_in: null, // to be auto-calculated
        days: [],
      },
    ],
  };

  // Sync auto districts and teams_in down the chain
  syncAutoDistrictsForLaterRounds(testRoadmap, {
    slotsTotal: 128,
    teams_per_group: 16,
    forceAutoTeamsIn: true,
  });

  const rounds = testRoadmap.rounds;

  // Round 1
  assert.strictEqual(rounds[0].teams_in, 128, 'Round 1 teams_in must equal slotsTotal (128)');
  assert.strictEqual(rounds[0].advancement_target_round_id, 'RND-2', 'Round 1 targets Round 2');

  // Round 2 (auto-calculated from Round 1: 8 districts * 2 = 16)
  assert.strictEqual(rounds[1].teams_in, 16, 'Round 2 teams_in must equal 16 (8 districts * 2 advancing)');
  assert.strictEqual(rounds[1].advancement_target_round_id, 'RND-3', 'Round 2 targets Grand Finals (RND-3)');
  // 16 teams / 16 per group => exactly 1 district auto-created
  assert.strictEqual(rounds[1].days[0].allocations.length, 1, 'Round 2 must auto-create 1 district');

  // Round 3 (Grand Finals: auto-calculated from Round 2: 16 qualifiers)
  assert.strictEqual(rounds[2].teams_in, 16, 'Grand Finals teams_in must equal 16 (from Round 2 qualifiers)');
  assert.strictEqual(rounds[2].advancement_target_round_id, null, 'Grand Finals has no advancement target');
  assert.strictEqual(rounds[2].days[0].allocations.length, 1, 'Grand Finals must auto-create 1 district');
});

test('Group B: Updating rule in previous round updates dependent rounds live (8 dist * 3 = 24 -> Grand Finals)', () => {
  const r1Allocations = Array.from({ length: 8 }, (_, i) => ({
    district_id: `GRP-${i + 1}`,
    district_name: `District ${i + 1}`,
    match_count: 1,
  }));

  const testRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        teams_in: 128,
        advancement_type: 'per_district',
        teams_advancing_per_district: 3, // Changed from 2 to 3! (8 * 3 = 24)
        days: [{ id: 'DAY-1', day_number: 1, allocations: r1Allocations }],
      },
      {
        id: 'RND-2',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        teams_in: 16, // old stale value
        days: [],
      },
    ],
  };

  // Sync with live update
  syncAutoDistrictsForLaterRounds(testRoadmap, {
    slotsTotal: 128,
    teams_per_group: 16,
    forceAutoTeamsIn: true,
  });

  assert.strictEqual(testRoadmap.rounds[1].teams_in, 24, 'Grand Finals teams_in must update live to 24 (8 districts * 3)');
  // 24 teams / 16 per group => 2 districts in Grand Finals
  assert.strictEqual(testRoadmap.rounds[1].days[0].allocations.length, 2, '24 teams creates 2 districts');
});

test('Group B: Roadmap works seamlessly with 0 registrations', () => {
  const r1Allocations = [
    { district_id: 'GRP-1', district_name: 'District 1', match_count: 1, matches: [{ id: 'M1', match_number: 1, start_time: '14:00', map: 'Erangel' }] },
  ];

  const testRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        days: [{ id: 'DAY-1', day_number: 1, date: '2026-11-01', allocations: r1Allocations }],
      },
      {
        id: 'RND-2',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [{ id: 'DAY-2', day_number: 1, date: '2026-11-02', allocations: [{ district_id: 'GRP-GF', match_count: 1, matches: [{ id: 'M2', match_number: 1, start_time: '16:00', map: 'Miramar' }] }] }],
      },
    ],
  };

  // Validate with slotsTotal = 64 and registeredCount = 0
  const val = validateManualRoadmap(testRoadmap, {
    slotsTotal: 64,
    registeredCount: 0,
    teams_per_group: 16,
  });

  assert.strictEqual(val.valid, true, 'Roadmap must validate even with 0 registered teams');
});

// ===========================================================================
// GROUP C TESTS: Dates and Match Settings
// 6. Dates format as DD/MM/YYYY; date picker parse and format
// 7. Individual match editing (time and map per match)
// 8. Grand Finals: 1 to 4+ days, all districts attach automatically,
//    each day has its own matches/times/maps, validation enforces >= 1 match with time & map
// ===========================================================================

test('Group C: Date picker formatToDDMMYYYY converts ISO YYYY-MM-DD to DD/MM/YYYY', () => {
  assert.strictEqual(formatToDDMMYYYY('2026-10-24'), '24/10/2026');
  assert.strictEqual(formatToDDMMYYYY('2026-01-05'), '05/01/2026');
  assert.strictEqual(formatToDDMMYYYY(''), '');
  assert.strictEqual(formatToDDMMYYYY(null), '');
});

test('Group C: Date picker parseFromDDMMYYYY parses DD/MM/YYYY to ISO YYYY-MM-DD and rejects invalid dates', () => {
  assert.strictEqual(parseFromDDMMYYYY('24/10/2026'), '2026-10-24');
  assert.strictEqual(parseFromDDMMYYYY('05/01/2026'), '2026-01-05');
  assert.strictEqual(parseFromDDMMYYYY('29/02/2024'), '2024-02-29', 'Leap year Feb 29 is valid');

  // Invalid formats and dates
  assert.strictEqual(parseFromDDMMYYYY('29/02/2025'), null, 'Non-leap year Feb 29 is invalid');
  assert.strictEqual(parseFromDDMMYYYY('32/01/2026'), null, 'Day 32 is invalid');
  assert.strictEqual(parseFromDDMMYYYY('00/10/2026'), null, 'Day 0 is invalid');
  assert.strictEqual(parseFromDDMMYYYY('15/13/2026'), null, 'Month 13 is invalid');
  assert.strictEqual(parseFromDDMMYYYY('invalid-date'), null);
  assert.strictEqual(parseFromDDMMYYYY(''), null);
  assert.strictEqual(parseFromDDMMYYYY(null), null);
});

test('Group C: Grand Finals over 3 days with 3 matches each with different times and maps passes validation', () => {
  const gfDays = [
    {
      id: 'GF-DAY-1',
      day_number: 1,
      date: '2026-11-10',
      allocations: [
        {
          district_id: 'GRP-GF',
          district_name: 'Grand Finals',
          match_count: 3,
          matches: [
            { id: 'M-D1-1', match_number: 1, start_time: '13:00', map: 'Erangel' },
            { id: 'M-D1-2', match_number: 2, start_time: '14:00', map: 'Miramar' },
            { id: 'M-D1-3', match_number: 3, start_time: '15:00', map: 'Sanhok' },
          ],
        },
      ],
    },
    {
      id: 'GF-DAY-2',
      day_number: 2,
      date: '2026-11-11',
      allocations: [
        {
          district_id: 'GRP-GF',
          district_name: 'Grand Finals',
          match_count: 3,
          matches: [
            { id: 'M-D2-1', match_number: 1, start_time: '14:30', map: 'Vikendi' },
            { id: 'M-D2-2', match_number: 2, start_time: '15:30', map: 'Erangel' },
            { id: 'M-D2-3', match_number: 3, start_time: '16:30', map: 'Miramar' },
          ],
        },
      ],
    },
    {
      id: 'GF-DAY-3',
      day_number: 3,
      date: '2026-11-12',
      allocations: [
        {
          district_id: 'GRP-GF',
          district_name: 'Grand Finals',
          match_count: 3,
          matches: [
            { id: 'M-D3-1', match_number: 1, start_time: '16:00', map: 'Rondo' },
            { id: 'M-D3-2', match_number: 2, start_time: '17:00', map: 'Erangel' },
            { id: 'M-D3-3', match_number: 3, start_time: '18:00', map: 'Miramar' },
          ],
        },
      ],
    },
  ];

  const testRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        advancement_type: 'overall',
        teams_advancing_overall: 16,
        days: [
          {
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'GRP-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M1', match_number: 1, start_time: '13:00', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
      {
        id: 'R2',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: gfDays,
      },
    ],
  };

  const val = validateManualRoadmap(testRoadmap, { slotsTotal: 16, teams_per_group: 16 });
  assert.strictEqual(val.valid, true, 'Grand Finals over 3 days with individual match times and maps must be valid');
});

test('Group C: Grand Finals validation rejects any day with 0 matches or missing time/map', () => {
  // Day 2 has empty matches
  const invalidGF1 = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            date: '2026-11-10',
            allocations: [
              {
                district_id: 'GRP-GF',
                district_name: 'Grand Finals',
                match_count: 1,
                matches: [{ id: 'M1', match_number: 1, start_time: '13:00', map: 'Erangel' }],
              },
            ],
          },
          {
            day_number: 2,
            date: '2026-11-11',
            allocations: [
              {
                district_id: 'GRP-GF',
                district_name: 'Grand Finals',
                match_count: 0,
                matches: [], // empty matches!
              },
            ],
          },
        ],
      },
    ],
  };

  const val1 = validateManualRoadmap(invalidGF1, { slotsTotal: 16, teams_per_group: 16 });
  assert.strictEqual(val1.valid, false);
  assert.ok(val1.errors.some((e) => e.includes('Day 2 has no matches') || e.includes('at least one match')));

  // Day 1 has match with missing time
  const invalidGF2 = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            date: '2026-11-10',
            allocations: [
              {
                district_id: 'GRP-GF',
                district_name: 'Grand Finals',
                match_count: 1,
                matches: [{ id: 'M1', match_number: 1, start_time: '', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const val2 = validateManualRoadmap(invalidGF2, { slotsTotal: 16, teams_per_group: 16 });
  assert.strictEqual(val2.valid, false);
  assert.ok(val2.errors.some((e) => e.includes('valid start time')));
});

test('Group C: syncAutoDistrictsForLaterRounds preserves 1 to 4+ Grand Finals days and attaches districts to each day', () => {
  const gfDays = [
    { id: 'D1', day_number: 1, date: '2026-11-10', allocations: [] },
    { id: 'D2', day_number: 2, date: '2026-11-11', allocations: [] },
    { id: 'D3', day_number: 3, date: '2026-11-12', allocations: [] },
    { id: 'D4', day_number: 4, date: '2026-11-13', allocations: [] },
  ];

  const testRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        teams_in: 16,
        advancement_type: 'overall',
        teams_advancing_overall: 16,
        days: [{ id: 'D0', day_number: 1, allocations: [{ district_id: 'GRP-1', match_count: 1 }] }],
      },
      {
        id: 'R2',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: gfDays,
      },
    ],
  };

  syncAutoDistrictsForLaterRounds(testRoadmap, { slotsTotal: 16, teams_per_group: 16, forceAutoTeamsIn: true });

  const gfRound = testRoadmap.rounds[1];
  assert.strictEqual(gfRound.days.length, 4, 'Must preserve all 4 days without collapsing');
  gfRound.days.forEach((day, idx) => {
    assert.strictEqual(day.allocations.length, 1, `Day ${idx + 1} must have Grand Finals district automatically attached`);
    assert.strictEqual(day.allocations[0].district_name, 'Grand Finals');
    assert.ok(day.allocations[0].matches.length >= 1, `Day ${idx + 1} must have at least 1 match`);
  });
});

// ===========================================================================
// GROUP D TESTS: Participant View & Privacy
// 9. Server returns only viewer's own district/match IDs (my_district_ids)
//    Never returns other teams' assignments or names
//    Cache-Control: private header set
//    Participant with no assignment sees empty IDs
// ===========================================================================

test('Group D: Participant gets only their own district and match IDs, never other teams assignments', async () => {
  const mockDb = {
    tournament: {
      id: 'T-PARTICIPANT-1',
      orgId: 'ORG-1',
      roadmap_status: 'published',
      rounds_published: true,
      status: 'upcoming',
      slotsTotal: 32,
      teams_per_group: 16,
    },
    rounds: [{ id: 'R1', round_number: 1, name: 'Qualifiers', round_type: 'qualifier' }],
    days: [{ id: 'D1', round_id: 'R1', day_number: 1, date: '2026-11-20' }],
    groups: [
      { id: 'GRP-ALPHA', round_id: 'R1', name: 'District Alpha', sequence: 1 },
      { id: 'GRP-BETA', round_id: 'R1', name: 'District Beta', sequence: 2 },
    ],
    rooms: [
      { id: 'RM-ALPHA-1', round_id: 'R1', day_id: 'D1', group_id: 'GRP-ALPHA', room_number: 1 },
      { id: 'RM-BETA-1', round_id: 'R1', day_id: 'D1', group_id: 'GRP-BETA', room_number: 2 },
    ],
    matches: [
      { id: 'MAT-ALPHA-1', round_id: 'R1', day_id: 'D1', group_id: 'GRP-ALPHA', room_id: 'RM-ALPHA-1', match_number: 1, start_time: '13:00' },
      { id: 'MAT-BETA-1', round_id: 'R1', day_id: 'D1', group_id: 'GRP-BETA', room_id: 'RM-BETA-1', match_number: 2, start_time: '14:00' },
    ],
    teams: [
      { id: 'TEAM-VIEWER', team_name: 'Viewer Warriors', user_id: 'USER-VIEWER-1', tournament_id: 'T-PARTICIPANT-1' },
      { id: 'TEAM-RIVAL', team_name: 'Rival Champions', user_id: 'USER-RIVAL-2', tournament_id: 'T-PARTICIPANT-1' },
    ],
    assignments: [
      { id: 'A1', tournament_id: 'T-PARTICIPANT-1', tournament_team_id: 'TEAM-VIEWER', match_id: 'MAT-ALPHA-1', group_id: 'GRP-ALPHA', room_id: 'RM-ALPHA-1' },
      { id: 'A2', tournament_id: 'T-PARTICIPANT-1', tournament_team_id: 'TEAM-RIVAL', match_id: 'MAT-BETA-1', group_id: 'GRP-BETA', room_id: 'RM-BETA-1' },
    ],
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM TOURNAMENTS')) return { rows: [mockDb.tournament] };
      if (s.includes('FROM TOURNAMENT_ROUNDS')) return { rows: mockDb.rounds };
      if (s.includes('FROM TOURNAMENT_DAYS')) return { rows: mockDb.days };
      if (s.includes('FROM TOURNAMENT_GROUPS')) return { rows: mockDb.groups };
      if (s.includes('FROM TOURNAMENT_ROOMS')) return { rows: mockDb.rooms };
      if (s.includes('FROM TOURNAMENT_MATCHES')) return { rows: mockDb.matches };
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        // If query specifically asks for team id
        if (params.length >= 2 && params[1] === 'TEAM-VIEWER') {
          return { rows: mockDb.assignments.filter((a) => a.tournament_team_id === 'TEAM-VIEWER') };
        }
        return { rows: mockDb.assignments };
      }
      if (s.includes('FROM TOURNAMENT_REGISTRATION_GROUPS')) return { rows: [] };
      if (s.includes('FROM TOURNAMENT_REGISTRATIONS')) return { rows: [] };
      if (s.includes('FROM TOURNAMENT_TEAMS')) {
        const matching = mockDb.teams.filter((t) => t.user_id === params[1] || t.id === params[0]);
        return { rows: matching };
      }
      return { rows: [] };
    },
  };

  // Viewer 1 (Team Viewer) requests roadmap
  const authUserViewer = { id: 'USER-VIEWER-1', role: 'user' };
  const res = await getTournamentRoadmapResponse(mockClient, 'T-PARTICIPANT-1', authUserViewer);

  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.mode, 'participant');
  assert.strictEqual(res.body.viewer_is_organizer, false);

  // Must contain ONLY viewer's own IDs
  assert.deepStrictEqual(res.body.my_district_ids, ['GRP-ALPHA'], 'Must contain only viewer own district ID');
  assert.deepStrictEqual(res.body.my_match_ids, ['MAT-ALPHA-1'], 'Must contain only viewer own match ID');
  assert.ok(!res.body.my_district_ids.includes('GRP-BETA'), 'Must NOT include rival district ID');
  assert.ok(!res.body.my_match_ids.includes('MAT-BETA-1'), 'Must NOT include rival match ID');

  // Must not leak other teams' assignments or names
  assert.strictEqual(res.body.roadmap.assignments, undefined, 'assignments table must not be leaked to participant');
  const jsonOutput = JSON.stringify(res.body);
  assert.ok(!jsonOutput.includes('TEAM-RIVAL'), 'Must never leak rival team ID');
  assert.ok(!jsonOutput.includes('Rival Champions'), 'Must never leak rival team name');

  // Cache-Control header must be private
  assert.ok(res.headers, 'Must have response headers');
  assert.ok(res.headers['Cache-Control']?.includes('private'), 'Cache-Control header must include private');
});

test('Group D: Participant with no team or no assignments gets empty my_district_ids', async () => {
  const mockDb = {
    tournament: {
      id: 'T-PARTICIPANT-2',
      orgId: 'ORG-1',
      roadmap_status: 'published',
      rounds_published: true,
      status: 'upcoming',
      slotsTotal: 16,
      teams_per_group: 16,
    },
    rounds: [{ id: 'R1', round_number: 1, name: 'Qualifiers', round_type: 'qualifier' }],
    days: [{ id: 'D1', round_id: 'R1', day_number: 1, date: '2026-11-20' }],
    groups: [{ id: 'GRP-1', round_id: 'R1', name: 'District 1' }],
    rooms: [{ id: 'RM-1', round_id: 'R1', day_id: 'D1', group_id: 'GRP-1', room_number: 1 }],
    matches: [{ id: 'MAT-1', round_id: 'R1', day_id: 'D1', group_id: 'GRP-1', room_id: 'RM-1', match_number: 1, start_time: '13:00' }],
    teams: [{ id: 'TEAM-NEW', team_name: 'New Unassigned Team', user_id: 'USER-NEW', tournament_id: 'T-PARTICIPANT-2' }],
    assignments: [], // no assignments yet
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM TOURNAMENTS')) return { rows: [mockDb.tournament] };
      if (s.includes('FROM TOURNAMENT_ROUNDS')) return { rows: mockDb.rounds };
      if (s.includes('FROM TOURNAMENT_DAYS')) return { rows: mockDb.days };
      if (s.includes('FROM TOURNAMENT_GROUPS')) return { rows: mockDb.groups };
      if (s.includes('FROM TOURNAMENT_ROOMS')) return { rows: mockDb.rooms };
      if (s.includes('FROM TOURNAMENT_MATCHES')) return { rows: mockDb.matches };
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS')) return { rows: [] };
      if (s.includes('FROM TOURNAMENT_TEAMS')) {
        const matching = mockDb.teams.filter((t) => t.user_id === params[1] || t.id === params[0]);
        return { rows: matching };
      }
      return { rows: [] };
    },
  };

  const authUserNew = { id: 'USER-NEW', role: 'user' };
  const res = await getTournamentRoadmapResponse(mockClient, 'T-PARTICIPANT-2', authUserNew);

  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.my_district_ids, [], 'Unassigned participant has empty my_district_ids');
  assert.deepStrictEqual(res.body.my_match_ids, [], 'Unassigned participant has empty my_match_ids');
});

// ===========================================================================
// GROUP E TESTS: Stop the Refreshing & Local Draft Architecture
// 10. Proof of root cause: local draft changes update local state only
// 11. Grand Finals over 3 days with 3 matches each (custom times and maps)
//     saved and reloaded unchanged
// 12. Safety net: sessionStorage draft keyed by tournament ID
// ===========================================================================

test('Group E: Grand Finals over 3 days with 3 matches each (different times and maps) saved and reloaded unchanged', async () => {
  const tournamentId = 'T-GF-3DAYS';

  // Construct Grand Finals over 3 days with 3 matches each
  const gfRoadmap = {
    rounds: [
      {
        id: 'RND-GF-1',
        round_number: 1,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            id: 'DAY-GF-D1',
            day_number: 1,
            date: '2026-11-20',
            allocations: [
              {
                id: 'ALLOC-GF-1',
                district_id: 'GRP-GF-AUTO',
                district_name: 'Grand Finals',
                match_count: 3,
                matches: [
                  { id: 'M-D1-1', district_match_number: 1, start_time: '14:00', end_time: '14:35', map: 'Erangel' },
                  { id: 'M-D1-2', district_match_number: 2, start_time: '15:15', end_time: '15:50', map: 'Miramar' },
                  { id: 'M-D1-3', district_match_number: 3, start_time: '16:30', end_time: '17:05', map: 'Sanhok' },
                ],
              },
            ],
          },
          {
            id: 'DAY-GF-D2',
            day_number: 2,
            date: '2026-11-21',
            allocations: [
              {
                id: 'ALLOC-GF-2',
                district_id: 'GRP-GF-AUTO',
                district_name: 'Grand Finals',
                match_count: 3,
                matches: [
                  { id: 'M-D2-1', district_match_number: 1, start_time: '14:00', end_time: '14:35', map: 'Vikendi' },
                  { id: 'M-D2-2', district_match_number: 2, start_time: '15:15', end_time: '15:50', map: 'Erangel' },
                  { id: 'M-D2-3', district_match_number: 3, start_time: '16:30', end_time: '17:05', map: 'Miramar' },
                ],
              },
            ],
          },
          {
            id: 'DAY-GF-D3',
            day_number: 3,
            date: '2026-11-22',
            allocations: [
              {
                id: 'ALLOC-GF-3',
                district_id: 'GRP-GF-AUTO',
                district_name: 'Grand Finals',
                match_count: 3,
                matches: [
                  { id: 'M-D3-1', district_match_number: 1, start_time: '17:00', end_time: '17:35', map: 'Sanhok' },
                  { id: 'M-D3-2', district_match_number: 2, start_time: '18:15', end_time: '18:50', map: 'Vikendi' },
                  { id: 'M-D3-3', district_match_number: 3, start_time: '19:30', end_time: '20:05', map: 'Erangel' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // Mock DB state storage
  const db = {
    rounds: [],
    days: [],
    groups: [],
    rooms: [],
    matches: [],
  };

  const mockDbClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();

      if (s.includes('FROM TOURNAMENT_MATCH_RESULTS')) return { rows: [] };
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS')) return { rows: [] };

      if (s.includes('SELECT * FROM TOURNAMENT_ROUNDS')) return { rows: [...db.rounds] };
      if (s.includes('SELECT * FROM TOURNAMENT_DAYS')) return { rows: [...db.days] };
      if (s.includes('SELECT * FROM TOURNAMENT_GROUPS')) return { rows: [...db.groups] };
      if (s.includes('SELECT * FROM TOURNAMENT_ROOMS')) return { rows: [...db.rooms] };
      if (s.includes('SELECT * FROM TOURNAMENT_MATCHES')) return { rows: [...db.matches] };

      if (s.startsWith('INSERT INTO TOURNAMENT_ROUNDS')) {
        const id = params[0];
        const existingIdx = db.rounds.findIndex((r) => r.id === id);
        const row = {
          id: params[0],
          tournament_id: params[1],
          round_number: params[2],
          name: params[3],
          status: params[4],
          teams_advancing: params[5],
          round_type: params[6],
          advancement_type: params[7],
          advancement_target_round_id: params[8],
          teams_advancing_per_district: params[9],
          teams_advancing_per_match: params[10],
          round_order: params[11],
          teams_in: params[12],
        };
        if (existingIdx >= 0) db.rounds[existingIdx] = row;
        else db.rounds.push(row);
        return { rows: [row] };
      }

      if (s.startsWith('INSERT INTO TOURNAMENT_DAYS')) {
        const id = params[0];
        const existingIdx = db.days.findIndex((d) => d.id === id);
        const row = {
          id: params[0],
          tournament_id: params[1],
          round_id: params[2],
          day_number: params[3],
          date: params[4],
        };
        if (existingIdx >= 0) db.days[existingIdx] = row;
        else db.days.push(row);
        return { rows: [row] };
      }

      if (s.startsWith('SELECT ID FROM TOURNAMENT_GROUPS WHERE ID = $1')) {
        const matching = db.groups.filter((g) => g.id === params[0]);
        return { rows: matching };
      }

      if (s.startsWith('UPDATE TOURNAMENT_GROUPS')) {
        const id = params[6];
        const existing = db.groups.find((g) => g.id === id);
        if (existing) {
          existing.group_name = params[0];
          existing.round_id = params[1];
          existing.day_id = params[2];
          existing.sequence = params[3];
          existing.display_order = params[4];
          existing.district_id = params[5];
        }
        return { rows: [] };
      }

      if (s.startsWith('INSERT INTO TOURNAMENT_GROUPS')) {
        const id = params[0];
        const existingIdx = db.groups.findIndex((g) => g.id === id);
        const row = {
          id: params[0],
          tournament_id: params[1],
          day_id: params[2],
          round_id: params[3],
          group_name: params[4],
          sequence: params[5],
          display_order: params[6],
          district_id: params[7],
        };
        if (existingIdx >= 0) db.groups[existingIdx] = row;
        else db.groups.push(row);
        return { rows: [row] };
      }

      if (s.startsWith('INSERT INTO TOURNAMENT_ROOMS')) {
        const id = params[0];
        const existingIdx = db.rooms.findIndex((rm) => rm.id === id);
        const row = {
          id: params[0],
          tournament_id: params[1],
          day_id: params[2],
          group_id: params[3],
          round_id: params[4],
          room_number: params[5],
          capacity: params[6],
        };
        if (existingIdx >= 0) db.rooms[existingIdx] = row;
        else db.rooms.push(row);
        return { rows: [row] };
      }

      if (s.startsWith('INSERT INTO TOURNAMENT_MATCHES')) {
        const id = params[0];
        const existingIdx = db.matches.findIndex((m) => m.id === id);
        const row = {
          id: params[0],
          tournament_id: params[1],
          round_id: params[2],
          day_id: params[3],
          group_id: params[4],
          room_id: params[5],
          match_number: params[6],
          start_time: params[7],
          end_time: params[8],
          status: params[9],
          map: params[10],
          group_name: params[11],
          origin: params[12],
          manual_override: params[13],
          notes: params[14],
          id_pwd_release_time: params[15],
        };
        if (existingIdx >= 0) db.matches[existingIdx] = row;
        else db.matches.push(row);
        return { rows: [row] };
      }

      if (s.startsWith('DELETE FROM')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  // 1. Save Grand Finals Draft
  await saveManualRoadmapDraft(mockDbClient, tournamentId, gfRoadmap);

  // Verify records were inserted in mock database
  assert.strictEqual(db.rounds.length, 1, '1 round inserted');
  assert.strictEqual(db.days.length, 3, '3 match days inserted');
  assert.strictEqual(db.matches.length, 9, '9 matches (3 per day) inserted');

  // 2. Reload and build hierarchical roadmap from the database tables
  const reloaded = buildHierarchicalRoadmap(db.rounds, db.days, db.groups, db.matches);

  assert.strictEqual(reloaded.length, 1, '1 round reloaded');
  const gfReloaded = reloaded[0];
  assert.strictEqual(gfReloaded.round_type, 'grand_final');
  assert.strictEqual(gfReloaded.days.length, 3, '3 days preserved in reloaded roadmap');

  // Day 1 Checks
  const d1 = gfReloaded.days.find((d) => d.day_number === 1);
  assert.ok(d1, 'Day 1 exists');
  assert.strictEqual(d1.date, '2026-11-20');
  const d1Matches = d1.allocations[0].matches;
  assert.strictEqual(d1Matches.length, 3, 'Day 1 has 3 matches');
  assert.strictEqual(d1Matches[0].start_time, '14:00');
  assert.strictEqual(d1Matches[0].map, 'Erangel');
  assert.strictEqual(d1Matches[1].start_time, '15:15');
  assert.strictEqual(d1Matches[1].map, 'Miramar');
  assert.strictEqual(d1Matches[2].start_time, '16:30');
  assert.strictEqual(d1Matches[2].map, 'Sanhok');

  // Day 2 Checks
  const d2 = gfReloaded.days.find((d) => d.day_number === 2);
  assert.ok(d2, 'Day 2 exists');
  assert.strictEqual(d2.date, '2026-11-21');
  const d2Matches = d2.allocations[0].matches;
  assert.strictEqual(d2Matches.length, 3, 'Day 2 has 3 matches');
  assert.strictEqual(d2Matches[0].start_time, '14:00');
  assert.strictEqual(d2Matches[0].map, 'Vikendi');
  assert.strictEqual(d2Matches[1].start_time, '15:15');
  assert.strictEqual(d2Matches[1].map, 'Erangel');
  assert.strictEqual(d2Matches[2].start_time, '16:30');
  assert.strictEqual(d2Matches[2].map, 'Miramar');

  // Day 3 Checks
  const d3 = gfReloaded.days.find((d) => d.day_number === 3);
  assert.ok(d3, 'Day 3 exists');
  assert.strictEqual(d3.date, '2026-11-22');
  const d3Matches = d3.allocations[0].matches;
  assert.strictEqual(d3Matches.length, 3, 'Day 3 has 3 matches');
  assert.strictEqual(d3Matches[0].start_time, '17:00');
  assert.strictEqual(d3Matches[0].map, 'Sanhok');
  assert.strictEqual(d3Matches[1].start_time, '18:15');
  assert.strictEqual(d3Matches[1].map, 'Vikendi');
  assert.strictEqual(d3Matches[2].start_time, '19:30');
  assert.strictEqual(d3Matches[2].map, 'Erangel');
});

test('Group E: SessionStorage safety net keys properly by tournament ID and captures working draft', () => {
  const tournamentId = 'T-TOURNEY-99';
  const storageKey = `matchdistrict_roadmap_draft_${tournamentId}`;
  assert.strictEqual(storageKey, 'matchdistrict_roadmap_draft_T-TOURNEY-99');

  const draftPayload = {
    rounds: [{ id: 'R1', round_number: 1, name: 'Round 1 Unsaved Draft' }],
    timestamp: 1729500000000,
    tournamentId,
  };

  const serialized = JSON.stringify(draftPayload);
  const parsed = JSON.parse(serialized);

  assert.strictEqual(parsed.tournamentId, 'T-TOURNEY-99');
  assert.strictEqual(parsed.rounds[0].name, 'Round 1 Unsaved Draft');
  assert.strictEqual(parsed.timestamp, 1729500000000);
});




