// tests/autoDistrictsLaterRounds.test.js
// Tests for automated district generation in later rounds (Round 2+, Grand Finals),
// publish validation without manual district choice, safe updates when teams_in changes,
// and PGTEST_URL real-DB verification.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateManualRoadmap,
  saveManualRoadmapDraft,
  publishManualRoadmap,
  syncAutoDistrictsForLaterRounds,
  buildHierarchicalRoadmap,
} from '../server/manualRoadmapService.js';
import { assertSafeTestDb } from './testDbGuard.js';

// ---------------------------------------------------------------------------
// Helper: create an in-memory mock PostgreSQL client
// ---------------------------------------------------------------------------
function createMockDb() {
  const mockDb = {
    tournaments: [{ id: 'TOUR-TEST', roadmap_status: 'draft', version: 1 }],
    rounds: [],
    days: [],
    groups: [],
    rooms: [],
    matches: [],
    matchResults: [],
    matchAssignments: [],
  };

  const client = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();

      if (s.includes('FROM TOURNAMENT_MATCH_RESULTS WHERE TOURNAMENT_ID')) {
        const rows = mockDb.matchResults.map((r) => ({ match_id: r.match_id }));
        return { rows };
      }
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS WHERE TOURNAMENT_ID') || s.includes('SELECT DISTINCT GROUP_ID FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        const rows = mockDb.matchAssignments.map((a) => ({ group_id: a.group_id, match_id: a.match_id }));
        return { rows };
      }
      if (s.includes('FROM TOURNAMENT_ROUNDS WHERE TOURNAMENT_ID')) {
        return { rows: [...mockDb.rounds] };
      }
      if (s.includes('FROM TOURNAMENT_DAYS WHERE TOURNAMENT_ID')) {
        return { rows: [...mockDb.days] };
      }
      if (s.includes('FROM TOURNAMENT_GROUPS WHERE TOURNAMENT_ID') || s.includes('FROM TOURNAMENT_GROUPS WHERE ID')) {
        if (s.includes('WHERE ID = $1')) {
          return { rows: mockDb.groups.filter((g) => g.id === params[0]) };
        }
        return { rows: [...mockDb.groups] };
      }
      if (s.includes('FROM TOURNAMENT_ROOMS WHERE TOURNAMENT_ID')) {
        return { rows: [...mockDb.rooms] };
      }
      if (s.includes('FROM TOURNAMENT_MATCHES WHERE TOURNAMENT_ID')) {
        return { rows: [...mockDb.matches] };
      }

      if (s.startsWith('UPDATE TOURNAMENT_ROUNDS SET ROUND_NUMBER') ||
          s.startsWith('UPDATE TOURNAMENT_MATCHES SET MATCH_NUMBER') ||
          s.startsWith('UPDATE TOURNAMENT_DAYS SET DAY_NUMBER') ||
          s.startsWith('UPDATE TOURNAMENT_GROUPS SET SEQUENCE') ||
          s.startsWith('UPDATE TOURNAMENT_ROOMS SET ROOM_NUMBER')) {
        return { rows: [] };
      }

      // INSERT/UPDATE tournament_rounds
      if (s.includes('INSERT INTO TOURNAMENT_ROUNDS')) {
        const [id, tId, rNum, name, status, teamsAdv, rType, advType, nextRId, advPerDist, advPerMatch, rOrder, teamsIn] = params;
        const existingIdx = mockDb.rounds.findIndex((r) => r.id === id);
        const row = {
          id,
          tournament_id: tId,
          round_number: rNum,
          name,
          status,
          teams_advancing: teamsAdv,
          round_type: rType,
          advancement_type: advType,
          advancement_target_round_id: nextRId,
          teams_advancing_per_district: advPerDist,
          teams_advancing_per_match: advPerMatch,
          round_order: rOrder,
          teams_in: teamsIn,
        };
        if (existingIdx !== -1) mockDb.rounds[existingIdx] = row;
        else mockDb.rounds.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_days
      if (s.includes('INSERT INTO TOURNAMENT_DAYS')) {
        const [id, tId, rId, dNum, date] = params;
        const existingIdx = mockDb.days.findIndex((d) => d.id === id);
        const row = { id, tournament_id: tId, round_id: rId, day_number: dNum, date };
        if (existingIdx !== -1) mockDb.days[existingIdx] = row;
        else mockDb.days.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_groups
      if (s.includes('INSERT INTO TOURNAMENT_GROUPS') || s.includes('UPDATE TOURNAMENT_GROUPS')) {
        const [id, tId, dId, rId, gName, seq, disp, distId] = params;
        const targetId = id || params[6];
        const existingIdx = mockDb.groups.findIndex((g) => g.id === targetId);
        const row = {
          id: targetId,
          tournament_id: tId || 'TOUR-TEST',
          day_id: dId || params[2],
          round_id: rId || params[1],
          group_name: gName || params[0],
          sequence: seq || params[3],
          display_order: disp || params[4],
          district_id: distId || params[5],
        };
        if (existingIdx !== -1) mockDb.groups[existingIdx] = row;
        else mockDb.groups.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_rooms
      if (s.includes('INSERT INTO TOURNAMENT_ROOMS')) {
        const [id, tId, dId, gId, rId, rNum, cap, status] = params;
        const existingIdx = mockDb.rooms.findIndex((rm) => rm.id === id);
        const row = { id, tournament_id: tId, day_id: dId, group_id: gId, round_id: rId, room_number: rNum, capacity: cap, status };
        if (existingIdx !== -1) mockDb.rooms[existingIdx] = row;
        else mockDb.rooms.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_matches
      if (s.includes('INSERT INTO TOURNAMENT_MATCHES')) {
        const [id, tId, rId, dId, gId, rmId, mNum, sTime, eTime, status, map, gName, origin, manual, notes, relTime] = params;
        const existingIdx = mockDb.matches.findIndex((m) => m.id === id);
        const row = {
          id,
          tournament_id: tId,
          round_id: rId,
          day_id: dId,
          group_id: gId,
          room_id: rmId,
          match_number: mNum,
          start_time: sTime,
          end_time: eTime,
          status,
          map,
          group_name: gName,
          origin,
          manual_override: manual,
          notes,
          id_pwd_release_time: relTime,
        };
        if (existingIdx !== -1) mockDb.matches[existingIdx] = row;
        else mockDb.matches.push(row);
        return { rows: [row] };
      }

      // DELETE queries
      if (s.includes('DELETE FROM TOURNAMENT_MATCHES')) {
        mockDb.matches = mockDb.matches.filter((m) => m.id !== params[0]);
        return { rows: [] };
      }
      if (s.includes('DELETE FROM TOURNAMENT_ROOMS')) {
        mockDb.rooms = mockDb.rooms.filter((rm) => rm.id !== params[0]);
        return { rows: [] };
      }
      if (s.includes('DELETE FROM TOURNAMENT_GROUPS')) {
        mockDb.groups = mockDb.groups.filter((g) => g.id !== params[0]);
        return { rows: [] };
      }
      if (s.includes('DELETE FROM TOURNAMENT_DAYS')) {
        mockDb.days = mockDb.days.filter((d) => d.id !== params[0]);
        return { rows: [] };
      }

      // UPDATE tournaments status
      if (s.includes('UPDATE TOURNAMENTS')) {
        if (s.includes("ROADMAP_STATUS = 'APPROVED'") || s.includes("ROADMAP_STATUS = 'PUBLISHED'")) {
          mockDb.tournaments[0].roadmap_status = 'approved';
        }
        return { rows: mockDb.tournaments };
      }

      return { rows: [] };
    },
    mockDb,
  };

  return client;
}

// ---------------------------------------------------------------------------
// TEST 1: 128 slots, R1 top 2 per district, Grand Finals with 16 teams
// Saves and publishes without manual district selection for Grand Finals.
// ---------------------------------------------------------------------------
test('Test 1: 128 slots, R1 top 2 advance, Grand Finals auto-creates single district and publishes without manual choice', async () => {
  const client = createMockDb();

  // Round 1 has 8 districts covering 128 slots (8 x 16 = 128)
  const r1Allocations = [];
  for (let d = 1; d <= 8; d++) {
    r1Allocations.push({
      district_id: `DIST-${d}`,
      district_name: `District ${d}`,
      match_count: 1,
      matches: [
        {
          id: `MAT-R1-${d}`,
          match_number: 1,
          start_time: '13:00',
          end_time: '13:30',
          map: 'Erangel',
        },
      ],
    });
  }

  // Organizer configures Round 1 and Grand Finals, but provides NO district allocations for Grand Finals
  const roadmapData = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1 (Qualifiers)',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2, // 8 * 2 = 16 advance
        teams_in: 128,
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
        id: 'RND-GF',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        teams_in: 16,
        days: [
          {
            id: 'DAY-GF',
            day_number: 1,
            date: '2026-11-02',
            // Organizer left allocations empty or didn't select districts!
            allocations: [],
          },
        ],
      },
    ],
  };

  // Validate manual roadmap with publish flag and 128 slots
  const validation = validateManualRoadmap(roadmapData, {
    isPublish: true,
    slotsTotal: 128,
    teams_per_group: 16,
  });

  assert.strictEqual(validation.valid, true, `Validation should pass without manual GF district: ${validation.errors.join(', ')}`);
  assert.strictEqual(validation.errors.length, 0);

  // Grand Finals allocations should have been auto-populated with 1 district
  const gfRound = roadmapData.rounds[1];
  assert.strictEqual(gfRound.days[0].allocations.length, 1, 'Grand Finals must have 1 auto-district attached');
  assert.strictEqual(gfRound.days[0].allocations[0].district_name, 'Grand Finals');
  assert.ok(gfRound.days[0].allocations[0].matches.length >= 1, 'Grand Finals auto-district must have matches');

  // Publish manual roadmap
  const pubResult = await publishManualRoadmap(client, 'TOUR-TEST', roadmapData, {
    isPublish: true,
    slotsTotal: 128,
    teams_per_group: 16,
  });

  assert.strictEqual(pubResult.success, true);
  assert.strictEqual(pubResult.status, 'published');

  // Verify database state: 8 groups in Round 1 + 1 group in Grand Finals = 9 groups total
  const gfGroups = client.mockDb.groups.filter((g) => g.round_id === 'RND-GF');
  assert.strictEqual(gfGroups.length, 1, 'Grand Finals must have exactly 1 group in DB');
  assert.strictEqual(gfGroups[0].group_name, 'Grand Finals');

  const gfRooms = client.mockDb.rooms.filter((r) => r.round_id === 'RND-GF');
  assert.strictEqual(gfRooms.length, 1, 'Grand Finals must have 1 room');

  const gfMatches = client.mockDb.matches.filter((m) => m.round_id === 'RND-GF');
  assert.ok(gfMatches.length >= 1, 'Grand Finals must have matches in DB');
});

