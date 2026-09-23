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
export function calculateMatchPoints(kills, placement, scoringRules) {
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

/**
 * Deterministic ranking order:
 *   1. total points (desc)
 *   2. kills (desc)
 *   3. wwcd (desc)      
 *   4. best placement (asc)
 *   5. team_id (asc)
 */
export function sortAndRank(rows) {
  const sorted = [...rows].sort((a, b) => {
    const byPoints = (b.total_points || 0) - (a.total_points || 0);
    if (byPoints !== 0) return byPoints;
    const byKills = (b.total_kills || 0) - (a.total_kills || 0);
    if (byKills !== 0) return byKills;
    const byWwcd = (b.wwcd_count || 0) - (a.wwcd_count || 0);
    if (byWwcd !== 0) return byWwcd;
    const byPlacement = (a.best_placement || 999) - (b.best_placement || 999);
    if (byPlacement !== 0) return byPlacement;
    const aId = String(a.team_id);
    const bId = String(b.team_id);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
  return sorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/**
 * Fetch every scored team for a tournament and return ranked standings.
 */
export async function calculateRankings(pool, tournamentId) {
  const result = await pool.query(
    `SELECT lb.*, t.team_name, u.name as leader_name
     FROM tournament_leaderboard lb
     JOIN tournament_teams t ON lb.team_id = t.id
     JOIN users u ON t.leader_user_id = u.id
     WHERE lb.tournament_id = $1`,
    [tournamentId]
  );
  return sortAndRank(result.rows);
}