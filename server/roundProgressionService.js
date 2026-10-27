import { ALLOCATION_SOURCES, randomId } from './allocationService.js';
import { sortAndRank, ensureCanonicalTeams, getEligibleTournamentTeams } from './leaderboardService.js';
import { getDistrictDisplayName } from './roadmapDistricts.js';

export const ROUND_STATUS = Object.freeze({
  CONFIGURED: 'configured',
  LIVE: 'live',
  COMPLETED: 'completed',
});

export const PROGRESSION_ERR = Object.freeze({
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  ROADMAP_NOT_APPROVED: 'ROADMAP_NOT_APPROVED',
  MATCH_NOT_FOUND: 'MATCH_NOT_FOUND',
  MATCH_ALREADY_PROCESSED: 'MATCH_ALREADY_PROCESSED',
  TOURNAMENT_FINALIZED: 'TOURNAMENT_FINALIZED',
  RESULTS_INCOMPLETE: 'RESULTS_INCOMPLETE',
  SOURCES_NOT_READY: 'SOURCES_NOT_READY',
  ROUND_NOT_FOUND: 'ROUND_NOT_FOUND',
  ROUND_ALREADY_COMPLETED: 'ROUND_ALREADY_COMPLETED',
  ROUND_NO_RESULTS: 'ROUND_NO_RESULTS',
  NO_NEXT_ROUND: 'NO_NEXT_ROUND',
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_TEAMS: 'DUPLICATE_TEAMS',
  TEAM_DID_NOT_PLAY_SOURCE_ROUND: 'TEAM_DID_NOT_PLAY_SOURCE_ROUND',
  TEAM_DISQUALIFIED: 'TEAM_DISQUALIFIED',
  SOURCE_MATCHES_UNVERIFIED: 'SOURCE_MATCHES_UNVERIFIED',
  TARGET_ROUND_HAS_RESULTS: 'TARGET_ROUND_HAS_RESULTS',
  INVALID_PLACEMENT: 'INVALID_PLACEMENT',
});

export class ProgressionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProgressionError';
    this.code = code;
  }
}

export function progressionError(code, message) {
  return new ProgressionError(code, message);
}

export async function getRoundStandings(client, tournamentId, roundId) {
  let placementMap = new Map();
  try {
    const lastMatchRes = await client.query(
      `SELECT m.id
       FROM tournament_matches m
       JOIN tournament_match_results mr ON mr.match_id = m.id AND mr.status = 'verified'
       LEFT JOIN tournament_days d ON d.id = m.day_id
       WHERE m.round_id = $1 AND m.tournament_id = $2
       GROUP BY m.id, d.day_number, m.match_number
       ORDER BY COALESCE(d.day_number, 1) DESC, m.match_number DESC, m.id DESC
       LIMIT 1`,
      [roundId, tournamentId]
    );

    if (lastMatchRes.rows.length > 0) {
      const lastMatchId = lastMatchRes.rows[0].id;
      const placementsRes = await client.query(
        `SELECT team_id, MIN(placement)::int AS placement
         FROM tournament_match_results
         WHERE match_id = $1 AND tournament_id = $2 AND status = 'verified'
         GROUP BY team_id`,
        [lastMatchId, tournamentId]
      );
      for (const r of placementsRes.rows) {
        if (r.placement != null) {
          placementMap.set(r.team_id, Number(r.placement));
        }
      }
    }
  } catch {
    // Tolerant fallback for test environments
  }

  const res = await client.query(
    `SELECT
       tm.team_id,
       MAX(t.team_name) as team_name,
       MAX(u.name) AS leader_name,
       SUM(tm.kills)::int AS total_kills,
       SUM(tm.kill_points)::int AS total_kill_points,
       SUM(tm.placement_points)::int AS total_placement_points,
       SUM(tm.total_points)::int AS total_points,
       SUM(CASE WHEN tm.wwcd THEN 1 ELSE 0 END)::int AS wwcd_count,
       MIN(tm.placement) AS best_placement
     FROM tournament_match_results tm
     JOIN tournament_matches m ON m.id = tm.match_id
     JOIN tournament_teams t ON t.id = tm.team_id
     LEFT JOIN users u ON u.id = t.leader_user_id
     WHERE m.round_id = $1 AND tm.tournament_id = $2 AND tm.status = 'verified'
     GROUP BY tm.team_id`,
    [roundId, tournamentId]
  );
  const rows = res.rows.map((row) => ({
    ...row,
    last_match_placement: placementMap.has(row.team_id) ? placementMap.get(row.team_id) : null,
  }));
  return sortAndRank(rows);
}

