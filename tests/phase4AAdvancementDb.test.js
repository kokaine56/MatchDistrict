// tests/phase4AAdvancementDb.test.js
// Phase 4A Backend Tests: Hardened Round Advancement Engine, Concurrency, Snake Seeding,
// Disqualification and Source Match Verification Gating.

import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {
  advanceTeamsManually,
  getRoundAdvancementSummary,
  PROGRESSION_ERR,
} from '../server/roundProgressionService.js';
import { assertSafeTestDb } from './testDbGuard.js';

// PGTEST_URL must point to a separate scratch database. Never fallback to DATABASE_URL.
const TEST_URL = process.env.PGTEST_URL;

// Helper to create isolated Postgres test fixtures inside a transaction that is always rolled back
async function withPgTransaction(callback) {
  if (!TEST_URL) return null;
  assertSafeTestDb(TEST_URL);
  const pool = new pg.Pool({
    connectionString: TEST_URL,
    ssl: TEST_URL.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('ROLLBACK');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end().catch(() => {});
  }
}

// In-memory query simulator for environments without live Postgres
function createMockAdvancementClient() {
  const db = {
    tournaments: [],
    rounds: [],
    days: [],
    groups: [],
    rooms: [],
    matches: [],
    assignments: [],
    matchResults: [],
    teams: [],
    registrations: [],
    adminLogs: [],
  };

  const client = {
    db,
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();

      if (s.startsWith('SELECT ID, "ORGID", ROADMAP_STATUS, FINALIZED_AT FROM TOURNAMENTS')) {
        const t = db.tournaments.find((x) => x.id === params[0]);
        return { rows: t ? [t] : [] };
      }

      if (s.startsWith('SELECT ID, TOURNAMENT_ID, ROUND_NUMBER, NAME, STATUS FROM TOURNAMENT_ROUNDS')) {
        const r = db.rounds.find((x) => x.id === params[0] && x.tournament_id === params[1]);
        return { rows: r ? [r] : [] };
      }

      if (s.startsWith('SELECT ID, ROUND_NUMBER, NAME, STATUS, TEAMS_ADVANCING')) {
        const r = db.rounds.find((x) => x.id === params[0] && x.tournament_id === params[1]);
        return { rows: r ? [r] : [] };
      }

      if (s.includes('FROM TOURNAMENT_ROUNDS WHERE TOURNAMENT_ID = $1 AND ROUND_NUMBER > $2')) {
        const currentR = db.rounds.find((x) => x.tournament_id === params[0] && x.round_number === params[1]);
        const curNum = currentR ? currentR.round_number : params[1];
        const next = db.rounds
          .filter((x) => x.tournament_id === params[0] && x.round_number > curNum)
          .sort((a, b) => a.round_number - b.round_number);
        return { rows: next.length > 0 ? [next[0]] : [] };
      }

      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS') && s.includes('UNION') && s.includes('TOURNAMENT_MATCH_RESULTS')) {
        const sourceMatches = db.matches.filter((m) => m.round_id === params[1] && m.tournament_id === params[0]);
        const matchIds = new Set(sourceMatches.map((m) => m.id));
        const played = new Set();
        db.assignments.filter((a) => matchIds.has(a.match_id)).forEach((a) => played.add(a.tournament_team_id));
        db.matchResults.filter((mr) => matchIds.has(mr.match_id)).forEach((mr) => played.add(mr.team_id));
        return { rows: Array.from(played).map((id) => ({ team_id: id })) };
      }

      if (s.includes('DELETE FROM TOURNAMENT_MATCH_ASSIGNMENTS')) {
        const targetMatches = db.matches.filter((m) => m.round_id === params[1] && m.tournament_id === params[0]);
        const targetMatchIds = new Set(targetMatches.map((m) => m.id));
        db.assignments = db.assignments.filter(
          (a) => !(targetMatchIds.has(a.match_id) && a.source === 'advancement')
        );
        return { rowCount: 1 };
      }

      if (s.includes('FROM TOURNAMENT_MATCHES')) {
        const roundId = params[0];
        const tourneyId = params[1];
        const matches = db.matches.filter((m) => m.round_id === roundId && m.tournament_id === tourneyId);
        if (s.includes('COUNT(MR.ID)')) {
          const rows = matches.map((m) => {
            const resCount = db.matchResults.filter((mr) => mr.match_id === m.id).length;
            return {
              id: m.id,
              match_number: m.match_number,
              status: m.status,
              group_id: m.group_id,
              group_name: m.group_name,
              result_count: resCount,
            };
          });
          return { rows };
        }
        return { rows: matches };
      }

      if (s.includes('FROM TOURNAMENT_GROUPS')) {
        const groups = db.groups
          .filter((g) => g.round_id === params[0] && g.tournament_id === params[1])
          .sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
        return { rows: groups };
      }

      if (s.startsWith('SELECT ID, TEAM_NAME, STATUS FROM TOURNAMENT_TEAMS WHERE ID = ANY(')) {
        const ids = params[0] || [];
        const found = db.teams.filter((t) => ids.includes(t.id) && t.tournament_id === params[1]);
        return { rows: found };
      }

      if (s.includes('FROM TOURNAMENT_MATCH_RESULTS') && s.includes('LIMIT 1')) {
        const targetMatches = db.matches.filter((m) => m.round_id === params[0] && m.tournament_id === params[1]);
        const targetMatchIds = new Set(targetMatches.map((m) => m.id));
        const hasRes = db.matchResults.some((mr) => targetMatchIds.has(mr.match_id));
        return { rows: hasRes ? [{ 1: 1 }] : [] };
      }

      if (s.startsWith('INSERT INTO TOURNAMENT_MATCH_ASSIGNMENTS')) {
        const [id, tournament_id, tournament_team_id, match_id, group_id, day_id, source] = params;
        const status = 'allocated';
        const existingIdx = db.assignments.findIndex(
          (a) => a.tournament_team_id === tournament_team_id && a.match_id === match_id
        );
        if (existingIdx >= 0) {
          db.assignments[existingIdx] = {
            ...db.assignments[existingIdx],
            group_id: group_id || db.assignments[existingIdx].group_id,
            day_id: day_id || db.assignments[existingIdx].day_id,
            status,
            source,
          };
        } else {
          db.assignments.push({ id, tournament_id, tournament_team_id, match_id, group_id, day_id, status, source });
        }
        return { rowCount: 1 };
      }

      if (s.startsWith('UPDATE TOURNAMENT_ROUNDS SET STATUS = \'COMPLETED\'')) {
        const r = db.rounds.find((x) => x.id === params[0] && x.tournament_id === params[1]);
        if (r) r.status = 'completed';
        return { rowCount: 1 };
      }

      if (s.includes('SELECT DISTINCT T.ID, T.TEAM_NAME, T.STATUS FROM TOURNAMENT_TEAMS T')) {
        const sourceMatches = db.matches.filter((m) => m.round_id === params[0] && m.tournament_id === params[1]);
        const mIds = new Set(sourceMatches.map((m) => m.id));
        const tIds = new Set();
        db.assignments.filter((a) => mIds.has(a.match_id)).forEach((a) => tIds.add(a.tournament_team_id));
        db.matchResults.filter((mr) => mIds.has(mr.match_id)).forEach((mr) => tIds.add(mr.team_id));
        const teams = db.teams.filter((t) => tIds.has(t.id) && t.tournament_id === params[1]);
        return { rows: teams };
      }

      if (s.includes('FROM TOURNAMENT_REGISTRATION_GROUPS')) {
        return { rows: [] };
      }

      if (s.includes('FROM TOURNAMENT_MATCH_RESULTS') && s.includes('GROUP BY MR.TEAM_ID')) {
        return { rows: [] };
      }

      if (s.startsWith('SELECT ID, TEAM_NAME, STATUS FROM TOURNAMENT_TEAMS WHERE TOURNAMENT_ID = $1 AND STATUS = \'DISQUALIFIED\'')) {
        const dq = db.teams.filter((t) => t.tournament_id === params[0] && t.status === 'disqualified');
        return { rows: dq };
      }

      if (s.startsWith('INSERT INTO ADMIN_ACTION_LOG')) {
        db.adminLogs.push(params);
        return { rowCount: 1 };
      }

      return { rows: [] };
    },
  };

  return client;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE: PHASE 4A HARDENED ADVANCEMENT
