import pg from 'pg';

/** Create the application's only PostgreSQL pool from the live Supabase URL. */
export function createDatabasePool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to start MatchDistrict (live Supabase PostgreSQL).');
  }

  const { Pool } = pg;
  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
}
