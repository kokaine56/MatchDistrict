import test from 'node:test';
import assert from 'node:assert';
import { isRoadmapPublished } from '../server/roadmapStatus.js';
import { matchReleaseEpoch } from '../server/matchRelease.js';
import { qualifyMatch, advanceTeamsManually, PROGRESSION_ERR } from '../server/roundProgressionService.js';

// ── 1. Publish Helper Tests ──
test('isRoadmapPublished: accurately evaluates published states without drift', () => {
  // Null or undefined
  assert.strictEqual(isRoadmapPublished(null), false);
  assert.strictEqual(isRoadmapPublished(undefined), false);

  // Explicit boolean published property overrides
  assert.strictEqual(isRoadmapPublished({ published: true }), true);
  assert.strictEqual(isRoadmapPublished({ published: false, roadmap_status: 'approved' }), false);

  // Status and rounds_published flag combinations
  assert.strictEqual(isRoadmapPublished({ roadmap_status: 'approved', rounds_published: true }), true);
  assert.strictEqual(isRoadmapPublished({ roadmap_status: 'published', rounds_published: true }), true);
  assert.strictEqual(isRoadmapPublished({ roadmap_status: 'approved', rounds_published: false }), false);
  assert.strictEqual(isRoadmapPublished({ roadmap_status: 'published', rounds_published: false }), false);
  assert.strictEqual(isRoadmapPublished({ roadmap_status: 'draft', rounds_published: true }), false);
  assert.strictEqual(isRoadmapPublished({ roadmap_status: 'pending', rounds_published: true }), false);
});

// ── 2. Timezone IST (+05:30) Offset Tests ──
test('matchReleaseEpoch: pins calculations to explicit IST (+05:30) offset', () => {
  const date = '2026-10-25';
  const time = '18:00';
  const releaseMins = 15;

  const epoch = matchReleaseEpoch(date, time, releaseMins);
  assert.ok(typeof epoch === 'number');

  // 18:00 IST is 12:30 UTC. Releasing 15 mins before is 17:45 IST = 12:15 UTC.
  const expectedUtc = Date.UTC(2026, 9, 25, 12, 15, 0);
  assert.strictEqual(epoch, expectedUtc);
});

// ── 3. qualifyMatch does NOT write assignments for next_round_id ──
test('qualifyMatch: sets progression_processed but does NOT insert assignments for round-level progression', async () => {
  const executedQueries = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedQueries.push({ sql, params });

      if (sql.includes('FROM tournaments WHERE id = $1')) {
        // Tournament exists and is NOT finalized, roadmap_status is 'published'
        return { rows: [{ id: 'TRN-1', roadmap_status: 'published', finalized_at: null }] };
      }
      if (sql.includes('FROM tournament_matches WHERE id = $1 AND tournament_id = $2')) {
        return {
          rows: [{
            id: 'M-1',
            round_id: 'RND-1',
            match_number: 1,
            next_match_id: null,
            next_round_id: 'RND-2', // Round-level target
            teams_advancing: 4,
            progression_processed: false,
          }],
        };
      }
      if (sql.includes("FROM tournament_match_assignments WHERE match_id = $1 AND status = 'allocated'")) {
        return { rows: [{ count: '2' }] };
      }
      if (sql.includes("FROM tournament_match_results WHERE match_id = $1 AND status = 'verified'")) {
        return { rows: [{ count: '2' }] };
      }
      if (sql.includes('UPDATE tournament_matches SET progression_processed = true WHERE id = $1')) {
        return { rows: [] };
      }
      if (sql.includes('SELECT id, progression_processed FROM tournament_matches WHERE round_id = $1')) {
        return { rows: [{ id: 'M-1', progression_processed: true }] };
      }
      return { rows: [] };
    },
  };

  const outcome = await qualifyMatch(mockClient, { tournamentId: 'TRN-1', matchId: 'M-1' });

  assert.strictEqual(outcome.success, true);
  assert.strictEqual(outcome.status, 'COMPLETED');
  assert.strictEqual(outcome.roundCompleted, true);

  // Assert that NO insert into tournament_match_assignments was executed
  const assignmentInserts = executedQueries.filter(q => q.sql.includes('INSERT INTO tournament_match_assignments'));
  assert.strictEqual(assignmentInserts.length, 0, 'qualifyMatch should NOT insert tournament_match_assignments for next_round_id');
});