// ─────────────────────────────────────────────────────────────────────────────

test('PHASE 4A ADVANCEMENT: Snake seeding distributes teams balanced across target districts', async () => {
  const client = createMockAdvancementClient();
  const tId = 'T-4A-SNAKE';

  client.db.tournaments.push({ id: tId, orgId: 'ORG-1', finalized_at: null });
  client.db.rounds.push(
    { id: 'RND-1', tournament_id: tId, round_number: 1, name: 'Round 1 Qualifier', status: 'live', teams_advancing: 8 },
    { id: 'RND-2', tournament_id: tId, round_number: 2, name: 'Round 2 Semi Finals', status: 'configured', teams_advancing: 4 }
  );

  // Target round has 2 districts: GRP-A and GRP-B
  client.db.groups.push(
    { id: 'GRP-A', round_id: 'RND-2', tournament_id: tId, group_name: 'District A', sequence: 1 },
    { id: 'GRP-B', round_id: 'RND-2', tournament_id: tId, group_name: 'District B', sequence: 2 }
  );

  // Target round has 2 matches per district (4 matches total)
  client.db.matches.push(
    { id: 'M-SRC-1', round_id: 'RND-1', tournament_id: tId, match_number: 1, status: 'COMPLETED', group_id: 'GRP-SRC' },
    { id: 'M-TGT-A1', round_id: 'RND-2', tournament_id: tId, match_number: 1, status: 'PENDING', group_id: 'GRP-A' },
    { id: 'M-TGT-A2', round_id: 'RND-2', tournament_id: tId, match_number: 2, status: 'PENDING', group_id: 'GRP-A' },
    { id: 'M-TGT-B1', round_id: 'RND-2', tournament_id: tId, match_number: 3, status: 'PENDING', group_id: 'GRP-B' },
    { id: 'M-TGT-B2', round_id: 'RND-2', tournament_id: tId, match_number: 4, status: 'PENDING', group_id: 'GRP-B' }
  );

  // 8 teams played in source round
  const teamIds = ['TEAM-1', 'TEAM-2', 'TEAM-3', 'TEAM-4', 'TEAM-5', 'TEAM-6', 'TEAM-7', 'TEAM-8'];
  for (const tid of teamIds) {
    client.db.teams.push({ id: tid, tournament_id: tId, team_name: tid, status: 'verified' });
    client.db.assignments.push({ id: `ASN-SRC-${tid}`, tournament_id: tId, tournament_team_id: tid, match_id: 'M-SRC-1', source: 'registration' });
  }

  // Advance with snake seeding default
  const result = await advanceTeamsManually(client, {
    tournamentId: tId,
    sourceRoundId: 'RND-1',
    targetRoundId: 'RND-2',
    teamIds,
    actorId: 'ORG-1',
  });

  assert.equal(result.success, true);
  assert.equal(result.advancedCount, 8);

  // Verify snake distribution:
  // K = 2 districts (GRP-A index 0, GRP-B index 1)
  // Seed 0 (TEAM-1) -> GRP-A
  // Seed 1 (TEAM-2) -> GRP-B
  // Seed 2 (TEAM-3) -> GRP-B (snake back)
  // Seed 3 (TEAM-4) -> GRP-A (snake back)
  // Seed 4 (TEAM-5) -> GRP-A
  // Seed 5 (TEAM-6) -> GRP-B
  // Seed 6 (TEAM-7) -> GRP-B
  // Seed 7 (TEAM-8) -> GRP-A
  const getGroupTeams = (grpId) => {
    return Array.from(new Set(
      client.db.assignments
        .filter((a) => a.group_id === grpId && a.source === 'advancement')
        .map((a) => a.tournament_team_id)
    ));
  };

  const distATeams = getGroupTeams('GRP-A');
  const distBTeams = getGroupTeams('GRP-B');

  assert.deepEqual(distATeams.sort(), ['TEAM-1', 'TEAM-4', 'TEAM-5', 'TEAM-8'].sort(), 'District A must receive snake seeds 1, 4, 5, 8');
  assert.deepEqual(distBTeams.sort(), ['TEAM-2', 'TEAM-3', 'TEAM-6', 'TEAM-7'].sort(), 'District B must receive snake seeds 2, 3, 6, 7');

  // Verify multi-match assignment: every match in the team's district receives an assignment row
  const a1Assignments = client.db.assignments.filter((a) => a.match_id === 'M-TGT-A1');
  const a2Assignments = client.db.assignments.filter((a) => a.match_id === 'M-TGT-A2');
  assert.equal(a1Assignments.length, 4, 'Match A1 must receive 4 teams');
  assert.equal(a2Assignments.length, 4, 'Match A2 must receive 4 teams');

  // Verify source round marked completed
  const srcRnd = client.db.rounds.find((r) => r.id === 'RND-1');
  assert.equal(srcRnd.status, 'completed', 'Source round must be marked completed after advancing');
});

