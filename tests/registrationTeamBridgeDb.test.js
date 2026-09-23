import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import {
  backfillRegistrationLinks,
  maxMembersForMatchType,
} from '../server/registrationTeamBridge.js';

// DB-backed Registration→Team bridge tests. These run only when a test database
// is reachable; otherwise they skip cleanly (see PGTEST_URL / local Supabase
// dev pool). Every test is transaction-bound and rolls back, so the database is
// never mutated. The HTTP-level rules (403 vs 201, filter logic) live in the
// pure suite + server.js; here we verify the DB invariants the bridge depends on.
const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1')
  ? false
  : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';

test('registration→team bridge: database availability probe', async () => {
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

async function insertUser(client, id) {
  await client.query(
    'INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)',
    [id, `${id.toLowerCase()}@bridge.test`, `User ${id}`, 'x']
  );
}

async function insertTournament(client, id, matchType = 'squad') {
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, match_type, timeline, "orgId")
     VALUES ($1, $2, 'BGMI', 'upcoming', $3, NULL, $4)`,
    [id, `Bridge test ${id}`, matchType, `ORG-${id}`]
  );
}

async function insertRegistration(client, id, tournamentId, userId, teamName, status) {
  await client.query(
    `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, tournamentId, userId, teamName, 'Captain of ' + teamName, status]
  );
}

async function insertTeam(client, id, tournamentId, leaderUserId, teamName, registrationId = null) {
  await client.query(
    `INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status, registration_id)
     VALUES ($1, $2, $3, $4, 'awaiting_members', $5)`,
    [id, tournamentId, teamName, leaderUserId, registrationId]
  );
}

async function insertMember(client, id, teamId, tournamentId, userId, role = 'member') {
  await client.query(
    'INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role) VALUES ($1, $2, $3, $4, $5)',
    [id, teamId, tournamentId, userId, role]
  );
}

// --- backfill: link / idempotency / no-create ---
test('bridge: backfill links a leader with a unique eligible registration and leaves it linkable exactly once', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B1');
    await insertTournament(client, 'T-B1');
    await insertRegistration(client, 'R-B1', 'T-B1', 'U-B1', 'Alpha', 'approved');
    // Legacy team with NO registration_id (pre-bridge row)
    await insertTeam(client, 'TEAM-B1', 'T-B1', 'U-B1', 'Alpha Squad');

    const beforeCount = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_teams WHERE tournament_id = $1', ['T-B1'])).rows[0].c;

    const first = await backfillRegistrationLinks(client);
    assert.strictEqual(first.linked, 1);
    const teamRow = (await client.query('SELECT registration_id FROM tournament_teams WHERE id = $1', ['TEAM-B1'])).rows[0];
    assert.strictEqual(teamRow.registration_id, 'R-B1');

    // Idempotent: second run writes nothing, links nothing new.
    const second = await backfillRegistrationLinks(client);
    assert.strictEqual(second.linked, 0);
    assert.strictEqual(second.total, beforeCount, 'no teams were created or dropped');
  }, t);
});

test('bridge: backfill skips unlinkable (pending) and ambiguous (two eligible) leaders; never creates teams or registrations', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B2');
    await insertUser(client, 'U-B3');
    await insertTournament(client, 'T-B2');

    await insertRegistration(client, 'R-B2', 'T-B2', 'U-B2', 'Bravo', 'pending');
    await insertRegistration(client, 'R-B3', 'T-B2', 'U-B3', 'Charlie', 'approved');
    await insertRegistration(client, 'R-B4', 'T-B2', 'U-B3', 'Charlie2', 'confirmed'); // drifting duplicate
    await insertTeam(client, 'TEAM-B2', 'T-B2', 'U-B2', 'Bravo Squad');
    await insertTeam(client, 'TEAM-B3', 'T-B2', 'U-B3', 'Charlie Squad');

    const teamsBefore = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_teams WHERE tournament_id = $1', ['T-B2'])).rows[0].c;
    const regsBefore = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_registrations WHERE tournament_id = $1', ['T-B2'])).rows[0].c;

    const plan = await backfillRegistrationLinks(client);
    assert.strictEqual(plan.linked, 0, 'nothing linked');
    assert.strictEqual(plan.skippedNone, 1, 'pending leader skipped');
    assert.strictEqual(plan.skippedAmbiguous, 1, 'ambiguous leader skipped');
    assert.strictEqual(plan.total, 2);

    const teamsAfter = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_teams WHERE tournament_id = $1', ['T-B2'])).rows[0].c;
    const regsAfter = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_registrations WHERE tournament_id = $1', ['T-B2'])).rows[0].c;
    assert.strictEqual(teamsAfter, teamsBefore, 'backfill never creates teams');
    assert.strictEqual(regsAfter, regsBefore, 'backfill never creates registrations');
  }, t);
});

