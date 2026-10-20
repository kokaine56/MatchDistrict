import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHierarchicalRoadmap,
  validateManualRoadmap,
  saveManualRoadmapDraft,
  deleteEntireRoadmap,
  getTournamentRoadmapResponse,
} from '../server/manualRoadmapService.js';
import { assertSafeTestDb } from './testDbGuard.js';

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
            date: '2026-10-25', // Day 1 date kept unchanged
            allocations: [
              {
                id: 'GRP-1',
                district_name: 'District 1',
                matches: [
                  {
                    id: 'MAT-1',
                    start_time: '14:00', // MAT-1 time kept unchanged
                    end_time: '14:30',
                    map: 'Erangel', // MAT-1 map kept unchanged
                    notes: 'Day 1 original notes',
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

  // Explicit test for Q1: Server must reject modifying a locked day with DAY_LOCKED
  const lockedDayEdit = JSON.parse(JSON.stringify(day2Update));
  lockedDayEdit.rounds[0].days[0].date = '2026-10-31';
  await assert.rejects(
    async () => {
      await saveManualRoadmapDraft(granularClient, 'T-LOCKED', lockedDayEdit);
    },
    (err) => {
      assert.equal(err.code, 'DAY_LOCKED');
      assert.match(err.message, /Day 1.*contains verified results and is locked/i);
      return true;
    }
  );

  // Explicit test for Q1: Server must reject modifying a locked match with MATCH_LOCKED
  const lockedMatchEdit = JSON.parse(JSON.stringify(day2Update));
  lockedMatchEdit.rounds[0].days[0].allocations[0].matches[0].start_time = '19:00';
  await assert.rejects(
    async () => {
      await saveManualRoadmapDraft(granularClient, 'T-LOCKED', lockedMatchEdit);
    },
    (err) => {
      assert.equal(err.code, 'MATCH_LOCKED');
      assert.match(err.message, /Match 1.*has verified results and is locked/i);
      return true;
    }
  );
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
  const testUrl = process.env.PGTEST_URL;
  if (!testUrl) {
    t.skip('Skipping real-DB round-trip test: PGTEST_URL environment variable is not set.');
    return;
  }
  assertSafeTestDb(testUrl);

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

test('PHASE 3 DELETE ROADMAP: refuses when team assignments exist (HTTP 409 ROADMAP_HAS_ASSIGNMENTS)', async () => {
  const mockDb = {
    tournament: { id: 'T-ASSIGNED', orgId: 'ORG-1', roadmap_status: 'draft', finalized_at: null },
    results: [],
    assignments: [{ id: 'ASN-1', match_id: 'M-1', tournament_team_id: 'TT-1' }],
  };

  const mockClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM TOURNAMENTS')) {
        return { rows: [mockDb.tournament] };
      }
      if (s.includes('FROM TOURNAMENT_MATCH_RESULTS')) {
        return { rows: mockDb.results };
      }
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        return { rows: mockDb.assignments };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await deleteEntireRoadmap(mockClient, 'T-ASSIGNED');
    },
    (err) => {
      assert.equal(err.code, 'ROADMAP_HAS_ASSIGNMENTS');
      assert.match(err.message, /Cannot delete roadmap because teams are already assigned to matches/i);
      return true;
    }
  );
});

test('PHASE 3 PARTICIPANT PRIVACY: real GET /roadmap handler suppresses organizer-only fields, assignments, and team names for participants', async () => {
  // Setup mock database for real getTournamentRoadmapResponse handler
  const mockDb = {
    tournament: {
      id: 'T-PRIVACY',
      orgId: 'ORG-REAL-1',
      roadmap_status: 'approved',
      rounds_published: true,
      slotsTotal: 64,
      teams_per_group: 16,
      teams_per_match: 16,
      game: 'bgmi',
      room_credentials_release_minutes: 15,
      date: '2026-10-25',
    },
    rounds: [{ id: 'R1', tournament_id: 'T-PRIVACY', round_number: 1, name: 'Round 1 Qualifier', status: 'configured', teams_advancing: 16 }],
    days: [{ id: 'D1', tournament_id: 'T-PRIVACY', day_number: 1, date: '2026-10-25', round_id: 'R1' }],
    groups: [{ id: 'G1', tournament_id: 'T-PRIVACY', day_id: 'D1', group_name: 'District 1', sequence: 1, round_id: 'R1' }],
    rooms: [{ id: 'RM1', tournament_id: 'T-PRIVACY', group_id: 'G1', day_id: 'D1', room_number: 1, capacity: 16, round_id: 'R1' }],
    matches: [
      {
        id: 'M1',
        tournament_id: 'T-PRIVACY',
        day_id: 'D1',
        group_id: 'G1',
        room_id: 'RM1',
        match_number: 1,
        start_time: '23:59', // future match time: credentials not released
        end_time: '00:29',
        status: 'PENDING',
        round_id: 'R1',
        group_name: 'District 1',
        map: 'Erangel',
        room_identifier: 'SECRET_ROOM_ID',
        room_password: 'SECRET_PASSWORD',
      },
    ],
    assignments: [
      { id: 'A1', match_id: 'M1', room_id: 'RM1', tournament_team_id: 'TEAM-SECRET-1' },
      { id: 'A2', match_id: 'M1', room_id: 'RM1', tournament_team_id: 'TEAM-SECRET-2' },
    ],
    registrationGroups: [
      { id: 'RG1', tournament_id: 'T-PRIVACY', group_index: 0, name: 'District 1', capacity: 16 },
    ],
    registrations: [
      { id: 'REG1', team_name: 'Secret Bravo Squad', status: 'confirmed', slot_number: 1, group_id: 'RG1', group_name: 'District 1' },
    ],
    teams: [
      { id: 'TEAM-1', team_name: 'Participant Lions', status: 'confirmed', tournament_id: 'T-PRIVACY', user_id: 'USER-PLAYER-1' },
    ],
  };

  const faithfulMockClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM TOURNAMENTS')) {
        return { rows: [mockDb.tournament] };
      }
      if (s.includes('FROM TOURNAMENT_ROUNDS')) {
        return { rows: mockDb.rounds };
      }
      if (s.includes('FROM TOURNAMENT_DAYS')) {
        return { rows: mockDb.days };
      }
      if (s.includes('FROM TOURNAMENT_GROUPS')) {
        return { rows: mockDb.groups };
      }
      if (s.includes('FROM TOURNAMENT_ROOMS')) {
        return { rows: mockDb.rooms };
      }
      if (s.includes('FROM TOURNAMENT_MATCHES')) {
        return { rows: mockDb.matches };
      }
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        return { rows: mockDb.assignments };
      }
      if (s.includes('FROM TOURNAMENT_REGISTRATION_GROUPS')) {
        return { rows: mockDb.registrationGroups };
      }
      if (s.includes('FROM TOURNAMENT_REGISTRATIONS')) {
        return { rows: mockDb.registrations };
      }
      if (s.includes('FROM TOURNAMENT_TEAMS')) {
        const matchingTeam = mockDb.teams.filter((t) => t.user_id === params[1] || t.id === params[0]);
        return { rows: matchingTeam };
      }
      return { rows: [] };
    },
  };

  // 1. Participant requests published roadmap via the real handler
  const participantAuth = { id: 'USER-PLAYER-1', role: 'user' };
  const participantRes = await getTournamentRoadmapResponse(faithfulMockClient, 'T-PRIVACY', participantAuth, Date.now());

  assert.equal(participantRes.statusCode, 200);
  assert.equal(participantRes.body.mode, 'participant');
  assert.equal(participantRes.body.viewer_is_organizer, false);
  assert.equal(participantRes.body.is_organizer, false);

  // Assertions for participant safety:
  assert.equal(participantRes.body.roadmap.assignments, undefined, 'assignments table must not be returned to participants');
  assert.equal(participantRes.body.roadmap.meta.capacity_warning, undefined, 'capacity_warning must not be in participant meta');
  assert.equal(participantRes.body.roadmap.meta.capacity_mismatch, undefined, 'capacity_mismatch must not be in participant meta');
  assert.equal(participantRes.body.roadmap.districts[0].teams, undefined, 'district teams array must not be in participant response');

  // Verify room credentials are NOT released for future matches
  const matchObj = participantRes.body.roadmap.matches[0];
  assert.equal(matchObj.credentials_available, false);
  assert.equal(matchObj.room_identifier, undefined);
  assert.equal(matchObj.room_password, undefined);

  // Verify that internal secret team rosters are not leaked anywhere in the JSON
  const jsonStr = JSON.stringify(participantRes.body.roadmap);
  assert.equal(jsonStr.includes('capacity_warning'), false);
  assert.equal(jsonStr.includes('capacity_mismatch'), false);
  assert.equal(jsonStr.includes('SECRET_ROOM_ID'), false);
  assert.equal(jsonStr.includes('Secret Bravo Squad'), false);

  // 2. Organizer requests the same roadmap via real handler
  const organizerAuth = { id: 'ORG-REAL-1', role: 'organizer' };
  const organizerRes = await getTournamentRoadmapResponse(faithfulMockClient, 'T-PRIVACY', organizerAuth, Date.now());
  assert.equal(organizerRes.statusCode, 200);
  assert.equal(organizerRes.body.mode, 'organizer');
  assert.equal(organizerRes.body.viewer_is_organizer, true);
  assert.ok(Array.isArray(organizerRes.body.roadmap.assignments), 'organizer must see assignments');

  // 3. Unpublished roadmap gate: ordinary participants and visitors receive NO roadmap draft data
  mockDb.tournament.roadmap_status = 'draft';
  mockDb.tournament.rounds_published = false;
  const unpubRes = await getTournamentRoadmapResponse(faithfulMockClient, 'T-PRIVACY', participantAuth, Date.now());
  assert.equal(unpubRes.statusCode, 200);
  assert.equal(unpubRes.body.published, false);
  assert.equal(unpubRes.body.roadmap, null, 'Unpublished roadmap must return null roadmap to non-organizers');
  assert.equal(unpubRes.body.message, 'Roadmap will be published soon.');
});