test('PHASE 4A ADVANCEMENT: Manual placement map overrides default snake seeding', async () => {
  const client = createMockAdvancementClient();
  const tId = 'T-4A-MANUAL';

  client.db.tournaments.push({ id: tId, orgId: 'ORG-1', finalized_at: null });
  client.db.rounds.push(
    { id: 'R1', tournament_id: tId, round_number: 1, name: 'Round 1', status: 'live' },
    { id: 'R2', tournament_id: tId, round_number: 2, name: 'Round 2', status: 'configured' }
  );

  client.db.groups.push(
    { id: 'GRP-1', round_id: 'R2', tournament_id: tId, group_name: 'Group 1', sequence: 1 },
    { id: 'GRP-2', round_id: 'R2', tournament_id: tId, group_name: 'Group 2', sequence: 2 }
  );

  client.db.matches.push(
    { id: 'M-R1', round_id: 'R1', tournament_id: tId, match_number: 1, status: 'COMPLETED' },
    { id: 'M-G1', round_id: 'R2', tournament_id: tId, match_number: 1, status: 'PENDING', group_id: 'GRP-1' },
    { id: 'M-G2', round_id: 'R2', tournament_id: tId, match_number: 2, status: 'PENDING', group_id: 'GRP-2' }
  );

  const teamIds = ['T-ALPHA', 'T-BETA', 'T-GAMMA', 'T-DELTA'];
  for (const tid of teamIds) {
    client.db.teams.push({ id: tid, tournament_id: tId, team_name: tid, status: 'verified' });
    client.db.assignments.push({ id: `A-${tid}`, tournament_id: tId, tournament_team_id: tid, match_id: 'M-R1', source: 'registration' });
  }

  // Organizer specifies exact manual placement: ALPHA & BETA into GRP-2, GAMMA & DELTA into GRP-1
  const manualPlacement = {
    'T-ALPHA': 'GRP-2',
    'T-BETA': 'GRP-2',
    'T-GAMMA': 'GRP-1',
    'T-DELTA': 'GRP-1',
  };

  const result = await advanceTeamsManually(client, {
    tournamentId: tId,
    sourceRoundId: 'R1',
    targetRoundId: 'R2',
    teamIds,
    actorId: 'ORG-1',
    manual_placement: manualPlacement,
  });

  assert.equal(result.success, true);
  const grp1Teams = client.db.assignments.filter((a) => a.group_id === 'GRP-1' && a.source === 'advancement').map((a) => a.tournament_team_id);
  const grp2Teams = client.db.assignments.filter((a) => a.group_id === 'GRP-2' && a.source === 'advancement').map((a) => a.tournament_team_id);

  assert.deepEqual(grp1Teams.sort(), ['T-DELTA', 'T-GAMMA'].sort());
  assert.deepEqual(grp2Teams.sort(), ['T-ALPHA', 'T-BETA'].sort());
});

