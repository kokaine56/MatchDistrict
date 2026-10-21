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
import { getTournamentRounds } from './roundsService.js';
import { isRoadmapPublished } from './roadmapStatus.js';
import {
  normalizeRoadmapConfig,
  distributeDistrictSizes,
  defaultTeamsAdvancing,
} from './roadmapConfig.js';
import { isTournamentOrganizer } from './tournamentAuth.js';

export const ROUND_TYPES = Object.freeze([
  'qualifier',
  'grand_final',
]);

export const ADVANCEMENT_TYPES = Object.freeze([
  'per_district',
  'per_match',
  'overall',
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
    'SELECT id, title, "slotsTotal", "slotsFilled", teams_per_group, teams_per_match, game, status, roadmap_status, "registrationCloseDate", "registrationOpenDate", "startDate", date, prize, prize_pool_amount, prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp, prize_positions FROM tournaments WHERE id = $1',
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
      registration_close_date: tourney.registrationCloseDate || null,
      registration_open_date: tourney.registrationOpenDate || null,
      start_date: tourney.startDate || tourney.date || null,
      prize: tourney.prize || null,
      prize_pool_amount: tourney.prize_pool_amount || null,
      prize_split_1st: tourney.prize_split_1st || tourney.prizeSplit1st || null,
      prize_split_2nd: tourney.prize_split_2nd || tourney.prizeSplit2nd || null,
      prize_split_3rd: tourney.prize_split_3rd || tourney.prizeSplit3rd || null,
      prize_split_mvp: tourney.prize_split_mvp || tourney.prizeSplitMvp || null,
      prize_positions: tourney.prize_positions || null,
      has_empty_districts: emptyDistricts.length > 0,
      is_consistent: true,
      warnings,
    },
  };
}

/**
 * Dynamically parse configured prize distribution from tournament metadata.
 * Does not hardcode 4 ranks; returns configured ranks with percentages and amounts.
 */
