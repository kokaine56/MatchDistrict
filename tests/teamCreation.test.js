
import pg from 'pg';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

const { Pool } = pg;
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } 
});

describe('Phase 4: Tournament-Specific Team Creation', () => {
  let tournamentId;
  let leaderId;
  let user2Id;

  before(async () => {
    // Setup test users and tournament
    leaderId = 'test_usr_leader_' + Date.now();
    user2Id = 'test_usr_other_' + Date.now();
    tournamentId = 'test_tourney_' + Date.now();

    await pool.query('INSERT INTO users (id, email, password) VALUES ($1, $2, $3)', [leaderId, 'leader@test.com', 'testpass']);
    await pool.query('INSERT INTO users (id, email, password) VALUES ($1, $2, $3)', [user2Id, 'other@test.com', 'testpass']);
    await pool.query('INSERT INTO tournaments (id, title, status) VALUES ($1, $2, $3)', [tournamentId, 'Test Tourney', 'published']);
  });

  after(async () => {
    await pool.query('DELETE FROM tournaments WHERE id = $1', [tournamentId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [leaderId, user2Id]);
    await pool.end();
  });

  it('Test 1 & 2: Eligible user creates team and becomes leader', async () => {
    const teamId = 'tt_' + Date.now();
    
    // Simulate API atomic transaction
    const client = await pool.connect();
    let success = false;
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
        VALUES ($1, $2, $3, $4, 'awaiting_members')
      `, [teamId, tournamentId, 'Nexus Alpha', leaderId]);
      
      await client.query(`
        INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status)
        VALUES ($1, $2, $3, $4, 'leader', 'active')
      `, ['ttm_' + Date.now(), teamId, tournamentId, leaderId]);
      await client.query('COMMIT');
      success = true;
    } catch (err) {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    assert.strictEqual(success, true);

    const members = await pool.query('SELECT role FROM tournament_team_members WHERE tournament_team_id = $1', [teamId]);
    assert.strictEqual(members.rows.length, 1);
    assert.strictEqual(members.rows[0].role, 'leader');
  });

  it('Test 3: User tries to create second team in same tournament (should fail)', async () => {
    const teamId2 = 'tt_dup_' + Date.now();
    const client = await pool.connect();
    let errorCaught = false;
    try {
      await client.query('BEGIN');
      // The 1-team-per-user unique constraint should trip here
      await client.query(`
        INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status)
        VALUES ($1, $2, $3, $4, 'leader', 'active')
      `, ['ttm_dup_' + Date.now(), teamId2, tournamentId, leaderId]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      errorCaught = true;
    } finally {
      client.release();
    }
    assert.strictEqual(errorCaught, true);
  });

  it('Test 5: Duplicate team name in same tournament (should fail)', async () => {
    const teamId3 = 'tt_dupname_' + Date.now();
    const client = await pool.connect();
    let errorCaught = false;
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
        VALUES ($1, $2, $3, $4, 'awaiting_members')
      `, [teamId3, tournamentId, 'Nexus Alpha', user2Id]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      errorCaught = true;
    } finally {
      client.release();
    }
    assert.strictEqual(errorCaught, true);
  });

  it('Test 4 & 6: Same user and same team name in ANOTHER tournament (should succeed)', async () => {
    const otherTourneyId = 'test_tourney2_' + Date.now();
    await pool.query('INSERT INTO tournaments (id, title, status) VALUES ($1, $2, $3)', [otherTourneyId, 'Tourney 2', 'published']);

    const teamId4 = 'tt_other_' + Date.now();
    const client = await pool.connect();
    let success = false;
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
        VALUES ($1, $2, $3, $4, 'awaiting_members')
      `, [teamId4, otherTourneyId, 'Nexus Alpha', leaderId]); // same user and same team name, but different tournament
      
      await client.query(`
        INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status)
        VALUES ($1, $2, $3, $4, 'leader', 'active')
      `, ['ttm_other_' + Date.now(), teamId4, otherTourneyId, leaderId]);
      await client.query('COMMIT');
      success = true;
    } catch (err) {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    
    assert.strictEqual(success, true);
    await pool.query('DELETE FROM tournaments WHERE id = $1', [otherTourneyId]);
  });
});

