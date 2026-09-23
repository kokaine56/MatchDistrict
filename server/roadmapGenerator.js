import crypto from 'crypto';
import { assignDaysToRounds, normalizeRoundNumber } from './roundsService.js';

// server/roadmapGenerator.js
// Pure structural roadmap generator: Tournament -> Round/Stage -> Day -> Group -> Room -> Match.
//
// Round/Stage relationship (2026 structural foundation):
//   - The generator accepts an ordered `rounds` array (materialized by
//     roundsService.syncTournamentRounds from the Step 6 timeline). When empty it
//     falls back to a single default "Round 1", preserving legacy behaviour and
//     output for pre-Round roadmaps.
//   - Days are assigned to rounds via assignDaysToRounds (exact date match, then
//     latest started round, then first round). Day numbers are 1-based WITHIN
//     their round, so "Round 2 · Day 1" is representable and "Day N" never
//     implies "Round N".
//   - Every Day/Group/Room/Match carries its round_id, threading the relationship
//     through the whole graph.
//
// Grouping (was ROOMS_PER_GROUP = 5): no fixed constant exists anymore. Groups
// are derived from the actual scheduling constraint already present in the
// approved plan — max_simultaneous_rooms — so a day with N rooms and S
// simultaneous rooms yields ceil(N / S) groups (e.g. 4 rooms with 2 simultaneous
// -> Group A = rooms 1-2, Group B = rooms 3-4). The exact group topology will be
// decided by the future planning engine; the generator only reflects the
// constraint instead of inventing a number.
//
// Room capacity uses the tournament-configured teams_per_room
// (planningResult), NEVER the game's theoretical maximum roster size.

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

function normalizeRounds(rounds) {
  const list = Array.isArray(rounds) ? rounds.slice() : [];
  if (list.length === 0) {
    list.push({ id: `RND-${generateId()}`, round_number: 1, name: 'Round 1' });
  }
  return list
    .map((r, idx) => ({
      id: r.id || `RND-${generateId()}`,
      round_number: normalizeRoundNumber(r.round_number != null ? r.round_number : idx + 1),
      name: (r.name && String(r.name)) || `Round ${idx + 1}`,
      date: r.date ? String(r.date) : null,
      time: r.time ? String(r.time) : null,
      map: r.map ? String(r.map) : null
    }))
    .sort((a, b) => a.round_number - b.round_number);
}

