// server/roadmapDistricts.js
// Pure, shared utilities for resolving round districts, smart default district selection,
// unscheduled districts tracking, and consistent render-time district display naming.

/**
 * Single shared function that produces the display name of every district everywhere:
 * group headers, match district dropdowns, "Districts not scheduled yet" warning,
 * participant view, preview, publish validation messages.
 *
 * Rules:
 * 1. Round N district: "Round N · District X" (e.g. "Round 1 · District 1", "Round 2 · District 2").
 *    No "Qualifiers District X" or "Lobby X" anywhere.
 * 2. Grand Final:
 *    - If the round has exactly one district, show "Grand Final" with no number.
 *    - If it has more than one, name every one of them consistently with the same prefix and number:
 *      "Grand Final · District 1", "Grand Final · District 2".
 * 3. The prefix rule is all-or-nothing: either every district in a round carries the prefix or none does.
 * 4. Stored legacy strings in old roadmaps (e.g. "Qualifiers District 1", "Lobby 2") are dynamically
 *    re-computed from round order number and district number at render time.
 *
 * @param {Object} options - { roundNumber, districtNumber, totalDistricts, isGrandFinal, roundName, roundType }
 * @returns {string} The standardized display name
 */
export function getDistrictDisplayName({
  roundNumber = 1,
  districtNumber = 1,
  totalDistricts = 1,
  isGrandFinal = false,
  roundName = '',
  roundType = '',
} = {}) {
  const isGF = isGrandFinal ||
    roundType === 'grand_final' ||
    Boolean(roundName && /grand\s*final/i.test(roundName));

  const dNum = Math.max(1, Number(districtNumber) || 1);
  const totalDists = Math.max(1, Number(totalDistricts) || 1);

  if (isGF) {
    if (totalDists <= 1) {
      return 'Grand Final';
    }
    return `Grand Final · District ${dNum}`;
  }

  const rNum = Math.max(1, Number(roundNumber) || 1);
  return `Round ${rNum} · District ${dNum}`;
}

/**
 * Extracts a 1-based district number from an allocation or district object.
 * Inspects sequence, display_order, trailing digits in district_id, or digits in stored legacy names.
 */
export function extractDistrictNumber(allocOrDist, fallbackIndex = 1) {
  if (!allocOrDist) return fallbackIndex;
  if (typeof allocOrDist === 'number') return Math.max(1, allocOrDist);

  if (allocOrDist.sequence != null && Number(allocOrDist.sequence) > 0) {
    return Number(allocOrDist.sequence);
  }
  if (allocOrDist.display_order != null && Number(allocOrDist.display_order) > 0) {
    return Number(allocOrDist.display_order);
  }

  const idStr = String(allocOrDist.district_id || allocOrDist.id || '');
  const idMatch = idStr.match(/(?:dist|group|lobby)[-_]?(\d+)$/i);
  if (idMatch) {
    return parseInt(idMatch[1], 10);
  }

  const nameStr = String(allocOrDist.district_name || allocOrDist.name || '');
  const nameMatch = nameStr.match(/(?:District|Lobby)\s*(\d+)/i);
  if (nameMatch) {
    return parseInt(nameMatch[1], 10);
  }

  return fallbackIndex;
}

/**
 * Resolves the display name for any allocation or district in the context of its round.
 */
export function resolveDistrictDisplayName(round, allocOrDist, allocIdx = 0, totalDistricts = 1) {
  const isGrandFinal = Boolean(
    round?.round_type === 'grand_final' ||
    round?.is_grand_final ||
    (round?.name && /grand\s*final/i.test(round.name))
  );
  const roundNumber = round?.round_number || 1;
  const districtNumber = extractDistrictNumber(allocOrDist, allocIdx + 1);

  return getDistrictDisplayName({
    roundNumber,
    districtNumber,
    totalDistricts,
    isGrandFinal,
  });
}

/**
 * Resolves the complete list of districts/lobbies for a given round with standardized naming.
 *
 * @param {Object} round - The round object
 * @param {number} rIdx - 0-based round index
 * @param {Array} allDistricts - Tournament districts from database / meta
 * @param {Object} options - { teams_per_group, slotsTotal, totalRounds }
 * @returns {Array<{ id: string, name: string, capacity?: number, districtNumber: number }>}
 */