export function getPrizePositions(meta) {
  if (!meta) return [];

  // 1. If structured prize_positions JSON is available
  if (meta.prize_positions) {
    try {
      const raw = typeof meta.prize_positions === 'string' ? JSON.parse(meta.prize_positions) : meta.prize_positions;
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map((p, idx) => {
          const pool = Number(meta.prize_pool_amount) || (meta.prize && !isNaN(Number(meta.prize)) ? Number(meta.prize) : 0);
          const pct = p.percentage != null ? Number(p.percentage) : null;
          let calculatedAmount = p.prize_amount != null ? Number(p.prize_amount) : null;
          if (calculatedAmount == null && pct != null && pool > 0) {
            calculatedAmount = Math.round((pct / 100) * pool);
          }
          return {
            rank: idx + 1,
            name: p.name || `Rank ${idx + 1}`,
            percentage: pct,
            prize_amount: calculatedAmount,
          };
        });
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Fallback to individual splits (prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp)
  const splits = [];
  const pool = Number(meta.prize_pool_amount) || (meta.prize && !isNaN(Number(meta.prize)) ? Number(meta.prize) : 0);

  if (meta.prize_split_1st) {
    const pct = Number(meta.prize_split_1st);
    splits.push({ rank: 1, name: '1st Place (Champion)', percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }
  if (meta.prize_split_2nd) {
    const pct = Number(meta.prize_split_2nd);
    splits.push({ rank: 2, name: '2nd Place (Runner-up)', percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }
  if (meta.prize_split_3rd) {
    const pct = Number(meta.prize_split_3rd);
    splits.push({ rank: 3, name: '3rd Place', percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }
  if (meta.prize_split_mvp) {
    const pct = Number(meta.prize_split_mvp);
    splits.push({ rank: 4, name: 'MVP / 4th Place', percentage: pct, prize_amount: pool ? Math.round((pct / 100) * pool) : null });
  }

  if (splits.length > 0) return splits;

  // 3. Fallback: default placement distribution
  return [
    { rank: 1, name: '1st Place (Champion)', percentage: 50, prize_amount: pool ? Math.round(pool * 0.5) : null },
    { rank: 2, name: '2nd Place', percentage: 25, prize_amount: pool ? Math.round(pool * 0.25) : null },
    { rank: 3, name: '3rd Place', percentage: 15, prize_amount: pool ? Math.round(pool * 0.15) : null },
    { rank: 4, name: '4th Place', percentage: 10, prize_amount: pool ? Math.round(pool * 0.10) : null },
  ];
}

export { calculateAdvancingTeams, syncAutoDistrictsForLaterRounds } from './roadmapAutoDistricts.js';
import { calculateAdvancingTeams, syncAutoDistrictsForLaterRounds } from './roadmapAutoDistricts.js';


/**
 * Validate manual roadmap structure.
 * Returns { valid: boolean, errors: string[], warnings: string[] }.
 */
export function validateManualRoadmap(roadmapData, options = {}) {
  const errors = [];
  const warnings = [];

  // Synchronize auto-districts for rounds after Round 1 (Round 2+, Grand Finals)
  const syncResult = syncAutoDistrictsForLaterRounds(roadmapData, options);
  if (syncResult?.warnings?.length > 0) {
    warnings.push(...syncResult.warnings);
  }

  const rounds = Array.isArray(roadmapData?.rounds) ? roadmapData.rounds : [];
  if (rounds.length === 0) {
    errors.push('The roadmap must have at least one round configured.');
    return { valid: false, errors, warnings };
  }

  const roundIds = new Set();
  const roundNames = new Set();
  const roundOrderMap = new Map();

  let prevRoundEndDate = null;
  let prevRoundQualifiers = null;
  let prevRoundName = null;

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

    // Stage type validation: only 'qualifier' and 'grand_final' are allowed
    const rType = round.round_type || 'qualifier';
    if (!ROUND_TYPES.includes(rType)) {
      errors.push(`Round "${rName || `Round ${rNum}`}" has an invalid stage type "${round.round_type}". Only "Qualifiers" and "Grand Finals" are supported.`);
    }

    const days = Array.isArray(round.days) ? round.days : [];
    if (days.length === 0) {
      errors.push(`Round "${rName || `Round ${rNum}`}" must have at least one match day.`);
      continue;
    }

    let totalRoundMatches = 0;
    const scheduledDistrictsInRound = new Set();
    let prevDayDate = null;
    let roundStartDate = null;
    let roundEndDate = null;

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const day = days[dIdx];
      const dNum = day.day_number || dIdx + 1;

      // Validate date
      if (options.isPublish && (!day.date || !isValidDateStr(day.date))) {
        errors.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" must have a valid date in YYYY-MM-DD format.`);
      } else if (day.date && !isValidDateStr(day.date)) {
        warnings.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" has an invalid date format (expected YYYY-MM-DD).`);
      }

      if (day.date && isValidDateStr(day.date)) {
        if (!roundStartDate) roundStartDate = day.date;
        roundEndDate = day.date;

        if (prevDayDate && day.date < prevDayDate) {
          const msg = `Day ${dNum} date (${day.date}) cannot precede Day ${dNum - 1} date (${prevDayDate}) in "${rName || `Round ${rNum}`}".`;
          if (options.isPublish) {
            errors.push(msg);
          } else {
            warnings.push(msg);
          }
        }
        prevDayDate = day.date;
      }

      const allocations = Array.isArray(day.allocations) ? day.allocations : [];
      if (allocations.length === 0) {
        errors.push(`Day ${dNum} in "${rName || `Round ${rNum}`}" has no districts scheduled.`);
        continue;
      }

      if (round.round_type === 'grand_final') {
        const dayMatches = allocations.flatMap((a) => (Array.isArray(a.matches) ? a.matches : []));
        if (dayMatches.length === 0) {
          errors.push(`Day ${dNum} in Grand Finals requires at least one match with a valid time and map.`);
        }
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
        if (options.isPublish && matches.length === 0) {
          errors.push(`District "${distName}" on Day ${dNum} has no matches configured.`);
        }

        for (let mIdx = 0; mIdx < matches.length; mIdx++) {
          const match = matches[mIdx];
          const mLabel = match.district_match_number || mIdx + 1;

          if (round.round_type === 'grand_final') {
            if (!match.start_time || toMins(match.start_time) === null) {
              errors.push(`Day ${dNum} Match ${mLabel} in Grand Finals requires a valid start time.`);
            }
            if (match.map !== undefined && !String(match.map).trim()) {
              errors.push(`Day ${dNum} Match ${mLabel} in Grand Finals requires a valid map.`);
            }
          } else {
            if (!match.start_time) {
              if (options.isPublish) {
                errors.push(`Match ${mLabel} of "${distName}" on Day ${dNum} requires a start time.`);
              }
            } else if (toMins(match.start_time) === null) {
              errors.push(`Match ${mLabel} of "${distName}" on Day ${dNum} has an invalid start time "${match.start_time}". Expected HH:MM format.`);
            }
          }
        }

        // Publish validation: check for overlapping matches inside the SAME district.
        // Parallel districts scheduled at the same time are explicitly allowed.
        if (options.isPublish) {
          for (let i = 0; i < matches.length; i++) {
            const m1 = matches[i];
            const m1Start = toMins(m1.start_time);
            if (m1Start === null) continue;
            const m1End = toMins(m1.end_time) ?? (m1Start + (Number(options.matchDurationMinutes) || 30));

            for (let j = i + 1; j < matches.length; j++) {
              const m2 = matches[j];
              const m2Start = toMins(m2.start_time);
              if (m2Start === null) continue;
              const m2End = toMins(m2.end_time) ?? (m2Start + (Number(options.matchDurationMinutes) || 30));

              if (m1Start < m2End && m2Start < m1End) {
                errors.push(
                  `Day ${dNum} in "${rName || `Round ${rNum}`}": Matches in district "${distName}" overlap (${m1.start_time || '??'}-${m1.end_time || minsToHHMM(m1End)} and ${m2.start_time || '??'}-${m2.end_time || minsToHHMM(m2End)}).`
                );
              }
            }
          }
        }
      }
    }

    if (totalRoundMatches === 0) {
      errors.push(`Round "${rName || `Round ${rNum}`}" has no matches scheduled.`);
    }

    // Chronological order across rounds
    if (roundStartDate && prevRoundEndDate && roundStartDate < prevRoundEndDate) {
      const msg = `Round "${rName || `Round ${rNum}`}" starts on ${roundStartDate}, which is before previous round "${prevRoundName}" ends on ${prevRoundEndDate}.`;
      if (options.isPublish) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
    if (roundEndDate) {
      prevRoundEndDate = roundEndDate;
    }

    // Publish check: in Round 1, check that all expected districts are assigned to at least one day
    if (options.isPublish && rIdx === 0) {
      const slotsTotal = Number(options.slotsTotal);
      const teamsPerGroup = Number(options.teams_per_group || 16);
      if (slotsTotal > 0 && teamsPerGroup > 0) {
        const expectedCount = Math.ceil(slotsTotal / teamsPerGroup);
        if (scheduledDistrictsInRound.size < expectedCount) {
          errors.push(`Round 1 only has ${scheduledDistrictsInRound.size} of ${expectedCount} required districts scheduled. Every district must be assigned to a day.`);
        }
      }
    }

    // Calculate advancing teams for this round
    const advancingTeams = calculateAdvancingTeams(round, scheduledDistrictsInRound.size);
    const isGrandFinal = round.round_type === 'grand_final';

    // Incoming teams calculation (teams_in or derived)
    let roundTeamsIn = round.teams_in != null ? Number(round.teams_in) : null;
    if (roundTeamsIn == null) {
      if (rIdx === 0) {
        const slotsTotal = Number(options.slotsTotal);
        if (slotsTotal > 0) {
          roundTeamsIn = slotsTotal;
        } else if (scheduledDistrictsInRound.size > 0) {
          roundTeamsIn = scheduledDistrictsInRound.size * (Number(options.teams_per_group) || 16);
        }
      } else if (prevRoundQualifiers != null && prevRoundQualifiers > 0) {
        roundTeamsIn = prevRoundQualifiers;
      }
    }

    // Publish blocking check: Teams advancing cannot exceed teams in
    if (options.isPublish && !isGrandFinal && roundTeamsIn != null && roundTeamsIn > 0 && advancingTeams > roundTeamsIn) {
      errors.push(`Round "${rName || `Round ${rNum}`}": Teams advancing (${advancingTeams}) cannot exceed incoming teams (${roundTeamsIn}).`);
    }

    // Publish blocking check: Non-final round must have a valid qualification rule
    if (options.isPublish && !isGrandFinal && rIdx < rounds.length - 1) {
      if (!round.advancement_type || advancingTeams <= 0) {
        errors.push(`Non-final round "${rName || `Round ${rNum}`}" must have a valid qualification rule configured.`);
      }
    }

    // Rule consistency: incoming teams vs previous round qualifiers
    if (rIdx > 0 && round.teams_in != null && prevRoundQualifiers != null && prevRoundQualifiers > 0) {
      const incoming = Number(round.teams_in);
      if (incoming !== prevRoundQualifiers) {
        warnings.push(
          `"${rName || `Round ${rNum}`}" is planned for ${incoming} incoming teams, but previous round "${prevRoundName}" qualifies ${prevRoundQualifiers} teams.`
        );
      }
    }
    prevRoundQualifiers = advancingTeams;
    prevRoundName = rName || `Round ${rNum}`;

    // Progression / advancement validation (only for qualifying/non-final rounds)
    if (isGrandFinal && rIdx < rounds.length - 1) {
      errors.push(`Grand Finals must be the last round of the tournament.`);
      warnings.push(`"${rName}" is designated as Grand Finals (terminal stage). Subsequent rounds configured after it will not be reached in standard progression.`);
    }

    if (!isGrandFinal && round.advancement_target_round_id) {
      const targetRound = rounds.find((r) => r.id === round.advancement_target_round_id);
      if (!targetRound) {
        errors.push(`Round "${rName}" targets next round "${round.advancement_target_round_id}" which does not exist in the roadmap.`);
      } else {
        const targetCapacity = Number(targetRound.capacity) || Number(options.teams_per_district || 16);
        if (advancingTeams > targetCapacity && (!targetRound.advancement_target_round_id || targetRound.round_type === 'grand_final')) {
          warnings.push(
            `Round "${rName}" advances ${advancingTeams} teams, but target final round "${targetRound.name}" typically accommodates ${targetCapacity} teams. Please confirm final stage room capacity.`
          );
        }
      }
    }
  }

  const grandFinalsCount = rounds.filter((r) => r.round_type === 'grand_final').length;
  if (grandFinalsCount > 1) {
    errors.push('At most one Grand Finals round is allowed.');
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
export async function saveManualRoadmapDraft(client, tournamentId, roadmapData, options = {}) {
  // Fetch existing matches with recorded results to protect them from deletion
  const existingResultsRes = await client.query(
    `SELECT DISTINCT match_id FROM tournament_match_results WHERE tournament_id = $1`,
    [tournamentId]
  );
  const protectedMatchIds = new Set(existingResultsRes.rows.map((r) => r.match_id));

  // Query groups with team assignments or verified results to protect them from removal
  const assignedOrResultGroupsRes = await client.query(
    `SELECT DISTINCT group_id FROM tournament_match_assignments WHERE tournament_id = $1 AND group_id IS NOT NULL
     UNION
     SELECT DISTINCT tm.group_id FROM tournament_match_results tmr JOIN tournament_matches tm ON tm.id = tmr.match_id WHERE tm.tournament_id = $1 AND tm.group_id IS NOT NULL`,
    [tournamentId]
  ).catch(() => ({ rows: [] }));
  const protectedGroupIds = new Set(assignedOrResultGroupsRes.rows.map((r) => r.group_id));

  // Auto-sync districts for later rounds with protection against deleting active districts
  const syncResult = syncAutoDistrictsForLaterRounds(roadmapData, {
    protectedGroupIds,
    teams_per_group: options?.teams_per_group,
  });
  const warnings = syncResult?.warnings || [];

  const rounds = Array.isArray(roadmapData?.rounds) ? roadmapData.rounds : [];

  // Fetch existing rounds, days, groups, rooms, matches
  const oldRounds = (await client.query('SELECT * FROM tournament_rounds WHERE tournament_id = $1', [tournamentId])).rows;
  const oldDays = (await client.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tournamentId])).rows;
  const oldGroups = (await client.query('SELECT * FROM tournament_groups WHERE tournament_id = $1', [tournamentId])).rows;
  const oldRooms = (await client.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1', [tournamentId])).rows;
  const oldMatches = (await client.query('SELECT * FROM tournament_matches WHERE tournament_id = $1', [tournamentId])).rows;

  // Identify rounds and days that have verified match results
  const roundIdsWithResults = new Set();
  const dayIdsWithResults = new Set();
  for (const om of oldMatches) {
    if (protectedMatchIds.has(om.id)) {
      if (om.round_id) roundIdsWithResults.add(om.round_id);
      if (om.day_id) dayIdsWithResults.add(om.day_id);
    }
  }

  for (const lockedRoundId of roundIdsWithResults) {
    const oldRound = oldRounds.find((r) => r.id === lockedRoundId);
    const newRound = rounds.find((r) => r.id === lockedRoundId);

    if (!newRound) {
      const err = new Error(`Cannot delete or remove round "${oldRound?.name || lockedRoundId}": this round has verified match results.`);
      err.code = 'ROUND_STRUCTURALLY_LOCKED';
      throw err;
    }

    const isOldLast = oldRound.round_number === oldRounds.length;
    const newRoundIndex = rounds.findIndex((r) => r.id === lockedRoundId);
    const isNewLast = newRoundIndex === rounds.length - 1;
    const oldType = (oldRound.round_type === 'grand_final' && isOldLast) ? 'grand_final' : 'qualifier';
    const newType = (newRound.round_type === 'grand_final' && isNewLast) ? 'grand_final' : 'qualifier';
    const oldAdvType = oldRound.advancement_type || 'per_district';
    const newAdvType = newRound.advancement_type || 'per_district';
    const oldAdv = oldRound.teams_advancing ? Number(oldRound.teams_advancing) : null;
    const newAdv = newRound.teams_advancing ? Number(newRound.teams_advancing) : null;
    const oldAdvPerDist = oldRound.teams_advancing_per_district ? Number(oldRound.teams_advancing_per_district) : null;
    const newAdvPerDist = newRound.teams_advancing_per_district ? Number(newRound.teams_advancing_per_district) : null;
    const oldTeamsIn = oldRound.teams_in != null ? Number(oldRound.teams_in) : null;
    const newTeamsIn = newRound.teams_in != null ? Number(newRound.teams_in) : null;
    const oldTarget = oldRound.advancement_target_round_id || null;
    const newTarget = newRound.advancement_target_round_id || null;

    if (
      oldType !== newType ||
      oldAdvType !== newAdvType ||
      oldAdv !== newAdv ||
      oldAdvPerDist !== newAdvPerDist ||
      oldTeamsIn !== newTeamsIn ||
      oldTarget !== newTarget
    ) {
      const err = new Error(
        `Cannot modify qualification rules or structure of round "${oldRound.name}": this round has verified match results. Only renaming is permitted.`
      );
      err.code = 'ROUND_STRUCTURALLY_LOCKED';
      throw err;
    }
  }

  // Pre-validate incoming days and matches: only days and matches with verified results are locked from removal.
  // Schedule, matches, and details on later days (or any day without results) remain freely editable.
  const incomingDayIds = new Set();
  const incomingMatchIds = new Set();
  rounds.forEach((r) => {
    (r.days || []).forEach((d) => {
      if (d.id) incomingDayIds.add(d.id);
      (d.allocations || []).forEach((a) => {
        (a.matches || []).forEach((m) => {
          if (m.id) incomingMatchIds.add(m.id);
        });
      });
    });
  });

  for (const lockedDayId of dayIdsWithResults) {
    if (!incomingDayIds.has(lockedDayId)) {
      const err = new Error(
        `Cannot delete or remove day "${lockedDayId}": this day has verified match results.`
      );
      err.code = 'ROUND_STRUCTURALLY_LOCKED';
      throw err;
    }
  }

  for (const lockedMatchId of protectedMatchIds) {
    if (!incomingMatchIds.has(lockedMatchId)) {
      const om = oldMatches.find((m) => m.id === lockedMatchId);
      const matchLabel = om?.match_number != null ? `Match ${om.match_number} (${lockedMatchId})` : `match "${lockedMatchId}"`;
      const err = new Error(
        `Cannot delete ${matchLabel} because it has recorded match results.`
      );
      err.code = 'ROUND_STRUCTURALLY_LOCKED';
      throw err;
    }
  }

  // Reject edits to locked days or matches with a clear error naming what is locked
  for (const r of rounds) {
    for (const d of (r.days || [])) {
      if (d.id && dayIdsWithResults.has(d.id)) {
        const oldDay = oldDays.find((od) => od.id === d.id);
        if (oldDay && d.date && d.date !== oldDay.date) {
          const err = new Error(
            `Cannot modify date for Day ${oldDay.day_number || ''} (${oldDay.date}): this match day contains verified results and is locked.`
          );
          err.code = 'DAY_LOCKED';
          throw err;
        }
      }
      for (const a of (d.allocations || [])) {
        for (const m of (a.matches || [])) {
          if (m.id && protectedMatchIds.has(m.id)) {
            const oldMatch = oldMatches.find((om) => om.id === m.id);
            if (oldMatch) {
              const timeChanged = m.start_time && m.start_time !== oldMatch.start_time;
              const endTimeChanged = m.end_time && m.end_time !== oldMatch.end_time;
              const mapChanged = m.map && m.map !== oldMatch.map;
              const notesChanged = m.notes != null && m.notes !== (oldMatch.notes || '');
              if (timeChanged || endTimeChanged || mapChanged || notesChanged) {
                const err = new Error(
                  `Cannot modify Match ${oldMatch.match_number || m.id}: this match has verified results and is locked.`
                );
                err.code = 'MATCH_LOCKED';
                throw err;
              }
            }
          }
        }
      }
    }
  }

  const currentRoundIds = new Set();
  const currentDayIds = new Set();
  const currentGroupIds = new Set();
  const currentRoomIds = new Set();
  const currentMatchIds = new Set();

  let globalMatchCounter = 0;

  // Identify rooms that already have verified match results or configured credentials.
  // Their room_number must NOT be modified or temporarily negated.
  const lockedRoomIds = new Set();
  const preservedRoomNumbers = new Map();
  for (const om of oldMatches) {
    const hasResults = protectedMatchIds.has(om.id);
    const hasCreds = Boolean(
      (om.room_identifier && om.room_identifier.trim()) ||
      (om.room_password && om.room_password.trim())
    );
    if (hasResults || hasCreds) {
      if (om.room_id) lockedRoomIds.add(om.room_id);
    }
  }
  for (const r of oldRooms) {
    if (lockedRoomIds.has(r.id)) {
      preservedRoomNumbers.set(r.id, r.room_number);
    }
  }

  // Temporarily negate existing room numbers for modifiable rooms to prevent UNIQUE(tournament_id, room_number) collision during reordering
  if (lockedRoomIds.size > 0) {
    await client.query(
      `UPDATE tournament_rooms SET room_number = -1 * (ABS(room_number) + 1000) WHERE tournament_id = $1 AND NOT (id = ANY($2))`,
      [tournamentId, Array.from(lockedRoomIds)]
    ).catch(() => {});
  } else {
    await client.query(
      `UPDATE tournament_rooms SET room_number = -1 * (ABS(room_number) + 1000) WHERE tournament_id = $1`,
      [tournamentId]
    ).catch(() => {});
  }

  const occupiedRoomNumbers = new Set(Array.from(preservedRoomNumbers.values()));
  let nextFreeRoomNumber = 1;
  function getNextFreeRoomNumber() {
    while (occupiedRoomNumbers.has(nextFreeRoomNumber)) {
      nextFreeRoomNumber++;
    }
    const allocated = nextFreeRoomNumber;
    occupiedRoomNumbers.add(allocated);
    nextFreeRoomNumber++;
    return allocated;
  }
  const usedExistingRoomIds = new Set();

  // Temporarily negate existing round numbers to prevent UNIQUE(tournament_id, round_number) collisions when reordering/deleting
  await client.query(
    `UPDATE tournament_rounds SET round_number = -1 * (ABS(round_number) + 1000) WHERE tournament_id = $1`,
    [tournamentId]
  ).catch(() => {});

  // Temporarily negate existing match numbers to prevent UNIQUE(tournament_id, round_id, match_number) collisions when reordering
  await client.query(
    `UPDATE tournament_matches SET match_number = -1 * (ABS(match_number) + 1000) WHERE tournament_id = $1`,
    [tournamentId]
  ).catch(() => {});

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const r = rounds[rIdx];
    const roundId = r.id || `RND-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    currentRoundIds.add(roundId);

    const roundNumber = rIdx + 1;
    const roundName = (r.name || `Round ${roundNumber}`).trim();
    const isLastRound = rIdx === rounds.length - 1;
    const isGrandFinal = isLastRound && (
      r.round_type === 'grand_final' ||
      (!r.round_type && rounds.length > 1 && Boolean(r.name && /grand\s*final/i.test(r.name)))
    );
    const roundType = isGrandFinal ? 'grand_final' : 'qualifier';
    const advType = isGrandFinal ? null : (r.advancement_type || 'per_district');
    const teamsAdv = (!isGrandFinal && r.teams_advancing) ? Number(r.teams_advancing) : null;
    const teamsAdvPerDist = (!isGrandFinal && r.teams_advancing_per_district) ? Number(r.teams_advancing_per_district) : null;
    const teamsAdvPerMatch = (!isGrandFinal && r.teams_advancing_per_match) ? Number(r.teams_advancing_per_match) : null;
    const nextRoundId = isGrandFinal ? null : (r.advancement_target_round_id || null);
    const teamsIn = r.teams_in != null ? Number(r.teams_in) : null;

    await client.query(
      `INSERT INTO tournament_rounds (
        id, tournament_id, round_number, name, status, teams_advancing,
        round_type, advancement_type, advancement_target_round_id,
        teams_advancing_per_district, teams_advancing_per_match, round_order, teams_in, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
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
          teams_in = EXCLUDED.teams_in,
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
        teamsIn,
      ]
    );

    const days = Array.isArray(r.days) ? r.days : [];
    let roundMatchSeq = 0;

    // Temporarily negate day numbers within this round to avoid UNIQUE(tournament_id, round_id, day_number) collision
    await client.query(
      `UPDATE tournament_days SET day_number = -1 * (ABS(day_number) + 1000) WHERE tournament_id = $1 AND round_id = $2`,
      [tournamentId, roundId]
    ).catch(() => {});

    // Temporarily negate match numbers within this round to avoid UNIQUE(tournament_id, round_id, match_number) collision
    await client.query(
      `UPDATE tournament_matches SET match_number = -1 * (ABS(match_number) + 1000) WHERE tournament_id = $1 AND round_id = $2`,
      [tournamentId, roundId]
    ).catch(() => {});

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const d = days[dIdx];
      const dayId = d.id || `DAY-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      currentDayIds.add(dayId);
      const dayNumber = dIdx + 1;

      // Protect day date if this day has verified match results; otherwise apply new date
      const isDayLocked = dayIdsWithResults.has(dayId);
      const oldDay = oldDays.find((od) => od.id === dayId);
      const effectiveDate = isDayLocked && oldDay && oldDay.date ? oldDay.date : (d.date || null);

      await client.query(
        `INSERT INTO tournament_days (id, tournament_id, round_id, day_number, date)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET date = EXCLUDED.date, day_number = EXCLUDED.day_number, round_id = EXCLUDED.round_id`,
        [dayId, tournamentId, roundId, dayNumber, effectiveDate]
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

        // Technical Room representing this district on this day.
        // Reuse existing room row for the same (day, district) if available to avoid duplicate inserts.
        let matchedExistingRoom = null;
        if (alloc.room_id && !usedExistingRoomIds.has(alloc.room_id)) {
          matchedExistingRoom = oldRooms.find((r) => r.id === alloc.room_id) || null;
        }
        if (!matchedExistingRoom) {
          matchedExistingRoom = oldRooms.find((r) => r.day_id === dayId && r.group_id === groupId && !usedExistingRoomIds.has(r.id)) || null;
        }
        if (!matchedExistingRoom) {
          const candidateGroup = oldGroups.find((g) => g.day_id === dayId && (g.district_id === distId || g.group_name === distName));
          if (candidateGroup) {
            matchedExistingRoom = oldRooms.find((r) => r.day_id === dayId && r.group_id === candidateGroup.id && !usedExistingRoomIds.has(r.id)) || null;
          }
        }
        if (!matchedExistingRoom) {
          const candidateGroup = oldGroups.find((g) => g.district_id === distId || g.group_name === distName);
          if (candidateGroup) {
            matchedExistingRoom = oldRooms.find((r) => r.group_id === candidateGroup.id && !usedExistingRoomIds.has(r.id)) || null;
          }
        }

        let roomId;
        let targetRoomNumber;
        if (matchedExistingRoom) {
          roomId = matchedExistingRoom.id;
          usedExistingRoomIds.add(roomId);
          if (lockedRoomIds.has(roomId)) {
            targetRoomNumber = preservedRoomNumbers.get(roomId);
          } else {
            targetRoomNumber = getNextFreeRoomNumber();
          }
        } else {
          roomId = alloc.room_id || `RM-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          targetRoomNumber = getNextFreeRoomNumber();
        }

        alloc.room_id = roomId;
        currentRoomIds.add(roomId);
        const roomCapacity = Number(alloc.capacity) || 16;

        await client.query(
          `INSERT INTO tournament_rooms (id, tournament_id, day_id, group_id, round_id, room_number, capacity, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE
           SET day_id = EXCLUDED.day_id,
               group_id = EXCLUDED.group_id,
               round_id = EXCLUDED.round_id,
               capacity = EXCLUDED.capacity,
               room_number = EXCLUDED.room_number`,
          [roomId, tournamentId, dayId, groupId, roundId, targetRoomNumber, roomCapacity, 'DRAFT']
        );

        const matches = Array.isArray(alloc.matches) ? alloc.matches : [];
        for (let mIdx = 0; mIdx < matches.length; mIdx++) {
          const m = matches[mIdx];
          roundMatchSeq++;
          globalMatchCounter++;

          const matchId = m.id || `MAT-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
          currentMatchIds.add(matchId);

          // If this match already has verified results, protect its schedule and settings;
          // otherwise apply organizer updates (date, time, map, notes).
          const isMatchLocked = protectedMatchIds.has(matchId);
          const oldMatch = oldMatches.find((om) => om.id === matchId);

          const startTime = isMatchLocked && oldMatch && oldMatch.start_time ? oldMatch.start_time : (m.start_time || '13:00');
          const endTime = isMatchLocked && oldMatch && oldMatch.end_time ? oldMatch.end_time : (m.end_time || computeMatchEndTime(startTime, 30) || '13:30');
          const map = isMatchLocked && oldMatch && oldMatch.map ? oldMatch.map : (m.map || 'Erangel');
          const releaseTime = isMatchLocked && oldMatch ? oldMatch.id_pwd_release_time : (m.id_pwd_release_time || null);
          const notes = isMatchLocked && oldMatch && oldMatch.notes != null ? oldMatch.notes : (m.notes || '');
          const matchStatus = isMatchLocked && oldMatch && oldMatch.status ? oldMatch.status : (m.status || 'PENDING');

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
              matchStatus,
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
      if (lockedRoomIds.has(r.id)) {
        const err = new Error(`Cannot delete room "${r.id}": this room has verified match results or configured credentials.`);
        err.code = 'ROOM_LOCKED';
        throw err;
      }
      await client.query(`DELETE FROM tournament_rooms WHERE id = $1`, [r.id]).catch(() => {});
    }
  }
  for (const g of oldGroups) {
    if (!currentGroupIds.has(g.id)) {
      if (protectedGroupIds.has(g.id)) {
        throw new Error(`Cannot delete group "${g.group_name || g.id}": this group has team assignments or verified results.`);
      }
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

  return { success: true, message: 'Draft saved successfully.', warnings };
}

/**
 * Validate and publish the manual roadmap.
 */
export async function publishManualRoadmap(client, tournamentId, roadmapData, options = {}) {
  // 1. Structural validation
  const validation = validateManualRoadmap(roadmapData, options);
  if (!validation.valid) {
    const err = new Error('ROADMAP_VALIDATION_FAILED');
    err.code = 'ROADMAP_VALIDATION_FAILED';
    err.details = validation.errors;
    err.warnings = validation.warnings;
    throw err;
  }

  // 2. Persist the latest data
  const saveResult = await saveManualRoadmapDraft(client, tournamentId, roadmapData, options);

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
    warnings: [...(validation.warnings || []), ...(saveResult?.warnings || [])],
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

  return sortedRounds.map((rnd, rIdx) => {
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

    const isLastRound = rIdx === sortedRounds.length - 1;
    const isGrandFinal = isLastRound && (
      rnd.round_type === 'grand_final' ||
      (!rnd.round_type && sortedRounds.length > 1 && Boolean(rnd.name && /grand\s*final/i.test(rnd.name)))
    );
    const mappedRoundType = isGrandFinal ? 'grand_final' : 'qualifier';
    return {
      id: rnd.id,
      round_number: rnd.round_number,
      name: rnd.name,
      round_type: mappedRoundType,
      status: rnd.status || 'configured',
      teams_in: rnd.teams_in != null ? Number(rnd.teams_in) : null,
      advancement_type: isGrandFinal ? null : (rnd.advancement_type || 'per_district'),
      teams_advancing: isGrandFinal ? null : rnd.teams_advancing,
      teams_advancing_per_district: isGrandFinal ? null : rnd.teams_advancing_per_district,
      teams_advancing_per_match: isGrandFinal ? null : rnd.teams_advancing_per_match,
      advancement_target_round_id: isGrandFinal ? null : rnd.advancement_target_round_id,
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

  // 2b. Check if any team assignments exist in this tournament
  const assignmentsCheck = await client.query(
    `SELECT id FROM tournament_match_assignments WHERE tournament_id = $1 LIMIT 1`,
    [tournamentId]
  );
  if (assignmentsCheck.rows && assignmentsCheck.rows.length > 0) {
    const err = new Error('Cannot delete roadmap because teams are already assigned to matches.');
    err.code = 'ROADMAP_HAS_ASSIGNMENTS';
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

/**
 * Authoritative handler for GET /api/tournaments/:id/roadmap.
 * Enforces participant privacy gating and organizer metadata projections.
 */
export async function getTournamentRoadmapResponse(clientOrPool, tournamentId, authUser = null, nowMs = Date.now()) {
  const tRes = await clientOrPool.query(
    'SELECT "orgId", roadmap_status, rounds_published, room_credentials_release_minutes, status, timeline, "slotsTotal", teams_per_group, teams_per_match, game, matches_per_day, first_match_time, match_gap_minutes, match_duration_minutes, teams_advancing_per_district, enable_semi_finals, "registrationCloseDate", "registrationOpenDate", "startDate", date, prize, prize_pool_amount, prize_split_1st, prize_split_2nd, prize_split_3rd, prize_split_mvp, prize_positions, card_color FROM tournaments WHERE id = $1',
    [tournamentId]
  );
  if (!tRes.rows || tRes.rows.length === 0) {
    return {
      statusCode: 404,
      body: { success: false, error: 'NOT_FOUND', message: 'Tournament not found.' },
    };
  }

  const t = tRes.rows[0];
  const isOrganizer = isTournamentOrganizer(authUser, t);
  const isPublished = isRoadmapPublished(t);

  // ── PARTICIPANT / PUBLIC MODE PRIVACY GATE ──
  // Until published, ordinary participants and visitors see ONLY "Roadmap will be published soon."
  if (!isOrganizer && !isPublished) {
    return {
      statusCode: 200,
      body: {
        success: true,
        mode: 'public',
        viewer_is_organizer: false,
        is_organizer: false,
        roadmap_status: t.roadmap_status || 'draft',
        published: false,
        message: 'Roadmap will be published soon.',
        participant: null,
        roadmap: null,
      },
    };
  }

  const rounds = await getTournamentRounds(clientOrPool, tournamentId);
  const roundOrder = new Map(rounds.map((r, i) => [r.id, i]));
  const daysQuery = await clientOrPool.query('SELECT * FROM tournament_days WHERE tournament_id = $1', [tournamentId]);
  const days = (daysQuery.rows || [])
    .sort((a, b) =>
      (roundOrder.get(a.round_id) ?? -1) - (roundOrder.get(b.round_id) ?? -1) ||
      a.day_number - b.day_number
    )
    .map((d) => ({
      ...d,
      round_number: rounds.find((r) => r.id === d.round_id)?.round_number ?? null,
    }));
  const groups = await clientOrPool.query('SELECT * FROM tournament_groups WHERE tournament_id = $1 ORDER BY COALESCE(display_order, sequence, 0) ASC, sequence ASC, id ASC', [tournamentId]);
  const rooms = await clientOrPool.query('SELECT * FROM tournament_rooms WHERE tournament_id = $1 ORDER BY room_number ASC', [tournamentId]);
  const matches = await clientOrPool.query('SELECT * FROM tournament_matches WHERE tournament_id = $1 ORDER BY match_number ASC', [tournamentId]);

  const assignments = await clientOrPool.query(`
    SELECT match_id, room_id, tournament_team_id
    FROM tournament_match_assignments
    WHERE tournament_id = $1
  `, [tournamentId]);

  const slotsTotal = parseInt(t.slotsTotal, 10) || 64;
  const teamsPerGroup = parseInt(t.teams_per_group || t.teams_per_match, 10) || DEFAULT_TEAMS_PER_GROUP;
  const groupLayout = buildGroups(slotsTotal, teamsPerGroup);
  const cfg = normalizeRoadmapConfig(t);

  const districtsData = await getTournamentDistricts(clientOrPool, tournamentId);
  const structuredRounds = buildHierarchicalRoadmap(rounds, days, groups.rows || [], matches.rows || []);

  const roadmapMeta = {
    total_slots: slotsTotal,
    teams_per_group: teamsPerGroup,
    num_groups: districtsData.districts?.length || groupLayout.length,
    group_names: (districtsData.districts || []).map((d) => d.name),
    district_names: (districtsData.districts || []).map((d) => d.name),
    district_sizes: distributeDistrictSizes(slotsTotal, teamsPerGroup),
    top_per_group: cfg.teamsAdvancingPerDistrict != null
      ? Math.min(teamsPerGroup, cfg.teamsAdvancingPerDistrict)
      : defaultTeamsAdvancing(teamsPerGroup),
    matches_per_day: cfg.matchesPerDayProvided ? cfg.matchesPerDay : null,
    first_match_time: cfg.firstMatchTime,
    match_gap_minutes: cfg.matchGapMinutes,
    match_duration_minutes: cfg.matchDurationMinutes,
    release_offset_minutes: cfg.releaseOffsetMinutes,
    enable_semi_finals: cfg.enableSemiFinals,
    game: t.game || 'bgmi',
    registration_close_date: t.registrationCloseDate || null,
    registration_open_date: t.registrationOpenDate || null,
    start_date: t.startDate || t.date || null,
    total_teams: districtsData.meta?.total_teams ?? 0,
    prize: t.prize || null,
    prize_pool_amount: t.prize_pool_amount || null,
    prize_split_1st: t.prize_split_1st || t.prizeSplit1st || null,
    prize_split_2nd: t.prize_split_2nd || t.prizeSplit2nd || null,
    prize_split_3rd: t.prize_split_3rd || t.prizeSplit3rd || null,
    prize_split_mvp: t.prize_split_mvp || t.prizeSplitMvp || null,
    prize_positions: t.prize_positions || null,
    card_color: t.card_color || 'white',
  };

  let plannedCapacity = null;
  if (structuredRounds && structuredRounds.length > 0) {
    if (structuredRounds[0].teams_in != null && structuredRounds[0].teams_in > 0) {
      plannedCapacity = Number(structuredRounds[0].teams_in);
    } else {
      const r1Districts = new Set();
      for (const d of (structuredRounds[0].days || [])) {
        for (const a of (d.allocations || [])) {
          if (a.district_id) r1Districts.add(a.district_id);
        }
      }
      if (r1Districts.size > 0) {
        plannedCapacity = r1Districts.size * teamsPerGroup;
      }
    }
  }

  if (isOrganizer && plannedCapacity != null && plannedCapacity !== slotsTotal) {
    roadmapMeta.capacity_warning = `Roadmap was built for ${plannedCapacity} teams, but tournament capacity is now ${slotsTotal}.`;
    roadmapMeta.capacity_mismatch = {
      planned: plannedCapacity,
      current: slotsTotal,
    };
  }

  if (isOrganizer) {
    return {
      statusCode: 200,
      body: {
        success: true,
        mode: 'organizer',
        viewer_is_organizer: true,
        is_organizer: true,
        roadmap_status: t.roadmap_status || (days.length > 0 ? 'draft' : 'pending'),
        published: isPublished,
        participant: null,
        roadmap: {
          rounds,
          days,
          groups: groups.rows || [],
          rooms: rooms.rows || [],
          matches: (matches.rows || []).map((m) => {
            const dayRow = days.find((d) => d.id === m.day_id);
            const dateStr = dayRow ? dayRow.date : null;
            const released = isMatchReleased(dateStr, m.start_time, t.room_credentials_release_minutes || 15, nowMs);
            return {
              ...m,
              credentials_available: released,
            };
          }),
          assignments: assignments.rows || [],
          districts: districtsData.districts || [],
          structured_rounds: structuredRounds,
          meta: roadmapMeta,
        },
      },
    };
  }

  // ── PUBLISHED PARTICIPANT / PUBLIC SCHEDULE ──
  let team = null;
  let myDistrictIds = [];
  let myMatchIds = [];

  if (authUser && authUser.id) {
    const teamRes = await clientOrPool.query(`
      SELECT t.id, t.team_name, t.status, t.tournament_id
      FROM tournament_teams t
      JOIN tournament_team_members tm ON tm.tournament_team_id = t.id
      WHERE t.tournament_id = $1 AND tm.user_id = $2
      LIMIT 1
    `, [tournamentId, authUser.id]);
    if (teamRes.rows && teamRes.rows.length > 0) {
      team = teamRes.rows[0];

      // Query only the viewer's own assignments across all rounds (never other teams)
      const myAssignmentsRes = await clientOrPool.query(`
        SELECT a.match_id, a.room_id, a.group_id, a.day_id, a.tournament_team_id,
               COALESCE(a.group_id, m.group_id, r.group_id) as district_id
        FROM tournament_match_assignments a
        LEFT JOIN tournament_matches m ON m.id = a.match_id
        LEFT JOIN tournament_rooms r ON r.id = a.room_id
        WHERE a.tournament_id = $1 AND a.tournament_team_id = $2
      `, [tournamentId, team.id]);

      const distSet = new Set();
      const matchSet = new Set();
      for (const row of (myAssignmentsRes.rows || [])) {
        if (row.tournament_team_id && row.tournament_team_id !== team.id) {
          continue;
        }
        if (row.district_id) distSet.add(row.district_id);
        if (row.group_id) distSet.add(row.group_id);
        if (row.match_id) matchSet.add(row.match_id);
      }
      myDistrictIds = Array.from(distSet);
      myMatchIds = Array.from(matchSet);
    }
  }

  return {
    statusCode: 200,
    headers: {
      'Cache-Control': 'private, no-cache, must-revalidate',
    },
    body: {
      success: true,
      mode: team ? 'participant' : 'public',
      viewer_is_organizer: false,
      is_organizer: false,
      roadmap_status: t.roadmap_status || 'published',
      published: true,
      my_district_ids: myDistrictIds,
      my_match_ids: myMatchIds,
      participant: team ? {
        team_id: team.id,
        team_name: team.team_name,
        team_status: team.status,
        my_district_ids: myDistrictIds,
        my_match_ids: myMatchIds,
        is_disqualified: team.status === 'disqualified',
        disqualification_message: team.status === 'disqualified'
          ? 'Your team is disqualified and cannot receive room credentials or participate in matches.'
          : null,
      } : null,
      roadmap: {
        rounds: (rounds || [])
          .filter((r) => r.status !== 'draft' && r.status !== 'unpublished')
          .map((r) => ({
            ...r,
            advancement_target_round_id: null,
          })),
        days,
        groups: groups.rows || [],
        rooms: rooms.rows || [],
        structured_rounds: (structuredRounds || [])
          .filter((r) => r.status !== 'draft' && r.status !== 'unpublished')
          .map((r) => ({
            ...r,
            advancement_target_round_id: null,
          })),
        matches: (matches.rows || []).map((m) => {
          const dayRow = days.find((d) => d.id === m.day_id);
          const dateStr = dayRow ? dayRow.date : null;
          const isDisqualified = team && team.status === 'disqualified';
          const released = !isDisqualified && isMatchReleased(dateStr, m.start_time, t.room_credentials_release_minutes || 15, nowMs);
          return {
            id: m.id,
            room_id: m.room_id,
            group_id: m.group_id,
            day_id: m.day_id,
            match_number: m.match_number,
            start_time: m.start_time,
            end_time: m.end_time,
            status: m.status,
            round_id: m.round_id,
            group_name: m.group_name,
            map: m.map || 'Erangel',
            id_pwd_release_time: m.id_pwd_release_time || null,
            origin: m.origin || 'manual',
            credentials_available: released,
            ...(released ? { room_identifier: m.room_identifier, room_password: m.room_password } : {}),
          };
        }),
        districts: (districtsData.districts || []).map((d) => ({
          id: d.id,
          group_index: d.group_index,
          name: d.name,
          code: d.code,
          capacity: d.capacity,
          slot_start: d.slot_start,
          slot_end: d.slot_end,
        })),
        meta: (() => {
          const safeMeta = { ...roadmapMeta };
          delete safeMeta.capacity_warning;
          delete safeMeta.capacity_mismatch;
          return safeMeta;
        })(),
      },
    },
  };
}

