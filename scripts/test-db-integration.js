import fs from 'fs';
import path from 'path';
import { createDatabasePool } from '../server/db.js';
import { runSchemaMigrations } from '../server/schemaMigrations.js';
import { getDetailedRoundStandings } from '../server/roundProgressionService.js';

// Load .env
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    for (const line of envFile.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  console.warn('Could not read .env:', e.message);
}

async function testDatabaseIntegration() {
  console.log('Connecting to database...');
  let pool;
  try {
    pool = createDatabasePool();
    console.log('Running migrations to verify column additions...');
    await runSchemaMigrations(pool);
    console.log('✓ Migrations ran successfully');

    // Query columns in tournament_rounds and tournament_groups to verify
    const colCheckRounds = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tournament_rounds' 
        AND column_name IN ('leaderboard_published', 'leaderboard_published_at')
    `);
    console.log('tournament_rounds columns:', colCheckRounds.rows);

    const colCheckGroups = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'tournament_groups' 
        AND column_name IN ('scores_saved', 'scores_saved_at', 'scores_status')
    `);
    console.log('tournament_groups columns:', colCheckGroups.rows);

    // Find any existing tournament
    const tourneyRes = await pool.query(`
      SELECT id, title FROM tournaments ORDER BY created_at DESC LIMIT 1
    `);
    if (tourneyRes.rows.length > 0) {
      const tourney = tourneyRes.rows[0];
      console.log(`Found tournament: ${tourney.title} (${tourney.id})`);
      const standings = await getDetailedRoundStandings(pool, tourney.id, 1);
      console.log('Round 1 standings retrieved successfully:');
      console.log(`- Round name: ${standings.round?.name}`);
      console.log(`- Configured districts count: ${standings.configuredDistricts?.length || 0}`);
      console.log(`- Total teams count: ${standings.teams?.length || 0}`);
      console.log(`- Published: ${standings.round?.leaderboard_published}`);
      if (standings.configuredDistricts?.length > 0) {
        console.log(`- District 1 score status: ${standings.configuredDistricts[0]?.scores_status || 'unsaved'}`);
      }
    } else {
      console.log('No tournaments found in database.');
    }
  } catch (err) {
    console.error('Database integration test error:', err);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

testDatabaseIntegration();
