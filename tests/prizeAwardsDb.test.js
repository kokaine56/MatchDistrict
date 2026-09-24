import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { finalizeTournament } from '../server/tournamentFinalizationService.js';
import { applyMatchResults } from '../server/matchResultService.js';
import {
  generatePrizeAwards,
  listPrizeAwards,
  PRIZE_AWARD_ERR,
  PrizeAwardError,
  AWARD_STATUS,
} from '../server/prizeAwardService.js';

try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
} catch { /* optional */ }

const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';
const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';
let schemaReady = false;

async function ensurePrizeAwardsSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS tournament_prize_awards (
      id VARCHAR(50) PRIMARY KEY,
      tournament_id VARCHAR(50) NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
      final_standing_id VARCHAR(50) REFERENCES tournament_final_standings(id) ON DELETE RESTRICT,
      team_id VARCHAR(50) NOT NULL REFERENCES tournament_teams(id) ON DELETE CASCADE,
      rank INTEGER NOT NULL,
      award_type VARCHAR(30) NOT NULL DEFAULT 'placement',
      prize_amount INTEGER NOT NULL CHECK (prize_amount >= 0),
      percentage NUMERIC(8,4),
      recipient_user_id VARCHAR(50) REFERENCES users(id) ON DELETE SET NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending_payout',
      generated_by VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tournament_id, award_type, rank)
    );
    CREATE INDEX IF NOT EXISTS idx_prize_awards_tournament ON tournament_prize_awards(tournament_id, rank);
  `);
}

test('prize awards: PostgreSQL availability probe', async () => {
  const probe = new pg.Client({ connectionString: TEST_URL, ssl: SSL, connectionTimeoutMillis: 3000 });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    await ensurePrizeAwardsSchema(probe);
    dbReady = true;
    schemaReady = true;
  } catch (err) {
    dbProbeMessage = err.message || String(err);
  } finally {
    await probe.end().catch(() => {});
  }
});

async function withTransaction(fn, t) {
  if (!dbReady || !schemaReady) {
    t.skip(`No test database reachable (${new URL(TEST_URL).host}): ${dbProbeMessage}`);
    return { ran: false };
  }
  const client = new pg.Client({ connectionString: TEST_URL, ssl: SSL });
  await client.connect();
  await client.query('BEGIN');
  try {
    const result = await fn(client);
    await client.query('ROLLBACK');
    return { ran: true, result };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

let serial = 0;
async function seed(client, {
  roadmap = 'approved',
  finalTeamCount = 3,
  finalStatus = 'live',
  prizePositions = [
    { id: 'pos_1', name: '1st', percentage: '50' },
    { id: 'pos_2', name: '2nd', percentage: '30' },
    { id: 'pos_3', name: '3rd', percentage: '20' },
  ],
  prizePoolAmount = 10000,
  finalize = false,
} = {}) {
  const p = `P${Date.now().toString(36)}${(++serial).toString(36)}`.slice(-12).toUpperCase();
  const tournamentId = `${p}-T`;
  const orgId = `${p}-O`;
  await client.query('INSERT INTO users (id,email,name,password) VALUES ($1,$2,$3,$4)', [orgId, `${orgId}@prize.test`, 'Organizer', 'x']);
  await client.query(
    `INSERT INTO tournaments (id,title,game,status,match_type,"orgId",roadmap_status,prize_positions,prize_pool_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tournamentId, `Prize ${p}`, 'BGMI', finalStatus, 'squad', orgId, roadmap, JSON.stringify(prizePositions), prizePoolAmount]
  );
  const rounds = [`${p}-R1`, `${p}-R2`];
  await client.query(
    'INSERT INTO tournament_rounds (id,tournament_id,round_number,name,status) VALUES ($1,$2,1,$3,$4),($5,$2,2,$6,$7)',
    [rounds[0], tournamentId, 'Qualifier', 'completed', rounds[1], 'Final', 'live']
  );
  const dayId = `${p}-D`;
  const groupId = `${p}-G`;
  const roomId = `${p}-RM`;
  await client.query('INSERT INTO tournament_days (id,tournament_id,round_id,day_number,date) VALUES ($1,$2,$3,1,$4)', [dayId, tournamentId, rounds[1], '2026-11-01']);
  await client.query('INSERT INTO tournament_groups (id,day_id,tournament_id,group_name,sequence,round_id) VALUES ($1,$2,$3,$4,1,$5)', [groupId, dayId, tournamentId, 'Final Group', rounds[1]]);
  await client.query('INSERT INTO tournament_rooms (id,group_id,day_id,tournament_id,room_number,capacity,round_id) VALUES ($1,$2,$3,$4,1,4,$5)', [roomId, groupId, dayId, tournamentId, rounds[1]]);
  const teamIds = [];
  const leaderIds = [];
  for (let i = 1; i <= finalTeamCount; i += 1) {
    const leaderId = `${p}-U${i}`;
    const teamId = `${p}-TE${i}`;
    teamIds.push(teamId);
    leaderIds.push(leaderId);
    await client.query('INSERT INTO users (id,email,name,password) VALUES ($1,$2,$3,$4)', [leaderId, `${leaderId}@prize.test`, `Leader ${i}`, 'x']);
    await client.query(
      'INSERT INTO tournament_teams (id,tournament_id,team_name,leader_user_id,status) VALUES ($1,$2,$3,$4,$5)',
      [teamId, tournamentId, `Team ${i}`, leaderId, 'verified']
    );
  }
  const matchId = `${p}-M1`;
  await client.query(
    'INSERT INTO tournament_matches (id,room_id,group_id,day_id,tournament_id,match_number,start_time,end_time,round_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [matchId, roomId, groupId, dayId, tournamentId, 1, '10:00', '10:25', rounds[1]]
  );
  for (const teamId of teamIds) {
    await client.query(
      'INSERT INTO tournament_match_assignments (id,tournament_id,tournament_team_id,match_id,room_id,group_id,day_id,status,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [`${p}-A${serial++}`, tournamentId, teamId, matchId, roomId, groupId, dayId, 'allocated', 'manual']
    );
  }
  const scenario = { p, tournamentId, orgId, rounds, teamIds, leaderIds, matchIds: [matchId] };
  if (finalize) {
    await applyMatchResults(client, {
      tournId: tournamentId,
      matchId,
      actorId: orgId,
      results: teamIds.map((team_id, index) => ({ team_id, placement: index + 1, kills: teamIds.length - index })),
    });
    await finalizeTournament(client, { tournamentId, actorId: orgId });
  }
  return scenario;
}