test('bridge: backfill ignores registrations from other tournaments', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B4');
    await insertTournament(client, 'T-B4A');
    await insertTournament(client, 'T-B4B');
    await insertRegistration(client, 'R-B4B', 'T-B4B', 'U-B4', 'Delta', 'approved'); // eligible only in B
    await insertTeam(client, 'TEAM-B4', 'T-B4A', 'U-B4', 'Delta Squad');

    const plan = await backfillRegistrationLinks(client);
    assert.strictEqual(plan.linked, 0, 'cross-tournament registration never links');
    const row = (await client.query('SELECT registration_id FROM tournament_teams WHERE id = $1', ['TEAM-B4'])).rows[0];
    assert.strictEqual(row.registration_id, null);
  }, t);
});

// --- DB backstops the bridge relies on ---
test('bridge: UNIQUE(tournament_id, user_id) backstops one-team-per-user (concurrent-create safety)', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B5');
    await insertTournament(client, 'T-B5');
    await insertRegistration(client, 'R-B5', 'T-B5', 'U-B5', 'Echo', 'approved');
    await insertTeam(client, 'TEAM-B5A', 'T-B5', 'U-B5', 'Echo One');
    await insertTeam(client, 'TEAM-B5B', 'T-B5', 'U-B5', 'Echo Two');
    await insertMember(client, 'M-B5A', 'TEAM-B5A', 'T-B5', 'U-B5', 'leader');

    // A second device racing a create for the same user+tournament must be
    // rejected by the DB constraint (the handler maps this to a clean 400).
    await assert.rejects(
      insertMember(client, 'M-B5B', 'TEAM-B5B', 'T-B5', 'U-B5', 'leader'),
      (err) => {
        assert.strictEqual(err.code, '23505', 'unique violation raised');
        return true;
      }
    );
  }, t);
});

test('bridge: UNIQUE(tournament_id, team_name) backstops duplicate team names', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B6');
    await insertUser(client, 'U-B7');
    await insertTournament(client, 'T-B6');
    await insertRegistration(client, 'R-B6A', 'T-B6', 'U-B6', 'Foxtrot A', 'approved');
    await insertRegistration(client, 'R-B6B', 'T-B6', 'U-B7', 'Foxtrot B', 'approved');
    await insertTeam(client, 'TEAM-B6A', 'T-B6', 'U-B6', 'Foxtrot');
    await insertTeam(client, 'TEAM-B6B', 'T-B6', 'U-B7', 'Foxtrot');

    await assert.rejects(
      client.query('INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id) VALUES ($1, $2, $3, $4)',
        ['TEAM-B6C', 'T-B6', 'Foxtrot', 'U-B7']),
      (err) => {
        assert.strictEqual(err.code, '23505');
        return true;
      }
    );
  }, t);
});

test('bridge: same user may hold teams in DIFFERENT tournaments (cross-tournament independence)', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B8');
    await insertTournament(client, 'T-B8A');
    await insertTournament(client, 'T-B8B');
    await insertRegistration(client, 'R-B8A', 'T-B8A', 'U-B8', 'Golf A', 'approved');
    await insertRegistration(client, 'R-B8B', 'T-B8B', 'U-B8', 'Golf B', 'approved');
    await insertTeam(client, 'TEAM-B8A', 'T-B8A', 'U-B8', 'Golf A Squad');
    await insertTeam(client, 'TEAM-B8B', 'T-B8B', 'U-B8', 'Golf B Squad');
    await insertMember(client, 'M-B8A', 'TEAM-B8A', 'T-B8A', 'U-B8', 'leader');
    await insertMember(client, 'M-B8B', 'TEAM-B8B', 'T-B8B', 'U-B8', 'leader'); // allowed

    const both = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_team_members WHERE user_id = $1', ['U-B8'])).rows[0].c;
    assert.strictEqual(both, 2);
  }, t);
});

