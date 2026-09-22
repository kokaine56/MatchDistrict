const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.ahgokqbjrpeotqzwilts:kiNimESK6Z71b3CM@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require'
});

async function run() {
  try {
    const secRes = await pool.query('SELECT * FROM security_findings ORDER BY detected_at DESC');
    console.log('=== SECURITY FINDINGS ===');
    console.log(JSON.stringify(secRes.rows, null, 2));

    const healthRes = await pool.query('SELECT service_id, status, response_time_ms, checked_at FROM service_health_checks ORDER BY checked_at DESC LIMIT 10');
    console.log('\n=== RECENT HEALTH CHECKS ===');
    console.log(JSON.stringify(healthRes.rows, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

run();
