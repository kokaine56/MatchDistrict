import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import {
  applyMatchResults,
  MatchResultError,
  MATCH_RESULT_ERR,
} from '../server/matchResultService.js';

// DB-backed match-results tests (Phase 8A). These run only when a test database is
// reachable; otherwise they skip cleanly (see PGTEST_URL / local Supabase dev pool).
// Every transaction-bound test rolls back, so the database is never mutated. Full
// transactional integration (upsert + audit + admin_action_log + leaderboard
// aggregation, rollback, collisions) is verified here.
const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1')
  ? false
  : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';

test('match-results: database availability probe', async () => {
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
    [id, `${id.toLowerCase()}@result.test`, `User ${id}`, 'x']
  );
}

async function insertTournament(client, id, approved = true) {
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, match_type, "orgId")
     VALUES ($1, $2, 'BGMI', 'upcoming', 'squad', $3)`,
    [id, `Results test ${id}`, `ORG-${id}`]
  );
  if (approved) {
    await client.query(`UPDATE tournaments SET roadmap_status = 'approved' WHERE id = $1`, [id]);
  }
}

// Creates a single room (day/group/room/matches chain) and returns the match ids.
async function seedRoom(client, tournamentId, roomNumber, capacity, { matches = 1 } = {}) {
  const dayId = `DAY-${tournamentId}-1`;
  const groupId = `GRP-${tournamentId}-1-1`;
  const roomId = `RM-${tournamentId}-1-1-${roomNumber}`;
  await client.query(
    'INSERT INTO tournament_days (id, tournament_id, day_number, date) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
    [dayId, tournamentId, 1, '2026-11-01']
  );
  await client.query(
    'INSERT INTO tournament_groups (id, day_id, tournament_id, group_name, sequence) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
    [groupId, dayId, tournamentId, 'Group A', 1]
  );
  await client.query(
    'INSERT INTO tournament_rooms (id, group_id, day_id, tournament_id, room_number, capacity) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
    [roomId, groupId, dayId, tournamentId, roomNumber, capacity]
  );
  const matchIds = [];
  for (let m = 1; m <= matches; m++) {
    const mid = `MAT-${roomId}-${m}`;
    await client.query(
      `INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time)
       VALUES ($1,$2,$3,$4,$5,$6,'10:00','10:25') ON CONFLICT DO NOTHING`,
      [mid, roomId, groupId, dayId, tournamentId, m]
    );
    matchIds.push(mid);
  }
  return matchIds;
}

async function seedVerifiedTeam(client, tournamentId, teamId, leaderId, name) {
  await insertUser(client, leaderId);
  await client.query(
    'INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status) VALUES ($1,$2,$3,$4,$5)',
    [teamId, tournamentId, name, leaderId, 'verified']
  );
}

async function assignTeam(client, tournamentId, teamId, matchId, roomNumber) {
  await client.query(
    `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, room_id, group_id, day_id, status, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'allocated','automatic')`,
    [`ASN-${matchId}-${teamId}`, tournamentId, teamId, matchId, `RM-${tournamentId}-1-1-${roomNumber}`, `GRP-${tournamentId}-1-1`, `DAY-${tournamentId}-1`]
  );
}

async function seedResultScenario(client, tournamentId, teamArgs, { approved = true, matches = 1, capacity = 4, roomNumber = 1 } = {}) {
  await insertTournament(client, tournamentId, approved);
  const matchIds = await seedRoom(client, tournamentId, roomNumber, capacity, { matches });
  for (const [teamId, leaderId, name] of teamArgs) {
    await seedVerifiedTeam(client, tournamentId, teamId, leaderId, name);
  }
  for (const [teamId] of teamArgs) {
    for (const mid of matchIds) {
      await assignTeam(client, tournamentId, teamId, mid, roomNumber);
    }
  }
  return { matchIds };
}

async function countRows(client, table, tournamentId) {
  const res = await client.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE tournament_id = $1`, [tournamentId]);
  return res.rows[0].c;
}

function resultErrMatches(err, code) {
  assert.ok(err instanceof MatchResultError, `expected MatchResultError, got: ${err && err.stack}`);
  assert.strictEqual(err.code, code);
  return true;
}

