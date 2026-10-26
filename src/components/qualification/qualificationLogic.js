// src/components/qualification/qualificationLogic.js
// Pure helper functions for Leaderboard Round Qualification logic:
// Preset selection, cutoff tie detection, snake placement, and error mapping.

export const TIE_BREAK_RULES_DESCRIPTION =
  '1. Total WWCDs | 2. Total placement points | 3. Total elimination points | 4. Best placement in most recent match';

/**
 * Strict tie-break comparison between two teams for equal total points:
 *   1. Total WWCDs (1st place finishes), higher wins
 *   2. Total placement points, higher wins
 *   3. Total elimination (kill) points, higher wins
 *   4. Best placement in the most recent match, higher wins (1st beats 2nd; lower placement number wins; no-result loses)
 *
 * Returns:
 *   negative if team a ranks higher than team b
 *   positive if team b ranks higher than team a
 *   0 if ALL four criteria are equal (true tie)
 */
export function compareTeams(a, b) {
  // Primary: Total points (higher wins -> descending)
  const aPts = Number(a?.total_points ?? a?.points) || 0;
  const bPts = Number(b?.total_points ?? b?.points) || 0;
  if (bPts !== aPts) return bPts - aPts;

  // Criterion 1: Total WWCDs (1st place finishes), higher wins
  const aWwcd = Number(a?.wwcd_count ?? a?.wwcd) || 0;
  const bWwcd = Number(b?.wwcd_count ?? b?.wwcd) || 0;
  if (bWwcd !== aWwcd) return bWwcd - aWwcd;

  // Criterion 2: Total placement points, higher wins
  const aPlacePts = Number(a?.total_placement_points ?? a?.placement_points) || 0;
  const bPlacePts = Number(b?.total_placement_points ?? b?.placement_points) || 0;
  if (bPlacePts !== aPlacePts) return bPlacePts - aPlacePts;

  // Criterion 3: Total elimination (kill) points, higher wins
  const aKillPts = Number(a?.total_kill_points ?? a?.kill_points ?? a?.total_kills ?? a?.kills) || 0;
  const bKillPts = Number(b?.total_kill_points ?? b?.kill_points ?? b?.total_kills ?? b?.kills) || 0;
  if (bKillPts !== aKillPts) return bKillPts - aKillPts;

  // Criterion 4: Best placement in the most recent match (1st beats 2nd; no-result loses)
  const aHasPlacement =
    a?.last_match_placement != null &&
    Number.isFinite(Number(a.last_match_placement)) &&
    Number(a.last_match_placement) > 0;
  const bHasPlacement =
    b?.last_match_placement != null &&
    Number.isFinite(Number(b.last_match_placement)) &&
    Number(b.last_match_placement) > 0;

  if (aHasPlacement && bHasPlacement) {
    const aPlacement = Number(a.last_match_placement);
    const bPlacement = Number(b.last_match_placement);
    if (aPlacement !== bPlacement) return aPlacement - bPlacement;
  } else if (aHasPlacement && !bHasPlacement) {
    return -1;
  } else if (!aHasPlacement && bHasPlacement) {
    return 1;
  }

  // All 4 criteria are equal: true tie
  return 0;
}

/**
 * Deterministic ranking order enforcing strict tie-break rules:
 *   1. Total points (higher wins)
 *   2. Total WWCDs (1st place finishes, higher wins)
 *   3. Total placement points, higher wins
 *   4. Total elimination (kill) points, higher wins
 *   5. Best placement in the most recent match, higher wins (1st beats 2nd)
 *   6. Fallback for display stability: slot_number (asc) then team_id (asc)
 */
export function sortAndRank(rows = []) {
  if (!Array.isArray(rows)) return [];

  const sorted = [...rows].sort((a, b) => {
    const cmp = compareTeams(a, b);
    if (cmp !== 0) return cmp;

    const aSlot = a?.slot_number != null ? Number(a.slot_number) : 99999;
    const bSlot = b?.slot_number != null ? Number(b.slot_number) : 99999;
    if (aSlot !== bSlot) return aSlot - bSlot;

    const aId = String(a?.team_id || a?.id || '');
    const bId = String(b?.team_id || b?.id || '');
    return aId.localeCompare(bId);
  });

  const pointsCount = new Map();
  for (const r of sorted) {
    const pts = Number(r?.total_points ?? r?.points) || 0;
    pointsCount.set(pts, (pointsCount.get(pts) || 0) + 1);
  }

  return sorted.map((row, idx) => {
    const pts = Number(row?.total_points ?? row?.points) || 0;
    const tieNeeded = (pointsCount.get(pts) || 0) > 1;
    const isTrueTie = sorted.some((other, oIdx) => oIdx !== idx && compareTeams(row, other) === 0);

    return {
      ...row,
      rank: idx + 1,
      tie_broken: tieNeeded,
      is_true_tie: isTrueTie,
    };
  });
}

