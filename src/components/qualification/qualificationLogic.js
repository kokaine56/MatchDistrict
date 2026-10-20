// src/components/qualification/qualificationLogic.js
// Pure helper functions for Leaderboard Round Qualification logic:
// Preset selection, cutoff tie detection, snake placement, and error mapping.

/**
 * Derives prefilled team selection based on the chosen mode and roadmap rules.
 * Never includes disqualified teams.
 *
 * @param {Object} summary - Payload from GET /api/tournaments/:id/rounds/:roundId/advancement-summary
 * @param {'per_district' | 'overall' | 'manual'} mode
 * @returns {string[]} Array of selected team_ids
 */
export function derivePlannedSelection(summary, mode = null) {
  if (!summary) return [];

  const plannedRule = summary.planned_rule || {};
  const activeMode = mode || plannedRule.advancement_type || 'per_district';
  const disqualifiedSet = new Set(summary.disqualified_team_ids || []);

  if (activeMode === 'per_district') {
    const topPerDist = Number(plannedRule.teams_advancing_per_district) || 2;
    const selected = [];
    const districts = Array.isArray(summary.districts) ? summary.districts : [];

    for (const dist of districts) {
      const eligibleTeams = (dist.teams || []).filter(
        (t) => t && t.team_id && !t.is_disqualified && !disqualifiedSet.has(t.team_id)
      );
      for (let i = 0; i < Math.min(topPerDist, eligibleTeams.length); i++) {
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

  return eligibleOverall.slice(0, topOverall).map((t) => t.team_id);
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
  const activeMode = mode || plannedRule.advancement_type || 'per_district';

  if (activeMode === 'per_district') {
    const topPerDist = Number(plannedRule.teams_advancing_per_district) || 2;
    const districtCount = Array.isArray(summary.districts) ? summary.districts.length : 0;
    return districtCount * topPerDist;
  }

  return Number(plannedRule.teams_advancing) || 16;
}

/**
 * Detects whether any team just outside the cutoff has the exact same points
 * as the team right at the cutoff threshold.
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

  const cutoffPoints = Number(lastInside.total_points) || 0;
  const outsidePoints = Number(firstOutside.total_points) || 0;

  if (cutoffPoints === outsidePoints) {
    // Find all teams with this same total points
    const tiedTeams = eligible.filter((t) => (Number(t.total_points) || 0) === cutoffPoints);
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

  // Build points map
  const pointsMap = new Map();
  const teamObjectMap = new Map();
  for (const t of standings || []) {
    if (t && t.team_id) {
      pointsMap.set(t.team_id, Number(t.total_points) || 0);
      teamObjectMap.set(t.team_id, t);
    }
  }

  // Sort selected teams descending by points
  const sortedIds = [...selectedTeamIds].sort(
    (a, b) => (pointsMap.get(b) || 0) - (pointsMap.get(a) || 0)
  );

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
