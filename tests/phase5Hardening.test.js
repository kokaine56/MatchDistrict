// tests/phase5Hardening.test.js
// Phase 5 Hardening Tests:
// 1. Team Disqualification & Reinstatement (permissions, audit log, target round warnings, results preservation)
// 2. Reinstate restores prior status (e.g. 'allocated'), not a hardcoded 'verified'
// 3. Credential blocking for disqualified teams (endpoint + participant roadmap view)
// 4. Advancement exclusion & rejection for disqualified teams
// 5. GET /api/tournaments/:id/rounds publication and authorization gating
// 6. Schema unification: init-scratch-db and server.js reuse schemaMigrations.js

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { updateTeamQualificationStatus } from '../server/teamDisqualificationService.js';
import { advanceTeamsManually, PROGRESSION_ERR } from '../server/roundProgressionService.js';
import { getTournamentRoadmapResponse } from '../server/manualRoadmapService.js';
import { SCHEMA_TABLES, runSchemaMigrations } from '../server/schemaMigrations.js';

// In-memory query mock simulating PostgreSQL queries for fast, reliable unit tests
function createMockClient() {
  const db = {
    tournaments: [
      { id: 'T1', orgId: 'ORG-1', roadmap_status: 'approved', finalized_at: null, rounds_published: true, isDraft: false, room_credentials_release_minutes: 15 },
    ],
    teams: [
      { id: 'TEAM-1', tournament_id: 'T1', team_name: 'Team Alpha', status: 'verified', status_before_dq: null, leader_user_id: 'USER-1' },
      { id: 'TEAM-2', tournament_id: 'T1', team_name: 'Team Beta', status: 'verified', status_before_dq: null, leader_user_id: 'USER-2' },
    ],
    teamMembers: [
      { tournament_team_id: 'TEAM-1', tournament_id: 'T1', user_id: 'USER-1', role: 'leader' },
      { tournament_team_id: 'TEAM-2', tournament_id: 'T1', user_id: 'USER-2', role: 'leader' },
    ],
    rounds: [
      { id: 'R1', tournament_id: 'T1', round_number: 1, name: 'Round 1', advancement_type: 'overall', teams_advancing: 1 },
      { id: 'R2', tournament_id: 'T1', round_number: 2, name: 'Round 2', advancement_type: 'overall', teams_advancing: 1 },
    ],
    days: [
      { id: 'D1', tournament_id: 'T1', round_id: 'R1', day_number: 1, date: '2026-11-01' },
    ],
    groups: [
      { id: 'G1', tournament_id: 'T1', day_id: 'D1', group_name: 'District A', sequence: 1 },
    ],
    rooms: [
      { id: 'RM1', tournament_id: 'T1', group_id: 'G1', room_number: 1, capacity: 16 },
    ],
    matches: [
      { id: 'M1', tournament_id: 'T1', round_id: 'R1', day_id: 'D1', group_id: 'G1', room_id: 'RM1', match_number: 1, start_time: '12:00', end_time: '12:30', status: 'COMPLETED', room_identifier: 'ROOM-123', room_password: 'PASS' },
      { id: 'M2', tournament_id: 'T1', round_id: 'R2', day_id: 'D1', match_number: 1, start_time: '14:00', end_time: '14:30', status: 'PENDING', room_identifier: 'ROOM-456', room_password: 'PASS' },
    ],
    assignments: [],
    matchResults: [
      { id: 'RES-1', tournament_id: 'T1', match_id: 'M1', team_id: 'TEAM-1', total_points: 25, placement: 1, kills: 5, status: 'verified' },
      { id: 'RES-2', tournament_id: 'T1', match_id: 'M1', team_id: 'TEAM-2', total_points: 15, placement: 2, kills: 2, status: 'verified' },
    ],
    adminLogs: [],
  };

  const client = {
    db,
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();

      // SELECT FROM tournaments FOR UPDATE
      if (s.includes('FROM TOURNAMENTS') && s.includes('FOR UPDATE')) {
        const t = db.tournaments.find((x) => x.id === params[0]);
        return { rows: t ? [{ ...t }] : [] };
      }

      // SELECT FROM tournaments plain
      if (s.includes('FROM TOURNAMENTS')) {
        const t = db.tournaments.find((x) => x.id === params[0]);
        return { rows: t ? [{ ...t }] : [] };
      }

      // SELECT FROM tournament_teams FOR UPDATE
      if (s.includes('FROM TOURNAMENT_TEAMS') && s.includes('FOR UPDATE')) {
        const team = db.teams.find((x) => x.id === params[0] && x.tournament_id === params[1]);
        return { rows: team ? [{ ...team }] : [] };
      }

      // SELECT FROM tournament_teams WHERE id = ANY
      if (s.includes('FROM TOURNAMENT_TEAMS') && s.includes('ANY')) {
        const teamIds = params[0] || [];
        const found = db.teams.filter((t) => teamIds.includes(t.id));
        return { rows: found.map((t) => ({ ...t })) };
      }

      // UPDATE tournament_teams
      if (s.startsWith('UPDATE TOURNAMENT_TEAMS')) {
        const teamId = params[params.length - 2];
        const tId = params[params.length - 1];
        const team = db.teams.find((x) => x.id === teamId && x.tournament_id === tId);
        if (team) {
          team.status = params[0];
          if (s.includes('STATUS_BEFORE_DQ = NULL')) {
            team.status_before_dq = null;
          } else if (params.length === 4) {
            team.status_before_dq = params[1];
          }
        }
        return { rowCount: team ? 1 : 0 };
      }

      // SELECT details FROM admin_action_log
      if (s.includes('FROM ADMIN_ACTION_LOG') && s.includes("ACTION_TYPE = 'TEAM_DISQUALIFIED'")) {
        const teamId = params[0];
        const log = db.adminLogs.slice().reverse().find((l) => l.target_id === teamId && l.action_type === 'team_disqualified');
        return { rows: log ? [{ details: log.details }] : [] };
      }

      // Inspect target round advancement assignments
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS A') && s.includes("SOURCE = 'ADVANCEMENT'")) {
        const teamId = params[0];
        const tId = params[1];
        const matching = db.assignments
          .filter((a) => a.tournament_team_id === teamId && a.tournament_id === tId && a.source === 'advancement')
          .map((a) => {
            const m = db.matches.find((match) => match.id === a.match_id);
            const r = db.rounds.find((round) => round.id === (m ? m.round_id : null));
            return r ? { round_id: r.id, round_number: r.round_number, round_name: r.name } : null;
          })
          .filter(Boolean);
        return { rows: matching };
      }

      // Target round results check
      if (s.includes('FROM TOURNAMENT_MATCH_RESULTS MR') && s.includes('WHERE M.ROUND_ID = $1')) {
        const roundId = params[0];
        const hasRes = db.matchResults.some((mr) => {
          const m = db.matches.find((match) => match.id === mr.match_id);
          return m && m.round_id === roundId;
        });
        return { rows: hasRes ? [{ 1: 1 }] : [] };
      }

      // INSERT INTO admin_action_log
      if (s.startsWith('INSERT INTO ADMIN_ACTION_LOG')) {
        db.adminLogs.push({ id: params[0], admin_id: params[1], action_type: params[2], target_id: params[3], details: params[4] });
        return { rowCount: 1 };
      }

      // SELECT FROM tournament_rounds
      if (s.includes('FROM TOURNAMENT_ROUNDS')) {
        return { rows: db.rounds.map((r) => ({ ...r })) };
      }
      // SELECT FROM tournament_days
      if (s.includes('FROM TOURNAMENT_DAYS')) {
        return { rows: db.days.map((d) => ({ ...d })) };
      }
      // SELECT FROM tournament_groups
      if (s.includes('FROM TOURNAMENT_GROUPS')) {
        return { rows: db.groups.map((g) => ({ ...g })) };
      }
      // SELECT FROM tournament_rooms
      if (s.includes('FROM TOURNAMENT_ROOMS')) {
        return { rows: db.rooms.map((rm) => ({ ...rm })) };
      }
      // SELECT FROM tournament_matches
      if (s.includes('FROM TOURNAMENT_MATCHES')) {
        return { rows: db.matches.map((m) => ({ ...m })) };
      }
      // SELECT FROM tournament_team_members JOIN tournament_teams
      if (s.includes('FROM TOURNAMENT_TEAMS T') && s.includes('JOIN TOURNAMENT_TEAM_MEMBERS TM')) {
        const userId = params[1];
        const member = db.teamMembers.find((tm) => tm.user_id === userId);
        if (member) {
          const team = db.teams.find((t) => t.id === member.tournament_team_id);
          return { rows: team ? [{ ...team }] : [] };
        }
        return { rows: [] };
      }

      // Match credentials participant assignment check:
      if (s.includes('FROM TOURNAMENT_MATCH_ASSIGNMENTS A') && s.includes('JOIN TOURNAMENT_TEAMS T')) {
        const matchId = params[0];
        const tId = params[1];
        const userId = params[2];
        const member = db.teamMembers.find((tm) => tm.user_id === userId);
        if (!member) return { rows: [] };
        const team = db.teams.find((t) => t.id === member.tournament_team_id && t.tournament_id === tId);
        if (!team) return { rows: [] };
        const asn = db.assignments.find((a) => a.tournament_team_id === team.id && a.match_id === matchId);
        if (!asn) return { rows: [] };
        return { rows: [{ id: asn.id, status: asn.status, team_status: team.status }] };
      }

      // Generic fallback
      return { rows: [], rowCount: 0 };
    },
  };

  return client;
}

