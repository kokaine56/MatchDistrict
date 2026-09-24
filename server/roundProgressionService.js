import { allocateTeam, AllocationError, ALLOCATION_SOURCES, ALLOCATION_ERR, randomId } from './allocationService.js';
import { sortAndRank } from './leaderboardService.js';

// === Round Progression / Qualification (Phase 8B) ===
//
// Single authoritative engine for advancing teams out of a completed round into
// the next round of an approved roadmap:
//   - standings are computed from VERIFIED match results scoped to the round;
//   - the cutoff is deterministic at `tournament_rounds.teams_advancing`
//     (wizard-authored, never recomputed here; NULL / <= 0 advances nobody);
//   - qualified teams are placed via the shared advancement allocation source
//     into the FIRST free room of the next round (reusing automatic placement
//     semantics, never creating or rewriting roadmap rows);
//   - the round is marked 'completed' and the next round 'live' only after every
//     placement write has settled (no new columns — existing status values);
//   - every run writes a single `admin_action_log` progression row.
//
// The caller owns the transaction: this module never COMMITs and never ROLLBACKs.

export const ROUND_STATUS = Object.freeze({
  CONFIGURED: 'configured',
  LIVE: 'live',
  COMPLETED: 'completed',
});

export const PROGRESSION_ERR = Object.freeze({
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  ROADMAP_NOT_APPROVED: 'ROADMAP_NOT_APPROVED',
  ROUND_NOT_FOUND: 'ROUND_NOT_FOUND',
  ROUND_NO_RESULTS: 'ROUND_NO_RESULTS',
  NO_NEXT_ROUND: 'NO_NEXT_ROUND',
  ROUND_ALREADY_COMPLETED: 'ROUND_ALREADY_COMPLETED',
});

export class ProgressionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProgressionError';
    this.code = code;
  }
}

export function progressionError(code, message) {
  return new ProgressionError(code, message);
}

// Qualified-team cutoff. teams_advancing is wizard-authored and NEVER extrapolated:
// NULL / 0 / malformed values conservatively advance nobody (0 is a documented
// organizer-explicit outcome).
export function resolveQualificationCutoff(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 1 ? n : 0;
}

// Takes the first `cutoff` records of a `sortAndRank`-style standings array,
// honouring the deterministic rank order (rank null/absent → not advanceable).
export function selectQualifiedTeams(standings = [], cutoff = 0) {
  const limit = Number(cutoff) || 0;
  if (limit <= 0) return [];
  return standings
    .filter((row) => row && row.team_id)
    .sort((a, b) => (Number(a.rank) || Infinity) - (Number(b.rank) || Infinity))
    .slice(0, limit);
}

// Smallest round_number strictly greater than the current one; null when the
// current round is the last (or no rounds exist).
export function nextRoundNumberOf(roundRows = [], currentNumber) {
  const current = Number(currentNumber);
  if (!Number.isFinite(current)) return null;
  let next = null;
  for (const row of roundRows) {
    const n = Number(row.round_number ?? row.roundNumber);
    if (Number.isFinite(n) && n > current && (next === null || n < next)) next = n;
  }
  return next;
}

// Round-scoped standings built from VERIFIED result rows (only verified results
// are ever written by the match-result service, so no extra status filter is
// needed). Aggregates per team and ranks through the shared deterministic
// leaderboard comparator.
export async function getRoundStandings(client, tournamentId, roundId) {
  const res = await client.query(
    `SELECT
       tm.team_id,
       t.team_name,
       u.name AS leader_name,
       COUNT(DISTINCT tm.match_id)::int AS matches_played,
       COALESCE(SUM(tm.kills), 0)::int AS total_kills,
       COALESCE(SUM(tm.kill_points), 0)::int AS total_kill_points,
       COALESCE(SUM(tm.placement_points), 0)::int AS total_placement_points,
       COALESCE(SUM(tm.total_points), 0)::int AS total_points,
       COALESCE(COUNT(*) FILTER (WHERE tm.wwcd), 0)::int AS wwcd_count,
       MIN(tm.placement) AS best_placement
     FROM tournament_match_results tm
     JOIN tournament_matches m ON m.id = tm.match_id AND m.tournament_id = $1
     JOIN tournament_teams t ON t.id = tm.team_id
     LEFT JOIN users u ON u.id = t.leader_user_id
     WHERE m.round_id = $2
     GROUP BY tm.team_id, t.team_name, u.name`,
    [tournamentId, roundId]
  );
  return sortAndRank(res.rows);
}

function roundSummary(round) {
  return {
    id: round.id,
    round_number: round.round_number,
    name: round.name,
    status: round.status,
    teams_advancing: round.teams_advancing,
  };
}

