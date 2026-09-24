// server/tournamentPlanner.js
// Automatic roadmap planning engine (Phase 2.5 / 2026-09-24).
//
// Given a tournament, its planning configuration (tournament_planning_config)
// and its Round/Stage rows (server/roundsService.js syncTournamentRounds), this
// module computes a deterministic scheduling PROPOSAL — rooms, groups/batches,
// simultaneous rooms, match time slots, required days and per-round progression.
//
// Guarantees:
//   - Competitive group size is configured as teams_per_group (legacy persisted
//     teams_per_room is accepted as an alias).
//   - required_groups = CEILING(teams_entering_round / teams_per_group), computed
//     independently per round (Round 1 enters tournament capacity; later rounds enter
//     the previous round's teams_advancing when it is a positive value below the
//     previous entering count, otherwise teams carry forward with a warning).
//   - max_simultaneous_rooms limits competitive groups scheduled at once.
//     Each group persists across its configured matches; each match gets its own
//     technical BGMI room.
//   - Every match starts and finishes inside the daily start/end window; the
//     corrected window math guarantees no last-session overflow (a group can only
//     exist if matches_per_team * groups <= sequential slots available).
//   - Spills to the next tournament day when the window is exhausted, and rounds
//     are scheduled sequentially (round N cannot start before round N-1
//     completes; an optional configured round date may push a round later but
//     never earlier).
//   - Everything is pure and deterministic given the same inputs — no randomness,
//     no database writes, no team allocation, no structural records.
//
// This is a PROPOSAL only. Nothing here writes a roadmap or allocates rooms;
// approving the plan and materializing the roadmap are explicit later steps.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function toTime(mins) {
  return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
}

// Naive 'YYYY-MM-DD' helpers. Avoiding Date-local-time arithmetic prevents
// timezone drift when a day is moved forward (same convention as roomReveal).
function toIsoDate(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  return null;
}

