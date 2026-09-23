import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { allocateTeam, AllocationError, ALLOCATION_SOURCES, ALLOCATION_ERR } from '../server/allocationService.js';

// DB-backed allocation tests. These run only when a test database is reachable;
// otherwise they skip cleanly (see PGTEST_URL / local Supabase dev pool). Every
// transaction-bound test rolls back, so the database is never mutated. The one
// concurrency test commits its seed then explicitly cleans up. Full transactional
// integration (approved-roadmap gate, capacity, audit, idempotency, eligibility,
// rollback, scale) is verified here.
const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1')
  ? false
  : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';

test('allocation: database availability probe', async () => {
  const probe = new pg.Client({ connectionString: TEST_URL, ssl: SSL, connectionTimeoutMillis: 3000 });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    dbReady = true;
  } catch (err) {
    dbProbeMessage = err.message || String(err);
  } finally {
    await probe.end().catch(() => {});
  }
});

async function withTransaction(fn, t) {
  if (!dbReady) {
    t.skip(`No test database reachable (${TEST_URL}): ${dbProbeMessage}`);
    return { ran: false };
  }
  const client = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await client.connect();
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('ROLLBACK');
    return { ran: true, result };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// --- seed helpers ---
async function insertUser(client, id) {
  await client.query(
    'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)',
    [id, `${id.toLowerCase()}@alloc.test`, `User ${id}`, 'x']
  );
}

async function insertTournament(client, id, matchType = 'squad', approved = true) {
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, match_type, "orgId")
     VALUES ($1, $2, 'BGMI', 'upcoming', $3, $4)`,
    [id, `Allocation test ${id}`, matchType, `ORG-${id}`]
  );
  if (approved) {
    await client.query(`UPDATE tournaments SET roadmap_status = 'approved' WHERE id = $1`, [id]);
  }
}

async function insertRegistration(client, id, tournamentId, userId, teamName, status) {
  await client.query(
    `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tournamentId, userId, teamName, 'Captain ' + teamName, status]
  );
}

async function seedRounds(client, tournamentId, roundRows = []) {
  if (roundRows.length === 0) return;
  for (const r of roundRows) {
    const rid = `RND-${tournamentId}-${r.roundNumber}`;
    await client.query(
      `INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, "date", "time")
       VALUES ($1, $2, $3, $4, 'configured', $5, $6, $7) ON CONFLICT DO NOTHING`,
      [rid, tournamentId, r.roundNumber, r.name || `Round ${r.roundNumber}`, r.teamsAdvancing ?? null, r.date || null, r.time || null]
    );
  }
}

