import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { qualifyRound, getRoundStandings, PROGRESSION_ERR, ProgressionError } from '../server/roundProgressionService.js';
import { ALLOCATION_ERR } from '../server/allocationService.js';

// Phase 8B — Round Qualification & Progression (DB-backed, probe/skip).
// These tests exercise the transactional flow against a real schema: seeding a
// two-round approved roadmap with verified round-1 results and asserting that
// qualification advances exactly the top-N teams into round 2 matches, marks the
// source round completed / next round live, and writes the audit row. Without a
// reachable test database every DB test is skipped (same pattern as
// matchCredentials.test.js / allocationServiceDb.test.js).

const TEST_URL =
  process.env.PGTEST_URL ||
  process.env.SUPABASE_TEST_URL ||
  'postgresql://postgres:postgres@localhost:54322/postgres';

const SSL = TEST_URL.includes('localhost') || TEST_URL.includes('127.0.0.1')
  ? false
  : { rejectUnauthorized: false };

let dbReady = false;
let dbProbeMessage = '';

test('round progression: database availability probe', async () => {
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
    t.skip(`No test database reachable (${TEST_URL}): ${dbProbeMessage}`);
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

// Seeding helpers -------------------------------------------------------------
// Two-round approved scenario (round 1 teams_advancing configure via opts.advancing):
//   R1: day D1 / group G1 / room RM1 (cap 4) / matches M1-M2
//   R2: day D2 / group G2 / room RM2 (cap 4) / matches M3-M4
//   teams T1-T3 (allocated, no registration by default), all placed in R1.
//   verified round-1 results → T1 38pts, T2 38pts, T3 25pts (T3 outside top-2).

async function seedRound(client, prefix, roundSuffix, dayNum, matchStart, firstMatchNumber, matchCount) {
  const tournId = `${prefix}-TRN`;
  const day = `${prefix}-D${roundSuffix}`;
  const grp = `${prefix}-G${roundSuffix}`;
  const room = `${prefix}-RM${roundSuffix}`;
  await client.query(
    'INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date) VALUES ($1,$2,$3,$4,$5)',
    [day, tournId, `${prefix}-R${roundSuffix}`, dayNum, `2026-11-0${dayNum}`]
  );
  await client.query(
    'INSERT INTO tournament_groups (id, day_id, tournament_id, group_name, sequence, round_id) VALUES ($1,$2,$3,$4,$5,$6)',
    [grp, day, tournId, 'Group A', 1, `${prefix}-R${roundSuffix}`]
  );
  await client.query(
    `INSERT INTO tournament_rooms (id, group_id, day_id, tournament_id, room_number, capacity, round_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [room, grp, day, tournId, 1, 4, `${prefix}-R${roundSuffix}`]
  );
  for (let n = 0; n < matchCount; n++) {
    const num = firstMatchNumber + n;
    await client.query(
      `INSERT INTO tournament_matches (id, room_id, group_id, day_id, tournament_id, match_number, start_time, end_time, round_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [`${prefix}-M${num}`, room, grp, day, tournId, num, matchStart, '11:00', `${prefix}-R${roundSuffix}`]
    );
  }
}

async function seedScenario(client, prefix, opts = {}) {
  const { rounds = 2, results = true, roadmap = 'approved', rejectTeam = null, advancing = 2 } = opts;
  const orgId = `${prefix}-ORG`;
  const tournId = `${prefix}-TRN`;
  await client.query(
    'INSERT INTO users (id, email, name, password) VALUES ($1,$2,$3,$4)',
    [orgId, `${orgId.toLowerCase()}@prg.test`, 'Org', 'x']
  );
  for (const [uid, tag] of [['P1', 'Lead One'], ['P2', 'Lead Two'], ['P3', 'Lead Three']]) {
    await client.query(
      'INSERT INTO users (id, email, name, password) VALUES ($1,$2,$3,$4)',
      [`${prefix}-${uid}`, `${prefix}-${uid}@prg.test`, tag, 'x']
    );
  }
  await client.query(
    `INSERT INTO tournaments (id, title, game, status, match_type, "orgId")
     VALUES ($1,$2,'BGMI','upcoming','squad',$3)`,
    [tournId, `Progression ${prefix}`, orgId]
  );
  if (roadmap) await client.query('UPDATE tournaments SET roadmap_status = $1 WHERE id = $2', [roadmap, tournId]);

  await client.query(
    `INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, "date", "time")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [`${prefix}-R1`, tournId, 1, 'Qualifier', 'configured', advancing, '2026-11-01', '10:00']
  );
  if (rounds >= 2) {
    await client.query(
      `INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, "date", "time")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [`${prefix}-R2`, tournId, 2, 'Final', 'configured', null, '2026-11-02', '14:00']
    );
    await seedRound(client, prefix, 2, 2, '14:00', 3, 2);
  }
  await seedRound(client, prefix, 1, 1, '10:00', 1, 2);

  for (const tk of ['T1', 'T2', 'T3']) {
    const uid = tk === 'T1' ? 'P1' : tk === 'T2' ? 'P2' : 'P3';
    await client.query(
      `INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status)
       VALUES ($1,$2,$3,$4,'allocated')`,
      [`${prefix}-${tk}`, tournId, `${prefix}-${tk}-name`, `${prefix}-${uid}`]
    );
    for (const n of [1, 2]) {
      await client.query(
        `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, room_id, group_id, day_id, status, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'allocated','automatic')`,
        [`${prefix}-A-${tk}-${n}`, tournId, `${prefix}-${tk}`, `${prefix}-M${n}`, `${prefix}-RM1`, `${prefix}-G1`, `${prefix}-D1`]
      );
    }
  }

  if (rejectTeam) {
    await client.query(
      `INSERT INTO tournament_registrations (id, tournament_id, user_id, team_name, captain, status)
       VALUES ($1,$2,$3,$4,$5,'rejected')`,
      [`${prefix}-REG-REJ`, tournId, `${prefix}-${rejectTeam}`, `${prefix}-${rejectTeam}-name`, `${prefix}-${rejectTeam}-name`]
    );
    await client.query('UPDATE tournament_teams SET registration_id = $1 WHERE id = $2', [`${prefix}-REG-REJ`, `${prefix}-${rejectTeam}`]);
  }

  if (results) {
    const rows = [
      { tk: 'T1', match: 1, placement: 1, kills: 6, pp: 15, kp: 6, wwcd: true, total: 21 },
      { tk: 'T2', match: 1, placement: 2, kills: 4, pp: 12, kp: 4, wwcd: false, total: 16 },
      { tk: 'T3', match: 1, placement: 3, kills: 2, pp: 10, kp: 2, wwcd: false, total: 12 },
      { tk: 'T1', match: 2, placement: 2, kills: 5, pp: 12, kp: 5, wwcd: false, total: 17 },
      { tk: 'T2', match: 2, placement: 1, kills: 7, pp: 15, kp: 7, wwcd: true, total: 22 },
      { tk: 'T3', match: 2, placement: 3, kills: 3, pp: 10, kp: 3, wwcd: false, total: 13 },
    ];
    for (const r of rows) {
      await client.query(
        `INSERT INTO tournament_match_results (id, tournament_id, match_id, team_id, placement, kills, kill_points, placement_points, wwcd, total_points, status, verified_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'verified',$11)`,
        [`${prefix}-RES-${r.tk}-${r.match}`, tournId, `${prefix}-M${r.match}`, `${prefix}-${r.tk}`,
          r.placement, r.kills, r.kp, r.pp, r.wwcd, r.total, orgId]
      );
    }
  }

  return { orgId, tournId, teamIds: ['T1', 'T2', 'T3'].map((tk) => `${prefix}-${tk}`) };
}

