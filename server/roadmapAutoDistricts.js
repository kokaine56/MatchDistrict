// server/roadmapAutoDistricts.js
// Pure, browser-compatible logic for automated district generation and synchronization
// for later rounds (Round 2+, Grand Finals).
//
// Rule: for every round after Round 1 (including Grand Finals), districts are auto-created
// from teams_in: districts = ceil(teams_in / teams_per_group).
// If teams_in is unknown, derive it from the previous round's qualifying count.
// If exactly one district, attach it to the round's only day automatically.
// Safe Update: if teams_in changes (qualifier count edited), districts with active
// team assignments or verified results are preserved, emitting a warning.

import { toMins, minsToHHMM } from './roadmapValidation.js';

function generateShortId(prefix = '') {
  let randStr = '';
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint8Array(4);
    crypto.getRandomValues(arr);
    randStr = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  } else {
    randStr = Math.random().toString(36).substring(2, 10).toUpperCase();
  }
  return prefix ? `${prefix}-${randStr}` : randStr;
}

/**
 * Pure calculation of advancing teams for a round based on configuration.
 * Grand Finals is the terminal stage and produces 0 advancing teams.
 */
export function calculateAdvancingTeams(roundConfig, districtCount = 0) {
  if (!roundConfig) return 0;
  if (roundConfig.round_type === 'grand_final') return 0;
  const advType = roundConfig.advancement_type || 'per_district';

  if (advType === 'per_district') {
    const perDist = Number(roundConfig.teams_advancing_per_district) || 0;
    const dists = districtCount || (Array.isArray(roundConfig.days)
      ? new Set(roundConfig.days.flatMap((d) => (d.allocations || []).map((a) => a.district_id || a.id || a.group_id))).size
      : 0);
    return Math.max(0, dists * perDist);
  }

  if (advType === 'per_match') {
    const perMatch = Number(roundConfig.teams_advancing_per_match) || 0;
    const matchCount = Array.isArray(roundConfig.days)
      ? roundConfig.days.reduce((acc, d) => acc + (d.allocations || []).reduce((a2, a) => a2 + (Number(a.match_count) || (a.matches ? a.matches.length : 0)), 0), 0)
      : 0;
    return Math.max(0, matchCount * perMatch);
  }

  if (advType === 'overall' || advType === 'round_total' || advType === 'manual') {
    return Math.max(0, Number(roundConfig.teams_advancing) || 0);
  }

  return Math.max(0, Number(roundConfig.teams_advancing) || 0);
}

/**
 * Automatically creates and synchronizes district allocations and technical matches
 * for later rounds (Round 2+, including Grand Finals).
 *
 * @param {Object} roadmapData - { rounds: [...] }
 * @param {Object} options - { teams_per_group, protectedGroupIds }
 * @returns {Object} { warnings: string[] }
 */