test('awards cannot be generated before finalization (DB)', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalize: false });
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.TOURNAMENT_NOT_FINALIZED
  );
}, t));

test('manually completed status without finalized_at cannot generate awards', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalize: false });
  await client.query(`UPDATE tournaments SET status = 'completed', finalized_at = NULL WHERE id = $1`, [scenario.tournamentId]);
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.TOURNAMENT_NOT_FINALIZED
  );
}, t));

test('valid finalized tournament generates correct awards mapped to ranks and leaders', async (t) => {
  const outcome = await withTransaction(async (client) => {
    const scenario = await seed(client, { finalize: true, prizePoolAmount: 10000 });
    const first = await generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
    assert.equal(first.alreadyGenerated, false);
    assert.equal(first.award_count, 3);
    assert.equal(first.total_award_amount, 10000);
    assert.deepEqual(first.awards.map((a) => a.rank), [1, 2, 3]);
    assert.deepEqual(first.awards.map((a) => a.prize_amount), [5000, 3000, 2000]);
    assert.deepEqual(first.awards.map((a) => a.team_id), scenario.teamIds);
    assert.deepEqual(first.awards.map((a) => a.recipient_user_id), scenario.leaderIds);
    assert.ok(first.awards.every((a) => a.status === AWARD_STATUS.PENDING_PAYOUT));
    assert.ok(first.awards.every((a) => a.status !== 'paid'));

    const stored = await client.query(
      'SELECT rank, team_id, recipient_user_id, prize_amount, status, award_type FROM tournament_prize_awards WHERE tournament_id=$1 ORDER BY rank',
      [scenario.tournamentId]
    );
    assert.equal(stored.rows.length, 3);
    assert.deepEqual(stored.rows.map((r) => Number(r.prize_amount)), [5000, 3000, 2000]);
    assert.equal(stored.rows[0].recipient_user_id, scenario.leaderIds[0]);

    const standings = await client.query(
      'SELECT id, team_id, rank FROM tournament_final_standings WHERE tournament_id=$1 ORDER BY rank',
      [scenario.tournamentId]
    );
    const linked = await client.query(
      'SELECT final_standing_id, team_id, rank FROM tournament_prize_awards WHERE tournament_id=$1 ORDER BY rank',
      [scenario.tournamentId]
    );
    assert.deepEqual(linked.rows.map((r) => r.final_standing_id), standings.rows.map((r) => r.id));
    assert.deepEqual(linked.rows.map((r) => r.team_id), standings.rows.map((r) => r.team_id));

    const audit = await client.query(
      "SELECT COUNT(*)::int AS n FROM admin_action_log WHERE target_id=$1 AND action='prize_awards_generated'",
      [scenario.tournamentId]
    );
    assert.equal(audit.rows[0].n, 1);

    // No wallet mutation in this phase
    const walletTouched = await client.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_name = 'wallet_transactions'`
    ).catch(() => ({ rows: [{ n: 0 }] }));
    if (walletTouched.rows[0].n > 0) {
      const wt = await client.query(
        `SELECT COUNT(*)::int AS n FROM wallet_transactions WHERE details::text LIKE $1 OR description ILIKE $1`,
        [`%${scenario.tournamentId}%`]
      ).catch(() => ({ rows: [{ n: 0 }] }));
      assert.equal(wt.rows[0].n, 0);
    }

    const second = await generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
    assert.equal(second.alreadyGenerated, true);
    assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_prize_awards WHERE tournament_id=$1', [scenario.tournamentId])).rows[0].n, 3);
    assert.equal(audit.rows[0].n, 1);
    assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM admin_action_log WHERE target_id=$1 AND action='prize_awards_generated'", [scenario.tournamentId])).rows[0].n, 1);

    const listed = await listPrizeAwards(client, { tournamentId: scenario.tournamentId });
    assert.equal(listed.award_count, 3);
    return true;
  }, t);
  if (!outcome.ran) return;
  assert.equal(outcome.result, true);
});

test('missing prize configuration is rejected', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalize: true, prizePositions: [] });
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.PRIZE_DISTRIBUTION_MISSING
  );
}, t));

test('invalid distribution percentages are rejected', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, {
    finalize: true,
    prizePositions: [{ name: '1st', percentage: '70' }, { name: '2nd', percentage: '20' }],
  });
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }),
    (err) => err instanceof PrizeAwardError && err.code === PRIZE_AWARD_ERR.PRIZE_CONFIGURATION_INVALID
  );
}, t));

test('only configured positions receive awards', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, {
    finalize: true,
    finalTeamCount: 3,
    prizePositions: [{ name: '1st', percentage: '100' }],
    prizePoolAmount: 5000,
  });
  const result = await generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
  assert.equal(result.award_count, 1);
  assert.equal(result.awards[0].rank, 1);
  assert.equal(result.awards[0].prize_amount, 5000);
  assert.equal(result.awards[0].team_id, scenario.teamIds[0]);
}, t));

test('failed award insert leaves no partial awards', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalize: true });
  await client.query('CREATE FUNCTION pg_temp.reject_award_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'forced award error\'; END $$');
  await client.query('CREATE TRIGGER reject_award BEFORE INSERT ON tournament_prize_awards FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_award_insert()');
  await client.query('SAVEPOINT award_attempt');
  await assert.rejects(
    generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }),
    /forced award error/
  );
  await client.query('ROLLBACK TO SAVEPOINT award_attempt');
  await client.query('RELEASE SAVEPOINT award_attempt');
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_prize_awards WHERE tournament_id=$1', [scenario.tournamentId])).rows[0].n, 0);
  assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM admin_action_log WHERE target_id=$1 AND action='prize_awards_generated'", [scenario.tournamentId])).rows[0].n, 0);
}, t));

test('unique constraint prevents duplicate awards under concurrency serialization', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalize: true });
  const first = await generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
  assert.equal(first.award_count, 3);

  // Simulate a concurrent insert attempt that bypasses the app-level idempotency check
  await assert.rejects(
    client.query(
      `INSERT INTO tournament_prize_awards
         (id, tournament_id, final_standing_id, team_id, rank, award_type, prize_amount, percentage, recipient_user_id, status, generated_by)
       VALUES ($1,$2,$3,$4,1,'placement',1,50,$5,'pending_payout',$6)`,
      [`DUP-${scenario.p}`, scenario.tournamentId, first.awards[0].final_standing_id, scenario.teamIds[0], scenario.leaderIds[0], scenario.orgId]
    ),
    (err) => err.code === '23505'
  );
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_prize_awards WHERE tournament_id=$1', [scenario.tournamentId])).rows[0].n, 3);
}, t));

test('existing finalization and match results remain unaffected after award generation', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalize: true });
  const beforeStandings = await client.query(
    'SELECT team_id, rank, total_points FROM tournament_final_standings WHERE tournament_id=$1 ORDER BY rank',
    [scenario.tournamentId]
  );
  const beforeTourn = await client.query('SELECT status, finalized_at, finalized_by FROM tournaments WHERE id=$1', [scenario.tournamentId]);
  await generatePrizeAwards(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
  const afterStandings = await client.query(
    'SELECT team_id, rank, total_points FROM tournament_final_standings WHERE tournament_id=$1 ORDER BY rank',
    [scenario.tournamentId]
  );
  const afterTourn = await client.query('SELECT status, finalized_at, finalized_by FROM tournaments WHERE id=$1', [scenario.tournamentId]);
  assert.deepEqual(afterStandings.rows, beforeStandings.rows);
  assert.equal(afterTourn.rows[0].status, beforeTourn.rows[0].status);
  assert.equal(String(afterTourn.rows[0].finalized_at), String(beforeTourn.rows[0].finalized_at));
  assert.equal(afterTourn.rows[0].finalized_by, beforeTourn.rows[0].finalized_by);
}, t));
