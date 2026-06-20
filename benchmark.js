import pg from 'pg';
import { performance } from 'perf_hooks';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://localhost/postgres'
});

async function run() {
  try {
    const res = await pool.query('SELECT 1');
    console.log('DB connected');
  } catch (err) {
    console.error('DB error', err);
  }
  pool.end();
}
run();
