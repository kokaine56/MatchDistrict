import pg from 'pg';
import fs from 'fs';

/**
 * Create the application's only PostgreSQL pool from the live Supabase URL.
 * Hardened database TLS (SENS-007):
 * - Enforces certificate validation by default (rejectUnauthorized: true)
 * - Allows custom CA injection via DB_SSL_CA or DB_SSL_CA_PATH
 * - Does not provide a certificate-verification opt-out
 * - Always requires TLS, including if a non-production connection string is supplied
 */
export function createDatabasePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to start MatchDistrict (live Supabase PostgreSQL).');
  }

  const sslConfig = { rejectUnauthorized: true };

  if (process.env.DB_SSL_CA) {
    sslConfig.ca = process.env.DB_SSL_CA;
  } else if (process.env.DB_SSL_CA_PATH) {
    if (!fs.existsSync(process.env.DB_SSL_CA_PATH)) {
      throw new Error('DB_SSL_CA_PATH does not point to a readable CA file.');
    }
    sslConfig.ca = fs.readFileSync(process.env.DB_SSL_CA_PATH, 'utf8');
  }

  const { Pool } = pg;
  return new Pool({
    connectionString,
    ssl: sslConfig,
  });
}