export async function processRoundQualifiers(client, tournamentId, roundId, teamsAdvancing) {
  const standings = await getRoundStandings(client, tournamentId, roundId);
  const cutoff = teamsAdvancing || 8;
  const qualifiers = standings
    .filter((row) => row && row.team_id)
    .sort((a, b) => (Number(a.rank) || Infinity) - (Number(b.rank) || Infinity))
    .slice(0, cutoff);
  return qualifiers;
}

export async function qualifyMatch(client, { tournamentId, matchId, actorId = null }) {
  if (!client || !tournamentId || !matchId) {
    throw progressionError(PROGRESSION_ERR.MATCH_NOT_FOUND, 'A valid match ID must be provided.');
  }

  const tournRes = await client.query('SELECT id, roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
  if (tournRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_FINALIZED, 'This tournament is finalized; progression is locked.');
  }
  const matchRes = await client.query(
    'SELECT id, round_id, match_number, next_match_id, next_round_id, teams_advancing, progression_processed FROM tournament_matches WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
    [matchId, tournamentId]
  );
  if (matchRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.MATCH_NOT_FOUND, `Match does not exist.`);
  }
  const match = matchRes.rows[0];

  if (match.progression_processed) {
    return {
      success: true,
      alreadyProcessed: true,
      message: `Match was already processed for progression.`,
    };
  }

  // Check if results are complete
  const allocRes = await client.query("SELECT COUNT(*) FROM tournament_match_assignments WHERE match_id = $1 AND status = 'allocated'", [match.id]);
  const resultRes = await client.query("SELECT COUNT(*) FROM tournament_match_results WHERE match_id = $1 AND status = 'verified'", [match.id]);
  
  const assignedCount = parseInt(allocRes.rows[0].count, 10);
  const resultCount = parseInt(resultRes.rows[0].count, 10);

  if (assignedCount > 0 && resultCount < assignedCount) {
    throw progressionError(PROGRESSION_ERR.RESULTS_INCOMPLETE, `Cannot qualify match until all ${assignedCount} assigned teams have verified results. Currently ${resultCount}/${assignedCount}.`);
  }

  if (!match.next_match_id && !match.next_round_id) {
    // Nowhere to go (e.g. Grand Final matches themselves)
    await client.query('UPDATE tournament_matches SET progression_processed = true WHERE id = $1', [matchId]);
    return {
      success: true,
      alreadyProcessed: false,
      message: `Match processed, but no next match/round to advance to.`,
    };
  }

  // Mark this source match as processed
  await client.query('UPDATE tournament_matches SET progression_processed = true WHERE id = $1', [match.id]);

  if (!match.round_id) {
     return {
       success: true,
       alreadyProcessed: false,
       message: 'Match processed, but it lacks a round_id for global qualification.',
       status: 'COMPLETED'
     };
  }

  const sibRes = await client.query('SELECT id, progression_processed FROM tournament_matches WHERE round_id = $1', [match.round_id]);
  const siblings = sibRes.rows;
  const isReadyToAllocate = siblings.every(r => r.progression_processed || r.id === match.id);

  if (!isReadyToAllocate) {
    return {
      success: true,
      alreadyProcessed: false,
      roundCompleted: false,
      message: 'Match processed, waiting for all matches in the round to complete.',
      status: 'WAITING'
    };
  }

  // For round-level progression (next_round_id), do NOT auto-advance teams or write
  // tournament_match_assignments. The organizer's explicit Qualify action is the sole advancement authority.
  if (match.next_round_id) {
    return {
      success: true,
      alreadyProcessed: false,
      roundCompleted: true,
      message: 'Match processed. All matches in the round are verified; ready for organizer round advancement.',
      status: 'COMPLETED'
    };
  }

  // If next_match_id (match-to-match progression) is explicitly configured, advance to that specific target match
  if (match.next_match_id) {
    const roundRes = await client.query('SELECT id, teams_advancing FROM tournament_rounds WHERE id = $1', [match.round_id]);
    const round = roundRes.rows[0] || {};
    const allQualifiers = await processRoundQualifiers(client, tournamentId, match.round_id, round.teams_advancing);
    const targetMatchIds = [match.next_match_id];
    const outcomes = [];
    const slotRes = await client.query(
      `SELECT COALESCE(MAX(slot_number), 0)::int AS max_slot
       FROM tournament_match_assignments
       WHERE tournament_id = $1::varchar AND match_id = $2::varchar`,
      [tournamentId, match.next_match_id]
    );
    let nextSlot = Number(slotRes.rows[0]?.max_slot) || 0;

    for (const team of allQualifiers) {
      nextSlot += 1;
      for (const targetMatchId of targetMatchIds) {
        const allocId = randomId('ASN-');
        await client.query(
          `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, slot_number, status, source)
             VALUES ($1, $2, $3, $4, $5::int, 'allocated', $6)
             ON CONFLICT (tournament_team_id, match_id) DO UPDATE SET
               status = 'allocated',
               source = EXCLUDED.source,
               slot_number = COALESCE(tournament_match_assignments.slot_number, EXCLUDED.slot_number)`,
          [allocId, tournamentId, team.team_id, targetMatchId, nextSlot, ALLOCATION_SOURCES.ADVANCEMENT]
        );
      }
      outcomes.push({ teamId: team.team_id, status: 'advanced' });
    }

    return {
      success: true,
      alreadyProcessed: false,
      advancedCount: allQualifiers.length,
      outcomes,
      message: `All matches in round processed. ${allQualifiers.length} team(s) advanced to next match.`,
      status: 'COMPLETED'
    };
  }

  return {
    success: true,
    alreadyProcessed: false,
    message: 'Match processed.',
    status: 'COMPLETED'
  };
}