test('PHASE 4A ADVANCEMENT: Re-running replaces earlier source=\'advancement\' rows without duplicates', async () => {
  const client = createMockAdvancementClient();
  const tId = 'T-4A-RERUN';

  client.db.tournaments.push({ id: tId, orgId: 'ORG-1', finalized_at: null });
  client.db.rounds.push(
    { id: 'R1', tournament_id: tId, round_number: 1, name: 'Round 1', status: 'live' },
    { id: 'R2', tournament_id: tId, round_number: 2, name: 'Round 2', status: 'configured' }
  );
  client.db.matches.push(
    { id: 'M-SRC', round_id: 'R1', tournament_id: tId, match_number: 1, status: 'COMPLETED' },
    { id: 'M-TGT', round_id: 'R2', tournament_id: tId, match_number: 1, status: 'PENDING' }
  );

  const allTeams = ['T1', 'T2', 'T3', 'T4'];
  for (const tid of allTeams) {
    client.db.teams.push({ id: tid, tournament_id: tId, team_name: tid, status: 'verified' });
    client.db.assignments.push({ id: `A-${tid}`, tournament_id: tId, tournament_team_id: tid, match_id: 'M-SRC', source: 'registration' });
  }

  // First run: advance T1, T2
  await advanceTeamsManually(client, {
    tournamentId: tId,
    sourceRoundId: 'R1',
    targetRoundId: 'R2',
    teamIds: ['T1', 'T2'],
    actorId: 'ORG-1',
  });

  let tgtAssignments = client.db.assignments.filter((a) => a.match_id === 'M-TGT');
  assert.equal(tgtAssignments.length, 2);
  assert.deepEqual(tgtAssignments.map((a) => a.tournament_team_id).sort(), ['T1', 'T2']);

  // Second run (re-run advancement): replace with T3, T4
  await advanceTeamsManually(client, {
    tournamentId: tId,
    sourceRoundId: 'R1',
    targetRoundId: 'R2',
    teamIds: ['T3', 'T4'],
    actorId: 'ORG-1',
  });

  tgtAssignments = client.db.assignments.filter((a) => a.match_id === 'M-TGT');
  assert.equal(tgtAssignments.length, 2, 'Must not accumulate old assignments');
  assert.deepEqual(tgtAssignments.map((a) => a.tournament_team_id).sort(), ['T3', 'T4'], 'Must reflect new advancement');

  // Refuse if target round already has verified results
  client.db.matchResults.push({ id: 'RES-1', match_id: 'M-TGT', team_id: 'T3', total_points: 15 });
  await assert.rejects(
    async () => {
      await advanceTeamsManually(client, {
        tournamentId: tId,
        sourceRoundId: 'R1',
        targetRoundId: 'R2',
        teamIds: ['T1', 'T4'],
        actorId: 'ORG-1',
      });
    },
    (err) => {
      assert.equal(err.code, 'TARGET_ROUND_HAS_RESULTS');
      return true;
    }
  );
});