// --- 1: basic recording computes scores (DB rules / defaults), stamps the actor ---
test('results: recording an approved match creates verified rows with computed points', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R1', [
      ['TEAM-R1A', 'U-R1A', 'Alpha Squad'],
      ['TEAM-R1B', 'U-R1B', 'Bravo Squad'],
    ], { matches: 1 });

    const out = await applyMatchResults(client, {
      tournId: 'T-R1', matchId: 'MAT-RM-T-R1-1-1-1-1',
      results: [
        { team_id: 'TEAM-R1A', placement: 1, kills: 5 },
        { team_id: 'TEAM-R1B', placement: 2, kills: 3 },
      ],
      actorId: 'ORG-R1',
    });

    assert.strictEqual(out.written.length, 2);
    // Score1: 5 kills (x1) + 15 placement + 0 wwcd_bonus = 20; Score2: 3 + 12 = 15.
    assert.strictEqual(out.written[0].total_points, 20);
    assert.strictEqual(out.written[1].total_points, 15);

    const rows = (await client.query(
      'SELECT team_id, status, submitted_by, verified_by, kill_points, total_points FROM tournament_match_results WHERE tournament_id=$1 ORDER BY placement',
      ['T-R1']
    )).rows;
    assert.strictEqual(rows.length, 2);
    for (const row of rows) {
      assert.strictEqual(row.status, 'verified');
      assert.strictEqual(row.submitted_by, 'ORG-R1');
      assert.strictEqual(row.verified_by, 'ORG-R1');
    }
    assert.strictEqual(rows[0].kill_points, 5);
    assert.strictEqual(rows[0].total_points, 20);

    // Audit trail per team (create) + admin action log + leaderboard aggregation.
    assert.strictEqual((await client.query('SELECT COUNT(*)::int AS c FROM tournament_match_results_audit WHERE tournament_id IS NULL', [])).rows[0].c, 0);
    const audits = (await client.query(
      `SELECT a.action, a.result_id FROM tournament_match_results_audit a
       INNER JOIN tournament_match_results r ON a.result_id = r.id
       WHERE r.tournament_id = $1 ORDER BY r.team_id`,
      ['T-R1']
    )).rows;
    assert.strictEqual(audits.length, 2);
    for (const a of audits) assert.strictEqual(a.action, 'create');

    const logs = (await client.query(
      `SELECT action, action_type, admin_id, target_user FROM admin_action_log WHERE target_id IN (SELECT id FROM tournament_match_results WHERE tournament_id=$1)`,
      ['T-R1']
    )).rows;
    assert.strictEqual(logs.length, 2);
    for (const log of logs) {
      assert.strictEqual(log.action, 'result_verified');
      assert.strictEqual(log.action_type, 'result');
      assert.strictEqual(log.admin_id, 'ORG-R1');
      assert.ok(log.target_user);
    }

    const lb = (await client.query('SELECT total_kills, total_points, matches_played FROM tournament_leaderboard WHERE tournament_id=$1 AND team_id=$2', ['T-R1', 'TEAM-R1A'])).rows[0];
    assert.ok(lb, 'leaderboard row upserted');
    assert.strictEqual(lb.total_kills, 5);
    assert.strictEqual(lb.total_points, 20);
    assert.strictEqual(lb.matches_played, 1);
  }, t);
});

// --- 2: DB scoring rules are authoritative; client score fields are ignored ---
test('results: stored tournament_scoring_rules drive the computation (not the client)', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R2', [['TEAM-R2A', 'U-R2A', 'Alpha']]);

    // Custom rule: multiplier 2, wwcd_bonus 3, retention of the DDL placement map.
    await client.query(
      `INSERT INTO tournament_scoring_rules (tournament_id, kill_points_multiplier, placement_points_map, wwcd_bonus)
       VALUES ($1, 2, '{"1": 15, "2": 12}', 3)`,
      ['T-R2']
    );

    // Client sends kills=4 and (bogus) score fields that MUST be ignored.
    const out = await applyMatchResults(client, {
      tournId: 'T-R2', matchId: 'MAT-RM-T-R2-1-1-1-1',
      results: [{ team_id: 'TEAM-R2A', placement: 1, kills: 4, kill_points: 999, total_points: 999 }],
      actorId: 'ORG-R2',
    });

    // 4 kills x2 = 8, placement 15, wwcd_bonus 3 -> 26.
    assert.strictEqual(out.written[0].total_points, 26);
    const row = (await client.query('SELECT kill_points, placement_points, wwcd, total_points FROM tournament_match_results WHERE tournament_id=$1', ['T-R2'])).rows[0];
    assert.strictEqual(row.kill_points, 8);
    assert.strictEqual(row.placement_points, 15);
    assert.strictEqual(row.wwcd, true);
    assert.strictEqual(row.total_points, 26);
  }, t);
});