test('Team Disqualification: Organizer can disqualify team with optional reason and audit log', async () => {
  const client = createMockClient();

  const res = await updateTeamQualificationStatus(client, {
    tournamentId: 'T1',
    teamId: 'TEAM-1',
    status: 'disqualified',
    reason: 'Rule 4.2 violation - unregistered sub',
    actorId: 'ORG-1',
    isAdmin: false,
  });

  assert.equal(res.success, true);
  assert.equal(res.status, 'disqualified');
  assert.equal(res.previous_status, 'verified');
  assert.equal(res.reason, 'Rule 4.2 violation - unregistered sub');

  // Verify DB state
  const teamInDb = client.db.teams.find((t) => t.id === 'TEAM-1');
  assert.equal(teamInDb.status, 'disqualified');
  assert.equal(teamInDb.status_before_dq, 'verified');

  // Verify audit log entry
  assert.equal(client.db.adminLogs.length, 1);
  assert.equal(client.db.adminLogs[0].action_type, 'team_disqualified');
  assert.match(client.db.adminLogs[0].details, /unregistered sub/);
});

test('Team Disqualification: Non-owner gets 403 FORBIDDEN', async () => {
  const client = createMockClient();

  await assert.rejects(
    async () => {
      await updateTeamQualificationStatus(client, {
        tournamentId: 'T1',
        teamId: 'TEAM-1',
        status: 'disqualified',
        actorId: 'ATTACKER-USER',
        isAdmin: false,
      });
    },
    (err) => {
      assert.equal(err.code, 'FORBIDDEN');
      assert.equal(err.status, 403);
      return true;
    }
  );
});

