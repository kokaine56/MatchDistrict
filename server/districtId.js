import crypto from 'node:crypto';

export const DISTRICT_ID_FORMAT = /^[1-9][0-9]{7}$/;
export const DISTRICT_ID_MAX_ATTEMPTS = 8;

export function generateDistrictId(randomInt = crypto.randomInt) {
  return String(randomInt(10_000_000, 100_000_000));
}

export function planDistrictIdBackfill(accounts, generateId = generateDistrictId) {
  const ordered = [...accounts].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const used = new Set();
  const retained = new Set();
  const changes = [];

  for (const account of ordered) {
    const value = account.district_id == null ? null : String(account.district_id);
    if (value && DISTRICT_ID_FORMAT.test(value) && !used.has(value)) {
      used.add(value);
      retained.add(account.id);
    }
  }

  for (const account of ordered) {
    if (retained.has(account.id)) continue;
    const value = account.district_id == null ? null : String(account.district_id);
    const reason = value == null ? 'missing' : DISTRICT_ID_FORMAT.test(value) ? 'duplicate' : 'invalid';
    let replacement = null;
    for (let attempt = 0; attempt < DISTRICT_ID_MAX_ATTEMPTS; attempt += 1) {
      const candidate = String(generateId());
      if (DISTRICT_ID_FORMAT.test(candidate) && !used.has(candidate)) {
        replacement = candidate;
        used.add(candidate);
        break;
      }
    }
    if (!replacement) {
      const error = new Error(`Could not allocate a unique District ID after ${DISTRICT_ID_MAX_ATTEMPTS} attempts.`);
      error.code = 'DISTRICT_ID_COLLISION_LIMIT';
      throw error;
    }
    changes.push({ userId: account.id, previousDistrictId: value, districtId: replacement, reason });
  }

  return changes;
}

export async function insertWithDistrictId(insertAttempt, generateId = generateDistrictId) {
  for (let attempt = 0; attempt < DISTRICT_ID_MAX_ATTEMPTS; attempt += 1) {
    const districtId = String(generateId());
    if (!DISTRICT_ID_FORMAT.test(districtId)) {
      throw new Error('District ID generator returned an invalid value.');
    }
    const result = await insertAttempt(districtId);
    if (result?.rows?.[0]) return result.rows[0];
  }

  const error = new Error(`Could not allocate a unique District ID after ${DISTRICT_ID_MAX_ATTEMPTS} attempts.`);
  error.code = 'DISTRICT_ID_COLLISION_LIMIT';
  throw error;
}

export async function migrateDistrictIds(client, generateId = generateDistrictId, { enforceNotNull = false } = {}) {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(731904281::bigint)');
    await client.query('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE');
    await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS district_id VARCHAR(32)');
    await client.query(`
      CREATE TABLE IF NOT EXISTS district_id_migration_audit (
        user_id VARCHAR(50) NOT NULL,
        previous_district_id TEXT,
        assigned_district_id VARCHAR(8) NOT NULL,
        reason VARCHAR(16) NOT NULL CHECK (reason IN ('missing', 'invalid', 'duplicate')),
        migrated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows: accounts } = await client.query('SELECT id, district_id FROM users ORDER BY id FOR UPDATE');
    const changes = planDistrictIdBackfill(accounts, generateId);
    for (const change of changes) {
      await client.query('UPDATE users SET district_id = $1 WHERE id = $2', [change.districtId, change.userId]);
      await client.query(
        `INSERT INTO district_id_migration_audit (user_id, previous_district_id, assigned_district_id, reason)
         VALUES ($1, $2, $3, $4)`,
        [change.userId, change.previousDistrictId, change.districtId, change.reason]
      );
    }

    const verification = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE district_id IS NULL OR district_id !~ '^[1-9][0-9]{7}$')::int AS invalid_count,
        COUNT(*) - COUNT(DISTINCT district_id)::int AS duplicate_count
      FROM users
    `);
    const invalidCount = Number(verification.rows[0]?.invalid_count || 0);
    const duplicateCount = Number(verification.rows[0]?.duplicate_count || 0);
    if (invalidCount || duplicateCount) {
      throw new Error(`District ID verification failed (invalid=${invalidCount}, duplicate=${duplicateCount}).`);
    }

    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_district_id ON users(district_id)');
    await client.query(`
      DO $district_id$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_district_id_format_check'
            AND conrelid = 'public.users'::regclass
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_district_id_format_check
            CHECK (district_id ~ '^[1-9][0-9]{7}$');
        END IF;
      END
      $district_id$
    `);
    if (enforceNotNull) {
      await client.query('ALTER TABLE users ALTER COLUMN district_id SET NOT NULL');
    }
    await client.query('COMMIT');
    return { scanned: accounts.length, assigned: changes.length, invalid: invalidCount, duplicates: duplicateCount };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
