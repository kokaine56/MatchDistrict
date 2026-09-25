import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import {
  assignGroups,
  buildGroups,
  getGroups,
} from '../server/groupService.js';

// DB-backed group assignment tests. These run only when a test database is
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

test('group assignment: database availability probe', async () => {
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

async function insertTournament(client, id, { slotsTotal = 64, teamsPerGroup = 16 } = {}) {
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, "slotsTotal", teams_per_group, "orgId")
     VALUES ($1, $2, 'BGMI', 'upcoming', $3, $4, $5)`,
    [id, 'Group assignment test', slotsTotal, teamsPerGroup, `ORG-${id}`]
  );
}

async function insertVerifiedReg(client, tournamentId, { id, teamName, slotNumber }) {
  await client.query(
    `INSERT INTO users (id, email, name, password) VALUES ($1, $2, $3, $4)`,
    [`USR-${id}`, `${id.toLowerCase()}@example.com`, 'Test User', 'x']
  );
  await client.query(
    `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, status, slot_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tournamentId, `USR-${id}`, teamName, 'Cap', 'confirmed', slotNumber]
  );
}

test('assignGroups: 64 slots / 16 per group -> 4 groups, 16-slot capacity each', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-1');
    const result = await assignGroups(client, 'GRPT-1');
    assert.strictEqual(result.groups.length, 4);
    assert.ok(result.groups.every(g => g.capacity === 16));
    const persisted = await getGroups(client, 'GRPT-1');
    assert.strictEqual(persisted.length, 4);
    assert.deepStrictEqual(persisted.map(g => g.name), ['A', 'B', 'C', 'D']);
  }, t);
});

test('assignGroups: 32 slots / 16 per group -> 2 groups of 16', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-2', { slotsTotal: 32 });
    const result = await assignGroups(client, 'GRPT-2');
    assert.strictEqual(result.groups.length, 2);
    assert.ok(result.groups.every(g => g.capacity === 16));
  }, t);
});

test('assignGroups: 48 slots / 12 per group -> 4 groups of 12', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-3', { slotsTotal: 48, teamsPerGroup: 12 });
    const result = await assignGroups(client, 'GRPT-3');
    assert.strictEqual(result.groups.length, 4);
    assert.ok(result.groups.every(g => g.capacity === 12));
  }, t);
});

test('assignGroups: 17th confirmed team lands in group B with group_name B', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-4');
    for (let i = 1; i <= 17; i++) {
      await insertVerifiedReg(client, 'GRPT-4', {
        id: `REG-4-${i}`,
        teamName: `Team ${i}`,
        slotNumber: i,
      });
    }
    const result = await assignGroups(client, 'GRPT-4');
    assert.strictEqual(result.assigned, 17);
    const row = (await client.query(
      'SELECT group_id, group_name FROM tournament_registrations WHERE id = $1',
      ['REG-4-17']
    )).rows[0];
    const b = buildGroups(64, 16).find(g => g.name === 'B');
    assert.strictEqual(row.group_name, 'B');
    assert.strictEqual(row.group_id, `GRP-GRPT-4-${String(b.group_index).padStart(2, '0')}`);
  }, t);
});

test('assignGroups: 64th team fills last group D; pending teams never occupy a group', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-5');
    for (let i = 1; i <= 64; i++) {
      await insertVerifiedReg(client, 'GRPT-5', {
        id: `REG-5-${i}`,
        teamName: `Team ${i}`,
        slotNumber: i,
      });
    }
    // A pending registration that does NOT occupy a slot.
    await insertVerifiedReg(client, 'GRPT-5', {
      id: 'REG-5-PENDING',
      teamName: 'Unverified Team',
      slotNumber: null,
    });
    await client.query(`UPDATE tournament_registrations SET status = 'pending' WHERE id = 'REG-5-PENDING'`);

    const result = await assignGroups(client, 'GRPT-5');
    assert.strictEqual(result.assigned, 64);
    const last = (await client.query(
      'SELECT group_name FROM tournament_registrations WHERE id = $1',
      ['REG-5-64']
    )).rows[0];
    assert.strictEqual(last.group_name, 'D');
    const pending = (await client.query(
      'SELECT group_name, group_id FROM tournament_registrations WHERE id = $1',
      ['REG-5-PENDING']
    )).rows[0];
    assert.strictEqual(pending.group_name, null);
    assert.strictEqual(pending.group_id, null);
  }, t);
});

test('assignGroups: idempotent — re-running never duplicates group rows', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-6');
    await insertVerifiedReg(client, 'GRPT-6', { id: 'REG-6-1', teamName: 'A', slotNumber: 1 });
    await assignGroups(client, 'GRPT-6');
    await assignGroups(client, 'GRPT-6');
    const persisted = await getGroups(client, 'GRPT-6');
    assert.strictEqual(persisted.length, 4);
    assert.strictEqual(new Set(persisted.map(g => g.id)).size, 4);
  }, t);
});

test('assignGroups: stale group stamps are cleared for teams that lost their slot', async (t) => {
  await withTransaction(async (client) => {
    await insertTournament(client, 'GRPT-7');
    await insertVerifiedReg(client, 'GRPT-7', { id: 'REG-7-1', teamName: 'A', slotNumber: 1 });
    await assignGroups(client, 'GRPT-7');
    // Downgrade -> no longer occupies a slot.
    await client.query(`UPDATE tournament_registrations SET status = 'rejected' WHERE id = 'REG-7-1'`);
    const result = await assignGroups(client, 'GRPT-7');
    assert.strictEqual(result.assigned, 0);
    const row = (await client.query(
      'SELECT group_name, group_id FROM tournament_registrations WHERE id = $1',
      ['REG-7-1']
    )).rows[0];
    assert.strictEqual(row.group_name, null);
    assert.strictEqual(row.group_id, null);
  }, t);
});