async function countRoundAssignments(client, prefix, teamSuffix, targetRound = 2) {
  const res = await client.query(
    `SELECT COUNT(*)::int AS n
     FROM tournament_match_assignments a
     JOIN tournament_matches m ON m.id = a.match_id AND m.tournament_id = $1
     WHERE a.tournament_team_id = $2 AND a.tournament_id = $1 AND m.round_id = $3`,
    [`${prefix}-TRN`, `${prefix}-${teamSuffix}`, `${prefix}-R${targetRound}`]
  );
  return res.rows[0].n;
}

test('round progression: qualifies top-N and advances them into the next round only', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-A';
    const { orgId, tournId } = await seedScenario(client, prefix);

    const result = await qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.alreadyQualified, false);
    assert.strictEqual(result.cutoff, 2);
    assert.strictEqual(result.advancedCount, 2);
    assert.strictEqual(result.skippedCount, 0);
    assert.strictEqual(result.pendingCount, 0);
    assert.strictEqual(result.round.status, 'completed');
    assert.strictEqual(result.nextRound.round_number, 2);
    assert.strictEqual(result.nextRound.status, 'live');

    // Ranked standings include all three teams; only the top-2 held advancement rows are set.
    assert.strictEqual(result.standings.length, 3);
    assert.ok(result.outcomes.every((o) => o.status === 'advanced'));

    // Round statuses written in the DB.
    const r1 = await client.query('SELECT status FROM tournament_rounds WHERE id = $1', [`${prefix}-R1`]);
    const r2 = await client.query('SELECT status FROM tournament_rounds WHERE id = $1', [`${prefix}-R2`]);
    assert.strictEqual(r1.rows[0].status, 'completed');
    assert.strictEqual(r2.rows[0].status, 'live');

    // Round-2 placements: T1 + T2 got the 2 matches of RM2; T3 did not.
    assert.strictEqual(await countRoundAssignments(client, prefix, 'T1'), 2);
    assert.strictEqual(await countRoundAssignments(client, prefix, 'T2'), 2);
    assert.strictEqual(await countRoundAssignments(client, prefix, 'T3'), 0);

    // Audit row written exactly once with the advancement source visible in new placements.
    const audit = await client.query("SELECT details FROM admin_action_log WHERE action = 'round_qualified' AND target_id = $1", [`${prefix}-R1`]);
    assert.strictEqual(audit.rows.length, 1);
    const details = JSON.parse(audit.rows[0].details);
    assert.strictEqual(details.cutoff, 2);
    assert.strictEqual(details.advanced_count, 2);
    const src = await client.query(
      'SELECT DISTINCT source FROM tournament_match_assignments a JOIN tournament_matches m ON m.id = a.match_id WHERE m.round_id = $1',
      [`${prefix}-R2`]
    );
    assert.deepStrictEqual(src.rows.map((r) => r.source).sort(), ['advancement']);
  }, t);
});

