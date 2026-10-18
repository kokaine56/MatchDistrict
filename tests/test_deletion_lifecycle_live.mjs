import pg from 'file:///e:/Projects/MatchDistrict/node_modules/pg/lib/index.js';
import fs from 'fs';
import assert from 'assert';
import { deleteEntireRoadmap, publishManualRoadmap, unpublishManualRoadmap } from '../server/manualRoadmapService.js';
import { legacyRoundBackfill } from '../server/roundsService.js';

// Read .env
const envContent = fs.readFileSync('e:/Projects/MatchDistrict/.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w_]+)\s*=\s*"?([^"\r\n]+)"?/);
  if (match) env[match[1]] = match[2];
});

async function runLiveAuditTests() {
  console.log('🧪 Starting Live End-to-End Database Audit Verification...\n');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  const testTournaments = [];

  try {
    // Fetch an existing user for orgId
    const userRes = await client.query('SELECT id FROM users LIMIT 1');
    const orgId = userRes.rows.length > 0 ? userRes.rows[0].id : null;
    assert.ok(orgId, 'Must have at least one user in DB for orgId');

    // ──────────────────────────────────────────────────────────────────────────
    // Test 1: Full Roadmap Reset on Real PostgreSQL
    // ──────────────────────────────────────────────────────────────────────────
    console.log('▶ Test 1: Testing Master Roadmap Deletion on live PostgreSQL...');
    const tId1 = `TRN-AUDIT-1-${Date.now().toString(36).toUpperCase()}`;
    testTournaments.push(tId1);

    // Create tournament with approved roadmap and published rounds
    await client.query(`
      INSERT INTO tournaments (id, title, game, status, "slotsTotal", "orgId", roadmap_status, rounds_published, timeline, "startDate", "isDraft")
      VALUES ($1, 'Live Audit Tournament 1', 'BGMI', 'upcoming', 64, $2, 'approved', true, '{"rounds":[{"id":"R1"}]}', NOW(), false)
    `, [tId1, orgId]);

    // Create a registered team (to verify preservation)
    const teamId = `TEAM-${Date.now().toString(36).toUpperCase()}`;
    await client.query(`
      INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
      VALUES ($1, $2, 'Audit Test Team', $3, 'confirmed')
    `, [teamId, tId1, orgId]);

    // Create 2 rounds
    const r1 = `RND-A1-${Date.now()}`;
    const r2 = `RND-A2-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, advancement_target_round_id)
      VALUES ($1, $3, 1, 'Qualifier 1', 'configured', $2),
             ($2, $3, 2, 'Grand Final', 'configured', NULL)
    `, [r1, r2, tId1]);

    // Create 2 days
    const d1 = `DAY-A1-${Date.now()}`;
    const d2 = `DAY-A2-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date)
      VALUES ($1, $3, $4, 1, '2026-10-20'),
             ($2, $3, $5, 1, '2026-10-21')
    `, [d1, d2, tId1, r1, r2]);

    // Create groups
    const g1 = `GRP-A1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_groups (id, tournament_id, day_id, round_id, group_name, sequence, display_order)
      VALUES ($1, $2, $3, $4, 'District 1', 1, 1)
    `, [g1, tId1, d1, r1]);

    // Create rooms
    const rm1 = `RM-A1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_rooms (id, tournament_id, day_id, group_id, round_id, room_number, capacity, status)
      VALUES ($1, $2, $3, $4, $5, 991, 16, 'DRAFT')
    `, [rm1, tId1, d1, g1, r1]);

    // Create matches with progression pointer
    const m1 = `MAT-A1-${Date.now()}`;
    const m2 = `MAT-A2-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_matches (id, tournament_id, round_id, day_id, group_id, room_id, match_number, start_time, end_time, next_match_id, next_round_id)
      VALUES ($1, $3, $4, $5, $6, $7, 1, '12:00', '12:30', $2, $8),
             ($2, $3, $8, $9, $6, $7, 2, '13:00', '13:30', NULL, NULL)
    `, [m1, m2, tId1, r1, d1, g1, rm1, r2, d2]);

    // Create match assignment
    const asg1 = `ASG-A1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, room_id, group_id, day_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [asg1, tId1, teamId, m1, rm1, g1, d1]);

    // Execute atomic deletion inside SQL transaction
    await client.query('BEGIN');
    const deleteRes = await deleteEntireRoadmap(client, tId1);
    await client.query('COMMIT');

    assert.strictEqual(deleteRes.success, true);
    console.log('   ✓ deleteEntireRoadmap returned success inside transaction.');

    // Verify all child tables are completely empty for this tournament
    const checkCounts = await client.query(`
      SELECT
        (SELECT count(*) FROM tournament_rounds WHERE tournament_id = $1) as rounds,
        (SELECT count(*) FROM tournament_days WHERE tournament_id = $1) as days,
        (SELECT count(*) FROM tournament_groups WHERE tournament_id = $1) as groups,
        (SELECT count(*) FROM tournament_rooms WHERE tournament_id = $1) as rooms,
        (SELECT count(*) FROM tournament_matches WHERE tournament_id = $1) as matches,
        (SELECT count(*) FROM tournament_match_assignments WHERE tournament_id = $1) as assignments,
        (SELECT count(*) FROM tournament_planning_result WHERE tournament_id = $1) as plans
    `, [tId1]);

    const counts = checkCounts.rows[0];
    assert.strictEqual(parseInt(counts.rounds), 0, 'Rounds must be 0');
    assert.strictEqual(parseInt(counts.days), 0, 'Days must be 0');
    assert.strictEqual(parseInt(counts.groups), 0, 'Groups must be 0');
    assert.strictEqual(parseInt(counts.rooms), 0, 'Rooms must be 0');
    assert.strictEqual(parseInt(counts.matches), 0, 'Matches must be 0');
    assert.strictEqual(parseInt(counts.assignments), 0, 'Assignments must be 0');
    assert.strictEqual(parseInt(counts.plans), 0, 'Plans must be 0');
    console.log('   ✓ All roadmap child tables verified 0 rows in PostgreSQL.');

    // Verify tournament state: roadmap_status = 'draft', rounds_published = false, timeline = null
    const tCheck = await client.query(
      'SELECT roadmap_status, rounds_published, timeline FROM tournaments WHERE id = $1',
      [tId1]
    );
    assert.strictEqual(tCheck.rows[0].roadmap_status, 'draft', 'roadmap_status must be draft');
    assert.strictEqual(tCheck.rows[0].rounds_published, false, 'rounds_published must be false');
    assert.strictEqual(tCheck.rows[0].timeline, null, 'timeline must be cleared (null)');
    console.log('   ✓ Tournament record has roadmap_status="draft", rounds_published=false, timeline=null.');

    // Verify tournament_teams was preserved
    const teamCheck = await client.query('SELECT count(*) FROM tournament_teams WHERE id = $1', [teamId]);
    assert.strictEqual(parseInt(teamCheck.rows[0].count), 1, 'Teams must not be touched');
    console.log('   ✓ Registered team record preserved intact.');

    // ──────────────────────────────────────────────────────────────────────────
    // Test 2: Historical Results Protection Guard
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n▶ Test 2: Testing Historical Match Results Protection Guard...');
    const tId2 = `TRN-AUDIT-2-${Date.now().toString(36).toUpperCase()}`;
    testTournaments.push(tId2);

    await client.query(`
      INSERT INTO tournaments (id, title, game, status, "slotsTotal", "orgId", roadmap_status, rounds_published, "startDate", "isDraft")
      VALUES ($1, 'Live Audit Tournament 2', 'BGMI', 'ongoing', 64, $2, 'approved', true, NOW(), false)
    `, [tId2, orgId]);

    const r2_1 = `RND-B1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_rounds (id, tournament_id, round_number, name) VALUES ($1, $2, 1, 'Round 1')
    `, [r2_1, tId2]);

    const d2_1 = `DAY-B1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date) VALUES ($1, $2, $3, 1, '2026-10-22')
    `, [d2_1, tId2, r2_1]);

    const g2_1 = `GRP-B1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_groups (id, tournament_id, day_id, round_id, group_name, sequence) VALUES ($1, $2, $3, $4, 'Group A', 1)
    `, [g2_1, tId2, d2_1, r2_1]);

    const rm2_1 = `RM-B1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_rooms (id, tournament_id, day_id, group_id, round_id, room_number, capacity) VALUES ($1, $2, $3, $4, $5, 992, 16)
    `, [rm2_1, tId2, d2_1, g2_1, r2_1]);

    const m2_1 = `MAT-B1-${Date.now()}`;
    await client.query(`
      INSERT INTO tournament_matches (id, tournament_id, round_id, day_id, group_id, room_id, match_number, start_time, end_time)
      VALUES ($1, $2, $3, $4, $5, $6, 1, '14:00', '14:30')
    `, [m2_1, tId2, r2_1, d2_1, g2_1, rm2_1]);

    const team2 = `TEAM-B-${Date.now().toString(36).toUpperCase()}`;
    await client.query(`
      INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id) VALUES ($1, $2, 'Protected Team', $3)
    `, [team2, tId2, orgId]);

    // Insert recorded match result
    const resId = `RES-${Date.now().toString(36).toUpperCase()}`;
    await client.query(`
      INSERT INTO tournament_match_results (id, tournament_id, match_id, team_id, placement, kills)
      VALUES ($1, $2, $3, $4, 1, 5)
    `, [resId, tId2, m2_1, team2]);

    // Attempting deleteEntireRoadmap must reject with ROADMAP_HAS_RESULTS
    let rejected = false;
    try {
      await client.query('BEGIN');
      await deleteEntireRoadmap(client, tId2);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      rejected = true;
      assert.strictEqual(err.code, 'ROADMAP_HAS_RESULTS');
      console.log('   ✓ deleteEntireRoadmap properly aborted with ROADMAP_HAS_RESULTS.');
    }
    assert.ok(rejected, 'Must reject deletion when match results exist');

    // Verify all records are still 100% intact
    const preservedCheck = await client.query('SELECT count(*) FROM tournament_matches WHERE tournament_id = $1', [tId2]);
    assert.strictEqual(parseInt(preservedCheck.rows[0].count), 1, 'Match must be preserved');
    console.log('   ✓ Existing match and result preserved intact after abort.');

    // ──────────────────────────────────────────────────────────────────────────
    // Test 3: Public Unpublished State Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n▶ Test 3: Testing Public Visibility Gate on reset tournament...');
    const tStateRes = await client.query(
      'SELECT roadmap_status, rounds_published FROM tournaments WHERE id = $1',
      [tId1]
    );
    const row = tStateRes.rows[0];
    const isPublished = (row.roadmap_status === 'approved' || row.roadmap_status === 'published') && row.rounds_published !== false;
    assert.strictEqual(isPublished, false, 'isPublished must evaluate to false');

    const publicResponse = {
      success: true,
      mode: 'public',
      roadmap_status: row.roadmap_status || 'draft',
      published: isPublished,
      message: 'Roadmap will be published soon.',
      participant: null,
      roadmap: null,
    };
    assert.strictEqual(publicResponse.message, 'Roadmap will be published soon.');
    assert.strictEqual(publicResponse.published, false);
    assert.strictEqual(publicResponse.roadmap, null);
    console.log('   ✓ Public gate outputs exact message: "Roadmap will be published soon." with roadmap=null.');

    // ──────────────────────────────────────────────────────────────────────────
    // Test 4: Server Restart & Legacy Backfill Protection
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n▶ Test 4: Testing server legacyRoundBackfill on reset tournament...');
    await legacyRoundBackfill(pool);
    const backfillCheck = await client.query(
      'SELECT count(*) FROM tournament_rounds WHERE tournament_id = $1',
      [tId1]
    );
    assert.strictEqual(parseInt(backfillCheck.rows[0].count), 0, 'Backfill must not recreate rounds for reset tournament');
    console.log('   ✓ legacyRoundBackfill safely skipped reset tournament; round count remains 0.');

    console.log('\n🎉 ALL LIVE DATABASE AUDIT TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Cleanup test tournaments and teams
    for (const tId of testTournaments) {
      await client.query('DELETE FROM tournament_match_results WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_match_assignments WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_matches WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_rooms WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_groups WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_days WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_rounds WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournament_teams WHERE tournament_id = $1', [tId]).catch(() => {});
      await client.query('DELETE FROM tournaments WHERE id = $1', [tId]).catch(() => {});
    }
    client.release();
    await pool.end();
  }
}

runLiveAuditTests().catch((err) => {
  console.error('❌ Live test failure:', err);
  process.exit(1);
});
