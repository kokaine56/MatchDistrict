// server/leaderboard/scoringConfig.js
/**
 * Authoritative scoring configuration and pure calculation module.
 *
 * Default placement points (16-team standard):
 * 1st 10, 2nd 6, 3rd 5, 4th 4, 5th 3, 6th 2, 7th and 8th 1, 9th to 16th 0.
 * Kill points = kills x kill multiplier (default 1).
 * If tournament_scoring_rules has a row for the tournament (placement_points_map, kill_points_multiplier)
 * use it instead of the defaults; use defaults when no row exists.
 */

export const DEFAULT_PLACEMENT_POINTS = Object.freeze({
  1: 10,
  2: 6,
  3: 5,
  4: 4,
  5: 3,
  6: 2,
  7: 1,
  8: 1,
  9: 0,
  10: 0,
  11: 0,
  12: 0,
  13: 0,
  14: 0,
  15: 0,
  16: 0,
});

export const DEFAULT_SCORING_CONFIG = Object.freeze({
  kill_points_multiplier: 1,
  placement_points_map: DEFAULT_PLACEMENT_POINTS,
  wwcd_bonus: 0,
});

/**
 * Loads scoring rules for a tournament from tournament_scoring_rules table.
 * Falls back to DEFAULT_SCORING_CONFIG if not found or query fails.
 * NEVER reads or invents a scoring_rules column on tournaments table.
 *
 * @param {object} clientOrPool
 * @param {string} tournamentId
 * @returns {Promise<{
 *   kill_points_multiplier: number,
 *   placement_points_map: Record<string, number>,
 *   wwcd_bonus: number
 * }>}
 */
export async function getScoringConfig(clientOrPool, tournamentId) {
  if (!clientOrPool || !tournamentId) {
    return { ...DEFAULT_SCORING_CONFIG };
  }

  try {
    const res = await clientOrPool.query(
      `SELECT kill_points_multiplier, placement_points_map, wwcd_bonus
       FROM tournament_scoring_rules
       WHERE tournament_id = $1::varchar
       LIMIT 1`,
      [tournamentId]
    );

    if (res.rows.length > 0 && res.rows[0]) {
      const row = res.rows[0];
      let pMap = row.placement_points_map;
      if (typeof pMap === 'string') {
        try {
          pMap = JSON.parse(pMap);
        } catch {
          pMap = DEFAULT_PLACEMENT_POINTS;
        }
      }
      return {
        kill_points_multiplier: Number.isFinite(Number(row.kill_points_multiplier))
          ? Number(row.kill_points_multiplier)
          : 1,
        placement_points_map: pMap || DEFAULT_PLACEMENT_POINTS,
        wwcd_bonus: Number(row.wwcd_bonus) || 0,
      };
    }
  } catch {
    // Fall back to default
  }

  return { ...DEFAULT_SCORING_CONFIG };
}

/**
 * Calculates placement points for a given finish position.
 *
 * @param {number|null} finishPosition
 * @param {Record<string, number>} [placementMap]
 * @returns {number}
 */
export function calculatePlacementPoints(finishPosition, placementMap = DEFAULT_PLACEMENT_POINTS) {
  if (!Number.isInteger(finishPosition) || finishPosition < 1) {
    return 0;
  }
  const key = String(finishPosition);
  if (placementMap && key in placementMap) {
    return Number(placementMap[key]) || 0;
  }
  // Standard rule beyond defined table: 0
  return 0;
}

/**
 * Pure calculation of a team's single-match score.
 * (Design Principle P4: The organizer enters only two values per team per match:
 * kills and finish position. The server calculates kill points, placement points,
 * WWCD, match total.)
 *
 * @param {number|null} kills
 * @param {number|null} finishPosition
 * @param {{
 *   kill_points_multiplier?: number,
 *   placement_points_map?: Record<string, number>,
 *   wwcd_bonus?: number
 * }} [scoringConfig]
 * @returns {{
 *   kill_points: number,
 *   placement_points: number,
 *   wwcd: number,
 *   match_total: number
 * }}
 */