test('round progression: idempotent re-run advances nothing and reports alreadyQualified', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-B';
    const { orgId, tournId } = await seedScenario(client, prefix);

    const first = await qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId });
    assert.strictEqual(first.advancedCount, 2);
    const before = (await countRoundAssignments(client, prefix, 'T1')) + (await countRoundAssignments(client, prefix, 'T2'));

    const second = await qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId });
    assert.strictEqual(second.alreadyQualified, true);
    assert.strictEqual(second.advancedCount, undefined);

    const after = (await countRoundAssignments(client, prefix, 'T1')) + (await countRoundAssignments(client, prefix, 'T2'));
    assert.strictEqual(after, before, 're-run makes no placement changes');

    const audit = await client.query("SELECT COUNT(*)::int AS n FROM admin_action_log WHERE action = 'round_qualified' AND target_id = $1", [`${prefix}-R1`]);
    assert.strictEqual(audit.rows[0].n, 1);
  }, t);
});

test('round progression: ineligible linked registration is skipped, round still completes', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-C';
    // Raise teams_advancing to 3 so T3 falls inside the cutoff and must be attempted.
    const { orgId, tournId } = await seedScenario(client, prefix, { rejectTeam: 'T3', advancing: 3 });

    const result = await qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId });

    assert.strictEqual(result.cutoff, 3);
    assert.strictEqual(result.advancedCount, 2);
    assert.strictEqual(result.skippedCount, 1);
    const t3Outcome = result.outcomes.find((o) => o.teamName === `${prefix}-T3-name`);
    assert.ok(t3Outcome, 'T3 must have an outcome recorded');
    assert.strictEqual(t3Outcome.status, 'skipped');
    assert.strictEqual(t3Outcome.code, ALLOCATION_ERR.TEAM_NOT_ELIGIBLE);

    const r1 = await client.query('SELECT status FROM tournament_rounds WHERE id = $1', [`${prefix}-R1`]);
    const r2 = await client.query('SELECT status FROM tournament_rounds WHERE id = $1', [`${prefix}-R2`]);
    assert.strictEqual(r1.rows[0].status, 'completed');
    assert.strictEqual(r2.rows[0].status, 'live');

    assert.strictEqual(await countRoundAssignments(client, prefix, 'T3'), 0);
  }, t);
});

