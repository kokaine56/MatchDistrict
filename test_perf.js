import { performance } from 'perf_hooks';

// Mock pool
class Pool {
  async query(q, params) {
    // Simulate query latency
    await new Promise(r => setTimeout(r, 20)); // 20ms per query
    return { rows: [{ cnt: '1' }] };
  }
}

const pool = new Pool();
const user = { id: 1 };

async function oldWay() {
  const start = performance.now();
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const label = `${year}-${String(month).padStart(2, '0')}`;
    const countRes = await pool.query(
      `SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3`,
      [user.id, year, month]
    );
    monthlyData.push({ month: label, count: parseInt(countRes.rows[0].cnt) });
  }
  const end = performance.now();
  return { time: end - start, data: monthlyData };
}

async function newWay() {
  const start = performance.now();

  // Create labels and map for all required months
  const monthlyData = [];
  const monthlyDataMap = new Map();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const label = `${year}-${String(month).padStart(2, '0')}`;
    monthlyData.push({ month: label, count: 0 });
    monthlyDataMap.set(label, monthlyData.length - 1);
  }

  // Date 5 months ago
  const d5 = new Date();
  d5.setMonth(d5.getMonth() - 5);
  d5.setDate(1);
  d5.setHours(0, 0, 0, 0);

  const poolRes = await pool.query(
    `SELECT EXTRACT(YEAR FROM created_at) as year, EXTRACT(MONTH FROM created_at) as month, COUNT(*) as cnt
     FROM tournaments
     WHERE "orgId" = $1 AND created_at >= $2
     GROUP BY year, month`,
    [user.id, d5]
  );

  // poolRes is mocked here, normally we'd update `monthlyData`
  for (const row of poolRes.rows) {
      if (row.year && row.month) {
        const label = `${row.year}-${String(row.month).padStart(2, '0')}`;
        if (monthlyDataMap.has(label)) {
          monthlyData[monthlyDataMap.get(label)].count = parseInt(row.cnt);
        }
      }
  }

  const end = performance.now();
  return { time: end - start, data: monthlyData };
}

async function run() {
  const oldRes = await oldWay();
  console.log('Old way:', oldRes.time.toFixed(2), 'ms');

  const newRes = await newWay();
  console.log('New way:', newRes.time.toFixed(2), 'ms');
}
run();
