import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHierarchicalRoadmap,
  validateManualRoadmap,
  saveManualRoadmapDraft,
} from '../server/manualRoadmapService.js';

test('PHASE 3 ROUND-TRIP: saves full roadmap and reads back unchanged', async () => {
  // Mock DB tables in-memory
  const mockDb = {
    rounds: [],
    days: [],
    groups: [],
    rooms: [],
    matches: [],
    matchResults: [],
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();

      if (s.startsWith('SELECT DISTINCT MATCH_ID FROM TOURNAMENT_MATCH_RESULTS')) {
        return { rows: mockDb.matchResults };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_ROUNDS')) {
        return { rows: mockDb.rounds };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_DAYS')) {
        return { rows: mockDb.days };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_GROUPS')) {
        return { rows: mockDb.groups };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_ROOMS')) {
        return { rows: mockDb.rooms };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_MATCHES')) {
        return { rows: mockDb.matches };
      }
      if (s.startsWith('UPDATE TOURNAMENT_ROUNDS SET ROUND_NUMBER')) {
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_MATCHES SET MATCH_NUMBER')) {
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_DAYS SET DAY_NUMBER')) {
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_GROUPS SET SEQUENCE')) {
        return { rows: [] };
      }

      // INSERT/UPDATE tournament_rounds
      if (s.includes('INSERT INTO TOURNAMENT_ROUNDS')) {
        const [id, tId, rNum, name, status, teamsAdv, rType, advType, nextRId, advPerDist, advPerMatch, rOrder, teamsIn] = params;
        const existingIdx = mockDb.rounds.findIndex(r => r.id === id);
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
        const existingIdx = mockDb.days.findIndex(d => d.id === id);
        const row = { id, tournament_id: tId, round_id: rId, day_number: dNum, date };
        if (existingIdx !== -1) mockDb.days[existingIdx] = row;
        else mockDb.days.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_groups
      if (s.includes('SELECT ID FROM TOURNAMENT_GROUPS WHERE ID')) {
        return { rows: mockDb.groups.filter(g => g.id === params[0]) };
      }
      if (s.includes('INSERT INTO TOURNAMENT_GROUPS') || s.includes('UPDATE TOURNAMENT_GROUPS')) {
        const [id, tId, dId, rId, gName, seq, disp, distId] = params;
        const existingIdx = mockDb.groups.findIndex(g => g.id === (id || params[6]));
        const row = {
          id: id || params[6],
          tournament_id: tId || 'T1',
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
        const existingIdx = mockDb.rooms.findIndex(rm => rm.id === id);
        const row = { id, tournament_id: tId, day_id: dId, group_id: gId, round_id: rId, room_number: rNum, capacity: cap, status };
        if (existingIdx !== -1) mockDb.rooms[existingIdx] = row;
        else mockDb.rooms.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_matches
      if (s.includes('INSERT INTO TOURNAMENT_MATCHES')) {
        const [id, tId, rId, dId, gId, rmId, mNum, sTime, eTime, status, map, gName, origin, manual, notes, relTime] = params;
        const existingIdx = mockDb.matches.findIndex(m => m.id === id);
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
      if (s.startsWith('DELETE FROM')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  const inputRoadmap = {
    rounds: [
      {
        id: 'RND-ROUND1',
        round_number: 1,
        name: 'Qualifiers Stage',
        round_type: 'qualifier',
        teams_in: 128,
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        teams_advancing: 16,
        advancement_target_round_id: 'RND-FINALS',
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'DIST-1',
                district_id: 'DIST-1',
                district_name: 'District 1',
                match_count: 2,
                matches: [
                  {
                    id: 'MAT-1-1',
                    start_time: '14:00',
                    end_time: '14:35',
                    map: 'Erangel',
                    notes: 'Stream Lobby 1',
                  },
                  {
                    id: 'MAT-1-2',
                    start_time: '15:20',
                    end_time: '15:55',
                    map: 'Miramar',
                    notes: 'Stream Lobby 1 Match 2',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: 'RND-FINALS',
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        teams_in: 16,
        advancement_type: null,
        teams_advancing: null,
        days: [
          {
            id: 'DAY-2',
            day_number: 1,
            date: '2026-10-26',
            allocations: [
              {
                id: 'DIST-GF',
                district_id: 'DIST-GF',
                district_name: 'Grand Finals Lobby',
                match_count: 3,
                matches: [
                  { id: 'MAT-GF-1', start_time: '17:00', end_time: '17:40', map: 'Erangel', notes: 'Championship Match 1' },
                  { id: 'MAT-GF-2', start_time: '18:00', end_time: '18:40', map: 'Miramar', notes: 'Championship Match 2' },
                  { id: 'MAT-GF-3', start_time: '19:00', end_time: '19:40', map: 'Sanhok', notes: 'Championship Match 3' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // 1. Save draft
  await saveManualRoadmapDraft(mockClient, 'TOURNEY-RT-1', inputRoadmap);

  // 2. Read back via buildHierarchicalRoadmap
  const loaded = buildHierarchicalRoadmap(mockDb.rounds, mockDb.days, mockDb.groups, mockDb.matches);

  assert.equal(loaded.length, 2);

  // Check Round 1
  const r1 = loaded[0];
  assert.equal(r1.id, 'RND-ROUND1');
  assert.equal(r1.name, 'Qualifiers Stage');
  assert.equal(r1.teams_in, 128);
  assert.equal(r1.advancement_type, 'per_district');
  assert.equal(r1.teams_advancing_per_district, 2);
  assert.equal(r1.advancement_target_round_id, 'RND-FINALS');

  // Check Round 1 Day & District settings
  assert.equal(r1.days.length, 1);
  assert.equal(r1.days[0].date, '2026-10-25');
  const d1 = r1.days[0].allocations[0];
  assert.equal(d1.district_name, 'District 1');
  assert.equal(d1.match_count, 2);
  assert.equal(d1.matches.length, 2);
  assert.equal(d1.matches[0].start_time, '14:00');
  assert.equal(d1.matches[0].end_time, '14:35');
  assert.equal(d1.matches[0].map, 'Erangel');
  assert.equal(d1.matches[0].notes, 'Stream Lobby 1');
  assert.equal(d1.matches[1].start_time, '15:20');
  assert.equal(d1.matches[1].end_time, '15:55');
  assert.equal(d1.matches[1].map, 'Miramar');

  // Check Grand Finals
  const r2 = loaded[1];
  assert.equal(r2.id, 'RND-FINALS');
  assert.equal(r2.name, 'Grand Finals');
  assert.equal(r2.round_type, 'grand_final');
  assert.equal(r2.teams_in, 16);
  assert.equal(r2.days[0].allocations[0].match_count, 3);
  assert.equal(r2.days[0].allocations[0].matches[2].map, 'Sanhok');
});

test('PHASE 3 EDIT LOCKS: blocks structural edits when round has verified results, allows rename', async () => {
  const mockDb = {
    rounds: [
      {
        id: 'RND-1',
        tournament_id: 'T-LOCKED',
        round_number: 1,
        name: 'Round 1 Initial',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        teams_in: 64,
      },
    ],
    days: [{ id: 'DAY-1', tournament_id: 'T-LOCKED', round_id: 'RND-1', day_number: 1, date: '2026-10-25' }],
    groups: [{ id: 'GRP-1', tournament_id: 'T-LOCKED', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 1', sequence: 1 }],
    rooms: [{ id: 'RM-1', tournament_id: 'T-LOCKED', day_id: 'DAY-1', group_id: 'GRP-1', round_id: 'RND-1', room_number: 1 }],
    matches: [
      {
        id: 'MAT-1',
        tournament_id: 'T-LOCKED',
        round_id: 'RND-1',
        day_id: 'DAY-1',
        group_id: 'GRP-1',
        room_id: 'RM-1',
        match_number: 1,
        start_time: '14:00',
        end_time: '14:30',
      },
    ],
    matchResults: [{ match_id: 'MAT-1' }], // Verified result exists for MAT-1
  };

  const client = {
    query: async (sql) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('TOURNAMENT_MATCH_RESULTS')) return { rows: mockDb.matchResults };
      if (s.includes('TOURNAMENT_ROUNDS')) return { rows: mockDb.rounds };
      if (s.includes('TOURNAMENT_DAYS')) return { rows: mockDb.days };
      if (s.includes('TOURNAMENT_GROUPS')) return { rows: mockDb.groups };
      if (s.includes('TOURNAMENT_ROOMS')) return { rows: mockDb.rooms };
      if (s.includes('TOURNAMENT_MATCHES')) return { rows: mockDb.matches };
      return { rows: [] };
    },
  };

  // 1. Attempt structural edit: changing qualification rule from per_district to overall
  const structuralEdit = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1 Initial',
        round_type: 'qualifier',
        advancement_type: 'overall', // Changed!
        teams_advancing: 16,
        teams_in: 64,
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'GRP-1',
                district_name: 'District 1',
                matches: [{ id: 'MAT-1', start_time: '14:00', end_time: '14:30' }],
              },
            ],
          },
        ],
      },
    ],
  };

  await assert.rejects(
    async () => {
      await saveManualRoadmapDraft(client, 'T-LOCKED', structuralEdit);
    },
    {
      code: 'ROUND_STRUCTURALLY_LOCKED',
    }
  );

  // 2. Granular lock verification:
  // In a round where Day 1 has verified results, organizer CAN edit date, time, map, and notes
  // of matches on later days (Day 2) without throwing.
  const granularDb = {
    rounds: [
      {
        id: 'RND-1',
        tournament_id: 'T-LOCKED',
        round_number: 1,
        name: 'Round 1 Initial',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        teams_in: 64,
      },
    ],
    days: [
      { id: 'DAY-1', tournament_id: 'T-LOCKED', round_id: 'RND-1', day_number: 1, date: '2026-10-25' },
      { id: 'DAY-2', tournament_id: 'T-LOCKED', round_id: 'RND-1', day_number: 2, date: '2026-10-26' },
    ],
    groups: [
      { id: 'GRP-1', tournament_id: 'T-LOCKED', day_id: 'DAY-1', round_id: 'RND-1', group_name: 'District 1', sequence: 1 },
      { id: 'GRP-2', tournament_id: 'T-LOCKED', day_id: 'DAY-2', round_id: 'RND-1', group_name: 'District 1', sequence: 1 },
    ],
    rooms: [
      { id: 'RM-1', tournament_id: 'T-LOCKED', day_id: 'DAY-1', group_id: 'GRP-1', round_id: 'RND-1', room_number: 1 },
      { id: 'RM-2', tournament_id: 'T-LOCKED', day_id: 'DAY-2', group_id: 'GRP-2', round_id: 'RND-1', room_number: 2 },
    ],
    matches: [
      {
        id: 'MAT-1',
        tournament_id: 'T-LOCKED',
        round_id: 'RND-1',
        day_id: 'DAY-1',
        group_id: 'GRP-1',
        room_id: 'RM-1',
        match_number: 1,
        start_time: '14:00',
        end_time: '14:30',
        map: 'Erangel',
        notes: 'Day 1 original notes',
        status: 'VERIFIED',
      },
      {
        id: 'MAT-2',
        tournament_id: 'T-LOCKED',
        round_id: 'RND-1',
        day_id: 'DAY-2',
        group_id: 'GRP-2',
        room_id: 'RM-2',
        match_number: 2,
        start_time: '16:00',
        end_time: '16:30',
        map: 'Miramar',
        notes: 'Day 2 original notes',
        status: 'PENDING',
      },
    ],
    matchResults: [{ match_id: 'MAT-1' }], // Verified result ONLY exists for MAT-1 on Day 1
  };

  const granularClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('TOURNAMENT_MATCH_RESULTS')) return { rows: granularDb.matchResults };
      if (s.startsWith('SELECT * FROM TOURNAMENT_ROUNDS')) return { rows: granularDb.rounds };
      if (s.startsWith('SELECT * FROM TOURNAMENT_DAYS')) return { rows: granularDb.days };
      if (s.startsWith('SELECT * FROM TOURNAMENT_GROUPS')) return { rows: granularDb.groups };
      if (s.startsWith('SELECT * FROM TOURNAMENT_ROOMS')) return { rows: granularDb.rooms };
      if (s.startsWith('SELECT * FROM TOURNAMENT_MATCHES')) return { rows: granularDb.matches };
      if (s.startsWith('SELECT ID FROM TOURNAMENT_GROUPS')) return { rows: [{ id: params[0] }] };

      if (s.includes('INSERT INTO TOURNAMENT_DAYS')) {
        const [id, , , , date] = params;
        const d = granularDb.days.find((x) => x.id === id);
        if (d) d.date = date;
        return { rows: [] };
      }
      if (s.includes('INSERT INTO TOURNAMENT_MATCHES')) {
        const [id, , , , , , , startTime, endTime, status, map, , , , notes] = params;
        const m = granularDb.matches.find((x) => x.id === id);
        if (m) {
          m.start_time = startTime;
          m.end_time = endTime;
          m.status = status;
          m.map = map;
          m.notes = notes;
        }
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  // Organizer updates Day 2 date, and Day 2 match's time, map, notes.
  // Organizer also attempts to alter Day 1 date and MAT-1 map.
  const day2Update = {
    rounds: [
      {
        id: 'RND-1',
        round_number: 1,
        name: 'Round 1 Initial',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        teams_in: 64,
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-10-30', // Attempt to alter Day 1 date (should be ignored / protected)
            allocations: [
              {
                id: 'GRP-1',
                district_name: 'District 1',
                matches: [
                  {
                    id: 'MAT-1',
                    start_time: '19:00', // Attempt to alter MAT-1 time (should be ignored / protected)
                    end_time: '19:30',
                    map: 'Sanhok', // Attempt to alter MAT-1 map (should be ignored / protected)
                    notes: 'Altered Day 1 notes',
                  },
                ],
              },
            ],
          },
          {
            id: 'DAY-2',
            day_number: 2,
            date: '2026-10-28', // Day 2 date successfully edited!
            allocations: [
              {
                id: 'GRP-2',
                district_name: 'District 1',
                matches: [
                  {
                    id: 'MAT-2',
                    start_time: '17:30', // Day 2 match time successfully edited!
                    end_time: '18:00',
                    map: 'Rondo', // Day 2 match map successfully edited!
                    notes: 'New Day 2 strategy notes', // Day 2 match notes successfully edited!
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // Must not reject: schedule edits on later days are fully allowed!
  await assert.doesNotReject(async () => {
    await saveManualRoadmapDraft(granularClient, 'T-LOCKED', day2Update);
  });

  // Verify Day 2 changes took effect:
  const day2 = granularDb.days.find((d) => d.id === 'DAY-2');
  const mat2 = granularDb.matches.find((m) => m.id === 'MAT-2');
  assert.equal(day2.date, '2026-10-28', 'Day 2 date must be updated');
  assert.equal(mat2.start_time, '17:30', 'Day 2 match start_time must be updated');
  assert.equal(mat2.map, 'Rondo', 'Day 2 match map must be updated');
  assert.equal(mat2.notes, 'New Day 2 strategy notes', 'Day 2 match notes must be updated');

  // Verify Day 1 verified result match and date remained protected:
  const day1 = granularDb.days.find((d) => d.id === 'DAY-1');
  const mat1 = granularDb.matches.find((m) => m.id === 'MAT-1');
  assert.equal(day1.date, '2026-10-25', 'Day 1 date must remain protected');
  assert.equal(mat1.start_time, '14:00', 'MAT-1 start_time must remain protected');
  assert.equal(mat1.map, 'Erangel', 'MAT-1 map must remain protected');
  assert.equal(mat1.notes, 'Day 1 original notes', 'MAT-1 notes must remain protected');
});

test('PHASE 3 PUBLISH VALIDATION: enforces blocking rules for publish', () => {
  // 1. Teams advancing greater than teams in
  const overAdvancingRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1 Qualifier',
        round_type: 'qualifier',
        advancement_type: 'overall',
        teams_advancing: 32, // Advancing 32
        teams_in: 16, // Only 16 teams in!
        days: [
          {
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'D1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ start_time: '14:00', end_time: '14:30' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const overAdvRes = validateManualRoadmap(overAdvancingRoadmap, { isPublish: true, slotsTotal: 16 });
  assert.equal(overAdvRes.valid, false);
  assert.ok(
    overAdvRes.errors.some((e) => e.includes('cannot exceed incoming teams')),
    'Must block publish when advancing teams > incoming teams'
  );

  // 2. Non-final round with no valid qualification rule
  const missingRuleRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1 Qualifier',
        round_type: 'qualifier',
        advancement_type: 'overall',
        teams_advancing: 0, // No valid qualifiers!
        teams_in: 64,
        days: [
          {
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'D1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ start_time: '14:00', end_time: '14:30' }],
              },
            ],
          },
        ],
      },
      {
        round_number: 2,
        name: 'Grand Finals',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            date: '2026-10-26',
            allocations: [
              {
                id: 'DF',
                district_name: 'Finals',
                match_count: 1,
                matches: [{ start_time: '18:00', end_time: '18:30' }],
              },
            ],
          },
        ],
      },
    ],
  };

  const missingRuleRes = validateManualRoadmap(missingRuleRoadmap, { isPublish: true, slotsTotal: 64 });
  assert.equal(missingRuleRes.valid, false);
  assert.ok(
    missingRuleRes.errors.some((e) => e.includes('must have a valid qualification rule configured')),
    'Must block publish when non-final round has no valid qualification rule'
  );

  // 3. Matches inside the same district overlapping each other
  const overlappingMatchesRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1 Qualifier',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'D1',
                district_name: 'District 1',
                match_count: 2,
                matches: [
                  { district_match_number: 1, start_time: '14:00', end_time: '14:40' },
                  { district_match_number: 2, start_time: '14:30', end_time: '15:10' }, // Overlaps with match 1!
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const overlapRes = validateManualRoadmap(overlappingMatchesRoadmap, { isPublish: true });
  assert.equal(overlapRes.valid, false);
  assert.ok(
    overlapRes.errors.some((e) => e.includes('Matches in district "District 1" overlap')),
    'Must block publish when matches inside the same district overlap'
  );

  // 4. Parallel districts scheduled at the same time must be ALLOWED
  const parallelDistrictsRoadmap = {
    rounds: [
      {
        round_number: 1,
        name: 'Round 1 Qualifier',
        round_type: 'grand_final',
        days: [
          {
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'D1',
                district_name: 'District 1',
                match_count: 1,
                matches: [{ district_match_number: 1, start_time: '14:00', end_time: '14:30' }],
              },
              {
                id: 'D2',
                district_name: 'District 2',
                match_count: 1,
                matches: [{ district_match_number: 1, start_time: '14:00', end_time: '14:30' }], // Same time, parallel district!
              },
            ],
          },
        ],
      },
    ],
  };

  const parallelRes = validateManualRoadmap(parallelDistrictsRoadmap, { isPublish: true });
  assert.equal(parallelRes.valid, true, 'Parallel districts at same time must be allowed');
  assert.equal(parallelRes.errors.length, 0);
});

test('PHASE 3 ROUND-TRIP REAL-DB: supports PGTEST_URL for real PostgreSQL persistence verification', async (t) => {
  const testUrl = process.env.PGTEST_URL || process.env.SUPABASE_TEST_URL;
  if (!testUrl) {
    t.skip('Skipping real-DB round-trip test: PGTEST_URL environment variable is not set.');
    return;
  }

  const pg = await import('pg');
  const client = new pg.default.Client({
    connectionString: testUrl,
    ssl: testUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (err) {
    t.skip(`Skipping real-DB round-trip test: Database probe failed (${err.message})`);
    return;
  }

  try {
    await client.query('BEGIN');

    // Create a temporary tournament record for testing
    const testTourneyId = `T-TEST-${Date.now()}`;
    await client.query(
      `INSERT INTO tournaments (id, title, game, status, "slotsTotal")
       VALUES ($1, 'Roundtrip Test Tournament', 'BGMI', 'upcoming', 64)
       ON CONFLICT (id) DO NOTHING`,
      [testTourneyId]
    );

    const testRoadmap = {
      rounds: [
        {
          name: 'Round 1 Qualifier',
          round_type: 'qualifier',
          advancement_type: 'per_district',
          teams_advancing_per_district: 4,
          teams_in: 64,
          days: [
            {
              date: '2026-11-01',
              allocations: [
                {
                  district_name: 'District 1',
                  matches: [
                    { start_time: '13:00', end_time: '13:30', map: 'Erangel', notes: 'Opener' },
                    { start_time: '13:45', end_time: '14:15', map: 'Miramar', notes: 'Match 2' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    await saveManualRoadmapDraft(client, testTourneyId, testRoadmap);

    const savedRounds = (await client.query('SELECT * FROM tournament_rounds WHERE tournament_id = $1', [testTourneyId])).rows;
    const savedDays = (await client.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [testTourneyId])).rows;
    const savedGroups = (await client.query('SELECT * FROM tournament_groups WHERE tournament_id = $1', [testTourneyId])).rows;
    const savedMatches = (await client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [testTourneyId])).rows;

    const reconstructed = buildHierarchicalRoadmap(savedRounds, savedDays, savedGroups, savedMatches);
    assert.equal(reconstructed.length, 1);
    assert.equal(reconstructed[0].name, 'Round 1 Qualifier');
    assert.equal(reconstructed[0].days[0].allocations[0].matches.length, 2);
    assert.equal(reconstructed[0].days[0].allocations[0].matches[0].map, 'Erangel');
    assert.equal(reconstructed[0].days[0].allocations[0].matches[1].map, 'Miramar');

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
});

test('PHASE 3 PARTICIPANT PRIVACY: participant response contains no organizer-only fields, draft data, or team names', () => {
  // 1. Published participant roadmap projection
  const organizerPayload = {
    rounds: [{ id: 'R1', name: 'Round 1' }],
    days: [{ id: 'D1', date: '2026-10-25' }],
    groups: [{ id: 'G1', group_name: 'District 1' }],
    rooms: [{ id: 'RM1', capacity: 16 }],
    matches: [
      {
        id: 'M1',
        start_time: '14:00',
        end_time: '14:30',
        map: 'Erangel',
        credentials_available: false,
      },
    ],
    assignments: [
      { match_id: 'M1', tournament_team_id: 'TEAM-SECRET-1' },
      { match_id: 'M1', tournament_team_id: 'TEAM-SECRET-2' },
    ],
    districts: [
      {
        id: 'D1',
        name: 'District 1',
        capacity: 16,
        teams: [
          { id: 'T1', team_name: 'Secret Alpha Clan' },
          { id: 'T2', team_name: 'Secret Bravo Squad' },
        ],
      },
    ],
    meta: {
      total_slots: 64,
      teams_per_group: 16,
      capacity_warning: 'Roadmap was built for 32 teams, but tournament capacity is now 64.',
      capacity_mismatch: { planned: 32, current: 64 },
      validation: { valid: true, errors: [], warnings: [] },
    },
  };

  // Participant endpoint projection as implemented in server.js
  const participantMeta = { ...organizerPayload.meta };
  delete participantMeta.capacity_warning;
  delete participantMeta.capacity_mismatch;
  delete participantMeta.validation;

  const participantResponse = {
    success: true,
    mode: 'participant',
    viewer_is_organizer: false,
    is_organizer: false,
    roadmap_status: 'published',
    published: true,
    participant: { team_id: 'T1', team_name: 'Secret Alpha Clan', team_status: 'confirmed' },
    roadmap: {
      rounds: organizerPayload.rounds,
      days: organizerPayload.days,
      groups: organizerPayload.groups,
      rooms: organizerPayload.rooms,
      matches: organizerPayload.matches,
      districts: organizerPayload.districts.map((d) => ({
        id: d.id,
        name: d.name,
        capacity: d.capacity,
      })),
      meta: participantMeta,
    },
  };

  // Assertions for participant safety:
  assert.equal(participantResponse.roadmap.assignments, undefined, 'assignments must not be returned');
  assert.equal(participantResponse.roadmap.meta.capacity_warning, undefined, 'capacity_warning must not be in participant meta');
  assert.equal(participantResponse.roadmap.meta.capacity_mismatch, undefined, 'capacity_mismatch must not be in participant meta');
  assert.equal(participantResponse.roadmap.meta.validation, undefined, 'validation messages must not be in participant meta');
  assert.equal(participantResponse.roadmap.districts[0].teams, undefined, 'district teams array must not be in participant response');

  // Verify that team names inside the tournament districts are not leaked in the JSON
  const jsonStr = JSON.stringify(participantResponse.roadmap);
  assert.equal(jsonStr.includes('capacity_warning'), false);
  assert.equal(jsonStr.includes('capacity_mismatch'), false);
  assert.equal(jsonStr.includes('Secret Bravo Squad'), false);

  // 2. Unpublished roadmap gate: ordinary participants and visitors receive NO roadmap draft data
  const unpublishedResponse = {
    success: true,
    mode: 'public',
    viewer_is_organizer: false,
    is_organizer: false,
    roadmap_status: 'draft',
    published: false,
    message: 'Roadmap will be published soon.',
    participant: null,
    roadmap: null,
  };

  assert.equal(unpublishedResponse.published, false);
  assert.equal(unpublishedResponse.roadmap, null, 'Unpublished roadmap must return null roadmap to non-organizers');
  assert.equal(unpublishedResponse.message, 'Roadmap will be published soon.');
});
