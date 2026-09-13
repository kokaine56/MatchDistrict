// ─────────────────────────────────────────────────────────────
// Leaderboard ranking engine for Match District.
//
// Single authoritative source of truth for tournament standings.
// Both the public detail endpoint and the admin scoring endpoint
// consume this module so rankings can never diverge between views.
//
// Scoring model:
//   Total Points = Kills + Placement Points + Bonus Points
//   WWCD is tracked separately (first-place finishes) and does
//   NOT add to Total Points unless a tournament's official
//   scoring rules explicitly say it should.
// ─────────────────────────────────────────────────────────────

export const LEADERBOARD_MAX_SCORE = 1000000;

/**
 * Validates a single whole-number score field submitted by an admin.
 * Accepts only whole numbers in [0, LEADERBOARD_MAX_SCORE].
 */
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
 * Validates the full scoring breakdown for one team:
 *   kills, placement_points, wwcd, bonus_points.
 * Returns collected values and any per-field errors.
 */
export function validateScoring(data) {
  const fields = [
    ['kills', 'Kills'],
    ['placement_points', 'Placement points'],
    ['wwcd', 'WWCD'],
    ['bonus_points', 'Bonus points'],
  ];
  const values = {};
  const errors = [];
  for (const [key, label] of fields) {
    const check = validateScore(data ? data[key] : undefined, label);
    if (!check.valid) {
      errors.push(check.error);
    } else {
      values[key] = check.value;
    }
  }
  return { valid: errors.length === 0, values, errors };
}

/**
 * Computes a team's total points from its scoring breakdown.
 * WWCD is intentionally excluded — it is a statistic, not a point category.
 */
export function computeTotalPoints(breakdown) {
  return (breakdown.kills || 0) + (breakdown.placement_points || 0) + (breakdown.bonus_points || 0);
}

/**
 * Deterministic ranking order:
 *   1. total points (desc)
 *   2. kills (desc)
 *   3. wwcd (desc)      → more first-place finishes win ties
 *   4. placement pts (asc) → lower (better) placement wins ties
 *   5. team_id (asc)    → stable final fallback so ties never reorder randomly
 * Ranks are assigned 1..N from the fully sorted list (no shared ranks).
 */
export function sortAndRank(rows) {
  const sorted = [...rows].sort((a, b) => {
    const byPoints = (b.total_points || 0) - (a.total_points || 0);
    if (byPoints !== 0) return byPoints;
    const byKills = (b.kills || 0) - (a.kills || 0);
    if (byKills !== 0) return byKills;
    const byWwcd = (b.wwcd || 0) - (a.wwcd || 0);
    if (byWwcd !== 0) return byWwcd;
    const byPlacement = (a.placement_points || 0) - (b.placement_points || 0);
    if (byPlacement !== 0) return byPlacement;
    const aId = String(a.team_id);
    const bId = String(b.team_id);
    return aId < bId ? -1 : aId > bId ? 1 : 0;
  });
  return sorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

/**
 * Fetch every scored team for a tournament and return ranked standings.
 * Teams without a score simply do not appear yet.
 */
export async function calculateRankings(pool, tournamentId) {
  const result = await pool.query(
    `SELECT lb.id, lb.tournament_id, lb.team_id, lb.team_name, lb.kills,
            lb.placement_points, lb.wwcd, lb.bonus_points, lb.total_points,
            lb.updated_by, lb.updated_at
     FROM tournament_leaderboard lb
     WHERE lb.tournament_id = $1`,
    [tournamentId]
  );
  return sortAndRank(result.rows);
}