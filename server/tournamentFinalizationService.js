import { randomBytes } from 'node:crypto';
import { calculateRankings } from './leaderboardService.js';

export const FINALIZATION_ERR = Object.freeze({
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  TOURNAMENT_FINALIZED: 'TOURNAMENT_FINALIZED',
  TOURNAMENT_NOT_LIVE: 'TOURNAMENT_NOT_LIVE',
  ROADMAP_NOT_APPROVED: 'ROADMAP_NOT_APPROVED',
  FINAL_ROUND_NOT_FOUND: 'FINAL_ROUND_NOT_FOUND',
  FINAL_MATCHES_INCOMPLETE: 'FINAL_MATCHES_INCOMPLETE',
  FINAL_RESULTS_INCOMPLETE: 'FINAL_RESULTS_INCOMPLETE',
});

export class TournamentFinalizationError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'TournamentFinalizationError';
    this.code = code;
    this.status = status;
  }
}

function finalizationError(code, message, status) {
  throw new TournamentFinalizationError(code, message, status);
}

function snapshotId() {
  return `FST-${randomBytes(8).toString('hex').toUpperCase()}`;
}

async function loadExistingSnapshot(client, tournamentId) {
  const result = await client.query(
    `SELECT s.id, s.tournament_id, s.team_id, s.rank, s.total_points, s.total_kills,
            s.wwcd_count, s.best_placement, s.team_name, s.created_at,
            t.finalized_at, t.finalized_by
     FROM tournament_final_standings s
     JOIN tournaments t ON t.id = s.tournament_id
     WHERE s.tournament_id = $1 ORDER BY s.rank ASC`,
    [tournamentId]
  );
  if (!result.rows.length) return null;
  const first = result.rows[0];
  return {
    alreadyFinalized: true,
    tournament_id: tournamentId,
    status: 'completed',
    finalized_at: first.finalized_at,
    finalized_by: first.finalized_by,
    final_standings: result.rows,
  };
}

/**
 * Finalize a tournament inside the transaction owned by the caller.
 * Lock order begins with tournaments, matching match-result writes.
 */
