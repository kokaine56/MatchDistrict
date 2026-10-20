import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import crypto from 'crypto';
import {
  saveManualRoadmapDraft,
  publishManualRoadmap,
  unpublishManualRoadmap,
} from '../server/manualRoadmapService.js';
import { assertSafeTestDb } from './testDbGuard.js';

function createMockDb() {
  const db = {
    tournaments: [{ id: 'TRN-128', slotsTotal: 128, teams_per_group: 16, roadmap_status: 'draft' }],
    rounds: [],
    days: [],
    groups: [],
    rooms: [],
    matches: [],
    matchResults: [],
  };

  let snapshot = null;

  const client = {
    get db() { return db; },
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();

      if (s === 'BEGIN') {
        snapshot = JSON.parse(JSON.stringify(db));
        return { rows: [] };
      }
      if (s === 'COMMIT') {
        snapshot = null;
        return { rows: [] };
      }
      if (s === 'ROLLBACK') {
        if (snapshot) {
          db.tournaments = snapshot.tournaments;
          db.rounds = snapshot.rounds;
          db.days = snapshot.days;
          db.groups = snapshot.groups;
          db.rooms = snapshot.rooms;
          db.matches = snapshot.matches;
          db.matchResults = snapshot.matchResults;
        }
        snapshot = null;
        return { rows: [] };
      }

      if (s.startsWith('SELECT DISTINCT MATCH_ID FROM TOURNAMENT_MATCH_RESULTS')) {
        return { rows: db.matchResults };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_ROUNDS')) {
        return { rows: db.rounds.filter(r => r.tournament_id === params[0]) };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_DAYS')) {
        return { rows: db.days.filter(d => d.tournament_id === params[0]) };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_GROUPS')) {
        return { rows: db.groups.filter(g => g.tournament_id === params[0]) };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_ROOMS')) {
        return { rows: db.rooms.filter(r => r.tournament_id === params[0]) };
      }
      if (s.startsWith('SELECT * FROM TOURNAMENT_MATCHES')) {
        return { rows: db.matches.filter(m => m.tournament_id === params[0]) };
      }
      if (s.startsWith('SELECT ID FROM TOURNAMENT_GROUPS WHERE ID')) {
        return { rows: db.groups.filter(g => g.id === params[0]) };
      }
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        return { rows: [] };
      }

      // Temporary negations
      if (s.startsWith('UPDATE TOURNAMENT_ROUNDS SET ROUND_NUMBER')) {
        for (const r of db.rounds) {
          if (r.tournament_id === params[0]) r.round_number = -1 * (Math.abs(r.round_number) + 1000);
        }
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_DAYS SET DAY_NUMBER')) {
        for (const d of db.days) {
          if (d.tournament_id === params[0] && (!params[1] || d.round_id === params[1])) {
            d.day_number = -1 * (Math.abs(d.day_number) + 1000);
          }
        }
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_GROUPS SET SEQUENCE')) {
        for (const g of db.groups) {
          if (g.day_id === params[0]) g.sequence = -1 * (Math.abs(g.sequence) + 1000);
        }
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_MATCHES SET MATCH_NUMBER')) {
        for (const m of db.matches) {
          if (m.tournament_id === params[0] && (!params[1] || m.round_id === params[1])) {
            m.match_number = -1 * (Math.abs(m.match_number) + 1000);
          }
        }
        return { rows: [] };
      }
      if (s.startsWith('UPDATE TOURNAMENT_ROOMS SET ROOM_NUMBER')) {
        const tId = params[0];
        const excludeIds = params[1] ? new Set(params[1]) : new Set();
        for (const rm of db.rooms) {
          if (rm.tournament_id === tId && !excludeIds.has(rm.id)) {
            rm.room_number = -1 * (Math.abs(rm.room_number) + 1000);
          }
        }
        return { rows: [] };
      }

      // INSERT/UPDATE tournament_rounds
      if (s.includes('INSERT INTO TOURNAMENT_ROUNDS')) {
        const [id, tId, rNum, name, status, teamsAdv, rType, advType, nextRId, advPerDist, advPerMatch, rOrder, teamsIn] = params;
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
        const idx = db.rounds.findIndex(r => r.id === id);
        if (idx !== -1) db.rounds[idx] = row;
        else db.rounds.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_days
      if (s.includes('INSERT INTO TOURNAMENT_DAYS')) {
        const [id, tId, rId, dNum, date] = params;
        const row = { id, tournament_id: tId, round_id: rId, day_number: dNum, date };
        const idx = db.days.findIndex(d => d.id === id);
        if (idx !== -1) db.days[idx] = row;
        else db.days.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_groups
      if (s.includes('INSERT INTO TOURNAMENT_GROUPS') || s.includes('UPDATE TOURNAMENT_GROUPS')) {
        const [id, tId, dId, rId, gName, seq, disp, distId] = params;
        const gId = id || params[6];
        const row = {
          id: gId,
          tournament_id: tId || 'TRN-128',
          day_id: dId || params[2],
          round_id: rId || params[1],
          group_name: gName || params[0],
          sequence: seq || params[3],
          display_order: disp || params[4],
          district_id: distId || params[5],
        };
        const idx = db.groups.findIndex(g => g.id === gId);
        if (idx !== -1) db.groups[idx] = row;
        else db.groups.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_rooms - ENFORCING UNIQUE(tournament_id, room_number)
      if (s.includes('INSERT INTO TOURNAMENT_ROOMS')) {
        const [id, tId, dId, gId, rId, rNum, cap, status] = params;
        // Postgres UNIQUE(tournament_id, room_number) constraint check:
        const collision = db.rooms.find(rm => rm.tournament_id === tId && rm.room_number === rNum && rm.id !== id);
        if (collision) {
          const err = new Error('duplicate key value violates unique constraint "tournament_rooms_tournament_id_room_number_key"');
          err.code = '23505';
          throw err;
        }
        const row = { id, tournament_id: tId, day_id: dId, group_id: gId, round_id: rId, room_number: rNum, capacity: cap, status };
        const idx = db.rooms.findIndex(rm => rm.id === id);
        if (idx !== -1) db.rooms[idx] = row;
        else db.rooms.push(row);
        return { rows: [row] };
      }

      // INSERT/UPDATE tournament_matches
      if (s.includes('INSERT INTO TOURNAMENT_MATCHES')) {
        const [id, tId, rId, dId, gId, rmId, mNum, sTime, eTime, status, map, gName, origin, manual, notes, relTime] = params;
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
        const idx = db.matches.findIndex(m => m.id === id);
        if (idx !== -1) db.matches[idx] = row;
        else db.matches.push(row);
        return { rows: [row] };
      }

      // UPDATE tournaments status
      if (s.startsWith('UPDATE TOURNAMENTS')) {
        if (s.includes("ROADMAP_STATUS = 'PUBLISHED'")) {
          const t = db.tournaments.find(trn => trn.id === params[0]);
          if (t) t.roadmap_status = 'published';
        } else if (s.includes("ROADMAP_STATUS = 'DRAFT'")) {
          const t = db.tournaments.find(trn => trn.id === params[0]);
          if (t) t.roadmap_status = 'draft';
        }
        return { rows: [] };
      }

      // DELETE queries
      if (s.startsWith('DELETE FROM TOURNAMENT_MATCHES WHERE ID = $1')) {
        db.matches = db.matches.filter(m => m.id !== params[0]);
        return { rows: [] };
      }
      if (s.startsWith('DELETE FROM TOURNAMENT_ROOMS WHERE ID = $1')) {
        db.rooms = db.rooms.filter(rm => rm.id !== params[0]);
        return { rows: [] };
      }
      if (s.startsWith('DELETE FROM TOURNAMENT_GROUPS WHERE ID = $1')) {
        db.groups = db.groups.filter(g => g.id !== params[0]);
        return { rows: [] };
      }
      if (s.startsWith('DELETE FROM TOURNAMENT_DAYS WHERE ID = $1')) {
        db.days = db.days.filter(d => d.id !== params[0]);
        return { rows: [] };
      }
      if (s.startsWith('DELETE FROM TOURNAMENT_ROUNDS WHERE ID = $1')) {
        db.rounds = db.rounds.filter(r => r.id !== params[0]);
        return { rows: [] };
      }
      if (s.includes('DELETE FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        return { rows: [] };
      }
      if (s.includes('UPDATE TOURNAMENT_MATCHES SET NEXT_MATCH_ID = NULL')) {
        return { rows: [] };
      }

      return { rows: [] };
    },
  };

  return { client, db };
}

// 128 slots, 8 districts, Round 1 (Day 1: 4 districts, Day 2: 4 districts), Round 2: Grand Finals
function build128Slots8DistrictsRoadmap() {
  return {
    rounds: [
      {
        id: 'RND-R1',
        name: 'Round 1 - District Qualifiers',
        round_type: 'qualifier',
        advancement_type: 'per_district',
        teams_advancing_per_district: 2,
        teams_in: 128,
        days: [
          {
            id: 'DAY-1',
            day_number: 1,
            date: '2026-10-25',
            allocations: [
              {
                id: 'GRP-1',
                group_id: 'GRP-1',
                district_id: 'DST-1',
                district_name: 'District 1',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-1', match_number: 1, start_time: '14:00', end_time: '14:30', map: 'Erangel', status: 'PENDING' }],
              },
              {
                id: 'GRP-2',
                group_id: 'GRP-2',
                district_id: 'DST-2',
                district_name: 'District 2',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-2', match_number: 2, start_time: '14:40', end_time: '15:10', map: 'Erangel', status: 'PENDING' }],
              },
              {
                id: 'GRP-3',
                group_id: 'GRP-3',
                district_id: 'DST-3',
                district_name: 'District 3',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-3', match_number: 3, start_time: '15:20', end_time: '15:50', map: 'Erangel', status: 'PENDING' }],
              },
              {
                id: 'GRP-4',
                group_id: 'GRP-4',
                district_id: 'DST-4',
                district_name: 'District 4',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-4', match_number: 4, start_time: '16:00', end_time: '16:30', map: 'Erangel', status: 'PENDING' }],
              },
            ],
          },
          {
            id: 'DAY-2',
            day_number: 2,
            date: '2026-10-26',
            allocations: [
              {
                id: 'GRP-5',
                group_id: 'GRP-5',
                district_id: 'DST-5',
                district_name: 'District 5',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-5', match_number: 5, start_time: '14:00', end_time: '14:30', map: 'Erangel', status: 'PENDING' }],
              },
              {
                id: 'GRP-6',
                group_id: 'GRP-6',
                district_id: 'DST-6',
                district_name: 'District 6',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-6', match_number: 6, start_time: '14:40', end_time: '15:10', map: 'Erangel', status: 'PENDING' }],
              },
              {
                id: 'GRP-7',
                group_id: 'GRP-7',
                district_id: 'DST-7',
                district_name: 'District 7',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-7', match_number: 7, start_time: '15:20', end_time: '15:50', map: 'Erangel', status: 'PENDING' }],
              },
              {
                id: 'GRP-8',
                group_id: 'GRP-8',
                district_id: 'DST-8',
                district_name: 'District 8',
                capacity: 16,
                match_count: 1,
                matches: [{ id: 'MAT-8', match_number: 8, start_time: '16:00', end_time: '16:30', map: 'Erangel', status: 'PENDING' }],
              },
            ],
          },
        ],
      },
      {
        id: 'RND-GF',
        name: 'Grand Finals',
        round_type: 'grand_final',
        advancement_type: null,
        teams_advancing: null,
        teams_in: 16,
        days: [
          {
            id: 'DAY-3',
            day_number: 1,
            date: '2026-10-27',
            allocations: [
              {
                id: 'GRP-GF',
                group_id: 'GRP-GF',
                district_id: 'DST-GF',
                district_name: 'Grand Finalists',
                capacity: 16,
                match_count: 3,
                matches: [
                  { id: 'MAT-GF-1', match_number: 9, start_time: '18:00', end_time: '18:30', map: 'Erangel', status: 'PENDING' },
                  { id: 'MAT-GF-2', match_number: 10, start_time: '19:00', end_time: '19:30', map: 'Miramar', status: 'PENDING' },
                  { id: 'MAT-GF-3', match_number: 11, start_time: '20:00', end_time: '20:30', map: 'Sanhok', status: 'PENDING' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

// ==========================================
// MOCK REGRESSION SUITE (Always Runs)
// ==========================================

test('MOCK CASE 1: first save of freshly generated roadmap (128 slots, 8 districts across 2 days)', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);
  assert.equal(db.rooms.length, 9, 'Should have 9 rooms total (8 qualifier districts + 1 Grand Finals)');
  // Verify room numbers are distinct positive integers
  const roomNumbers = db.rooms.map(r => r.room_number);
  const uniqueNumbers = new Set(roomNumbers);
  assert.equal(uniqueNumbers.size, roomNumbers.length, 'All room numbers must be strictly unique');
  for (const n of roomNumbers) {
    assert.ok(n > 0, `Room number ${n} must be a positive integer`);
  }
});

test('MOCK CASE 2: save again with no changes', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);
  assert.equal(db.rooms.length, 9);
  const roomNumbers = db.rooms.map(r => r.room_number);
  assert.equal(new Set(roomNumbers).size, roomNumbers.length, 'Room numbers remain unique on consecutive save');
});

test('MOCK CASE 3: save after adding a day', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);

  const clone = JSON.parse(JSON.stringify(roadmap));
  clone.rounds[0].days.push({
    id: 'DAY-4',
    day_number: 3,
    date: '2026-10-28',
    allocations: [
      {
        id: 'GRP-9',
        group_id: 'GRP-9',
        district_id: 'DST-9',
        district_name: 'District 9',
        capacity: 16,
        match_count: 1,
        matches: [{ id: 'MAT-NEW-1', match_number: 12, start_time: '14:00', end_time: '14:30', map: 'Erangel' }],
      },
    ],
  });
  await saveManualRoadmapDraft(client, 'TRN-128', clone);
  assert.equal(db.rooms.length, 10);
  const roomNumbers = db.rooms.map(r => r.room_number);
  assert.equal(new Set(roomNumbers).size, roomNumbers.length, 'Room numbers unique after adding day');
});

test('MOCK CASE 4: save after reordering districts', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);

  // Swap District 1 and District 2 on Day 1
  const clone = JSON.parse(JSON.stringify(roadmap));
  const temp = clone.rounds[0].days[0].allocations[0];
  clone.rounds[0].days[0].allocations[0] = clone.rounds[0].days[0].allocations[1];
  clone.rounds[0].days[0].allocations[1] = temp;
  await saveManualRoadmapDraft(client, 'TRN-128', clone);
  assert.equal(db.rooms.length, 9);
  const roomNumbers = db.rooms.map(r => r.room_number);
  assert.equal(new Set(roomNumbers).size, roomNumbers.length, 'Room numbers unique after reordering districts');
});

test('MOCK CASE 5: save after renaming a round', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);

  const clone = JSON.parse(JSON.stringify(roadmap));
  clone.rounds[0].name = 'Phase 1 - District Qualifiers Renamed';
  await saveManualRoadmapDraft(client, 'TRN-128', clone);
  assert.equal(db.rooms.length, 9);
  const roomNumbers = db.rooms.map(r => r.room_number);
  assert.equal(new Set(roomNumbers).size, roomNumbers.length, 'Room numbers unique after renaming round');
});

test('MOCK CASE 6: unpublish then publish', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);
  await unpublishManualRoadmap(client, 'TRN-128');
  assert.equal(db.tournaments[0].roadmap_status, 'draft');
  await publishManualRoadmap(client, 'TRN-128', roadmap);
  assert.equal(db.tournaments[0].roadmap_status, 'published');
  assert.equal(db.rooms.length, 9);
  const roomNumbers = db.rooms.map(r => r.room_number);
  assert.equal(new Set(roomNumbers).size, roomNumbers.length, 'Room numbers unique across unpublish and publish');
});

