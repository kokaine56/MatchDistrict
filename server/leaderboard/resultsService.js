// server/leaderboard/resultsService.js
import crypto from 'crypto';
import { calculateMatchScore } from './scoringConfig.js';
import { loadCanonicalTeamDirectory } from './rosterService.js';

function randomId(prefix = 'res_') {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Loads results for given match IDs.
 * Deduplicates multiple entries for the same (match_id, team_id) by taking
 * the latest row (never deletes anything). Maps team identifiers to canonical tournament_teams.id.
 *
 * @param {object} clientOrPool
 * @param {Array<string>} matchIds
 * @param {string} tournamentId
 * @returns {Promise<Map<string, Map<string, object>>>} matchId -> (teamId -> resultRow)
 */
export async function getResultsForMatches(clientOrPool, matchIds, tournamentId) {
  const resultsByMatch = new Map();
  if (!clientOrPool || !Array.isArray(matchIds) || matchIds.length === 0) {
    return resultsByMatch;
  }

  for (const mId of matchIds) {
    resultsByMatch.set(mId, new Map());
  }

  const { canonicalMap } = await loadCanonicalTeamDirectory(clientOrPool, tournamentId);

  const query = `
    SELECT
      mr.id,
      mr.tournament_id,
      mr.match_id,
      mr.team_id,
      mr.placement,
      mr.kills,
      mr.kill_points,
      mr.placement_points,
      mr.wwcd,
      mr.total_points,
      mr.status,
      mr.updated_at,
      mr.created_at
    FROM tournament_match_results mr
    WHERE mr.match_id = ANY($1::text[])
    ORDER BY mr.updated_at DESC NULLS LAST, mr.created_at DESC NULLS LAST, mr.id DESC
  `;

  const res = await clientOrPool.query(query, [matchIds]);

  for (const row of res.rows) {
    const mId = row.match_id;
    const matchMap = resultsByMatch.get(mId);
    if (!matchMap) continue;

    const canonicalTeamId = canonicalMap.get(row.team_id) || row.team_id;

    // Deduplication: take the latest row only
    if (!matchMap.has(canonicalTeamId)) {
      matchMap.set(canonicalTeamId, {
        id: row.id,
        match_id: mId,
        team_id: canonicalTeamId,
        raw_team_id: row.team_id,
        placement: Number(row.placement),
        kills: Number(row.kills),
        kill_points: Number(row.kill_points),
        placement_points: Number(row.placement_points),
        wwcd: row.wwcd === true || Number(row.wwcd) === 1 || Number(row.placement) === 1 ? 1 : 0,
        total_points: Number(row.total_points),
        status: row.status,
        updated_at: row.updated_at,
      });
    }
  }

  return resultsByMatch;
}

/**
 * Saves validated results for a single match within an external transaction client.
 * Strictly derives derived columns (kill_points, placement_points, wwcd, total_points) on the server.
 * (Design Principle P4: Nothing the client sends for derived values is trusted or stored.)
 *
 * @param {object} client - Active PostgreSQL transaction client
 * @param {object} params
 * @param {string} params.matchId
 * @param {string} params.tournamentId
 * @param {Array<{ team_id: string, placement: number, kills: number }>} params.validScores
 * @param {string} params.actorId
 * @param {object} params.scoringConfig
 * @returns {Promise<number>} Number of saved results
 */
export async function saveMatchResults(client, {
  matchId,
  tournamentId,
  validScores,
  actorId,
  scoringConfig,
}) {
  if (!client || !matchId || !tournamentId) {
    throw new Error('Database client, matchId, and tournamentId are required.');
  }

  if (!Array.isArray(validScores) || validScores.length === 0) {
    return 0;
  }

  for (const item of validScores) {
    const derived = calculateMatchScore(item.kills, item.placement, scoringConfig);
    const resultId = randomId('tmr_');

    const upsertSql = `
      INSERT INTO tournament_match_results (
        id, tournament_id, match_id, team_id,
        placement, kills, kill_points, placement_points,
        wwcd, total_points, status, submitted_by, verified_by,
        updated_at
      ) VALUES (
        $1::varchar, $2::varchar, $3::varchar, $4::varchar,
        $5::int, $6::int, $7::int, $8::int,
        $9::boolean, $10::int, 'verified', $11::varchar, $11::varchar,
        NOW()
      )
      ON CONFLICT (match_id, team_id) DO UPDATE SET
        placement = EXCLUDED.placement,
        kills = EXCLUDED.kills,
        kill_points = EXCLUDED.kill_points,
        placement_points = EXCLUDED.placement_points,
        wwcd = EXCLUDED.wwcd,
        total_points = EXCLUDED.total_points,
        status = 'verified',
        verified_by = EXCLUDED.verified_by,
        updated_at = NOW()
    `;

    await client.query(upsertSql, [
      resultId,
      tournamentId,
      matchId,
      item.team_id,
      item.placement,
      item.kills,
      derived.kill_points,
      derived.placement_points,
      derived.wwcd === 1,
      derived.match_total,
      actorId || null,
    ]);

    // Additive audit trail
    try {
      await client.query(
        `INSERT INTO tournament_match_results_audit (
           id, result_id, action, new_data, actor_id, timestamp
         ) VALUES ($1::varchar, $2::varchar, $3::varchar, $4::jsonb, $5::varchar, NOW())`,
        [
          randomId('aud_'),
          resultId,
          'SAVE_SCORE_V2',
          JSON.stringify({
            matchId,
            teamId: item.team_id,
            placement: item.placement,
            kills: item.kills,
            derived,
          }),
          actorId || null,
        ]
      );
    } catch {
      // Audit non-blocking
    }
  }

  return validScores.length;
}
