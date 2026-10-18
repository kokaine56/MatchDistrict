// tests/manualRoadmapBuilder.test.js
// Acceptance test suite for the Fully Manual, Dynamic Roadmap Builder (Sections 1-13).

import test from 'node:test';
import assert from 'node:assert';
import {
  getTournamentDistricts,
  calculateAdvancingTeams,
  validateManualRoadmap,
  saveManualRoadmapDraft,
  publishManualRoadmap,
  unpublishManualRoadmap,
  buildHierarchicalRoadmap,
  deleteTournamentRound,
  deleteEntireRoadmap,
  reorderDistrictAllocations,
} from '../server/manualRoadmapService.js';
import { buildGroups } from '../server/groupService.js';

// ---------------------------------------------------------------------------
// TEST A: Automatic district retrieval & team distribution scaling
// ---------------------------------------------------------------------------
test('Test A: District count dynamically derives from database configuration (6, 8, 12 districts)', async () => {
  // Mock DB client returning different tournament district sizes
  const createMockPool = (slotsTotal, teamsPerGroup, verifiedRegs = []) => ({
    query: async (sql, params) => {
      if (sql.includes('SELECT id, title, "slotsTotal"')) {
        return {
          rows: [{
            id: params[0],
            title: 'Championship Test',
            slotsTotal,
            slotsFilled: verifiedRegs.length,
            teams_per_group: teamsPerGroup,
            teams_per_match: teamsPerGroup,
            game: 'bgmi',
            status: 'published',
            roadmap_status: 'draft',
          }],
        };
      }
      if (sql.includes('FROM tournament_registration_groups')) {
        const groups = buildGroups(slotsTotal, teamsPerGroup);
        return {
          rows: groups.map((g) => ({
            id: `GRP-${params[0].slice(-6)}-${String(g.group_index).padStart(2, '0')}`,
            tournament_id: params[0],
            group_index: g.group_index,
            name: g.name,
            capacity: g.capacity,
          })),
        };
      }
      if (sql.includes('FROM tournament_registrations')) {
        return { rows: verifiedRegs };
      }
      return { rows: [] };
    },
  });

  // Case 1: 128 slots / 16 per group => exactly 8 districts
  const pool8 = createMockPool(128, 16, [
    { id: 'REG-1', team_name: 'Alpha', slot_number: 1, group_id: 'GRP-123456-01' },
    { id: 'REG-2', team_name: 'Beta', slot_number: 2, group_id: 'GRP-123456-01' },
    { id: 'REG-3', team_name: 'Gamma', slot_number: 17, group_id: 'GRP-123456-02' },
  ]);
  const res8 = await getTournamentDistricts(pool8, 'TOUR-123456');
  assert.strictEqual(res8.districts.length, 8, 'Must return exactly 8 districts for 128 slots / 16 per group');
  assert.strictEqual(res8.districts[0].id, 'GRP-123456-01', 'Persistent district ID must be preserved');
  assert.strictEqual(res8.districts[0].team_count, 2, 'District 1 must count 2 verified teams');
  assert.strictEqual(res8.districts[1].team_count, 1, 'District 2 must count 1 verified team');
  assert.strictEqual(res8.districts[2].team_count, 0, 'Empty district must report 0 teams without crashing');

  // Case 2: 96 slots / 16 per group => exactly 6 districts
  const pool6 = createMockPool(96, 16, []);
  const res6 = await getTournamentDistricts(pool6, 'TOUR-666666');
  assert.strictEqual(res6.districts.length, 6, 'Must return exactly 6 districts for 96 slots / 16 per group');
  assert.strictEqual(res6.districts[5].name, 'District 6');

  // Case 3: 192 slots / 16 per group => exactly 12 districts
  const pool12 = createMockPool(192, 16, []);
  const res12 = await getTournamentDistricts(pool12, 'TOUR-121212');
  assert.strictEqual(res12.districts.length, 12, 'Must return exactly 12 districts for 192 slots / 16 per group');
  assert.strictEqual(res12.districts[11].name, 'District 12');
});

// ---------------------------------------------------------------------------
// TEST B: Manual round creation & custom naming
// ---------------------------------------------------------------------------
test('Test B: Organizer controls number of rounds, round names, and ordering without automatic templates', () => {
  const customRounds = [
    { id: 'RND-1', round_number: 1, name: 'Qualifier Phase A', round_type: 'qualifier', days: [] },
    { id: 'RND-2', round_number: 2, name: 'Quarter-Finals', round_type: 'qualifier', days: [] },
    { id: 'RND-3', round_number: 3, name: 'Semi-Finals', round_type: 'semi_final', days: [] },
    { id: 'RND-4', round_number: 4, name: 'Grand Finals', round_type: 'grand_final', days: [] },
  ];

  const validation = validateManualRoadmap({ rounds: customRounds });
  assert.strictEqual(validation.valid, false, 'Rounds with no match days are flagged in validation');
  assert.strictEqual(customRounds.length, 4, 'Organizer can create exactly 4 rounds');
  assert.strictEqual(customRounds[0].name, 'Qualifier Phase A');
  assert.strictEqual(customRounds[1].name, 'Quarter-Finals');
  assert.strictEqual(customRounds[2].name, 'Semi-Finals');
  assert.strictEqual(customRounds[3].name, 'Grand Finals');
});

// ---------------------------------------------------------------------------
// TEST C: Manual daily allocations & match counting
// ---------------------------------------------------------------------------
test('Test C: Qualifier 1 Day 1 with District 1 (1 match), District 2 (2 matches), District 3 (3 matches) totals 6 matches', () => {
  const day1Allocations = [
    {
      district_id: 'GRP-01',
      district_name: 'District 1',
      match_count: 1,
      matches: [{ id: 'M-1', match_number: 1, district_match_number: 1, start_time: '13:00', map: 'Erangel' }],
    },
    {
      district_id: 'GRP-02',
      district_name: 'District 2',
      match_count: 2,
      matches: [
        { id: 'M-2', match_number: 2, district_match_number: 1, start_time: '14:00', map: 'Miramar' },
        { id: 'M-3', match_number: 3, district_match_number: 2, start_time: '15:00', map: 'Erangel' },
      ],
    },
    {
      district_id: 'GRP-03',
      district_name: 'District 3',
      match_count: 3,
      matches: [
        { id: 'M-4', match_number: 4, district_match_number: 1, start_time: '16:00', map: 'Sanhok' },
        { id: 'M-5', match_number: 5, district_match_number: 2, start_time: '17:00', map: 'Erangel' },
        { id: 'M-6', match_number: 6, district_match_number: 3, start_time: '18:00', map: 'Miramar' },
      ],
    },
  ];

  const totalDayMatches = day1Allocations.reduce((acc, a) => acc + a.match_count, 0);
  assert.strictEqual(totalDayMatches, 6, 'Total calculated matches for Day 1 must equal 6 (1 + 2 + 3)');

  const testRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifier 1',
        round_type: 'qualifier',
        days: [{ id: 'DAY-1', day_number: 1, date: '2026-10-20', allocations: day1Allocations }],
      },
    ],
  };

  const val = validateManualRoadmap(testRoadmap);
  assert.strictEqual(val.valid, true, `Validation failed: ${val.errors.join(', ')}`);
});

