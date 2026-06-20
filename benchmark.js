import { Pool } from "./mock_pg.js";
import fs from 'fs';


const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5432/matchdistrict',
});

async function main() {
  const userId = 'bench-user-1';

  const start = Date.now();
  const ITERATIONS = 100;

  for(let x=0; x<ITERATIONS; x++) {
      const monthlyPerformance = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;
        const tCountRes = await pool.query(
          'SELECT COUNT(*) as cnt FROM tournaments WHERE "orgId" = $1 AND "isDraft" = false AND EXTRACT(YEAR FROM created_at) = $2 AND EXTRACT(MONTH FROM created_at) = $3',
          [userId, year, month]
        );
        const rCountRes = await pool.query(
          `SELECT COUNT(*) as cnt FROM tournament_registrations tr
           JOIN tournaments t ON t.id = tr.tournament_id
           WHERE t."orgId" = $1 AND EXTRACT(YEAR FROM tr.created_at) = $2 AND EXTRACT(MONTH FROM tr.created_at) = $3`,
          [userId, year, month]
        );
        monthlyPerformance.push({
          month: label,
          tournaments: parseInt(tCountRes.rows[0].cnt),
          registrations: parseInt(rCountRes.rows[0].cnt)
        });
      }
  }
  const end = Date.now();
  console.log(`Original Time: ${end - start}ms`);

  const startNew = Date.now();
  for(let x=0; x<ITERATIONS; x++) {
      const monthlyPerformance = [];

      const dStart = new Date();
      dStart.setMonth(dStart.getMonth() - 5);
      dStart.setDate(1);
      dStart.setHours(0, 0, 0, 0);

      // We want to fetch all months in one go
      const tStatsRes = await pool.query(`
        SELECT
          EXTRACT(YEAR FROM created_at) as year,
          EXTRACT(MONTH FROM created_at) as month,
          COUNT(*) as cnt
        FROM tournaments
        WHERE "orgId" = $1 AND "isDraft" = false AND created_at >= $2
        GROUP BY year, month
      `, [userId, dStart]);

      const rStatsRes = await pool.query(`
        SELECT
          EXTRACT(YEAR FROM tr.created_at) as year,
          EXTRACT(MONTH FROM tr.created_at) as month,
          COUNT(*) as cnt
        FROM tournament_registrations tr
        JOIN tournaments t ON t.id = tr.tournament_id
        WHERE t."orgId" = $1 AND tr.created_at >= $2
        GROUP BY year, month
      `, [userId, dStart]);

      // Process mapping
      const tMap = {};
      tStatsRes.rows.forEach(r => tMap[`${r.year}-${String(r.month).padStart(2, '0')}`] = parseInt(r.cnt));

      const rMap = {};
      rStatsRes.rows.forEach(r => rMap[`${r.year}-${String(r.month).padStart(2, '0')}`] = parseInt(r.cnt));

      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const year = d.getFullYear();
        const month = d.getMonth() + 1;
        const label = `${year}-${String(month).padStart(2, '0')}`;

        monthlyPerformance.push({
          month: label,
          tournaments: tMap[label] || 0,
          registrations: rMap[label] || 0
        });
      }
  }
  const endNew = Date.now();
  console.log(`New Time: ${endNew - startNew}ms`);

  process.exit(0);
}

main().catch(console.error);
