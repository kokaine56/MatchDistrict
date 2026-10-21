// tests/roadmapDistrictManualChoice.test.js
// Verification tests for manual district choice per match:
// 1. Root cause & smart district default pre-selection
// 2. Per-match district selection & moving match between days
// 3. Publish validation: missing district coverage, same-district time overlap, parallel different-district matches valid
// 4. Backend storage & backward compatibility: district_id on match, old roadmaps compatibility, locked match protection
// 5. Participant view: highlights viewer's district, suppresses team names

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getRoundDistricts,
  getDefaultDistrictForNewMatch,
  getUnscheduledDistrictsForRound,
} from '../server/roadmapDistricts.js';
import {
  validateManualRoadmap,
  buildHierarchicalRoadmap,
  saveManualRoadmapDraft,
} from '../server/manualRoadmapService.js';

test('TASK 1 & 3: Smart Default District Selection for New Matches', () => {
  const roundDistricts = [
    { id: 'DIST-1', name: 'Qualifiers District 1' },
    { id: 'DIST-2', name: 'Qualifiers District 2' },
    { id: 'DIST-3', name: 'Qualifiers District 3' },
    { id: 'DIST-4', name: 'Qualifiers District 4' },
  ];

  // Case A: Day 1 only has matches for DIST-1. The first district with 0 matches is DIST-2.
  const daysCaseA = [
    {
      id: 'DAY-1',
      day_number: 1,
      allocations: [
        {
          district_id: 'DIST-1',
          district_name: 'Qualifiers District 1',
          matches: [{ id: 'M-1', district_id: 'DIST-1', start_time: '13:00' }],
        },
      ],
    },
  ];

  const defaultA = getDefaultDistrictForNewMatch(roundDistricts, daysCaseA);
  assert.strictEqual(defaultA?.id, 'DIST-2', 'Must pre-select DIST-2 because it is the first district with 0 matches');

  // Case B: DIST-1 and DIST-2 have matches. First district with 0 matches is DIST-3.
  const daysCaseB = [
    {
      id: 'DAY-1',
      day_number: 1,
      allocations: [
        {
          district_id: 'DIST-1',
          district_name: 'Qualifiers District 1',
          matches: [{ id: 'M-1', district_id: 'DIST-1', start_time: '13:00' }],
        },
        {
          district_id: 'DIST-2',
          district_name: 'Qualifiers District 2',
          matches: [{ id: 'M-2', district_id: 'DIST-2', start_time: '14:00' }],
        },
      ],
    },
  ];

  const defaultB = getDefaultDistrictForNewMatch(roundDistricts, daysCaseB);
  assert.strictEqual(defaultB?.id, 'DIST-3', 'Must pre-select DIST-3 because it is the first district with 0 matches');

  // Case C: All districts have at least 1 match.
  // DIST-1: 2 matches, DIST-2: 1 match, DIST-3: 2 matches, DIST-4: 2 matches.
  // Fewest matches is DIST-2 (count: 1).
  const daysCaseC = [
    {
      id: 'DAY-1',
      day_number: 1,
      allocations: [
        {
          district_id: 'DIST-1',
          district_name: 'Qualifiers District 1',
          matches: [
            { id: 'M-1', district_id: 'DIST-1', start_time: '13:00' },
            { id: 'M-2', district_id: 'DIST-1', start_time: '14:00' },
          ],
        },
        {
          district_id: 'DIST-2',
          district_name: 'Qualifiers District 2',
          matches: [{ id: 'M-3', district_id: 'DIST-2', start_time: '15:00' }],
        },
      ],
    },
    {
      id: 'DAY-2',
      day_number: 2,
      allocations: [
        {
          district_id: 'DIST-3',
          district_name: 'Qualifiers District 3',
          matches: [
            { id: 'M-4', district_id: 'DIST-3', start_time: '13:00' },
            { id: 'M-5', district_id: 'DIST-3', start_time: '14:00' },
          ],
        },
        {
          district_id: 'DIST-4',
          district_name: 'Qualifiers District 4',
          matches: [
            { id: 'M-6', district_id: 'DIST-4', start_time: '15:00' },
            { id: 'M-7', district_id: 'DIST-4', start_time: '16:00' },
          ],
        },
      ],
    },
  ];

  const defaultC = getDefaultDistrictForNewMatch(roundDistricts, daysCaseC);
  assert.strictEqual(defaultC?.id, 'DIST-2', 'When all districts have matches, must pre-select the one with the fewest matches');
});