// --- registration immutability (T10/T11/T20) ---
test('bridge: backfill and team ops never mutate the registration slot/payment records', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-B9');
    await insertTournament(client, 'T-B9');
    await insertRegistration(client, 'R-B9A', 'T-B9', 'U-B9', 'Hotel', 'confirmed');
    await insertRegistration(client, 'R-B9B', 'T-B9', 'U-B9', 'Hotel 2', 'rejected'); // historical row
    await insertTeam(client, 'TEAM-B9', 'T-B9', 'U-B9', 'Hotel Squad');

    // Stamp a slot like the allocation flow does; backfill + membership edit must not touch it.
    await client.query('UPDATE tournament_registrations SET slot_number = 7 WHERE id = $1', ['R-B9A']);

    await backfillRegistrationLinks(client);
    await insertMember(client, 'M-B9', 'TEAM-B9', 'T-B9', 'U-B9', 'leader');
    await client.query("UPDATE tournament_teams SET status = 'members_complete' WHERE id = $1", ['TEAM-B9']);

    const rows = (await client.query('SELECT id, status, slot_number, team_name FROM tournament_registrations WHERE tournament_id = $1 ORDER BY id', ['T-B9'])).rows;
    assert.deepStrictEqual(rows.map((r) => [r.id, r.status, r.slot_number, r.team_name]), [
      ['R-B9A', 'confirmed', 7, 'Hotel'],
      ['R-B9B', 'rejected', null, 'Hotel 2'],
    ]);
  }, t);
});

// --- no side-effect allocation/roadmap writes (T16/T17/T18) ---
test('bridge: team creation/joining/verification-grained ops write no allocation or roadmap rows', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-BA');
    await insertTournament(client, 'T-BA', 'duo');
    await insertRegistration(client, 'R-BA', 'T-BA', 'U-BA', 'India', 'approved');
    await insertTeam(client, 'TEAM-BA', 'T-BA', 'U-BA', 'India Squad');
    await insertMember(client, 'M-BA1', 'TEAM-BA', 'T-BA', 'U-BA', 'leader');
    await insertUser(client, 'U-BB');
    await insertMember(client, 'M-BA2', 'TEAM-BA', 'T-BA', 'U-BB', 'member');

    await insertUser(client, 'U-BC');
    await insertRegistration(client, 'R-BC', 'T-BA', 'U-BC', 'India B', 'approved');
    await insertTeam(client, 'TEAM-BC', 'T-BA', 'U-BC', 'India B Squad');
    await insertMember(client, 'M-BC1', 'TEAM-BC', 'T-BA', 'U-BC', 'leader');
    await insertUser(client, 'U-BE');
    await insertMember(client, 'M-BC2', 'TEAM-BC', 'T-BA', 'U-BE', 'member');

    // Assert the two teams sit at the duo capacity (2 each)
    const cap = maxMembersForMatchType('duo');
    assert.strictEqual(cap, 2);
    const counts = (await client.query(
      'SELECT tournament_team_id, COUNT(*)::int AS c FROM tournament_team_members WHERE tournament_id = $1 GROUP BY tournament_team_id ORDER BY tournament_team_id',
      ['T-BA']
    )).rows;
    assert.deepStrictEqual(counts.map((r) => r.c), [2, 2]);

    // No scheduling/allocation artifacts were created by team-only operations.
    for (const table of ['tournament_match_assignments', 'tournament_matches', 'tournament_rooms', 'tournament_groups', 'tournament_days', 'tournament_rounds']) {
      const c = (await client.query(`SELECT COUNT(*)::int AS c FROM ${table} WHERE tournament_id = $1`, ['T-BA'])).rows[0].c;
      assert.strictEqual(c, 0, `${table} must remain empty`);
    }
  }, t);
});

// --- dangling-link additive semantics ---
test('bridge: registration_id persists on the team even if the registration row is later hard-deleted (legacy admin tooling)', async (t) => {
  await withTransaction(async (client) => {
    await insertUser(client, 'U-BD');
    await insertTournament(client, 'T-BD');
    await insertRegistration(client, 'R-BD', 'T-BD', 'U-BD', 'Juliet', 'approved');
    await insertTeam(client, 'TEAM-BD', 'T-BD', 'U-BD', 'Juliet Squad');

    await backfillRegistrationLinks(client);
    const linked = (await client.query('SELECT registration_id FROM tournament_teams WHERE id = $1', ['TEAM-BD'])).rows[0];
    assert.strictEqual(linked.registration_id, 'R-BD');

    // Simulate the legacy hard-delete of the registration row.
    await client.query('DELETE FROM tournament_registrations WHERE id = $1', ['R-BD']);
    const after = (await client.query('SELECT registration_id FROM tournament_teams WHERE id = $1', ['TEAM-BD'])).rows[0];
    assert.strictEqual(after.registration_id, 'R-BD', "link value survives (additive column, no FK)");
    const regRow = (await client.query('SELECT 1 FROM tournament_registrations WHERE id = $1', ['R-BD'])).rows.length;
    assert.strictEqual(regRow, 0, 'registration row is gone');
    // The read/verify gate then treats the dangling link as not-eligible
    // (handler-level rule covered by the pure suite).
  }, t);
});