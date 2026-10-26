// ─────────────────────────────────────────────────────────────
// Leaderboard ranking engine for Match District.
//
// Single authoritative source of truth for tournament standings.
// ─────────────────────────────────────────────────────────────

export const LEADERBOARD_MAX_SCORE = 1000000;

export function validateScore(value, label = 'Score') {
  if (value === '' || value === null || value === undefined) {
    return { valid: false, error: `${label} is required.` };
  }
  const num = Number(value);
  if (!Number.isInteger(num)) {
    return { valid: false, error: `${label} must be a whole number.` };
  }
  if (num < 0) {
    return { valid: false, error: `${label} cannot be negative.` };
  }
  if (num > LEADERBOARD_MAX_SCORE) {
    return { valid: false, error: `${label} cannot exceed ${LEADERBOARD_MAX_SCORE.toLocaleString('en-IN')}.` };
  }
  return { valid: true, value: num };
}

/**
 * Calculates match points for a single team's result based on scoring rules.
 */
export function calculateMatchPoints(kills, placement, scoringRules = {}) {
  const kill_points = kills * (scoringRules.kill_points_multiplier || 1);
  
  let placement_points = 0;
  if (scoringRules.placement_points_map && scoringRules.placement_points_map[String(placement)]) {
    placement_points = Number(scoringRules.placement_points_map[String(placement)]);
  }

  const wwcd = placement === 1;
  const wwcd_bonus = wwcd ? (scoringRules.wwcd_bonus || 0) : 0;

  const total_points = kill_points + placement_points + wwcd_bonus;

  return { kill_points, placement_points, wwcd, total_points };
}

/**
 * Aggregates all 'verified' results for a team in a tournament and updates the tournament_leaderboard table.
 */
export async function updateTeamLeaderboard(pool, tournamentId, teamId) {
  // Aggregate verified results
  const aggResult = await pool.query(
    `SELECT 
       COUNT(*) as matches_played,
       COALESCE(SUM(kills), 0) as total_kills,
       COALESCE(SUM(kill_points), 0) as total_kill_points,
       COALESCE(SUM(placement_points), 0) as total_placement_points,
       COALESCE(SUM(total_points), 0) as total_points,
       COUNT(CASE WHEN wwcd = true THEN 1 END) as wwcd_count,
       MIN(placement) as best_placement
     FROM tournament_match_results
     WHERE tournament_id = $1 AND team_id = $2 AND status = 'verified'`,
    [tournamentId, teamId]
  );

  const agg = aggResult.rows[0];

  // Upsert leaderboard
  await pool.query(
    `INSERT INTO tournament_leaderboard (
       id, tournament_id, team_id, matches_played, total_kills, 
       total_kill_points, total_placement_points, total_points, 
       wwcd_count, best_placement, updated_at
     ) VALUES (
       gen_random_uuid()::varchar, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
     ) ON CONFLICT (tournament_id, team_id) DO UPDATE SET
       matches_played = EXCLUDED.matches_played,
       total_kills = EXCLUDED.total_kills,
       total_kill_points = EXCLUDED.total_kill_points,
       total_placement_points = EXCLUDED.total_placement_points,
       total_points = EXCLUDED.total_points,
       wwcd_count = EXCLUDED.wwcd_count,
       best_placement = EXCLUDED.best_placement,
       updated_at = NOW()`,
    [
      tournamentId, teamId, 
      agg.matches_played, agg.total_kills, 
      agg.total_kill_points, agg.total_placement_points, 
      agg.total_points, agg.wwcd_count, agg.best_placement
    ]
  );
}

export const TIE_BREAK_RULES_DESCRIPTION =
  '1. Total WWCDs | 2. Total placement points | 3. Total elimination points | 4. Best placement in most recent match';

/**
 * Strict tie-break comparison between two teams for equal total points:
 *   1. Total WWCDs (1st place finishes), higher wins
 *   2. Total placement points, higher wins
 *   3. Total elimination (kill) points, higher wins
 *   4. Best placement in the most recent match, higher wins (1st beats 2nd; lower placement number wins; no-result loses)
 *
 * Returns:
 *   negative if team a ranks higher than team b
 *   positive if team b ranks higher than team a
 *   0 if ALL four criteria are equal (true tie)
 */