// --- 3: re-submission upserts in place with an update audit row; never duplicates ---
test('results: re-submitting the same batch upserts (update audit), never duplicates rows', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R3', [
      ['TEAM-R3A', 'U-R3A', 'Alpha'],
      ['TEAM-R3B', 'U-R3B', 'Bravo'],
    ]);

    const batch = [
      { team_id: 'TEAM-R3A', placement: 1, kills: 5 },
      { team_id: 'TEAM-R3B', placement: 2, kills: 3 },
    ];
    const first = await applyMatchResults(client, { tournId: 'T-R3', matchId: 'MAT-RM-T-R3-1-1-1-1', results: batch, actorId: 'ORG-R3A' });
    const second = await applyMatchResults(client, { tournId: 'T-R3', matchId: 'MAT-RM-T-R3-1-1-1-1', results: batch, actorId: 'ORG-R3B' });

    assert.ok(first.written.every((w) => w.action === 'create'));
    assert.strictEqual(second.written.length, 2);
    assert.ok(second.written.every((w) => w.action === 'update'));
    // Same result ids reused on update (same unique key).
    assert.ok(second.written.every((w) => first.written.find((f) => f.team_id === w.team_id)));

    assert.strictEqual(await countRows(client, 'tournament_match_results', 'T-R3'), 2);
    // create + update per team.
    const audits = (await client.query(
      `SELECT a.action FROM tournament_match_results_audit a
       INNER JOIN tournament_match_results r ON a.result_id = r.id
       WHERE r.tournament_id = $1 ORDER BY a.action`,
      ['T-R3']
    )).rows;
    assert.deepStrictEqual(audits.map((a) => a.action), ['create', 'create', 'update', 'update']);
    // Each update audit row records previous_data.
    const updateAudit = (await client.query(
      `SELECT previous_data, new_data FROM tournament_match_results_audit a
       INNER JOIN tournament_match_results r ON a.result_id = r.id
       WHERE r.tournament_id = $1 AND a.action = 'update' LIMIT 1`,
      ['T-R3']
    )).rows[0];
    assert.ok(updateAudit.previous_data, 'update audit must snapshot the prior row');
    assert.ok(updateAudit.new_data, 'update audit must snapshot the new row');

    // Leaderboard aggregated from the latest (verified) values only.
    const lb = (await client.query('SELECT matches_played FROM tournament_leaderboard WHERE tournament_id=$1 AND team_id=$2', ['T-R3', 'TEAM-R3A'])).rows[0];
    assert.strictEqual(lb.matches_played, 1, 'one verified result, one matches_played');
  }, t);
});

// --- 4: duplicate placement inside the batch is rejected atomically ---
test('results: two teams sharing a placement in one batch is rejected and writes nothing', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R4', [
      ['TEAM-R4A', 'U-R4A', 'Alpha'],
      ['TEAM-R4B', 'U-R4B', 'Bravo'],
    ]);

    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-R4', matchId: 'MAT-RM-T-R4-1-1-1-1',
        results: [
          { team_id: 'TEAM-R4A', placement: 1, kills: 5 },
          { team_id: 'TEAM-R4B', placement: 1, kills: 3 },
        ],
        actorId: 'ORG-R4',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.INVALID_PLACEMENT)
    );
    assert.strictEqual(await countRows(client, 'tournament_match_results', 'T-R4'), 0);
    assert.strictEqual(await countRows(client, 'tournament_leaderboard', 'T-R4'), 0);
  }, t);
});

// --- 5: a placement claimed by an existing, un-updated team is rejected ---
test('results: a collision with an existing row for a team not in the batch is DUPLICATE_PLACEMENT', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R5', [
      ['TEAM-R5A', 'U-R5A', 'Alpha'],
      ['TEAM-R5B', 'U-R5B', 'Bravo'],
    ]);

    await applyMatchResults(client, {
      tournId: 'T-R5', matchId: 'MAT-RM-T-R5-1-1-1-1',
      results: [{ team_id: 'TEAM-R5A', placement: 1, kills: 5 }],
      actorId: 'ORG-R5',
    });

    // B tries to take A's 1st place in a separate submission (A not updated).
    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-R5', matchId: 'MAT-RM-T-R5-1-1-1-1',
        results: [{ team_id: 'TEAM-R5B', placement: 1, kills: 3 }],
        actorId: 'ORG-R5',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.DUPLICATE_PLACEMENT)
    );
  }, t);
});

// --- 6: swapping two placements inside one atomic batch is legal ---
test('results: corrected re-submission that swaps two placements applies cleanly', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R6', [
      ['TEAM-R6A', 'U-R6A', 'Alpha'],
      ['TEAM-R6B', 'U-R6B', 'Bravo'],
    ]);

    await applyMatchResults(client, {
      tournId: 'T-R6', matchId: 'MAT-RM-T-R6-1-1-1-1',
      results: [
        { team_id: 'TEAM-R6A', placement: 1, kills: 5 },
        { team_id: 'TEAM-R6B', placement: 2, kills: 3 },
      ],
      actorId: 'ORG-R6',
    });

    const out = await applyMatchResults(client, {
      tournId: 'T-R6', matchId: 'MAT-RM-T-R6-1-1-1-1',
      results: [
        { team_id: 'TEAM-R6A', placement: 2, kills: 3 },
        { team_id: 'TEAM-R6B', placement: 1, kills: 6 },
      ],
      actorId: 'ORG-R6',
    });
    assert.ok(out.written.every((w) => w.action === 'update'));

    const rows = (await client.query('SELECT team_id, placement, total_points FROM tournament_match_results WHERE tournament_id=$1 ORDER BY placement', ['T-R6'])).rows;
    assert.deepStrictEqual(rows, [
      { team_id: 'TEAM-R6B', placement: 1, total_points: 6 + 15 },
      { team_id: 'TEAM-R6A', placement: 2, total_points: 3 + 12 },
    ]);
  }, t);
});