// ---------------------------------------------------------------------------
// TEST 2: 64 teams in Round 2 gives 4 auto-districts with valid matches
// ---------------------------------------------------------------------------
test('Test 2: 64 teams in Round 2 auto-creates 4 districts (ceil(64 / 16))', async () => {
  const roadmapData = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1',
        round_type: 'qualifier',
        teams_advancing: 64,
        advancement_type: 'overall',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-11-01',
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M-1', match_number: 1, start_time: '13:00', end_time: '13:30', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
      {
        id: 'RND-2',
        round_number: 2,
        name: 'Semi Finals',
        round_type: 'semi_final',
        teams_in: 64, // 64 teams in -> 64 / 16 = 4 districts
        match_count: 2,
        days: [
          {
            id: 'DAY-2',
            day_number: 1,
            date: '2026-11-02',
            allocations: [],
          },
        ],
      },
    ],
  };

  const client = createMockDb();
  const saveResult = await saveManualRoadmapDraft(client, 'TOUR-TEST', roadmapData, { teams_per_group: 16 });

  assert.strictEqual(saveResult.success, true);

  // Round 2 should have 4 auto-created districts
  const r2Round = roadmapData.rounds[1];
  assert.strictEqual(r2Round.days[0].allocations.length, 4, 'Round 2 must have 4 auto-districts');
  assert.strictEqual(r2Round.days[0].allocations[0].district_name, 'District 1');
  assert.strictEqual(r2Round.days[0].allocations[1].district_name, 'District 2');
  assert.strictEqual(r2Round.days[0].allocations[2].district_name, 'District 3');
  assert.strictEqual(r2Round.days[0].allocations[3].district_name, 'District 4');

  // Verify DB groups
  const r2Groups = client.mockDb.groups.filter((g) => g.round_id === 'RND-2');
  assert.strictEqual(r2Groups.length, 4, 'Round 2 must have 4 groups persisted in DB');
});