test('round progression: non-approved roadmap is rejected with ROADMAP_NOT_APPROVED', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-D';
    const { orgId, tournId } = await seedScenario(client, prefix, { roadmap: 'draft' });

    await assert.rejects(qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId }), (err) => {
      assert.ok(err instanceof ProgressionError);
      assert.strictEqual(err.code, PROGRESSION_ERR.ROADMAP_NOT_APPROVED);
      return true;
    });

    // Nothing was marked, nothing placed.
    const r1 = await client.query('SELECT status FROM tournament_rounds WHERE id = $1', [`${prefix}-R1`]);
    assert.strictEqual(r1.rows[0].status, 'configured');
  }, t);
});

test('round progression: a round without verified results rejects with ROUND_NO_RESULTS', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-E';
    const { orgId, tournId } = await seedScenario(client, prefix, { results: false });

    await assert.rejects(qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId }), (err) => {
      assert.strictEqual(err.code, PROGRESSION_ERR.ROUND_NO_RESULTS);
      return true;
    });
  }, t);
});

test('round progression: the final round rejects with NO_NEXT_ROUND', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-F';
    const { orgId, tournId } = await seedScenario(client, prefix, { rounds: 1, results: true });

    await assert.rejects(qualifyRound(client, { tournamentId: tournId, roundNumber: 1, actorId: orgId }), (err) => {
      assert.strictEqual(err.code, PROGRESSION_ERR.NO_NEXT_ROUND);
      return true;
    });

    // Source round untouched.
    const r1 = await client.query('SELECT status FROM tournament_rounds WHERE id = $1', [`${prefix}-R1`]);
    assert.strictEqual(r1.rows[0].status, 'configured');
  }, t);
});

test('round progression: standings endpoint query aggregates verified results per round', async (t) => {
  await withTransaction(async (client) => {
    const prefix = 'PRGD-G';
    const { tournId } = await seedScenario(client, prefix);

    const standings = await getRoundStandings(client, tournId, `${prefix}-R1`);
    assert.strictEqual(standings.length, 3);
    // Deterministic ranking by sortAndRank: R1 group first — but regardless of the
    // tie at 38 pts, total points are aggregated across both matches.
    const byId = Object.fromEntries(standings.map((s) => [s.team_id, s]));
    assert.strictEqual(byId[`${prefix}-T1`].total_points, 38);
    assert.strictEqual(byId[`${prefix}-T2`].total_points, 38);
    assert.strictEqual(byId[`${prefix}-T3`].total_points, 25);
    assert.strictEqual(standings[0].rank, 1);
    assert.strictEqual(standings[2].rank, 3);
    assert.strictEqual(byId[`${prefix}-T3`].rank, 3);
  }, t);
});