test('PHASE 4A ADVANCEMENT: Strict validation rejects disqualified teams, duplicate IDs, and non-participants', async () => {
  const client = createMockAdvancementClient();
  const tId = 'T-4A-VALIDATION';

  client.db.tournaments.push({ id: tId, orgId: 'ORG-1', finalized_at: null });
  client.db.rounds.push(
    { id: 'R1', tournament_id: tId, round_number: 1, name: 'Round 1', status: 'live' },
    { id: 'R2', tournament_id: tId, round_number: 2, name: 'Round 2', status: 'configured' }
  );
  client.db.matches.push(
    { id: 'M1', round_id: 'R1', tournament_id: tId, match_number: 1, status: 'COMPLETED' },
    { id: 'M2', round_id: 'R2', tournament_id: tId, match_number: 1, status: 'PENDING' }
  );

  client.db.teams.push(
    { id: 'T-VALID', tournament_id: tId, team_name: 'Valid Team', status: 'verified' },
    { id: 'T-DISQ', tournament_id: tId, team_name: 'Cheater Team', status: 'disqualified' },
    { id: 'T-OUTSIDER', tournament_id: tId, team_name: 'Outsider Team', status: 'verified' }
  );

  client.db.assignments.push(
    { id: 'A1', tournament_id: tId, tournament_team_id: 'T-VALID', match_id: 'M1', source: 'registration' },
    { id: 'A2', tournament_id: tId, tournament_team_id: 'T-DISQ', match_id: 'M1', source: 'registration' }
  );

  // 1. Rejects duplicate team IDs
  await assert.rejects(
    async () => {
      await advanceTeamsManually(client, {
        tournamentId: tId,
        sourceRoundId: 'R1',
        targetRoundId: 'R2',
        teamIds: ['T-VALID', 'T-VALID'],
      });
    },
    (err) => {
      assert.equal(err.code, 'DUPLICATE_TEAMS');
      return true;
    }
  );

  // 2. Rejects disqualified teams
  await assert.rejects(
    async () => {
      await advanceTeamsManually(client, {
        tournamentId: tId,
        sourceRoundId: 'R1',
        targetRoundId: 'R2',
        teamIds: ['T-VALID', 'T-DISQ'],
      });
    },
    (err) => {
      assert.equal(err.code, 'TEAM_DISQUALIFIED');
      assert.match(err.message, /disqualified and cannot advance/i);
      return true;
    }
  );

  // 3. Rejects teams that did not play the source round
  await assert.rejects(
    async () => {
      await advanceTeamsManually(client, {
        tournamentId: tId,
        sourceRoundId: 'R1',
        targetRoundId: 'R2',
        teamIds: ['T-VALID', 'T-OUTSIDER'],
      });
    },
    (err) => {
      assert.equal(err.code, 'TEAM_DID_NOT_PLAY_SOURCE_ROUND');
      return true;
    }
  );
});

test('PHASE 4A ADVANCEMENT: Unverified source matches block advancement unless override flag is set', async () => {
  const client = createMockAdvancementClient();
  const tId = 'T-4A-UNVERIFIED';

  client.db.tournaments.push({ id: tId, orgId: 'ORG-1', finalized_at: null });
  client.db.rounds.push(
    { id: 'R1', tournament_id: tId, round_number: 1, name: 'Round 1', status: 'live' },
    { id: 'R2', tournament_id: tId, round_number: 2, name: 'Round 2', status: 'configured' }
  );
  client.db.matches.push(
    { id: 'M-UNV', round_id: 'R1', tournament_id: tId, match_number: 1, status: 'PENDING' }, // Unverified!
    { id: 'M-TGT', round_id: 'R2', tournament_id: tId, match_number: 1, status: 'PENDING' }
  );

  client.db.teams.push({ id: 'T1', tournament_id: tId, team_name: 'Team 1', status: 'verified' });
  client.db.assignments.push({ id: 'A1', tournament_id: tId, tournament_team_id: 'T1', match_id: 'M-UNV', source: 'registration' });

  // Refused without override flag
  await assert.rejects(
    async () => {
      await advanceTeamsManually(client, {
        tournamentId: tId,
        sourceRoundId: 'R1',
        targetRoundId: 'R2',
        teamIds: ['T1'],
      });
    },
    (err) => {
      assert.equal(err.code, 'SOURCE_MATCHES_UNVERIFIED');
      return true;
    }
  );

  // Accepted with explicit allow_unverified override
  const res = await advanceTeamsManually(client, {
    tournamentId: tId,
    sourceRoundId: 'R1',
    targetRoundId: 'R2',
    teamIds: ['T1'],
    allow_unverified: true,
  });
  assert.equal(res.success, true);
});

test('PHASE 4A SUMMARY: Organizer summary returns standings, planned rules, completion status, and progression derivations', async () => {
  const client = createMockAdvancementClient();
  const tId = 'T-4A-SUMMARY';

  client.db.tournaments.push({ id: tId, orgId: 'ORG-1', finalized_at: null });
  client.db.rounds.push(
    {
      id: 'R1',
      tournament_id: tId,
      round_number: 1,
      name: 'Round 1 Qualifier',
      status: 'live',
      advancement_type: 'per_district',
      teams_advancing_per_district: 2,
    },
    { id: 'R2', tournament_id: tId, round_number: 2, name: 'Semi Finals', status: 'configured' }
  );
  client.db.matches.push(
    { id: 'M1', round_id: 'R1', tournament_id: tId, match_number: 1, status: 'COMPLETED' }
  );

  const summary = await getRoundAdvancementSummary(client, tId, 'R1');
  assert.equal(summary.success, true);
  assert.equal(summary.source_round.name, 'Round 1 Qualifier');
  assert.equal(summary.target_round.name, 'Semi Finals');
  assert.equal(summary.planned_rule.advancement_type, 'per_district');
  assert.equal(summary.planned_rule.teams_advancing_per_district, 2);
  assert.equal(summary.results_complete, true);
});