/**
 * Derives prefilled team selection based on the chosen mode and roadmap rules.
 * Never includes disqualified teams.
 * When a true tie exists at the cutoff threshold across all 4 criteria,
 * the tied teams are excluded from automatic prefill so the organizer must choose manually.
 *
 * @param {Object} summary - Payload from GET /api/tournaments/:id/rounds/:roundId/advancement-summary
 * @param {'per_district' | 'overall' | 'manual'} mode
 * @returns {string[]} Array of selected team_ids
 */
export function derivePlannedSelection(summary, mode = null) {
  if (!summary) return [];

  const plannedRule = summary.planned_rule || {};
  const hasDistricts = Array.isArray(summary.districts) && summary.districts.length > 0;
  const activeMode = (mode === 'per_district' && !hasDistricts) ? 'overall' : (mode || plannedRule.advancement_type || (hasDistricts ? 'per_district' : 'overall'));
  const disqualifiedSet = new Set(summary.disqualified_team_ids || []);

  if (activeMode === 'per_district' && hasDistricts) {
    const topPerDist = Number(plannedRule.teams_advancing_per_district) || 2;
    const selected = [];
    const districts = summary.districts;

    for (const dist of districts) {
      const eligibleTeams = (dist.teams || []).filter(
        (t) => t && t.team_id && !t.is_disqualified && !disqualifiedSet.has(t.team_id)
      );

      const tieCheck = detectCutoffTies(eligibleTeams, topPerDist);
      const limit = tieCheck.hasTie
        ? Math.max(0, topPerDist - eligibleTeams.filter((t, i) => i < topPerDist && compareTeams(t, eligibleTeams[topPerDist - 1]) === 0).length)
        : Math.min(topPerDist, eligibleTeams.length);

      for (let i = 0; i < Math.min(limit, eligibleTeams.length); i++) {
        selected.push(eligibleTeams[i].team_id);
      }
    }
    return selected;
  }

  // Overall mode (or default for manual prefill)
  const topOverall = Number(plannedRule.teams_advancing) || 16;
  const overallStandings = Array.isArray(summary.standings) ? summary.standings : [];
  const eligibleOverall = overallStandings.filter(
    (t) => t && t.team_id && !t.is_disqualified && !disqualifiedSet.has(t.team_id)
  );

  const tieCheck = detectCutoffTies(eligibleOverall, topOverall);
  const limit = tieCheck.hasTie
    ? Math.max(0, topOverall - eligibleOverall.filter((t, i) => i < topOverall && compareTeams(t, eligibleOverall[topOverall - 1]) === 0).length)
    : Math.min(topOverall, eligibleOverall.length);

  return eligibleOverall.slice(0, limit).map((t) => t.team_id);
}

/**
 * Calculates planned target count from roadmap rule.
 *
 * @param {Object} summary
 * @param {'per_district' | 'overall' | 'manual'} mode
 * @returns {number}
 */
export function getPlannedCount(summary, mode) {
  if (!summary) return 0;
  const plannedRule = summary.planned_rule || {};
  const hasDistricts = Array.isArray(summary.districts) && summary.districts.length > 0;
  const activeMode = (mode === 'per_district' && !hasDistricts) ? 'overall' : (mode || plannedRule.advancement_type || (hasDistricts ? 'per_district' : 'overall'));

  if (activeMode === 'per_district' && hasDistricts) {
    const topPerDist = Number(plannedRule.teams_advancing_per_district) || 2;
    return summary.districts.length * topPerDist;
  }

  return Number(plannedRule.teams_advancing) || 16;
}

/**
 * Detects whether a cutoff tie exists.
 * A cutoff tie is flagged ONLY when ALL FOUR tie-break criteria are equal
 * between the last inside team and the first outside team:
 *   1. Total WWCDs
 *   2. Total placement points
 *   3. Total elimination (kill) points
 *   4. Best placement in the most recent match
 * Anything resolved by a criterion is NOT flagged.
 *
 * @param {Array<Object>} standings - Array of team standings sorted by rank
 * @param {number} cutoffCount - Planned cutoff threshold
 * @returns {{ hasTie: boolean, cutoffScore: number | null, tiedTeams: Array<Object> }}
 */
export function detectCutoffTies(standings = [], cutoffCount = 0) {
  if (!Array.isArray(standings) || cutoffCount <= 0 || cutoffCount >= standings.length) {
    return { hasTie: false, cutoffScore: null, tiedTeams: [] };
  }

  const eligible = standings.filter((t) => !t.is_disqualified);
  if (cutoffCount <= 0 || cutoffCount >= eligible.length) {
    return { hasTie: false, cutoffScore: null, tiedTeams: [] };
  }

  const lastInside = eligible[cutoffCount - 1];
  const firstOutside = eligible[cutoffCount];

  if (!lastInside || !firstOutside) {
    return { hasTie: false, cutoffScore: null, tiedTeams: [] };
  }

  // Compare all four tie-break criteria
  const cmp = compareTeams(lastInside, firstOutside);
  const cutoffPoints = Number(lastInside.total_points ?? lastInside.points) || 0;

  // A cutoff tie is flagged ONLY when ALL four criteria are equal (compareTeams returns 0)
  if (cmp === 0) {
    const tiedTeams = eligible.filter((t) => compareTeams(t, lastInside) === 0);
    return {
      hasTie: true,
      cutoffScore: cutoffPoints,
      tiedTeams,
    };
  }

  return { hasTie: false, cutoffScore: cutoffPoints, tiedTeams: [] };
}

