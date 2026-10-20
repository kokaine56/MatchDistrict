// scripts/init-scratch-db.js
// Idempotently creates the complete MatchDistrict schema on a separate scratch PostgreSQL database.
// Reads ONLY PGTEST_URL from the environment and refuses execution if it matches DATABASE_URL.
// Reuses the exact schema definition from server/schemaMigrations.js so server.js and scratch DB cannot drift.

import pg from 'pg';
import { assertSafeTestDb } from '../tests/testDbGuard.js';
import { runSchemaMigrations } from '../server/schemaMigrations.js';

async function initScratchDb() {
  const testUrl = process.env.PGTEST_URL;
  if (!testUrl || !testUrl.trim()) {
    console.error('❌ [SCRATCH DB GUARD] Error: PGTEST_URL environment variable is not set.');
    console.error('Please define PGTEST_URL pointing to an isolated scratch/test database.');
    process.exit(1);
  }

  // Reuse safety guard to prevent accidental runs against production/live database
  try {
    assertSafeTestDb(testUrl);
  } catch (guardErr) {
    console.error(`❌ ${guardErr.message}`);
    process.exit(1);
  }

  let parsedHost = 'unknown';
  let parsedDb = 'unknown';
  try {
    const u = new URL(testUrl);
    parsedHost = u.hostname || 'unknown';
    parsedDb = (u.pathname || '').replace(/^\//, '') || 'unknown';
  } catch {
    // Keep sanitized
  }

  console.log(`📦 [SCRATCH DB] Connecting to scratch test database (host: ${parsedHost}, db: ${parsedDb})...`);

  const pool = new pg.Pool({
    connectionString: testUrl,
    ssl: testUrl.includes('localhost') || testUrl.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
  });

  let client;
  try {
    client = await pool.connect();
    console.log('✅ [SCRATCH DB] Connected. Creating full schema via shared runSchemaMigrations()...');

    // Reuse the exact unified schema code shared with server.js
    await runSchemaMigrations(client);

    console.log('✅ [SCRATCH DB] Schema successfully initialized on scratch database.');
  } catch (err) {
    console.error('❌ [SCRATCH DB] Schema initialization failed:', err.message);
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end().catch(() => {});
  }
}

initScratchDb().catch((err) => {
  console.error('Fatal initialization error:', err.message);
  process.exit(1);
});
