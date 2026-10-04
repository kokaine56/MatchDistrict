import { ALLOCATION_SOURCES, randomId } from './allocationService.js';
import { sortAndRank } from './leaderboardService.js';

export const PROGRESSION_ERR = Object.freeze({
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  ROADMAP_NOT_APPROVED: 'ROADMAP_NOT_APPROVED',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_ALREADY_PROCESSED: 'MATCH_ALREADY_PROCESSED',
  TOURNAMENT_FINALIZED: 'TOURNAMENT_FINALIZED',
  RESULTS_INCOMPLETE: 'RESULTS_INCOMPLETE',
  SOURCES_NOT_READY: 'SOURCES_NOT_READY'
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

export async function getMatchStandings(client, tournamentId, matchId) {
  const res = await client.query(
    `SELECT
       tm.team_id,
       MAX(t.team_name) as team_name,
       MAX(u.name) AS leader_name,
       SUM(tm.kills)::int AS total_kills,
       SUM(tm.kill_points)::int AS total_kill_points,
       SUM(tm.placement_points)::int AS total_placement_points,
       SUM(tm.total_points)::int AS total_points,
       SUM(CASE WHEN tm.wwcd THEN 1 ELSE 0 END)::int AS wwcd_count,
       MIN(tm.placement) AS best_placement
     FROM tournament_match_results tm
     JOIN tournament_teams t ON t.id = tm.team_id
     LEFT JOIN users u ON u.id = t.leader_user_id
     WHERE tm.match_id = $1 AND tm.tournament_id = $2 AND tm.status = 'verified'
     GROUP BY tm.team_id`,
    [matchId, tournamentId]
  );
  return sortAndRank(res.rows);
}

export async function getRoundStandings(client, tournamentId, roundId) {
  const res = await client.query(
    `SELECT
       tm.team_id,
       MAX(t.team_name) as team_name,
       MAX(u.name) AS leader_name,
       SUM(tm.kills)::int AS total_kills,
       SUM(tm.kill_points)::int AS total_kill_points,
       SUM(tm.placement_points)::int AS total_placement_points,
       SUM(tm.total_points)::int AS total_points,
       SUM(CASE WHEN tm.wwcd THEN 1 ELSE 0 END)::int AS wwcd_count,
       MIN(tm.placement) AS best_placement
     FROM tournament_match_results tm
     JOIN tournament_matches m ON m.id = tm.match_id
     JOIN tournament_teams t ON t.id = tm.team_id
     LEFT JOIN users u ON u.id = t.leader_user_id
     WHERE m.round_id = $1 AND tm.tournament_id = $2 AND tm.status = 'verified'
     GROUP BY tm.team_id`,
    [roundId, tournamentId]
  );
  return sortAndRank(res.rows);
}

export async function processRoundQualifiers(client, tournamentId, roundId, teamsAdvancing) {
  const standings = await getRoundStandings(client, tournamentId, roundId);
  const cutoff = teamsAdvancing || 8;
  const qualifiers = standings
    .filter((row) => row && row.team_id)
    .sort((a, b) => (Number(a.rank) || Infinity) - (Number(b.rank) || Infinity))
    .slice(0, cutoff);
  return qualifiers;
}

export async function qualifyMatch(client, { tournamentId, matchId, actorId = null }) {
  if (!client || !tournamentId || !matchId) {
    throw progressionError(PROGRESSION_ERR.MATCH_NOT_FOUND, 'A valid match ID must be provided.');
  }

  const tournRes = await client.query('SELECT id, roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
  if (tournRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_FINALIZED, 'This tournament is finalized; progression is locked.');
  }
  if (tournRes.rows[0].roadmap_status !== 'approved') {
    throw progressionError(PROGRESSION_ERR.ROADMAP_NOT_APPROVED, 'The roadmap must be approved before qualifying teams.');
  }

  const matchRes = await client.query(
    'SELECT id, round_id, match_number, next_match_id, next_round_id, teams_advancing, progression_processed FROM tournament_matches WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
    [matchId, tournamentId]
  );
  if (matchRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.MATCH_NOT_FOUND, `Match does not exist.`);
  }
  const match = matchRes.rows[0];

  if (match.progression_processed) {
    return {
      success: true,
      alreadyProcessed: true,
      message: `Match was already processed for progression.`,
    };
  }

  // Check if results are complete
  const allocRes = await client.query("SELECT COUNT(*) FROM tournament_match_assignments WHERE match_id = $1 AND status = 'allocated'", [match.id]);
  const resultRes = await client.query("SELECT COUNT(*) FROM tournament_match_results WHERE match_id = $1 AND status = 'verified'", [match.id]);
  
  const assignedCount = parseInt(allocRes.rows[0].count, 10);
  const resultCount = parseInt(resultRes.rows[0].count, 10);

  if (assignedCount > 0 && resultCount < assignedCount) {
    throw progressionError(PROGRESSION_ERR.RESULTS_INCOMPLETE, `Cannot qualify match until all ${assignedCount} assigned teams have verified results. Currently ${resultCount}/${assignedCount}.`);
  }

  if (!match.next_match_id && !match.next_round_id) {
    // Nowhere to go (e.g. Grand Final matches themselves)
    await client.query('UPDATE tournament_matches SET progression_processed = true WHERE id = $1', [matchId]);
    return {
      success: true,
      alreadyProcessed: false,
      message: `Match processed, but no next match/round to advance to.`,
    };
  }

  // Mark this source match as processed
  await client.query('UPDATE tournament_matches SET progression_processed = true WHERE id = $1', [match.id]);

  if (!match.round_id) {
     return {
       success: true,
       alreadyProcessed: false,
       message: 'Match processed, but it lacks a round_id for global qualification.',
       status: 'COMPLETED'
     };
  }

  const sibRes = await client.query('SELECT id, progression_processed FROM tournament_matches WHERE round_id = $1', [match.round_id]);
  const siblings = sibRes.rows;
  const isReadyToAllocate = siblings.every(r => r.progression_processed || r.id === match.id);

  if (!isReadyToAllocate) {
    return {
      success: true,
      alreadyProcessed: false,
      message: 'Match processed, waiting for all matches in the round to complete.',
      status: 'WAITING'
    };
  }

  const roundRes = await client.query('SELECT id, teams_advancing FROM tournament_rounds WHERE id = $1', [match.round_id]);
  const round = roundRes.rows[0];

  // ALL source matches in the round are ready. Global aggregation.
  const allQualifiers = await processRoundQualifiers(client, tournamentId, match.round_id, round.teams_advancing);

  let targetMatchIds = [];
  if (match.next_round_id) {
    const gfMatches = await client.query('SELECT id FROM tournament_matches WHERE round_id = $1', [match.next_round_id]);
    targetMatchIds = gfMatches.rows.map(r => r.id);
  } else if (match.next_match_id) {
    targetMatchIds = [match.next_match_id];
  }

  const outcomes = [];
  
  for (const team of allQualifiers) {
    for (const targetMatchId of targetMatchIds) {
      const allocId = randomId('ASN-');
      await client.query(
        `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, status, source)
           VALUES ($1, $2, $3, $4, 'allocated', $5)
           ON CONFLICT (tournament_team_id, match_id) DO NOTHING`,
        [allocId, tournamentId, team.team_id, targetMatchId, ALLOCATION_SOURCES.ADVANCEMENT]
      );
    }
    outcomes.push({ teamId: team.team_id, status: 'advanced' });
  }

  return {
    success: true,
    alreadyProcessed: false,
    advancedCount: allQualifiers.length,
    outcomes,
    message: `All matches in round processed. ${allQualifiers.length} total team(s) qualified globally and advanced.`,
    status: 'COMPLETED'
  };
}
