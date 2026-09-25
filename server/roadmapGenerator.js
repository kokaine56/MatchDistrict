import crypto from 'crypto';
import { buildGroups } from './groupService.js';

// server/roadmapGenerator.js
// Clean, group-based roadmap generator (2026-09-25 rewrite).
//
// Architecture:
//   - Reads slotsTotal + teams_per_group from the tournament row.
//   - Derives groups via buildGroups() from groupService.js.
//   - Distributes groups across days: 2 groups per day for group stages,
//     Grand Final on the last day (always the final day).
//   - Sequential match ordering: Group A finishes all matches THEN Group B starts.
//   - Does NOT depend on tournament_planning_result or simultaneous_rooms.
//   - Does NOT depend on room-based fields.
//   - Returns { ok, roadmap: { days, groups, rooms, matches } }
//
// Day structure (example: 4 groups A/B/C/D + Grand Final):
//   Day 1: Group A, Group B
//   Day 2: Group C, Group D
//   Day 3: Grand Final
//
// Day structure (example: 2 groups A/B + Grand Final):
//   Day 1: Group A, Group B
//   Day 2: Grand Final
//
// Day structure (example: 1 group + Grand Final):
//   Day 1: Group A
//   Day 2: Grand Final

const DEFAULT_MAPS = {
  bgmi: ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
  'battlegrounds mobile india': ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
  freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  'free fire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  codm: ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  'cod mobile': ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  valorant: ['Ascent', 'Haven', 'Bind', 'Split', 'Sunset'],
};