export function compareTeams(a, b) {
  // Primary: Total points (higher wins -> descending)
  const aPts = Number(a?.total_points ?? a?.points) || 0;
  const bPts = Number(b?.total_points ?? b?.points) || 0;
  if (bPts !== aPts) return bPts - aPts;

  // Criterion 1: Total WWCDs (1st place finishes), higher wins
  const aWwcd = Number(a?.wwcd_count ?? a?.wwcd) || 0;
  const bWwcd = Number(b?.wwcd_count ?? b?.wwcd) || 0;
  if (bWwcd !== aWwcd) return bWwcd - aWwcd;

  // Criterion 2: Total placement points, higher wins
  const aPlacePts = Number(a?.total_placement_points ?? a?.placement_points) || 0;
  const bPlacePts = Number(b?.total_placement_points ?? b?.placement_points) || 0;
  if (bPlacePts !== aPlacePts) return bPlacePts - aPlacePts;

  // Criterion 3: Total elimination (kill) points, higher wins
  const aKillPts = Number(a?.total_kill_points ?? a?.kill_points ?? a?.total_kills ?? a?.kills) || 0;
  const bKillPts = Number(b?.total_kill_points ?? b?.kill_points ?? b?.total_kills ?? b?.kills) || 0;
  if (bKillPts !== aKillPts) return bKillPts - aKillPts;

  // Criterion 4: Best placement in the most recent match (1st beats 2nd; no-result loses)
  const aHasPlacement =
    a?.last_match_placement != null &&
    Number.isFinite(Number(a.last_match_placement)) &&
    Number(a.last_match_placement) > 0;
  const bHasPlacement =
    b?.last_match_placement != null &&
    Number.isFinite(Number(b.last_match_placement)) &&
    Number(b.last_match_placement) > 0;

  if (aHasPlacement && bHasPlacement) {
    const aPlacement = Number(a.last_match_placement);
    const bPlacement = Number(b.last_match_placement);
    if (aPlacement !== bPlacement) return aPlacement - bPlacement;
  } else if (aHasPlacement && !bHasPlacement) {
    return -1; // a wins because a played/placed in most recent match
  } else if (!aHasPlacement && bHasPlacement) {
    return 1; // b wins because b played/placed in most recent match
  }

  // All 4 criteria are equal: true tie
  return 0;
}

/**
 * Deterministic ranking order enforcing strict tie-break rules:
 *   1. Total points (higher wins)
 *   2. Total WWCDs (1st place finishes, higher wins)
 *   3. Total placement points, higher wins
 *   4. Total elimination (kill) points, higher wins
 *   5. Best placement in the most recent match, higher wins (1st beats 2nd)
 *   6. Fallback for display stability: slot_number (asc) then team_id (asc)
 *
 * Annotates each row with:
 *   rank: 1-indexed rank
 *   tie_broken: boolean indicating if row needed tie-break (shares total points with another row)
 *   is_true_tie: boolean indicating all 4 criteria are equal to another row
 */
export function sortAndRank(rows = []) {
  if (!Array.isArray(rows)) return [];

  const sorted = [...rows].sort((a, b) => {
    const cmp = compareTeams(a, b);
    if (cmp !== 0) return cmp;

    // Display fallback when all 4 criteria are tied
    const aSlot = a?.slot_number != null ? Number(a.slot_number) : 99999;
    const bSlot = b?.slot_number != null ? Number(b.slot_number) : 99999;
    if (aSlot !== bSlot) return aSlot - bSlot;

    const aId = String(a?.team_id || a?.id || '');
    const bId = String(b?.team_id || b?.id || '');
    return aId.localeCompare(bId);
  });

  // Track frequency of points to mark rows that required tie-breaking
  const pointsCount = new Map();
  for (const r of sorted) {
    const pts = Number(r?.total_points ?? r?.points) || 0;
    pointsCount.set(pts, (pointsCount.get(pts) || 0) + 1);
  }

  return sorted.map((row, idx) => {
    const pts = Number(row?.total_points ?? row?.points) || 0;
    const tieNeeded = (pointsCount.get(pts) || 0) > 1;
    const isTrueTie = sorted.some((other, oIdx) => oIdx !== idx && compareTeams(row, other) === 0);

    return {
      ...row,
      rank: idx + 1,
      tie_broken: tieNeeded,
      is_true_tie: isTrueTie,
    };
  });
}