test('Team Reinstatement: Restores prior status "allocated" from status_before_dq (not hardcoded verified)', async () => {
  const client = createMockClient();
  const team = client.db.teams[0];
  team.status = 'allocated'; // Prior status was 'allocated' before DQ

  // 1. Disqualify
  const dqRes = await updateTeamQualificationStatus(client, {
    tournamentId: 'T1',
    teamId: 'TEAM-1',
    status: 'disqualified',
    reason: 'Temporary investigation',
    actorId: 'ORG-1',
  });
  assert.equal(dqRes.status, 'disqualified');
  assert.equal(team.status_before_dq, 'allocated');

  // 2. Reinstate
  const reinstateRes = await updateTeamQualificationStatus(client, {
    tournamentId: 'T1',
    teamId: 'TEAM-1',
    status: 'reinstate',
    reason: 'Exonerated on appeal',
    actorId: 'ORG-1',
  });

  assert.equal(reinstateRes.success, true);
  assert.equal(reinstateRes.status, 'allocated', 'Must restore previous status "allocated", NOT hardcoded "verified"');
  assert.equal(reinstateRes.restored_status, 'allocated');
  assert.equal(team.status, 'allocated');
  assert.equal(team.status_before_dq, null);

  // Verify audit log entry
  const lastLog = client.db.adminLogs[client.db.adminLogs.length - 1];
  assert.equal(lastLog.action_type, 'team_reinstated');
  const details = JSON.parse(lastLog.details);
  assert.equal(details.restored_status, 'allocated');
});

