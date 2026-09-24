import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import pg from 'pg';
import { finalizeTournament, FINALIZATION_ERR, TournamentFinalizationError } from '../server/tournamentFinalizationService.js';
import { applyMatchResults, MatchResultError, MATCH_RESULT_ERR } from '../server/matchResultService.js';

const TEST_URL = process.env.PGTEST_URL || process.env.SUPABASE_TEST_URL || 'postgresql://postgres:postgres@localhost:54322/postgres';
const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1') ? false : { rejectUnauthorized: false };
let dbReady = false;
let dbProbeMessage = '';

test('tournament finalization: PostgreSQL availability probe', async () => {
  const probe = new pg.Client({ connectionString: TEST_URL, ssl: SSL, connectionTimeoutMillis: 3000 });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    dbReady = true;
  } catch (err) {
    dbProbeMessage = err.message || String(err);
  } finally {
    await probe.end().catch(() => {});
  }
});

async function withTransaction(fn, t) {
  if (!dbReady) {
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
async function seed(client, { roadmap = 'approved', finalMatchCount = 1, finalTeamCount = 2, finalStatus = 'live' } = {}) {
  const p = `F${Date.now().toString(36)}${(++serial).toString(36)}`.slice(-12).toUpperCase();
  const tournamentId = `${p}-T`;
  const orgId = `${p}-O`;
  await client.query('INSERT INTO users (id,email,name,password) VALUES ($1,$2,$3,$4)', [orgId, `${orgId}@final.test`, 'Organizer', 'x']);
  await client.query('INSERT INTO tournaments (id,title,game,status,match_type,"orgId",roadmap_status) VALUES ($1,$2,$3,$4,$5,$6,$7)', [tournamentId, `Final ${p}`, 'BGMI', finalStatus, 'squad', orgId, roadmap]);
  const rounds = [`${p}-R1`, `${p}-R2`];
  await client.query('INSERT INTO tournament_rounds (id,tournament_id,round_number,name,status) VALUES ($1,$2,1,$3,$4),($5,$2,2,$6,$7)', [rounds[0], tournamentId, 'Qualifier', 'completed', rounds[1], 'Final', 'live']);
  const dayId = `${p}-D`;
  const groupId = `${p}-G`;
  const roomId = `${p}-RM`;
  await client.query('INSERT INTO tournament_days (id,tournament_id,round_id,day_number,date) VALUES ($1,$2,$3,1,$4)', [dayId, tournamentId, rounds[1], '2026-11-01']);
  await client.query('INSERT INTO tournament_groups (id,day_id,tournament_id,group_name,sequence,round_id) VALUES ($1,$2,$3,$4,1,$5)', [groupId, dayId, tournamentId, 'Final Group', rounds[1]]);
  await client.query('INSERT INTO tournament_rooms (id,group_id,day_id,tournament_id,room_number,capacity,round_id) VALUES ($1,$2,$3,$4,1,4,$5)', [roomId, groupId, dayId, tournamentId, rounds[1]]);
  const teamIds = [];
  for (let i = 1; i <= finalTeamCount; i += 1) {
    const leaderId = `${p}-U${i}`;
    const teamId = `${p}-TE${i}`;
    teamIds.push(teamId);
    await client.query('INSERT INTO users (id,email,name,password) VALUES ($1,$2,$3,$4)', [leaderId, `${leaderId}@final.test`, `Leader ${i}`, 'x']);
    await client.query('INSERT INTO tournament_teams (id,tournament_id,team_name,leader_user_id,status) VALUES ($1,$2,$3,$4,$5)', [teamId, tournamentId, `Team ${i}`, leaderId, 'verified']);
  }
  const matchIds = [];
  for (let m = 1; m <= finalMatchCount; m += 1) {
    const matchId = `${p}-M${m}`;
    matchIds.push(matchId);
    await client.query('INSERT INTO tournament_matches (id,room_id,group_id,day_id,tournament_id,match_number,start_time,end_time,round_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [matchId, roomId, groupId, dayId, tournamentId, m, '10:00', '10:25', rounds[1]]);
  }
  for (const matchId of matchIds) {
    for (const teamId of teamIds) {
      await client.query('INSERT INTO tournament_match_assignments (id,tournament_id,tournament_team_id,match_id,room_id,group_id,day_id,status,source) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [`${p}-A${serial++}`, tournamentId, teamId, matchId, roomId, groupId, dayId, 'allocated', 'manual']);
    }
  }
  return { p, tournamentId, orgId, rounds, teamIds, matchIds };
}

async function seedVerifiedResults(client, scenario) {
  for (const matchId of scenario.matchIds) {
    await applyMatchResults(client, {
      tournId: scenario.tournamentId,
      matchId,
      actorId: scenario.orgId,
      results: scenario.teamIds.map((team_id, index) => ({ team_id, placement: index + 1, kills: scenario.teamIds.length - index })),
    });
  }
}

async function expectFinalizationError(client, scenario, code) {
  await assert.rejects(
    finalizeTournament(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }),
    (err) => err instanceof TournamentFinalizationError && err.code === code
  );
}

test('finalization identifies the highest configured round, snapshots cumulative authoritative standings and is idempotent', async (t) => {
  const outcome = await withTransaction(async (client) => {
    const scenario = await seed(client, { finalMatchCount: 2 });
    await seedVerifiedResults(client, scenario);
    const first = await finalizeTournament(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
    assert.equal(first.final_round.id, scenario.rounds[1]);
    assert.deepEqual(first.final_standings.map((row) => row.team_id), scenario.teamIds);
    assert.deepEqual(first.final_standings.map((row) => row.rank), [1, 2]);
    assert.deepEqual(first.final_standings.map((row) => row.total_points), [34, 26]);
    assert.deepEqual(first.final_standings.map((row) => row.total_kills), [4, 2]);
    assert.deepEqual(first.final_standings.map((row) => row.wwcd_count), [2, 0]);
    assert.deepEqual(first.final_standings.map((row) => row.best_placement), [1, 2]);
    assert.equal(first.status, 'completed');
    assert.ok(first.finalized_at);
    const stored = await client.query('SELECT team_id,rank,total_points,total_kills,team_name FROM tournament_final_standings WHERE tournament_id=$1 ORDER BY rank', [scenario.tournamentId]);
    assert.equal(stored.rows.length, 2);
    assert.deepEqual(stored.rows.map((row) => Number(row.total_points)), [34, 26]);
    assert.equal((await client.query("SELECT status,finalized_at,finalized_by FROM tournaments WHERE id=$1", [scenario.tournamentId])).rows[0].status, 'completed');
    assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM admin_action_log WHERE target_id=$1 AND action='tournament_finalized'", [scenario.tournamentId])).rows[0].n, 1);
    const second = await finalizeTournament(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
    assert.equal(second.alreadyFinalized, true);
    assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_final_standings WHERE tournament_id=$1', [scenario.tournamentId])).rows[0].n, 2);
    return true;
  }, t);
  if (!outcome.ran) return;
  assert.equal(outcome.result, true);
});

test('finalization rejects a missing final round', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  await client.query('DELETE FROM tournament_rounds WHERE tournament_id=$1', [scenario.tournamentId]);
  await expectFinalizationError(client, scenario, FINALIZATION_ERR.FINAL_ROUND_NOT_FOUND);
}, t));

test('finalization rejects an unapproved roadmap', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { roadmap: 'draft' });
  await expectFinalizationError(client, scenario, FINALIZATION_ERR.ROADMAP_NOT_APPROVED);
}, t));