/**
 * Fetch every scored team for a tournament and return ranked standings.
 * Identifies the most recent match of the tournament to supply last_match_placement.
 */
export async function calculateRankings(pool, tournamentId) {
  let placementMap = new Map();
  try {
    const lastMatchRes = await pool.query(
      `SELECT m.id
       FROM tournament_matches m
       JOIN tournament_match_results mr ON mr.match_id = m.id AND mr.status = 'verified'
       LEFT JOIN tournament_rounds rnd ON rnd.id = m.round_id
       LEFT JOIN tournament_days d ON d.id = m.day_id
       WHERE m.tournament_id = $1
       GROUP BY m.id, rnd.round_number, d.day_number, m.match_number
       ORDER BY COALESCE(rnd.round_number, 1) DESC, COALESCE(d.day_number, 1) DESC, m.match_number DESC, m.id DESC
       LIMIT 1`,
      [tournamentId]
    );

    if (lastMatchRes.rows.length > 0) {
      const lastMatchId = lastMatchRes.rows[0].id;
      const placementsRes = await pool.query(
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
    // Tolerant fallback for test environments or unmigrated schemas
  }

  // Check which teams have advanced to any later round
  const advancedTeamSet = new Set();
  try {
    const advRes = await pool.query(
      `SELECT DISTINCT tournament_team_id
       FROM tournament_match_assignments
       WHERE tournament_id = $1 AND source = 'advancement'`,
      [tournamentId]
    );
    for (const r of advRes.rows) advancedTeamSet.add(r.tournament_team_id);
  } catch {
    // Tolerant fallback
  }

  const result = await pool.query(
    `SELECT 
       COALESCE(lb.id, 'LB-' || t.id) AS id,
       $1 AS tournament_id,
       COALESCE(t.id, lb.team_id) AS team_id,
       COALESCE(t.team_name, 'Team ' || SUBSTRING(COALESCE(t.id, lb.team_id), 1, 6)) AS team_name,
       COALESCE(u.name, 'Captain') AS leader_name,
       t.status,
       (t.status = 'disqualified') AS is_disqualified,
       COALESCE(lb.matches_played, 0)::int AS matches_played,
       COALESCE(lb.total_kills, 0)::int AS total_kills,
       COALESCE(lb.total_kill_points, 0)::int AS total_kill_points,
       COALESCE(lb.total_placement_points, 0)::int AS total_placement_points,
       COALESCE(lb.total_points, 0)::int AS total_points,
       COALESCE(lb.wwcd_count, 0)::int AS wwcd_count,
       lb.best_placement,
       lb.updated_at
     FROM tournament_teams t
     FULL OUTER JOIN tournament_leaderboard lb ON lb.tournament_id = t.tournament_id AND lb.team_id = t.id
     LEFT JOIN users u ON t.leader_user_id = u.id
     WHERE COALESCE(t.tournament_id, lb.tournament_id) = $1`,
    [tournamentId]
  );

  const rows = result.rows.map((row) => ({
    ...row,
    is_advanced: advancedTeamSet.has(row.team_id),
    advanced: advancedTeamSet.has(row.team_id),
    last_match_placement: placementMap.has(row.team_id) ? placementMap.get(row.team_id) : null,
  }));

  return sortAndRank(rows);
}

/**
 * Allows authorized administrators and tournament organizers to enter or edit a team's points.
 * Automatically computes total_points = placement_points + kill_points to enforce mathematical consistency.
 * Persists changes in tournament_match_results (if match results exist or round_id is provided) and updates
 * tournament_leaderboard, logging the action in admin_action_log.
 */
export async function editTeamLeaderboardPoints(pool, {
  tournamentId,
  teamId,
  placement_points,
  kill_points,
  total_kills,
  wwcd_count,
  matches_played,
  round_id = null,
  actorId = null,
} = {}) {
  if (!tournamentId || !teamId) {
    throw new Error('Tournament ID and Team ID are required.');
  }

  // Validate placement points and kill points
  const pCheck = validateScore(placement_points, 'Placement points');
  if (!pCheck.valid) throw new Error(pCheck.error);

  const kCheck = validateScore(kill_points, 'Kill points');
  if (!kCheck.valid) throw new Error(kCheck.error);

  const killsCheck = total_kills != null ? validateScore(total_kills, 'Total kills') : { valid: true, value: kCheck.value };
  if (!killsCheck.valid) throw new Error(killsCheck.error);

  const wwcdCheck = wwcd_count != null ? validateScore(wwcd_count, 'WWCD count') : { valid: true, value: 0 };
  if (!wwcdCheck.valid) throw new Error(wwcdCheck.error);

  const mpCheck = matches_played != null ? validateScore(matches_played, 'Matches played') : { valid: true, value: 1 };
  if (!mpCheck.valid) throw new Error(mpCheck.error);

  const finalPlacementPts = pCheck.value;
  const finalKillPts = kCheck.value;
  const finalKills = killsCheck.value;
  const finalWwcd = wwcdCheck.value;
  const finalMatchesPlayed = mpCheck.value;
  // Authoritative server-side calculation: total points derived from placement + kill points
  const finalTotalPoints = finalPlacementPts + finalKillPts;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock tournament & verify not finalized
    const tournRes = await client.query(
      'SELECT id, finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE',
      [tournamentId]
    );
    if (tournRes.rows.length === 0) {
      throw new Error('Tournament not found.');
    }
    if (tournRes.rows[0].finalized_at) {
      throw new Error('Tournament is finalized; point adjustments are locked.');
    }

    // Verify team exists and is not disqualified
    const teamRes = await client.query(
      'SELECT id, team_name, status FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
      [teamId, tournamentId]
    );
    if (teamRes.rows.length === 0) {
      throw new Error('Team not found in this tournament.');
    }
    if (teamRes.rows[0].status === 'disqualified') {
      throw new Error('Cannot edit scores for a disqualified team.');
    }
    const teamName = teamRes.rows[0].team_name;

    // Fetch previous leaderboard row for audit
    const prevLbRes = await client.query(
      'SELECT * FROM tournament_leaderboard WHERE tournament_id = $1 AND team_id = $2',
      [tournamentId, teamId]
    );
    const prevData = prevLbRes.rows[0] || null;

    // Check if team has match results in the specified round (or tournament)
    let updatedMatchResult = false;
    if (round_id) {
      const mrRes = await client.query(
        `SELECT mr.id, mr.match_id
         FROM tournament_match_results mr
         JOIN tournament_matches m ON mr.match_id = m.id
         WHERE mr.tournament_id = $1 AND mr.team_id = $2 AND m.round_id = $3
         ORDER BY mr.updated_at DESC LIMIT 1 FOR UPDATE`,
        [tournamentId, teamId, round_id]
      );
      if (mrRes.rows.length > 0) {
        const matchResultId = mrRes.rows[0].id;
        await client.query(
          `UPDATE tournament_match_results
           SET placement_points = $1, kill_points = $2, kills = $3, total_points = $4,
               wwcd = $5, status = 'verified', verified_by = $6, updated_at = NOW()
           WHERE id = $7`,
          [finalPlacementPts, finalKillPts, finalKills, finalTotalPoints, finalWwcd > 0, actorId, matchResultId]
        );
        await client.query(
          `INSERT INTO tournament_match_results_audit (id, result_id, action, previous_data, new_data, actor_id, timestamp)
           VALUES (gen_random_uuid()::varchar, $1, 'update', $2, $3, $4, NOW())`,
          [
            matchResultId,
            prevData ? JSON.stringify(prevData) : null,
            JSON.stringify({ placement_points: finalPlacementPts, kill_points: finalKillPts, total_points: finalTotalPoints }),
            actorId,
          ]
        );
        await updateTeamLeaderboard(client, tournamentId, teamId);
        updatedMatchResult = true;
      }
    } else {
      const countRes = await client.query(
        `SELECT COUNT(*)::int as cnt, MIN(id) as single_id
         FROM tournament_match_results
         WHERE tournament_id = $1 AND team_id = $2`,
        [tournamentId, teamId]
      );
      if (countRes.rows[0].cnt === 1) {
        const matchResultId = countRes.rows[0].single_id;
        await client.query(
          `UPDATE tournament_match_results
           SET placement_points = $1, kill_points = $2, kills = $3, total_points = $4,
               wwcd = $5, status = 'verified', verified_by = $6, updated_at = NOW()
           WHERE id = $7`,
          [finalPlacementPts, finalKillPts, finalKills, finalTotalPoints, finalWwcd > 0, actorId, matchResultId]
        );
        await client.query(
          `INSERT INTO tournament_match_results_audit (id, result_id, action, previous_data, new_data, actor_id, timestamp)
           VALUES (gen_random_uuid()::varchar, $1, 'update', $2, $3, $4, NOW())`,
          [
            matchResultId,
            prevData ? JSON.stringify(prevData) : null,
            JSON.stringify({ placement_points: finalPlacementPts, kill_points: finalKillPts, total_points: finalTotalPoints }),
            actorId,
          ]
        );
        await updateTeamLeaderboard(client, tournamentId, teamId);
        updatedMatchResult = true;
      }
    }

    // Direct upsert to tournament_leaderboard if not updated through single match result
    if (!updatedMatchResult) {
      await client.query(
        `INSERT INTO tournament_leaderboard (
           id, tournament_id, team_id, matches_played, total_kills,
           total_kill_points, total_placement_points, total_points,
           wwcd_count, updated_at
         ) VALUES (
           gen_random_uuid()::varchar, $1, $2, $3, $4, $5, $6, $7, $8, NOW()
         ) ON CONFLICT (tournament_id, team_id) DO UPDATE SET
           matches_played = EXCLUDED.matches_played,
           total_kills = EXCLUDED.total_kills,
           total_kill_points = EXCLUDED.total_kill_points,
           total_placement_points = EXCLUDED.total_placement_points,
           total_points = EXCLUDED.total_points,
           wwcd_count = EXCLUDED.wwcd_count,
           updated_at = NOW()`,
        [
          tournamentId,
          teamId,
          finalMatchesPlayed,
          finalKills,
          finalKillPts,
          finalPlacementPts,
          finalTotalPoints,
          finalWwcd,
        ]
      );
    }

    // Record score correction in admin_action_log for full auditability
    await client.query(
      `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
       VALUES (gen_random_uuid()::varchar, $1, 'edit_team_points', 'scoring', 'team', $2, $3)`,
      [
        actorId,
        teamId,
        JSON.stringify({
          tournament_id: tournamentId,
          team_id: teamId,
          team_name: teamName,
          round_id: round_id || null,
          previous: prevData,
          updated: {
            total_points: finalTotalPoints,
            placement_points: finalPlacementPts,
            kill_points: finalKillPts,
            total_kills: finalKills,
            wwcd_count: finalWwcd,
            matches_played: finalMatchesPlayed,
          },
        }),
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      tournament_id: tournamentId,
      team_id: teamId,
      team_name: teamName,
      total_points: finalTotalPoints,
      total_placement_points: finalPlacementPts,
      total_kill_points: finalKillPts,
      total_kills: finalKills,
      wwcd_count: finalWwcd,
      matches_played: finalMatchesPlayed,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}