/**
 * Computes default snake-seeding distribution of selected teams into target districts.
 * Orders teams by standings rank (which incorporates full tie-break resolution).
 *
 * @param {string[]} selectedTeamIds
 * @param {Array<Object>} standings
 * @param {Array<Object>} targetDistricts
 * @returns {{ placementMap: Object.<string, string>, districtBuckets: Object.<string, Array<Object>> }}
 */
export function computeSnakePlacement(selectedTeamIds = [], standings = [], targetDistricts = []) {
  if (!Array.isArray(selectedTeamIds) || selectedTeamIds.length === 0) {
    return { placementMap: {}, districtBuckets: {} };
  }

  const districts = Array.isArray(targetDistricts) ? targetDistricts : [];
  const numDistricts = districts.length;

  // Build rank and object map
  const rankMap = new Map();
  const teamObjectMap = new Map();
  for (let idx = 0; idx < (standings || []).length; idx++) {
    const t = standings[idx];
    if (t && t.team_id) {
      rankMap.set(t.team_id, t.rank != null ? Number(t.rank) : idx + 1);
      teamObjectMap.set(t.team_id, t);
    }
  }

  // Sort selected teams by rank (tie-broken order) with points desc fallback
  const sortedIds = [...selectedTeamIds].sort((a, b) => {
    const rA = rankMap.get(a) ?? 9999;
    const rB = rankMap.get(b) ?? 9999;
    if (rA !== rB) return rA - rB;
    const pA = Number(teamObjectMap.get(a)?.total_points) || 0;
    const pB = Number(teamObjectMap.get(b)?.total_points) || 0;
    return pB - pA;
  });

  const placementMap = {};
  const districtBuckets = {};
  for (const d of districts) {
    districtBuckets[d.id] = [];
  }

  for (let i = 0; i < sortedIds.length; i++) {
    const teamId = sortedIds[i];
    let assignedDistrictId = null;

    if (numDistricts > 0) {
      const cycle = 2 * numDistricts;
      const pos = i % cycle;
      const distIdx = pos < numDistricts ? pos : (2 * numDistricts - 1) - pos;
      assignedDistrictId = districts[distIdx].id;
    }

    placementMap[teamId] = assignedDistrictId;
    if (assignedDistrictId && districtBuckets[assignedDistrictId]) {
      const teamObj = teamObjectMap.get(teamId) || { team_id: teamId, team_name: teamId };
      districtBuckets[assignedDistrictId].push({
        ...teamObj,
        seed: i + 1,
      });
    }
  }

  return { placementMap, districtBuckets };
}

/**
 * Reconciles default snake placement with user manual overrides.
 *
 * @param {Object.<string, string>} defaultMap
 * @param {Object.<string, string>} overrides
 * @returns {Object.<string, string>}
 */
export function reconcileManualPlacement(defaultMap = {}, overrides = {}) {
  return {
    ...defaultMap,
    ...overrides,
  };
}

/**
 * Maps server-side error codes to friendly human-readable error messages.
 *
 * @param {string} code
 * @param {string} [fallback]
 * @returns {string}
 */
export function formatAdvancementError(code, fallback = 'Failed to qualify teams.') {
  switch (code) {
    case 'SOURCE_MATCHES_UNVERIFIED':
      return 'Some matches in this round lack verified results. Verify all match scores or check "Advance anyway" to bypass.';
    case 'TARGET_ROUND_HAS_RESULTS':
      return 'Cannot advance teams: the target round already has recorded match results. That stage is locked.';
    case 'TEAM_DISQUALIFIED':
      return 'One or more selected teams have been marked disqualified and cannot advance.';
    case 'TEAM_DID_NOT_PLAY_SOURCE_ROUND':
      return 'One or more selected teams did not participate in this round.';
    case 'DUPLICATE_TEAMS':
      return 'Duplicate team IDs detected in advancement selection.';
    case 'ROUND_NOT_FOUND':
      return 'Source or target round not found in this tournament roadmap.';
    case 'INVALID_PLACEMENT':
      return 'One or more manual district placements are invalid for the target round.';
    case 'ROADMAP_HAS_ASSIGNMENTS':
      return 'Cannot modify roadmap structure while team match assignments exist.';
    case 'FORBIDDEN':
      return 'You do not have organizer permissions to qualify teams for this tournament.';
    case 'UNAUTHORIZED':
      return 'Please sign in as the tournament organizer to qualify teams.';
    case 'NETWORK_ERROR':
      return 'Network connection issue. Please check your internet connection and try again.';
    default:
      return fallback;
  }
}
