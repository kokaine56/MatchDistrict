// server/leaderboard/standingsService.js
import { getDistrictRoster } from './rosterService.js';
import { getResultsForMatches } from './resultsService.js';
import { rankTeams } from './rankingService.js';
import { getScoringConfig } from './scoringConfig.js';

/**
 * Computes district standings purely on read from match results (P5, P7).
 *
 * Missing results are null, never zero (P7).
 *
 * @param {object} clientOrPool
 * @param {object} params
 * @param {string} params.tournamentId
 * @param {string} params.roundId
 * @param {string} params.districtId
 * @param {object} [params.scoringConfig]
 * @returns {Promise<{
 *   round_id: string,
 *   district_id: string,
 *   matches: Array<object>,
 *   standings: Array<object>,
 *   discrepancies: Array<object>
 * }>}
 */
export async function computeDistrictStandings(clientOrPool, {
  tournamentId,
  roundId,
  districtId,
  scoringConfig: providedConfig = null,
}) {
  if (!clientOrPool || !tournamentId || !roundId || !districtId) {
    throw new Error('tournamentId, roundId, and districtId are required.');
  }

  const scoringConfig = providedConfig || await getScoringConfig(clientOrPool, tournamentId);
  const districtData = await getDistrictRoster(clientOrPool, roundId, districtId);

  const matches = districtData.matches || [];
  const matchIds = matches.map((m) => m.id);

  const resultsByMatch = await getResultsForMatches(clientOrPool, matchIds, tournamentId);

  // Identify the most recent match that actually has recorded results
  let mostRecentMatchIdWithResults = null;
  for (let i = matches.length - 1; i >= 0; i--) {
    const mId = matches[i].id;
    const mMap = resultsByMatch.get(mId);
    if (mMap && mMap.size > 0) {
      mostRecentMatchIdWithResults = mId;
      break;
    }
  }

  // Aggregate results per team in the authoritative district roster
  const teamAggregates = districtData.roster.map((team) => {
    let matchesPlayed = 0;
    let totalKills = 0;
    let totalKillPoints = 0;
    let totalPlacementPoints = 0;
    let totalPoints = 0;
    let wwcdCount = 0;
    let recentPlacement = null;

    for (const m of matches) {
      const matchMap = resultsByMatch.get(m.id);
      const res = matchMap ? matchMap.get(team.team_id) : null;
      if (res && res.placement != null && res.kills != null) {
        matchesPlayed += 1;
        totalKills += res.kills;
        totalKillPoints += res.kill_points;
        totalPlacementPoints += res.placement_points;
        totalPoints += res.total_points;
        if (res.wwcd === 1 || res.placement === 1) {
          wwcdCount += 1;
        }

        if (m.id === mostRecentMatchIdWithResults) {
          recentPlacement = res.placement;
        }
      }
    }

    const hasPlayed = matchesPlayed > 0;

    return {
      team_id: team.team_id,
      team_name: team.team_name,
      captain_name: team.captain_name,
      slot_number: team.slot_number,
      status: team.status,
      is_disqualified: Boolean(team.is_disqualified),
      matches_played: matchesPlayed,
      // P7: Missing result is null, never zero
      total_kills: hasPlayed ? totalKills : null,
      total_kill_points: hasPlayed ? totalKillPoints : null,
      total_placement_points: hasPlayed ? totalPlacementPoints : null,
      wwcd_count: hasPlayed ? wwcdCount : null,
      total_points: hasPlayed ? totalPoints : null,
      recent_match_placement: recentPlacement,
    };
  });

  const rankedStandings = rankTeams(teamAggregates);

  return {
    round_id: roundId,
    district_id: districtId,
    matches,
    standings: rankedStandings,
    discrepancies: districtData.discrepancies || [],
  };
}

/**
 * Computes overall round standings by combining district rosters and results (P5, P7).
 *
 * @param {object} clientOrPool
 * @param {object} params
 * @param {string} params.tournamentId
 * @param {string} params.roundId
 * @param {Array<object>} [params.districtList]
 * @returns {Promise<{
 *   round_id: string,
 *   standings: Array<object>,
 *   district_summaries: Array<object>,
 *   discrepancies: Array<object>
 * }>}
 */
export async function computeRoundStandings(clientOrPool, {
  tournamentId,
  roundId,
  districtList = null,
}) {
  if (!clientOrPool || !tournamentId || !roundId) {
    throw new Error('tournamentId and roundId are required.');
  }

  const scoringConfig = await getScoringConfig(clientOrPool, tournamentId);

  // Fetch districts if not provided
  let districts = districtList;
  if (!districts) {
    const distRes = await clientOrPool.query(
      `SELECT g.id, g.group_name, g.sequence, g.display_order, g.district_id
       FROM tournament_groups g
       WHERE g.round_id = $1::varchar AND g.tournament_id = $2::varchar
       ORDER BY COALESCE(g.display_order, g.sequence, 0) ASC, g.id ASC`,
      [roundId, tournamentId]
    );
    districts = distRes.rows.map((d) => ({
      id: d.district_id || d.id,
      name: d.group_name,
    }));
  }

  // Also query any matches configured directly for the round
  const roundMatchesRes = await clientOrPool.query(
    `SELECT m.id, m.match_number, m.group_id, m.district_id
     FROM tournament_matches m
     WHERE m.round_id = $1::varchar AND m.tournament_id = $2::varchar
     ORDER BY m.match_number ASC, m.id ASC`,
    [roundId, tournamentId]
  );
  const roundMatches = roundMatchesRes.rows;
  const matchIds = roundMatches.map((m) => m.id);

  const resultsByMatch = await getResultsForMatches(clientOrPool, matchIds, tournamentId);

  // Identify the most recent round match with results
  let mostRecentRoundMatchId = null;
  for (let i = roundMatches.length - 1; i >= 0; i--) {
    const mId = roundMatches[i].id;
    const mMap = resultsByMatch.get(mId);
    if (mMap && mMap.size > 0) {
      mostRecentRoundMatchId = mId;
      break;
    }
  }

  const allTeamsMap = new Map();
  const allDiscrepancies = [];
  const districtSummaries = [];

  // If the round has no districts, treat matches as a single lobby
  if (districts.length === 0) {
    const singleDistrictData = await computeDistrictStandings(clientOrPool, {
      tournamentId,
      roundId,
      districtId: roundId, // fallback
      scoringConfig,
    });
    return {
      round_id: roundId,
      standings: singleDistrictData.standings,
      district_summaries: [],
      discrepancies: singleDistrictData.discrepancies,
    };
  }

  for (const dist of districts) {
    const distId = dist.id;
    const distResult = await computeDistrictStandings(clientOrPool, {
      tournamentId,
      roundId,
      districtId: distId,
      scoringConfig,
    });

    if (Array.isArray(distResult.discrepancies)) {
      allDiscrepancies.push(...distResult.discrepancies);
    }

    districtSummaries.push({
      district_id: distId,
      name: dist.name,
      team_count: distResult.standings.length,
      standings: distResult.standings,
    });

    for (const t of distResult.standings) {
      if (!allTeamsMap.has(t.team_id)) {
        allTeamsMap.set(t.team_id, {
          ...t,
          source_district_id: distId,
          source_district_name: dist.name,
        });
      }
    }
  }

  // Rank all teams globally for overall round standings
  const combinedTeams = Array.from(allTeamsMap.values());
  const globalRanked = rankTeams(combinedTeams);

  return {
    round_id: roundId,
    standings: globalRanked,
    district_summaries: districtSummaries,
    discrepancies: allDiscrepancies,
  };
}