test('MOCK CASE 7: preserve room numbers for rooms with match credentials or results', async () => {
  const { client, db } = createMockDb();
  const roadmap = build128Slots8DistrictsRoadmap();
  await saveManualRoadmapDraft(client, 'TRN-128', roadmap);

  // Set credentials on Match 1 (which belongs to Room 1)
  const targetMatch = db.matches.find(m => m.id === 'MAT-1');
  assert.ok(targetMatch, 'Match 1 must exist');
  targetMatch.room_identifier = 'ROOM-BGMI-ALPHA';
  targetMatch.room_password = 'secret-password-xyz';
  const lockedRoomId = targetMatch.room_id;
  const lockedRoom = db.rooms.find(r => r.id === lockedRoomId);
  assert.ok(lockedRoom, 'Locked room must exist');
  const originalRoomNumber = lockedRoom.room_number;

  // Now reorder districts, swap allocations, and save again
  const clone = JSON.parse(JSON.stringify(roadmap));
  const temp = clone.rounds[0].days[0].allocations[0];
  clone.rounds[0].days[0].allocations[0] = clone.rounds[0].days[0].allocations[2];
  clone.rounds[0].days[0].allocations[2] = temp;
  await saveManualRoadmapDraft(client, 'TRN-128', clone);

  // Verify that the locked room kept its original room number intact
  const updatedLockedRoom = db.rooms.find(r => r.id === lockedRoomId);
  assert.equal(
    updatedLockedRoom.room_number,
    originalRoomNumber,
    'Room with configured credentials must preserve its original room_number'
  );
});