// ---------------------------------------------------------------------------
// TEST 3: Safe district update when teams_in changes (qualifier count edited)
// Does NOT drop districts that already have assignments or results; emits warning.
// ---------------------------------------------------------------------------
test('Test 3: Safe update keeps districts with active assignments or results and warns organizer', async () => {
  const client = createMockDb();

  // Seed DB with existing 4 groups in Round 2
  const r2GroupId1 = 'GRP-R2-1';
  const r2GroupId2 = 'GRP-R2-2';
  const r2GroupId3 = 'GRP-R2-3';
  const r2GroupId4 = 'GRP-R2-4';

  client.mockDb.groups.push(
    { id: r2GroupId1, tournament_id: 'TOUR-TEST', group_name: 'District 1', round_id: 'RND-2' },
    { id: r2GroupId2, tournament_id: 'TOUR-TEST', group_name: 'District 2', round_id: 'RND-2' },
    { id: r2GroupId3, tournament_id: 'TOUR-TEST', group_name: 'District 3', round_id: 'RND-2' },
    { id: r2GroupId4, tournament_id: 'TOUR-TEST', group_name: 'District 4', round_id: 'RND-2' }
  );

  // District 3 has teams assigned!
  client.mockDb.matchAssignments.push({
    group_id: r2GroupId3,
    match_id: 'MAT-ASSIGNED',
  });

  // Now organizer edits qualifier count so teams_in drops from 64 to 32 (only 2 districts needed)
  const roadmapData = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1',
        round_type: 'qualifier',
        teams_advancing: 32,
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            allocations: [
              {
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ id: 'M-1', match_number: 1, start_time: '13:00', end_time: '13:30', map: 'Erangel' }],
              },
            ],
          },
        ],
      },
      {
        id: 'RND-2',
        round_number: 2,
        name: 'Round 2',
        round_type: 'qualifier',
        teams_in: 32, // 32 / 16 = 2 districts needed
        days: [
          {
            id: 'DAY-2',
            day_number: 1,
            allocations: [
              { group_id: r2GroupId1, district_id: r2GroupId1, district_name: 'District 1', match_count: 1 },
              { group_id: r2GroupId2, district_id: r2GroupId2, district_name: 'District 2', match_count: 1 },
              { group_id: r2GroupId3, district_id: r2GroupId3, district_name: 'District 3', match_count: 1 },
              { group_id: r2GroupId4, district_id: r2GroupId4, district_name: 'District 4', match_count: 1 },
            ],
          },
        ],
      },
    ],
  };

  const saveResult = await saveManualRoadmapDraft(client, 'TOUR-TEST', roadmapData, { teams_per_group: 16 });
  assert.strictEqual(saveResult.success, true);

  // District 3 was protected from deletion because it has team assignments
  const r2Allocs = roadmapData.rounds[1].days[0].allocations;
  const keptGroupIds = r2Allocs.map((a) => a.group_id);

  assert.ok(keptGroupIds.includes(r2GroupId3), 'District 3 with active assignments must be preserved');
  assert.ok(!keptGroupIds.includes(r2GroupId4), 'District 4 without assignments should be pruned safely');

  // Verify warning was emitted
  assert.ok(saveResult.warnings.length > 0, 'A warning must be emitted for preserved district');
  assert.ok(
    saveResult.warnings.some((w) => w.includes('District 3') && w.includes('team assignments')),
    `Warning should name District 3: ${saveResult.warnings.join('; ')}`
  );
});