export function getRoundDistricts(round, rIdx = 0, allDistricts = [], options = {}) {
  if (!round) return [];

  const teamsPerGroup = Number(options.teams_per_group || 16);
  const totalRounds = Number(options.totalRounds || 1);
  const isGrandFinal = round.round_type === 'grand_final' || round.is_grand_final ||
    (!round.round_type && totalRounds > 1 && rIdx === totalRounds - 1) ||
    Boolean(round.name && /grand\s*final/i.test(round.name));

  const roundNum = round.round_number || rIdx + 1;
  const result = [];
  const seenIds = new Set();

  // Create a lookup for existing allocations in round.days to preserve existing IDs
  const existingAllocs = [];
  for (const day of (round.days || [])) {
    for (const alloc of (day.allocations || [])) {
      const aId = String(alloc.district_id || alloc.id || '');
      if (aId) {
        existingAllocs.push({ id: aId, alloc, capacity: alloc.capacity || teamsPerGroup });
      }
    }
  }

  if (rIdx === 0 && !isGrandFinal) {
    // Round 1
    let count = 1;
    if (Array.isArray(allDistricts) && allDistricts.length > 0) {
      count = allDistricts.length;
    } else if (options.slotsTotal && Number(options.slotsTotal) > 0) {
      count = Math.max(1, Math.ceil(Number(options.slotsTotal) / teamsPerGroup));
    } else if (existingAllocs.length > 0) {
      count = existingAllocs.length;
    }

    for (let i = 1; i <= count; i++) {
      const d = allDistricts[i - 1];
      const existingId = existingAllocs[i - 1]?.id;
      const id = String(existingId || d?.id || d?.district_id || `dist-${i}`);
      const name = getDistrictDisplayName({
        roundNumber: roundNum,
        districtNumber: i,
        totalDistricts: count,
        isGrandFinal: false,
      });

      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({ id, name, capacity: d?.capacity || teamsPerGroup, districtNumber: i });
      }
    }
  } else if (isGrandFinal) {
    // Grand Final
    let lobbyCount = round.lobby_capacities?.length;
    if (lobbyCount == null) {
      if (round.teams_in != null && Number(round.teams_in) > 0) {
        lobbyCount = Math.max(1, Math.ceil(Number(round.teams_in) / teamsPerGroup));
      } else if (existingAllocs.length > 0) {
        lobbyCount = existingAllocs.length;
      } else {
        lobbyCount = 1;
      }
    }

    for (let i = 1; i <= lobbyCount; i++) {
      const existing = existingAllocs[i - 1];
      const id = String(existing?.id || `${round.id || 'gf'}-dist-${i}`);
      const name = getDistrictDisplayName({
        roundNumber: roundNum,
        districtNumber: i,
        totalDistricts: lobbyCount,
        isGrandFinal: true,
      });

      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({
          id,
          name,
          capacity: round.lobby_capacities?.[i - 1] || teamsPerGroup,
          districtNumber: i,
        });
      }
    }
  } else {
    // Later Qualifier Round (Round 2+)
    let lobbyCount = round.lobby_capacities?.length;
    if (lobbyCount == null) {
      if (round.teams_in != null && Number(round.teams_in) > 0) {
        lobbyCount = Math.max(1, Math.ceil(Number(round.teams_in) / teamsPerGroup));
      } else if (existingAllocs.length > 0) {
        lobbyCount = existingAllocs.length;
      } else {
        lobbyCount = 1;
      }
    }

    for (let i = 1; i <= lobbyCount; i++) {
      const existing = existingAllocs[i - 1];
      const id = String(existing?.id || `${round.id || `r${roundNum}`}-dist-${i}`);
      const name = getDistrictDisplayName({
        roundNumber: roundNum,
        districtNumber: i,
        totalDistricts: lobbyCount,
        isGrandFinal: false,
      });

      if (!seenIds.has(id)) {
        seenIds.add(id);
        result.push({
          id,
          name,
          capacity: round.lobby_capacities?.[i - 1] || teamsPerGroup,
          districtNumber: i,
        });
      }
    }
  }

  // Include any extra existing allocations not captured yet
  for (let idx = 0; idx < existingAllocs.length; idx++) {
    const ea = existingAllocs[idx];
    if (!seenIds.has(ea.id)) {
      seenIds.add(ea.id);
      const dNum = extractDistrictNumber(ea.alloc, result.length + 1);
      result.push({
        id: ea.id,
        name: getDistrictDisplayName({
          roundNumber: roundNum,
          districtNumber: dNum,
          totalDistricts: Math.max(result.length + 1, 2),
          isGrandFinal,
        }),
        capacity: ea.capacity,
        districtNumber: dNum,
      });
    }
  }

  return result;
}

/**
 * Smart default district selection for adding a match:
 * 1. Pre-select the first district in that round that has no match yet (across all days).
 * 2. If every district already has a match, pre-select the district with the fewest matches.
 *
 * @param {Array} roundDistricts - All districts for this round
 * @param {Array} roundDays - Days in this round
 * @returns {Object|null} Selected district object
 */
export function getDefaultDistrictForNewMatch(roundDistricts = [], roundDays = []) {
  if (!roundDistricts || roundDistricts.length === 0) return null;

  const matchCounts = new Map();
  for (const dist of roundDistricts) {
    matchCounts.set(dist.id, 0);
  }

  for (const day of (roundDays || [])) {
    for (const alloc of (day.allocations || [])) {
      const allocDistId = alloc.district_id || alloc.id;
      const matches = Array.isArray(alloc.matches) ? alloc.matches : [];
      for (const m of matches) {
        const dId = m.district_id || allocDistId;
        if (dId && matchCounts.has(dId)) {
          matchCounts.set(dId, matchCounts.get(dId) + 1);
        }
      }
    }
  }

  // 1. First district with 0 matches scheduled across all days in this round
  for (const dist of roundDistricts) {
    if (matchCounts.get(dist.id) === 0) {
      return dist;
    }
  }

  // 2. District with fewest matches (tie-break: first in round order)
  let minCount = Infinity;
  let bestDist = roundDistricts[0];
  for (const dist of roundDistricts) {
    const count = matchCounts.get(dist.id) ?? 0;
    if (count < minCount) {
      minCount = count;
      bestDist = dist;
    }
  }

  return bestDist;
}

/**
 * Returns districts in the round that have no matches scheduled yet across any day.
 *
 * @param {Array} roundDistricts - All districts for this round
 * @param {Array} roundDays - Days in this round
 * @returns {Array} List of unscheduled district objects
 */
export function getUnscheduledDistrictsForRound(roundDistricts = [], roundDays = []) {
  if (!roundDistricts || roundDistricts.length === 0) return [];

  const scheduledDistIds = new Set();
  for (const day of (roundDays || [])) {
    for (const alloc of (day.allocations || [])) {
      const allocDistId = alloc.district_id || alloc.id;
      const matches = Array.isArray(alloc.matches) ? alloc.matches : [];
      for (const m of matches) {
        const dId = m.district_id || allocDistId;
        if (dId) {
          scheduledDistIds.add(dId);
        }
      }
    }
  }

  return roundDistricts.filter((dist) => !scheduledDistIds.has(dist.id));
}
