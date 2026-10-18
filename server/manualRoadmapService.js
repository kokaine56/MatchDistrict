// server/manualRoadmapService.js
// Single source of truth for the Fully Manual, Dynamic Roadmap Builder in Match District.
//
// Allows tournament organizers to manually configure rounds, days, district-wise
// allocations, match counts, match details, and advancement rules step by step.
// Automatically retrieves tournament districts and verified team counts from the DB.
// Enforces strict draft vs published lifecycle and non-destructive data updates.

import crypto from 'crypto';
import {
  buildGroups,
  normalizeTeamsPerGroup,
  computeGroupCount,
  formatDistrictName,
  DEFAULT_TEAMS_PER_GROUP,
} from './groupService.js';
import {
  toMins,
  minsToHHMM,
  computeMatchEndTime,
  isValidDateStr,
} from './roadmapValidation.js';
import { normalizeReleaseMinutes, isMatchReleased } from './matchRelease.js';

export const ROUND_TYPES = Object.freeze([
  'qualifier',
  'semi_final',
  'grand_final',
  'custom',
]);

export const ADVANCEMENT_TYPES = Object.freeze([
  'per_district',
  'per_match',
  'round_total',
  'manual',
]);

export const ROADMAP_STATUS = Object.freeze({
  PENDING: 'pending',
  DRAFT: 'draft',
  PUBLISHED: 'published',
  APPROVED: 'approved', // backward compatibility alias for published
});

export const GAME_DEFAULT_MAPS = Object.freeze({
  bgmi: ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
  'battlegrounds mobile india': ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik', 'Karakin', 'Nusa'],
  freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  'free fire': ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  codm: ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  'cod mobile': ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  valorant: ['Ascent', 'Haven', 'Bind', 'Split', 'Sunset'],
});

export function getMapsForGame(game) {
  const key = (game || 'bgmi').toLowerCase().trim();
  return GAME_DEFAULT_MAPS[key] || GAME_DEFAULT_MAPS.bgmi;
}