export function syncAutoDistrictsForLaterRounds(roadmapData, options = {}) {
  if (!roadmapData || !Array.isArray(roadmapData.rounds)) {
    return { warnings: [] };
  }

  const rounds = roadmapData.rounds;
  const teamsPerGroup = Math.max(2, Number(options.teams_per_group || 16));
  const protectedGroupIds = options.protectedGroupIds instanceof Set
    ? options.protectedGroupIds
    : new Set(Array.isArray(options.protectedGroupIds) ? options.protectedGroupIds : []);
  const warnings = [];

  let prevRoundAdvancing = null;

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const round = rounds[rIdx];
    const isRound1 = rIdx === 0;

    if (isRound1) {
      if (options.slotsTotal && Number(options.slotsTotal) > 0) {
        round.teams_in = Number(options.slotsTotal);
      }
      if (rIdx < rounds.length - 1 && round.round_type !== 'grand_final') {
        round.advancement_target_round_id = rounds[rIdx + 1]?.id || null;
      }
      prevRoundAdvancing = calculateAdvancingTeams(round);
      continue;
    }

    // Later round (Round 2+, Grand Finals)
    let teamsIn = (options.forceAutoTeamsIn && prevRoundAdvancing != null && prevRoundAdvancing > 0)
      ? prevRoundAdvancing
      : (round.teams_in != null && !isNaN(round.teams_in) && Number(round.teams_in) > 0
          ? Number(round.teams_in)
          : (prevRoundAdvancing != null && prevRoundAdvancing > 0 ? prevRoundAdvancing : 16));
    round.teams_in = teamsIn;

    if (rIdx < rounds.length - 1 && round.round_type !== 'grand_final') {
      round.advancement_target_round_id = rounds[rIdx + 1]?.id || null;
    } else if (round.round_type === 'grand_final') {
      round.advancement_target_round_id = null;
    }

    const neededDistrictCount = Math.max(1, Math.ceil(teamsIn / teamsPerGroup));

    // Ensure round has at least one day
    if (!Array.isArray(round.days) || round.days.length === 0) {
      round.days = [{
        id: `DAY-${round.id || rIdx + 1}-1`,
        day_number: 1,
        date: round.date || null,
        allocations: [],
      }];
    }

    // Collect all existing allocations from all days
    const existingAllocList = [];
    for (const day of round.days) {
      if (!Array.isArray(day.allocations)) day.allocations = [];
      for (const alloc of day.allocations) {
        existingAllocList.push({ day, alloc });
      }
    }

    const isGrandFinal = round.round_type === 'grand_final' || round.is_grand_final || (!round.round_type && rIdx === rounds.length - 1 && rounds.length > 1);

    const targetAllocations = [];

    // Step A: Keep existing allocations up to neededDistrictCount, or if protected
    for (let i = 0; i < existingAllocList.length; i++) {
      const item = existingAllocList[i];
      const alloc = item.alloc;
      const gId = alloc.group_id || alloc.district_id || alloc.id;
      const isProtected = gId && protectedGroupIds.has(gId);

      if (targetAllocations.length < neededDistrictCount || isProtected) {
        if (targetAllocations.length >= neededDistrictCount && isProtected) {
          warnings.push(
            `Cannot remove district "${alloc.district_name || alloc.name || gId}" from "${round.name || `Round ${rIdx + 1}`}": district already has team assignments or verified results.`
          );
        }

        const distNum = targetAllocations.length + 1;
        const defaultName = isGrandFinal
          ? (neededDistrictCount === 1 ? 'Grand Finals' : `Grand Finals - District ${distNum}`)
          : `District ${distNum}`;
        alloc.district_name = alloc.district_name || defaultName;
        alloc.name = alloc.name || alloc.district_name;
        alloc.capacity = alloc.capacity || teamsPerGroup;

        // Ensure match_count & matches exist
        const matchCount = Math.max(1, Number(alloc.match_count) || Number(round.match_count) || (Array.isArray(alloc.matches) && alloc.matches.length > 0 ? alloc.matches.length : 1));
        alloc.match_count = matchCount;

        if (!Array.isArray(alloc.matches) || alloc.matches.length === 0) {
          alloc.matches = [];
          for (let m = 0; m < matchCount; m++) {
            const startTime = round.time || '13:00';
            const startMins = toMins(startTime) != null ? toMins(startTime) + m * 30 : 13 * 60 + m * 30;
            const sStr = minsToHHMM(startMins);
            const eStr = minsToHHMM(startMins + 30);
            alloc.matches.push({
              id: `MAT-${round.id || rIdx + 1}-${distNum}-${m + 1}`,
              match_number: m + 1,
              district_match_number: m + 1,
              start_time: sStr,
              end_time: eStr,
              map: round.map || 'Erangel',
              status: 'PENDING',
              notes: '',
            });
          }
        } else if (alloc.matches.length !== matchCount) {
          // Adjust count if match_count was updated
          while (alloc.matches.length < matchCount) {
            const m = alloc.matches.length;
            const lastMatch = alloc.matches[m - 1];
            const prevStart = lastMatch ? toMins(lastMatch.start_time) : toMins(round.time || '13:00');
            const startMins = prevStart != null ? prevStart + 30 : 13 * 60 + m * 30;
            alloc.matches.push({
              id: `MAT-${round.id || rIdx + 1}-${distNum}-${m + 1}`,
              match_number: m + 1,
              district_match_number: m + 1,
              start_time: minsToHHMM(startMins),
              end_time: minsToHHMM(startMins + 30),
              map: round.map || lastMatch?.map || 'Erangel',
              status: 'PENDING',
              notes: '',
            });
          }
          if (alloc.matches.length > matchCount) {
            alloc.matches = alloc.matches.slice(0, matchCount);
          }
        }

        targetAllocations.push({ day: item.day, alloc });
      }
    }

    // Step B: Auto-create additional districts if needed
    while (targetAllocations.length < neededDistrictCount) {
      const distNum = targetAllocations.length + 1;
      const distName = isGrandFinal
        ? (neededDistrictCount === 1 ? 'Grand Finals' : `Grand Finals - District ${distNum}`)
        : `District ${distNum}`;
      const groupId = generateShortId('GRP');
      const matchCount = Math.max(1, Number(round.match_count) || 1);
      const matches = [];

      for (let m = 0; m < matchCount; m++) {
        const startTime = round.time || '13:00';
        const startMins = toMins(startTime) != null ? toMins(startTime) + m * 30 : 13 * 60 + m * 30;
        const sStr = minsToHHMM(startMins);
        const eStr = minsToHHMM(startMins + 30);
        matches.push({
          id: generateShortId('MAT'),
          match_number: m + 1,
          district_match_number: m + 1,
          start_time: sStr,
          end_time: eStr,
          map: round.map || 'Erangel',
          status: 'PENDING',
          notes: '',
        });
      }

      const newAlloc = {
        id: groupId,
        group_id: groupId,
        district_id: groupId,
        district_name: distName,
        name: distName,
        capacity: teamsPerGroup,
        sequence: distNum,
        display_order: distNum,
        match_count: matchCount,
        matches,
      };

      let assignedDay = round.days[0];
      if (neededDistrictCount === 1) {
        assignedDay = round.days[0];
      } else if (round.days.length > 1) {
        const dayIdx = (targetAllocations.length) % round.days.length;
        assignedDay = round.days[dayIdx] || round.days[0];
      }

      targetAllocations.push({ day: assignedDay, alloc: newAlloc });
    }

    // Step C: Re-assign target allocations to days
    if (isGrandFinal) {
      // In Grand Finals, all districts attach to EVERY Grand Finals day automatically (no district picker)
      // Days are never collapsed; 1 to 4+ days are fully supported with their own matches
      for (let dIdx = 0; dIdx < round.days.length; dIdx++) {
        const d = round.days[dIdx];
        const existingMap = new Map((d.allocations || []).map((a) => [a.district_id || a.id, a]));
        const dayAllocs = [];

        for (let tIdx = 0; tIdx < targetAllocations.length; tIdx++) {
          const td = targetAllocations[tIdx].alloc;
          const distId = td.district_id || td.id;
          const distName = td.district_name || td.name || (targetAllocations.length === 1 ? 'Grand Finals' : `District ${tIdx + 1}`);
          const existing = existingMap.get(distId) || existingMap.get(td.name);

          if (existing && Array.isArray(existing.matches) && existing.matches.length > 0) {
            dayAllocs.push({
              ...existing,
              district_id: distId,
              district_name: distName,
              sequence: tIdx + 1,
              display_order: tIdx + 1,
              match_count: existing.matches.length,
            });
          } else {
            dayAllocs.push({
              id: existing?.id || `ALLOC-${distId}-D${dIdx + 1}`,
              group_id: distId,
              district_id: distId,
              district_name: distName,
              sequence: tIdx + 1,
              display_order: tIdx + 1,
              match_count: 1,
              matches: [
                {
                  id: `MAT-${distId}-D${dIdx + 1}-1`,
                  district_match_number: 1,
                  start_time: '13:00',
                  end_time: '13:30',
                  map: 'Erangel',
                  status: 'PENDING',
                  notes: '',
                },
              ],
            });
          }
        }
        d.allocations = dayAllocs;
      }
    } else {
      for (const day of round.days) {
        day.allocations = [];
      }

      if (neededDistrictCount === 1) {
        round.days[0].allocations = [targetAllocations[0].alloc];
      } else {
        for (const item of targetAllocations) {
          const targetDay = round.days.find((d) => d.id === item.day?.id || d.day_number === item.day?.day_number) || round.days[0];
          targetDay.allocations.push(item.alloc);
        }
      }
    }

    prevRoundAdvancing = calculateAdvancingTeams(round);
  }

  return { warnings };
}
