import { ALLOCATION_SOURCES, randomId } from './allocationService.js';
import { sortAndRank } from './leaderboardService.js';

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

export function resolveQualificationCutoff(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function selectQualifiedTeams(standings = [], cutoff = 0) {
  const n = parseInt(cutoff, 10);
  if (!Number.isFinite(n) || n <= 0 || !Array.isArray(standings)) return [];
  const valid = standings.filter((s) => s && s.team_id != null);
  const sorted = valid.slice().sort((a, b) => (a.rank || 0) - (b.rank || 0));
  return sorted.slice(0, n);
}

export function nextRoundNumberOf(rounds = [], currentRoundNumber = 1) {
  const current = parseInt(currentRoundNumber, 10);
  if (!Number.isFinite(current) || !Array.isArray(rounds)) return null;
  const greater = rounds
    .map((r) => parseInt(r.round_number ?? r.roundNumber, 10))
    .filter((n) => Number.isFinite(n) && n > current)
    .sort((a, b) => a - b);
  return greater.length > 0 ? greater[0] : null;
}

export async function getMatchStandings(client, tournamentId, matchId) {
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
     JOIN tournament_teams t ON t.id = tm.team_id
     LEFT JOIN users u ON u.id = t.leader_user_id
     WHERE tm.match_id = $1 AND tm.tournament_id = $2 AND tm.status = 'verified'
     GROUP BY tm.team_id`,
    [matchId, tournamentId]
  );
  return sortAndRank(res.rows);
}

export async function getRoundStandings(client, tournamentId, roundId) {
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
  return sortAndRank(res.rows);
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

    for (const team of allQualifiers) {
      for (const targetMatchId of targetMatchIds) {
        const allocId = randomId('ASN-');
        await client.query(
          `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, status, source)
             VALUES ($1, $2, $3, $4, 'allocated', $5)
             ON CONFLICT (tournament_team_id, match_id) DO NOTHING`,
          [allocId, tournamentId, team.team_id, targetMatchId, ALLOCATION_SOURCES.ADVANCEMENT]
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

export async function getDetailedRoundStandings(client, tournamentId, roundId) {
  if (!client || !tournamentId || !roundId) {
    throw progressionError(PROGRESSION_ERR.INVALID_INPUT, 'Valid client, tournamentId, and roundId are required.');
  }

  // 1. Get round info
  const roundRes = await client.query(
    'SELECT id, round_number, name, status, teams_advancing, advancement_type, teams_advancing_per_district, teams_advancing_per_match FROM tournament_rounds WHERE id = $1',
    [roundId]
  );
  const round = roundRes.rows[0] || null;

  // 2. Fetch matches in this round to identify groups/districts
  const matchRes = await client.query(
    `SELECT m.id, m.match_number, m.group_id, m.day_id, g.group_name, g.id AS district_id, g.sequence
     FROM tournament_matches m
     LEFT JOIN tournament_groups g ON g.id = m.group_id
     WHERE m.round_id = $1 AND m.tournament_id = $2
     ORDER BY m.match_number ASC`,
    [roundId, tournamentId]
  );
  const matches = matchRes.rows;
  const matchIds = matches.map((m) => m.id);

  // 3. Fetch match results if any exist
  let resultsRows = [];
  if (matchIds.length > 0) {
    const resRes = await client.query(
      `SELECT
         tm.match_id,
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
       GROUP BY tm.match_id, tm.team_id`,
      [roundId, tournamentId]
    );
    resultsRows = resRes.rows;
  }

  // 4. Fetch assignments for this round
  let roundAssignments = [];
  if (matchIds.length > 0) {
    const assignRes = await client.query(
      `SELECT a.tournament_team_id, a.match_id, a.group_id, t.team_name, u.name as leader_name, g.group_name, g.id AS district_id
       FROM tournament_match_assignments a
       JOIN tournament_matches m ON m.id = a.match_id
       LEFT JOIN tournament_groups g ON g.id = a.group_id OR g.id = m.group_id
       LEFT JOIN tournament_teams t ON t.id = a.tournament_team_id
       LEFT JOIN users u ON u.id = t.leader_user_id
       WHERE m.round_id = $1 AND a.tournament_id = $2`,
      [roundId, tournamentId]
    );
    roundAssignments = assignRes.rows;
  }

  // 5. Fetch verified registrations for tournament
  const VERIFIED_STATUSES = ['approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host'];
  const regsRes = await client.query(
    `SELECT r.id as registration_id, r.team_name, r.captain as leader_name, r.slot_number, r.group_id, r.group_name,
            t.id as team_id
     FROM tournament_registrations r
     LEFT JOIN tournament_teams t ON (t.registration_id = r.id OR (t.tournament_id = r.tournament_id AND LOWER(t.team_name) = LOWER(r.team_name)))
     WHERE r.tournament_id = $1 AND r.status = ANY($2::text[])
     ORDER BY r.slot_number ASC NULLS LAST, r.created_at ASC`,
    [tournamentId, VERIFIED_STATUSES]
  );
  const registrations = regsRes.rows;

  // 6. Check which teams are already advanced to ANY subsequent round
  const advancedTeamSet = new Set();
  const nextRes = await client.query(
    'SELECT id, round_number FROM tournament_rounds WHERE tournament_id = $1 AND round_number > $2 ORDER BY round_number ASC LIMIT 1',
    [tournamentId, round?.round_number || 1]
  );
  if (nextRes.rows.length > 0) {
    const nextRoundId = nextRes.rows[0].id;
    const nextAssign = await client.query(
      `SELECT DISTINCT a.tournament_team_id
       FROM tournament_match_assignments a
       JOIN tournament_matches m ON m.id = a.match_id
       WHERE a.tournament_id = $1 AND m.round_id = $2`,
      [tournamentId, nextRoundId]
    );
    for (const row of nextAssign.rows) advancedTeamSet.add(row.tournament_team_id);
  }

  // 7. Aggregate stats per team
  const teamStatsMap = new Map();
  for (const reg of registrations) {
    const key = reg.team_id || reg.registration_id;
    teamStatsMap.set(key, {
      team_id: reg.team_id || reg.registration_id,
      registration_id: reg.registration_id,
      team_name: reg.team_name,
      leader_name: reg.leader_name || 'Captain',
      slot_number: reg.slot_number,
      group_id: reg.group_id || null,
      district_name: reg.group_name || null,
      total_kills: 0,
      total_kill_points: 0,
      total_placement_points: 0,
      total_points: 0,
      wwcd_count: 0,
      best_placement: null,
      matches_played: 0,
      has_results: false,
    });
  }

  for (const asgn of roundAssignments) {
    const key = asgn.tournament_team_id;
    if (key && teamStatsMap.has(key)) {
      const existing = teamStatsMap.get(key);
      if (!existing.district_name && asgn.group_name) existing.district_name = asgn.group_name;
      if (!existing.group_id && asgn.group_id) existing.group_id = asgn.group_id;
    } else if (key) {
      teamStatsMap.set(key, {
        team_id: key,
        registration_id: null,
        team_name: asgn.team_name || `Team ${key.slice(-4)}`,
        leader_name: asgn.leader_name || 'Captain',
        slot_number: null,
        group_id: asgn.group_id || null,
        district_name: asgn.group_name || null,
        total_kills: 0,
        total_kill_points: 0,
        total_placement_points: 0,
        total_points: 0,
        wwcd_count: 0,
        best_placement: null,
        matches_played: 0,
        has_results: false,
      });
    }
  }

  for (const res of resultsRows) {
    const key = res.team_id;
    let entry = teamStatsMap.get(key);
    if (!entry) {
      entry = {
        team_id: key,
        registration_id: null,
        team_name: res.team_name || `Team ${key.slice(-4)}`,
        leader_name: res.leader_name || 'Captain',
        slot_number: null,
        group_id: null,
        district_name: null,
        total_kills: 0,
        total_kill_points: 0,
        total_placement_points: 0,
        total_points: 0,
        wwcd_count: 0,
        best_placement: null,
        matches_played: 0,
        has_results: false,
      };
      teamStatsMap.set(key, entry);
    }
    entry.total_kills += Number(res.total_kills) || 0;
    entry.total_kill_points += Number(res.total_kill_points) || 0;
    entry.total_placement_points += Number(res.total_placement_points) || 0;
    entry.total_points += Number(res.total_points) || 0;
    entry.wwcd_count += Number(res.wwcd_count) || 0;
    if (res.best_placement != null) {
      entry.best_placement =
        entry.best_placement == null ? Number(res.best_placement) : Math.min(entry.best_placement, Number(res.best_placement));
    }
    entry.matches_played += 1;
    entry.has_results = true;
  }

  const allTeams = Array.from(teamStatsMap.values());
  const teamComparator = (a, b) => {
    if (b.total_points !== a.total_points) return b.total_points - a.total_points;
    if (b.wwcd_count !== a.wwcd_count) return b.wwcd_count - a.wwcd_count;
    if (b.total_placement_points !== a.total_placement_points) return b.total_placement_points - a.total_placement_points;
    if (b.total_kills !== a.total_kills) return b.total_kills - a.total_kills;
    return (a.slot_number || 9999) - (b.slot_number || 9999);
  };

  allTeams.sort(teamComparator);
  allTeams.forEach((t, idx) => {
    t.rank = idx + 1;
    t.advanced = advancedTeamSet.has(t.team_id);
  });

  // Fetch districts from tournament_registration_groups
  const districtRows = await client.query(
    'SELECT id, name, group_index, capacity FROM tournament_registration_groups WHERE tournament_id = $1 ORDER BY group_index ASC',
    [tournamentId]
  );

  const districtMap = new Map();
  for (const d of districtRows.rows) {
    districtMap.set(d.id, {
      id: d.id,
      name: d.name,
      group_index: d.group_index,
      capacity: d.capacity || 16,
      teams: [],
    });
  }

  const unassignedTeams = [];
  for (const t of allTeams) {
    let matchedDist = null;
    if (t.group_id && districtMap.has(t.group_id)) {
      matchedDist = districtMap.get(t.group_id);
    } else if (t.district_name) {
      for (const d of districtMap.values()) {
        if (d.name.toLowerCase() === t.district_name.toLowerCase()) {
          matchedDist = d;
          break;
        }
      }
    }
    if (matchedDist) {
      t.district_id = matchedDist.id;
      t.district_name = matchedDist.name;
      matchedDist.teams.push(t);
    } else {
      unassignedTeams.push(t);
    }
  }

  if (unassignedTeams.length > 0 && districtMap.size > 0) {
    const distList = Array.from(districtMap.values());
    unassignedTeams.forEach((t, i) => {
      const targetDist = distList[i % distList.length];
      t.district_id = targetDist.id;
      t.district_name = targetDist.name;
      targetDist.teams.push(t);
    });
  }

  const districts = Array.from(districtMap.values()).map((d) => {
    d.teams.sort(teamComparator);
    d.teams.forEach((t, i) => {
      t.district_rank = i + 1;
    });
    return d;
  });

  return {
    round,
    overallStandings: allTeams,
    districts,
    totalTeams: allTeams.length,
    advancedCount: allTeams.filter((t) => t.advanced).length,
  };
}

/**
 * Hardened Team Advancement Engine (Phase 4A)
 *
 * Enforces:
 * - Row locks (SELECT FOR UPDATE on tournament and target round) preventing double-click duplicate advancement
 * - Source and target rounds belonging to this tournament; target round must be subsequent
 * - Every advanced team must have participated in the source round
 * - Rejection of duplicate team IDs
 * - Rejection of disqualified teams
 * - Source matches verified results check (unless explicit allow_unverified is sent)
 * - Safe re-run replacement of earlier advancement rows in target round (refused if target round has recorded results)
 * - Placement default: snake seeding by points across target round's districts, with optional manual placement map override
 * - Source round marked completed after advancing
 * - Derivation of Qualified / Eliminated / Disqualified progression status per team
 */
/**
 * Computes deterministic snake seeding distribution of ordered teams across target districts.
 * Single source of truth for round advancement district placement.
 *
 * @param {string[]} orderedTeamIds - Team IDs ordered by seed (e.g. source round points desc)
 * @param {Array<{ id: string }>} targetGroups - Target groups/districts ordered by sequence
 * @returns {Object.<string, string>} Map of team_id -> target_group_id
 */
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

  // 4. Source round validation (if provided)
  let sourceRound = null;
  if (sourceRoundId) {
    const sRes = await client.query(
      'SELECT id, tournament_id, round_number, name, status FROM tournament_rounds WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
      [sourceRoundId, tournamentId]
    );
    if (sRes.rows.length === 0) {
      throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'Source round not found or does not belong to this tournament.');
    }
    sourceRound = sRes.rows[0];

    if (Number(targetRound.round_number) <= Number(sourceRound.round_number)) {
      throw progressionError(PROGRESSION_ERR.INVALID_INPUT, 'Target round must follow source round in round sequence.');
    }

    // 4a. Every team must have played the source round
    const playedRes = await client.query(`
      SELECT DISTINCT tournament_team_id AS team_id
      FROM tournament_match_assignments
      WHERE tournament_id = $1
        AND match_id IN (SELECT id FROM tournament_matches WHERE round_id = $2 AND tournament_id = $1)
      UNION
      SELECT DISTINCT mr.team_id
      FROM tournament_match_results mr
      JOIN tournament_matches m ON mr.match_id = m.id
      WHERE m.round_id = $2 AND m.tournament_id = $1
    `, [tournamentId, sourceRoundId]);

    const playedTeamSet = new Set(playedRes.rows.map((r) => r.team_id));
    for (const tId of uniqueTeamIds) {
      if (!playedTeamSet.has(tId)) {
        throw progressionError(
          PROGRESSION_ERR.TEAM_DID_NOT_PLAY_SOURCE_ROUND,
          `Team "${tId}" did not play in source round "${sourceRound.name || sourceRound.round_number}" and cannot be advanced.`
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
  const dqCheck = await client.query(
    'SELECT id, team_name, status FROM tournament_teams WHERE id = ANY($1::text[]) AND tournament_id = $2',
    [uniqueTeamIds, tournamentId]
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
    'SELECT id, group_name, sequence FROM tournament_groups WHERE round_id = $1 AND tournament_id = $2 ORDER BY COALESCE(display_order, sequence, 0) ASC, sequence ASC, id ASC',
    [targetRoundId, tournamentId]
  );
  const targetGroups = targetGroupsRes.rows;

  // 9. Order advancing teams by source round points descending for snake seeding
  let orderedTeamIds = [...uniqueTeamIds];
  if (sourceRoundId) {
    try {
      const standings = await getRoundStandings(client, tournamentId, sourceRoundId);
      if (Array.isArray(standings) && standings.length > 0) {
        const pointsMap = new Map(standings.map((t) => [t.team_id, Number(t.total_points) || 0]));
        orderedTeamIds.sort((a, b) => (pointsMap.get(b) || 0) - (pointsMap.get(a) || 0));
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

  for (let i = 0; i < orderedTeamIds.length; i++) {
    const teamId = orderedTeamIds[i];
    let assignedGroupId = null;

    if (manualPlacementMap.has(teamId)) {
      assignedGroupId = manualPlacementMap.get(teamId);
    } else {
      assignedGroupId = defaultPlacementMap[teamId] || null;
    }

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
          (id, tournament_id, tournament_team_id, match_id, group_id, day_id, status, source)
        VALUES ($1, $2, $3, $4, $5, $6, 'allocated', $7)
        ON CONFLICT (tournament_team_id, match_id) DO UPDATE SET
          status = 'allocated',
          source = EXCLUDED.source,
          group_id = COALESCE(EXCLUDED.group_id, tournament_match_assignments.group_id),
          day_id = COALESCE(EXCLUDED.day_id, tournament_match_assignments.day_id)
      `, [
        allocId,
        tournamentId,
        teamId,
        match.id,
        match.group_id || assignedGroupId || null,
        match.day_id || null,
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

/**
 * Organizer Summary for Round Advancement (Phase 4A)
 *
 * Returns for a source round:
 * - Standings with ranks, points, kills, matches played
 * - Per-district rankings
 * - Planned qualification rule from the roadmap
 * - Suggested advancing teams based on roadmap rule
 * - Disqualified team flags
 * - Whether results are complete (and unverified match details)
 * - Target round and district structure
 */
export async function getRoundAdvancementSummary(client, tournamentId, sourceRoundId) {
  // 1. Fetch source round
  const sRes = await client.query(
    'SELECT id, round_number, name, status, teams_advancing, advancement_type, teams_advancing_per_district, teams_advancing_per_match FROM tournament_rounds WHERE id = $1 AND tournament_id = $2',
    [sourceRoundId, tournamentId]
  );
  if (sRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'Source round not found.');
  }
  const sourceRound = sRes.rows[0];

  // 2. Fetch target round (next round in sequence)
  const nextRes = await client.query(
    'SELECT id, round_number, name, status FROM tournament_rounds WHERE tournament_id = $1 AND round_number > $2 ORDER BY round_number ASC LIMIT 1',
    [tournamentId, sourceRound.round_number]
  );
  const targetRound = nextRes.rows.length > 0 ? nextRes.rows[0] : null;

  let targetDistricts = [];
  if (targetRound) {
    const tgRes = await client.query(
      'SELECT id, group_name, sequence FROM tournament_groups WHERE round_id = $1 AND tournament_id = $2 ORDER BY sequence ASC',
      [targetRound.id, tournamentId]
    );
    targetDistricts = tgRes.rows;
  }

  // 3. Source round matches & verified results status
  const mRes = await client.query(`
    SELECT m.id, m.match_number, m.status, m.group_id, m.group_name, COUNT(mr.id)::int AS result_count
    FROM tournament_matches m
    LEFT JOIN tournament_match_results mr ON mr.match_id = m.id
    WHERE m.round_id = $1 AND m.tournament_id = $2
    GROUP BY m.id, m.match_number, m.status, m.group_id, m.group_name
    ORDER BY m.match_number ASC
  `, [sourceRoundId, tournamentId]);

  const sourceMatches = mRes.rows;
  const unverifiedMatches = sourceMatches.filter(
    (m) => Number(m.result_count) === 0 && m.status !== 'COMPLETED'
  );
  const resultsComplete = sourceMatches.length > 0 && unverifiedMatches.length === 0;

  // 4. Standings & per-district ranks
  const detailed = await getDetailedRoundStandings(client, tournamentId, sourceRoundId);

  // 5. Disqualified teams
  const dqRes = await client.query(
    `SELECT id, team_name, status FROM tournament_teams WHERE tournament_id = $1 AND status = 'disqualified'`,
    [tournamentId]
  );
  const dqSet = new Set(dqRes.rows.map((t) => t.id));

  // Attach is_disqualified flag
  for (const t of detailed.overallStandings) {
    t.is_disqualified = dqSet.has(t.team_id);
  }
  for (const d of detailed.districts) {
    for (const t of d.teams) {
      t.is_disqualified = dqSet.has(t.team_id);
    }
  }

  // 6. Planned rule & suggested advancing teams
  const plannedRule = {
    advancement_type: sourceRound.advancement_type || 'per_district',
    teams_advancing_per_district: sourceRound.teams_advancing_per_district != null ? Number(sourceRound.teams_advancing_per_district) : null,
    teams_advancing: sourceRound.teams_advancing != null ? Number(sourceRound.teams_advancing) : null,
    teams_advancing_per_match: sourceRound.teams_advancing_per_match != null ? Number(sourceRound.teams_advancing_per_match) : null,
  };

  const suggestedTeamIds = [];
  if (plannedRule.advancement_type === 'per_district') {
    const topPerDist = plannedRule.teams_advancing_per_district || 2;
    for (const d of detailed.districts) {
      const eligible = d.teams.filter((t) => !t.is_disqualified);
      for (let i = 0; i < Math.min(topPerDist, eligible.length); i++) {
        suggestedTeamIds.push(eligible[i].team_id);
      }
    }
  } else {
    const topOverall = plannedRule.teams_advancing || 16;
    const eligible = detailed.overallStandings.filter((t) => !t.is_disqualified);
    for (let i = 0; i < Math.min(topOverall, eligible.length); i++) {
      suggestedTeamIds.push(eligible[i].team_id);
    }
  }

  // 7. Check if target round has recorded match results
  let targetHasResults = false;
  if (targetRound) {
    const trRes = await client.query(
      `SELECT 1 FROM tournament_match_results mr JOIN tournament_matches m ON mr.match_id = m.id WHERE m.round_id = $1 AND m.tournament_id = $2 LIMIT 1`,
      [targetRound.id, tournamentId]
    );
    targetHasResults = trRes.rows.length > 0;
  }

  return {
    success: true,
    source_round: {
      id: sourceRound.id,
      round_number: sourceRound.round_number,
      name: sourceRound.name,
      status: sourceRound.status,
    },
    target_round: targetRound ? {
      id: targetRound.id,
      round_number: targetRound.round_number,
      name: targetRound.name,
      status: targetRound.status,
      districts: targetDistricts,
      has_results: targetHasResults,
    } : null,
    target_has_results: targetHasResults,
    standings: detailed.overallStandings,
    districts: detailed.districts,
    total_teams: detailed.totalTeams,
    planned_rule: plannedRule,
    suggested_advancing_team_ids: suggestedTeamIds,
    disqualified_team_ids: Array.from(dqSet),
    results_complete: resultsComplete,
    unverified_match_ids: unverifiedMatches.map((m) => m.id),
    unverified_matches: unverifiedMatches.map((m) => ({
      id: m.id,
      match_id: m.id,
      match_number: m.match_number,
      group_name: m.group_name || `District ${m.match_number}`,
      status: m.status,
    })),
  };
}

export async function qualifyRound(client, { tournamentId, roundNumber, actorId = null, options = {} } = {}) {
  const rNum = parseInt(roundNumber, 10);
  if (!client || !Number.isFinite(rNum)) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'Valid round number and client are required.');
  }
  if (!tournamentId) {
    throw progressionError(PROGRESSION_ERR.INVALID_INPUT, 'Tournament ID is required.');
  }

  const tournRes = await client.query('SELECT id, roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
  if (tournRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_FINALIZED, 'Tournament is finalized; progression is locked.');
  }
  if (tournRes.rows[0].roadmap_status !== 'approved' && tournRes.rows[0].roadmap_status !== 'published') {
    throw progressionError(PROGRESSION_ERR.ROADMAP_NOT_APPROVED, 'The roadmap must be approved or published before qualifying teams.');
  }

  const roundRes = await client.query(
    'SELECT id, round_number, name, status, teams_advancing, advancement_type, teams_advancing_per_district, teams_advancing_per_match FROM tournament_rounds WHERE tournament_id = $1 AND round_number = $2 FOR UPDATE',
    [tournamentId, roundNumber]
  );
  if (roundRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, `Round ${roundNumber} does not exist.`);
  }
  const round = roundRes.rows[0];

  const nextRes = await client.query(
    'SELECT id, round_number, name FROM tournament_rounds WHERE tournament_id = $1 AND round_number > $2 ORDER BY round_number ASC LIMIT 1',
    [tournamentId, roundNumber]
  );
  if (nextRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.NO_NEXT_ROUND, 'No subsequent round exists to advance teams into.');
  }
  const nextRound = nextRes.rows[0];

  if (Array.isArray(options.selected_team_ids) && options.selected_team_ids.length > 0) {
    return await advanceTeamsManually(client, {
      tournamentId,
      sourceRoundId: round.id,
      targetRoundId: options.target_round_id || nextRound.id,
      targetGroupId: options.target_group_id || null,
      teamIds: options.selected_team_ids,
      actorId,
    });
  }

  const advType = options.advancement_type || round.advancement_type || 'per_district';
  const standingsData = await getDetailedRoundStandings(client, tournamentId, round.id);
  const selectedTeamIds = [];

  if (advType === 'per_district') {
    const perDistCutoff = options.teams_advancing_per_district || round.teams_advancing_per_district || 2;
    for (const dist of standingsData.districts) {
      const topInDist = dist.teams.slice(0, perDistCutoff);
      for (const t of topInDist) {
        if (t.team_id) selectedTeamIds.push(t.team_id);
      }
    }
  } else {
    const overallCutoff = options.teams_advancing || round.teams_advancing || 16;
    for (const t of standingsData.overallStandings.slice(0, overallCutoff)) {
      if (t.team_id) selectedTeamIds.push(t.team_id);
    }
  }

  if (selectedTeamIds.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NO_RESULTS, 'No teams qualified to advance.');
  }

  const advResult = await advanceTeamsManually(client, {
    tournamentId,
    sourceRoundId: round.id,
    targetRoundId: nextRound.id,
    targetGroupId: options.target_group_id || null,
    teamIds: selectedTeamIds,
    actorId,
  });

  await client.query("UPDATE tournament_rounds SET status = 'completed' WHERE id = $1", [round.id]);

  return {
    ...advResult,
    advancement_type: advType,
    nextRoundNumber: nextRound.round_number,
    nextRoundName: nextRound.name,
  };
}
