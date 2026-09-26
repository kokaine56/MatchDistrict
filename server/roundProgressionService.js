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
       t.team_name,
       u.name AS leader_name,
       tm.kills AS total_kills,
       tm.kill_points AS total_kill_points,
       tm.placement_points AS total_placement_points,
       tm.total_points AS total_points,
       (CASE WHEN tm.wwcd THEN 1 ELSE 0 END)::int AS wwcd_count,
       tm.placement AS best_placement
     FROM tournament_match_results tm
     JOIN tournament_teams t ON t.id = tm.team_id
     LEFT JOIN users u ON u.id = t.leader_user_id
     WHERE tm.match_id = $1 AND tm.tournament_id = $2 AND tm.status = 'verified'`,
    [matchId, tournamentId]
  );
  return sortAndRank(res.rows);
}

export async function processMatchQualifiers(client, tournamentId, sourceMatch) {
  const standings = await getMatchStandings(client, tournamentId, sourceMatch.id);
  const cutoff = sourceMatch.teams_advancing || 8;
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

  let isReadyToAllocate = false;
  let siblings = [];

  if (match.next_match_id) {
    const sibRes = await client.query('SELECT id, progression_processed, teams_advancing FROM tournament_matches WHERE next_match_id = $1', [match.next_match_id]);
    siblings = sibRes.rows;
    isReadyToAllocate = siblings.every(r => r.progression_processed || r.id === match.id);
  } else if (match.next_round_id) {
    const sibRes = await client.query('SELECT id, progression_processed, teams_advancing FROM tournament_matches WHERE next_round_id = $1', [match.next_round_id]);
    siblings = sibRes.rows;
    isReadyToAllocate = siblings.every(r => r.progression_processed || r.id === match.id);
  }

  if (!isReadyToAllocate) {
    return {
      success: true,
      alreadyProcessed: false,
      message: 'Match processed, waiting for sibling source matches to complete.',
      status: 'WAITING'
    };
  }

  // ALL source matches are ready. We now aggregate exactly once into the destination pool.
  const allQualifiers = [];
  for (const sib of siblings) {
    const qs = await processMatchQualifiers(client, tournamentId, sib);
    allQualifiers.push(...qs);
  }

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
    message: `All source matches processed. ${allQualifiers.length} total team(s) aggregated and advanced.`,
    status: 'COMPLETED'
  };
}
