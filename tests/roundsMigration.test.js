import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { syncTournamentRounds, legacyRoundBackfill, getTournamentRounds } from '../server/roundsService.js';

// DB-backed Round/Stage migration tests. These run only when a test database is
// reachable; otherwise they skip cleanly (see PGTEST_URL / local Supabase dev
// pool). Every test is transaction-bound and rolls back, so the database is
// never mutated.
const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1')
  ? false
  : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';

test('rounds migration: database availability probe', async () => {
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

async function insertTournament(client, id, timeline) {
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, timeline, "orgId") VALUES ($1, $2, 'BGMI', 'upcoming', $3, $4)`,
    [id, 'Rounds migration test', timeline ? JSON.stringify(timeline) : null, `ORG-${id}`]
  );
}

test('syncTournamentRounds: idempotent upsert, never creates duplicate rounds', async (t) => {
  await withTransaction(async (client) => {
    const timeline = [
      { name: 'Qualifier', qualified: '48', date: '2026-11-01' },
      { name: 'Final', qualified: '16', date: '2026-11-02' }
    ];
    const tournament = { id: 'RNDT-1', timeline };
    await insertTournament(client, tournament.id, timeline);

    const first = await syncTournamentRounds(client, tournament);
    const second = await syncTournamentRounds(client, tournament);
    assert.strictEqual(first.length, 2);
    assert.strictEqual(second.length, 2);
    assert.deepStrictEqual(first.map((r) => r.round_number), [1, 2]);

    const persisted = await getTournamentRounds(client, tournament.id);
    assert.strictEqual(persisted.length, 2, 'no duplicate rounds after re-sync');
    assert.strictEqual(new Set(persisted.map((r) => r.id)).size, 2, 'distinct round ids');
    assert.strictEqual(persisted[0].name, 'Qualifier');
    assert.strictEqual(persisted[0].teams_advancing, 48);
    assert.strictEqual(persisted[1].name, 'Final');
  }, t);
});

test('syncTournamentRounds: empty timeline falls back to a single default Round 1', async (t) => {
  await withTransaction(async (client) => {
    const tournament = { id: 'RNDT-2', timeline: null };
    await insertTournament(client, tournament.id, null);
    const rounds = await syncTournamentRounds(client, tournament);
    assert.strictEqual(rounds.length, 1);
    assert.strictEqual(rounds[0].round_number, 1);
    assert.strictEqual(rounds[0].name, 'Round 1');
  }, t);
});

test('legacyRoundBackfill: stamps round_id on existing days/groups/rooms/matches and leaves registrations untouched', async (t) => {
  await withTransaction(async (client) => {
    const timeline = [{ name: 'Qualifier', qualified: '16', date: '2026-11-01' }];
    const tournament = { id: 'RNDT-3', timeline };
    await insertTournament(client, tournament.id, timeline);

    // Pre-round structural rows with NO round_id (legacy shape)
    await client.query('INSERT INTO tournament_days (id, tournament_id, day_number, date) VALUES ($1, $2, 1, $3)', ['DAYX-1', tournament.id, '2026-11-01']);
    await client.query('INSERT INTO tournament_days (id, tournament_id, day_number, date) VALUES ($1, $2, 2, $3)', ['DAYX-2', tournament.id, '2026-11-02']);
    await client.query('INSERT INTO tournament_groups (id, day_id, tournament_id, group_name, sequence) VALUES ($1, $2, $3, $4, 1)', ['GRPX-1', 'DAYX-1', tournament.id, 'Group A']);
    await client.query('INSERT INTO tournament_rooms (id, group_id, day_id, tournament_id, room_number, capacity, status) VALUES ($1, $2, $3, $4, 1, 16, $5)', ['RMX-1', 'GRPX-1', 'DAYX-1', tournament.id, 'DRAFT']);
    await client.query(
      'INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status) VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8)',
      ['MATX-1', 'RMX-1', 'GRPX-1', 'DAYX-1', tournament.id, '10:00', '10:25', 'PENDING']
    );

    // A registration row that must survive untouched
    await client.query('INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)', ['USRX-1', 'usrx1@example.com', 'Test User', 'x']);
    await client.query(
      'INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, status) VALUES ($1, $2, $3, $4, $5, $6)',
      ['REGX-1', tournament.id, 'USRX-1', 'Alpha', 'Cap', 'pending']
    );

    const daysBefore = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_days WHERE tournament_id = $1', [tournament.id])).rows[0].c;

    await legacyRoundBackfill(client);

    const rounds = await getTournamentRounds(client, tournament.id);
    assert.strictEqual(rounds.length, 1);

    // Both days (day 2 has no configured round date but precedes the round's
    // planned execution window; transitional rule attaches it to Round 1)
    const days = (await client.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tournament.id])).rows;
    for (const d of days) assert.strictEqual(d.round_id, rounds[0].id, 'day round_id stamped');

    const groups = (await client.query('SELECT * FROM tournament_groups WHERE tournament_id = $1', [tournament.id])).rows;
    const rooms = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [tournament.id])).rows;
    const matches = (await client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [tournament.id])).rows;
    assert.strictEqual(groups[0].round_id, rounds[0].id);
    assert.strictEqual(rooms[0].round_id, rounds[0].id);
    assert.strictEqual(matches[0].round_id, rounds[0].id);

    // No rows were deleted or re-created, and registrations are untouched
    const daysAfter = (await client.query('SELECT COUNT(*)::int AS c FROM tournament_days WHERE tournament_id = $1', [tournament.id])).rows[0].c;
    assert.strictEqual(daysAfter, daysBefore);
    const reg = (await client.query('SELECT * FROM tournament_registrations WHERE id = $1', ['REGX-1'])).rows[0];
    assert.ok(reg && reg.status === 'pending' && reg.user_id === 'USRX-1');
  }, t);
});

test('legacyRoundBackfill: idempotent when run repeatedly', async (t) => {
  await withTransaction(async (client) => {
    const timeline = [{ name: 'Semi', qualified: '24', date: '2026-11-05' }];
    const tournament = { id: 'RNDT-4', timeline };
    await insertTournament(client, tournament.id, timeline);
    await client.query('INSERT INTO tournament_days (id, tournament_id, day_number, date) VALUES ($1, $2, 1, $3)', ['DAYX-4', tournament.id, '2026-11-05']);

    await legacyRoundBackfill(client);
    await legacyRoundBackfill(client);
    const rounds = await getTournamentRounds(client, tournament.id);
    assert.strictEqual(rounds.length, 1);
    const day = (await client.query('SELECT round_id FROM tournament_days WHERE id = $1', ['DAYX-4'])).rows[0];
    assert.strictEqual(day.round_id, rounds[0].id);
  }, t);
});