// ---------------------------------------------------------------------------
// TEST 4: Real PostgreSQL database 128 slots -> 16 teams Grand Finals (Gated by PGTEST_URL)
// ---------------------------------------------------------------------------
test('Test 4: Real PostgreSQL database — 128 slots, R1 top 2 advance, Grand Finals auto-creates single district and publishes (gated by PGTEST_URL)', async (t) => {
  const testUrl = process.env.PGTEST_URL;
  if (!testUrl) {
    t.skip('Skipping live PostgreSQL test: PGTEST_URL environment variable is not set.');
    return;
  }

  // Safety guard prevents accidental connection to production DATABASE_URL
  assertSafeTestDb(testUrl);

  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: testUrl, max: 2 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const testTourneyId = `TRN-AUTO-DIST-128-${Date.now()}`;
    await client.query(
      `INSERT INTO tournaments (id, title, status, roadmap_status, version)
       VALUES ($1, 'Auto District Real DB Test 128 Slots', 'draft', 'draft', 1)`,
      [testTourneyId]
    );

    // Round 1 has 8 districts covering 128 slots
    const r1Allocations = [];
    for (let d = 1; d <= 8; d++) {
      r1Allocations.push({
        district_id: `DIST-R1-${d}-${Date.now()}`,
        district_name: `District ${d}`,
        match_count: 1,
        matches: [
          {
            id: `MAT-R1-${d}-${Date.now()}`,
            match_number: 1,
            start_time: '13:00',
            end_time: '13:30',
            map: 'Erangel',
          },
        ],
      });
    }

    const roadmapData = {
      rounds: [
        {
          id: `RND-1-${Date.now()}`,
          round_number: 1,
          name: 'Round 1 (Qualifiers)',
          round_type: 'qualifier',
          advancement_type: 'per_district',
          teams_advancing_per_district: 2,
          teams_in: 128,
          days: [
            {
              id: `DAY-1-${Date.now()}`,
              day_number: 1,
              date: '2026-11-10',
              allocations: r1Allocations,
            },
          ],
        },
        {
          id: `RND-GF-${Date.now()}`,
          round_number: 2,
          name: 'Grand Finals',
          round_type: 'grand_final',
          teams_in: 16,
          days: [
            {
              id: `DAY-GF-${Date.now()}`,
              day_number: 1,
              date: '2026-11-11',
              allocations: [], // Auto-created! No manual district selection needed
            },
          ],
        },
      ],
    };

    const pubResult = await publishManualRoadmap(client, testTourneyId, roadmapData, {
      isPublish: true,
      slotsTotal: 128,
      teams_per_group: 16,
    });

    assert.strictEqual(pubResult.success, true);
    assert.strictEqual(pubResult.status, 'published');

    // Query real DB to confirm Grand Finals group was auto-created in tournament_groups
    const gfGroupsRes = await client.query(
      `SELECT * FROM tournament_groups WHERE tournament_id = $1 AND round_id = $2`,
      [testTourneyId, roadmapData.rounds[1].id]
    );
    assert.strictEqual(gfGroupsRes.rows.length, 1);
    assert.strictEqual(gfGroupsRes.rows[0].group_name, 'Grand Finals');

    // Query real DB to confirm Grand Finals room and matches exist
    const gfRoomsRes = await client.query(
      `SELECT * FROM tournament_rooms WHERE tournament_id = $1 AND round_id = $2`,
      [testTourneyId, roadmapData.rounds[1].id]
    );
    assert.strictEqual(gfRoomsRes.rows.length, 1);

    const gfMatchesRes = await client.query(
      `SELECT * FROM tournament_matches WHERE tournament_id = $1 AND round_id = $2`,
      [testTourneyId, roadmapData.rounds[1].id]
    );
    assert.ok(gfMatchesRes.rows.length >= 1);

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
});