export function getDefaultMap(game, matchNumber) {
  const gameKey = (game || 'bgmi').toLowerCase().trim();
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

// How many matches per group-stage group (default 2: Erangel + Miramar)
const DEFAULT_MATCHES_PER_GROUP = 2;
// How many matches in the Grand Final (default 3)
const DEFAULT_GRAND_FINAL_MATCHES = 3;
// How many groups per day for group stages (default 2: e.g. A+B on Day 1)
const GROUPS_PER_DAY = 2;
// Default daily start time
const DEFAULT_START_TIME = '13:00'; // 1:00 PM
// Gap between matches in minutes (for time assignment)
const MATCH_GAP_MINUTES = 60; // 1 hour per match slot (30 min play + 15 min break + 15 buffer)

/**
 * Main generator entry point.
 *
 * @param {object} tournament - Full tournament row from DB
 *   Required fields: id, game, slotsTotal (or slots_total), teams_per_group, start_date
 * @returns {{ ok: boolean, roadmap?: object, error?: string }}
 */
export function generateTournamentRoadmap(param1, legacyPlan, legacyTourn) {
  try {
    let tournament = param1;
    if ((!tournament || !tournament.id) && legacyTourn && legacyTourn.id) {
      tournament = legacyTourn;
    }
    if (!tournament || !tournament.id) {
      return { ok: false, error: 'Tournament data is required.' };
    }

    const slotsTotal = parseInt(tournament.slotsTotal || tournament.slots_total || tournament.teamsCount, 10) || 64;
    const teamsPerGroup = parseInt(tournament.teams_per_group, 10) || 16;
    const game = tournament.game || 'bgmi';

    // Derive groups using the group service
    const groupLayout = buildGroups(slotsTotal, teamsPerGroup);
    const numGroups = groupLayout.length;

    if (numGroups === 0) {
      return { ok: false, error: 'Could not derive groups from tournament configuration.' };
    }

    // Parse start date from tournament record (checking startDate, date, start_date, registrationCloseDate, legacy dates)
    let startDate = null;
    const rawDate = tournament.startDate || tournament.date || tournament.start_date || tournament.registrationCloseDate || legacyPlan?.daily_plan?.[0]?.date || legacyPlan?.tournament_start_date;
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        if (!isNaN(d.getTime())) {
          startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      } catch { /* ignore */ }
    }

    if (!startDate) {
      return {
        ok: false,
        error: 'Your tournament schedule date is missing. Configure the tournament schedule before generating the roadmap.'
      };
    }

    const days = [];
    const groups = [];
    const rooms = [];
    const matches = [];

    // ── GROUP STAGE DAYS ──
    // Distribute numGroups groups across days, GROUPS_PER_DAY groups per day
    // Sequential order: Group A (all matches), Group B (all matches), then Day 2: Group C, D, etc.
    const numGroupStageDays = Math.ceil(numGroups / GROUPS_PER_DAY);

    for (let dayIdx = 0; dayIdx < numGroupStageDays; dayIdx++) {
      const dayId = `DAY-${generateId()}`;
      const dayNumber = dayIdx + 1;
      const dayDate = startDate ? addDays(startDate, dayIdx) : null;

      days.push({
        id: dayId,
        tournament_id: tournament.id,
        day_number: dayNumber,
        date: dayDate,
        stage: 'group',
        round_id: null,
      });

      // Groups on this day
      const startGroupIdx = dayIdx * GROUPS_PER_DAY;
      const endGroupIdx = Math.min(startGroupIdx + GROUPS_PER_DAY, numGroups);

      let currentTimeMins = parseTimeMins(DEFAULT_START_TIME);

      for (let gIdx = startGroupIdx; gIdx < endGroupIdx; gIdx++) {
        const gl = groupLayout[gIdx];
        const groupId = `GRP-${generateId()}`;
        const groupName = `Group ${gl.name}`;

        groups.push({
          id: groupId,
          day_id: dayId,
          tournament_id: tournament.id,
          group_name: groupName,
          sequence: gIdx + 1,
          round_id: null,
          capacity: gl.capacity,
        });

        // Single room per group (room = group in our architecture)
        const roomId = `RM-${generateId()}`;
        rooms.push({
          id: roomId,
          group_id: groupId,
          day_id: dayId,
          tournament_id: tournament.id,
          room_number: gIdx + 1,
          capacity: gl.capacity,
          status: 'DRAFT',
          round_id: null,
        });

        // Matches for this group — sequential, Group A finishes ALL then Group B starts
        for (let m = 1; m <= DEFAULT_MATCHES_PER_GROUP; m++) {
          const mapName = getDefaultMap(game, m);
          const startTimeStr = formatTime(currentTimeMins);
          const endTimeStr = formatTime(currentTimeMins + 30);
          const releaseTime = computeReleaseTime12h(startTimeStr, 15);

          matches.push({
            id: `MAT-${generateId()}`,
            room_id: roomId,
            group_id: groupId,
            day_id: dayId,
            tournament_id: tournament.id,
            match_number: m,
            start_time: startTimeStr,
            end_time: endTimeStr,
            status: 'PENDING',
            round_id: null,
            map: mapName,
            id_pwd_release_time: releaseTime,
          });

          currentTimeMins += MATCH_GAP_MINUTES;
        }

        // Extra gap between groups on the same day
        currentTimeMins += 15;
      }
    }

    // ── GRAND FINAL DAY ──
    const grandFinalDayId = `DAY-${generateId()}`;
    const grandFinalDayNumber = numGroupStageDays + 1;
    const grandFinalDate = startDate ? addDays(startDate, numGroupStageDays) : null;

    days.push({
      id: grandFinalDayId,
      tournament_id: tournament.id,
      day_number: grandFinalDayNumber,
      date: grandFinalDate,
      stage: 'final',
      round_id: null,
    });

    const grandFinalGroupId = `GRP-${generateId()}`;
    // Qualifying teams: top N from each group (default top 4 = teamsPerGroup/4)
    const topPerGroup = Math.max(1, Math.ceil(teamsPerGroup / 4));
    const qualifiedTeams = numGroups * topPerGroup;

    groups.push({
      id: grandFinalGroupId,
      day_id: grandFinalDayId,
      tournament_id: tournament.id,
      group_name: 'Grand Final',
      sequence: numGroups + 1,
      round_id: null,
      capacity: qualifiedTeams,
      is_grand_final: true,
      top_per_group: topPerGroup,
    });

    const grandFinalRoomId = `RM-${generateId()}`;
    rooms.push({
      id: grandFinalRoomId,
      group_id: grandFinalGroupId,
      day_id: grandFinalDayId,
      tournament_id: tournament.id,
      room_number: numGroups + 1,
      capacity: qualifiedTeams,
      status: 'DRAFT',
      round_id: null,
    });

    // Grand Final matches (3 by default)
    let gfTimeMins = parseTimeMins(DEFAULT_START_TIME);
    for (let m = 1; m <= DEFAULT_GRAND_FINAL_MATCHES; m++) {
      const mapName = getDefaultMap(game, m);
      const startTimeStr = formatTime(gfTimeMins);
      const endTimeStr = formatTime(gfTimeMins + 30);
      const releaseTime = computeReleaseTime12h(startTimeStr, 15);

      matches.push({
        id: `MAT-${generateId()}`,
        room_id: grandFinalRoomId,
        group_id: grandFinalGroupId,
        day_id: grandFinalDayId,
        tournament_id: tournament.id,
        match_number: m,
        start_time: startTimeStr,
        end_time: endTimeStr,
        status: 'PENDING',
        round_id: null,
        map: mapName,
        id_pwd_release_time: releaseTime,
      });

      gfTimeMins += MATCH_GAP_MINUTES;
    }

    return {
      ok: true,
      roadmap: {
        days,
        groups,
        rooms,
        matches,
        rounds: [],
        // Metadata for UI display
        meta: {
          total_slots: slotsTotal,
          teams_per_group: teamsPerGroup,
          num_groups: numGroups,
          group_names: groupLayout.map(g => `Group ${g.name}`),
          top_per_group: topPerGroup,
          qualified_teams: qualifiedTeams,
          grand_final_matches: DEFAULT_GRAND_FINAL_MATCHES,
          game,
        },
      },
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseTimeMins(timeStr) {
  if (!timeStr) return 13 * 60; // 1:00 PM default
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return 13 * 60;
  return parts[0] * 60 + parts[1];
}

function addDays(dateStr, n) {
  if (!dateStr) return null;
  try {
    const [y, mo, d] = dateStr.split('-').map(Number);
    const base = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
    base.setUTCDate(base.getUTCDate() + n);
    return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}-${String(base.getUTCDate()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}