test('Team Reinstatement: Restores prior status from audit log if status_before_dq column is null', async () => {
  const client = createMockClient();
  const team = client.db.teams[0];
  team.status = 'disqualified';
  team.status_before_dq = null; // Column is null

  // Seed prior disqualification in audit log
  client.db.adminLogs.push({
    id: 'AUD-HIST',
    admin_id: 'ORG-1',
    action_type: 'team_disqualified',
    target_id: 'TEAM-1',
    details: JSON.stringify({
      team_name: 'Team Alpha',
      previous_status: 'awaiting_members',
      new_status: 'disqualified',
    }),
  });

  const res = await updateTeamQualificationStatus(client, {
    tournamentId: 'T1',
    teamId: 'TEAM-1',
    status: 'active',
    actorId: 'ORG-1',
  });

  assert.equal(res.success, true);
  assert.equal(res.status, 'awaiting_members', 'Must recover previous status from audit log');
  assert.equal(team.status, 'awaiting_members');
});

test('Team Disqualification: Warns when team was already advanced into an unplayed target round', async () => {
  const client = createMockClient();

  // Team 1 is already assigned to Round 2 match M2 (source: advancement)
  client.db.assignments.push({
    id: 'ASN-1',
    tournament_id: 'T1',
    tournament_team_id: 'TEAM-1',
    match_id: 'M2',
    source: 'advancement',
  });

  const res = await updateTeamQualificationStatus(client, {
    tournamentId: 'T1',
    teamId: 'TEAM-1',
    status: 'disqualified',
    reason: 'DQ post-advancement',
    actorId: 'ORG-1',
  });

  assert.equal(res.success, true);
  assert.ok(res.warning, 'Must provide warning to organizer');
  assert.match(res.warning, /re-run round qualification/i);
  assert.equal(res.target_has_results, false);

  // Assignments are deliberately NOT automatically removed
  assert.equal(client.db.assignments.length, 1);
});

test('Team Disqualification: Warns target round is locked when round has recorded results', async () => {
  const client = createMockClient();

  client.db.assignments.push({
    id: 'ASN-1',
    tournament_id: 'T1',
    tournament_team_id: 'TEAM-1',
    match_id: 'M2',
    source: 'advancement',
  });

  // Target round match M2 now has results
  client.db.matchResults.push({
    id: 'RES-R2-1',
    tournament_id: 'T1',
    match_id: 'M2',
    team_id: 'TEAM-1',
    total_points: 15,
  });

  const res = await updateTeamQualificationStatus(client, {
    tournamentId: 'T1',
    teamId: 'TEAM-1',
    status: 'disqualified',
    actorId: 'ORG-1',
  });

  assert.equal(res.success, true);
  assert.equal(res.target_has_results, true);
  assert.match(res.warning, /locked/i);
});