test('finalization rejects a final match without results', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  await expectFinalizationError(client, scenario, FINALIZATION_ERR.FINAL_MATCHES_INCOMPLETE);
}, t));

test('finalization rejects unverified final-round results', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  for (const [index, teamId] of scenario.teamIds.entries()) {
    await client.query('INSERT INTO tournament_match_results (id,tournament_id,match_id,team_id,placement,kills,status) VALUES ($1,$2,$3,$4,$5,0,$6)', [`${scenario.p}-RES${index}`, scenario.tournamentId, scenario.matchIds[0], teamId, index + 1, 'pending']);
  }
  await expectFinalizationError(client, scenario, FINALIZATION_ERR.FINAL_RESULTS_INCOMPLETE);
}, t));

test('finalization rejects final matches without allocated teams', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client, { finalTeamCount: 0 });
  await expectFinalizationError(client, scenario, FINALIZATION_ERR.FINAL_MATCHES_INCOMPLETE);
}, t));

test('finalized tournament rejects result edits', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  await seedVerifiedResults(client, scenario);
  await finalizeTournament(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId });
  await assert.rejects(
    applyMatchResults(client, { tournId: scenario.tournamentId, matchId: scenario.matchIds[0], actorId: scenario.orgId, results: [{ team_id: scenario.teamIds[0], placement: 1, kills: 1 }] }),
    (err) => err instanceof MatchResultError && err.code === MATCH_RESULT_ERR.TOURNAMENT_FINALIZED
  );
}, t));

test('failed snapshot insert leaves no partial finalization state', async (t) => withTransaction(async (client) => {
  const scenario = await seed(client);
  await seedVerifiedResults(client, scenario);
  await client.query('CREATE TEMP TABLE final_snapshot_failure_guard (team_id VARCHAR(50) PRIMARY KEY)');
  await client.query('CREATE FUNCTION pg_temp.reject_snapshot_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \'forced snapshot error\'; END $$');
  await client.query('CREATE TRIGGER reject_snapshot BEFORE INSERT ON tournament_final_standings FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_snapshot_insert()');
  await client.query('SAVEPOINT finalization_attempt');
  await assert.rejects(finalizeTournament(client, { tournamentId: scenario.tournamentId, actorId: scenario.orgId }), /forced snapshot error/);
  await client.query('ROLLBACK TO SAVEPOINT finalization_attempt');
  await client.query('RELEASE SAVEPOINT finalization_attempt');
  assert.equal((await client.query('SELECT status,finalized_at FROM tournaments WHERE id=$1', [scenario.tournamentId])).rows[0].status, 'live');
  assert.equal((await client.query('SELECT COUNT(*)::int AS n FROM tournament_final_standings WHERE tournament_id=$1', [scenario.tournamentId])).rows[0].n, 0);
}, t));