function addDaysNaive(dateStr, days) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const base = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}-${pad2(base.getUTCDate())}`;
}

function utcDayDiff(from, to) {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function groupLabel(number) {
  let value = number;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return `Group ${label}`;
}

// Normalize planner round descriptors. Same shape as normalizeRounds in the
// generator but ids are DETERMINISTIC (RND-<zero-padded round_number>) when a
// round does not already carry a stable id, so plan generation and roadmap
// generation agree even without a database.
function normalizePlannerRounds(rounds) {
  const list = Array.isArray(rounds) ? rounds.slice() : [];
  if (list.length === 0) {
    list.push({ round_number: 1, name: 'Round 1' });
  }
  return list
    .map((r, idx) => {
      const parsed = parseInt(r.round_number != null ? r.round_number : idx + 1, 10);
      const roundNumber = Number.isFinite(parsed) && parsed >= 1 ? parsed : idx + 1;
      const teamsAdvancing = parseInt(r.teams_advancing, 10);
      return {
        id: (r.id && String(r.id)) || `RND-${pad2(roundNumber)}`,
        round_number: roundNumber,
        name: (r.name && String(r.name)) || `Round ${roundNumber}`,
        date: r.date ? String(r.date).trim() : null,
        time: r.time ? String(r.time).trim() : null,
        teams_advancing: Number.isFinite(teamsAdvancing) && teamsAdvancing > 0 ? teamsAdvancing : null
      };
    })
    .sort((a, b) => a.round_number - b.round_number);
}

export function calculateTournamentPlan(config, tournament, rounds) {
  const errors = [];

  if (!config) {
    return { ok: false, errors: ['Missing tournament planning configuration.'] };
  }

  const tournamentCapacity = parseInt(tournament?.slotsTotal, 10);
  const hasTournamentCapacity = Number.isFinite(tournamentCapacity) && tournamentCapacity > 0;
  const expectedTeams = hasTournamentCapacity ? tournamentCapacity : parseInt(config.expected_teams, 10);
  const maxTeams = hasTournamentCapacity ? tournamentCapacity : parseInt(config.maximum_teams, 10);
  const matchType = String(tournament?.match_type || '').toLowerCase();
  const playersPerTeam = ({ solo: 1, duo: 2, squad: 4 })[matchType] || parseInt(config.players_per_team, 10);
  const teamsPerGroup = parseInt(config.teams_per_group ?? config.teams_per_room, 10);
  const maxSimultaneousRooms = parseInt(config.max_simultaneous_rooms, 10);
  const matchesPerTeam = parseInt(config.matches_per_team, 10);
  const matchDurationMins = parseInt(config.match_duration_minutes, 10);
  const breakMins = parseInt(config.break_between_matches_minutes, 10);

  if (isNaN(maxTeams) || maxTeams <= 0) errors.push('Maximum teams must be greater than zero.');
  if (isNaN(teamsPerGroup) || teamsPerGroup <= 0) errors.push('Teams per group must be greater than zero.');
  if (isNaN(maxSimultaneousRooms) || maxSimultaneousRooms <= 0) errors.push('Maximum simultaneous rooms must be greater than zero.');
  if (isNaN(matchesPerTeam) || matchesPerTeam <= 0) errors.push('Matches per team must be greater than zero.');
  if (isNaN(matchDurationMins) || matchDurationMins <= 0) errors.push('Match duration must be greater than zero.');
  if (isNaN(breakMins) || breakMins < 0) errors.push('Break duration cannot be negative.');

  if (!config.daily_start_time || !TIME_RE.test(config.daily_start_time)) errors.push('Invalid daily start time.');
  if (!config.daily_end_time || !TIME_RE.test(config.daily_end_time)) errors.push('Invalid daily end time.');

  if (errors.length > 0) return { ok: false, errors };

  const startMins = toMins(config.daily_start_time);
  const endMins = toMins(config.daily_end_time);

  if (endMins <= startMins) {
    return { ok: false, errors: ['Daily end time must be later than start time.'] };
  }

  const dailyOperatingMinutes = endMins - startMins;
  const matchSlotMinutes = matchDurationMins + breakMins;
  const sequentialSlotsPerRoom = Math.floor((dailyOperatingMinutes + breakMins) / matchSlotMinutes);

  if (matchDurationMins > dailyOperatingMinutes) {
    return { ok: false, errors: ['The match duration exceeds the daily operating window.'] };
  }
  if (sequentialSlotsPerRoom <= 0) {
    return { ok: false, errors: ['The daily operating window is too short for even a single match.'] };
  }

  const groupsPerLanePerDay = Math.floor(sequentialSlotsPerRoom / matchesPerTeam);
  if (groupsPerLanePerDay < 1) {
    return { ok: false, errors: ['The daily operating window is too short to schedule the configured matches per team.'] };
  }

  const calculatedDailyCapacity = groupsPerLanePerDay * maxSimultaneousRooms * matchesPerTeam;

  const configuredMaxPerDay = (config.max_matches_per_day !== undefined && config.max_matches_per_day !== null && String(config.max_matches_per_day).trim() !== '')
    ? parseInt(config.max_matches_per_day, 10)
    : null;

  let effectiveDailyCapacity = calculatedDailyCapacity;
  if (configuredMaxPerDay !== null && !isNaN(configuredMaxPerDay) && configuredMaxPerDay > 0) {
    effectiveDailyCapacity = Math.min(effectiveDailyCapacity, configuredMaxPerDay);
  }

  if (effectiveDailyCapacity <= 0) {
    return { ok: false, errors: ['Effective daily capacity is zero or negative.'] };
  }

  const effectiveGroupsPerDay = Math.floor(effectiveDailyCapacity / matchesPerTeam);
  if (effectiveGroupsPerDay <= 0) {
    return { ok: false, errors: ['Daily capacity is too low to schedule a group playing all its matches.'] };
  }
  const groupsPerDay = Math.min(effectiveGroupsPerDay, groupsPerLanePerDay * maxSimultaneousRooms);
  const simultaneousGroups = Math.min(maxSimultaneousRooms, groupsPerDay);

  const warnings = [];
  const summary = [];

  // Base schedule date: tournament.startDate, else first round's configured
  // date, else today. Registration close is deliberately independent of the
  // roadmap window — the tournament start is what anchors the schedule.
  let baseDate = null;
  if (tournament && tournament.startDate) baseDate = toIsoDate(tournament.startDate);

  const plannerRounds = normalizePlannerRounds(rounds);
  if (!baseDate && plannerRounds[0] && plannerRounds[0].date) baseDate = toIsoDate(plannerRounds[0].date);
  if (!baseDate) baseDate = toIsoDate(new Date());

  let cursorDate = baseDate;
  let prevEntering = maxTeams;
  let globalRoomNumber = 1;
  let orderError = null;

  const roundPlans = [];
  const scheduleDays = [];
  const dailyPlan = [];

  for (let rIdx = 0; rIdx < plannerRounds.length; rIdx++) {
    const round = plannerRounds[rIdx];
    const roundNumber = round.round_number;
    const roundName = round.name;

    // Entering teams for this round.
    let enteringTeams;
    let carryForward = false;
    if (rIdx === 0) {
      enteringTeams = maxTeams;
    } else {
      const prev = plannerRounds[rIdx - 1];
      const adv = prev.teams_advancing;
      if (adv != null && adv > 0 && adv < prevEntering) {
        enteringTeams = adv;
      } else {
        enteringTeams = prevEntering;
        carryForward = true;
        const reason = (adv == null || adv <= 0)
          ? `Round ${prev.round_number} has no teams_advancing value`
          : `Round ${roundNumber} teams_advancing (${adv}) is not below the ${prevEntering} teams that entered Round ${prev.round_number}`;
        warnings.push(`${reason}; carrying ${prevEntering} teams forward into Round ${roundNumber} (rooms recalculated).`);
      }
    }
    prevEntering = enteringTeams;

    const requiredGroupsRound = Math.ceil(enteringTeams / teamsPerGroup);
    const roundTotalSessions = requiredGroupsRound * matchesPerTeam;

    // Round ordering: round N cannot start before round N-1 completes. An
    // optional configured date may only push the round later (gap warning),
    // never earlier (hard error).
    const earliestDate = rIdx === 0 ? baseDate : addDaysNaive(cursorDate, 1);
    let roundStart = earliestDate;
    if (round.date) {
      const configuredDate = toIsoDate(round.date);
      if (configuredDate) {
        if (configuredDate < earliestDate) {
          orderError = `Round ${roundNumber} is configured to start ${configuredDate}, before the previous round completes (${earliestDate}). Move it forward or remove the date.`;
          break;
        }
        if (configuredDate > earliestDate) {
          roundStart = configuredDate;
          const gapDays = utcDayDiff(earliestDate, configuredDate);
          if (gapDays > 0) {
            warnings.push(`Round ${roundNumber} starts ${gapDays} day${gapDays > 1 ? 's' : ''} after the previous round completes (configured date ${configuredDate}); leave a gap of ${gapDays} day${gapDays > 1 ? 's' : ''}.`);
          }
        }
      }
    }

    const daysNeeded = Math.ceil(requiredGroupsRound / groupsPerDay);
    const roundLastDay = addDaysNaive(roundStart, daysNeeded - 1);

    let remainingGroups = requiredGroupsRound;
    let roundMaxUtilization = 0;
    for (let d = 0; d < daysNeeded; d++) {
      const groupsOnDay = Math.min(remainingGroups, groupsPerDay);
      remainingGroups -= groupsOnDay;
      const sessionsOnDay = groupsOnDay * matchesPerTeam;
      const dayNumberInRound = d + 1;
      const date = d === 0 ? roundStart : addDaysNaive(roundStart, d);

      const groups = [];
      const roomsOnDay = [];
      for (let g = 0; g < groupsOnDay; g++) {
        const groupNumber = (d * groupsPerDay) + g + 1;
        const lane = g % simultaneousGroups;
        const wave = Math.floor(g / simultaneousGroups);
        const group = { name: groupLabel(groupNumber), sequence: groupNumber };
        groups.push(group);
        for (let m = 1; m <= matchesPerTeam; m++) {
          const slotIndex = (wave * matchesPerTeam) + (m - 1);
          const matchStartMins = startMins + slotIndex * matchSlotMinutes;
          roomsOnDay.push({
            room_number: globalRoomNumber++,
            capacity: Math.min(teamsPerGroup, enteringTeams - ((groupNumber - 1) * teamsPerGroup)),
            group_sequence: groupNumber,
            matches: [{ match_number: m, start_time: toTime(matchStartMins), end_time: toTime(matchStartMins + matchDurationMins) }],
            lane
          });
        }
      }

      const utilizationPercent = round1((sessionsOnDay / effectiveDailyCapacity) * 100);
      if (utilizationPercent > roundMaxUtilization) roundMaxUtilization = utilizationPercent;

      scheduleDays.push({
        round_id: round.id,
        round_number: roundNumber,
        round_name: roundName,
        day_number: dayNumberInRound,
        date,
        groups,
        rooms: roomsOnDay,
        planned_groups: groupsOnDay,
        planned_rooms: sessionsOnDay,
        planned_matches: sessionsOnDay,
        window_capacity_matches: calculatedDailyCapacity,
        configured_capacity_matches: effectiveDailyCapacity,
        utilization_percent: utilizationPercent
      });

      dailyPlan.push({
        dayNumber: scheduleDays.length,
        date,
        plannedRoomMatchSessions: sessionsOnDay,
        availableRoomCapacity: effectiveDailyCapacity,
        utilization: utilizationPercent,
        feasible: true,
        plannedRooms: sessionsOnDay,
        round_id: round.id,
        round_number: roundNumber,
        round_day_number: dayNumberInRound
      });
    }

    if (roundMaxUtilization >= 100) {
      warnings.push(`Round ${roundNumber} reaches ${roundMaxUtilization}% of daily capacity (last day ${roundLastDay}); consider a wider window or more simultaneous rooms.`);
    }

    const roundSummary = `${roundName} — ${enteringTeams} teams enter, ${requiredGroupsRound} group${requiredGroupsRound > 1 ? 's' : ''} of up to ${teamsPerGroup}, ${roundTotalSessions} match${roundTotalSessions > 1 ? 'es' : ''} with separate BGMI rooms, over ${daysNeeded} day${daysNeeded > 1 ? 's' : ''} (${roundStart} → ${roundLastDay}).`;
    summary.push(roundSummary);

    roundPlans.push({
      id: round.id,
      round_number: roundNumber,
      name: roundName,
      teams_entering: enteringTeams,
      teams_advancing: round.teams_advancing,
      carry_forward: carryForward,
      teams_per_group: teamsPerGroup,
      teams_per_room: teamsPerGroup,
      required_groups: requiredGroupsRound,
      required_rooms: requiredGroupsRound * matchesPerTeam,
      total_sessions: roundTotalSessions,
      days_needed: daysNeeded,
      start_date: roundStart,
      end_date: roundLastDay,
      groups_per_day: groupsPerDay,
      daily_room_capacity: groupsPerDay * matchesPerTeam,
      summary: roundSummary
    });

    cursorDate = roundLastDay;
  }

  if (orderError) {
    return { ok: false, errors: [orderError] };
  }

  const requiredGroups = roundPlans.reduce((s, rp) => s + rp.required_groups, 0);
  const requiredRooms = roundPlans.reduce((s, rp) => s + rp.required_rooms, 0);
  const totalRoomMatchSessions = roundPlans.reduce((s, rp) => s + rp.total_sessions, 0);
  const requiredDays = scheduleDays.length;
  const startDate = requiredDays > 0 ? scheduleDays[0].date : null;
  const endDate = requiredDays > 0 ? scheduleDays[requiredDays - 1].date : null;
  const simultaneousRooms = Math.min(simultaneousGroups, requiredRooms);

  summary.push(
    `Automatic proposal: ${requiredGroups} persistent groups, ${requiredRooms} match-specific BGMI rooms across ${requiredDays} day${requiredDays > 1 ? 's' : ''} and ${plannerRounds.length} round${plannerRounds.length > 1 ? 's' : ''}, starting ${startDate} and ending ${endDate}.`
  );

  const plan = {
    planningTeamCount: maxTeams,
    expectedTeams: expectedTeams,
    requiredRooms,
    requiredGroups,
    maxSimultaneousRooms,
    simultaneousRooms,
    teamsPerRoom: teamsPerGroup,
    teamsPerGroup,
    matchesPerTeam,
    totalRoomMatchSessions,
    matchDurationMinutes: matchDurationMins,
    breakBetweenMatchesMinutes: breakMins,
    dailyOperatingMinutes,
    matchSlotMinutes,
    sequentialSlotsPerRoom,
    groupsPerDay,
    dailyRoomsCapacity: groupsPerDay * matchesPerTeam,
    calculatedDailyCapacity,
    configuredMaxPerDay,
    effectiveDailyCapacity,
    effectiveDailyRoomCapacity: groupsPerDay,
    requiredDays,
    startDate,
    endDate,
    dailyPlan,
    round_plan: {
      rounds: roundPlans,
      days: scheduleDays,
      summary,
      warnings
    },
    warnings,
    summary,
    configSnapshot: JSON.parse(JSON.stringify({
      ...config,
      expected_teams: expectedTeams,
      maximum_teams: maxTeams,
      players_per_team: playersPerTeam,
      teams_per_group: teamsPerGroup,
      teams_per_room: teamsPerGroup,
    }))
  };

  return { ok: true, plan };
}