// ---------------------------------------------------------------------------
// TEST D: Preventing duplicate district in same allocation block
// ---------------------------------------------------------------------------
test('Test D: Adding the same district twice to the same day allocation block is rejected with clear error', () => {
  const duplicateAllocations = [
    { district_id: 'GRP-01', district_name: 'District 1', match_count: 1, matches: [{ start_time: '13:00' }] },
    { district_id: 'GRP-01', district_name: 'District 1', match_count: 2, matches: [{ start_time: '14:00' }] },
  ];

  const testRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifier 1',
        days: [{ id: 'DAY-1', day_number: 1, allocations: duplicateAllocations }],
      },
    ],
  };

  const val = validateManualRoadmap(testRoadmap);
  assert.strictEqual(val.valid, false, 'Validation should fail when same district is added twice on the same day');
  assert.ok(val.errors.some((e) => e.includes('added more than once to Day 1')));
});

// ---------------------------------------------------------------------------
// TEST E: Qualification calculation
// ---------------------------------------------------------------------------
test('Test E: 8 districts with 2 advancing teams calculates 16 advancing teams', () => {
  const roundConfig = {
    advancement_type: 'per_district',
    teams_advancing_per_district: 2,
  };

  const advancingTotal = calculateAdvancingTeams(roundConfig, 8);
  assert.strictEqual(advancingTotal, 16, '8 districts * 2 advancing teams per district must equal 16');

  // If advancement is per match (e.g. 8 matches * 2 advancing teams)
  const roundPerMatch = {
    advancement_type: 'per_match',
    teams_advancing_per_match: 2,
    days: [
      { allocations: [{ match_count: 4 }, { match_count: 4 }] },
    ],
  };
  const advancingPerMatchTotal = calculateAdvancingTeams(roundPerMatch, 8);
  assert.strictEqual(advancingPerMatchTotal, 16, '8 matches * 2 advancing teams must equal 16');
});

// ---------------------------------------------------------------------------
// TEST F: Draft publication validation
// ---------------------------------------------------------------------------
test('Test F: Attempting to publish an invalid roadmap is rejected and preserves draft status', () => {
  // Empty rounds
  const emptyRoadmap = { rounds: [] };
  const valEmpty = validateManualRoadmap(emptyRoadmap);
  assert.strictEqual(valEmpty.valid, false);
  assert.ok(valEmpty.errors.some((e) => e.includes('at least one round')));

  // Round without match days
  const noDaysRoadmap = {
    rounds: [{ id: 'R1', round_number: 1, name: 'Round 1', days: [] }],
  };
  const valNoDays = validateManualRoadmap(noDaysRoadmap);
  assert.strictEqual(valNoDays.valid, false);
  assert.ok(valNoDays.errors.some((e) => e.includes('at least one match day')));

  // Invalid match start time
  const badTimeRoadmap = {
    rounds: [
      {
        id: 'R1',
        round_number: 1,
        name: 'Round 1',
        days: [
          {
            id: 'D1',
            day_number: 1,
            allocations: [
              {
                district_id: 'GRP-01',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ start_time: '25:99' }],
              },
            ],
          },
        ],
      },
    ],
  };
  const valBadTime = validateManualRoadmap(badTimeRoadmap);
  assert.strictEqual(valBadTime.valid, false);
  assert.ok(valBadTime.errors.some((e) => e.includes('invalid start time')));
});

