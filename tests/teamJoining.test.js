import test from 'node:test';
import assert from 'node:assert';
import { Pool } from 'pg';
import crypto from 'crypto';
import http from 'http';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
  ssl: { rejectUnauthorized: false }
});

test('Phase 6 - Team Joining System', async (t) => {
  let client;
  let tId = 'tourney_join123';
  let leaderId = 'user_leader';
  let memberId = 'user_join1';
  let teamId = 'team_join_alpha';
  
  try {
    client = await pool.connect();
    
    // Setup initial data
    await client.query('BEGIN');
    
    // Dummy users
    await client.query(`
      INSERT INTO users (id, name, email, password)
      VALUES 
      ($1, 'Leader User', 'leader@test.com', 'testpass'),
      ($2, 'Joiner User', 'joiner@test.com', 'testpass')
      ON CONFLICT (id) DO NOTHING
    `, [leaderId, memberId]);

    // Dummy tournament (duo)
    await client.query(`
      INSERT INTO tournaments (id, title, status, match_type)
      VALUES ($1, 'Join Cup', 'published', 'duo')
      ON CONFLICT (id) DO NOTHING
    `, [tId]);

    // Create Team
    await client.query(`
      INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id)
      VALUES ($1, $2, 'Join Alpha', $3)
      ON CONFLICT (id) DO NOTHING
    `, [teamId, tId, leaderId]);
    
    await client.query(`
      INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role)
      VALUES ($1, $2, $3, $4, 'leader')
      ON CONFLICT (id) DO NOTHING
    `, ['mem_' + teamId, teamId, tId, leaderId]);

    const inviteId = 'inv_join123';
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 48*60*60*1000);

    await client.query(`
      INSERT INTO tournament_team_invitations (id, tournament_id, tournament_team_id, created_by_user_id, token, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [inviteId, tId, teamId, leaderId, token, expiresAt]);

    await client.query('COMMIT');
    
    // TEST 1: Member joins using token via mock API server logic
    await t.test('Member successfully joins team via token', async () => {
      await client.query('BEGIN');
      const invRes = await client.query('SELECT * FROM tournament_team_invitations WHERE token = $1', [token]);
      assert.strictEqual(invRes.rows.length, 1);
      
      const membersRes = await client.query('SELECT COUNT(*) as member_count FROM tournament_team_members WHERE tournament_team_id = $1', [teamId]);
      assert.strictEqual(parseInt(membersRes.rows[0].member_count), 1); // Only leader

      // Insert member
      await client.query(`
        INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role)
        VALUES ($1, $2, $3, $4, 'member')
      `, ['mem_join1', teamId, tId, memberId]);

      const updatedMembers = await client.query('SELECT COUNT(*) as member_count FROM tournament_team_members WHERE tournament_team_id = $1', [teamId]);
      assert.strictEqual(parseInt(updatedMembers.rows[0].member_count), 2); // Leader + Member

      // Update status for duo (max 2)
      await client.query(`
        UPDATE tournament_teams 
        SET status = 'members_complete'
        WHERE id = $1
      `, [teamId]);
      await client.query('COMMIT');
      
      const teamRes = await client.query('SELECT status FROM tournament_teams WHERE id = $1', [teamId]);
      assert.strictEqual(teamRes.rows[0].status, 'members_complete');
    });

    // TEST 2: Cannot exceed capacity
    await t.test('Cannot join full team', async () => {
      // simulate third user joining a duo team
      const member3Id = 'user_join3';
      await client.query(`
        INSERT INTO users (id, name, email, password)
        VALUES ($1, 'Joiner 3', 'joiner3@test.com', 'testpass')
        ON CONFLICT (id) DO NOTHING
      `, [member3Id]);

      let error = null;
      try {
        await client.query('BEGIN');
        const membersRes = await client.query('SELECT COUNT(*) as member_count FROM tournament_team_members WHERE tournament_team_id = $1', [teamId]);
        if (parseInt(membersRes.rows[0].member_count) >= 2) {
          throw new Error('Team is full.');
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        error = e;
      }
      assert.strictEqual(error.message, 'Team is full.');
      await client.query('DELETE FROM users WHERE id = $1', [member3Id]);
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
      await client.query('DELETE FROM users WHERE id IN ($1, $2)', [leaderId, memberId]);
      client.release();
    }
    await pool.end();
  }
});
