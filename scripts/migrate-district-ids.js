import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createDatabasePool } from '../server/db.js';
import { migrateDistrictIds } from '../server/districtId.js';

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null && value) process.env[key] = value;
  }
}

loadLocalEnv();
const pool = createDatabasePool();
let client;
try {
  client = await pool.connect();
  const result = await migrateDistrictIds(client, undefined, { enforceNotNull: true });
  console.log(`[DISTRICT ID MIGRATION] Verified ${result.scanned} account(s); assigned ${result.assigned}; invalid=${result.invalid}; duplicates=${result.duplicates}.`);
} catch (error) {
  console.error(`[DISTRICT ID MIGRATION] Failed safely [code: ${error.code || 'MIGRATION_ERROR'}]. No partial transaction was committed.`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
