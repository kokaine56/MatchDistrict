// server/leaderboard/rankingService.js
/**
 * Authoritative pure ranking and tie-breaking module.
 *
 * Strict ranking order:
 * 1. Total Points (descending)
 * 2. WWCD count (descending)
 * 3. Total Placement Points (descending)
 * 4. Total Kill Points / Elimination Points (descending)
 * 5. Best finish position in the most recent match of the scope
 *    (a team with no result in that match ranks after teams that have one - ascending placement, nulls last).
 *
 * If everything is equal: true tie (shared rank marker, requires organizer resolution if crossing cutoff).
 */

/**
 * Compares two teams according to the authoritative ranking hierarchy.
 * Returns negative if team A ranks ahead of team B, positive if B ranks ahead of A, 0 if true tie.
 *
 * @param {object} a
 * @param {object} b
 * @returns {number}
 */
export function compareTeams(a, b) {
  // Disqualified teams always sort below non-disqualified teams
  const aDq = Boolean(a.is_disqualified);
  const bDq = Boolean(b.is_disqualified);
  if (aDq !== bDq) {
    return aDq ? 1 : -1;
  }

  // Played vs unplayed: teams with recorded scores rank before teams with no scores
  const aPlayed = a.matches_played != null && a.matches_played > 0;
  const bPlayed = b.matches_played != null && b.matches_played > 0;
  if (aPlayed !== bPlayed) {
    return aPlayed ? -1 : 1;
  }

  // 1. Total points (descending)
  const aTotal = Number(a.total_points ?? (aPlayed ? 0 : -1));
  const bTotal = Number(b.total_points ?? (bPlayed ? 0 : -1));
  if (aTotal !== bTotal) {
    return bTotal - aTotal;
  }

  // 2. WWCD count (descending)
  const aWwcd = Number(a.wwcd_count || 0);
  const bWwcd = Number(b.wwcd_count || 0);
  if (aWwcd !== bWwcd) {
    return bWwcd - aWwcd;
  }

  // 3. Placement points (descending)
  const aPlacement = Number(a.total_placement_points || 0);
  const bPlacement = Number(b.total_placement_points || 0);
  if (aPlacement !== bPlacement) {
    return bPlacement - aPlacement;
  }

  // 4. Kill points (elimination points, counted once, descending)
  const aKills = Number(a.total_kill_points || 0);
  const bKills = Number(b.total_kill_points || 0);
  if (aKills !== bKills) {
    return bKills - aKills;
  }

  // 5. Best finish position in the most recent match of the scope
  // (A team with no result in that match ranks after teams that have one; lower placement number is better)
  const aRecent = a.recent_match_placement != null ? Number(a.recent_match_placement) : null;
  const bRecent = b.recent_match_placement != null ? Number(b.recent_match_placement) : null;

  if (aRecent !== null && bRecent === null) return -1;
  if (bRecent !== null && aRecent === null) return 1;
  if (aRecent !== null && bRecent !== null && aRecent !== bRecent) {
    return aRecent - bRecent;
  }

  // True Tie
  return 0;
}

/**
 * Sorts and ranks an array of team score aggregates.
 * Assigns dense/shared rank markers for true ties (e.g. 1, 2, 2, 4).
 *
 * @param {Array<object>} teams
 * @returns {Array<object>} Ranked team objects with rank, is_tied, display_rank
 */
export function rankTeams(teams) {
  if (!Array.isArray(teams) || teams.length === 0) {
    return [];
  }

  const sorted = [...teams].sort((a, b) => {
    const cmp = compareTeams(a, b);
    if (cmp !== 0) return cmp;
    // Stable deterministic fallback for render ordering (never affects qualification decisions)
    return String(a.team_name || '').localeCompare(String(b.team_name || ''));
  });

  const ranked = [];
  let currentRank = 1;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = i < sorted.length - 1 ? sorted[i + 1] : null;

    const tiedWithPrev = prev ? compareTeams(item, prev) === 0 : false;
    const tiedWithNext = next ? compareTeams(item, next) === 0 : false;
    const isTied = tiedWithPrev || tiedWithNext;

    if (!tiedWithPrev) {
      currentRank = i + 1;
    }

    const hasScores = item.matches_played != null && item.matches_played > 0;
    const rankValue = hasScores ? currentRank : null;
    const displayRank = hasScores
      ? (isTied ? `T-${currentRank}` : `${currentRank}`)
      : '-';

    ranked.push({
      ...item,
      rank: rankValue,
      display_rank: displayRank,
      is_tied: isTied && hasScores,
    });
  }

  return ranked;
}

/**
 * Detects if a true tie exists at the qualification cutoff boundary.
 * Cutoff ties block automatic qualification and require explicit organizer resolution.
 *
 * @param {Array<object>} rankedTeams - Pre-ranked teams
 * @param {number} cutoffCount - Target advancing slots (e.g. 4)
 * @returns {{
 *   hasTie: boolean,
 *   tiedTeams: Array<object>,
 *   cutoffRank: number|null,
 *   availableSlots: number
 * }}
 */
export function detectCutoffTie(rankedTeams, cutoffCount) {
  const eligible = rankedTeams.filter((t) => !t.is_disqualified && (t.matches_played || 0) > 0);
  const cutoff = Math.max(1, parseInt(cutoffCount, 10) || 1);

  if (eligible.length <= cutoff) {
    return { hasTie: false, tiedTeams: [], cutoffRank: null, availableSlots: 0 };
  }

  const lastInside = eligible[cutoff - 1];
  const firstOutside = eligible[cutoff];

  // If the last advancing team compares equal to the first non-advancing team, cutoff is tied
  if (compareTeams(lastInside, firstOutside) === 0) {
    const tiedTeams = eligible.filter((t) => compareTeams(t, lastInside) === 0);
    const guaranteedCount = eligible.filter((t) => compareTeams(t, lastInside) < 0).length;
    const availableSlots = Math.max(0, cutoff - guaranteedCount);

    return {
      hasTie: true,
      tiedTeams,
      cutoffRank: lastInside.rank || cutoff,
      availableSlots,
    };
  }

  return { hasTie: false, tiedTeams: [], cutoffRank: null, availableSlots: 0 };
}
