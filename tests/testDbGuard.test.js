// tests/testDbGuard.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeTestDb } from './testDbGuard.js';

test('assertSafeTestDb allows separate scratch databases', () => {
  const result = assertSafeTestDb('postgresql://scratch-db.internal:5432/test_scratch');
  assert.equal(result, 'postgresql://scratch-db.internal:5432/test_scratch');
});

test('assertSafeTestDb refuses when PGTEST_URL matches DATABASE_URL host and database', () => {
  const prodUrl = process.env.DATABASE_URL;
  if (!prodUrl) return;

  assert.throws(
    () => {
      assertSafeTestDb(prodUrl);
    },
    (err) => {
      assert.match(err.message, /DATABASE SAFETY GUARD/);
      assert.match(err.message, /Refusing to run tests against the project database/);
      return true;
    }
  );
});
