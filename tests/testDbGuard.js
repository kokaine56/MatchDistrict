// tests/testDbGuard.js
// Safety guard preventing tests from ever connecting to or executing against the project's production/live database.

import fs from 'fs';
import path from 'path';

function ensureEnvLoaded() {
  if (process.env.DATABASE_URL) return;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual !== -1) {
            const key = trimmed.slice(0, firstEqual).trim();
            let val = trimmed.slice(firstEqual + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      });
    }
  } catch {
    // Non-blocking env load
  }
}

/**
 * Validates that testUrl does not point to the project's primary database (DATABASE_URL).
 * Throws a descriptive error if the host and database match.
 */
export function assertSafeTestDb(testUrl) {
  if (!testUrl) return null;
  ensureEnvLoaded();
  const prodUrl = process.env.DATABASE_URL;
  if (!prodUrl) return testUrl;

  let testParsed;
  let prodParsed;
  try {
    testParsed = new URL(testUrl);
  } catch {
    return testUrl;
  }

  try {
    prodParsed = new URL(prodUrl);
  } catch {
    return testUrl;
  }

  const testHost = (testParsed.hostname || '').toLowerCase();
  const prodHost = (prodParsed.hostname || '').toLowerCase();
  const testDb = (testParsed.pathname || '').toLowerCase();
  const prodDb = (prodParsed.pathname || '').toLowerCase();

  if (testHost && prodHost && testHost === prodHost && testDb === prodDb) {
    throw new Error(
      `[DATABASE SAFETY GUARD] Refusing to run tests against the project database! PGTEST_URL host (${testHost}) and database (${testDb}) match DATABASE_URL. PGTEST_URL must point to a separate scratch database.`
    );
  }

  return testUrl;
}