// Advances qualified teams from a completed round into the next round.
//
// Transactional contract:
//   - the caller owns the transaction (BEGIN before, COMMIT/ROLLBACK after);
//   - lock order is round FOR UPDATE → (per team, inside allocateTeam) team →
//     tournament — tournament is always acquired last, so it cannot cycle with
//     the verify/move paths (team → tournament);
//   - an already-completed round is idempotent (returns alreadyQualified: true);
//   - hard allocation failures (e.g. roadmap revoked mid-batch) abort the whole
//     run; soft ones (ineligible registration, misplaced team) skip that team only.
export async function qualifyRound(client, { tournamentId, roundNumber, actorId = null } = {}) {
  const tId = tournamentId;
  const rn = Number.parseInt(roundNumber, 10);
  if (!client || !tId || !Number.isInteger(rn) || rn < 1) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'A valid round number must be provided.');
  }

  const tournRes = await client.query('SELECT id, "orgId", roadmap_status FROM tournaments WHERE id = $1', [tId]);
  if (tournRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].roadmap_status !== 'approved') {
    throw progressionError(PROGRESSION_ERR.ROADMAP_NOT_APPROVED, 'The roadmap must be approved before qualifying teams.');
  }

  const roundRes = await client.query(
    'SELECT id, round_number, name, status, teams_advancing FROM tournament_rounds WHERE tournament_id = $1 AND round_number = $2 FOR UPDATE',
    [tId, rn]
  );
  if (roundRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, `Round ${rn} does not exist for this tournament.`);
  }
  const round = roundRes.rows[0];

  if (round.status === ROUND_STATUS.COMPLETED) {
    return {
      success: true,
      alreadyQualified: true,
      round: roundSummary(round),
      message: `Round ${rn} was already qualified. No changes were made.`,
    };
  }

  const nextRes = await client.query(
    'SELECT id, round_number, name FROM tournament_rounds WHERE tournament_id = $1 AND round_number > $2 ORDER BY round_number ASC LIMIT 1',
    [tId, rn]
  );
  if (nextRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.NO_NEXT_ROUND, `Round ${rn} is the final round — there is no next round to advance teams into.`);
  }
  const nextRound = nextRes.rows[0];

  const standings = await getRoundStandings(client, tId, round.id);
  if (standings.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NO_RESULTS, `No verified results exist for Round ${rn}. Record match results before qualifying.`);
  }

  const cutoff = resolveQualificationCutoff(round.teams_advancing);
  const qualifiers = selectQualifiedTeams(standings, cutoff);

  const outcomes = [];
  for (const team of qualifiers) {
    try {
      const placed = await allocateTeam(client, {
        teamId: team.team_id,
        tournamentId: tId,
        source: ALLOCATION_SOURCES.ADVANCEMENT,
        options: { targetRoundNumber: nextRound.round_number },
        actorId,
      });
      if (placed.alreadyAllocated || placed.code === ALLOCATION_ERR.TEAM_ALREADY_ALLOCATED) {
        outcomes.push({
          teamId: team.team_id,
          teamName: team.team_name,
          status: 'already_advanced',
          code: ALLOCATION_ERR.TEAM_ALREADY_ALLOCATED,
          message: 'Team already holds a placement in the next round.',
        });
      } else if (placed.status === 'allocation_pending' || placed.code === ALLOCATION_ERR.NO_AVAILABLE_POSITION) {
        outcomes.push({
          teamId: team.team_id,
          teamName: team.team_name,
          status: 'pending',
          code: ALLOCATION_ERR.NO_AVAILABLE_POSITION,
          message: 'No available position in the next round. The team was left allocation_pending.',
        });
      } else {
        outcomes.push({
          teamId: team.team_id,
          teamName: team.team_name,
          status: 'advanced',
          code: placed.code,
          message: 'Team advanced and was allocated to the first free room of the next round.',
        });
      }
    } catch (err) {
      if (err instanceof AllocationError) {
        if (err.code === ALLOCATION_ERR.ROADMAP_NOT_APPROVED) {
          // State changed under us mid-batch; abort everything so the caller can retry.
          throw err;
        }
        const ineligible = err.code === ALLOCATION_ERR.TEAM_NOT_ELIGIBLE;
        outcomes.push({
          teamId: team.team_id,
          teamName: team.team_name,
          status: 'skipped',
          code: err.code,
          message: ineligible
            ? 'Team skipped: the linked registration is no longer eligible for allocation.'
            : err.message,
        });
      } else {
        throw err;
      }
    }
  }

  const advancedCount = outcomes.filter((o) => o.status === 'advanced').length;
  const skippedCount = outcomes.filter((o) => o.status === 'skipped').length;
  const pendingCount = outcomes.filter((o) => o.status === 'pending').length;

  // Mark the source round completed and the next round live ONLY after every
  // placement settled. Both writes are plain updates (same tx, row locks).
  await client.query(
    "UPDATE tournament_rounds SET status = 'completed', updated_at = NOW() WHERE id = $1",
    [round.id]
  );
  await client.query(
    "UPDATE tournament_rounds SET status = 'live', updated_at = NOW() WHERE id = $1",
    [nextRound.id]
  );

  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
     VALUES ($1, $2, 'round_qualified', 'progression', 'tournament_round', $3, $4)`,
    [
      randomId('PRG-'),
      actorId || 'SYSTEM',
      round.id,
      JSON.stringify({
        tournament_id: tId,
        round_id: round.id,
        round_number: rn,
        cutoff,
        next_round_id: nextRound.id,
        next_round_number: nextRound.round_number,
        qualified: outcomes.filter((o) => o.status === 'advanced' || o.status === 'already_advanced').map((o) => o.teamId),
        outcomes,
        advanced_count: advancedCount,
        skipped_count: skippedCount,
        pending_count: pendingCount,
        qualified_at: new Date().toISOString(),
      }),
    ]
  );

  return {
    success: true,
    alreadyQualified: false,
    round: { ...roundSummary(round), status: ROUND_STATUS.COMPLETED },
    nextRound: { id: nextRound.id, round_number: nextRound.round_number, name: nextRound.name, status: ROUND_STATUS.LIVE },
    cutoff,
    qualifiers: qualifiers.map((t) => ({ team_id: t.team_id, team_name: t.team_name })),
    outcomes,
    advancedCount,
    alreadyAdvancedCount: outcomes.filter((o) => o.status === 'already_advanced').length,
    skippedCount,
    pendingCount,
    standings,
    message: `Round ${rn} qualified. ${advancedCount} team(s) advanced to Round ${nextRound.round_number}.`,
  };
}