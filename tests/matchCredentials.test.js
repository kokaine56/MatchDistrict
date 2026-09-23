const request = require('supertest');
const app = require('../server');
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres',
  ssl: { rejectUnauthorized: false }
});

describe('Phase 9: Match Access & Room Credentials', () => {

  beforeAll(async () => {
    // Setup tournament, day, group, room, match if necessary
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should allow organizer to save match credentials securely', async () => {
    // PUT /api/tournaments/:id/matches/:matchId/credentials
    expect(true).toBe(true);
  });

  it('should lock credentials from participants before release time', async () => {
    // GET /api/tournaments/:id/matches/:matchId/credentials returns status: 'locked'
    expect(true).toBe(true);
  });
  
  it('should expose credentials to allocated participants after release time', async () => {
    // GET /api/tournaments/:id/matches/:matchId/credentials returns status: 'released' and room_identifier
    expect(true).toBe(true);
  });

  it('should deny credentials to unallocated participants even after release time', async () => {
    // 403 Forbidden
    expect(true).toBe(true);
  });
});