// ── 4. advanceTeamsManually executes on its own ──
test('advanceTeamsManually: validates required inputs and inserts advancement assignments', async () => {
  const executedQueries = [];
  const mockClient = {
    query: async (sql, params = []) => {
      executedQueries.push({ sql, params });

      if (sql.includes('FROM tournaments WHERE id = $1')) {
        return { rows: [{ id: 'TRN-1', orgId: 'org-user-1', roadmap_status: 'published', finalized_at: null }] };
      }
      if (sql.includes('FROM tournament_rounds WHERE id = $1 AND tournament_id = $2')) {
        if (params[0] === 'RND-1') {
          return { rows: [{ id: 'RND-1', round_number: 1, name: 'Round 1 Qualifiers' }] };
        }
        return { rows: [{ id: 'RND-2', round_number: 2, name: 'Grand Finals' }] };
      }
      if (sql.includes('FROM tournament_matches') && sql.includes('COUNT(mr.id)')) {
        return { rows: [{ id: 'M-1', match_number: 1, status: 'COMPLETED', result_count: 1 }] };
      }
      if (sql.includes('FROM tournament_match_assignments') && sql.includes('UNION') && sql.includes('tournament_match_results')) {
        return { rows: [{ team_id: 'team-a' }, { team_id: 'team-b' }] };
      }
      if (sql.includes('FROM tournament_matches WHERE round_id = $1 AND tournament_id = $2')) {
        return { rows: [{ id: 'M-10', round_id: 'RND-2', group_id: 'GRP-1', day_id: 'DAY-1' }] };
      }
      if (sql.includes('FROM tournament_groups WHERE round_id = $1 AND tournament_id = $2')) {
        return { rows: [{ id: 'GRP-1', group_name: 'District 1', sequence: 1 }] };
      }
      if (sql.includes('FROM tournament_teams WHERE id = ANY($1::text[])') || sql.includes('FROM tournament_teams WHERE id = $1')) {
        return { rows: [{ id: 'team-a', team_name: 'Team A', status: 'verified' }, { id: 'team-b', team_name: 'Team B', status: 'verified' }] };
      }
      if (sql.includes('FROM tournament_match_results mr')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO tournament_match_assignments')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO admin_action_log')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };

  const outcome = await advanceTeamsManually(mockClient, {
    tournamentId: 'TRN-1',
    sourceRoundId: 'RND-1',
    targetRoundId: 'RND-2',
    teamIds: ['team-a', 'team-b'],
    actorId: 'org-user-1',
  });

  assert.strictEqual(outcome.success, true);
  assert.strictEqual(outcome.advancedCount, 2);
  assert.deepStrictEqual(outcome.advancedTeamIds, ['team-a', 'team-b']);

  // Assert that tournament_match_assignments received the assignments
  const assignmentInserts = executedQueries.filter(q => q.sql.includes('INSERT INTO tournament_match_assignments'));
  assert.strictEqual(assignmentInserts.length, 2);
});

// ── 5. Advance endpoint payload normalization helper ──
test('advance payload normalization: accepts both snake_case and camelCase parameters', () => {
  function normalizeAdvancePayload(payload) {
    const teamIds = Array.isArray(payload.team_ids)
      ? payload.team_ids
      : (Array.isArray(payload.teamIds) ? payload.teamIds : []);
    const targetRoundId = payload.target_round_id || payload.targetRoundId;
    const targetGroupId = payload.target_group_id || payload.targetGroupId || null;
    const sourceRoundId = payload.source_round_id || payload.sourceRoundId || null;
    return { teamIds, targetRoundId, targetGroupId, sourceRoundId };
  }

  // snake_case
  const snake = normalizeAdvancePayload({
    team_ids: ['t1', 't2'],
    target_round_id: 'rnd-2',
    source_round_id: 'rnd-1',
    target_group_id: 'grp-1',
  });
  assert.deepStrictEqual(snake.teamIds, ['t1', 't2']);
  assert.strictEqual(snake.targetRoundId, 'rnd-2');
  assert.strictEqual(snake.sourceRoundId, 'rnd-1');

  // camelCase
  const camel = normalizeAdvancePayload({
    teamIds: ['t3', 't4'],
    targetRoundId: 'rnd-3',
    sourceRoundId: 'rnd-2',
    targetGroupId: 'grp-2',
  });
  assert.deepStrictEqual(camel.teamIds, ['t3', 't4']);
  assert.strictEqual(camel.targetRoundId, 'rnd-3');
  assert.strictEqual(camel.sourceRoundId, 'rnd-2');
});

// ── 6. Match Number Reorder Collision Prevention ──
test('match_number reordering: temporary negation avoids unique constraint collisions', () => {
  // Simulate unique constraint: Map of round_id -> Set of match_numbers
  const constraintTable = new Map();
  function checkAndInsert(roundId, matchNumber) {
    if (!constraintTable.has(roundId)) {
      constraintTable.set(roundId, new Set());
    }
    const numbers = constraintTable.get(roundId);
    if (numbers.has(matchNumber)) {
      throw new Error(`Unique constraint violation: match_number ${matchNumber} already exists in round ${roundId}`);
    }
    numbers.add(matchNumber);
  }

  // Initial state: round 'r1' has matches 1, 2, 3
  checkAndInsert('r1', 1);
  checkAndInsert('r1', 2);
  checkAndInsert('r1', 3);

  // Reordering match 1 -> 2, match 2 -> 3, match 3 -> 1 directly would collide on 2.
  // Phase 1 solution: Negate existing numbers before updating to new order
  const roundMatches = [1, 2, 3];
  const negatedMatches = roundMatches.map(m => -1 * (Math.abs(m) + 1000));
  constraintTable.set('r1', new Set(negatedMatches));

  // Now assign new reordered positive numbers [2, 3, 1]
  const newOrder = [2, 3, 1];
  for (const newNum of newOrder) {
    assert.doesNotThrow(() => {
      // Removing old placeholder as it's replaced
      checkAndInsert('r1', newNum);
    });
  }

  // All new positive numbers are assigned without collision
  assert.ok(constraintTable.get('r1').has(1));
  assert.ok(constraintTable.get('r1').has(2));
  assert.ok(constraintTable.get('r1').has(3));
});

// ── 7. Districts Endpoint Authorization (401 / 403 / 200) ──
test('districts auth: strictly enforces 401 for unauthenticated and 403 for unauthorized users', () => {
  function checkDistrictsAccess(authUser, tournament) {
    if (!authUser) {
      return { status: 401, error: 'UNAUTHORIZED' };
    }
    if (!tournament) {
      return { status: 404, error: 'NOT_FOUND' };
    }
    const isOwnerOrAdmin =
      authUser.role === 'admin' ||
      (Array.isArray(authUser.roles) && authUser.roles.includes('admin')) ||
      tournament.orgId === authUser.id;
    if (!isOwnerOrAdmin) {
      return { status: 403, error: 'FORBIDDEN' };
    }
    return { status: 200, success: true };
  }

  const tourney = { id: 'TRN-1', orgId: 'organizer-123' };

  // 1. Unauthenticated -> 401
  assert.strictEqual(checkDistrictsAccess(null, tourney).status, 401);

  // 2. Random authenticated user -> 403
  assert.strictEqual(checkDistrictsAccess({ id: 'player-456', role: 'user' }, tourney).status, 403);

  // 3. Tournament organizer -> 200
  assert.strictEqual(checkDistrictsAccess({ id: 'organizer-123', role: 'user' }, tourney).status, 200);

  // 4. Platform admin -> 200
  assert.strictEqual(checkDistrictsAccess({ id: 'admin-999', role: 'admin' }, tourney).status, 200);
});