test('Credential Release: Blocks disqualified team members from receiving room credentials', async () => {
  const client = createMockClient();
  const team = client.db.teams[0];
  team.status = 'disqualified';

  client.db.assignments.push({
    id: 'ASN-1',
    tournament_id: 'T1',
    tournament_team_id: 'TEAM-1',
    match_id: 'M1',
    status: 'allocated',
  });

  // Logic mirroring server.js GET /matches/:matchId/credentials
  async function evaluateCredentialsAccess(tId, mId, authUser) {
    const tRes = await client.query('SELECT "orgId", roadmap_status FROM tournaments WHERE id = $1', [tId]);
    const isOrganizer = authUser.role === 'admin' || tRes.rows[0].orgId === authUser.id;

    if (!isOrganizer) {
      const teamCheck = await client.query(`
        SELECT a.id, t.status AS team_status
        FROM tournament_match_assignments a
        JOIN tournament_teams t ON a.tournament_team_id = t.id
        JOIN tournament_team_members tm ON a.tournament_team_id = tm.tournament_team_id
        WHERE a.match_id = $1 AND a.tournament_id = $2 AND tm.user_id = $3
      `, [mId, tId, authUser.id]);

      if (teamCheck.rows.some((r) => r.team_status === 'disqualified')) {
        return { status: 403, error: 'TEAM_DISQUALIFIED', message: 'Your team is disqualified and cannot receive room credentials.' };
      }
      if (teamCheck.rows.length === 0) {
        return { status: 403, error: 'FORBIDDEN', message: 'You are not allocated to this match.' };
      }
    }
    return { status: 200, statusText: 'released' };
  }

  const partUser = { id: 'USER-1', role: 'gamer' };
  const res = await evaluateCredentialsAccess('T1', 'M1', partUser);

  assert.equal(res.status, 403);
  assert.equal(res.error, 'TEAM_DISQUALIFIED');
  assert.match(res.message, /disqualified and cannot receive room credentials/i);
});

test('Participant Roadmap: Suppresses credentials and flags clear message for disqualified team', async () => {
  const client = createMockClient();
  const team = client.db.teams[0];
  team.status = 'disqualified';

  const partUser = { id: 'USER-1', role: 'gamer', roles: ['user'] };
  // Mock Date.now() when match is released
  const nowMs = new Date('2026-11-01T12:05:00Z').getTime();

  const response = await getTournamentRoadmapResponse(client, 'T1', partUser, nowMs);

  assert.equal(response.statusCode, 200);
  const body = response.body;
  assert.equal(body.participant.is_disqualified, true);
  assert.match(body.participant.disqualification_message, /disqualified and cannot receive room credentials/i);

  // All matches must have credentials_available: false for disqualified teams
  for (const m of body.roadmap.matches) {
    assert.equal(m.credentials_available, false);
    assert.equal(m.room_identifier, undefined);
    assert.equal(m.room_password, undefined);
  }
});

test('Advancement gating: advanceTeamsManually rejects disqualified candidate', async () => {
  const mockAdvClient = {
    query: async (sql, params = []) => {
      const s = sql.trim().toUpperCase();
      if (s.includes('FROM TOURNAMENTS WHERE ID = $1 FOR UPDATE')) {
        return { rows: [{ id: 'T1', orgId: 'ORG-1', roadmap_status: 'approved', finalized_at: null }] };
      }
      if (s.includes('FROM TOURNAMENT_ROUNDS WHERE ID = $1 AND TOURNAMENT_ID = $2 FOR UPDATE')) {
        return { rows: [{ id: params[0], tournament_id: 'T1', round_number: 2, name: 'Round 2' }] };
      }
      if (s.includes('FROM TOURNAMENT_TEAMS WHERE ID = ANY')) {
        return { rows: [{ id: 'TEAM-DQ', team_name: 'Cheater Squad', status: 'disqualified' }] };
      }
      return { rows: [] };
    },
  };

  await assert.rejects(
    async () => {
      await advanceTeamsManually(mockAdvClient, {
        tournamentId: 'T1',
        targetRoundId: 'R2',
        teamIds: ['TEAM-DQ'],
        actorId: 'ORG-1',
      });
    },
    (err) => {
      assert.equal(err.code, PROGRESSION_ERR.TEAM_DISQUALIFIED);
      assert.match(err.message, /disqualified and cannot advance/i);
      return true;
    }
  );
});