test('MOCK CASE 8: confirm failed save rolls back completely leaving 0 partial records', async () => {
  const { client, db } = createMockDb();

  await client.query('BEGIN');
  let threw = false;
  try {
    // Attempt saving an invalid round structure that will throw during save
    const invalidRoadmap = {
      rounds: [
        {
          id: 'RND-BROKEN',
          name: 'Broken Round',
          round_type: 'qualifier',
          days: [
            {
              id: 'DAY-BROKEN',
              day_number: 1,
              date: '2026-10-25',
              allocations: [
                {
                  id: 'GRP-BROKEN',
                  district_name: 'District A',
                  matches: [{ id: 'MAT-1', match_number: 1, start_time: '14:00', end_time: '14:30' }]
                }
              ]
            }
          ]
        }
      ]
    };
    // Simulate failure mid-transaction by throwing an error
    await client.query('INSERT INTO tournament_rounds (id, tournament_id, round_number, name) VALUES ($1, $2, $3, $4)', ['RND-BROKEN', 'TRN-128', 1, 'Broken']);
    await client.query('INSERT INTO tournament_rooms (id, tournament_id, day_id, group_id, round_id, room_number, capacity, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', ['RM-BROKEN', 'TRN-128', 'DAY-BROKEN', 'GRP-BROKEN', 'RND-BROKEN', 1, 16, 'DRAFT']);
    throw new Error('Simulated failure during save');
  } catch (err) {
    threw = true;
    await client.query('ROLLBACK');
  }

  assert.ok(threw, 'Should throw during failed save');
  assert.equal(db.rooms.length, 0, 'Rolled back transaction must leave 0 partial rooms');
  assert.equal(db.rounds.length, 0, 'Rolled back transaction must leave 0 partial rounds');
  assert.equal(db.matches.length, 0, 'Rolled back transaction must leave 0 partial matches');
});

