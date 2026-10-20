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
    `SELECT m.id, m.match_number, m.group_id, m.day_id, g.group_name, g.district_id, g.sequence
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
      `SELECT a.tournament_team_id, a.match_id, a.group_id, t.team_name, u.name as leader_name, g.group_name, g.district_id
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

export async function advanceTeamsManually(client, {
  tournamentId,
  sourceRoundId = null,
  targetRoundId,
  targetGroupId = null,
  teamIds = [],
  actorId = null,
}) {
  if (!client || !tournamentId || !targetRoundId || !Array.isArray(teamIds) || teamIds.length === 0) {
    throw progressionError(PROGRESSION_ERR.INVALID_INPUT, 'Valid tournamentId, targetRoundId, and teamIds array required.');
  }

  const tournRes = await client.query('SELECT id, roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE', [tournamentId]);
  if (tournRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    throw progressionError(PROGRESSION_ERR.TOURNAMENT_FINALIZED, 'Tournament is finalized; advancement is locked.');
  }

  const targetRoundRes = await client.query(
    'SELECT id, round_number, name FROM tournament_rounds WHERE id = $1 AND tournament_id = $2',
    [targetRoundId, tournamentId]
  );
  if (targetRoundRes.rows.length === 0) {
    throw progressionError(PROGRESSION_ERR.ROUND_NOT_FOUND, 'Target round not found.');
  }

  let matchQuery = 'SELECT id, round_id, group_id, day_id FROM tournament_matches WHERE round_id = $1 AND tournament_id = $2';
  const matchParams = [targetRoundId, tournamentId];
  if (targetGroupId) {
    matchQuery += ' AND group_id = $3';
    matchParams.push(targetGroupId);
  }
  let targetMatchesRes = await client.query(matchQuery, matchParams);
  if (targetMatchesRes.rows.length === 0 && targetGroupId) {
    targetMatchesRes = await client.query(
      'SELECT id, round_id, group_id, day_id FROM tournament_matches WHERE round_id = $1 AND tournament_id = $2',
      [targetRoundId, tournamentId]
    );
  }

  const targetMatches = targetMatchesRes.rows;
  if (targetMatches.length === 0) {
    throw progressionError(PROGRESSION_ERR.MATCH_NOT_FOUND, 'No matches configured in target round to advance teams into. Please add match days & district allocations in the target round first.');
  }

  const advancedTeams = [];
  for (const rawTeamId of teamIds) {
    let teamId = rawTeamId;

    const teamCheck = await client.query('SELECT id, team_name FROM tournament_teams WHERE id = $1 AND tournament_id = $2', [teamId, tournamentId]);
    if (teamCheck.rows.length === 0) {
      const regCheck = await client.query('SELECT id, team_name, captain, user_id FROM tournament_registrations WHERE id = $1 AND tournament_id = $2', [teamId, tournamentId]);
      if (regCheck.rows.length > 0) {
        const reg = regCheck.rows[0];
        const linkedTeam = await client.query('SELECT id FROM tournament_teams WHERE registration_id = $1 AND tournament_id = $2', [reg.id, tournamentId]);
        if (linkedTeam.rows.length > 0) {
          teamId = linkedTeam.rows[0].id;
        } else {
          const newTeamId = `tt_${randomId('')}`;
          const leaderId = reg.user_id || actorId || 'sys_leader';
          await client.query(
            `INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status, registration_id)
             VALUES ($1, $2, $3, $4, 'verified', $5)
             ON CONFLICT (tournament_id, team_name) DO UPDATE SET registration_id = EXCLUDED.registration_id`,
            [newTeamId, tournamentId, reg.team_name, leaderId, reg.id]
          );
          const fresh = await client.query('SELECT id FROM tournament_teams WHERE tournament_id = $1 AND team_name = $2', [tournamentId, reg.team_name]);
          if (fresh.rows.length > 0) teamId = fresh.rows[0].id;
        }
      }
    }

    for (const match of targetMatches) {
      const allocId = randomId('ASN-');
      await client.query(
        `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, group_id, day_id, status, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'allocated', $7)
         ON CONFLICT (tournament_team_id, match_id) DO UPDATE SET
           status = 'allocated',
           source = EXCLUDED.source,
           group_id = COALESCE(EXCLUDED.group_id, tournament_match_assignments.group_id),
           day_id = COALESCE(EXCLUDED.day_id, tournament_match_assignments.day_id)`,
        [allocId, tournamentId, teamId, match.id, match.group_id || targetGroupId || null, match.day_id || null, ALLOCATION_SOURCES.ADVANCEMENT]
      );
    }

    advancedTeams.push(teamId);
  }

  try {
    const logId = randomId('LOG-');
    await client.query(
      `INSERT INTO admin_action_log (id, tournament_id, admin_id, action, action_type, target_type, target_id, details)
       VALUES ($1, $2, $3, 'teams_advanced', 'progression', 'tournament_round', $4, $5)`,
      [logId, tournamentId, actorId, targetRoundId, JSON.stringify({ count: advancedTeams.length, team_ids: advancedTeams, source_round_id: sourceRoundId, target_group_id: targetGroupId })]
    );
  } catch {
    // Non-blocking log
  }

  return {
    success: true,
    advancedCount: advancedTeams.length,
    advancedTeamIds: advancedTeams,
    targetRoundId,
    targetGroupId,
    message: `Successfully advanced ${advancedTeams.length} team(s) to ${targetRoundRes.rows[0].name}.`,
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