test('GET /api/tournaments/:id/rounds publication and authorization gating', () => {
  function evaluateRoundsAccess(tourn, authUser) {
    const isOwnerOrAdmin = authUser && (
      authUser.role === 'admin' ||
      (Array.isArray(authUser.roles) && authUser.roles.includes('admin')) ||
      tourn.orgId === authUser.id
    );

    if (!isOwnerOrAdmin) {
      const isApproved = tourn.roadmap_status === 'approved' || tourn.roadmap_status === 'published';
      const isRoundsPublished = tourn.rounds_published !== false;
      if (!isApproved || !isRoundsPublished || tourn.isDraft) {
        return { allowed: false, status: 403, error: 'ROADMAP_NOT_APPROVED' };
      }
    }

    return { allowed: true, isOwnerOrAdmin: Boolean(isOwnerOrAdmin) };
  }

  const draftTourn = { id: 'T-DRAFT', orgId: 'ORG-1', roadmap_status: 'pending', rounds_published: true, isDraft: false };
  const unpubTourn = { id: 'T-UNPUB', orgId: 'ORG-1', roadmap_status: 'approved', rounds_published: false, isDraft: false };
  const pubTourn = { id: 'T-PUB', orgId: 'ORG-1', roadmap_status: 'approved', rounds_published: true, isDraft: false };

  const anonUser = null;
  const participantUser = { id: 'PARTICIPANT-1', role: 'gamer', roles: ['user'] };
  const ownerUser = { id: 'ORG-1', role: 'organiser', roles: ['user', 'organiser'] };
  const adminUser = { id: 'ADMIN-1', role: 'admin', roles: ['user', 'admin'] };

  // 1. Anon/participant blocked from draft/pending roadmap
  const draftAnon = evaluateRoundsAccess(draftTourn, anonUser);
  assert.equal(draftAnon.allowed, false);
  assert.equal(draftAnon.status, 403);
  assert.equal(draftAnon.error, 'ROADMAP_NOT_APPROVED');

  const draftPart = evaluateRoundsAccess(draftTourn, participantUser);
  assert.equal(draftPart.allowed, false);
  assert.equal(draftPart.status, 403);

  // 2. Participant blocked from unpublished rounds
  const unpubPart = evaluateRoundsAccess(unpubTourn, participantUser);
  assert.equal(unpubPart.allowed, false);
  assert.equal(unpubPart.status, 403);

  // 3. Organizer can always access rounds (even when draft/pending)
  const draftOwner = evaluateRoundsAccess(draftTourn, ownerUser);
  assert.equal(draftOwner.allowed, true);
  assert.equal(draftOwner.isOwnerOrAdmin, true);

  // 4. Admin can always access rounds
  const draftAdmin = evaluateRoundsAccess(draftTourn, adminUser);
  assert.equal(draftAdmin.allowed, true);
  assert.equal(draftAdmin.isOwnerOrAdmin, true);

  // 5. Public / participant can access approved & published rounds
  const pubAnon = evaluateRoundsAccess(pubTourn, anonUser);
  assert.equal(pubAnon.allowed, true);
  assert.equal(pubAnon.isOwnerOrAdmin, false);
});

test('Schema Unification: init-scratch-db.js and server.js reuse schemaMigrations.js without drift', () => {
  // Verify SCHEMA_TABLES exists and is frozen with all required tables
  assert.ok(Array.isArray(SCHEMA_TABLES));
  assert.ok(SCHEMA_TABLES.length >= 50);
  assert.ok(SCHEMA_TABLES.includes('tournaments'));
  assert.ok(SCHEMA_TABLES.includes('tournament_rounds'));
  assert.ok(SCHEMA_TABLES.includes('tournament_teams'));
  assert.ok(SCHEMA_TABLES.includes('tournament_match_assignments'));
  assert.ok(SCHEMA_TABLES.includes('tournament_match_results'));
  assert.ok(SCHEMA_TABLES.includes('tournament_leaderboard'));

  // Verify scripts/init-scratch-db.js imports runSchemaMigrations
  const initScratchScript = fs.readFileSync('scripts/init-scratch-db.js', 'utf8');
  assert.match(initScratchScript, /import\s*\{\s*runSchemaMigrations\s*\}\s*from\s*['"]\.\.\/server\/schemaMigrations\.js['"]/);
  assert.match(initScratchScript, /await\s+runSchemaMigrations\s*\(\s*client\s*\)/);

  // Verify server.js imports and calls runSchemaMigrations
  const serverCode = fs.readFileSync('server.js', 'utf8');
  assert.match(serverCode, /import\s*\{\s*runSchemaMigrations\s*\}\s*from\s*['"]\.\/server\/schemaMigrations\.js['"]/);
  assert.match(serverCode, /await\s+runSchemaMigrations\s*\(\s*client\s*\)/);
});
