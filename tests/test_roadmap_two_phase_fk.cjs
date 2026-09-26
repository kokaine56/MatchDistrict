const assert = require('assert');
const pg = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple .env parser
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w_]+)\s*=\s*"?([^"\r\n]+)"?/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  });
}

const { generateTournamentRoadmap } = require('../server/roadmapGenerator.js');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runTests() {
  console.log('🧪 Running Roadmap Foreign Key & Two-Phase DB Tests...\n');
  const client = await pool.connect();
  const createdTournaments = [];

  try {
    // 1. Fetch an organizer user for test creation
    const userRes = await client.query('SELECT id FROM users LIMIT 1');
    const orgId = userRes.rows.length > 0 ? userRes.rows[0].id : null;
    assert(orgId, 'Must have at least one user in database for orgId FK');

    const testScenarios = [
      { name: '64 slots / max 25 teams', slotsTotal: 64, teamsPerMatch: 25 },
      { name: '25 slots / max 25 teams (Direct GF)', slotsTotal: 25, teamsPerMatch: 25 },
      { name: '20 slots / max 25 teams (Direct GF)', slotsTotal: 20, teamsPerMatch: 25 },
      { name: '16 slots / max 16 teams (Direct GF)', slotsTotal: 16, teamsPerMatch: 16 },
      { name: '128 slots / max 25 teams', slotsTotal: 128, teamsPerMatch: 25 },
      { name: '256 slots / max 25 teams', slotsTotal: 256, teamsPerMatch: 25 },
    ];

    for (const sc of testScenarios) {
      console.log(`\n--- Testing Scenario: ${sc.name} ---`);
      const tournamentId = `TRN-TEST-FK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      createdTournaments.push(tournamentId);

      // Insert dummy tournament row
      await client.query(
        `INSERT INTO tournaments (id, title, game, status, "slotsTotal", "orgId", teams_per_match, "startDate", "isDraft")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false)`,
        [tournamentId, `Test FK ${sc.name}`, 'BGMI', 'upcoming', sc.slotsTotal, orgId, sc.teamsPerMatch, '2026-10-01T10:00:00Z']
      );

      const tRow = {
        id: tournamentId,
        title: `Test FK ${sc.name}`,
        game: 'BGMI',
        slotsTotal: sc.slotsTotal,
        teams_per_match: sc.teamsPerMatch,
        startDate: '2026-10-01T10:00:00Z',
        orgId
      };

      // Generate roadmap structure using generator
      const genResult = generateTournamentRoadmap(tRow);
      assert.strictEqual(genResult.ok, true, `Generator should succeed for ${sc.name}: ${genResult.error}`);

      const { rounds, days, groups, rooms, matches } = genResult.roadmap;

      // Execute Two-Phase Database Transaction
      await client.query('BEGIN');

      await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_rooms WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_groups WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_days WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [tournamentId]);

      for (const r of rounds) {
        await client.query(
          `INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, "date", "time", map)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [r.id, r.tournament_id, r.round_number, r.name, r.status || 'configured', r.teams_advancing, r.date, r.time, r.map || null]
        );
      }

      for (const d of (days || [])) {
        await client.query(
          `INSERT INTO tournament_days (id, tournament_id, day_number, date, round_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [d.id, d.tournament_id, d.day_number, d.date || null, d.round_id || null]
        );
      }

      // Phase 1: Insert all matches with next_match_id = NULL
      for (const m of (matches || [])) {
        await client.query(
          `INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [m.id, m.room_id || null, m.group_id || null, m.day_id || null, m.tournament_id, m.match_number, m.start_time, m.end_time || '', m.status || 'PENDING', m.round_id || null, m.map || 'Erangel', m.id_pwd_release_time || null, m.next_round_id || null, m.teams_advancing || null]
        );
      }

      // Phase 2: Populate progression links (next_match_id)
      for (const m of (matches || [])) {
        if (m.next_match_id) {
          await client.query(
            `UPDATE tournament_matches
             SET next_match_id = $1
             WHERE id = $2`,
            [m.next_match_id, m.id]
          );
        }
      }

      await client.query(`UPDATE tournaments SET roadmap_status = 'draft' WHERE id = $1`, [tournamentId]);
      await client.query('COMMIT');

      console.log(`  ✓ Two-Phase database transaction committed successfully for ${sc.name}.`);

      // Database Validation Query: Check for broken next_match_id references
      const valRes = await client.query(`
        SELECT tm.id, tm.next_match_id
        FROM tournament_matches tm
        LEFT JOIN tournament_matches next_tm ON next_tm.id = tm.next_match_id
        WHERE tm.tournament_id = $1
          AND tm.next_match_id IS NOT NULL
          AND next_tm.id IS NULL
      `, [tournamentId]);

      assert.strictEqual(valRes.rows.length, 0, `Broken next_match_id references found: ${valRes.rows.length}`);
      console.log(`  ✓ Database validation query returned 0 broken next_match_id references.`);

      // Regeneration / Idempotency Check: Run generation a second time on the same tournament
      const regenResult = generateTournamentRoadmap(tRow);
      assert.strictEqual(regenResult.ok, true, 'Regeneration planning should succeed');

      await client.query('BEGIN');
      await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_rooms WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_groups WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_days WHERE tournament_id = $1', [tournamentId]);
      await client.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [tournamentId]);

      for (const r of regenResult.roadmap.rounds) {
        await client.query(
          `INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, "date", "time", map)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [r.id, r.tournament_id, r.round_number, r.name, r.status || 'configured', r.teams_advancing, r.date, r.time, r.map || null]
        );
      }

      for (const m of regenResult.roadmap.matches) {
        await client.query(
          `INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, status, round_id, map, id_pwd_release_time, next_round_id, teams_advancing)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [m.id, m.room_id || null, m.group_id || null, m.day_id || null, m.tournament_id, m.match_number, m.start_time, m.end_time || '', m.status || 'PENDING', m.round_id || null, m.map || 'Erangel', m.id_pwd_release_time || null, m.next_round_id || null, m.teams_advancing || null]
        );
      }

      for (const m of regenResult.roadmap.matches) {
        if (m.next_match_id) {
          await client.query(
            `UPDATE tournament_matches SET next_match_id = $1 WHERE id = $2`,
            [m.next_match_id, m.id]
          );
        }
      }

      await client.query('COMMIT');
      console.log(`  ✓ Regeneration idempotency verified for ${sc.name}.`);
    }

    console.log('\n🎉 ALL TWO-PHASE FOREIGN KEY TESTS PASSED PERFECTLY!\n');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Test failed with error:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup created test tournaments
    for (const id of createdTournaments) {
      await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [id]).catch(() => {});
      await client.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [id]).catch(() => {});
      await client.query('DELETE FROM tournaments WHERE id = $1', [id]).catch(() => {});
    }
    client.release();
    await pool.end();
  }
}

runTests();