// Helper to create live tournament fixtures in PostgreSQL
async function createLiveFixture(client, { r1AdvType = 'per_district', r1AdvPerDist = 2, r2Districts = 2 } = {}) {
  const tId = `T-4A-LIVE-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const orgId = `ORG-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // 0. User
  await client.query(`
    INSERT INTO users (id, email, name, password)
    VALUES ($1, $2, $3, $4)
  `, [orgId, `${orgId}@test.local`, 'Organizer Live', 'test-pass']);

  // 1. Tournament
  await client.query(`
    INSERT INTO tournaments (id, title, "orgId", status, roadmap_status, "slotsTotal")
    VALUES ($1, 'Live Progression Test', $2, 'live', 'approved', 64)
  `, [tId, orgId]);

  // 2. Rounds
  const r1Id = `R1-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const r2Id = `R2-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await client.query(`
    INSERT INTO tournament_rounds (id, tournament_id, round_number, name, status, teams_advancing, advancement_type, teams_advancing_per_district)
    VALUES
      ($1, $2, 1, 'Round 1 Qualifiers', 'live', 4, $3, $4),
      ($5, $2, 2, 'Round 2 Semi Finals', 'configured', 2, 'overall', 2)
  `, [r1Id, tId, r1AdvType, r1AdvPerDist, r2Id]);

  // 3. Days
  const d1Id = `D1-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const d2Id = `D2-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await client.query(`
    INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date)
    VALUES
      ($1, $2, $3, 1, '2026-10-25'),
      ($4, $2, $5, 2, '2026-10-26')
  `, [d1Id, tId, r1Id, d2Id, r2Id]);

  // 4. Round 1 Groups & Matches
  const r1G1Id = `GRP-R1-1-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const r1G2Id = `GRP-R1-2-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await client.query(`
    INSERT INTO tournament_groups (id, tournament_id, round_id, day_id, group_name, sequence)
    VALUES
      ($1, $2, $3, $4, 'District A', 1),
      ($5, $2, $3, $4, 'District B', 2)
  `, [r1G1Id, tId, r1Id, d1Id, r1G2Id]);

  const m1AId = `M1A-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const m1BId = `M1B-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  await client.query(`
    INSERT INTO tournament_matches (id, tournament_id, round_id, group_id, match_number, status, start_time, end_time)
    VALUES
      ($1, $2, $3, $4, 1, 'COMPLETED', '14:00', '14:30'),
      ($5, $2, $3, $6, 2, 'COMPLETED', '14:30', '15:00')
  `, [m1AId, tId, r1Id, r1G1Id, m1BId, r1G2Id]);

  // 5. Round 2 Target Districts & Matches
  const r2GroupIds = [];
  const r2MatchIds = [];
  for (let g = 1; g <= r2Districts; g++) {
    const gid = `GRP-R2-${g}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    r2GroupIds.push(gid);
    await client.query(`
      INSERT INTO tournament_groups (id, tournament_id, round_id, day_id, group_name, sequence)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [gid, tId, r2Id, d2Id, `District ${g}`, g]);

    const mid = `M2-${g}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    r2MatchIds.push(mid);
    await client.query(`
      INSERT INTO tournament_matches (id, tournament_id, round_id, group_id, match_number, status, start_time, end_time)
      VALUES ($1, $2, $3, $4, $5, 'PENDING', '16:00', '16:30')
    `, [mid, tId, r2Id, gid, g]);
  }

  // 6. Teams (4 teams)
  const teamIds = [];
  for (let i = 1; i <= 4; i++) {
    const tid = `TEAM-LIVE-${i}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    teamIds.push(tid);
    await client.query(`
      INSERT INTO tournament_teams (id, tournament_id, team_name, status, leader_user_id)
      VALUES ($1, $2, $3, 'verified', $4)
    `, [tid, tId, `Team ${i}`, orgId]);

    // Teams 1 & 2 in District A match; Teams 3 & 4 in District B match
    const assignedMatchId = i <= 2 ? m1AId : m1BId;
    const assignedGroupId = i <= 2 ? r1G1Id : r1G2Id;
    await client.query(`
      INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, group_id, day_id, status, source)
      VALUES ($1, $2, $3, $4, $5, $6, 'allocated', 'registration')
    `, [`ASN-${tid}`, tId, tid, assignedMatchId, assignedGroupId, d1Id]);
  }

  return {
    tId,
    orgId,
    r1Id,
    r2Id,
    d1Id,
    d2Id,
    r1G1Id,
    r1G2Id,
    m1AId,
    m1BId,
    r2GroupIds,
    r2MatchIds,
    teamIds,
  };
}

