import assert from 'assert';
import { createDatabasePool } from '../server/db.js';
import { getDetailedRoundStandings, advanceTeamsManually } from '../server/roundProgressionService.js';
import { editTeamLeaderboardPoints } from '../server/leaderboardService.js';

async function runE2ETests() {
  console.log('=== Running District Team Loading & Scoring E2E Tests ===');
  const pool = createDatabasePool();

  try {
    const tournamentId = 'TRN-lg7f-HGBC';
    const round1Id = 'RND-1792928056901-1';
    const round2Id = 'RND-1792928214218-75bn';

    // 1. Verify getDetailedRoundStandings loads Team Sydney in District 1
    console.log('\n1. Testing getDetailedRoundStandings team-to-district loading...');
    const standings = await getDetailedRoundStandings(pool, tournamentId, round1Id);

    assert.ok(Array.isArray(standings.districts), 'districts must be an array');
    assert.strictEqual(standings.districts.length, 16, 'Should have 16 configured districts');

    const dist1 = standings.districts[0];
    assert.strictEqual(dist1.name, 'Round 1 · District 1');
    assert.strictEqual(dist1.id, 'ALC-1792928056901-1');
    assert.strictEqual(dist1.teams.length, 1, 'District 1 must contain exactly 1 assigned team');

    const team = dist1.teams[0];
    assert.strictEqual(team.team_name, 'Team Sydney');
    assert.strictEqual(team.team_id, 'TEAM-390555-171be7');
    assert.strictEqual(team.is_unassigned, false, 'Team must not be marked unassigned');
    assert.strictEqual(team.district_id, 'ALC-1792928056901-1');
    assert.strictEqual(team.group_id, 'ALC-1792928056901-1');
    console.log('✓ Successfully loaded Team Sydney in Round 1 · District 1 with count 1');

    // 2. Test score editing and saving for District 1
    console.log('\n2. Testing District score editing and persistence...');
    const saveResult = await editTeamLeaderboardPoints(pool, {
      tournamentId,
      teamId: team.team_id,
      placement_points: 12,
      kill_points: 6,
      total_kills: 6,
      wwcd_count: 1,
      matches_played: 1,
      round_id: round1Id,
      actorId: 'admin-test',
    });

    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.total_points, 18, '12 + 6 = 18');
    assert.strictEqual(saveResult.total_placement_points, 12);
    assert.strictEqual(saveResult.total_kills, 6);
    assert.strictEqual(saveResult.wwcd_count, 1);
    console.log('✓ Score edited and saved via editTeamLeaderboardPoints: 12 placement + 6 kills = 18 pts');

    // Mark district saved
    await pool.query(
      `UPDATE tournament_groups
       SET scores_saved = true, scores_saved_at = NOW(), scores_status = 'saved'
       WHERE (id = $1 OR district_id = $1) AND tournament_id = $2`,
      [dist1.id, tournamentId]
    );

    // Re-query getDetailedRoundStandings to confirm score reload
    const refreshedStandings = await getDetailedRoundStandings(pool, tournamentId, round1Id);
    const refreshedDist1 = refreshedStandings.districts[0];
    assert.strictEqual(refreshedDist1.scores_saved, true);
    assert.strictEqual(refreshedDist1.scores_status, 'saved');

    const refreshedTeam = refreshedDist1.teams[0];
    assert.strictEqual(refreshedTeam.total_points, 18);
    assert.strictEqual(refreshedTeam.total_placement_points, 12);
    assert.strictEqual(refreshedTeam.total_kills, 6);
    assert.strictEqual(refreshedTeam.wwcd_count, 1);
    console.log('✓ Reopening District 1 reloads authoritative saved scores: 18 total points, scores_saved=true');

    // 3. Test Manual Advancement
    console.log('\n3. Testing Manual Round Advancement for Team Sydney...');
    const advanceResult = await advanceTeamsManually(pool, {
      tournamentId,
      sourceRoundId: round1Id,
      targetRoundId: round2Id,
      teamIds: [team.team_id],
      allow_unverified: true,
    });

    assert.strictEqual(advanceResult.success, true);
    assert.strictEqual(advanceResult.advancedCount, 1);
    console.log('✓ Team Sydney successfully advanced to Round 2 without participation error!');

    console.log('\n=== All E2E Integration Tests Passed Successfully! ===');
  } catch (err) {
    console.error('E2E Test Failed:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runE2ETests();