// --- 7: unallocated teams are rejected ---
test('results: a team not allocated to the match is TEAM_NOT_ALLOCATED', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R7', [['TEAM-R7A', 'U-R7A', 'Alpha']]);

    await seedVerifiedTeam(client, 'T-R7', 'TEAM-R7-X', 'U-R7X', 'Intruder'); // not assigned
    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-R7', matchId: 'MAT-RM-T-R7-1-1-1-1',
        results: [
          { team_id: 'TEAM-R7A', placement: 1, kills: 5 },
          { team_id: 'TEAM-R7-X', placement: 2, kills: 3 },
        ],
        actorId: 'ORG-R7',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.TEAM_NOT_ALLOCATED)
    );
    assert.strictEqual(await countRows(client, 'tournament_match_results', 'T-R7'), 0);
  }, t);
});

// --- 8: approved-roadmap gate ---
test('results: an unapproved roadmap is ROADMAP_NOT_APPROVED', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R8', [['TEAM-R8A', 'U-R8A', 'Alpha']], { approved: false });

    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-R8', matchId: 'MAT-RM-T-R8-1-1-1-1',
        results: [{ team_id: 'TEAM-R8A', placement: 1, kills: 5 }],
        actorId: 'ORG-R8',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.ROADMAP_NOT_APPROVED)
    );
    assert.strictEqual(await countRows(client, 'tournament_match_results', 'T-R8'), 0);
  }, t);
});

// --- 9: unknown tournament / unknown match / cross-tournament match ---
test('results: unknown tournament, unknown match, and foreign matches are rejected', async (t) => {
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-R9A', [['TEAM-R9A', 'U-R9A', 'Alpha']]);
    await seedResultScenario(client, 'T-R9B', [['TEAM-R9B', 'U-R9B', 'Bravo']]);

    // Unknown tournament.
    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-GHOST', matchId: 'MAT-NOPE',
        results: [{ team_id: 'TEAM-R9A', placement: 1, kills: 5 }],
        actorId: 'ORG-R9',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.NOT_FOUND)
    );

    // Unknown match on a real tournament.
    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-R9B', matchId: 'MAT-NOPE',
        results: [{ team_id: 'TEAM-R9B', placement: 1, kills: 5 }],
        actorId: 'ORG-R9',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.NOT_FOUND)
    );

    // Match that belongs to a different tournament.
    await assert.rejects(
      applyMatchResults(client, {
        tournId: 'T-R9A', matchId: 'MAT-RM-T-R9B-1-1-1-1',
        results: [{ team_id: 'TEAM-R9A', placement: 1, kills: 5 }],
        actorId: 'ORG-R9',
      }),
      (err) => resultErrMatches(err, MATCH_RESULT_ERR.MATCH_TOURNAMENT_MISMATCH)
    );
  }, t);
});

// --- 10: caller transaction rolls all writes back atomically ---
test('results: a downstream caller failure rolls back results, audit and leaderboard', async (t) => {
  if (!dbReady) {
    t.skip(`No test database reachable (${TEST_URL}): ${dbProbeMessage}`);
    return;
  }
  await withTransaction(async (client) => {
    await seedResultScenario(client, 'T-RA', [['TEAM-RAA', 'U-RAA', 'Alpha']]);
    await applyMatchResults(client, {
      tournId: 'T-RA', matchId: 'MAT-RM-T-RA-1-1-1-1',
      results: [{ team_id: 'TEAM-RAA', placement: 1, kills: 5 }],
      actorId: 'ORG-RA',
    });
    throw new Error('simulated downstream failure');
  }, t).then(
    () => { assert.fail('expected the simulated failure to propagate'); },
    () => { /* expected */ }
  );

  const verify = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await verify.connect();
  try {
    assert.strictEqual(await countRows(verify, 'tournament_match_results', 'T-RA'), 0, 'results fully rolled back');
    assert.strictEqual(await countRows(verify, 'tournament_leaderboard', 'T-RA'), 0, 'leaderboard fully rolled back');
    assert.strictEqual(await countRows(verify, 'tournament_teams', 'T-RA'), 0, 'seed team rolled back too');
  } finally {
    await verify.end().catch(() => {});
  }
});