export function generateRandomId(prefix = '') {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Automatically retrieve actual tournament district configuration from the database.
 * Never hardcodes 8 districts. If 6, shows 6; if 12, shows 12.
 * Uses persistent district IDs and queries actual verified teams.
 */
export async function getTournamentDistricts(poolOrClient, tournamentId) {
  const tRes = await poolOrClient.query(
    'SELECT id, title, "slotsTotal", "slotsFilled", teams_per_group, teams_per_match, game, status, roadmap_status FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  if (tRes.rows.length === 0) {
    throw new Error('TOURNAMENT_NOT_FOUND');
  }

  const tourney = tRes.rows[0];
  const slotsTotal = parseInt(tourney.slotsTotal, 10) || 64;
  const teamsPerGroup = normalizeTeamsPerGroup(
    tourney.teams_per_group || tourney.teams_per_match,
    DEFAULT_TEAMS_PER_GROUP
  );
  const expectedDistrictCount = computeGroupCount(slotsTotal, teamsPerGroup);

  // Fetch existing persisted districts from tournament_registration_groups
  let groupRowsRes = await poolOrClient.query(
    `SELECT id, tournament_id, group_index, name, capacity
     FROM tournament_registration_groups
     WHERE tournament_id = $1
     ORDER BY group_index ASC`,
    [tournamentId]
  );

  // If not yet persisted or incomplete, idempotently populate tournament_registration_groups
  if (groupRowsRes.rows.length === 0 || groupRowsRes.rows.length !== expectedDistrictCount) {
    const layout = buildGroups(slotsTotal, teamsPerGroup);
    for (const g of layout) {
      const gId = `GRP-${tournamentId.slice(-6)}-${String(g.group_index).padStart(2, '0')}`;
      await poolOrClient.query(
        `INSERT INTO tournament_registration_groups (id, tournament_id, group_index, name, capacity)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tournament_id, group_index) DO UPDATE
         SET name = EXCLUDED.name, capacity = EXCLUDED.capacity`,
        [gId, tournamentId, g.group_index, g.name, g.capacity]
      );
    }

    groupRowsRes = await poolOrClient.query(
      `SELECT id, tournament_id, group_index, name, capacity
       FROM tournament_registration_groups
       WHERE tournament_id = $1
       ORDER BY group_index ASC`,
      [tournamentId]
    );
  }

  // Fetch verified registrations occupying slots for this tournament
  const VERIFIED_STATUSES = ['approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'];
  const regsRes = await poolOrClient.query(
    `SELECT id, team_name, captain, status, slot_number, group_id, group_name
     FROM tournament_registrations
     WHERE tournament_id = $1
       AND status = ANY($2::text[])
     ORDER BY slot_number ASC NULLS LAST, created_at ASC`,
    [tournamentId, VERIFIED_STATUSES]
  );

  const verifiedRegs = regsRes.rows;
  const layout = buildGroups(slotsTotal, teamsPerGroup);
  const layoutMap = new Map(layout.map((l) => [l.group_index, l]));

  // Ensure each verified registration is counted at most once across all districts
  const assignedRegIds = new Set();
  const districtRegMap = new Map(groupRowsRes.rows.map((row) => [row.id, []]));

  // 1. First assign registrations that explicitly have matching group_id
  for (const r of verifiedRegs) {
    if (r.group_id && districtRegMap.has(r.group_id)) {
      districtRegMap.get(r.group_id).push(r);
      assignedRegIds.add(r.id);
    }
  }

  // 2. Second assign remaining unassigned registrations by slot_number range
  for (const row of groupRowsRes.rows) {
    const l = layoutMap.get(row.group_index) || {};
    const slotStart = l.slotStart ?? (row.group_index - 1) * row.capacity + 1;
    const slotEnd = l.slotEnd ?? row.group_index * row.capacity;

    for (const r of verifiedRegs) {
      if (assignedRegIds.has(r.id)) continue;
      if (r.slot_number != null && r.slot_number >= slotStart && r.slot_number <= slotEnd) {
        districtRegMap.get(row.id).push(r);
        assignedRegIds.add(r.id);
      }
    }
  }

  const districts = groupRowsRes.rows.map((row) => {
    const l = layoutMap.get(row.group_index) || {};
    const slotStart = l.slotStart ?? (row.group_index - 1) * row.capacity + 1;
    const slotEnd = l.slotEnd ?? row.group_index * row.capacity;
    const matchingRegs = districtRegMap.get(row.id) || [];

    const displayName = formatDistrictName(row.group_index);
    return {
      id: row.id,
      group_index: row.group_index,
      name: displayName,
      code: `D${row.group_index}`,
      capacity: row.capacity,
      slot_start: slotStart,
      slot_end: slotEnd,
      registered_teams_count: matchingRegs.length,
      team_count: matchingRegs.length,
      teams: matchingRegs.map((r) => ({
        id: r.id,
        team_name: r.team_name,
        captain: r.captain,
        slot_number: r.slot_number,
      })),
    };
  });

  const totalRegisteredTeams = verifiedRegs.length;
  const warnings = [];
  const emptyDistricts = districts.filter((d) => d.registered_teams_count === 0);
  if (emptyDistricts.length > 0 && totalRegisteredTeams > 0) {
    warnings.push(`${emptyDistricts.length} district(s) have no verified teams assigned yet.`);
  }

  return {
    districts,
    meta: {
      tournament_id: tournamentId,
      tournament_title: tourney.title,
      total_districts: districts.length,
      total_slots: slotsTotal,
      teams_per_district: teamsPerGroup,
      total_teams: totalRegisteredTeams,
      slots_filled: tourney.slotsFilled || totalRegisteredTeams,
      game: tourney.game || 'bgmi',
      has_empty_districts: emptyDistricts.length > 0,
      is_consistent: true,
      warnings,
    },
  };
}

/**
 * Pure calculation of advancing teams for a round based on configuration.
 */
export function calculateAdvancingTeams(roundConfig, districtCount = 0) {
  if (!roundConfig) return 0;
  const advType = roundConfig.advancement_type || 'per_district';

  if (advType === 'per_district') {
    const perDist = Number(roundConfig.teams_advancing_per_district) || 0;
    const dists = districtCount || (Array.isArray(roundConfig.days)
      ? new Set(roundConfig.days.flatMap((d) => (d.allocations || []).map((a) => a.district_id))).size
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

  if (advType === 'round_total' || advType === 'manual') {
    return Math.max(0, Number(roundConfig.teams_advancing) || 0);
  }

  return Math.max(0, Number(roundConfig.teams_advancing) || 0);
}

/**
 * Validate manual roadmap structure.
 * Returns { valid: boolean, errors: string[], warnings: string[] }.
 */
export function validateManualRoadmap(roadmapData, options = {}) {
  const errors = [];
  const warnings = [];

  const rounds = Array.isArray(roadmapData?.rounds) ? roadmapData.rounds : [];
  if (rounds.length === 0) {
    errors.push('The roadmap must have at least one round configured.');
    return { valid: false, errors, warnings };
  }

  const roundIds = new Set();
  const roundNames = new Set();
  const roundOrderMap = new Map();

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const round = rounds[rIdx];
    const rNum = round.round_number || rIdx + 1;
    const rName = (round.name || '').trim();

    if (!rName) {
      errors.push(`Round ${rNum} must have a name.`);
    } else {
      if (roundNames.has(rName.toLowerCase())) {
        warnings.push(`Duplicate round name "${rName}". Consider distinct names for clarity.`);
      }
      roundNames.add(rName.toLowerCase());
    }

    if (round.id) {
      if (roundIds.has(round.id)) {
        errors.push(`Duplicate round ID detected: ${round.id}.`);
      }
      roundIds.add(round.id);
    }
    roundOrderMap.set(round.id || `r-${rIdx}`, rNum);

    const days = Array.isArray(round.days) ? round.days : [];
    if (days.length === 0) {
      errors.push(`Round "${rName || `Round ${rNum}`}" must have at least one match day.`);
      continue;
    }

    let totalRoundMatches = 0;
    const scheduledDistrictsInRound = new Set();

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const day = days[dIdx];
      const dNum = day.day_number || dIdx + 1;

      if (day.date && !isValidDateStr(day.date)) {
        warnings.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" has an invalid date format (expected YYYY-MM-DD).`);
      }

      const allocations = Array.isArray(day.allocations) ? day.allocations : [];
      if (allocations.length === 0) {
        errors.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" has no districts scheduled.`);
        continue;
      }

      const dayDistricts = new Set();
      for (const alloc of allocations) {
        const distId = alloc.district_id || alloc.id;
        const distName = alloc.district_name || alloc.name || 'District';

        if (!distId) {
          errors.push(`Day ${dNum} in "${rName}": District allocation is missing a valid district ID.`);
          continue;
        }

        if (dayDistricts.has(distId)) {
          errors.push(`District "${distName}" is added more than once to Day ${dNum}. Please increase match count instead of adding duplicate district blocks.`);
        }
        dayDistricts.add(distId);
        scheduledDistrictsInRound.add(distId);

        const matchCount = Number(alloc.match_count) || (Array.isArray(alloc.matches) ? alloc.matches.length : 0);
        if (matchCount <= 0) {
          errors.push(`District "${distName}" on Day ${dNum} has 0 configured matches.`);
          continue;
        }

        totalRoundMatches += matchCount;

        const matches = Array.isArray(alloc.matches) ? alloc.matches : [];
        for (let mIdx = 0; mIdx < matches.length; mIdx++) {
          const match = matches[mIdx];
          const mLabel = match.district_match_number || mIdx + 1;

          if (match.start_time && toMins(match.start_time) === null) {
            errors.push(`Match ${mLabel} of "${distName}" on Day ${dNum} has an invalid start time "${match.start_time}". Expected HH:MM format.`);
          }
        }
      }
    }

    if (totalRoundMatches === 0) {
      errors.push(`Round "${rName || `Round ${rNum}`}" has no matches scheduled.`);
    }

    // Progression / advancement validation
    if (round.advancement_target_round_id) {
      const targetRound = rounds.find((r) => r.id === round.advancement_target_round_id);
      if (!targetRound) {
        errors.push(`Round "${rName}" targets next round "${round.advancement_target_round_id}" which does not exist in the roadmap.`);
      } else {
        const advancingTeams = calculateAdvancingTeams(round, scheduledDistrictsInRound.size);
        const targetCapacity = Number(targetRound.capacity) || Number(options.teams_per_district || 16);
        if (advancingTeams > targetCapacity && (!targetRound.advancement_target_round_id || targetRound.round_type === 'grand_final')) {
          warnings.push(
            `Round "${rName}" advances ${advancingTeams} teams, but target final round "${targetRound.name}" typically accommodates ${targetCapacity} teams. Please confirm final stage room capacity.`
          );
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Save manual roadmap as draft in the database.
 * Preserves stable IDs and protects completed matches and existing results.
 */
export async function saveManualRoadmapDraft(client, tournamentId, roadmapData) {
  const rounds = Array.isArray(roadmapData?.rounds) ? roadmapData.rounds : [];

  // Fetch existing matches with recorded results to protect them from deletion
  const existingResultsRes = await client.query(
    `SELECT DISTINCT match_id FROM tournament_match_results WHERE tournament_id = $1`,
    [tournamentId]
  );
  const protectedMatchIds = new Set(existingResultsRes.rows.map((r) => r.match_id));

  // Fetch existing rounds, days, groups, rooms, matches
  const oldRounds = (await client.query('SELECT * FROM tournament_rounds WHERE tournament_id = $1', [tournamentId])).rows;
  const oldDays = (await client.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tournamentId])).rows;
  const oldGroups = (await client.query('SELECT * FROM tournament_groups WHERE tournament_id = $1', [tournamentId])).rows;
  const oldRooms = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [tournamentId])).rows;
  const oldMatches = (await client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [tournamentId])).rows;

  const currentRoundIds = new Set();
  const currentDayIds = new Set();
  const currentGroupIds = new Set();
  const currentRoomIds = new Set();
  const currentMatchIds = new Set();

  let globalMatchCounter = 0;

  // Temporarily negate existing round numbers to prevent UNIQUE(tournament_id, round_number) collisions when reordering/deleting
  await client.query(
    `UPDATE tournament_rounds SET round_number = -1 * (ABS(round_number) + 1000) WHERE tournament_id = $1`,
    [tournamentId]
  ).catch(() => {});

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const r = rounds[rIdx];
    const roundId = r.id || `RND-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    currentRoundIds.add(roundId);

    const roundNumber = rIdx + 1;
    const roundName = (r.name || `Round ${roundNumber}`).trim();
    const roundType = r.round_type || (rIdx === rounds.length - 1 && rounds.length > 1 ? 'grand_final' : 'qualifier');
    const advType = r.advancement_type || 'per_district';
    const teamsAdv = r.teams_advancing ? Number(r.teams_advancing) : null;
    const teamsAdvPerDist = r.teams_advancing_per_district ? Number(r.teams_advancing_per_district) : null;
    const teamsAdvPerMatch = r.teams_advancing_per_match ? Number(r.teams_advancing_per_match) : null;
    const nextRoundId = r.advancement_target_round_id || null;

    await client.query(
      `INSERT INTO tournament_rounds (
        id, tournament_id, round_number, name, status, teams_advancing,
        round_type, advancement_type, advancement_target_round_id,
        teams_advancing_per_district, teams_advancing_per_match, round_order, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      ON CONFLICT (id) DO UPDATE
      SET round_number = EXCLUDED.round_number,
          name = EXCLUDED.name,
          round_type = EXCLUDED.round_type,
          advancement_type = EXCLUDED.advancement_type,
          advancement_target_round_id = EXCLUDED.advancement_target_round_id,
          teams_advancing = EXCLUDED.teams_advancing,
          teams_advancing_per_district = EXCLUDED.teams_advancing_per_district,
          teams_advancing_per_match = EXCLUDED.teams_advancing_per_match,
          round_order = EXCLUDED.round_order,
          updated_at = NOW()`,
      [
        roundId,
        tournamentId,
        roundNumber,
        roundName,
        r.status || 'configured',
        teamsAdv,
        roundType,
        advType,
        nextRoundId,
        teamsAdvPerDist,
        teamsAdvPerMatch,
        roundNumber,
      ]
    );

    const days = Array.isArray(r.days) ? r.days : [];
    let roundMatchSeq = 0;

    // Temporarily negate day numbers within this round to avoid UNIQUE(tournament_id, round_id, day_number) collision
    await client.query(
      `UPDATE tournament_days SET day_number = -1 * (ABS(day_number) + 1000) WHERE tournament_id = $1 AND round_id = $2`,
      [tournamentId, roundId]
    ).catch(() => {});

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const d = days[dIdx];
      const dayId = d.id || `DAY-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      currentDayIds.add(dayId);
      const dayNumber = dIdx + 1;

      await client.query(
        `INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET date = EXCLUDED.date, day_number = EXCLUDED.day_number, round_id = EXCLUDED.round_id`,
        [dayId, tournamentId, roundId, dayNumber, d.date || null]
      );

      const allocations = Array.isArray(d.allocations) ? d.allocations : [];
      // Temporarily negate existing sequences for this day to prevent UNIQUE(day_id, sequence) collision when reordering
      await client.query(
        `UPDATE tournament_groups SET sequence = -1 * (ABS(sequence) + 1000) WHERE day_id = $1`,
        [dayId]
      ).catch(() => {});

      for (let aIdx = 0; aIdx < allocations.length; aIdx++) {
        const alloc = allocations[aIdx];
        const distName = alloc.district_name || alloc.name || `District ${aIdx + 1}`;
        const distId = alloc.district_id || alloc.id;
        const groupId = alloc.group_id || alloc.id || `GRP-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        currentGroupIds.add(groupId);

        const gCheck = await client.query('SELECT id FROM tournament_groups WHERE id = $1', [groupId]);
        if (gCheck.rows && gCheck.rows.length > 0) {
          await client.query(
            `UPDATE tournament_groups
             SET group_name = $1, round_id = $2, day_id = $3, sequence = $4, display_order = $5, district_id = $6
             WHERE id = $7`,
            [distName, roundId, dayId, aIdx + 1, aIdx + 1, distId, groupId]
          );
        } else {
          await client.query(
            `INSERT INTO tournament_groups (id, tournament_id, day_id, round_id, group_name, sequence, display_order, district_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE
             SET group_name = EXCLUDED.group_name,
                 round_id = EXCLUDED.round_id,
                 day_id = EXCLUDED.day_id,
                 sequence = EXCLUDED.sequence,
                 display_order = EXCLUDED.display_order,
                 district_id = EXCLUDED.district_id`,
            [groupId, tournamentId, dayId, roundId, distName, aIdx + 1, aIdx + 1, distId]
          );
        }

        // Technical Room representing this district on this day
        const roomId = alloc.room_id || `RM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
        currentRoomIds.add(roomId);
        const roomCapacity = Number(alloc.capacity) || 16;

        await client.query(
          `INSERT INTO tournament_rooms (id, tournament_id, day_id, group_id, round_id, room_number, capacity, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE
           SET day_id = EXCLUDED.day_id, group_id = EXCLUDED.group_id, round_id = EXCLUDED.round_id, capacity = EXCLUDED.capacity, room_number = EXCLUDED.room_number`,
          [roomId, tournamentId, dayId, groupId, roundId, globalMatchCounter + aIdx + 1, roomCapacity, 'DRAFT']
        );

        const matches = Array.isArray(alloc.matches) ? alloc.matches : [];
        for (let mIdx = 0; mIdx < matches.length; mIdx++) {
          const m = matches[mIdx];
          roundMatchSeq++;
          globalMatchCounter++;

          const matchId = m.id || `MAT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          currentMatchIds.add(matchId);

          const startTime = m.start_time || '13:00';
          const endTime = m.end_time || computeMatchEndTime(startTime, 30) || '13:30';
          const map = m.map || 'Erangel';
          const releaseTime = m.id_pwd_release_time || null;
          const notes = m.notes || '';

          await client.query(
            `INSERT INTO tournament_matches (
              id, tournament_id, round_id, day_id, group_id, room_id,
              match_number, start_time, end_time, status, map, group_name,
              origin, manual_override, notes, id_pwd_release_time
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO UPDATE
            SET day_id = EXCLUDED.day_id,
                round_id = EXCLUDED.round_id,
                group_id = EXCLUDED.group_id,
                room_id = EXCLUDED.room_id,
                match_number = EXCLUDED.match_number,
                start_time = EXCLUDED.start_time,
                end_time = EXCLUDED.end_time,
                map = EXCLUDED.map,
                group_name = EXCLUDED.group_name,
                origin = EXCLUDED.origin,
                manual_override = EXCLUDED.manual_override,
                notes = EXCLUDED.notes,
                id_pwd_release_time = EXCLUDED.id_pwd_release_time`,
            [
              matchId,
              tournamentId,
              roundId,
              dayId,
              groupId,
              roomId,
              roundMatchSeq,
              startTime,
              endTime,
              m.status || 'PENDING',
              map,
              distName,
              'manual',
              true,
              notes,
              releaseTime,
            ]
          );
        }
      }
    }
  }

  // Safe cleanup of matches removed by organizer that do NOT have protected results
  for (const om of oldMatches) {
    if (!currentMatchIds.has(om.id)) {
      if (protectedMatchIds.has(om.id)) {
        throw new Error(`Cannot delete Match ${om.match_number} (${om.id}) because it has recorded match results.`);
      }
      // Check if team assignments exist
      const assignCheck = await client.query(
        `SELECT COUNT(*) FROM tournament_match_assignments WHERE match_id = $1`,
        [om.id]
      );
      const assignCount = parseInt(assignCheck.rows?.[0]?.count || '0', 10);
      if (assignCount > 0) {
        // Clear uncompleted assignments for draft match
        await client.query(`DELETE FROM tournament_match_assignments WHERE match_id = $1`, [om.id]).catch(() => {});
      }
      await client.query(`UPDATE tournament_matches SET next_match_id = NULL WHERE next_match_id = $1`, [om.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_matches WHERE id = $1`, [om.id]);
    }
  }

  // Safe cleanup of unused rooms, groups, days, rounds
  for (const r of oldRooms) {
    if (!currentRoomIds.has(r.id)) {
      await client.query(`DELETE FROM tournament_rooms WHERE id = $1`, [r.id]).catch(() => {});
    }
  }
  for (const g of oldGroups) {
    if (!currentGroupIds.has(g.id)) {
      await client.query(`DELETE FROM tournament_groups WHERE id = $1`, [g.id]).catch(() => {});
    }
  }
  for (const d of oldDays) {
    if (!currentDayIds.has(d.id)) {
      await client.query(`DELETE FROM tournament_days WHERE id = $1`, [d.id]).catch(() => {});
    }
  }
  for (const rnd of oldRounds) {
    if (!currentRoundIds.has(rnd.id)) {
      // Guard against deleting rounds with recorded match results
      const roundMatches = oldMatches.filter((m) => m.round_id === rnd.id);
      for (const rm of roundMatches) {
        if (protectedMatchIds.has(rm.id)) {
          throw new Error(`Cannot delete Round "${rnd.name}" because it contains matches with recorded results.`);
        }
      }
      await client.query(`UPDATE tournament_matches SET next_match_id = NULL WHERE next_match_id IN (SELECT id FROM tournament_matches WHERE round_id = $1)`, [rnd.id]).catch(() => {});
      await client.query(`UPDATE tournament_matches SET next_round_id = NULL WHERE tournament_id = $1 AND next_round_id = $2`, [tournamentId, rnd.id]).catch(() => {});
      await client.query(`UPDATE tournament_rounds SET advancement_target_round_id = NULL WHERE tournament_id = $1 AND advancement_target_round_id = $2`, [tournamentId, rnd.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_match_assignments WHERE match_id IN (SELECT id FROM tournament_matches WHERE round_id = $1)`, [rnd.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_matches WHERE round_id = $1`, [rnd.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_rooms WHERE round_id = $1`, [rnd.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_groups WHERE round_id = $1 OR day_id IN (SELECT id FROM tournament_days WHERE round_id = $1)`, [rnd.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_days WHERE round_id = $1`, [rnd.id]).catch(() => {});
      await client.query(`DELETE FROM tournament_rounds WHERE id = $1`, [rnd.id]);
    }
  }

  // Update tournament roadmap status to draft if currently pending
  await client.query(
    `UPDATE tournaments
     SET roadmap_status = CASE WHEN roadmap_status = 'approved' OR roadmap_status = 'published' THEN roadmap_status ELSE 'draft' END,
         version = COALESCE(version, 1) + 1
     WHERE id = $1`,
    [tournamentId]
  );

  return { success: true, message: 'Draft saved successfully.' };
}

/**
 * Validate and publish the manual roadmap.
 */
export async function publishManualRoadmap(client, tournamentId, roadmapData) {
  // 1. Structural validation
  const validation = validateManualRoadmap(roadmapData);
  if (!validation.valid) {
    const err = new Error('ROADMAP_VALIDATION_FAILED');
    err.code = 'ROADMAP_VALIDATION_FAILED';
    err.details = validation.errors;
    err.warnings = validation.warnings;
    throw err;
  }

  // 2. Persist the latest data
  await saveManualRoadmapDraft(client, tournamentId, roadmapData);

  // 3. Mark as approved / published
  // Note: we set roadmap_status = 'approved' and rounds_published = true to preserve
  // full compatibility across Match District gating and public endpoints.
  await client.query(
    `UPDATE tournaments
     SET roadmap_status = 'approved',
         rounds_published = true,
         version = COALESCE(version, 1) + 1
     WHERE id = $1`,
    [tournamentId]
  );

  return {
    success: true,
    status: 'published',
    message: 'Roadmap published successfully.',
    warnings: validation.warnings,
  };
}

/**
 * Unpublish roadmap (revert to draft).
 */
export async function unpublishManualRoadmap(client, tournamentId) {
  await client.query(
    `UPDATE tournaments
     SET roadmap_status = 'draft',
         rounds_published = false,
         version = COALESCE(version, 1) + 1
     WHERE id = $1`,
    [tournamentId]
  );
  return { success: true, status: 'draft', message: 'Roadmap unpublished. Now visible only as draft.' };
}

/**
 * Hydrate hierarchical structure (rounds -> days -> allocations -> matches)
 * from flat database tables so any roadmap format loads smoothly in the manual builder.
 */
export function buildHierarchicalRoadmap(rounds = [], days = [], groups = [], matches = []) {
  const roundOrderMap = new Map(rounds.map((r, i) => [r.id, i]));
  const sortedRounds = rounds.slice().sort((a, b) => (a.round_number || 0) - (b.round_number || 0));

  return sortedRounds.map((rnd) => {
    const roundDays = days
      .filter((d) => d.round_id === rnd.id)
      .sort((a, b) => (a.day_number || 0) - (b.day_number || 0));

    const daysHierarchy = roundDays.map((d) => {
      const dayMatches = matches
        .filter((m) => m.day_id === d.id && m.round_id === rnd.id)
        .sort((a, b) => (a.match_number || 0) - (b.match_number || 0));

      const dayGroups = groups
        .filter((g) => g.day_id === d.id)
        .sort((a, b) => (a.display_order ?? a.sequence ?? 0) - (b.display_order ?? b.sequence ?? 0) || String(a.id || '').localeCompare(String(b.id || '')));

      // Group matches by district while preserving explicit sequence order
      const allocMap = new Map();

      // Pre-populate allocations from dayGroups to preserve organizer-configured order
      for (const g of dayGroups) {
        allocMap.set(g.id, {
          id: g.id,
          group_id: g.id,
          sequence: g.sequence,
          display_order: g.display_order || g.sequence,
          district_id: g.district_id || g.id,
          district_name: g.group_name || 'District 1',
          room_id: null,
          match_count: 0,
          matches: [],
        });
      }

      for (const m of dayMatches) {
        let alloc = null;
        if (m.group_id && allocMap.has(m.group_id)) {
          alloc = allocMap.get(m.group_id);
        } else {
          // Check by district_name if group_id didn't match directly
          const matchedByName = Array.from(allocMap.values()).find(
            (a) => a.district_name === m.group_name
          );
          if (matchedByName) {
            alloc = matchedByName;
          } else {
            const distKey = m.group_id || m.group_name || 'District 1';
            if (!allocMap.has(distKey)) {
              allocMap.set(distKey, {
                id: distKey,
                group_id: m.group_id || distKey,
                sequence: allocMap.size + 1,
                display_order: allocMap.size + 1,
                district_id: m.group_id || distKey,
                district_name: m.group_name || 'District 1',
                room_id: m.room_id,
                match_count: 0,
                matches: [],
              });
            }
            alloc = allocMap.get(distKey);
          }
        }

        if (m.room_id && !alloc.room_id) alloc.room_id = m.room_id;
        if (m.group_name && !alloc.district_name) alloc.district_name = m.group_name;

        alloc.match_count++;
        alloc.matches.push({
          id: m.id,
          match_number: m.match_number,
          district_match_number: alloc.match_count,
          start_time: m.start_time,
          end_time: m.end_time,
          map: m.map,
          status: m.status,
          notes: m.notes || '',
          id_pwd_release_time: m.id_pwd_release_time,
          origin: m.origin || 'manual',
        });
      }

      return {
        id: d.id,
        day_number: d.day_number,
        date: d.date,
        allocations: Array.from(allocMap.values()).sort(
          (a, b) => (a.display_order ?? a.sequence ?? 0) - (b.display_order ?? b.sequence ?? 0) || String(a.id || '').localeCompare(String(b.id || ''))
        ),
      };
    });

    return {
      id: rnd.id,
      round_number: rnd.round_number,
      name: rnd.name,
      round_type: rnd.round_type || 'qualifier',
      status: rnd.status || 'configured',
      advancement_type: rnd.advancement_type || 'per_district',
      teams_advancing: rnd.teams_advancing,
      teams_advancing_per_district: rnd.teams_advancing_per_district,
      teams_advancing_per_match: rnd.teams_advancing_per_match,
      advancement_target_round_id: rnd.advancement_target_round_id,
      days: daysHierarchy,
    };
  });
}

/**
 * Delete a specific tournament round and its roadmap-only child configuration.
 * Preserves unrelated rounds and re-sequences remaining rounds cleanly.
 */
export async function deleteTournamentRound(client, tournamentId, roundId) {
  // 1. Fetch rounds for tournament
  const roundsRes = await client.query(
    `SELECT id, round_number, name FROM tournament_rounds WHERE tournament_id = $1 ORDER BY round_number ASC`,
    [tournamentId]
  );
  const allRounds = roundsRes.rows || [];
  if (allRounds.length <= 1) {
    const err = new Error('Cannot delete the only round in a roadmap. A tournament roadmap must have at least one round. To reset the entire roadmap, use "Delete Entire Roadmap".');
    err.code = 'MINIMUM_ROUNDS_REQUIRED';
    throw err;
  }

  const targetRound = allRounds.find((r) => r.id === roundId);
  if (!targetRound) {
    const err = new Error(`Round with ID "${roundId}" not found in this tournament.`);
    err.code = 'ROUND_NOT_FOUND';
    throw err;
  }

  // 2. Check protected results
  const protectedRes = await client.query(
    `SELECT tmr.match_id
     FROM tournament_match_results tmr
     JOIN tournament_matches tm ON tm.id = tmr.match_id
     WHERE tm.tournament_id = $1 AND tm.round_id = $2
     LIMIT 1`,
    [tournamentId, roundId]
  );
  if (protectedRes.rows && protectedRes.rows.length > 0) {
    const err = new Error(`Cannot delete round "${targetRound.name}" because it contains matches with recorded results.`);
    err.code = 'ROUND_HAS_RESULTS';
    throw err;
  }

  // 3. Clear progression / FK links pointing to matches or round
  await client.query(
    `UPDATE tournament_matches
     SET next_match_id = NULL
     WHERE next_match_id IN (SELECT id FROM tournament_matches WHERE round_id = $1)`,
    [roundId]
  );
  await client.query(
    `UPDATE tournament_matches
     SET next_round_id = NULL
     WHERE tournament_id = $1 AND next_round_id = $2`,
    [tournamentId, roundId]
  );
  await client.query(
    `UPDATE tournament_rounds
     SET advancement_target_round_id = NULL
     WHERE tournament_id = $1 AND advancement_target_round_id = $2`,
    [tournamentId, roundId]
  );

  // 4. Delete child records in dependency order
  await client.query(
    `DELETE FROM tournament_match_assignments
     WHERE match_id IN (SELECT id FROM tournament_matches WHERE round_id = $1)`,
    [roundId]
  );
  await client.query(
    `DELETE FROM tournament_matches WHERE round_id = $1 AND tournament_id = $2`,
    [roundId, tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_rooms WHERE round_id = $1 AND tournament_id = $2`,
    [roundId, tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_groups
     WHERE round_id = $1 OR day_id IN (SELECT id FROM tournament_days WHERE round_id = $1)`,
    [roundId]
  );
  await client.query(
    `DELETE FROM tournament_days WHERE round_id = $1 AND tournament_id = $2`,
    [roundId, tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_rounds WHERE id = $1 AND tournament_id = $2`,
    [roundId, tournamentId]
  );

  // 5. Re-sequence remaining rounds
  // Negate round numbers first to prevent collisions on UNIQUE(tournament_id, round_number)
  await client.query(
    `UPDATE tournament_rounds
     SET round_number = -1 * (round_number + 1000)
     WHERE tournament_id = $1`,
    [tournamentId]
  );

  const remainingRes = await client.query(
    `SELECT id, round_number
     FROM tournament_rounds
     WHERE tournament_id = $1
     ORDER BY CASE WHEN round_number < 0 THEN -1 * round_number - 1000 ELSE round_number END ASC, created_at ASC`,
    [tournamentId]
  );
  const remaining = remainingRes.rows || [];
  for (let i = 0; i < remaining.length; i++) {
    const newSeq = i + 1;
    await client.query(
      `UPDATE tournament_rounds
       SET round_number = $1, round_order = $1, updated_at = NOW()
       WHERE id = $2`,
      [newSeq, remaining[i].id]
    );
  }

  // 6. Update tournament version
  await client.query(
    `UPDATE tournaments
     SET version = COALESCE(version, 1) + 1
     WHERE id = $1`,
    [tournamentId]
  );

  return {
    success: true,
    deleted_round_id: roundId,
    deleted_round_name: targetRound.name,
    remaining_rounds_count: remaining.length,
  };
}

/**
 * Delete the entire tournament roadmap configuration (Master Delete Roadmap).
 * Atomically removes all rounds, days, groups, rooms, matches, assignments,
 * and planning results, resetting status to draft without touching team registrations or payments.
 */
export async function deleteEntireRoadmap(client, tournamentId) {
  // 1. Check if tournament exists
  const tRes = await client.query(
    `SELECT id, "orgId", roadmap_status, finalized_at, timeline FROM tournaments WHERE id = $1`,
    [tournamentId]
  );
  if (!tRes.rows || tRes.rows.length === 0) {
    const err = new Error('Tournament not found.');
    err.code = 'TOURNAMENT_NOT_FOUND';
    throw err;
  }
  if (tRes.rows[0].finalized_at) {
    const err = new Error('Finalized tournament roadmap is locked.');
    err.code = 'TOURNAMENT_FINALIZED';
    throw err;
  }

  // 2. Check if any match in this tournament has recorded match results
  const resultsCheck = await client.query(
    `SELECT match_id FROM tournament_match_results WHERE tournament_id = $1 LIMIT 1`,
    [tournamentId]
  );
  if (resultsCheck.rows && resultsCheck.rows.length > 0) {
    const err = new Error('Cannot delete entire roadmap because tournament has recorded match results. Historical match records must be preserved.');
    err.code = 'ROADMAP_HAS_RESULTS';
    throw err;
  }

  // 3. Detach self-referencing and inter-round pointers
  await client.query(
    `UPDATE tournament_matches
     SET next_match_id = NULL, next_round_id = NULL
     WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `UPDATE tournament_rounds
     SET advancement_target_round_id = NULL
     WHERE tournament_id = $1`,
    [tournamentId]
  );

  // 4. Delete child records in strict foreign-key dependency order
  await client.query(
    `DELETE FROM tournament_match_assignments WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_matches WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_rooms WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_groups WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_days WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_rounds WHERE tournament_id = $1`,
    [tournamentId]
  );
  await client.query(
    `DELETE FROM tournament_planning_result WHERE tournament_id = $1`,
    [tournamentId]
  );

  // Purge legacy tournament_roadmap snapshot table if present
  await client.query(
    `DELETE FROM tournament_roadmap WHERE tournament_id = $1`,
    [tournamentId]
  );

  // 5. Clean timeline rounds (if timeline contains rounds or roadmap JSON)
  let timeline = tRes.rows[0].timeline;
  let cleanedTimeline = null;
  if (timeline) {
    if (typeof timeline === 'string') {
      try { timeline = JSON.parse(timeline); } catch { timeline = null; }
    }
    if (timeline && typeof timeline === 'object' && !Array.isArray(timeline)) {
      delete timeline.rounds;
      delete timeline.roadmap;
      cleanedTimeline = Object.keys(timeline).length > 0 ? JSON.stringify(timeline) : null;
    }
  }

  // 6. Reset roadmap status to draft and rounds_published to false atomically
  await client.query(
    `UPDATE tournaments
     SET roadmap_status = 'draft',
         rounds_published = false,
         timeline = $1,
         version = COALESCE(version, 1) + 1
     WHERE id = $2`,
    [cleanedTimeline, tournamentId]
  );

  return {
    success: true,
    tournament_id: tournamentId,
    message: 'Roadmap deleted successfully. Ready for a fresh configuration.',
  };
}

/**
 * Reorder district allocations within a match day.
 * Persists sequence and display_order atomically in the database.
 */
export async function reorderDistrictAllocations(client, tournamentId, dayId, orderedGroupIds) {
  if (!Array.isArray(orderedGroupIds) || orderedGroupIds.length === 0) {
    const err = new Error('ordered_group_ids must be a non-empty array of allocation IDs.');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  // 1. Verify day belongs to tournament
  const dayRes = await client.query(
    `SELECT id, round_id, day_number FROM tournament_days WHERE id = $1 AND tournament_id = $2`,
    [dayId, tournamentId]
  );
  if (!dayRes.rows || dayRes.rows.length === 0) {
    const err = new Error('Match day does not belong to this tournament.');
    err.code = 'DAY_NOT_FOUND';
    throw err;
  }

  // 2. Fetch existing groups on this day
  const existingGroupsRes = await client.query(
    `SELECT id, group_name, sequence FROM tournament_groups WHERE day_id = $1 AND tournament_id = $2`,
    [dayId, tournamentId]
  );
  const existingGroups = existingGroupsRes.rows || [];
  const existingIdSet = new Set(existingGroups.map((g) => g.id));

  // Validate every group in orderedGroupIds exists on this day
  for (const gid of orderedGroupIds) {
    if (!existingIdSet.has(gid)) {
      const err = new Error(`Allocation ID "${gid}" does not belong to Day ${dayRes.rows[0].day_number}.`);
      err.code = 'INVALID_ALLOCATION';
      throw err;
    }
  }

  // 3. Negate sequences to avoid UNIQUE(day_id, sequence) collision
  await client.query(
    `UPDATE tournament_groups
     SET sequence = -1 * (ABS(sequence) + 1000)
     WHERE day_id = $1`,
    [dayId]
  ).catch(() => {});

  // 4. Update new sequence and display_order deterministically
  for (let i = 0; i < orderedGroupIds.length; i++) {
    const newSeq = i + 1;
    const gid = orderedGroupIds[i];
    await client.query(
      `UPDATE tournament_groups
       SET sequence = $1, display_order = $1
       WHERE id = $2 AND day_id = $3`,
      [newSeq, gid, dayId]
    );
  }

  // 5. Bump tournament version
  await client.query(
    `UPDATE tournaments
     SET version = COALESCE(version, 1) + 1
     WHERE id = $1`,
    [tournamentId]
  );

  return {
    success: true,
    day_id: dayId,
    ordered_ids: orderedGroupIds,
  };
}