// ---------------------------------------------------------------------------
// TEST 5: Real PostgreSQL database 64 teams in Round 2 gives 4 auto-districts (Gated by PGTEST_URL)
// ---------------------------------------------------------------------------
test('Test 5: Real PostgreSQL database — 64 teams in Round 2 auto-creates 4 districts (gated by PGTEST_URL)', async (t) => {
  const testUrl = process.env.PGTEST_URL;
  if (!testUrl) {
    t.skip('Skipping live PostgreSQL test: PGTEST_URL environment variable is not set.');
    return;
  }

  // Safety guard prevents accidental connection to production DATABASE_URL
  assertSafeTestDb(testUrl);

  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: testUrl, max: 2 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const testTourneyId = `TRN-AUTO-DIST-64-${Date.now()}`;
    await client.query(
      `INSERT INTO tournaments (id, title, status, roadmap_status, version)
       VALUES ($1, 'Auto District Real DB Test 64 Teams R2', 'draft', 'draft', 1)`,
      [testTourneyId]
    );

    const roadmapData = {
      rounds: [
        {
          id: `RND-1-${Date.now()}`,
          round_number: 1,
          name: 'Round 1',
          round_type: 'qualifier',
          teams_advancing: 64,
          advancement_type: 'overall',
          days: [
            {
              id: `DAY-1-${Date.now()}`,
              day_number: 1,
              date: '2026-11-10',
              allocations: [
                {
                  district_id: `DIST-1-${Date.now()}`,
                  district_name: 'District 1',
                  match_count: 1,
                  matches: [
                    {
                      id: `MAT-R1-1-${Date.now()}`,
                      match_number: 1,
                      start_time: '13:00',
                      end_time: '13:30',
                      map: 'Erangel',
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: `RND-2-${Date.now()}`,
          round_number: 2,
          name: 'Semi Finals',
          round_type: 'semi_final',
          teams_in: 64, // 64 / 16 = 4 districts
          match_count: 2,
          days: [
            {
              id: `DAY-2-${Date.now()}`,
              day_number: 1,
              date: '2026-11-11',
              allocations: [], // Auto-created!
            },
          ],
        },
      ],
    };

    const saveResult = await saveManualRoadmapDraft(client, testTourneyId, roadmapData, {
      teams_per_group: 16,
    });

    assert.strictEqual(saveResult.success, true);

    // Query real DB to confirm 4 groups were auto-created in Round 2
    const r2GroupsRes = await client.query(
      `SELECT * FROM tournament_groups WHERE tournament_id = $1 AND round_id = $2 ORDER BY sequence ASC`,
      [testTourneyId, roadmapData.rounds[1].id]
    );
    assert.strictEqual(r2GroupsRes.rows.length, 4);
    assert.strictEqual(r2GroupsRes.rows[0].group_name, 'District 1');
    assert.strictEqual(r2GroupsRes.rows[1].group_name, 'District 2');
    assert.strictEqual(r2GroupsRes.rows[2].group_name, 'District 3');
    assert.strictEqual(r2GroupsRes.rows[3].group_name, 'District 4');

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
});