// ── REAL-DB TEST 1: per_district advancement ──
test('PHASE 4A REAL-DB TEST: per_district advancement advances top teams per district with verified results', async (t) => {
  if (!TEST_URL) {
    t.skip('Skipping live PostgreSQL test: PGTEST_URL environment variable is not set.');
    return;
  }

  await withPgTransaction(async (client) => {
    const fx = await createLiveFixture(client, { r1AdvType: 'per_district', r1AdvPerDist: 1, r2Districts: 2 });

    // Seed verified match results: Team 1 wins District A (15 pts), Team 2 (5 pts). Team 3 wins District B (20 pts), Team 4 (8 pts).
    await client.query(`
      INSERT INTO tournament_match_results (id, tournament_id, match_id, team_id, placement, kills, kill_points, placement_points, total_points, status)
      VALUES
        ($1, $2, $3, $4, 1, 5, 5, 10, 15, 'verified'),
        ($5, $2, $3, $6, 2, 2, 2, 3, 5, 'verified'),
        ($7, $2, $8, $9, 1, 8, 8, 12, 20, 'verified'),
        ($10, $2, $8, $11, 2, 3, 3, 5, 8, 'verified')
    `, [
      `MR-${Date.now()}-1`, fx.tId, fx.m1AId, fx.teamIds[0],
      `MR-${Date.now()}-2`, fx.tId, fx.m1AId, fx.teamIds[1],
      `MR-${Date.now()}-3`, fx.tId, fx.m1BId, fx.teamIds[2],
      `MR-${Date.now()}-4`, fx.tId, fx.m1BId, fx.teamIds[3],
    ]);

    // Advance top 1 from District A (Team 1) and top 1 from District B (Team 3)
    const advancingTeams = [fx.teamIds[0], fx.teamIds[2]];
    const advResult = await advanceTeamsManually(client, {
      tournamentId: fx.tId,
      sourceRoundId: fx.r1Id,
      targetRoundId: fx.r2Id,
      teamIds: advancingTeams,
      actorId: fx.orgId,
    });

    assert.equal(advResult.success, true);
    assert.equal(advResult.advancedCount, 2);

    // Verify DB assignments in target round
    const asgRes = await client.query(
      `SELECT tournament_team_id, match_id, group_id, source FROM tournament_match_assignments WHERE tournament_id = $1 AND source = 'advancement'`,
      [fx.tId]
    );
    assert.equal(asgRes.rows.length, 2);
    const assignedTeamIds = asgRes.rows.map((r) => r.tournament_team_id);
    assert.ok(assignedTeamIds.includes(fx.teamIds[0]));
    assert.ok(assignedTeamIds.includes(fx.teamIds[2]));

    // Verify progression derivations: Teams 1 & 3 qualified; Teams 2 & 4 eliminated
    const progMap = new Map((advResult.team_progression || []).map((p) => [p.team_id, p.status]));
    assert.equal(progMap.get(fx.teamIds[0]), 'qualified');
    assert.equal(progMap.get(fx.teamIds[2]), 'qualified');
    assert.equal(progMap.get(fx.teamIds[1]), 'eliminated');
    assert.equal(progMap.get(fx.teamIds[3]), 'eliminated');
  });
});

// ── REAL-DB TEST 2: overall advancement ──
test('PHASE 4A REAL-DB TEST: overall advancement seeds teams by source points across target districts', async (t) => {
  if (!TEST_URL) {
    t.skip('Skipping live PostgreSQL test: PGTEST_URL environment variable is not set.');
    return;
  }

  await withPgTransaction(async (client) => {
    const fx = await createLiveFixture(client, { r1AdvType: 'overall', r2Districts: 2 });

    // Seed overall standings: Team 1 (30 pts), Team 3 (20 pts), Team 2 (10 pts), Team 4 (5 pts)
    await client.query(`
      INSERT INTO tournament_match_results (id, tournament_id, match_id, team_id, placement, kills, kill_points, placement_points, total_points, status)
      VALUES
        ($1, $2, $3, $4, 1, 15, 15, 15, 30, 'verified'),
        ($5, $2, $3, $6, 3, 5, 5, 5, 10, 'verified'),
        ($7, $2, $8, $9, 2, 10, 10, 10, 20, 'verified'),
        ($10, $2, $8, $11, 4, 3, 3, 2, 5, 'verified')
    `, [
      `MR-${Date.now()}-1`, fx.tId, fx.m1AId, fx.teamIds[0],
      `MR-${Date.now()}-2`, fx.tId, fx.m1AId, fx.teamIds[1],
      `MR-${Date.now()}-3`, fx.tId, fx.m1BId, fx.teamIds[2],
      `MR-${Date.now()}-4`, fx.tId, fx.m1BId, fx.teamIds[3],
    ]);

    // Advance top 2 overall (Team 1 with 30 pts and Team 3 with 20 pts)
    const advResult = await advanceTeamsManually(client, {
      tournamentId: fx.tId,
      sourceRoundId: fx.r1Id,
      targetRoundId: fx.r2Id,
      teamIds: [fx.teamIds[0], fx.teamIds[2]],
      actorId: fx.orgId,
    });

    assert.equal(advResult.success, true);
    assert.equal(advResult.advancedCount, 2);

    // Verify snake seeding in DB: Team 1 (seed 1) -> District 1; Team 3 (seed 2) -> District 2
    const asgRes = await client.query(
      `SELECT tournament_team_id, group_id FROM tournament_match_assignments WHERE tournament_id = $1 AND source = 'advancement'`,
      [fx.tId]
    );
    const districtByTeam = new Map(asgRes.rows.map((r) => [r.tournament_team_id, r.group_id]));
    assert.equal(districtByTeam.get(fx.teamIds[0]), fx.r2GroupIds[0]);
    assert.equal(districtByTeam.get(fx.teamIds[2]), fx.r2GroupIds[1]);
  });
});