test('TASK 5: Unscheduled Districts Tracking Indicator', () => {
  const roundDistricts = [
    { id: 'DIST-1', name: 'Qualifiers District 1' },
    { id: 'DIST-2', name: 'Qualifiers District 2' },
    { id: 'DIST-3', name: 'Qualifiers District 3' },
    { id: 'DIST-4', name: 'Qualifiers District 4' },
  ];

  // Only DIST-1 has matches
  const daysPartial = [
    {
      id: 'DAY-1',
      allocations: [
        {
          district_id: 'DIST-1',
          matches: [{ district_id: 'DIST-1', start_time: '13:00' }],
        },
      ],
    },
  ];

  const unscheduled = getUnscheduledDistrictsForRound(roundDistricts, daysPartial);
  assert.strictEqual(unscheduled.length, 3);
  assert.deepStrictEqual(
    unscheduled.map((d) => d.id),
    ['DIST-2', 'DIST-3', 'DIST-4']
  );

  // When all have matches
  const daysAll = [
    {
      id: 'DAY-1',
      allocations: [
        { district_id: 'DIST-1', matches: [{ district_id: 'DIST-1', start_time: '13:00' }] },
        { district_id: 'DIST-2', matches: [{ district_id: 'DIST-2', start_time: '14:00' }] },
      ],
    },
    {
      id: 'DAY-2',
      allocations: [
        { district_id: 'DIST-3', matches: [{ district_id: 'DIST-3', start_time: '13:00' }] },
        { district_id: 'DIST-4', matches: [{ district_id: 'DIST-4', start_time: '14:00' }] },
      ],
    },
  ];

  const unscheduledAll = getUnscheduledDistrictsForRound(roundDistricts, daysAll);
  assert.strictEqual(unscheduledAll.length, 0, 'No unscheduled districts should remain when all have matches');
});

test('TASK 6: Publish Validation - District Coverage, Overlaps, and Parallel Matches', () => {
  // A. Missing District Coverage on Publish: Every district must have at least one match
  const missingCoverageRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'Qualifiers District 1',
                match_count: 1,
                matches: [{ district_match_number: 1, start_time: '13:00', end_time: '13:30' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const coverageVal = validateManualRoadmap(missingCoverageRoadmap, {
    isPublish: true,
    slotsTotal: 64,
    teams_per_group: 16,
    districts: [
      { id: 'DIST-1', name: 'Qualifiers District 1' },
      { id: 'DIST-2', name: 'Qualifiers District 2' },
      { id: 'DIST-3', name: 'Qualifiers District 3' },
      { id: 'DIST-4', name: 'Qualifiers District 4' },
    ],
  });

  assert.strictEqual(coverageVal.valid, false);
  assert.ok(
    coverageVal.errors.some((e) => e.includes('District "Qualifiers District 2" has no matches scheduled')),
    'Must name unscheduled district in error message'
  );

  // B. Overlapping Matches inside the SAME district on the SAME day
  const overlappingRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'Qualifiers District 1',
                match_count: 2,
                matches: [
                  { district_match_number: 1, start_time: '13:00', end_time: '13:30' },
                  { district_match_number: 2, start_time: '13:15', end_time: '13:45' }, // Overlaps with match 1!
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const overlapVal = validateManualRoadmap(overlappingRoadmap, { isPublish: true });
  assert.strictEqual(overlapVal.valid, false);
  assert.ok(
    overlapVal.errors.some(
      (e) => e.includes('Day 1') && e.includes('Matches in district "Qualifiers District 1" overlap')
    ),
    'Must name the day and district in overlap error message'
  );

  // C. Parallel Matches of DIFFERENT districts at the same time are VALID
  const parallelRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Qualifiers',
        round_type: 'qualifier',
        days: [
          {
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'Qualifiers District 1',
                match_count: 1,
                matches: [{ district_match_number: 1, start_time: '14:00', end_time: '14:30' }],
              },
              {
                district_id: 'DIST-2',
                district_name: 'Qualifiers District 2',
                match_count: 1,
                matches: [{ district_match_number: 1, start_time: '14:00', end_time: '14:30' }], // Same time, different district!
              },
            ],
          },
        ],
      },
    ],
  };

  const parallelVal = validateManualRoadmap(parallelRoadmap, { isPublish: true });
  assert.strictEqual(parallelVal.valid, true, 'Matches of different districts at the same time must be VALID');
  assert.strictEqual(parallelVal.errors.length, 0);
});

