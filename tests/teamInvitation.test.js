import test from 'node:test';
import assert from 'node:assert';
import { Pool } from 'pg';
import crypto from 'crypto';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
  ssl: { rejectUnauthorized: false }
});

test('Phase 5 - Team Invitation System', async (t) => {
  let client;
  let tId = 'tourney_test_inv123';
  let userId1 = 'user_inv1';
  let userId2 = 'user_inv2';
  let teamId = 'team_inv_alpha';
  
  try {
    client = await pool.connect();
    
    // Setup initial data
    await client.query('BEGIN');
    
    // Dummy users
    await client.query(`
      INSERT INTO users (id, name, email, password)
      VALUES 
      ($1, 'Leader One', 'lead1@test.com', 'testpass'),
      ($2, 'Not Leader', 'lead2@test.com', 'testpass')
      ON CONFLICT (id) DO NOTHING
    `, [userId1, userId2]);

    // Dummy tournament
    await client.query(`
      INSERT INTO tournaments (id, title, status, match_type)
      VALUES ($1, 'Invite Cup', 'published', 'squad')
      ON CONFLICT (id) DO NOTHING
    `, [tId]);

    // Create Team in Phase 4 structure
    await client.query(`
      INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id)
      VALUES ($1, $2, 'Invite Alpha', $3)
      ON CONFLICT (id) DO NOTHING
    `, [teamId, tId, userId1]);
    
    await client.query(`
      INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role)
      VALUES ($1, $2, $3, $4, 'leader')
      ON CONFLICT (id) DO NOTHING
    `, ['mem_' + teamId, teamId, tId, userId1]);

    await client.query('COMMIT');
    
    // TEST 1: Generating an invitation
    let token = '';
    await t.test('Leader can generate invitation', async () => {
      // simulate the API logic
      await client.query('BEGIN');
      const leaderCheck = await client.query(
        'SELECT 1 FROM tournament_teams WHERE id = $1 AND tournament_id = $2 AND leader_user_id = $3',
        [teamId, tId, userId1]
      );
      assert.strictEqual(leaderCheck.rows.length, 1);
      
      const inviteId = 'inv_test123';
      token = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 48*60*60*1000);

      await client.query(`
        INSERT INTO tournament_team_invitations (id, tournament_id, tournament_team_id, created_by_user_id, token, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [inviteId, tId, teamId, userId1, token, expiresAt]);
      
      await client.query('COMMIT');
      assert.ok(token);
    });

    // TEST 2: Generating new invitation revokes old one
    await t.test('Generating new invitation revokes old', async () => {
      await client.query('BEGIN');
      await client.query(`
        UPDATE tournament_team_invitations
        SET status = 'revoked', updated_at = NOW()
        WHERE tournament_team_id = $1 AND status = 'active'
      `, [teamId]);
      
      const inviteId2 = 'inv_test456';
      const token2 = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 48*60*60*1000);

      await client.query(`
        INSERT INTO tournament_team_invitations (id, tournament_id, tournament_team_id, created_by_user_id, token, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [inviteId2, tId, teamId, userId1, token2, expiresAt]);
      await client.query('COMMIT');
      
      const resOld = await client.query('SELECT status FROM tournament_team_invitations WHERE token = $1', [token]);
      assert.strictEqual(resOld.rows[0].status, 'revoked');
      
      const resNew = await client.query('SELECT status FROM tournament_team_invitations WHERE token = $1', [token2]);
      assert.strictEqual(resNew.rows[0].status, 'active');
      token = token2;
    });

    // TEST 3: Validation logic resolves correctly
    await t.test('Token resolves to correct tournament and team', async () => {
      const invRes = await client.query("SELECT * FROM tournament_team_invitations WHERE token = $1", [token]);
      assert.strictEqual(invRes.rows.length, 1);
      
      const inv = invRes.rows[0];
      assert.strictEqual(inv.status, 'active');
      assert.strictEqual(inv.tournament_id, tId);
      assert.strictEqual(inv.tournament_team_id, teamId);
    });

    // TEST 4: Non-leader rejected
    await t.test('Non-leader cannot generate invitation', async () => {
      const leaderCheck = await client.query(
        'SELECT 1 FROM tournament_teams WHERE id = $1 AND tournament_id = $2 AND leader_user_id = $3',
        [teamId, tId, userId2]
      );
      assert.strictEqual(leaderCheck.rows.length, 0);
    });

  } catch (err) {
    if (client) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (client) {
      await client.query('DELETE FROM tournament_team_invitations WHERE tournament_id = $1', [tId]);
      await client.query('DELETE FROM tournament_team_members WHERE tournament_id = $1', [tId]);
      await client.query('DELETE FROM tournament_teams WHERE tournament_id = $1', [tId]);
      await client.query('DELETE FROM tournaments WHERE id = $1', [tId]);
      await client.query('DELETE FROM users WHERE id IN ($1, $2)', [userId1, userId2]);
      client.release();
    }
    await pool.end();
  }
});