export function calculateMatchScore(kills, finishPosition, scoringConfig = DEFAULT_SCORING_CONFIG) {
  if (kills == null || finishPosition == null) {
    return {
      kill_points: 0,
      placement_points: 0,
      wwcd: 0,
      match_total: 0,
    };
  }

  const k = Math.max(0, parseInt(kills, 10) || 0);
  const p = parseInt(finishPosition, 10);
  const multiplier = Number.isFinite(Number(scoringConfig.kill_points_multiplier))
    ? Math.max(0, Number(scoringConfig.kill_points_multiplier))
    : 1;

  const killPoints = Math.round(k * multiplier);
  const placementPoints = calculatePlacementPoints(p, scoringConfig.placement_points_map || DEFAULT_PLACEMENT_POINTS);
  const wwcd = p === 1 ? 1 : 0;
  const matchTotal = killPoints + placementPoints;

  return {
    kill_points: killPoints,
    placement_points: placementPoints,
    wwcd, // 1 or 0
    match_total: matchTotal,
  };
}

/**
 * Validates match score submissions.
 * Rules:
 * - Finish position is an integer from 1 to the match roster size and unique within the match.
 * - Kills is an integer 0 to 99.
 * - Both are required for a row to count.
 * - Blank rows are skipped (not zero).
 * - Every team must belong to that match's roster.
 * - Messages name the team and the match.
 *
 * @param {Array<object>} rawScores - Array of { team_id, finish_position, kills }
 * @param {Array<object>} matchRoster - Array of team objects from getMatchRoster
 * @param {{ match_number?: number|string, capacity?: number }} matchInfo
 * @returns {{
 *   validScores: Array<{
 *     team_id: string,
 *     team_name: string,
 *     placement: number,
 *     kills: number
 *   }>,
 *   errors: Array<string>
 * }}
 */
export function validateMatchScores(rawScores, matchRoster, matchInfo = {}) {
  const matchLabel = `Match ${matchInfo.match_number || '?'}`;
  const rosterMap = new Map();
  for (const t of matchRoster) {
    rosterMap.set(t.team_id, t);
  }

  const maxPosition = Math.max(matchRoster.length, Number(matchInfo.capacity) || 16);
  const validScores = [];
  const errors = [];
  const seenPositions = new Map(); // position -> teamName

  if (!Array.isArray(rawScores)) {
    return { validScores: [], errors: [`No scores provided for ${matchLabel}.`] };
  }

  for (const entry of rawScores) {
    const teamId = entry.team_id || entry.teamId;
    const team = rosterMap.get(teamId);
    const teamName = team ? team.team_name : `Team ${teamId}`;

    if (!team) {
      errors.push(`${teamName} is not allocated to ${matchLabel}.`);
      continue;
    }

    const rawPos = entry.finish_position ?? entry.finishPosition ?? entry.placement;
    const rawKills = entry.kills;

    const isPosBlank = rawPos === '' || rawPos === null || rawPos === undefined;
    const isKillsBlank = rawKills === '' || rawKills === null || rawKills === undefined;

    // Blank row: skip completely (not zero)
    if (isPosBlank && isKillsBlank) {
      continue;
    }

    // If one is provided, both are required
    if (isPosBlank && !isKillsBlank) {
      errors.push(`${teamName} in ${matchLabel} has kills entered but is missing a finish position.`);
      continue;
    }
    if (!isPosBlank && isKillsBlank) {
      errors.push(`${teamName} in ${matchLabel} has a finish position entered but is missing kills.`);
      continue;
    }

    const pos = Number(rawPos);
    if (!Number.isInteger(pos) || pos < 1 || pos > maxPosition) {
      errors.push(`${teamName} in ${matchLabel} has an invalid finish position (${rawPos}). Must be between 1 and ${maxPosition}.`);
      continue;
    }

    const kills = Number(rawKills);
    if (!Number.isInteger(kills) || kills < 0 || kills > 99) {
      errors.push(`${teamName} in ${matchLabel} has an invalid kill count (${rawKills}). Must be an integer between 0 and 99.`);
      continue;
    }

    if (seenPositions.has(pos)) {
      const priorTeam = seenPositions.get(pos);
      errors.push(`Duplicate finish position ${pos} in ${matchLabel} assigned to both "${priorTeam}" and "${teamName}".`);
      continue;
    }
    seenPositions.set(pos, teamName);

    validScores.push({
      team_id: teamId,
      team_name: teamName,
      placement: pos,
      kills,
    });
  }

  return { validScores, errors };
}