export function computeDefaultSnakePlacement(orderedTeamIds = [], targetGroups = []) {
  const groups = Array.isArray(targetGroups) ? targetGroups : [];
  const numDistricts = groups.length;
  const placementMap = {};

  for (let i = 0; i < orderedTeamIds.length; i++) {
    const teamId = orderedTeamIds[i];
    let assignedGroupId = null;

    if (numDistricts > 0) {
      const cycle = 2 * numDistricts;
      const pos = i % cycle;
      const distIdx = pos < numDistricts ? pos : (2 * numDistricts - 1) - pos;
      assignedGroupId = groups[distIdx]?.id || null;
    }
    placementMap[teamId] = assignedGroupId;
  }

  return placementMap;
}

export async function advanceTeamsManually(client, {
  tournamentId,
  sourceRoundId = null,
  targetRoundId,
  targetGroupId = null,
  teamIds = [],
  actorId = null,
  allow_unverified = false,
  override_unverified = false,
  manual_placement = null,
}) {
  if (!client || !tournamentId || !targetRoundId || !Array.isArray(teamIds) || teamIds.length === 0) {
    throw progressionError(PROGRESSION_ERR.INVALID_INPUT, 'Valid tournamentId, targetRoundId, and a non-empty teamIds array are required.');
  }

  // 1. Check for duplicate team IDs
  const uniqueTeamIds = Array.from(new Set(teamIds));
  if (uniqueTeamIds.length !== teamIds.length) {
    throw progressionError(PROGRESSION_ERR.DUPLICATE_TEAMS, 'Duplicate team IDs provided in advancement list.');
  }

  // 2. Row lock on tournament (prevents concurrent modifications)
  const tournRes = await client.query(
    'SELECT id, "orgId", roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE',
    [tournamentId]
  );
  if (tournRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_FINALIZED, 'Tournament is finalized; advancement is locked.');
  }

  // 3. Row lock & validation on target round (must belong to this tournament)
  const targetRoundRes = await client.query(
    'SELECT id, tournament_id, round_number, name, status FROM tournament_rounds WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
    [targetRoundId, tournamentId]
  );
  if (targetRoundRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'Target round not found or does not belong to this tournament.');
  }
  const targetRound = targetRoundRes.rows[0];

  // Map tournament teams and registrations for canonical ID resolution and friendly names
  const { teamCanonicalIdMap, teamNameMap } = await ensureCanonicalTeams(client, tournamentId);

  // 4. Source round validation (if provided)
  let sourceRound = null;
  if (sourceRoundId) {
    const sRes = await client.query(
      'SELECT id, tournament_id, round_number, name, status FROM tournament_rounds WHERE id = $1::varchar AND tournament_id = $2::varchar FOR UPDATE',
      [sourceRoundId, tournamentId]
    );
    if (sRes.rows.length === 0) {
      throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'Source round not found or does not belong to this tournament.');
    }
    sourceRound = sRes.rows[0];

    if (Number(targetRound.round_number) <= Number(sourceRound.round_number)) {
      throw progressionError(PROGRESSION_ERR.INVALID_INPUT, 'Target round must follow source round in round sequence.');
    }

    // 4a. Every team must have played/participated or been eligible in the source round
    const firstRndRes = await client.query(
      'SELECT id, round_number FROM tournament_rounds WHERE tournament_id = $1::varchar ORDER BY round_number ASC LIMIT 1',
      [tournamentId]
    );
    const isFirstRound = firstRndRes.rows.length > 0 && (firstRndRes.rows[0].id === sourceRoundId || Number(sourceRound.round_number) === 1);

    const eligibleSourceTeams = await getEligibleTournamentTeams(client, tournamentId, { roundId: sourceRoundId, isFirstRound });
    const playedTeamSet = new Set();
    for (const t of eligibleSourceTeams) {
      playedTeamSet.add(t.team_id);
      if (t.registration_id) playedTeamSet.add(t.registration_id);
    }

    const playedRes = await client.query(`
      SELECT DISTINCT tournament_team_id AS team_id
      FROM tournament_match_assignments
      WHERE tournament_id = $1::varchar
        AND match_id IN (SELECT id FROM tournament_matches WHERE round_id = $2::varchar AND tournament_id = $1::varchar)
      UNION
      SELECT DISTINCT mr.team_id
      FROM tournament_match_results mr
      JOIN tournament_matches m ON mr.match_id = m.id
      WHERE m.round_id = $2::varchar AND m.tournament_id = $1::varchar
      UNION
      SELECT DISTINCT lb.team_id
      FROM tournament_leaderboard lb
      WHERE lb.tournament_id = $1::varchar AND (lb.matches_played > 0 OR lb.total_points > 0 OR lb.total_kills > 0)
    `, [tournamentId, sourceRoundId]);

    for (const r of playedRes.rows) {
      if (r.team_id) {
        playedTeamSet.add(r.team_id);
        const canon = teamCanonicalIdMap.get(r.team_id);
        if (canon) playedTeamSet.add(canon);
      }
    }

    for (const tId of uniqueTeamIds) {
      const canonicalId = teamCanonicalIdMap.get(tId) || tId;
      const teamName = teamNameMap.get(tId) || teamNameMap.get(canonicalId) || `Team ${tId}`;
      if (!playedTeamSet.has(tId) && !playedTeamSet.has(canonicalId)) {
        console.warn(`[advanceTeamsManually] Participation check failed: teamId=${tId}, canonicalId=${canonicalId}, teamName="${teamName}", sourceRound="${sourceRound.name || sourceRound.round_number}"`);
        throw progressionError(
          PROGRESSION_ERR.TEAM_DID_NOT_PLAY_SOURCE_ROUND,
          `Team "${teamName}" did not play in source round "${sourceRound.name || sourceRound.round_number}" and cannot be advanced.`
        );
      }
    }

    // 4b. If any source match lacks verified results, refuse unless explicit override flag is sent
    const allowOverride = Boolean(allow_unverified || override_unverified);
    const matchVerificationRes = await client.query(`
      SELECT m.id, m.match_number, m.status, COUNT(mr.id)::int AS result_count
      FROM tournament_matches m
      LEFT JOIN tournament_match_results mr ON mr.match_id = m.id
      WHERE m.round_id = $1 AND m.tournament_id = $2
      GROUP BY m.id, m.match_number, m.status
      ORDER BY m.match_number ASC
    `, [sourceRoundId, tournamentId]);

    const unverifiedMatches = matchVerificationRes.rows.filter(
      (m) => Number(m.result_count) === 0 && m.status !== 'COMPLETED'
    );

    if (unverifiedMatches.length > 0 && !allowOverride) {
      const err = progressionError(
        PROGRESSION_ERR.SOURCE_MATCHES_UNVERIFIED,
        `Cannot advance teams: source round has ${unverifiedMatches.length} match(es) lacking verified results. Provide allow_unverified to override.`
      );
      err.unverified_match_ids = unverifiedMatches.map((m) => m.id);
      throw err;
    }
  }

  // 5. Check for disqualified teams among advancing candidates
  const canonicalCandidateIds = uniqueTeamIds.map((t) => teamCanonicalIdMap.get(t) || t);
  const dqCheck = await client.query(
    'SELECT id, team_name, status FROM tournament_teams WHERE id = ANY($1::text[]) AND tournament_id = $2',
    [canonicalCandidateIds, tournamentId]
  );
  for (const teamRow of dqCheck.rows) {
    if (teamRow.status === 'disqualified') {
      throw progressionError(
        PROGRESSION_ERR.TEAM_DISQUALIFIED,
        `Team "${teamRow.team_name || teamRow.id}" is disqualified and cannot advance.`
      );
    }
  }

  // 6. Target round results check: refuse if target round already has recorded match results
  const targetResultsCheck = await client.query(`
    SELECT 1
    FROM tournament_match_results mr
    JOIN tournament_matches m ON mr.match_id = m.id
    WHERE m.round_id = $1 AND m.tournament_id = $2
    LIMIT 1
  `, [targetRoundId, tournamentId]);

  if (targetResultsCheck.rows.length > 0) {
    throw progressionError(
      PROGRESSION_ERR.TARGET_ROUND_HAS_RESULTS,
      'Cannot re-advance: target round already has recorded match results. Existing progression is locked.'
    );
  }

  // 7. Purge previous advancement assignments for target round (safe re-run replacement)
  await client.query(`
    DELETE FROM tournament_match_assignments
    WHERE tournament_id = $1
      AND match_id IN (SELECT id FROM tournament_matches WHERE round_id = $2 AND tournament_id = $1)
      AND source = 'advancement'
  `, [tournamentId, targetRoundId]);

  // 8. Fetch target round matches and districts (groups)
  const targetMatchesRes = await client.query(
    'SELECT id, round_id, group_id, day_id, match_number FROM tournament_matches WHERE round_id = $1 AND tournament_id = $2 ORDER BY match_number ASC',
    [targetRoundId, tournamentId]
  );
  const targetMatches = targetMatchesRes.rows;
  if (targetMatches.length === 0) {
    throw progressionError(
      PROGRESSION_ERR.MATCH_NOT_FOUND,
      'No matches configured in target round to advance teams into. Please configure target round schedule first.'
    );
  }

  const targetGroupsRes = await client.query(
    `SELECT g.id, g.group_name, g.sequence
     FROM tournament_groups g
     LEFT JOIN tournament_days d ON d.id = g.day_id
     WHERE g.round_id = $1 AND g.tournament_id = $2
     ORDER BY COALESCE(d.day_number, 1) ASC, COALESCE(g.display_order, g.sequence, 0) ASC, g.id ASC`,
    [targetRoundId, tournamentId]
  );
  const targetGroups = targetGroupsRes.rows;

  // 9. Order advancing teams by source round rank descending for snake seeding
  let orderedTeamIds = [...uniqueTeamIds];
  if (sourceRoundId) {
    try {
      const standings = await getRoundStandings(client, tournamentId, sourceRoundId);
      if (Array.isArray(standings) && standings.length > 0) {
        const rankMap = new Map(standings.map((t, idx) => [t.team_id, t.rank ?? (idx + 1)]));
        orderedTeamIds.sort((a, b) => (rankMap.get(a) || 9999) - (rankMap.get(b) || 9999));
      }
    } catch {
      // Keep initial order if standings query encounters an issue
    }
  }

  // 10. Parse manual placement override if provided
  const manualPlacementMap = new Map();
  if (manual_placement) {
    if (Array.isArray(manual_placement)) {
      for (const item of manual_placement) {
        if (item && item.team_id && item.group_id) {
          manualPlacementMap.set(item.team_id, item.group_id);
        }
      }
    } else if (typeof manual_placement === 'object') {
      for (const [tId, gId] of Object.entries(manual_placement)) {
        if (gId) manualPlacementMap.set(tId, gId);
      }
    }

    // Validate that every group_id in manual placement exists in target round
    const validTargetGroupIds = new Set(targetGroups.map((g) => g.id));
    for (const [tId, gId] of manualPlacementMap.entries()) {
      if (!validTargetGroupIds.has(gId)) {
        throw progressionError(
          PROGRESSION_ERR.INVALID_PLACEMENT,
          `Invalid target district ID "${gId}" specified in manual placement.`
        );
      }
    }
  } else if (targetGroupId) {
    // Legacy support for single targetGroupId
    for (const tId of orderedTeamIds) {
      manualPlacementMap.set(tId, targetGroupId);
    }
  }

  // 11. Distribute teams across target districts:
  // Default: Snake seeding across target districts (or manual placement override)
  const defaultPlacementMap = computeDefaultSnakePlacement(orderedTeamIds, targetGroups);
  const advancedTeams = [];
  const existingSlotsRes = await client.query(
    `SELECT COALESCE(a.group_id, m.group_id) AS group_id, MAX(a.slot_number)::int AS max_slot
     FROM tournament_match_assignments a
     JOIN tournament_matches m ON m.id = a.match_id
     WHERE a.tournament_id = $1::varchar AND m.round_id = $2::varchar
       AND a.status = 'allocated'
     GROUP BY COALESCE(a.group_id, m.group_id)`,
    [tournamentId, targetRoundId]
  );
  const nextSlotByGroup = new Map(existingSlotsRes.rows.map((row) => [row.group_id || '__round__', Number(row.max_slot) || 0]));

  for (let i = 0; i < orderedTeamIds.length; i++) {
    const rawTeamId = orderedTeamIds[i];
    const teamId = (teamCanonicalIdMap && teamCanonicalIdMap.get(rawTeamId)) || rawTeamId;
    let assignedGroupId = null;

    if (manualPlacementMap.has(teamId)) {
      assignedGroupId = manualPlacementMap.get(teamId);
    } else {
      assignedGroupId = defaultPlacementMap[teamId] || null;
    }
    const slotGroupId = assignedGroupId || '__round__';
    const slotNumber = (nextSlotByGroup.get(slotGroupId) || 0) + 1;
    nextSlotByGroup.set(slotGroupId, slotNumber);

    // Determine target matches for this team
    let matchesForTeam = targetMatches;
    if (assignedGroupId) {
      const groupMatches = targetMatches.filter((m) => m.group_id === assignedGroupId);
      if (groupMatches.length > 0) {
        matchesForTeam = groupMatches;
      }
    }

    // Insert assignment row for every match in this team's assigned district
    for (const match of matchesForTeam) {
      const allocId = randomId('ASN-');
      await client.query(`
        INSERT INTO tournament_match_assignments
          (id, tournament_id, tournament_team_id, match_id, group_id, day_id, slot_number, status, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7::int, 'allocated', $8)
        ON CONFLICT (tournament_team_id, match_id) DO UPDATE SET
          status = 'allocated',
          source = EXCLUDED.source,
          slot_number = COALESCE(tournament_match_assignments.slot_number, EXCLUDED.slot_number),
          group_id = COALESCE(EXCLUDED.group_id, tournament_match_assignments.group_id),
          day_id = COALESCE(EXCLUDED.day_id, tournament_match_assignments.day_id)
      `, [
        allocId,
        tournamentId,
        teamId,
        match.id,
        match.group_id || assignedGroupId || null,
        match.day_id || null,
        slotNumber,
        ALLOCATION_SOURCES.ADVANCEMENT,
      ]);
    }

    advancedTeams.push(teamId);
  }

  // 12. Mark the source round completed after advancing
  if (sourceRoundId) {
    await client.query(
      `UPDATE tournament_rounds SET status = 'completed' WHERE id = $1 AND tournament_id = $2`,
      [sourceRoundId, tournamentId]
    );
  }

  // 13. Derive Qualified / Eliminated / Disqualified progression status per team for source round
  const advancedTeamSet = new Set(advancedTeams);
  let derivedProgression = [];
  if (sourceRoundId) {
    const sourceParticipantsRes = await client.query(`
      SELECT DISTINCT t.id, t.team_name, t.status
      FROM tournament_teams t
      WHERE t.id IN (
        SELECT tournament_team_id FROM tournament_match_assignments WHERE match_id IN (SELECT id FROM tournament_matches WHERE round_id = $1)
        UNION
        SELECT team_id FROM tournament_match_results WHERE match_id IN (SELECT id FROM tournament_matches WHERE round_id = $1)
      ) AND t.tournament_id = $2
    `, [sourceRoundId, tournamentId]);

    derivedProgression = sourceParticipantsRes.rows.map((t) => {
      let progressionStatus = 'eliminated';
      if (advancedTeamSet.has(t.id)) {
        progressionStatus = 'qualified';
      } else if (t.status === 'disqualified') {
        progressionStatus = 'disqualified';
      }
      return {
        team_id: t.id,
        team_name: t.team_name,
        status: progressionStatus,
      };
    });
  }

  // Audit log
  try {
    const logId = randomId('LOG-');
    await client.query(`
      INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
      VALUES ($1, $2, 'teams_advanced', 'tournament_round', $3, $4)
    `, [
      logId,
      actorId,
      targetRoundId,
      JSON.stringify({
        count: advancedTeams.length,
        team_ids: advancedTeams,
        tournament_id: tournamentId,
        source_round_id: sourceRoundId,
        target_group_id: targetGroupId,
        manual_placement: manual_placement ? true : false,
      }),
    ]);
  } catch {
    // Non-blocking log
  }

  return {
    success: true,
    advancedCount: advancedTeams.length,
    advancedTeamIds: advancedTeams,
    sourceRoundId,
    targetRoundId,
    team_progression: derivedProgression,
    message: `Successfully advanced ${advancedTeams.length} team(s) to ${targetRound.name}.`,
  };
}