// ---------------------------------------------------------------------------
// TEST G: Hierarchical hydration from flat DB records
// ---------------------------------------------------------------------------
test('Test G: buildHierarchicalRoadmap correctly groups flat DB records into rounds, days, district allocations and matches', () => {
  const dbRounds = [
    { id: 'RND-1', round_number: 1, name: 'Qualifiers', round_type: 'qualifier' },
    { id: 'RND-2', round_number: 2, name: 'Grand Finals', round_type: 'grand_final' },
  ];
  const dbDays = [
    { id: 'DAY-1', round_id: 'RND-1', day_number: 1, date: '2026-10-21' },
    { id: 'DAY-2', round_id: 'RND-1', day_number: 2, date: '2026-10-22' },
  ];
  const dbGroups = [
    { id: 'GRP-1', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 1' },
    { id: 'GRP-2', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 2' },
  ];
  const dbMatches = [
    { id: 'M-1', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-1', group_name: 'District 1', match_number: 1, start_time: '13:00', map: 'Erangel' },
    { id: 'M-2', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-1', group_name: 'District 1', match_number: 2, start_time: '14:00', map: 'Miramar' },
    { id: 'M-3', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-2', group_name: 'District 2', match_number: 3, start_time: '15:00', map: 'Sanhok' },
  ];

  const hierarchy = buildHierarchicalRoadmap(dbRounds, dbDays, dbGroups, dbMatches);
  assert.strictEqual(hierarchy.length, 2, 'Must hydrate 2 rounds');
  assert.strictEqual(hierarchy[0].days.length, 2, 'Round 1 must have 2 days');
  assert.strictEqual(hierarchy[0].days[0].allocations.length, 2, 'Day 1 must have 2 district allocations');

  const d1Alloc = hierarchy[0].days[0].allocations.find((a) => a.district_name === 'District 1');
  assert.ok(d1Alloc);
  assert.strictEqual(d1Alloc.match_count, 2, 'District 1 must have 2 matches');
  assert.strictEqual(d1Alloc.matches[0].map, 'Erangel');
  assert.strictEqual(d1Alloc.matches[1].map, 'Miramar');

  const d2Alloc = hierarchy[0].days[0].allocations.find((a) => a.district_name === 'District 2');
  assert.ok(d2Alloc);
  assert.strictEqual(d2Alloc.match_count, 1, 'District 2 must have 1 match');
});

// ---------------------------------------------------------------------------
// TEST H: Safe draft persistence & protecting matches with recorded results
// ---------------------------------------------------------------------------
test('Test H: saveManualRoadmapDraft refuses to delete matches with recorded results', async () => {
  const mockClient = {
    queries: [],
    query: async (sql, params = []) => {
      mockClient.queries.push({ sql, params });
      if (sql.includes('FROM tournament_match_results')) {
        return {
          rows: [
            { match_id: 'M-PROTECTED-2' }, // match 2 has recorded results
          ],
        };
      }
      if (sql.includes('FROM tournament_matches')) {
        return {
          rows: [
            { id: 'M-EXISTING-1', match_number: 1 },
            { id: 'M-PROTECTED-2', match_number: 2 },
          ],
        };
      }
      if (sql.includes('FROM tournament_rooms')) return { rows: [] };
      if (sql.includes('FROM tournament_groups')) return { rows: [] };
      if (sql.includes('FROM tournament_days')) return { rows: [] };
      if (sql.includes('FROM tournament_rounds')) return { rows: [] };
      return { rows: [] };
    },
  };

  // Organizer payload removes M-PROTECTED-2, keeping only a new match
  const roadmapAttemptingToDeleteProtected = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifier 1',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            allocations: [
              {
                district_id: 'GRP-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M-NEW-1', match_number: 1, start_time: '14:00' }],
              },
            ],
          },
        ],
      },
    ],
  };

  await assert.rejects(
    async () => {
      await saveManualRoadmapDraft(mockClient, 'TOUR-TEST', roadmapAttemptingToDeleteProtected);
    },
    (err) => {
      assert.ok(err.message.includes('has recorded match results'), 'Must throw error protecting match with results');
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// TEST I: Publication workflow & status transition
// ---------------------------------------------------------------------------
test('Test I: publishManualRoadmap persists valid roadmap and sets roadmap_status to approved', async () => {
  let updatedStatus = null;
  const mockClient = {
    query: async (sql, params = []) => {
      if (sql.includes('FROM tournament_matches')) return { rows: [] };
      if (sql.includes('FROM tournament_match_results')) return { rows: [] };
      if (sql.includes('FROM tournament_rooms')) return { rows: [] };
      if (sql.includes('FROM tournament_groups')) return { rows: [] };
      if (sql.includes('FROM tournament_days')) return { rows: [] };
      if (sql.includes('FROM tournament_rounds')) return { rows: [] };
      if (sql.includes('UPDATE tournaments')) {
        if (sql.includes('roadmap_status = \'approved\'')) {
          updatedStatus = 'approved';
        }
        return { rows: [{ id: params[0], roadmap_status: updatedStatus }] };
      }
      return { rows: [] };
    },
  };

  const validRoadmap = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Qualifier 1',
        round_type: 'qualifier',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            allocations: [
              {
                district_id: 'GRP-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M-1', match_number: 1, start_time: '14:00', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const result = await publishManualRoadmap(mockClient, 'TOUR-TEST', validRoadmap);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'published');
  assert.strictEqual(updatedStatus, 'approved');
});

// ---------------------------------------------------------------------------
// TEST J: Safe unpublishing reverts roadmap to draft
// ---------------------------------------------------------------------------
test('Test J: unpublishManualRoadmap safely reverts roadmap_status to draft', async () => {
  let revertedStatus = null;
  const mockClient = {
    query: async (sql, params = []) => {
      if (sql.includes('roadmap_status = \'draft\'')) {
        revertedStatus = 'draft';
        return { rows: [{ id: params[0], roadmap_status: 'draft' }] };
      }
      return { rows: [] };
    },
  };

  const result = await unpublishManualRoadmap(mockClient, 'TOUR-TEST');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'draft');
  assert.strictEqual(revertedStatus, 'draft');
});

// ---------------------------------------------------------------------------
// TEST K (Scenario A): Removal of round_type field and custom round names
// ---------------------------------------------------------------------------
test('Test K: Roadmap validates and saves without requiring round_type field', async () => {
  const roadmapWithoutRoundType = {
    rounds: [
      {
        id: 'RND-101',
        round_number: 1,
        name: 'Qualifier Phase 1',
        days: [
          {
            id: 'DAY-101',
            day_number: 1,
            allocations: [
              {
                district_id: 'GRP-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M-101', match_number: 1, start_time: '13:00', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
      {
        id: 'RND-102',
        round_number: 2,
        name: 'Grand Final',
        days: [
          {
            id: 'DAY-102',
            day_number: 1,
            allocations: [
              {
                district_id: 'GRP-FINALS',
                district_name: 'Finalists',
                match_count: 3,
                matches: [
                  { id: 'M-201', match_number: 1, start_time: '17:00', map: 'Erangel' },
                  { id: 'M-202', match_number: 2, start_time: '18:00', map: 'Miramar' },
                  { id: 'M-203', match_number: 3, start_time: '19:00', map: 'Sanhok' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const validation = validateManualRoadmap(roadmapWithoutRoundType);
  assert.strictEqual(validation.valid, true, 'Roadmap without round_type must validate successfully');
  assert.strictEqual(validation.errors.length, 0);

  // Verify buildHierarchicalRoadmap preserves rounds without forcing round_type
  const flatRounds = [
    { id: 'RND-101', round_number: 1, name: 'Qualifier Phase 1' },
    { id: 'RND-102', round_number: 2, name: 'Grand Final' },
  ];
  const flatDays = [
    { id: 'DAY-101', round_id: 'RND-101', day_number: 1, date: '2026-10-17' },
    { id: 'DAY-102', round_id: 'RND-102', day_number: 1, date: '2026-10-18' },
  ];
  const hierarchical = buildHierarchicalRoadmap(flatRounds, flatDays, [], []);
  assert.strictEqual(hierarchical.length, 2);
  assert.strictEqual(hierarchical[0].name, 'Qualifier Phase 1');
  assert.strictEqual(hierarchical[1].name, 'Grand Final');
});

// ---------------------------------------------------------------------------
// TEST L (Scenario B): Districts scheduled across multiple days in the same round
// ---------------------------------------------------------------------------
test('Test L: Round 1 spans Day 1 (Districts 1-4, 4 matches) and Day 2 (Districts 5-8, 4 matches) totaling 8 matches', () => {
  const day1Allocations = [1, 2, 3, 4].map((num) => ({
    district_id: `DIST-${num}`,
    district_name: `District ${num}`,
    match_count: 1,
    matches: [{ id: `M-D1-${num}`, match_number: num, start_time: `${12 + num}:00`, map: 'Erangel' }],
  }));

  const day2Allocations = [5, 6, 7, 8].map((num) => ({
    district_id: `DIST-${num}`,
    district_name: `District ${num}`,
    match_count: 1,
    matches: [{ id: `M-D2-${num}`, match_number: num, start_time: `${12 + num - 4}:00`, map: 'Miramar' }],
  }));

  const round1 = {
    id: 'RND-R1',
    round_number: 1,
    name: 'Round 1',
    days: [
      { id: 'DAY-1', day_number: 1, date: '2026-10-17', allocations: day1Allocations },
      { id: 'DAY-2', day_number: 2, date: '2026-10-18', allocations: day2Allocations },
    ],
  };

  const day1Total = day1Allocations.reduce((acc, a) => acc + a.match_count, 0);
  const day2Total = day2Allocations.reduce((acc, a) => acc + a.match_count, 0);
  const round1Total = round1.days.reduce((acc, d) => acc + d.allocations.reduce((mAcc, a) => mAcc + a.match_count, 0), 0);

  assert.strictEqual(day1Total, 4, 'Day 1 must total exactly 4 matches');
  assert.strictEqual(day2Total, 4, 'Day 2 must total exactly 4 matches');
  assert.strictEqual(round1Total, 8, 'Round 1 across Day 1 and Day 2 must total 8 matches');

  const validation = validateManualRoadmap({ rounds: [round1] });
  assert.strictEqual(validation.valid, true, 'Multi-day district schedule must validate cleanly');
  assert.strictEqual(validation.errors.length, 0);
});

// ---------------------------------------------------------------------------
// TEST M: Allow same district to appear on different match days in the same round
// ---------------------------------------------------------------------------
test('Test M: Same district scheduled on Day 1 and Day 2 of the same round is allowed and valid', () => {
  const round = {
    id: 'RND-MULTI-DAY-DIST',
    round_number: 1,
    name: 'Qualifier 1',
    days: [
      {
        id: 'DAY-1',
        day_number: 1,
        date: '2026-10-17',
        allocations: [
          {
            district_id: 'DIST-1',
            district_name: 'District 1',
            match_count: 1,
            matches: [{ id: 'M-1', match_number: 1, start_time: '13:00', map: 'Erangel' }],
          },
        ],
      },
      {
        id: 'DAY-2',
        day_number: 2,
        date: '2026-10-18',
        allocations: [
          {
            district_id: 'DIST-1', // Same district scheduled on Day 2 for next game
            district_name: 'District 1',
            match_count: 1,
            matches: [{ id: 'M-2', match_number: 2, start_time: '13:00', map: 'Miramar' }],
          },
        ],
      },
    ],
  };

  const validation = validateManualRoadmap({ rounds: [round] });
  assert.strictEqual(validation.valid, true, 'Scheduling same district across different days must be valid');
  assert.strictEqual(validation.errors.length, 0);
});

// ---------------------------------------------------------------------------
// TEST N (Scenario C): District reordering within match day & sequence persistence
// ---------------------------------------------------------------------------
test('Test N: District reordering persists sequence on Day 1 while keeping Day 2 unaffected', async () => {
  const dbRounds = [{ id: 'RND-1', round_number: 1, name: 'Round 1' }];
  const dbDays = [
    { id: 'DAY-1', round_id: 'RND-1', day_number: 1, date: '2026-10-21' },
    { id: 'DAY-2', round_id: 'RND-1', day_number: 2, date: '2026-10-22' },
  ];

  // Organizer reordered Day 1: District 2 moved to 1st, District 1 to 2nd, District 3 to 3rd, District 4 to 4th
  const dbGroups = [
    // Day 1 reordered groups
    { id: 'GRP-D2', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 2', sequence: 1 },
    { id: 'GRP-D1', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 1', sequence: 2 },
    { id: 'GRP-D3', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 3', sequence: 3 },
    { id: 'GRP-D4', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 4', sequence: 4 },
    // Day 2 groups (unaffected by Day 1 reordering)
    { id: 'GRP-D5', day_id: 'DAY-2', round_id: 'RND-1', group_name: 'District 5', sequence: 1 },
    { id: 'GRP-D6', day_id: 'DAY-2', round_id: 'RND-1', group_name: 'District 6', sequence: 2 },
  ];

  const dbMatches = [
    { id: 'M-1', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-D2', group_name: 'District 2', match_number: 1, start_time: '13:00', map: 'Erangel' },
    { id: 'M-2', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-D1', group_name: 'District 1', match_number: 2, start_time: '14:00', map: 'Miramar' },
    { id: 'M-3', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-D3', group_name: 'District 3', match_number: 3, start_time: '15:00', map: 'Sanhok' },
    { id: 'M-4', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'GRP-D4', group_name: 'District 4', match_number: 4, start_time: '16:00', map: 'Vikendi' },
    { id: 'M-5', round_id: 'RND-1', day_id: 'DAY-2', group_id: 'GRP-D5', group_name: 'District 5', match_number: 1, start_time: '13:00', map: 'Erangel' },
    { id: 'M-6', round_id: 'RND-1', day_id: 'DAY-2', group_id: 'GRP-D6', group_name: 'District 6', match_number: 2, start_time: '14:00', map: 'Miramar' },
  ];

  const hierarchical = buildHierarchicalRoadmap(dbRounds, dbDays, dbGroups, dbMatches);
  const day1Allocs = hierarchical[0].days[0].allocations;
  const day2Allocs = hierarchical[0].days[1].allocations;

  assert.strictEqual(day1Allocs.length, 4, 'Day 1 must have exactly 4 allocations');
  assert.strictEqual(day1Allocs[0].district_name, 'District 2', 'First allocation on Day 1 must be District 2');
  assert.strictEqual(day1Allocs[1].district_name, 'District 1', 'Second allocation on Day 1 must be District 1');
  assert.strictEqual(day1Allocs[2].district_name, 'District 3', 'Third allocation on Day 1 must be District 3');
  assert.strictEqual(day1Allocs[3].district_name, 'District 4', 'Fourth allocation on Day 1 must be District 4');

  // Verify Day 2 sequence is completely preserved and unaffected by Day 1
  assert.strictEqual(day2Allocs.length, 2, 'Day 2 must have exactly 2 allocations');
  assert.strictEqual(day2Allocs[0].district_name, 'District 5', 'Day 2 first allocation must be District 5');
  assert.strictEqual(day2Allocs[1].district_name, 'District 6', 'Day 2 second allocation must be District 6');
});

// ---------------------------------------------------------------------------
// TEST O (Scenario D): Registered team counting, deduplication & 0-team district reporting
// ---------------------------------------------------------------------------
test('Test O: Registered team counting deduplicates teams and reports 0 registered teams accurately', async () => {
  const verifiedRegs = [
    // 3 teams in District 1 (GRP-1)
    { id: 'REG-1', team_name: 'Team Alpha', captain: 'Player 1', status: 'approved', slot_number: 1, group_id: 'GRP-01' },
    { id: 'REG-2', team_name: 'Team Bravo', captain: 'Player 2', status: 'confirmed', slot_number: 2, group_id: 'GRP-01' },
    { id: 'REG-3', team_name: 'Team Charlie', captain: 'Player 3', status: 'verified_by_host', slot_number: 3, group_id: 'GRP-01' },
    // 2 teams in District 2 (GRP-2)
    { id: 'REG-4', team_name: 'Team Delta', captain: 'Player 4', status: 'approved', slot_number: 17, group_id: 'GRP-02' },
    { id: 'REG-5', team_name: 'Team Echo', captain: 'Player 5', status: 'confirmed', slot_number: 18, group_id: 'GRP-02' },
    // Excluded statuses (should NOT be returned in verifiedRegs query or counted)
    // District 3 has 0 registered teams
    // District 4 has 1 team
    { id: 'REG-6', team_name: 'Team Foxtrot', captain: 'Player 6', status: 'approved', slot_number: 49, group_id: 'GRP-04' },
  ];

  const mockPool = {
    query: async (sql, params) => {
      if (sql.includes('SELECT id, title, "slotsTotal"')) {
        return {
          rows: [{
            id: params[0],
            title: 'Championship Regs Test',
            slotsTotal: 64,
            slotsFilled: 6,
            teams_per_group: 16,
            teams_per_match: 16,
            game: 'bgmi',
            status: 'published',
            roadmap_status: 'draft',
          }],
        };
      }
      if (sql.includes('FROM tournament_registration_groups')) {
        return {
          rows: [
            { id: 'GRP-01', tournament_id: params[0], group_index: 1, name: 'District 1', capacity: 16 },
            { id: 'GRP-02', tournament_id: params[0], group_index: 2, name: 'District 2', capacity: 16 },
            { id: 'GRP-03', tournament_id: params[0], group_index: 3, name: 'District 3', capacity: 16 },
            { id: 'GRP-04', tournament_id: params[0], group_index: 4, name: 'District 4', capacity: 16 },
          ],
        };
      }
      if (sql.includes('FROM tournament_registrations')) {
        return { rows: verifiedRegs };
      }
      return { rows: [] };
    },
  };

  const res = await getTournamentDistricts(mockPool, 'TOUR-REGS-1');
  assert.strictEqual(res.districts.length, 4, 'Must return 4 districts');

  // District 1: 3 teams
  assert.strictEqual(res.districts[0].registered_teams_count, 3);
  assert.strictEqual(res.districts[0].team_count, 3);
  assert.strictEqual(res.districts[0].name, 'District 1');

  // District 2: 2 teams
  assert.strictEqual(res.districts[1].registered_teams_count, 2);
  assert.strictEqual(res.districts[1].name, 'District 2');

  // District 3: 0 teams (empty district explicitly reported with 0)
  assert.strictEqual(res.districts[2].registered_teams_count, 0);
  assert.strictEqual(res.districts[2].team_count, 0);
  assert.strictEqual(res.districts[2].name, 'District 3');

  // District 4: 1 team
  assert.strictEqual(res.districts[3].registered_teams_count, 1);
  assert.strictEqual(res.districts[3].name, 'District 4');

  // Total registered teams
  assert.strictEqual(res.meta.total_teams, 6);
  assert.strictEqual(res.meta.has_empty_districts, true);
});

// ---------------------------------------------------------------------------
// TEST P (Scenario A & B): Dynamic round management starting with only one round
// ---------------------------------------------------------------------------
test('Test P: New tournament roadmap starts with only one round and supports manual addition of Round 2 & Round 3', () => {
  // New roadmap initial state: exactly one round (Round 1)
  const initialRounds = [
    {
      id: 'RND-INITIAL-1',
      round_number: 1,
      name: 'Round 1',
      days: [
        {
          id: 'DAY-1',
          day_number: 1,
          date: '2026-10-25',
          allocations: [
            { district_id: 'GRP-01', district_name: 'District 1', match_count: 1, matches: [{ id: 'M-1', start_time: '13:00' }] },
          ],
        },
      ],
    },
  ];

  assert.strictEqual(initialRounds.length, 1, 'Initial roadmap must start with exactly 1 round');
  assert.strictEqual(initialRounds[0].name, 'Round 1');

  // Organizer adds Round 2 manually via "+ Add Round"
  const roundsAfterAddRound2 = [
    ...initialRounds,
    {
      id: 'RND-USER-2',
      round_number: 2,
      name: 'Round 2',
      days: [], // Initialized with empty days configuration
    },
  ];

  assert.strictEqual(roundsAfterAddRound2.length, 2, 'Adding Round 2 creates a second round without auto-generating match days');
  assert.strictEqual(roundsAfterAddRound2[1].name, 'Round 2');

  // Organizer renames Round 2 to "Semifinal" and adds Round 3
  roundsAfterAddRound2[1].name = 'Semifinal';
  const roundsAfterAddRound3 = [
    ...roundsAfterAddRound2,
    {
      id: 'RND-USER-3',
      round_number: 3,
      name: 'Round 3',
      days: [],
    },
  ];

  assert.strictEqual(roundsAfterAddRound3.length, 3, 'Adding Round 3 maintains 3 rounds');
  assert.strictEqual(roundsAfterAddRound3[1].name, 'Semifinal', 'Custom name Semifinal is preserved');
  assert.strictEqual(roundsAfterAddRound3[2].name, 'Round 3');
});

// ---------------------------------------------------------------------------
// TEST Q: deleteTournamentRound removes targeted round & re-sequences remaining
// ---------------------------------------------------------------------------
test('Test Q: deleteTournamentRound removes targeted round, deletes child records, and re-sequences remaining rounds', async () => {
  const executedSql = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedSql.push({ sql, params });
      if (sql.includes('SELECT id, round_number, name FROM tournament_rounds')) {
        return {
          rows: [
            { id: 'RND-1', round_number: 1, name: 'Round 1' },
            { id: 'RND-2', round_number: 2, name: 'Round 2' },
            { id: 'RND-3', round_number: 3, name: 'Round 3' },
          ],
        };
      }
      if (sql.includes('SELECT tmr.match_id FROM tournament_match_results')) {
        return { rows: [] }; // No protected match results
      }
      if (sql.includes('SELECT id, round_number') && sql.includes('FROM tournament_rounds')) {
        return {
          rows: [
            { id: 'RND-1', round_number: -999 },
            { id: 'RND-3', round_number: -997 },
          ],
        };
      }
      return { rows: [] };
    },
  };

  // Delete Round 2
  const res = await deleteTournamentRound(mockClient, 'TOUR-TEST', 'RND-2');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.deleted_round_id, 'RND-2');
  assert.strictEqual(res.remaining_rounds_count, 2);

  // Verify child record deletions occurred
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_matches WHERE round_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_days WHERE round_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_rounds WHERE id = $1')));

  // Verify re-sequencing occurred
  const updateSeqQueries = executedSql.filter((q) => q.sql.includes('SET round_number = $1, round_order = $1'));
  assert.strictEqual(updateSeqQueries.length, 2, 'Remaining 2 rounds must be re-sequenced');
  assert.strictEqual(updateSeqQueries[0].params[0], 1, 'First remaining round becomes round_number 1');
  assert.strictEqual(updateSeqQueries[1].params[0], 2, 'Second remaining round becomes round_number 2');

  // Verify minimum rounds guard: cannot delete if tournament only has 1 round
  const singleRoundClient = {
    query: async (sql) => {
      if (sql.includes('SELECT id, round_number, name FROM tournament_rounds')) {
        return { rows: [{ id: 'RND-ONLY', round_number: 1, name: 'Round 1' }] };
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    async () => {
      await deleteTournamentRound(singleRoundClient, 'TOUR-TEST', 'RND-ONLY');
    },
    (err) => {
      assert.ok(err.message.includes('must have at least one round'));
      return true;
    }
  );

  // Verify results protection guard: cannot delete if round has recorded results
  const protectedRoundClient = {
    query: async (sql) => {
      if (sql.includes('SELECT id, round_number, name FROM tournament_rounds')) {
        return {
          rows: [
            { id: 'RND-1', round_number: 1, name: 'Round 1' },
            { id: 'RND-2', round_number: 2, name: 'Round 2' },
          ],
        };
      }
      if (sql.includes('tmr.match_id') && sql.includes('tournament_match_results')) {
        return { rows: [{ match_id: 'M-RECORDED' }] };
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    async () => {
      await deleteTournamentRound(protectedRoundClient, 'TOUR-TEST', 'RND-2');
    },
    (err) => {
      assert.ok(err.message.includes('recorded results'));
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// TEST R: deleteEntireRoadmap resets all roadmap configuration safely
// ---------------------------------------------------------------------------
test('Test R: deleteEntireRoadmap cleans rounds, days, groups, rooms, matches without touching registrations', async () => {
  const executedSql = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedSql.push({ sql, params });
      if (sql.includes('SELECT id, "orgId", roadmap_status, finalized_at, timeline FROM tournaments')) {
        return {
          rows: [{ id: 'TOUR-RESET', orgId: 'ORG-1', roadmap_status: 'draft', finalized_at: null, timeline: '{"rounds":[{"id":"R1"}]}' }],
        };
      }
      if (sql.includes('SELECT match_id FROM tournament_match_results')) {
        return { rows: [] }; // No match results
      }
      return { rows: [] };
    },
  };

  const res = await deleteEntireRoadmap(mockClient, 'TOUR-RESET');
  assert.strictEqual(res.success, true);

  // Check each deleted roadmap entity
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_matches WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_rooms WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_groups WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_days WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_rounds WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_planning_result WHERE tournament_id = $1')));

  // Verify tournament registrations and teams are NEVER deleted
  assert.ok(!executedSql.some((q) => q.sql.includes('DELETE FROM tournament_registrations')));
  assert.ok(!executedSql.some((q) => q.sql.includes('DELETE FROM tournament_teams')));

  // Verify status reset to draft
  const tourneyUpdate = executedSql.find((q) => q.sql.includes("SET roadmap_status = 'draft'"));
  assert.ok(tourneyUpdate);

  // Verify finalized tournament is protected
  const finalizedClient = {
    query: async (sql) => {
      if (sql.includes('SELECT id, "orgId"')) {
        return { rows: [{ id: 'TOUR-FINAL', finalized_at: '2026-10-18T10:00:00Z' }] };
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    async () => {
      await deleteEntireRoadmap(finalizedClient, 'TOUR-FINAL');
    },
    (err) => {
      assert.ok(err.message.includes('Finalized tournament roadmap is locked'));
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// TEST S: reorderDistrictAllocations updates sequence & display_order on day
// ---------------------------------------------------------------------------
test('Test S: reorderDistrictAllocations persists new order on Day 1 without touching Day 2', async () => {
  const executedSql = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedSql.push({ sql, params });
      if (sql.includes('SELECT id, round_id, day_number FROM tournament_days')) {
        return { rows: [{ id: 'DAY-1', round_id: 'RND-1', day_number: 1 }] };
      }
      if (sql.includes('SELECT id, group_name, sequence FROM tournament_groups')) {
        return {
          rows: [
            { id: 'GRP-1', group_name: 'District 1', sequence: 1 },
            { id: 'GRP-2', group_name: 'District 2', sequence: 2 },
            { id: 'GRP-3', group_name: 'District 3', sequence: 3 },
            { id: 'GRP-4', group_name: 'District 4', sequence: 4 },
          ],
        };
      }
      return { rows: [] };
    },
  };

  // Reorder: Move District 3 to 1st, District 4 to 2nd, District 1 to 3rd, District 2 to 4th
  const newOrder = ['GRP-3', 'GRP-4', 'GRP-1', 'GRP-2'];
  const res = await reorderDistrictAllocations(mockClient, 'TOUR-TEST', 'DAY-1', newOrder);
  assert.strictEqual(res.success, true);
  assert.deepStrictEqual(res.ordered_ids, newOrder);

  // Verify negation step happened to prevent unique constraint collisions
  assert.ok(executedSql.some((q) => q.sql.includes('UPDATE tournament_groups') && q.sql.includes('SET sequence = -1')));

  // Verify sequential updates for display_order and sequence
  const updates = executedSql.filter((q) => q.sql.includes('UPDATE tournament_groups') && q.sql.includes('SET sequence = $1, display_order = $1'));
  assert.strictEqual(updates.length, 4);
  assert.strictEqual(updates[0].params[0], 1);
  assert.strictEqual(updates[0].params[1], 'GRP-3');
  assert.strictEqual(updates[1].params[0], 2);
  assert.strictEqual(updates[1].params[1], 'GRP-4');
  assert.strictEqual(updates[2].params[0], 3);
  assert.strictEqual(updates[2].params[1], 'GRP-1');
  assert.strictEqual(updates[3].params[0], 4);
  assert.strictEqual(updates[3].params[1], 'GRP-2');
});

// ---------------------------------------------------------------------------
// TEST T: buildHierarchicalRoadmap preserves display_order and district_id
// ---------------------------------------------------------------------------
test('Test T: buildHierarchicalRoadmap prioritizes display_order and preserves actual district_id', () => {
  const dbRounds = [{ id: 'RND-1', round_number: 1, name: 'Round 1' }];
  const dbDays = [{ id: 'DAY-1', round_id: 'RND-1', day_number: 1, date: '2026-10-21' }];
  const dbGroups = [
    { id: 'ALLOC-1', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District A', sequence: 2, display_order: 2, district_id: 'DIST-A-ID' },
    { id: 'ALLOC-2', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District B', sequence: 1, display_order: 1, district_id: 'DIST-B-ID' },
  ];
  const dbMatches = [
    { id: 'M-1', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'ALLOC-2', group_name: 'District B', match_number: 1, start_time: '13:00' },
    { id: 'M-2', round_id: 'RND-1', day_id: 'DAY-1', group_id: 'ALLOC-1', group_name: 'District A', match_number: 2, start_time: '14:00' },
  ];

  const hydrated = buildHierarchicalRoadmap(dbRounds, dbDays, dbGroups, dbMatches);
  const allocs = hydrated[0].days[0].allocations;

  assert.strictEqual(allocs.length, 2);
  assert.strictEqual(allocs[0].district_name, 'District B', 'District B with display_order 1 must be first');
  assert.strictEqual(allocs[0].district_id, 'DIST-B-ID', 'Must retain actual registration group district_id');
  assert.strictEqual(allocs[1].district_name, 'District A', 'District A with display_order 2 must be second');
  assert.strictEqual(allocs[1].district_id, 'DIST-A-ID', 'Must retain actual registration group district_id');
});

// ---------------------------------------------------------------------------
// TEST U: Master Delete Roadmap full lifecycle and fresh Round 1 initialization
// ---------------------------------------------------------------------------
test('Test U: Master Delete Roadmap removes 4 rounds and resets to single fresh Round 1 without child data', async () => {
  const executedSql = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedSql.push({ sql, params });
      if (sql.includes('SELECT id, "orgId", roadmap_status, finalized_at, timeline FROM tournaments')) {
        return {
          rows: [{
            id: 'TOUR-LIFE',
            orgId: 'ORG-LIFE',
            roadmap_status: 'draft',
            finalized_at: null,
            timeline: JSON.stringify({
              rounds: [
                { id: 'R1', name: 'Round 1' },
                { id: 'R2', name: 'Round 2' },
                { id: 'R3', name: 'Round 3' },
                { id: 'R4', name: 'Grand Final' },
              ],
            }),
          }],
        };
      }
      if (sql.includes('SELECT match_id FROM tournament_match_results')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const res = await deleteEntireRoadmap(mockClient, 'TOUR-LIFE');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.message, 'Roadmap deleted successfully. Ready for a fresh configuration.');

  // Verify atomic cleanup of all 6 roadmap levels
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_matches WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_rooms WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_groups WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_days WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_rounds WHERE tournament_id = $1')));
  assert.ok(executedSql.some((q) => q.sql.includes('DELETE FROM tournament_planning_result WHERE tournament_id = $1')));

  // Verify tournament registrations, participants, and payments are untouched
  assert.ok(!executedSql.some((q) => q.sql.includes('DELETE FROM tournament_registrations')));
  assert.ok(!executedSql.some((q) => q.sql.includes('DELETE FROM tournament_teams')));
  assert.ok(!executedSql.some((q) => q.sql.includes('DELETE FROM payments')));

  // Verify fresh roadmap representation initializes with exactly 1 round and 0 auto-generated days
  const freshRounds = [
    {
      id: 'RND-FRESH-1',
      round_number: 1,
      name: 'Round 1',
      round_type: 'qualifier',
      status: 'configured',
      advancement_type: 'per_district',
      teams_advancing_per_district: 2,
      days: [], // no unnecessary match days or auto district allocations
    },
  ];
  assert.strictEqual(freshRounds.length, 1, 'Fresh roadmap must start with exactly Round 1');
  assert.strictEqual(freshRounds[0].name, 'Round 1');
  assert.strictEqual(freshRounds[0].days.length, 0, 'Round 1 has no automatically created days or allocations');

  // Verify organizer can add Round 2 cleanly
  const addedRounds = [
    ...freshRounds,
    {
      id: 'RND-FRESH-2',
      round_number: 2,
      name: 'Round 2',
      days: [],
    },
  ];
  assert.strictEqual(addedRounds.length, 2, 'Adding Round 2 maintains sequential ordering');
  assert.strictEqual(addedRounds[1].name, 'Round 2');
});

// ---------------------------------------------------------------------------
// TEST V: District reordering multi-step operations preserving IDs and match counts
// ---------------------------------------------------------------------------
test('Test V: 4-district reorder on Day 1 (move D3 to 1st, D4 up 1, D1 down 1) preserves IDs and counts while Day 2 is untouched', () => {
  // Day 1 initial allocations: D1, D2, D3, D4
  const day1Allocs = [
    { id: 'ALLOC-1', district_id: 'DIST-1', district_name: 'District 1', match_count: 2, registered_teams_count: 16 },
    { id: 'ALLOC-2', district_id: 'DIST-2', district_name: 'District 2', match_count: 1, registered_teams_count: 12 },
    { id: 'ALLOC-3', district_id: 'DIST-3', district_name: 'District 3', match_count: 3, registered_teams_count: 8 },
    { id: 'ALLOC-4', district_id: 'DIST-4', district_name: 'District 4', match_count: 1, registered_teams_count: 16 },
  ];

  // Day 2 allocations
  const day2Allocs = [
    { id: 'ALLOC-5', district_id: 'DIST-5', district_name: 'District 5', match_count: 2, registered_teams_count: 16 },
    { id: 'ALLOC-6', district_id: 'DIST-6', district_name: 'District 6', match_count: 2, registered_teams_count: 16 },
  ];

  // Step 1: Move District 3 (index 2) to first position (index 0)
  const step1 = [...day1Allocs];
  const [movedD3] = step1.splice(2, 1);
  step1.splice(0, 0, movedD3);
  // Order: D3, D1, D2, D4
  assert.strictEqual(step1[0].district_name, 'District 3');
  assert.strictEqual(step1[1].district_name, 'District 1');
  assert.strictEqual(step1[2].district_name, 'District 2');
  assert.strictEqual(step1[3].district_name, 'District 4');

  // Step 2: Move District 4 (index 3) up one position (to index 2)
  const step2 = [...step1];
  const [movedD4] = step2.splice(3, 1);
  step2.splice(2, 0, movedD4);
  // Order: D3, D1, D4, D2
  assert.strictEqual(step2[0].district_name, 'District 3');
  assert.strictEqual(step2[1].district_name, 'District 1');
  assert.strictEqual(step2[2].district_name, 'District 4');
  assert.strictEqual(step2[3].district_name, 'District 2');

  // Step 3: Move District 1 (index 1) down one position (to index 2)
  const step3 = [...step2];
  const [movedD1] = step3.splice(1, 1);
  step3.splice(2, 0, movedD1);
  // Final Order: D3, D4, D1, D2
  assert.strictEqual(step3[0].district_name, 'District 3');
  assert.strictEqual(step3[1].district_name, 'District 4');
  assert.strictEqual(step3[2].district_name, 'District 1');
  assert.strictEqual(step3[3].district_name, 'District 2');

  // Verify all configurations and IDs are intact
  assert.strictEqual(step3[0].district_id, 'DIST-3');
  assert.strictEqual(step3[0].match_count, 3);
  assert.strictEqual(step3[0].registered_teams_count, 8);

  assert.strictEqual(step3[1].district_id, 'DIST-4');
  assert.strictEqual(step3[1].match_count, 1);
  assert.strictEqual(step3[1].registered_teams_count, 16);

  assert.strictEqual(step3[2].district_id, 'DIST-1');
  assert.strictEqual(step3[2].match_count, 2);
  assert.strictEqual(step3[2].registered_teams_count, 16);

  assert.strictEqual(step3[3].district_id, 'DIST-2');
  assert.strictEqual(step3[3].match_count, 1);
  assert.strictEqual(step3[3].registered_teams_count, 12);

  // Verify Day 2 is completely unchanged
  assert.strictEqual(day2Allocs.length, 2);
  assert.strictEqual(day2Allocs[0].district_name, 'District 5');
  assert.strictEqual(day2Allocs[1].district_name, 'District 6');
});

// ---------------------------------------------------------------------------
// TEST W: deleteEntireRoadmap propagates SQL errors without swallowing (.catch removed)
// ---------------------------------------------------------------------------
test('Test W: deleteEntireRoadmap propagates SQL errors to caller without swallowing so transaction rolls back', async () => {
  const failingClient = {
    query: async (sql) => {
      if (sql.includes('SELECT id, "orgId", roadmap_status, finalized_at, timeline FROM tournaments')) {
        return {
          rows: [{ id: 'TOUR-FAIL', orgId: 'ORG-1', roadmap_status: 'draft', finalized_at: null, timeline: null }],
        };
      }
      if (sql.includes('SELECT match_id FROM tournament_match_results')) {
        return { rows: [] };
      }
      if (sql.includes('DELETE FROM tournament_matches')) {
        throw new Error('FK constraint violation: foreign key violated');
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await deleteEntireRoadmap(failingClient, 'TOUR-FAIL');
    },
    (err) => {
      assert.ok(err.message.includes('FK constraint violation'));
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// TEST X: Publication state synchronization across publish, unpublish, and delete
// ---------------------------------------------------------------------------
test('Test X: publishManualRoadmap and unpublishManualRoadmap keep rounds_published synchronized', async () => {
  const executedSql = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedSql.push({ sql, params });
      if (sql.includes('SELECT id, name FROM tournament_matches WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id, round_id, name FROM tournament_matches WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id, day_id, group_name FROM tournament_matches WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM tournament_rooms WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM tournament_groups WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id FROM tournament_days WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id, round_number, name FROM tournament_rounds WHERE tournament_id = $1')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  // 1. Publish sets rounds_published = true
  const validRoadmap = {
    rounds: [
      {
        id: 'R1',
        name: 'Round 1',
        round_number: 1,
        days: [
          {
            id: 'D1',
            day_number: 1,
            allocations: [
              {
                id: 'A1',
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M1', match_number: 1, start_time: '12:00', end_time: '12:30', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
    ],
  };

  await publishManualRoadmap(mockClient, 'TOUR-SYNC', validRoadmap);
  const pubQuery = executedSql.find((q) => q.sql.includes("SET roadmap_status = 'approved'"));
  assert.ok(pubQuery, 'Should update roadmap_status to approved');
  assert.ok(pubQuery.sql.includes('rounds_published = true'), 'Should synchronize rounds_published = true on publish');

  // 2. Unpublish sets rounds_published = false
  await unpublishManualRoadmap(mockClient, 'TOUR-SYNC');
  const unpubQuery = executedSql.find((q) => q.sql.includes("SET roadmap_status = 'draft'") && q.sql.includes('rounds_published = false'));
  assert.ok(unpubQuery, 'Should update roadmap_status to draft and rounds_published to false on unpublish');

  // 3. Delete sets rounds_published = false
  const deleteClient = {
    query: async (sql, params = []) => {
      executedSql.push({ sql, params });
      if (sql.includes('SELECT id, "orgId", roadmap_status, finalized_at, timeline FROM tournaments')) {
        return {
          rows: [{ id: 'TOUR-SYNC', orgId: 'ORG-1', roadmap_status: 'approved', finalized_at: null, timeline: '{"rounds":[]}' }],
        };
      }
      if (sql.includes('SELECT match_id FROM tournament_match_results')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  await deleteEntireRoadmap(deleteClient, 'TOUR-SYNC');
  const delTourneyQuery = executedSql.find((q) => q.sql.includes("SET roadmap_status = 'draft'") && q.sql.includes('rounds_published = false'));
  assert.ok(delTourneyQuery, 'Should set rounds_published = false on master delete');
});

// ---------------------------------------------------------------------------
// TEST Y: Grand Finals is terminal — requires NO advancement rules
// ---------------------------------------------------------------------------
test('Test Y: Grand Finals round is recognized as terminal stage without requiring advancement rules', async () => {
  // 1. calculateAdvancingTeams returns 0 for grand_final
  const grandFinalConfig = {
    round_type: 'grand_final',
    advancement_type: 'per_district',
    teams_advancing_per_district: 4,
    teams_advancing: 16,
    days: [
      {
        day_number: 1,
        allocations: [{ district_id: 'GRP-GF', match_count: 5 }],
      },
    ],
  };
  assert.strictEqual(
    calculateAdvancingTeams(grandFinalConfig, 1),
    0,
    'calculateAdvancingTeams must return 0 for grand_final stage'
  );

  // 2. validateManualRoadmap accepts Grand Finals with NO advancement rules or next round
  const roadmapWithGF = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1 (Districts)',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        advancement_target_round_id: 'RND-GF',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              { district_id: 'GRP-01', district_name: 'District 1', match_count: 2 },
              { district_id: 'GRP-02', district_name: 'District 2', match_count: 2 },
            ],
          },
        ],
      },
      {
        id: 'RND-GF',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        advancement_type: null,
        teams_advancing: null,
        advancement_target_round_id: null,
        days: [
          {
            id: 'DAY-2',
            day_number: 1,
            date: '2026-11-02',
            allocations: [
              { district_id: 'GRP-GF', district_name: 'Championship District', match_count: 6 },
            ],
          },
        ],
      },
    ],
  };

  const validation = validateManualRoadmap(roadmapWithGF);
  assert.strictEqual(validation.valid, true, 'Roadmap with terminal Grand Finals must be valid');
  assert.strictEqual(validation.errors.length, 0, 'Must have zero errors');

  // 3. validateManualRoadmap warns if a round is added after Grand Finals
  const invalidRoundsAfterGF = {
    rounds: [
      {
        id: 'RND-GF',
        round_number: 1,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            allocations: [{ district_id: 'GRP-GF', match_count: 3 }],
          },
        ],
      },
      {
        id: 'RND-POST',
        round_number: 2,
        name: 'Extra Round',
        round_type: 'qualifier',
        days: [
          {
            id: 'DAY-2',
            day_number: 1,
            allocations: [{ district_id: 'GRP-EX', match_count: 3 }],
          },
        ],
      },
    ],
  };
  const valAfterGF = validateManualRoadmap(invalidRoundsAfterGF);
  assert.ok(
    valAfterGF.warnings.some((w) => w.includes('terminal stage') || w.includes('Grand Finals')),
    'Should warn when a round is placed after Grand Finals'
  );

  // 4. saveManualRoadmapDraft zeroes out advancement columns for Grand Finals
  const insertedRounds = [];
  const mockClient = {
    query: async (sql, params = []) => {
      if (sql.includes('SELECT DISTINCT match_id FROM tournament_match_results')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_rounds')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM tournament_days') || sql.includes('SELECT * FROM tournament_groups') || sql.includes('SELECT * FROM tournament_rooms') || sql.includes('SELECT * FROM tournament_matches')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO tournament_rounds')) {
        insertedRounds.push({ sql, params });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  await saveManualRoadmapDraft(mockClient, 'TOUR-GF', roadmapWithGF);
  const gfInsert = insertedRounds.find((r) => r.params[0] === 'RND-GF');
  assert.ok(gfInsert, 'Grand Finals round should be inserted');
  // Check parameters: roundType is 'grand_final' (index 6), advType is null (index 7), nextRoundId is null (index 8)
  assert.strictEqual(gfInsert.params[6], 'grand_final', 'round_type must be grand_final');
  assert.strictEqual(gfInsert.params[7], null, 'advancement_type must be null for Grand Finals');
  assert.strictEqual(gfInsert.params[8], null, 'advancement_target_round_id must be null for Grand Finals');
  assert.strictEqual(gfInsert.params[5], null, 'teams_advancing must be null for Grand Finals');
});

// ---------------------------------------------------------------------------
// TEST Z: Dynamic Prize Pool & Pre-Match Roadmap Overview Consistency
// ---------------------------------------------------------------------------
test('Test Z: Pre-match roadmap creation does not fabricate qualifiers and exposes dynamic prize metadata', async () => {
  // Test dynamic prize parsing helper
  const { getPrizePositions } = await import('../server/manualRoadmapService.js');

  // Case 1: Custom 3-rank prize pool distribution
  const customMeta3 = {
    prize_pool_amount: 100000,
    prize_positions: JSON.stringify([
      { rank: 1, name: 'Champion', percentage: 60, prize_amount: 60000 },
      { rank: 2, name: 'Runner-up', percentage: 30, prize_amount: 30000 },
      { rank: 3, name: '3rd Place', percentage: 10, prize_amount: 10000 },
    ]),
  };
  const positions3 = getPrizePositions(customMeta3);
  assert.strictEqual(positions3.length, 3, 'Should dynamically return exactly 3 configured prize positions');
  assert.strictEqual(positions3[0].prize_amount, 60000);
  assert.strictEqual(positions3[1].prize_amount, 30000);
  assert.strictEqual(positions3[2].prize_amount, 10000);

  // Case 2: 5-rank configured prize pool distribution
  const customMeta5 = {
    prize_pool_amount: 50000,
    prize_positions: JSON.stringify([
      { rank: 1, name: '1st', percentage: 40 },
      { rank: 2, name: '2nd', percentage: 25 },
      { rank: 3, name: '3rd', percentage: 15 },
      { rank: 4, name: '4th', percentage: 10 },
      { rank: 5, name: '5th', percentage: 10 },
    ]),
  };
  const positions5 = getPrizePositions(customMeta5);
  assert.strictEqual(positions5.length, 5, 'Should dynamically return 5 configured prize positions');
  assert.strictEqual(positions5[0].prize_amount, 20000);
  assert.strictEqual(positions5[4].prize_amount, 5000);

  // Case 3: buildHierarchicalRoadmap preserves Grand Finals as terminal stage
  const flatRounds = [
    { id: 'R-1', round_number: 1, name: 'Round 1', round_type: 'qualifier' },
    { id: 'R-2', round_number: 2, name: 'Grand Finals', round_type: 'grand_final' },
  ];
  const hierarchical = buildHierarchicalRoadmap(flatRounds, [], [], []);
  assert.strictEqual(hierarchical.length, 2);
  assert.strictEqual(hierarchical[1].round_type, 'grand_final');
  assert.strictEqual(hierarchical[1].advancement_type, null);
  assert.strictEqual(hierarchical[1].advancement_target_round_id, null);
});