// Creates a single room (with dayNumber/groupIdx demolition) plus matches.
async function seedRoom(client, tournamentId, roomNumber, capacity, { dayNumber = 1, groupIdx = 1, matches = 1, roundId = null } = {}) {
  const dayId = `DAY-${tournamentId}-${dayNumber}`;
  const groupId = `GRP-${tournamentId}-${dayNumber}-${groupIdx}`;
  const roomId = `RM-${tournamentId}-${dayNumber}-${groupIdx}-${roomNumber}`;
  await client.query(
    'INSERT INTO tournament_days (id, tournament_id, day_number, date, round_id) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [dayId, tournamentId, dayNumber, '2026-11-01', roundId]
  );
  await client.query(
    'INSERT INTO tournament_groups (id, day_id, tournament_id, group_name, sequence, round_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
    [groupId, dayId, tournamentId, `Group ${String.fromCharCode(64 + groupIdx)}`, groupIdx, roundId]
  );
  await client.query(
    'INSERT INTO tournament_rooms (id, group_id, day_id, tournament_id, room_number, capacity, round_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',
    [roomId, groupId, dayId, tournamentId, roomNumber, capacity, roundId]
  );
  for (let m = 1; m <= matches; m++) {
    await client.query(
      `INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, round_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
      [`MAT-${roomId}-${m}`, roomId, groupId, dayId, tournamentId, m, '10:00', '10:25', roundId]
    );
  }
  return { dayId, groupId, roomId };
}

async function seedVerifiedTeam(client, tournamentId, teamId, leaderId, name, registrationId = null, status = 'verified') {
  await insertUser(client, leaderId);
  await client.query(
    'INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status, registration_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [teamId, tournamentId, name, leaderId, status, registrationId]
  );
}

async function assignmentCount(client, teamId, tournamentId) {
  const res = await client.query(
    'SELECT COUNT(*)::int AS c FROM tournament_match_assignments WHERE tournament_team_id = $1 AND tournament_id = $2',
    [teamId, tournamentId]
  );
  return res.rows[0].c;
}

async function teamStatus(client, teamId) {
  const res = await client.query('SELECT status FROM tournament_teams WHERE id = $1', [teamId]);
  if (res.rows.length === 0) return null;
  return res.rows[0].status;
}

// --- 1/2/4: verified team placed in an approved roadmap ---
test('allocation: verified team placed into the first room of an approved roadmap (auto)', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A1');
    await seedRoom(client, 'T-A1', 1, 4, { matches: 2 });
    await insertUser(client, 'U-A1');
    await insertRegistration(client, 'R-A1', 'T-A1', 'U-A1', 'Alpha', 'approved');
    await seedVerifiedTeam(client, 'T-A1', 'TEAM-A1', 'U-A1', 'Alpha Squad', 'R-A1');

    const out = await allocateTeam(client, { teamId: 'TEAM-A1', tournamentId: 'T-A1', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: 'U-A1' });
    assert.strictEqual(out.status, 'allocated');
    assert.strictEqual(out.room.id, 'RM-T-A1-1-1-1');
    assert.strictEqual(out.matchIds.length, 2, 'one assignment per match in the room');

    const rows = (await client.query('SELECT * FROM tournament_match_assignments WHERE tournament_team_id=$1 AND tournament_id=$2 ORDER BY match_id', ['TEAM-A1', 'T-A1'])).rows;
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].source, 'automatic');
    assert.strictEqual(rows[0].group_id, 'GRP-T-A1-1-1');
    assert.strictEqual(rows[0].day_id, 'DAY-T-A1-1');
    assert.strictEqual(await teamStatus(client, 'TEAM-A1'), 'allocated');
  }, t);
});

// --- 2/3/18: approved-roadmap-only (both automatic and manual reject) ---
test('allocation: an unapproved roadmap rejects with ROADMAP_NOT_APPROVED on both flows', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A2', 'squad', false);
    await seedRoom(client, 'T-A2', 1, 4); // roadmap_rows exist but status stays 'pending'
    await seedVerifiedTeam(client, 'T-A2', 'TEAM-A2', 'U-A2', 'Bravo Squad');

    await assert.rejects(
      allocateTeam(client, { teamId: 'TEAM-A2', tournamentId: 'T-A2', source: ALLOCATION_SOURCES.AUTOMATIC }),
      (err) => {
        assert.ok(err instanceof AllocationError);
        assert.strictEqual(err.code, ALLOCATION_ERR.ROADMAP_NOT_APPROVED);
        return true;
      }
    );
    await assert.rejects(
      allocateTeam(client, {
        teamId: 'TEAM-A2', tournamentId: 'T-A2', source: ALLOCATION_SOURCES.ORGANIZER,
        options: { roomId: 'RM-T-A2-1-1-1', matchId: 'MAT-RM-T-A2-1-1-1-1', reason: 'x' },
      }),
      (err) => {
        assert.ok(err instanceof AllocationError);
        assert.strictEqual(err.code, ALLOCATION_ERR.ROADMAP_NOT_APPROVED);
        return true;
      }
    );
    assert.strictEqual(await teamStatus(client, 'TEAM-A2'), 'verified', 'no state change on rejected allocation');
    assert.strictEqual(await assignmentCount(client, 'TEAM-A2', 'T-A2'), 0);
  }, t);
});

// --- 5/6/14/15: capacity fill → next room → no-position deferred as allocation_pending ---
test('allocation: fills rooms to capacity, then returns allocation_pending when no position exists', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A3');
    await seedRoom(client, 'T-A3', 1, 2, { matches: 1 });
    await seedRoom(client, 'T-A3', 2, 2, { matches: 1 });

    for (let i = 1; i <= 4; i++) {
      await seedVerifiedTeam(client, 'T-A3', `TEAM-A3-${i}`, `U-A3-${i}`, `Team ${i}`);
    }
    const placed = [];
    for (let i = 1; i <= 4; i++) {
      const out = await allocateTeam(client, { teamId: `TEAM-A3-${i}`, tournamentId: 'T-A3', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: `U-A3-${i}` });
      assert.strictEqual(out.status, 'allocated');
      placed.push(out.room.room_number);
    }
    // Earliest room fills first (room 1 → room 2 by room_number ordering).
    placed.sort((a, b) => a - b);
    assert.deepStrictEqual(placed, [1, 1, 2, 2]);
    assert.deepStrictEqual(placed.filter((n) => n === 1).length, 2);

    for (const r of ['RM-T-A3-1-1-1', 'RM-T-A3-2-1-1']) {
      const c = (await client.query('SELECT COUNT(DISTINCT tournament_team_id)::int AS n FROM tournament_match_assignments WHERE room_id=$1 AND tournament_id=$2', [r, 'T-A3'])).rows[0].n;
      assert.strictEqual(c, 2, 'room never exceeds its capacity');
    }

    await seedVerifiedTeam(client, 'T-A3', 'TEAM-A3-5', 'U-A3-5', 'Team 5');
    const pending = await allocateTeam(client, { teamId: 'TEAM-A3-5', tournamentId: 'T-A3', source: ALLOCATION_SOURCES.AUTOMATIC });
    assert.strictEqual(pending.status, 'allocation_pending');
    assert.strictEqual(pending.code, ALLOCATION_ERR.NO_AVAILABLE_POSITION);
    assert.strictEqual(await teamStatus(client, 'TEAM-A3-5'), 'allocation_pending');
    assert.strictEqual(await assignmentCount(client, 'TEAM-A3-5', 'T-A3'), 0);
  }, t);
});

// --- 10/11: Round 1 only; later rounds never populated by automatic allocation ---
test('allocation: rooms in later rounds are never used for automatic placement', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A10');
    await seedRounds(client, 'T-A10', [
      { roundNumber: 1, name: 'Qualifier', teamsAdvancing: 2 },
      { roundNumber: 2, name: 'Final', teamsAdvancing: 1 },
    ]);
    // Round 1 room with capacity 1 (fills to full)
    const rnd1 = (await client.query('SELECT id FROM tournament_rounds WHERE tournament_id=$1 AND round_number=1', ['T-A10'])).rows[0].id;
    const rnd2 = (await client.query('SELECT id FROM tournament_rounds WHERE tournament_id=$1 AND round_number=2', ['T-A10'])).rows[0].id;
    await seedRoom(client, 'T-A10', 1, 1, { matches: 1, roundId: rnd1 });
    await seedRoom(client, 'T-A10', 7, 4, { matches: 1, roundId: rnd2 }); // plenty of space, round 2

    await seedVerifiedTeam(client, 'T-A10', 'TEAM-A10-1', 'U-A10-1', 'Round1 A');
    const out = await allocateTeam(client, { teamId: 'TEAM-A10-1', tournamentId: 'T-A10', source: ALLOCATION_SOURCES.AUTOMATIC });
    assert.strictEqual(out.status, 'allocated');
    assert.strictEqual(out.room.room_number, 1, 'room 1 fills first');

    // Round 1 now full; the room with space is round 2 — must NOT be chosen.
    await seedVerifiedTeam(client, 'T-A10', 'TEAM-A10-2', 'U-A10-2', 'Round1 B');
    const pending = await allocateTeam(client, { teamId: 'TEAM-A10-2', tournamentId: 'T-A10', source: ALLOCATION_SOURCES.AUTOMATIC });
    assert.strictEqual(pending.status, 'allocation_pending');
    assert.strictEqual(pending.code, ALLOCATION_ERR.NO_AVAILABLE_POSITION);
    const inRound2 = (await client.query(
      `SELECT COUNT(*)::int AS c FROM tournament_match_assignments a JOIN tournament_rooms r ON a.room_id=r.id WHERE a.tournament_id=$1 AND r.round_id=$2`,
      ['T-A10', rnd2]
    )).rows[0].c;
    assert.strictEqual(inRound2, 0, 'no assignment ever targets a later round');
  }, t);
});

// --- 12/16/27: duplicate prevented; existing assignments stable; idempotent rerun ---
test('allocation: allocating a second team leaves the first untouched; rerun is idempotent', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A4');
    await seedRoom(client, 'T-A4', 1, 4, { matches: 2 });
    await seedVerifiedTeam(client, 'T-A4', 'TEAM-A4A', 'U-A4A', 'Alpha');
    await seedVerifiedTeam(client, 'T-A4', 'TEAM-A4B', 'U-A4B', 'Bravo');

    const aOut = await allocateTeam(client, { teamId: 'TEAM-A4A', tournamentId: 'T-A4', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: 'U-A4A' });
    assert.strictEqual(aOut.assignmentCount, 2);
    const snapA = (await client.query('SELECT match_id, room_id, source FROM tournament_match_assignments WHERE tournament_team_id=$1 ORDER BY match_id', ['TEAM-A4A'])).rows;
    assert.deepStrictEqual(snapA.map((r) => [r.match_id, r.room_id, r.source]), [
      ['MAT-RM-T-A4-1-1-1-1', 'RM-T-A4-1-1-1', 'automatic'],
      ['MAT-RM-T-A4-1-1-1-2', 'RM-T-A4-1-1-1', 'automatic'],
    ]);

    const bOut = await allocateTeam(client, { teamId: 'TEAM-A4B', tournamentId: 'T-A4', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: 'U-A4B' });
    assert.strictEqual(bOut.status, 'allocated');
    const snapAAfterB = (await client.query('SELECT match_id, room_id, source FROM tournament_match_assignments WHERE tournament_team_id=$1 ORDER BY match_id', ['TEAM-A4A'])).rows;
    assert.deepStrictEqual(snapAAfterB.map((r) => [r.match_id, r.room_id, r.source]), [
      ['MAT-RM-T-A4-1-1-1-1', 'RM-T-A4-1-1-1', 'automatic'],
      ['MAT-RM-T-A4-1-1-1-2', 'RM-T-A4-1-1-1', 'automatic'],
    ], 'team A rows never change');

    const dup = await allocateTeam(client, { teamId: 'TEAM-A4A', tournamentId: 'T-A4', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: 'U-A4A' });
    assert.strictEqual(dup.alreadyAllocated, true);
    assert.strictEqual(await assignmentCount(client, 'TEAM-A4A', 'T-A4'), 2, 'no duplicate rows on rerun');
  }, t);
});

// --- 17/20: manual move (organizer) to a chosen room+match; already-allocated can move ---
test('allocation: manual move relocates a team to the chosen room+match (single row, audit)', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A5');
    await seedRoom(client, 'T-A5', 1, 4, { matches: 2 });
    await seedRoom(client, 'T-A5', 2, 4, { matches: 2 });
    await seedVerifiedTeam(client, 'T-A5', 'TEAM-A5', 'U-A5', 'India');

    // Auto-allocate into room 1 first.
    const auto = await allocateTeam(client, { teamId: 'TEAM-A5', tournamentId: 'T-A5', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: 'U-A5' });
    assert.strictEqual(auto.room.room_number, 1);
    assert.strictEqual(await assignmentCount(client, 'TEAM-A5', 'T-A5'), 2);

    // Organizer moves the allocated team into room 2, match 2.
    const move = await allocateTeam(client, {
      teamId: 'TEAM-A5', tournamentId: 'T-A5', source: ALLOCATION_SOURCES.ORGANIZER,
      options: { roomId: 'RM-T-A5-1-1-2', matchId: 'MAT-RM-T-A5-1-1-2-2', reason: 'organizer move' },
      actorId: 'ORG-A5',
    });
    assert.strictEqual(move.status, 'allocated');
    assert.strictEqual(move.matchIds.length, 1, 'manual moves are single-match');
    const rows = (await client.query('SELECT room_id, match_id, group_id, day_id, source FROM tournament_match_assignments WHERE tournament_team_id=$1', ['TEAM-A5'])).rows;
    assert.strictEqual(rows.length, 1, 'old rows removed, exactly one new row');
    assert.strictEqual(rows[0].room_id, 'RM-T-A5-1-1-2');
    assert.strictEqual(rows[0].match_id, 'MAT-RM-T-A5-1-1-2-2');
    assert.strictEqual(rows[0].source, 'organizer');
    assert.strictEqual(rows[0].group_id, 'GRP-T-A5-1-1', 'group/day derived server-side from the room');

    const log = (await client.query("SELECT action, action_type, admin_id, details FROM admin_action_log WHERE target_id=$1 AND action='allocation_move'", ['TEAM-A5'])).rows[0];
    assert.ok(log, 'move audit log written');
    assert.strictEqual(log.action_type, 'allocation');
    assert.strictEqual(log.admin_id, 'ORG-A5');
    const details = JSON.parse(log.details);
    assert.strictEqual(details.source, 'organizer');
    assert.strictEqual(details.reason, 'organizer move');
    assert.strictEqual(details.match_ids.length, 1);
  }, t);
});

test('allocation: moving into a full destination room is rejected with ALLOCATION_CONFLICT', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A6');
    await seedRoom(client, 'T-A6', 1, 1, { matches: 1 }); // capacity 1
    await seedRoom(client, 'T-A6', 2, 4, { matches: 1 });
    await seedVerifiedTeam(client, 'T-A6', 'TEAM-A6A', 'U-A6A', 'Alpha');
    await seedVerifiedTeam(client, 'T-A6', 'TEAM-A6B', 'U-A6B', 'Bravo');

    await allocateTeam(client, { teamId: 'TEAM-A6A', tournamentId: 'T-A6', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: 'U-A6A' });
    // Room 1 is full (capacity 1, occupied by A). B trying to manual move into it fails.
    await assert.rejects(
      allocateTeam(client, {
        teamId: 'TEAM-A6B', tournamentId: 'T-A6', source: ALLOCATION_SOURCES.ORGANIZER,
        options: { roomId: 'RM-T-A6-1-1-1', matchId: 'MAT-RM-T-A6-1-1-1-1', reason: 'force into full room' },
      }),
      (err) => {
        assert.ok(err instanceof AllocationError);
        assert.strictEqual(err.code, ALLOCATION_ERR.ALLOCATION_CONFLICT);
        assert.match(err.message, /full capacity/);
        return true;
      }
    );
    assert.strictEqual(await assignmentCount(client, 'TEAM-A6B', 'T-A6'), 0, 'no partial move on rejection');
  }, t);
});

// --- 19: release frees a position; 20: the slot is reused without duplicates ---
test('allocation: a released position is safely re-fillable (no duplicate rows, invariants kept)', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A7');
    await seedRoom(client, 'T-A7', 1, 2, { matches: 1 });
    await seedVerifiedTeam(client, 'T-A7', 'TEAM-A7A', 'U-A7A', 'Alpha');
    await seedVerifiedTeam(client, 'T-A7', 'TEAM-A7B', 'U-A7B', 'Bravo');
    await seedVerifiedTeam(client, 'T-A7', 'TEAM-A7C', 'U-A7C', 'Charlie');

    await allocateTeam(client, { teamId: 'TEAM-A7A', tournamentId: 'T-A7', source: ALLOCATION_SOURCES.AUTOMATIC });
    await allocateTeam(client, { teamId: 'TEAM-A7B', tournamentId: 'T-A7', source: ALLOCATION_SOURCES.AUTOMATIC });
    // Room full (capacity 2).

    // Organizer release of A (mirrors the release endpoint: delete + set allocation_pending).
    await client.query("DELETE FROM tournament_match_assignments WHERE tournament_team_id=$1", ['TEAM-A7A']);
    await client.query("UPDATE tournament_teams SET status = 'allocation_pending' WHERE id=$1", ['TEAM-A7A']);

    // A freed position now exists -> Charlie gets it.
    const cOut = await allocateTeam(client, { teamId: 'TEAM-A7C', tournamentId: 'T-A7', source: ALLOCATION_SOURCES.AUTOMATIC });
    assert.strictEqual(cOut.status, 'allocated');

    // Room holds exactly B + C (2 teams), no duplicates.
    const teamsInRoom = (await client.query(
      'SELECT tournament_team_id FROM tournament_match_assignments WHERE room_id=$1 AND tournament_id=$2 GROUP BY tournament_team_id ORDER BY tournament_team_id',
      ['RM-T-A7-1-1-1', 'T-A7']
    )).rows.map((r) => r.tournament_team_id);
    assert.deepStrictEqual(teamsInRoom, ['TEAM-A7B', 'TEAM-A7C']);

    // Re-allocation of A (still allocation_pending) is deferred, never duplicated.
    const aOut = await allocateTeam(client, { teamId: 'TEAM-A7A', tournamentId: 'T-A7', source: ALLOCATION_SOURCES.AUTOMATIC });
    assert.strictEqual(aOut.status, 'allocation_pending');
    assert.strictEqual(await assignmentCount(client, 'TEAM-A7A', 'T-A7'), 0);
  }, t);
});

// --- 21: cross-tournament rejected ---
test('allocation: a team or target room from another tournament is rejected', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A8A');
    await insertTournament(client, 'T-A8B');
    await seedRoom(client, 'T-A8A', 1, 4);
    await seedRoom(client, 'T-A8B', 1, 4);
    await seedVerifiedTeam(client, 'T-A8A', 'TEAM-A8', 'U-A8', 'Kilo');

    // Team in A, allocate call mentions B.
    await assert.rejects(
      allocateTeam(client, { teamId: 'TEAM-A8', tournamentId: 'T-A8B', source: ALLOCATION_SOURCES.AUTOMATIC }),
      (err) => {
        assert.ok(err instanceof AllocationError);
        assert.strictEqual(err.code, ALLOCATION_ERR.TOURNAMENT_MISMATCH);
        return true;
      }
    );
    // Manual move into a room belonging to B.
    await assert.rejects(
      allocateTeam(client, {
        teamId: 'TEAM-A8', tournamentId: 'T-A8A', source: ALLOCATION_SOURCES.ORGANIZER,
        options: { roomId: 'RM-T-A8B-1-1-1', matchId: 'MAT-RM-T-A8B-1-1-1-1', reason: 'foreign room' },
      }),
      (err) => {
        assert.ok(err instanceof AllocationError);
        assert.strictEqual(err.code, ALLOCATION_ERR.TOURNAMENT_MISMATCH);
        return true;
      }
    );
  }, t);
});

// --- 22: registration-bridge eligibility respected at allocation time ---
test('allocation: a linked team whose registration is no longer eligible is rejected', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-A9');
    await seedRoom(client, 'T-A9', 1, 4, { matches: 1 });
    await insertUser(client, 'U-A9');
    await insertRegistration(client, 'R-A9', 'T-A9', 'U-A9', 'Lima', 'rejected'); // ineligible
    await seedVerifiedTeam(client, 'T-A9', 'TEAM-A9', 'U-A9', 'Lima Squad', 'R-A9');

    await assert.rejects(
      allocateTeam(client, { teamId: 'TEAM-A9', tournamentId: 'T-A9', source: ALLOCATION_SOURCES.AUTOMATIC }),
      (err) => {
        assert.ok(err instanceof AllocationError);
        assert.strictEqual(err.code, ALLOCATION_ERR.TEAM_NOT_ELIGIBLE);
        return true;
      }
    );
    assert.strictEqual(await assignmentCount(client, 'TEAM-A9', 'T-A9'), 0);
  }, t);
});

// --- 23/24: unverified and incomplete teams cannot allocate ---
test('allocation: awaits_members and members_complete teams are rejected before any lock overlap', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-AB');
    await seedRoom(client, 'T-AB', 1, 4, { matches: 1 });
    await seedVerifiedTeam(client, 'T-AB', 'TEAM-AB1', 'U-AB1', 'Awaiting', null, 'awaiting_members');
    await seedVerifiedTeam(client, 'T-AB', 'TEAM-AB2', 'U-AB2', 'Incomplete', null, 'members_complete');

    for (const tid of ['TEAM-AB1', 'TEAM-AB2']) {
      await assert.rejects(
        allocateTeam(client, { teamId: tid, tournamentId: 'T-AB', source: ALLOCATION_SOURCES.AUTOMATIC }),
        (err) => {
          assert.ok(err instanceof AllocationError);
          assert.strictEqual(err.code, ALLOCATION_ERR.TEAM_NOT_COMPLETE);
          return true;
        }
      );
    }
    assert.strictEqual(await assignmentCount(client, 'TEAM-AB1', 'T-AB'), 0);
    assert.strictEqual(await assignmentCount(client, 'TEAM-AB2', 'T-AB'), 0);
  }, t);
});

// --- 25: audit identifies automatic allocations (SYSTEM actor + action code) ---
test('allocation: automatic allocations are audited with SYSTEM actor and allocation_automatic action', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-AC');
    await seedRoom(client, 'T-AC', 1, 4, { matches: 3 });
    await seedVerifiedTeam(client, 'T-AC', 'TEAM-AC', 'U-AC', 'Mike');

    await allocateTeam(client, { teamId: 'TEAM-AC', tournamentId: 'T-AC', source: ALLOCATION_SOURCES.AUTOMATIC }); // no actorId supplied

    const log = (await client.query("SELECT admin_id, action, action_type, target_type, target_id, details FROM admin_action_log WHERE target_id=$1 AND action='allocation_automatic'", ['TEAM-AC'])).rows[0];
    assert.ok(log, 'automatic admission audit exists');
    assert.strictEqual(log.admin_id, 'SYSTEM');
    assert.strictEqual(log.action_type, 'allocation');
    assert.strictEqual(log.target_type, 'tournament_team');
    assert.strictEqual(log.target_id, 'TEAM-AC');
    const details = JSON.parse(log.details);
    assert.strictEqual(details.source, 'automatic');
    assert.strictEqual(details.assignment_count, 3);
    assert.deepStrictEqual(details.match_ids.length, 3);
    assert.strictEqual(details.team_name, 'Mike');
  }, t);
});

// --- 26: full rollback — allocation commits nothing on caller failure ---
test('allocation: the caller transaction rolls the whole allocation back atomically', async (t) => {
  if (!dbReady) {
    t.skip(`No test database reachable (${TEST_URL}): ${dbProbeMessage}`);
    return;
  }
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-AD');
    await seedRoom(client, 'T-AD', 1, 4, { matches: 1 });
    await seedVerifiedTeam(client, 'T-AD', 'TEAM-AD', 'U-AD', 'November');

    const out = await allocateTeam(client, { teamId: 'TEAM-AD', tournamentId: 'T-AD', source: ALLOCATION_SOURCES.AUTOMATIC });
    assert.strictEqual(out.status, 'allocated');
    assert.strictEqual(await assignmentCount(client, 'TEAM-AD', 'T-AD'), 1);

    // A downstream failure in the same caller transaction must undo the
    // allocation (service never commits early).
    throw new Error('simulated downstream failure');
  }, t).then(
    () => { assert.fail('expected the simulated failure to propagate'); },
    () => { /* expected */ }
  );

  const verify = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await verify.connect();
  try {
    assert.strictEqual(await assignmentCount(verify, 'TEAM-AD', 'T-AD'), 0, 'allocation fully rolled back');
    assert.strictEqual(await teamStatus(verify, 'TEAM-AD'), null, 'team row rolled back too');
  } finally {
    await verify.end().catch(() => {});
  }
});

// --- 13: concurrent final-slot safety (two clients race the last position) ---
test('allocation: concurrent automatic allocations of the last slot never over-fill', async (t) => {
  if (!dbReady) {
    t.skip(`No test database reachable (${TEST_URL}): ${dbProbeMessage}`);
    return;
  }
  const tId = 'T-CONC-RACE';
  const seed = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await seed.connect();
  try {
    for (const id of ['U-RC1', 'U-RC2']) await insertUser(seed, id);
    await insertTournament(seed, tId);
    await seedRoom(seed, tId, 1, 1, { matches: 1 }); // exactly ONE slot
    await seedVerifiedTeam(seed, tId, 'TEAM-RC1', 'U-RC1', 'Racer One');
    await seedVerifiedTeam(seed, tId, 'TEAM-RC2', 'U-RC2', 'Racer Two');

    const runAllocation = async (teamId) => {
      const c = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
      await c.connect();
      try {
        await c.query('BEGIN');
        const out = await allocateTeam(c, { teamId, tournamentId: tId, source: ALLOCATION_SOURCES.AUTOMATIC, actorId: teamId === 'TEAM-RC1' ? 'U-RC1' : 'U-RC2' });
        await c.query('COMMIT');
        return out;
      } catch (err) {
        await c.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        await c.end().catch(() => {});
      }
    };

    const [a, b] = await Promise.all([runAllocation('TEAM-RC1'), runAllocation('TEAM-RC2')]);
    const statuses = [a.status, b.status].sort().join(',');
    assert.ok(statuses === 'allocated,allocation_pending', `exactly one winner, got: ${statuses}`);

    const count = (await seed.query('SELECT COUNT(*)::int AS c FROM tournament_match_assignments WHERE tournament_id=$1', [tId])).rows[0].c;
    assert.strictEqual(count, 1, 'exactly one assignment for the single slot');
    const distinct = (await seed.query('SELECT COUNT(DISTINCT tournament_team_id)::int AS c FROM tournament_match_assignments WHERE tournament_id=$1', [tId])).rows[0].c;
    assert.strictEqual(distinct, 1, 'no over-capacity despite the race');
  } finally {
    // Explicit cleanup (this test commits its seed).
    for (const table of [
      'tournament_match_assignments', 'tournament_team_members', 'tournament_teams',
      'tournament_matches', 'tournament_rooms', 'tournament_groups', 'tournament_days',
      'tournament_rounds', 'tournament_registrations',
    ]) {
      await seed.query(`DELETE FROM ${table} WHERE tournament_id = $1`, [tId]).catch(() => {});
    }
    await seed.query('DELETE FROM tournaments WHERE id = $1', [tId]);
    await seed.query("DELETE FROM users WHERE id IN ('U-RC1','U-RC2')");
    await seed.end().catch(() => {});
  }
});

// --- 28/29: fleet-scale fill without creating roadmap rows ---
test('allocation: 64 teams fill 4 rooms of 16 exactly; no roadmap rows are ever created', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-AE');
    for (let n = 1; n <= 4; n++) await seedRoom(client, 'T-AE', n, 16, { matches: 1 });

    for (let i = 1; i <= 64; i++) {
      await seedVerifiedTeam(client, 'T-AE', `TEAM-AE-${i}`, `U-AE-${i}`, `Squad ${i}`);
    }
    for (let i = 1; i <= 64; i++) {
      const out = await allocateTeam(client, { teamId: `TEAM-AE-${i}`, tournamentId: 'T-AE', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: `U-AE-${i}` });
      assert.strictEqual(out.status, 'allocated');
    }
    const roomCount = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_rooms WHERE tournament_id=$1', ['T-AE'])).rows[0].c;
    assert.strictEqual(roomCount, 4, 'exactly the seeded rooms, none created');
    const assignCount = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_match_assignments WHERE tournament_id=$1', ['T-AE'])).rows[0].c;
    assert.strictEqual(assignCount, 64, 'one assignment per team for the single-match rooms');
    for (let n = 1; n <= 4; n++) {
      const used = (await client.query('SELECT COUNT(DISTINCT tournament_team_id)::int AS c FROM tournament_match_assignments a JOIN tournament_rooms r ON a.room_id=r.id WHERE r.room_number=$1 AND r.tournament_id=$2', [n, 'T-AE'])).rows[0].c;
      assert.strictEqual(used, 16, 'each room at exactly capacity, never above');
    }
    const teams = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_teams WHERE tournament_id=$1 AND status=$2', ['T-AE', 'allocated'])).rows[0].c;
    assert.strictEqual(teams, 64);
  }, t);
});

test('allocation: 1250 teams fill 50 rooms of 25 exactly; nil spill and no new rooms', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'T-AF');
    for (let n = 1; n <= 50; n++) await seedRoom(client, 'T-AF', n, 25, { matches: 1 });

    for (let i = 1; i <= 1250; i++) {
      await seedVerifiedTeam(client, 'T-AF', `TEAM-AF-${i}`, `U-AF-${i}`, `Squad ${i}`);
    }
    let pending = 0;
    for (let i = 1; i <= 1250; i++) {
      const out = await allocateTeam(client, { teamId: `TEAM-AF-${i}`, tournamentId: 'T-AF', source: ALLOCATION_SOURCES.AUTOMATIC, actorId: `U-AF-${i}` });
      if (out.status !== 'allocated') pending++;
    }
    assert.strictEqual(pending, 0, 'all 1250 placed');
    const roomCount = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_rooms WHERE tournament_id=$1', ['T-AF'])).rows[0].c;
    assert.strictEqual(roomCount, 50, 'no rooms created');
    const overflow = (await client.query(
      `SELECT COUNT(*)::int AS c
       FROM tournament_rooms r
       JOIN (SELECT room_id, COUNT(DISTINCT tournament_team_id) AS used FROM tournament_match_assignments WHERE tournament_id=$1 GROUP BY room_id) a ON a.room_id=r.id
       WHERE a.used > r.capacity`,
      ['T-AF']
    )).rows[0].c;
    assert.strictEqual(overflow, 0, 'capacity never exceeded anywhere');
  }, t);
});