import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DISTRICT_ID_MAX_ATTEMPTS,
  generateDistrictId,
  insertWithDistrictId,
  migrateDistrictIds,
  planDistrictIdBackfill,
} from './districtId.js';

test('generates exactly eight digits with a non-zero first digit using the CSPRNG range', () => {
  const id = generateDistrictId((min, max) => {
    assert.equal(min, 10_000_000);
    assert.equal(max, 100_000_000);
    return 42_000_007;
  });
  assert.equal(id, '42000007');
});

test('backfill preserves unique valid IDs and safely replaces missing, invalid, and duplicate IDs', () => {
  const accounts = [
    { id: 'a', district_id: '12345678' },
    { id: 'b', district_id: '12345678' },
    { id: 'c', district_id: '1234' },
    { id: 'd', district_id: null },
  ];
  const generated = ['90000001', '90000002', '90000003'];
  const changes = planDistrictIdBackfill(accounts, () => generated.shift());
  assert.deepEqual(changes, [
    { userId: 'b', previousDistrictId: '12345678', districtId: '90000001', reason: 'duplicate' },
    { userId: 'c', previousDistrictId: '1234', districtId: '90000002', reason: 'invalid' },
    { userId: 'd', previousDistrictId: null, districtId: '90000003', reason: 'missing' },
  ]);
  assert.equal(accounts[0].district_id, '12345678');
});

test('backfill reserves valid IDs from later rows before generating replacements', () => {
  const generated = ['90000001', '90000002'];
  const changes = planDistrictIdBackfill([
    { id: 'a-missing', district_id: null },
    { id: 'z-existing', district_id: '90000001' },
  ], () => generated.shift());
  assert.equal(changes[0].districtId, '90000002');
});

test('ID allocation retries only when insertion reports a district ID collision', async () => {
  const generated = ['10000001', '10000002', '10000003'];
  const attempts = [];
  const account = await insertWithDistrictId(async (districtId) => {
    attempts.push(districtId);
    return attempts.length < 3 ? { rows: [] } : { rows: [{ id: 'user-1', district_id: districtId }] };
  }, () => generated.shift());
  assert.deepEqual(attempts, ['10000001', '10000002', '10000003']);
  assert.equal(account.district_id, '10000003');
});

test('ID allocation stops after bounded collisions', async () => {
  let count = 0;
  await assert.rejects(
    insertWithDistrictId(async () => { count += 1; return { rows: [] }; }, () => '10000001'),
    (error) => error.code === 'DISTRICT_ID_COLLISION_LIMIT'
  );
  assert.equal(count, DISTRICT_ID_MAX_ATTEMPTS);
});

function migrationFixture(initialAccounts) {
  const state = { accounts: structuredClone(initialAccounts), audit: [], committed: false, notNull: false };
  const client = {
    async query(sql, params = []) {
      const query = sql.trim();
      if (query === 'BEGIN' || query.startsWith('SELECT pg_advisory') || query.startsWith('LOCK TABLE') || query.startsWith('ALTER TABLE users ADD COLUMN') || query.startsWith('CREATE TABLE IF NOT EXISTS district_id_migration_audit') || query.startsWith('CREATE UNIQUE INDEX') || query.startsWith('DO $district_id$')) return { rows: [] };
      if (query.startsWith('SELECT id, district_id FROM users')) return { rows: structuredClone(state.accounts) };
      if (query.startsWith('UPDATE users SET district_id')) {
        const account = state.accounts.find((entry) => entry.id === params[1]);
        account.district_id = params[0];
        return { rowCount: 1, rows: [] };
      }
      if (query.startsWith('INSERT INTO district_id_migration_audit')) {
        state.audit.push({ user_id: params[0], previous_district_id: params[1], assigned_district_id: params[2], reason: params[3] });
        return { rowCount: 1, rows: [] };
      }
      if (query.startsWith('SELECT') && query.includes('invalid_count')) {
        const ids = state.accounts.map((entry) => entry.district_id);
        const invalid = ids.filter((id) => !/^[1-9][0-9]{7}$/.test(String(id))).length;
        const duplicates = ids.length - new Set(ids).size;
        return { rows: [{ invalid_count: invalid, duplicate_count: duplicates }] };
      }
      if (query.startsWith('ALTER TABLE users ALTER COLUMN district_id SET NOT NULL')) {
        state.notNull = true;
        return { rows: [] };
      }
      if (query === 'COMMIT') { state.committed = true; return { rows: [] }; }
      if (query === 'ROLLBACK') { return { rows: [] }; }
      throw new Error(`Unexpected migration query: ${query}`);
    },
  };
  return { client, state };
}

test('migration is transactional, audited, idempotent, and only enforces NOT NULL on request', async () => {
  const fixture = migrationFixture([
    { id: 'a', district_id: '12345678' },
    { id: 'b', district_id: null },
  ]);
  const generated = ['87654321'];
  const result = await migrateDistrictIds(fixture.client, () => generated.shift());
  assert.deepEqual(result, { scanned: 2, assigned: 1, invalid: 0, duplicates: 0 });
  assert.equal(fixture.state.accounts[0].district_id, '12345678');
  assert.equal(fixture.state.accounts[1].district_id, '87654321');
  assert.equal(fixture.state.audit[0].reason, 'missing');
  assert.equal(fixture.state.notNull, false);

  const repeated = await migrateDistrictIds(fixture.client, () => { throw new Error('unexpected ID generation'); });
  assert.equal(repeated.assigned, 0);
  await migrateDistrictIds(fixture.client, undefined, { enforceNotNull: true });
  assert.equal(fixture.state.notNull, true);
});