// ── REAL-DB TEST 3: manual advancement ──
test('PHASE 4A REAL-DB TEST: manual placement map explicitly assigns teams to organizer-chosen districts', async (t) => {
  if (!TEST_URL) {
    t.skip('Skipping live PostgreSQL test: PGTEST_URL environment variable is not set.');
    return;
  }

  await withPgTransaction(async (client) => {
    const fx = await createLiveFixture(client, { r2Districts: 2 });

    // Explicit manual placement: place Team 1 in District 2 and Team 3 in District 1 (inverting default snake)
    const manualPlacement = {
      [fx.teamIds[0]]: fx.r2GroupIds[1],
      [fx.teamIds[2]]: fx.r2GroupIds[0],
    };

    const advResult = await advanceTeamsManually(client, {
      tournamentId: fx.tId,
      sourceRoundId: fx.r1Id,
      targetRoundId: fx.r2Id,
      teamIds: [fx.teamIds[0], fx.teamIds[2]],
      manual_placement: manualPlacement,
      allow_unverified: true,
      actorId: fx.orgId,
    });

    assert.equal(advResult.success, true);
    assert.equal(advResult.advancedCount, 2);

    const asgRes = await client.query(
      `SELECT tournament_team_id, group_id FROM tournament_match_assignments WHERE tournament_id = $1 AND source = 'advancement'`,
      [fx.tId]
    );
    const districtByTeam = new Map(asgRes.rows.map((r) => [r.tournament_team_id, r.group_id]));
    assert.equal(districtByTeam.get(fx.teamIds[0]), fx.r2GroupIds[1]);
    assert.equal(districtByTeam.get(fx.teamIds[2]), fx.r2GroupIds[0]);
  });
});

// ── REAL-DB TEST 4: two simultaneous advance requests (concurrency) ──
test('PHASE 4A REAL-DB TEST: two simultaneous advance requests serialize via row lock without duplicate assignments', async (t) => {
  if (!TEST_URL) {
    t.skip('Skipping live PostgreSQL test: PGTEST_URL environment variable is not set.');
    return;
  }

  const pool = new pg.Pool({
    connectionString: TEST_URL,
    ssl: TEST_URL.includes('localhost') ? false : { rejectUnauthorized: false },
    max: 5,
  });

  const setupClient = await pool.connect();
  let fx = null;
  try {
    // Setup fixture outside transaction so both concurrent connections can see it
    fx = await createLiveFixture(setupClient, { r2Districts: 2 });
  } finally {
    setupClient.release();
  }

  const client1 = await pool.connect();
  const client2 = await pool.connect();

  try {
    // Two simultaneous callers advance teams to Round 2
    // Client 1 advances Teams 1 & 2; Client 2 advances Teams 1, 2, 3
    const run1 = advanceTeamsManually(client1, {
      tournamentId: fx.tId,
      sourceRoundId: fx.r1Id,
      targetRoundId: fx.r2Id,
      teamIds: [fx.teamIds[0], fx.teamIds[1]],
      allow_unverified: true,
      actorId: fx.orgId,
    });

    const run2 = advanceTeamsManually(client2, {
      tournamentId: fx.tId,
      sourceRoundId: fx.r1Id,
      targetRoundId: fx.r2Id,
      teamIds: [fx.teamIds[0], fx.teamIds[1], fx.teamIds[2]],
      allow_unverified: true,
      actorId: fx.orgId,
    });

    const results = await Promise.allSettled([run1, run2]);
    assert.ok(results.every((r) => r.status === 'fulfilled'));

    // Check assignments in target round: row lock ensures serialized re-runs cleanly replaced
    // earlier assignments, leaving no duplicate rows (count is either 2 or 3, never 5)
    const asgRes = await pool.query(
      `SELECT tournament_team_id, match_id, source FROM tournament_match_assignments WHERE tournament_id = $1 AND source = 'advancement'`,
      [fx.tId]
    );
    assert.ok(asgRes.rows.length === 2 || asgRes.rows.length === 3);

    // No team has multiple assignments for the same match
    const matchTeamKeys = asgRes.rows.map((r) => `${r.tournament_team_id}-${r.match_id}`);
    const uniqueKeys = new Set(matchTeamKeys);
    assert.equal(uniqueKeys.size, matchTeamKeys.length);
  } finally {
    // Clean up created tournament fixture
    await pool.query('DELETE FROM tournaments WHERE id = $1', [fx.tId]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id = $1', [fx.orgId]).catch(() => {});
    client1.release();
    client2.release();
    await pool.end().catch(() => {});
  }
});