export function generateTournamentRoadmap(config, planningResult, tournament, rounds, proposal) {
  if (!config || !planningResult || !tournament) {
    return { ok: false, error: 'Missing required inputs for roadmap generation.' };
  }

  try {
    // Proposal path (2026-09-24 planning engine): when the approved planning
    // result carries a round_plan proposal, materialize the structural rows
    // directly from it. Day/group/room/match times, room numbers, capacities,
    // round_id and within-round day numbers are all authoritative from the
    // proposal, so the materialized roadmap matches the proposed schedule 1:1.
    const proposalDays = readProposalDays(proposal);
    if (Array.isArray(proposalDays) && proposalDays.length > 0) {
      return buildFromProposal(planningResult, tournament, proposal, proposalDays);
    }

    // Legacy path (unchanged): derive everything from daily_plan + rounds via
    // assignDaysToRounds. Used for plans generated before the planning engine.
    const days = [];
    const groups = [];
    const rooms = [];
    const matches = [];

    const dailyPlan = typeof planningResult.daily_plan === 'string'
      ? JSON.parse(planningResult.daily_plan)
      : planningResult.daily_plan;

    const maxSimultaneousRooms = Math.max(1, parseInt(planningResult.max_simultaneous_rooms, 10) || 1);
    const matchesPerTeam = parseInt(planningResult.matches_per_team, 10);
    const matchDurationMins = parseInt(planningResult.match_duration_minutes, 10);
    const breakMins = parseInt(planningResult.break_between_matches_minutes, 10);
    const roomCapacity = parseInt(planningResult.teams_per_room, 10);

    const parseTime = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    const formatTime = (mins) => {
      const h = Math.floor(mins / 60).toString().padStart(2, '0');
      const m = (mins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
    };

    const normalizedRounds = normalizeRounds(rounds);
    const dailyDescriptors = dailyPlan.map((d) => ({
      index: dailyPlan.indexOf(d),
      date: d.date ? String(d.date) : ''
    }));
    const dayAssignments = assignDaysToRounds(dailyDescriptors, normalizedRounds);

    const roundDayCounters = new Map();
    const nextDayNumberForRound = (roundId) => {
      const n = (roundDayCounters.get(roundId) || 0) + 1;
      roundDayCounters.set(roundId, n);
      return n;
    };

    let globalRoomCounter = 1;

    for (let dayIdx = 0; dayIdx < dayAssignments.length; dayIdx++) {
      const dayAssignment = dayAssignments[dayIdx];
      const dayData = dailyPlan[dayIdx];
      const assignedRound = dayAssignment.round || normalizedRounds[0];
      const dayId = `DAY-${generateId()}`;

      days.push({
        id: dayId,
        tournament_id: tournament.id,
        day_number: nextDayNumberForRound(assignedRound.id),
        date: dayData.date,
        round_id: assignedRound.id
      });

      // We rely on plannedRooms added in Phase 2
      // Fallback: plannedRoomMatchSessions / matchesPerTeam (assuming correctly divisible now)
      const plannedRoomsForDay = dayData.plannedRooms || (dayData.plannedRoomMatchSessions / matchesPerTeam);

      if (plannedRoomsForDay <= 0) continue;

      // Groups derive from the real scheduling constraint (simultaneous rooms),
      // not from a hard-coded bucket size.
      const simRooms = Math.max(1, maxSimultaneousRooms);
      const numGroups = Math.max(1, Math.ceil(plannedRoomsForDay / simRooms));
      const dayGroups = [];

      for (let g = 0; g < numGroups; g++) {
        const groupId = `GRP-${generateId()}`;
        const groupName = `Group ${String.fromCharCode(65 + g)}`; // A, B, C... per day
        const groupObj = {
          id: groupId,
          day_id: dayId,
          tournament_id: tournament.id,
          group_name: groupName,
          sequence: g + 1,
          round_id: assignedRound.id
        };
        groups.push(groupObj);
        dayGroups.push(groupObj);
      }

      const totalBatches = Math.ceil(plannedRoomsForDay / maxSimultaneousRooms);
      const dayStartMins = parseTime(config.daily_start_time);

      for (let r = 0; r < plannedRoomsForDay; r++) {
        const groupIndex = Math.min(numGroups - 1, Math.floor(r / simRooms));
        const group = dayGroups[groupIndex];

        const roomId = `RM-${generateId()}`;
        const roomObj = {
          id: roomId,
          group_id: group.id,
          day_id: dayId,
          tournament_id: tournament.id,
          room_number: globalRoomCounter,
          capacity: roomCapacity,
          status: 'DRAFT',
          round_id: assignedRound.id
        };
        rooms.push(roomObj);

        const batchIndex = Math.floor(r / maxSimultaneousRooms);

        for (let m = 1; m <= matchesPerTeam; m++) {
          const slotIndex = (m - 1) * totalBatches + batchIndex;
          const matchStartMins = dayStartMins + (slotIndex * (matchDurationMins + breakMins));
          const matchEndMins = matchStartMins + matchDurationMins;

          matches.push({
            id: `MAT-${generateId()}`,
            room_id: roomId,
            group_id: group.id,
            day_id: dayId,
            tournament_id: tournament.id,
            match_number: m,
            start_time: formatTime(matchStartMins),
            end_time: formatTime(matchEndMins),
            status: 'PENDING',
            round_id: assignedRound.id
          });
        }
        globalRoomCounter++;
      }
    }

    // Post-generation validation
    if (days.length !== planningResult.required_days) {
      return { ok: false, error: 'Generated days do not match required days.' };
    }
    if (rooms.length !== planningResult.required_rooms) {
      return { ok: false, error: 'Generated rooms do not match required rooms.' };
    }
    if (matches.length !== planningResult.total_room_sessions) {
      return { ok: false, error: 'Generated matches do not match total room sessions.' };
    }

    // Check overlaps
    for (let r = 0; r < rooms.length; r++) {
      const roomMatches = matches.filter(m => m.room_id === rooms[r].id).sort((a, b) => a.match_number - b.match_number);
      for (let i = 1; i < roomMatches.length; i++) {
        const prevEnd = parseTime(roomMatches[i-1].end_time);
        const currStart = parseTime(roomMatches[i].start_time);
        if (currStart < prevEnd) {
          return { ok: false, error: 'Room has overlapping matches.' };
        }
      }
    }

    return { ok: true, roadmap: { days, groups, rooms, matches, rounds: normalizedRounds } };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// Read the proposed days out of a round_plan object (may arrive as a JS object
// or a JSON string when the stored planning result is parsed defensively).
function readProposalDays(proposal) {
  if (!proposal) return null;
  let value = proposal;
  if (typeof proposal === 'string') {
    try {
      value = JSON.parse(proposal);
    } catch {
      return null;
    }
  }
  return value && Array.isArray(value.days) ? value.days : null;
}

// Materialize structural rows (Day -> Group -> Room -> Match) directly from a
// validated planning proposal. Validation mirrors the legacy path so an
// inconsistent proposal is rejected exactly like a bad legacy plan.
function buildFromProposal(planningResult, tournament, proposal, proposalDays) {
  const days = [];
  const groups = [];
  const rooms = [];
  const matches = [];

  const proposalRounds = proposal && Array.isArray(proposal.rounds) ? proposal.rounds : [];
  const normalizedRounds = proposalRounds.length
    ? proposalRounds.map((r) => ({ id: r.id, round_number: r.round_number, name: r.name, date: r.date || null, time: r.time || null, map: r.map || null }))
    : normalizeRounds([]);

  for (const day of proposalDays) {
    const roundId = day.round_id || normalizedRounds[0]?.id || null;
    const dayId = `DAY-${generateId()}`;

    days.push({
      id: dayId,
      tournament_id: tournament.id,
      day_number: day.day_number,
      date: day.date,
      round_id: roundId
    });

    // Groups
    const dayGroups = [];
    for (const g of day.groups || []) {
      const groupId = `GRP-${generateId()}`;
      const groupObj = {
        id: groupId,
        day_id: dayId,
        tournament_id: tournament.id,
        group_name: (g && (g.name || g.group_name)) || `Group ${g && g.sequence != null ? g.sequence : dayGroups.length + 1}`,
        sequence: g && g.sequence != null ? g.sequence : dayGroups.length + 1,
        round_id: roundId
      };
      groups.push(groupObj);
      dayGroups.push(groupObj);
    }
    const groupBySequence = new Map(dayGroups.map((g) => [g.sequence, g]));
    const fallbackGroup = dayGroups[dayGroups.length - 1] || null;

    // Rooms -> Matches
    for (const r of day.rooms || []) {
      const roomId = `RM-${generateId()}`;
      const group = groupBySequence.get(r && r.group_sequence) || fallbackGroup;

      rooms.push({
        id: roomId,
        group_id: group ? group.id : null,
        day_id: dayId,
        tournament_id: tournament.id,
        room_number: r.room_number,
        capacity: r.capacity,
        status: 'DRAFT',
        round_id: roundId
      });

      for (const m of r.matches || []) {
        matches.push({
          id: `MAT-${generateId()}`,
          room_id: roomId,
          group_id: group ? group.id : null,
          day_id: dayId,
          tournament_id: tournament.id,
          match_number: m.match_number,
          start_time: m.start_time,
          end_time: m.end_time,
          status: 'PENDING',
          round_id: roundId
        });
      }
    }
  }

  // Post-generation validation (must mirror the legacy path)
  if (days.length !== planningResult.required_days) {
    return { ok: false, error: 'Generated days do not match required days.' };
  }
  if (rooms.length !== planningResult.required_rooms) {
    return { ok: false, error: 'Generated rooms do not match required rooms.' };
  }
  if (matches.length !== planningResult.total_room_sessions) {
    return { ok: false, error: 'Generated matches do not match total room sessions.' };
  }

  const parseTime = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  for (let r = 0; r < rooms.length; r++) {
    const roomMatches = matches.filter((m) => m.room_id === rooms[r].id).sort((a, b) => a.match_number - b.match_number);
    for (let i = 1; i < roomMatches.length; i++) {
      if (parseTime(roomMatches[i].start_time) < parseTime(roomMatches[i - 1].end_time)) {
        return { ok: false, error: 'Room has overlapping matches.' };
      }
    }
  }

  return { ok: true, roadmap: { days, groups, rooms, matches, rounds: normalizedRounds } };
}