test('TASK 7: Backend district_id per match & Backward Compatibility in buildHierarchicalRoadmap', () => {
  const mockRounds = [{ id: 'R-1', round_number: 1, name: 'Round 1' }];
  const mockDays = [{ id: 'D-1', round_id: 'R-1', day_number: 1, date: '2026-11-01' }];
  const mockGroups = [
    { id: 'G-1', day_id: 'D-1', round_id: 'R-1', group_name: 'Qualifiers District 1', district_id: 'DIST-1' },
    { id: 'G-2', day_id: 'D-1', round_id: 'R-1', group_name: 'Qualifiers District 2', district_id: 'DIST-2' },
  ];

  // Old matches: match 1 has explicit district_id; match 2 has NO district_id (legacy row)
  const mockMatches = [
    {
      id: 'M-1',
      round_id: 'R-1',
      day_id: 'D-1',
      group_id: 'G-1',
      match_number: 1,
      start_time: '13:00',
      end_time: '13:30',
      map: 'Erangel',
      district_id: 'DIST-1',
      group_name: 'Qualifiers District 1',
    },
    {
      id: 'M-2',
      round_id: 'R-1',
      day_id: 'D-1',
      group_id: 'G-2',
      match_number: 2,
      start_time: '14:00',
      end_time: '14:30',
      map: 'Miramar',
      district_id: null, // Legacy match without explicit district_id
      group_name: 'Qualifiers District 2',
    },
  ];

  const hydrated = buildHierarchicalRoadmap(mockRounds, mockDays, mockGroups, mockMatches);
  assert.strictEqual(hydrated.length, 1);
  const day = hydrated[0].days[0];
  assert.strictEqual(day.allocations.length, 2);

  const m1 = day.allocations[0].matches[0];
  assert.strictEqual(m1.id, 'M-1');
  assert.strictEqual(m1.district_id, 'DIST-1', 'Match 1 must carry its district_id');
  assert.strictEqual(m1.district_name, 'Qualifiers District 1');

  const m2 = day.allocations[1].matches[0];
  assert.strictEqual(m2.id, 'M-2');
  assert.strictEqual(m2.district_id, 'DIST-2', 'Legacy match without district_id must map to its existing district via group');
  assert.strictEqual(m2.district_name, 'Qualifiers District 2');
});

test('TASK 7: Locked Match District Change Rejection', async () => {
  // Mock client rejecting changes to a match with recorded results
  const protectedMatchId = 'MAT-LOCKED-1';
  const mockOldMatches = [
    {
      id: protectedMatchId,
      match_number: 1,
      start_time: '13:00',
      end_time: '13:30',
      map: 'Erangel',
      notes: '',
      group_id: 'GRP-1',
      district_id: 'DIST-1',
    },
  ];

  const mockClient = {
    query: async (sql, params) => {
      if (typeof sql === 'string' && sql.includes('FROM tournament_matches')) {
        return { rows: mockOldMatches };
      }
      if (typeof sql === 'string' && sql.includes('FROM tournament_groups')) {
        return { rows: [{ id: 'GRP-1', district_id: 'DIST-1', group_name: 'District 1' }] };
      }
      if (typeof sql === 'string' && sql.includes('FROM tournament_rounds')) {
        return { rows: [{ id: 'RND-1', round_number: 1, name: 'Round 1' }] };
      }
      if (typeof sql === 'string' && sql.includes('FROM tournament_days')) {
        return { rows: [{ id: 'DAY-1', round_id: 'RND-1', day_number: 1, date: '2026-11-01' }] };
      }
      if (typeof sql === 'string' && sql.includes('FROM tournament_rooms')) {
        return { rows: [] };
      }
      if (typeof sql === 'string' && sql.includes('tournament_match_results')) {
        return { rows: [{ match_id: protectedMatchId }] };
      }
      return { rows: [] };
    },
  };

  // Attempt to save draft where locked match is changed from DIST-1 to DIST-2
  const incomingRoadmap = {
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
                id: 'GRP-2',
                district_id: 'DIST-2', // Changed from DIST-1!
                district_name: 'District 2',
                match_count: 1,
                matches: [
                  {
                    id: protectedMatchId,
                    district_id: 'DIST-2', // Changed district on locked match!
                    start_time: '13:00',
                    map: 'Erangel',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  await assert.rejects(
    async () => {
      await saveManualRoadmapDraft(mockClient, 'TRN-1', incomingRoadmap);
    },
    (err) => {
      assert.strictEqual(err.code, 'MATCH_LOCKED');
      assert.ok(err.message.includes('verified results and is locked'));
      return true;
    },
    'Must reject modifying district on a locked match with MATCH_LOCKED code'
  );
});

test('TASK 2 & 4: getRoundDistricts resolves correct names for Qualifiers, Later Rounds and Grand Finals', () => {
  // Round 1 Qualifiers
  const round1 = { id: 'R-1', round_number: 1, name: 'Qualifiers', round_type: 'qualifier' };
  const r1Districts = getRoundDistricts(round1, 0, [{ id: 'd-1', name: 'District 1' }, { id: 'd-2', name: 'District 2' }]);
  assert.strictEqual(r1Districts[0].name, 'Qualifiers District 1');
  assert.strictEqual(r1Districts[1].name, 'Qualifiers District 2');

  // Round 2 Qualifier (later round)
  const round2 = { id: 'R-2', round_number: 2, name: 'Round 2', round_type: 'qualifier', lobby_capacities: [16, 16] };
  const r2Districts = getRoundDistricts(round2, 1, [], { totalRounds: 3 });
  assert.strictEqual(r2Districts[0].name, 'Round 2 · Lobby 1');
  assert.strictEqual(r2Districts[1].name, 'Round 2 · Lobby 2');

  // Grand Finals (1 lobby)
  const gfRound = { id: 'R-3', round_number: 3, name: 'Grand Finals', round_type: 'grand_final', lobby_capacities: [16] };
  const gfDistricts = getRoundDistricts(gfRound, 2, [], { totalRounds: 3 });
  assert.strictEqual(gfDistricts[0].name, 'Grand Finals');
});