export async function finalizeTournament(client, { tournamentId, actorId } = {}) {
  if (!client || !tournamentId || !actorId) {
    throw new TypeError('client, tournamentId and actorId are required.');
  }

  const tournamentResult = await client.query(
    `SELECT id, status, roadmap_status, finalized_at, finalized_by
     FROM tournaments WHERE id = $1 FOR UPDATE`,
    [tournamentId]
  );
  if (!tournamentResult.rows.length) {
    finalizationError(FINALIZATION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.', 404);
  }
  const tournament = tournamentResult.rows[0];

  const existingSnapshot = tournament.finalized_at ? await loadExistingSnapshot(client, tournamentId) : null;
  if (tournament.finalized_at || existingSnapshot) {
    if (existingSnapshot) return existingSnapshot;
    finalizationError(FINALIZATION_ERR.TOURNAMENT_FINALIZED, 'Tournament finalization is incomplete: the immutable standings snapshot is missing.');
  }
  if (String(tournament.status || '').toLowerCase() !== 'live') {
    finalizationError(FINALIZATION_ERR.TOURNAMENT_NOT_LIVE, 'Only a live tournament can be finalized.');
  }
  if (tournament.roadmap_status !== 'approved') {
    finalizationError(FINALIZATION_ERR.ROADMAP_NOT_APPROVED, 'The tournament roadmap must be approved before finalization.');
  }

  // Match-result and allocation writes also serialize on the tournament row.
  // Lock rounds and matches after it so round definitions cannot be changed
  // underneath the final-round validation while this transaction is running.
  await client.query('SELECT id FROM tournament_rounds WHERE tournament_id = $1 ORDER BY round_number FOR UPDATE', [tournamentId]);
  await client.query('SELECT id FROM tournament_matches WHERE tournament_id = $1 ORDER BY id FOR UPDATE', [tournamentId]);

  const roundResult = await client.query(
    `SELECT id, round_number, name, status
     FROM tournament_rounds WHERE tournament_id = $1
     ORDER BY round_number DESC LIMIT 1`,
    [tournamentId]
  );
  const finalRound = roundResult.rows[0];
  if (!finalRound) {
    finalizationError(FINALIZATION_ERR.FINAL_ROUND_NOT_FOUND, 'No tournament rounds were found.');
  }

  const matchesResult = await client.query(
    `SELECT m.id, COUNT(DISTINCT a.tournament_team_id)::int AS assigned_count,
            COUNT(DISTINCT r.team_id) FILTER (WHERE r.status = 'verified')::int AS verified_count,
            COUNT(DISTINCT r.team_id) FILTER (WHERE r.status IS DISTINCT FROM 'verified')::int AS unresolved_count,
            COUNT(DISTINCT a.tournament_team_id) FILTER (WHERE a.status IS DISTINCT FROM 'allocated')::int AS inactive_assignment_count,
            COUNT(DISTINCT a.tournament_team_id) FILTER (WHERE a.status = 'allocated' AND r.team_id IS NULL)::int AS missing_result_count
     FROM tournament_matches m
     LEFT JOIN tournament_match_assignments a
       ON a.match_id = m.id AND a.tournament_id = $1
     LEFT JOIN tournament_match_results r
       ON r.match_id = m.id AND r.tournament_id = $1
          AND r.team_id = a.tournament_team_id AND a.status = 'allocated'
     WHERE m.tournament_id = $1 AND m.round_id = $2
     GROUP BY m.id ORDER BY m.match_number, m.id`,
    [tournamentId, finalRound.id]
  );
  if (!matchesResult.rows.length || matchesResult.rows.some((match) => match.assigned_count === 0 || match.inactive_assignment_count > 0)) {
    finalizationError(FINALIZATION_ERR.FINAL_MATCHES_INCOMPLETE, 'The final round has no matches or contains matches without allocated teams.');
  }
  const unresolvedExtraResult = await client.query(
    `SELECT COUNT(*)::int AS unresolved_count
     FROM tournament_match_results r
     WHERE r.tournament_id = $1 AND r.match_id IN (
       SELECT id FROM tournament_matches WHERE tournament_id = $1 AND round_id = $2
     ) AND r.status IS DISTINCT FROM 'verified'`,
    [tournamentId, finalRound.id]
  );
  if (unresolvedExtraResult.rows[0].unresolved_count > 0) {
    finalizationError(FINALIZATION_ERR.FINAL_RESULTS_INCOMPLETE, 'The final round contains unverified or unresolved result rows.');
  }
  if (matchesResult.rows.some((match) => match.unresolved_count > 0)) {
    finalizationError(FINALIZATION_ERR.FINAL_RESULTS_INCOMPLETE, 'Every allocated final-round team must have a verified result.');
  }
  if (matchesResult.rows.some((match) => match.missing_result_count > 0 || match.verified_count !== match.assigned_count)) {
    finalizationError(FINALIZATION_ERR.FINAL_MATCHES_INCOMPLETE, 'One or more final-round matches are missing results for allocated teams.');
  }

  // Existing leaderboard rows are refreshed transactionally with each verified
  // result. Keep its cumulative semantics and its single authoritative tie-breaker.
  const standings = await calculateRankings(client, tournamentId);
  if (!standings.length) {
    finalizationError(FINALIZATION_ERR.FINAL_RESULTS_INCOMPLETE, 'No authoritative verified standings are available.');
  }

  for (const row of standings) {
    await client.query(
      `INSERT INTO tournament_final_standings
         (id, tournament_id, team_id, rank, total_points, total_kills, wwcd_count, best_placement, team_name, leader_name, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
      [snapshotId(), tournamentId, row.team_id, row.rank, row.total_points, row.total_kills,
        row.wwcd_count, row.best_placement, row.team_name, row.leader_name]
    );
  }

  const finalizedAtResult = await client.query(
    `UPDATE tournaments SET status = 'completed', finalized_at = NOW(), finalized_by = $2
     WHERE id = $1 RETURNING finalized_at`,
    [tournamentId, actorId]
  );
  const finalizedAt = finalizedAtResult.rows[0].finalized_at;

  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
     VALUES ($1, $2, 'tournament_finalized', 'finalization', 'tournament', $3, $4)`,
    [
      `LOG-${randomBytes(6).toString('hex').toUpperCase()}`,
      actorId,
      tournamentId,
      JSON.stringify({
        tournament_id: tournamentId,
        final_round_id: finalRound.id,
        finalized_by: actorId,
        finalized_at: finalizedAt,
        final_team_count: standings.length,
      }),
    ]
  );

  return {
    alreadyFinalized: false,
    tournament_id: tournamentId,
    status: 'completed',
    finalized_at: finalizedAt,
    finalized_by: actorId,
    final_round: finalRound,
    final_standings: standings.map((row) => ({
      team_id: row.team_id,
      team_name: row.team_name,
      rank: row.rank,
      total_points: row.total_points,
      total_kills: row.total_kills,
      wwcd_count: row.wwcd_count,
      best_placement: row.best_placement,
    })),
  };
}
