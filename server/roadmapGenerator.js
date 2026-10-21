import crypto from 'crypto';
import {
  normalizeRoadmapConfig,
  validateRoadmapConfig,
  distributeDistrictSizes,
  computeDistrictCount,
  defaultTeamsAdvancing,
  parseTimeToMinutes,
  DEFAULT_TEAMS_PER_GROUP,
} from './roadmapConfig.js';
import { planRoadmapStages } from './roadmapPlanner.js';
import { addCalendarDays, toCalendarDateStr } from './roadmapDays.js';

export function getDefaultMap(game, matchNumber) {
  const gameKey = (game || 'bgmi').toLowerCase().trim();
  const DEFAULT_MAPS = {
    bgmi: ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
    'battlegrounds mobile india': ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
    freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
    'free fire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
    codm: ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
    'cod mobile': ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
    valorant: ['Ascent', 'Haven', 'Bind', 'Split', 'Sunset'],
  };
  const maps = DEFAULT_MAPS[gameKey] || DEFAULT_MAPS.bgmi;
  return maps[(Math.max(1, matchNumber) - 1) % maps.length] || 'Erangel';
}

export function computeReleaseTime12h(timeStr, offsetMinutes = 15) {
  if (!timeStr) return '';
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return '';
  let mins = parts[0] * 60 + parts[1] - offsetMinutes;
  if (mins < 0) mins += 1440;
  const relH = Math.floor(mins / 60) % 24;
  const relM = mins % 60;
  const period = relH >= 12 ? 'PM' : 'AM';
  const hour12 = relH % 12 === 0 ? 12 : relH % 12;
  return `${String(hour12).padStart(2, '0')}:${String(relM).padStart(2, '0')} ${period}`;
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function formatTime(mins) {
  const h = Math.floor(Math.abs(mins) / 60) % 24;
  const m = Math.abs(mins) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function pickFirst(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const k of keys) {
    const v = source[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function addDays(dateStr, n) {
  if (!dateStr) return null;
  return addCalendarDays(dateStr, n) || null;
}

const GRAND_FINAL_MATCHES = 3;

export function calculateQualifiers(matchSize) {
  return Math.ceil(matchSize / 2);
}

export function calculateProgressionPlan(totalTeams, maxCapacity, teamsPerGroup = 16, options = {}) {
  const tpg = Number(teamsPerGroup) || 16;
  const cap = Number(maxCapacity) || tpg;
  const canonicalCapacity = tpg;
  const total = Number(totalTeams);

  // Everything fits in a single match — no elimination rounds are needed.
  if (!Number.isFinite(total) || total <= cap) return [];
  const advancePerMatch = Number.isFinite(Number(options.teamsAdvancingPerDistrict)) && Number(options.teamsAdvancingPerDistrict) > 0
    ? Math.floor(Number(options.teamsAdvancingPerDistrict))
    : null;

  // Pure planner: guarantees progression funnels into a 1-lobby Grand Final
  const stages = planRoadmapStages({
    slotsTotal: total,
    teamsPerDistrict: tpg,
    grandFinalTeams: cap,
    teamsAdvancingPerDistrict: advancePerMatch,
  });

  const qualifierStages = stages.filter(s => s.roundType === 'qualifier');
  return qualifierStages.map(s => {
    const matchSizes = distributeDistrictSizes(s.teamsIn, tpg);
    let qualifiersPerMatch;
    if (s.advancementType === 'per_district' && s.teamsAdvancingPerDistrict != null) {
      qualifiersPerMatch = matchSizes.map(size => Math.min(size, s.teamsAdvancingPerDistrict));
    } else {
      const count = matchSizes.length;
      const base = Math.floor(s.teamsAdvancing / count);
      const extra = s.teamsAdvancing % count;
      qualifiersPerMatch = [];
      for (let i = 0; i < count; i++) {
        qualifiersPerMatch.push(base + (i < extra ? 1 : 0));
      }
    }
    return {
      roundNumber: s.roundNumber,
      matchCount: s.districtCount,
      matchSizes,
      qualifiersPerMatch,
      totalTeamsBefore: s.teamsIn,
      totalTeamsAfter: s.teamsAdvancing,
      qualificationType: s.teamsAdvancing <= cap ? 'final_elimination' : 'normal',
      advancementType: s.advancementType,
      teamsAdvancingPerDistrict: s.teamsAdvancingPerDistrict,
    };
  });
}

export function generateTournamentRoadmap(param1, legacyPlan, legacyTourn) {
  try {
    let tournament = {};
    if (param1 && typeof param1 === 'object') {
      tournament = { ...tournament, ...param1 };
    }
    if (legacyPlan && typeof legacyPlan === 'object') {
      tournament = { ...tournament, ...legacyPlan };
    }
    if (legacyTourn && typeof legacyTourn === 'object') {
      tournament = { ...tournament, ...legacyTourn };
    }

    if (!tournament || !tournament.id) {
      return { ok: false, error: 'Tournament data is required.' };
    }

    const rawSlots = pickFirst(tournament, ['slotsTotal', 'slots_total', 'teamsCount']);
    const slotsTotal = rawSlots === undefined ? 64 : parseInt(rawSlots, 10);
    const rawTpg = pickFirst(tournament, ['teams_per_group', 'teams_per_match']);
    const teamsPerGroup = rawTpg === undefined ? DEFAULT_TEAMS_PER_GROUP : parseInt(rawTpg, 10);
    const rawGf = pickFirst(tournament, ['grand_final_teams', 'grandFinalTeams', 'final_teams', 'finalTeams']);
    const grandFinalTeams = (rawGf !== undefined && rawGf !== null && rawGf !== '')
      ? Math.min(teamsPerGroup, Math.max(2, parseInt(rawGf, 10)))
      : teamsPerGroup;
    const maxCapacity = grandFinalTeams;

    // Organizer configuration (scheduling + qualification). Defaults reproduce
    // the platform's historical behavior, so existing tournaments are unchanged.
    const cfg = normalizeRoadmapConfig(tournament);
    const cfgValidation = validateRoadmapConfig(cfg, { slotsTotal, teamsPerGroup });
    const configErrors = [...cfg.errors, ...cfgValidation.errors];

    const firstMatchTime = cfg.firstMatchTime;
    const gapMinutes = cfg.matchGapMinutes;          // start-to-start interval
    const durationMinutes = cfg.matchDurationMinutes; // match length
    const releaseMinutes = cfg.releaseOffsetMinutes;
    const explicitMatchesPerDay = cfg.matchesPerDayProvided;
    const matchesPerDayCfg = cfg.matchesPerDay;
    const advanceOverride = cfg.teamsAdvancingPerDistrict; // null → derive per match
    const enableSemiFinals = cfg.enableSemiFinals;

    // Strict validations
    if (!Number.isFinite(slotsTotal) || slotsTotal <= 0) {
      return { ok: false, error: 'Tournament slot capacity must be a positive number.' };
    }
    if (!Number.isFinite(teamsPerGroup) || teamsPerGroup <= 0) {
      return { ok: false, error: 'Teams per district must be a positive number.' };
    }

    const game = tournament.game || 'bgmi';

    // District plan — the single source of truth for district count/sizing.
    // Empty planned districts still appear because the count derives from the
    // configured slot capacity, not from the number of registered teams.
    const districtSizes = distributeDistrictSizes(slotsTotal, teamsPerGroup);
    const districtCount = districtSizes.length || computeDistrictCount(slotsTotal, teamsPerGroup);
    const teamsAdvancingPerDistrict = advanceOverride != null
      ? Math.min(teamsPerGroup, Math.max(1, advanceOverride))
      : defaultTeamsAdvancing(districtSizes.length ? Math.max(...districtSizes) : teamsPerGroup);

    const rawDate = tournament.startDate || tournament.date || tournament.start_date || tournament.registrationCloseDate || legacyPlan?.daily_plan?.[0]?.date || legacyPlan?.tournament_start_date || '2026-10-10';
    let startDate = toCalendarDateStr(rawDate) || '2026-10-10';

    const rounds = [];
    const days = [];
    const groups = [];
    const rooms = [];
    const matches = [];

    // Special case: Total teams <= maxCapacity (Grand Final Only)
    if (slotsTotal <= maxCapacity) {
      const gfRoundId = `RND-${generateId()}`;
      const dayId = `DAY-${generateId()}`;
      let currentTimeMins = parseTimeToMinutes(firstMatchTime) ?? 13 * 60;
      
      const gfRound = {
        id: gfRoundId,
        tournament_id: tournament.id,
        round_number: 1,
        name: 'Grand Final',
        status: 'configured',
        teams_in: slotsTotal,
        round_type: 'grand_final',
        advancement_type: null,
        teams_advancing: null,
        teams_advancing_per_district: null,
        date: startDate,
        time: formatTime(currentTimeMins),
        is_grand_final: true,
      };
      rounds.push(gfRound);

      days.push({
        id: dayId,
        tournament_id: tournament.id,
        day_number: 1,
        date: startDate,
        round_id: gfRoundId
      });

      const gfGroupRec = {
        id: `GRP-${generateId()}`,
        day_id: dayId,
        tournament_id: tournament.id,
        group_name: 'Grand Final',
        sequence: 1,
        round_id: gfRoundId,
      };
      groups.push(gfGroupRec);

      const gfRoomRec = {
        id: `RM-${generateId()}`,
        group_id: gfGroupRec.id,
        day_id: dayId,
        tournament_id: tournament.id,
        room_number: 1,
        capacity: slotsTotal,
        status: 'DRAFT',
        round_id: gfRoundId,
      };
      rooms.push(gfRoomRec);

      for (let m = 0; m < GRAND_FINAL_MATCHES; m++) {
        const matchId = `MAT-${generateId()}`;
        const mapName = (m === 0 ? 'Erangel' : (m === 1 ? 'Miramar' : 'Rondo'));
        
        const startTimeStr = formatTime(currentTimeMins);
        const endTimeStr = formatTime(currentTimeMins + durationMinutes);
        const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

        matches.push({
          id: matchId,
          tournament_id: tournament.id,
          round_id: gfRoundId,
          day_id: dayId,
          group_id: gfGroupRec.id,
          group_name: gfGroupRec.group_name,
          room_id: gfRoomRec.id,
          match_number: m + 1,
          start_time: startTimeStr,
          end_time: endTimeStr,
          status: 'PENDING',
          map: mapName,
          id_pwd_release_time: releaseTime,
          next_match_id: null,
          next_round_id: null,
          teams_advancing: null,
          is_grand_final: true
        });

        currentTimeMins += gapMinutes;
      }
    } else {
      const plan = calculateProgressionPlan(slotsTotal, maxCapacity, teamsPerGroup, {
        teamsAdvancingPerDistrict: advanceOverride,
      });

      // Strict final-stage capacity check: when the organizer explicitly
      // disables semi-finals, the district qualifiers must fit directly into a
      // single Grand Final. Otherwise refuse with an actionable message rather
      // than silently inserting extra rounds or dropping teams.
      if (cfg.enableSemiFinalsProvided && !enableSemiFinals && plan.length > 1) {
        const qualifiers = plan[0] ? plan[0].totalTeamsAfter : 0;
        return {
          ok: false,
          error: `FINAL_STAGE_CAPACITY_MISMATCH: ${qualifiers} teams qualify from ${plan[0] ? plan[0].matchCount : 0} districts but the Grand Final holds ${maxCapacity}. Enable semi-finals or change the number of teams advancing per district.`,
        };
      }

      let dayCounter = 1;
      let previousRoundMatches = [];
      let previousRoundLastDate = null;

      for (let pIdx = 0; pIdx < plan.length; pIdx++) {
        const pRound = plan[pIdx];
        const roundId = `RND-${generateId()}`;
        
        // Daily capacity: organizer-selected matches/day when provided, otherwise
        // the legacy behavior (first round spread 2/day, later rounds on one day).
        const isRound1 = (pRound.roundNumber === 1);
        const matchesPerDay = explicitMatchesPerDay
          ? matchesPerDayCfg
          : (isRound1 ? 2 : pRound.matchCount);
        const totalDaysForRound = Math.ceil(pRound.matchSizes.length / matchesPerDay);
        
        // Task 2 rule: the first day of each round = the day after the previous round's last day
        const roundStartDate = (pIdx === 0 || !previousRoundLastDate)
          ? startDate
          : addCalendarDays(previousRoundLastDate, 1);
        const firstMins = parseTimeToMinutes(firstMatchTime) ?? 13 * 60;

        const roundData = {
          id: roundId,
          tournament_id: tournament.id,
          round_number: pRound.roundNumber,
          name: `Round ${pRound.roundNumber}`,
          status: 'configured',
          teams_in: pRound.totalTeamsBefore,
          round_type: 'qualifier',
          advancement_type: pRound.advancementType || 'per_district',
          teams_advancing: pRound.totalTeamsAfter,
          teams_advancing_per_district: pRound.teamsAdvancingPerDistrict !== undefined
            ? pRound.teamsAdvancingPerDistrict
            : (advanceOverride != null ? advanceOverride : (pRound.qualifiersPerMatch?.[0] || 2)),
          date: roundStartDate,
          time: formatTime(firstMins),
          is_grand_final: false,
        };
        rounds.push(roundData);

        const currentRoundMatches = [];
        let currentRoundLastDate = roundStartDate;
        
        for (let m = 0; m < pRound.matchSizes.length; m++) {
          const dayOffsetForMatch = Math.floor(m / matchesPerDay);
          const currentDayNumber = dayCounter + dayOffsetForMatch;
          const currentDayDate = dayOffsetForMatch === 0
            ? roundStartDate
            : addCalendarDays(roundStartDate, dayOffsetForMatch);
          if (currentDayDate) currentRoundLastDate = currentDayDate;

          // Find or create day record
          let dayRec = days.find(d => d.day_number === currentDayNumber && d.tournament_id === tournament.id);
          if (!dayRec) {
            dayRec = {
              id: `DAY-${generateId()}`,
              tournament_id: tournament.id,
              day_number: currentDayNumber,
              date: currentDayDate,
              round_id: roundId
            };
            days.push(dayRec);
          }

          // For all rounds, districts are auto-created from teams_in
          const groupNameStr = `District ${m + 1}`;
          const groupRec = {
            id: `GRP-${generateId()}`,
            day_id: dayRec.id,
            tournament_id: tournament.id,
            group_name: groupNameStr,
            sequence: m + 1,
            round_id: roundId
          };
          groups.push(groupRec);
          const groupId = groupRec.id;

          const roomRec = {
            id: `RM-${generateId()}`,
            group_id: groupRec.id,
            day_id: dayRec.id,
            tournament_id: tournament.id,
            room_number: rooms.length + 1,
            capacity: pRound.matchSizes[m],
            status: 'DRAFT',
            round_id: roundId
          };
          rooms.push(roomRec);

          const matchId = `MAT-${generateId()}`;
          const mapName = getDefaultMap(game, m + 1);
          
          // Each day restarts at the configured first-match time; consecutive
          // matches in the same day step by the configured start-to-start gap.
          const slotInDay = m % matchesPerDay;
          const startMins = firstMins + slotInDay * gapMinutes;
          const startTimeStr = formatTime(startMins);
          const endTimeStr = formatTime(startMins + durationMinutes);
          const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

          const match = {
            id: matchId,
            tournament_id: tournament.id,
            round_id: roundId,
            day_id: dayRec.id,
            group_id: groupId,
            group_name: groupNameStr,
            room_id: roomRec.id,
            match_number: m + 1,
            start_time: startTimeStr,
            end_time: endTimeStr,
            status: 'PENDING',
            map: mapName,
            id_pwd_release_time: releaseTime,
            next_match_id: null,
            next_round_id: null,
            teams_advancing: null,
            is_grand_final: false
          };
          currentRoundMatches.push(match);
          matches.push(match);
        }

        previousRoundLastDate = currentRoundLastDate;
        dayCounter += totalDaysForRound;

        // Wire up previous round's progression
        if (previousRoundMatches.length > 0) {
          for (let p = 0; p < previousRoundMatches.length; p++) {
            const destIndex = Math.floor(p / (previousRoundMatches.length / currentRoundMatches.length));
            if (currentRoundMatches[destIndex]) {
              previousRoundMatches[p].next_match_id = currentRoundMatches[destIndex].id;
            }
          }
        }

        previousRoundMatches = currentRoundMatches;
      }
      
      // Wire up the final qualification round to the Grand Final
      const gfRoundId = `RND-${generateId()}`;
      const gfDayNumber = dayCounter;
      const gfRoundDate = previousRoundLastDate
        ? addCalendarDays(previousRoundLastDate, 1)
        : (rounds.length > 0 && rounds[rounds.length - 1]?.date ? addCalendarDays(rounds[rounds.length - 1].date, 1) : startDate);
      let currentTimeMins = parseTimeToMinutes(firstMatchTime) ?? 13 * 60;
      
      const gfRound = {
        id: gfRoundId,
        tournament_id: tournament.id,
        round_number: rounds.length + 1,
        name: 'Grand Final',
        status: 'configured',
        teams_in: plan.length > 0 ? plan[plan.length - 1].totalTeamsAfter : maxCapacity,
        round_type: 'grand_final',
        advancement_type: null,
        teams_advancing: null,
        teams_advancing_per_district: null,
        date: gfRoundDate,
        time: formatTime(currentTimeMins),
        is_grand_final: true,
      };
      rounds.push(gfRound);

      const gfDayRec = {
        id: `DAY-${generateId()}`,
        tournament_id: tournament.id,
        day_number: gfDayNumber,
        date: gfRoundDate,
        round_id: gfRoundId
      };
      days.push(gfDayRec);
      
      const gfTeamsIn = plan.length > 0 ? plan[plan.length - 1].totalTeamsAfter : maxCapacity;
      const gfGroupRec = {
        id: `GRP-${generateId()}`,
        day_id: gfDayRec.id,
        tournament_id: tournament.id,
        group_name: 'Grand Final',
        sequence: 1,
        round_id: gfRoundId,
      };
      groups.push(gfGroupRec);

      const gfRoomRec = {
        id: `RM-${generateId()}`,
        group_id: gfGroupRec.id,
        day_id: gfDayRec.id,
        tournament_id: tournament.id,
        room_number: rooms.length + 1,
        capacity: Math.min(gfTeamsIn, maxCapacity),
        status: 'DRAFT',
        round_id: gfRoundId,
      };
      rooms.push(gfRoomRec);

      for (let m = 0; m < GRAND_FINAL_MATCHES; m++) {
        const matchId = `MAT-${generateId()}`;
        const mapName = (m === 0 ? 'Erangel' : (m === 1 ? 'Miramar' : 'Rondo'));
        
        const startTimeStr = formatTime(currentTimeMins);
        const endTimeStr = formatTime(currentTimeMins + durationMinutes);
        const releaseTime = computeReleaseTime12h(startTimeStr, releaseMinutes);

        matches.push({
          id: matchId,
          tournament_id: tournament.id,
          round_id: gfRoundId,
          day_id: gfDayRec.id,
          group_id: gfGroupRec.id,
          group_name: gfGroupRec.group_name,
          room_id: gfRoomRec.id,
          match_number: m + 1,
          start_time: startTimeStr,
          end_time: endTimeStr,
          status: 'PENDING',
          map: mapName,
          id_pwd_release_time: releaseTime,
          next_match_id: null,
          next_round_id: null,
          teams_advancing: null,
          is_grand_final: true
        });

        currentTimeMins += gapMinutes;
      }
      
      for (const prevMatch of previousRoundMatches) {
        prevMatch.next_round_id = gfRoundId;
      }
    }

    return {
      ok: true,
      roadmap: {
        rounds,
        days,
        groups,
        rooms,
        matches,
        meta: {
          total_slots: slotsTotal,
          max_capacity: maxCapacity,
          teams_per_group: teamsPerGroup,
          num_groups: districtCount,
          top_per_group: teamsAdvancingPerDistrict,
          matches_per_day: explicitMatchesPerDay ? matchesPerDayCfg : null,
          first_match_time: firstMatchTime,
          match_gap_minutes: gapMinutes,
          match_duration_minutes: durationMinutes,
          release_offset_minutes: releaseMinutes,
          enable_semi_finals: enableSemiFinals,
          district_sizes: districtSizes,
          game,
          config_errors: configErrors.length ? configErrors : undefined,
        },
      },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}