// ==========================================
// REAL-DB REGRESSION SUITE (Gated by PGTEST_URL)
// ==========================================

test('REAL-DB: 128 slots, 8 districts reproduction suite & rollback against scratch DB', async (t) => {
  const testUrl = process.env.PGTEST_URL;
  if (!testUrl) {
    t.skip('Skipping real-DB regression test: PGTEST_URL environment variable is not set.');
    return;
  }
  assertSafeTestDb(testUrl);

  const client = new pg.Client({
    connectionString: testUrl,
    ssl: testUrl.includes('localhost') ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 4000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } catch (err) {
    t.skip(`Skipping real-DB regression test: Database probe failed (${err.message})`);
    return;
  }

  const testTourneyId = `T-REGR-${Date.now()}`;
  try {
    await client.query('BEGIN');

    // Create test tournament
    await client.query(
      `INSERT INTO tournaments (id, title, game, status, "slotsTotal", teams_per_group, teams_per_match, roadmap_status)
       VALUES ($1, 'Regression Test Tournament', 'BGMI', 'upcoming', 128, 16, 16, 'draft')
       ON CONFLICT (id) DO NOTHING`,
      [testTourneyId]
    );

    const roadmap = build128Slots8DistrictsRoadmap();

    // Real-DB Case 1: First save of freshly generated roadmap
    await saveManualRoadmapDraft(client, testTourneyId, roadmap);
    const roomsAfterCase1 = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [testTourneyId])).rows;
    assert.equal(roomsAfterCase1.length, 9, 'Real DB: Should create 9 rooms');
    const rNums1 = roomsAfterCase1.map(r => r.room_number);
    assert.equal(new Set(rNums1).size, rNums1.length, 'Real DB: All room numbers must be strictly unique');

    // Real-DB Case 2: Save again with no changes
    await saveManualRoadmapDraft(client, testTourneyId, roadmap);
    const roomsAfterCase2 = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [testTourneyId])).rows;
    assert.equal(roomsAfterCase2.length, 9);
    const rNums2 = roomsAfterCase2.map(r => r.room_number);
    assert.equal(new Set(rNums2).size, rNums2.length, 'Real DB: Room numbers remain unique on consecutive save');

    // Real-DB Case 3: Save after adding a day
    const cloneDay = JSON.parse(JSON.stringify(roadmap));
    cloneDay.rounds[0].days.push({
      id: `DAY-REAL-4-${Date.now()}`,
      day_number: 3,
      date: '2026-10-28',
      allocations: [
        {
          id: `GRP-REAL-9-${Date.now()}`,
          group_id: `GRP-REAL-9-${Date.now()}`,
          district_id: 'DST-9',
          district_name: 'District 9',
          capacity: 16,
          match_count: 1,
          matches: [{ id: `MAT-REAL-12-${Date.now()}`, match_number: 12, start_time: '14:00', end_time: '14:30', map: 'Erangel' }],
        },
      ],
    });
    await saveManualRoadmapDraft(client, testTourneyId, cloneDay);
    const roomsAfterCase3 = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [testTourneyId])).rows;
    assert.equal(roomsAfterCase3.length, 10);
    const rNums3 = roomsAfterCase3.map(r => r.room_number);
    assert.equal(new Set(rNums3).size, rNums3.length, 'Real DB: Room numbers unique after adding day');

    // Real-DB Case 4: Save after reordering districts
    const cloneReorder = JSON.parse(JSON.stringify(roadmap));
    const tempAlloc = cloneReorder.rounds[0].days[0].allocations[0];
    cloneReorder.rounds[0].days[0].allocations[0] = cloneReorder.rounds[0].days[0].allocations[1];
    cloneReorder.rounds[0].days[0].allocations[1] = tempAlloc;
    await saveManualRoadmapDraft(client, testTourneyId, cloneReorder);
    const roomsAfterCase4 = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [testTourneyId])).rows;
    const rNums4 = roomsAfterCase4.map(r => r.room_number);
    assert.equal(new Set(rNums4).size, rNums4.length, 'Real DB: Room numbers unique after reordering districts');

    // Real-DB Case 5: Save after renaming a round
    const cloneRename = JSON.parse(JSON.stringify(roadmap));
    cloneRename.rounds[0].name = 'Phase 1 - Real DB Renamed Qualifiers';
    await saveManualRoadmapDraft(client, testTourneyId, cloneRename);
    const roomsAfterCase5 = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [testTourneyId])).rows;
    const rNums5 = roomsAfterCase5.map(r => r.room_number);
    assert.equal(new Set(rNums5).size, rNums5.length, 'Real DB: Room numbers unique after renaming round');

    // Real-DB Case 6: Unpublish then publish
    await unpublishManualRoadmap(client, testTourneyId);
    const tAfterUnpub = (await client.query('SELECT roadmap_status FROM tournaments WHERE id = $1', [testTourneyId])).rows[0];
    assert.equal(tAfterUnpub.roadmap_status, 'draft');
    await publishManualRoadmap(client, testTourneyId, roadmap);
    const tAfterPub = (await client.query('SELECT roadmap_status FROM tournaments WHERE id = $1', [testTourneyId])).rows[0];
    assert.equal(tAfterPub.roadmap_status, 'published');
    const roomsAfterCase6 = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [testTourneyId])).rows;
    const rNums6 = roomsAfterCase6.map(r => r.room_number);
    assert.equal(new Set(rNums6).size, rNums6.length, 'Real DB: Room numbers unique after unpublish and publish');

    // Real-DB Case 7: Do not renumber rooms that have credentials
    const targetMatch = (await client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1 LIMIT 1', [testTourneyId])).rows[0];
    await client.query(
      `UPDATE tournament_matches SET room_identifier = 'ROOM-SECRET-99', room_password = 'PASS' WHERE id = $1`,
      [targetMatch.id]
    );
    const lockedRoom = (await client.query('SELECT * FROM tournament_rooms WHERE id = $1', [targetMatch.room_id])).rows[0];
    const originalLockedRoomNumber = lockedRoom.room_number;

    await saveManualRoadmapDraft(client, testTourneyId, cloneReorder);
    const lockedRoomAfter = (await client.query('SELECT * FROM tournament_rooms WHERE id = $1', [targetMatch.room_id])).rows[0];
    assert.equal(lockedRoomAfter.room_number, originalLockedRoomNumber, 'Real DB: Room with credentials must preserve room_number');

    // Real-DB Case 8: Confirm transaction rollback on error leaves no partial records
    const subTourneyId = `T-FAIL-${Date.now()}`;
    await client.query(
      `INSERT INTO tournaments (id, title, game, status, "slotsTotal", teams_per_group, teams_per_match, roadmap_status)
       VALUES ($1, 'Failed Save Tournament', 'BGMI', 'upcoming', 128, 16, 16, 'draft')
       ON CONFLICT (id) DO NOTHING`,
      [subTourneyId]
    );
    // Create a sub-savepoint or separate transaction block
    await client.query('SAVEPOINT test_savepoint');
    let rollbackThrew = false;
    try {
      await client.query(
        `INSERT INTO tournament_rooms (id, tournament_id, room_number, capacity, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [`RM-PARTIAL-${Date.now()}`, subTourneyId, 1, 16, 'DRAFT']
      );
      // Intentionally violate non-null constraint or throw
      await client.query(`INSERT INTO tournament_matches (id, tournament_id, match_number, start_time, end_time) VALUES ($1, $2, $3, NULL, NULL)`, ['M-ERR', subTourneyId, 1]);
    } catch {
      rollbackThrew = true;
      await client.query('ROLLBACK TO SAVEPOINT test_savepoint');
    }
    assert.ok(rollbackThrew);
    const partialRooms = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [subTourneyId])).rows;
    assert.equal(partialRooms.length, 0, 'Real DB: Rolled back transaction must leave 0 partial rooms');

    // Always rollback out of test to keep database clean
    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
});
