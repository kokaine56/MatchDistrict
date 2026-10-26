// ─────────────────────────────────────────────────────────────
// Leaderboard ranking engine for Match District.
//
// Single authoritative source of truth for tournament standings.
// ─────────────────────────────────────────────────────────────
import crypto from 'crypto';

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

// Mirrors the tournament_scoring_rules DDL defaults; used when no custom rules row exists.
export const DEFAULT_SCORING_RULES = Object.freeze({
  kill_points_multiplier: 1,
  placement_points_map: {
    '1': 15, '2': 12, '3': 10, '4': 8, '5': 6, '6': 4, '7': 2, '8': 1, '9': 1,
    '10': 1, '11': 1, '12': 1, '13': 0, '14': 0, '15': 0, '16': 0, '17': 0,
    '18': 0, '19': 0, '20': 0,
  },
  wwcd_bonus: 0,
});

/**
 * Loads authoritative tournament scoring rules from tournament_scoring_rules table.
 * Falls back to DEFAULT_SCORING_RULES if no custom rules row exists or query fails.
 */
export async function getTournamentScoringRules(clientOrPool, tournamentId) {
  if (!clientOrPool || !tournamentId) return { ...DEFAULT_SCORING_RULES };
  try {
    const res = await clientOrPool.query(
      'SELECT kill_points_multiplier, placement_points_map, wwcd_bonus FROM tournament_scoring_rules WHERE tournament_id = $1::varchar',
      [tournamentId]
    );
    if (res.rows.length > 0 && res.rows[0]) {
      const row = res.rows[0];
      return {
        kill_points_multiplier: Number(row.kill_points_multiplier ?? 1),
        placement_points_map: typeof row.placement_points_map === 'string'
          ? JSON.parse(row.placement_points_map)
          : (row.placement_points_map || DEFAULT_SCORING_RULES.placement_points_map),
        wwcd_bonus: Number(row.wwcd_bonus ?? 0),
      };
    }
  } catch {
    // If table doesn't exist or query fails, fall back to defaults
  }
  return { ...DEFAULT_SCORING_RULES };
}

/**
 * Calculates match points for a single team's result based on scoring rules.
 * Rule: total points = placement points + total kills x kill multiplier (default 1).
 */
export function calculateMatchPoints(kills, placement, scoringRules = {}) {
  const killMultiplier = Number(scoringRules.kill_points_multiplier ?? scoringRules.kill_multiplier ?? 1);
  const effectiveMultiplier = Number.isFinite(killMultiplier) && killMultiplier >= 0 ? killMultiplier : 1;
  const kill_points = Number(kills || 0) * effectiveMultiplier;

  let placement_points = 0;
  if (scoringRules.placement_points_map && scoringRules.placement_points_map[String(placement)] != null) {
    placement_points = Number(scoringRules.placement_points_map[String(placement)]);
  }

  const wwcd = Number(placement) === 1;
  const wwcd_bonus = wwcd ? Number(scoringRules.wwcd_bonus || 0) : 0;

  const total_points = kill_points + placement_points + wwcd_bonus;

  return { kill_points, placement_points, wwcd, total_points };
}

/**
 * Re-aggregates cumulative leaderboard statistics for a single team in a tournament
 * from verified match results in tournament_match_results.
 */
export async function updateTeamLeaderboard(client, tournamentId, teamId) {
  if (!client || !tournamentId || !teamId) return null;

  const aggRes = await client.query(`
    SELECT
      COUNT(id)::int AS matches_played,
      COALESCE(SUM(kills), 0)::int AS total_kills,
      COALESCE(SUM(kill_points), 0)::int AS total_kill_points,
      COALESCE(SUM(placement_points), 0)::int AS total_placement_points,
      COALESCE(SUM(total_points), 0)::int AS total_points,
      COUNT(CASE WHEN wwcd = true THEN 1 END)::int AS wwcd_count,
      MIN(placement)::int AS best_placement
    FROM tournament_match_results
    WHERE tournament_id = $1::varchar
      AND team_id = $2::varchar
      AND status = 'verified'
  `, [tournamentId, teamId]);

  const row = aggRes.rows[0] || {
    matches_played: 0,
    total_kills: 0,
    total_kill_points: 0,
    total_placement_points: 0,
    total_points: 0,
    wwcd_count: 0,
    best_placement: null,
  };

  await client.query(`
    INSERT INTO tournament_leaderboard (
      id, tournament_id, team_id, matches_played, total_kills,
      total_kill_points, total_placement_points, total_points,
      wwcd_count, best_placement, updated_at
    ) VALUES (
      gen_random_uuid()::varchar, $1::varchar, $2::varchar, $3::int, $4::int,
      $5::int, $6::int, $7::int, $8::int, $9::int, NOW()
    ) ON CONFLICT (tournament_id, team_id) DO UPDATE SET
      matches_played = EXCLUDED.matches_played,
      total_kills = EXCLUDED.total_kills,
      total_kill_points = EXCLUDED.total_kill_points,
      total_placement_points = EXCLUDED.total_placement_points,
      total_points = EXCLUDED.total_points,
      wwcd_count = EXCLUDED.wwcd_count,
      best_placement = EXCLUDED.best_placement,
      updated_at = NOW()
  `, [
    tournamentId,
    teamId,
    row.matches_played,
    row.total_kills,
    row.total_kill_points,
    row.total_placement_points,
    row.total_points,
    row.wwcd_count,
    row.best_placement,
  ]);

  return row;
}

export const TIE_BREAK_RULES_DESCRIPTION =
  '1. Total WWCDs | 2. Total placement points | 3. Total elimination points | 4. Best placement in most recent match';

/**
 * Strict tie-break comparison between two teams for equal total points (Decision 1):
 *   1. Total WWCDs (1st place finishes), higher wins
 *   2. Total placement points, higher wins
 *   3. Total elimination (kill) points = kills x multiplier counted once, higher wins
 *   4. Best placement in the most recent match, higher wins (1st beats 2nd; lower placement number wins; no-result loses)
 *
 * Missing scores (Decision 2):
 *   Teams with saved scores rank above teams with missing scores (null).
 *
 * Returns:
 *   negative if team a ranks higher than team b
 *   positive if team b ranks higher than team a
 *   0 if ALL four criteria are equal (true tie that requires manual resolution)
 */
export function compareTeams(a, b, scoringRules = {}) {
  const aHasScores = a?.has_saved_scores !== false && a?.total_points != null;
  const bHasScores = b?.has_saved_scores !== false && b?.total_points != null;
  if (aHasScores && !bHasScores) return -1;
  if (!aHasScores && bHasScores) return 1;
  if (!aHasScores && !bHasScores) return 0;

  const mult = Number(scoringRules.kill_points_multiplier ?? scoringRules.kill_multiplier ?? 1);
  const killMultiplier = Number.isFinite(mult) && mult >= 0 ? mult : 1;

  // Primary: Total points (higher wins -> descending)
  const aPts = Number(a?.total_points ?? a?.points ?? 0);
  const bPts = Number(b?.total_points ?? b?.points ?? 0);
  if (bPts !== aPts) return bPts - aPts;

  // Criterion 1: Total WWCDs (1st place finishes), higher wins
  const aWwcd = Number(a?.wwcd_count ?? a?.wwcd ?? 0);
  const bWwcd = Number(b?.wwcd_count ?? b?.wwcd ?? 0);
  if (bWwcd !== aWwcd) return bWwcd - aWwcd;

  // Criterion 2: Total placement points, higher wins
  const aPlacePts = Number(a?.total_placement_points ?? a?.placement_points ?? 0);
  const bPlacePts = Number(b?.total_placement_points ?? b?.placement_points ?? 0);
  if (bPlacePts !== aPlacePts) return bPlacePts - aPlacePts;

  // Criterion 3: Total elimination points = kills x multiplier, counted once (higher wins)
  const aKills = Number(a?.total_kills ?? a?.kills ?? 0);
  const bKills = Number(b?.total_kills ?? b?.kills ?? 0);
  const aElim = aKills * killMultiplier;
  const bElim = bKills * killMultiplier;
  if (bElim !== aElim) return bElim - aElim;

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
    return -1;
  } else if (!aHasPlacement && bHasPlacement) {
    return 1;
  }

  // All 4 criteria are equal: true tie
  return 0;
}

/**
 * Deterministic ranking order enforcing strict tie-break rules and missing score rules:
 *   - Missing scores are null, never zero (Decision 2); team with no saved scores shows "No scores yet".
 *   - Display fallback for true ties: slot_number (asc) then team_id (asc).
 *
 * Annotates each row with:
 *   rank: 1-indexed rank for scored teams, null for unscored teams
 *   no_scores_yet: boolean
 *   tie_broken: boolean indicating if row needed tie-break (shares total points with another scored team)
 *   is_true_tie: boolean indicating all 4 criteria are equal to another scored team
 */
export function sortAndRank(rows = [], scoringRules = {}) {
  if (!Array.isArray(rows)) return [];

  const sorted = [...rows].sort((a, b) => {
    const cmp = compareTeams(a, b, scoringRules);
    if (cmp !== 0) return cmp;

    const aSlot = a?.slot_number != null ? Number(a.slot_number) : 99999;
    const bSlot = b?.slot_number != null ? Number(b.slot_number) : 99999;
    if (aSlot !== bSlot) return aSlot - bSlot;

    const aId = String(a?.team_id || a?.id || '');
    const bId = String(b?.team_id || b?.id || '');
    return aId.localeCompare(bId);
  });

  const scoredTeams = sorted.filter((r) => r.has_saved_scores !== false && r.total_points != null);

  const pointsCount = new Map();
  for (const r of scoredTeams) {
    const pts = Number(r?.total_points ?? r?.points ?? 0);
    pointsCount.set(pts, (pointsCount.get(pts) || 0) + 1);
  }

  let rankCounter = 1;
  return sorted.map((row) => {
    const hasScores = row.has_saved_scores !== false && row.total_points != null;
    if (!hasScores) {
      return {
        ...row,
        rank: null,
        total_points: null,
        total_placement_points: null,
        total_kills: null,
        total_kill_points: null,
        wwcd_count: null,
        matches_played: 0,
        no_scores_yet: true,
        tie_broken: false,
        is_true_tie: false,
      };
    }

    const pts = Number(row?.total_points ?? row?.points ?? 0);
    const tieNeeded = (pointsCount.get(pts) || 0) > 1;
    const isTrueTie = scoredTeams.some((other) => other !== row && compareTeams(row, other, scoringRules) === 0);

    const currentRank = rankCounter++;
    return {
      ...row,
      rank: currentRank,
      no_scores_yet: false,
      tie_broken: tieNeeded,
      is_true_tie: isTrueTie,
    };
  });
}

/**
 * Detects whether an unresolved true tie exists across the qualification cutoff boundary (Decision 1 & B6).
 *
 * @param {Array<Object>} standings - Array of team standings sorted by authoritative ranking
 * @param {number} cutoffCount - Target advancing slots
 * @param {Object} scoringRules - Tournament scoring rules
 * @returns {{ hasTie: boolean, cutoffScore: number | null, tiedTeams: Array<Object> }}
 */
export function detectCutoffTies(standings = [], cutoffCount = 0, scoringRules = {}) {
  if (!Array.isArray(standings) || cutoffCount <= 0 || cutoffCount >= standings.length) {
    return { hasTie: false, cutoffScore: null, tiedTeams: [] };
  }

  const eligible = standings.filter((t) => !t.is_disqualified);
  if (cutoffCount <= 0 || cutoffCount >= eligible.length) {
    return { hasTie: false, cutoffScore: null, tiedTeams: [] };
  }

  const lastInside = eligible[cutoffCount - 1];
  const firstOutside = eligible[cutoffCount];

  if (!lastInside || !firstOutside) {
    return { hasTie: false, cutoffScore: null, tiedTeams: [] };
  }

  const cmp = compareTeams(lastInside, firstOutside, scoringRules);
  const cutoffPoints = Number(lastInside.total_points ?? lastInside.points) || 0;

  if (cmp === 0) {
    const tiedTeams = eligible.filter((t) => compareTeams(t, lastInside, scoringRules) === 0);
    return {
      hasTie: true,
      cutoffScore: cutoffPoints,
      tiedTeams,
    };
  }

  return { hasTie: false, cutoffScore: cutoffPoints, tiedTeams: [] };
}

/**
 * Ensures all approved registrations in tournament_registrations have a canonical record in tournament_teams.
 * Resolves canonical ID map mapping both registration_id and team_id to tournament_teams.id.
 *
 * @param {object} client - pg pool or client
 * @param {string} tournamentId
 * @returns {Promise<{ teamCanonicalIdMap: Map<string, string>, teamNameMap: Map<string, string>, captainNameMap: Map<string, string> }>}
 */
export async function ensureCanonicalTeams(client, tournamentId) {
  const APPROVED_REG_STATUSES = ['approved', 'confirmed', 'verified_by_host', 'VERIFIED_BY_HOST', 'verified'];

  // Idempotently create tournament_teams rows for any approved registration missing one
  await client.query(`
    INSERT INTO tournament_teams (id, tournament_id, registration_id, team_name, leader_user_id, status, created_at, updated_at)
    SELECT
      'TEAM-' || SUBSTRING(r.id, 1, 8) || '-' || SUBSTRING(md5(r.id || r.tournament_id), 1, 6),
      r.tournament_id,
      r.id,
      TRIM(r.team_name),
      COALESCE(u.id, (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)),
      'verified',
      NOW(),
      NOW()
    FROM tournament_registrations r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE r.tournament_id = $1::varchar
      AND LOWER(r.status) = ANY($2::text[])
      AND NOT EXISTS (
        SELECT 1 FROM tournament_teams tt
        WHERE tt.tournament_id = r.tournament_id
          AND (tt.registration_id = r.id OR LOWER(TRIM(tt.team_name)) = LOWER(TRIM(r.team_name)))
      )
    ON CONFLICT (tournament_id, team_name) DO UPDATE
      SET registration_id = COALESCE(tournament_teams.registration_id, EXCLUDED.registration_id),
          updated_at = NOW()
  `, [tournamentId, APPROVED_REG_STATUSES]);

  // Backfill registration_id on existing tournament_teams missing it
  await client.query(`
    UPDATE tournament_teams tt
    SET registration_id = r.id, updated_at = NOW()
    FROM tournament_registrations r
    WHERE tt.tournament_id = $1::varchar
      AND r.tournament_id = tt.tournament_id
      AND tt.registration_id IS NULL
      AND LOWER(TRIM(tt.team_name)) = LOWER(TRIM(r.team_name))
      AND LOWER(r.status) = ANY($2::text[])
  `, [tournamentId, APPROVED_REG_STATUSES]);

  const teamsRes = await client.query(`
    SELECT t.id, t.registration_id, t.team_name, r.id as reg_id, r.captain, u.name as user_name
    FROM tournament_teams t
    LEFT JOIN tournament_registrations r ON (r.id = t.registration_id OR (r.tournament_id = t.tournament_id AND LOWER(TRIM(r.team_name)) = LOWER(TRIM(t.team_name))))
    LEFT JOIN users u ON u.id = t.leader_user_id
    WHERE t.tournament_id = $1::varchar
  `, [tournamentId]);

  const teamCanonicalIdMap = new Map();
  const teamNameMap = new Map();
  const captainNameMap = new Map();

  for (const row of teamsRes.rows) {
    const canonicalId = row.id;
    const name = row.team_name;
    const captain = row.captain || row.user_name || 'Captain';

    teamCanonicalIdMap.set(canonicalId, canonicalId);
    teamNameMap.set(canonicalId, name);
    captainNameMap.set(canonicalId, captain);

    if (row.registration_id) {
      teamCanonicalIdMap.set(row.registration_id, canonicalId);
      teamNameMap.set(row.registration_id, name);
      captainNameMap.set(row.registration_id, captain);
    }
    if (row.reg_id) {
      teamCanonicalIdMap.set(row.reg_id, canonicalId);
      teamNameMap.set(row.reg_id, name);
      captainNameMap.set(row.reg_id, captain);
    }
  }

  return { teamCanonicalIdMap, teamNameMap, captainNameMap };
}

/**
 * ONE shared query used by district, round and overall views, qualification and advancement (spec A2):
 * - Registration approved according to existing statuses AND allocated to round and district.
 * - Disqualified teams shown flagged (is_disqualified: true, status: 'disqualified').
 * - No unrelated status filters.
 * - Single team identifier used everywhere: tournament_teams.id.
 *
 * @param {object} client - pg pool or client
 * @param {string} tournamentId
 * @param {object} options - { roundId, districtId, isFirstRound }
 * @returns {Promise<Array<object>>}
 */
export async function getEligibleTournamentTeams(client, tournamentId, { roundId = null, districtId = null, isFirstRound = false } = {}) {
  const { teamCanonicalIdMap, captainNameMap } = await ensureCanonicalTeams(client, tournamentId);

  const APPROVED_REG_STATUSES = ['approved', 'confirmed', 'verified_by_host', 'VERIFIED_BY_HOST'];

  // 1. Fetch match results for the given round (or whole tournament if roundId is null)
  let roundResultsMap = new Map();
  if (roundId) {
    const resRes = await client.query(`
      SELECT
        tm.team_id,
        COUNT(DISTINCT tm.match_id)::int as matches_played,
        SUM(tm.kills)::int as total_kills,
        SUM(tm.kill_points)::int as total_kill_points,
        SUM(tm.placement_points)::int as total_placement_points,
        SUM(tm.total_points)::int as total_points,
        SUM(CASE WHEN tm.wwcd THEN 1 ELSE 0 END)::int as wwcd_count,
        MIN(tm.placement)::int as best_placement
      FROM tournament_match_results tm
      JOIN tournament_matches m ON m.id = tm.match_id
      WHERE m.round_id = $1::varchar AND tm.tournament_id = $2::varchar AND tm.status = 'verified'
      GROUP BY tm.team_id
    `, [roundId, tournamentId]);

    for (const r of resRes.rows) {
      const canonId = teamCanonicalIdMap.get(r.team_id) || r.team_id;
      roundResultsMap.set(canonId, {
        matches_played: r.matches_played,
        total_kills: r.total_kills,
        total_kill_points: r.total_kill_points,
        total_placement_points: r.total_placement_points,
        total_points: r.total_points,
        wwcd_count: r.wwcd_count,
        best_placement: r.best_placement,
        has_saved_scores: true,
      });
    }
  }

  // 2. Tournament leaderboard rows (fallback / overall tournament standings)
  const lbRes = await client.query(`
    SELECT
      team_id,
      matches_played,
      total_kills,
      total_kill_points,
      total_placement_points,
      total_points,
      wwcd_count,
      best_placement
    FROM tournament_leaderboard
    WHERE tournament_id = $1::varchar
  `, [tournamentId]);

  const lbMap = new Map();
  for (const r of lbRes.rows) {
    const canonId = teamCanonicalIdMap.get(r.team_id) || r.team_id;
    lbMap.set(canonId, {
      matches_played: Number(r.matches_played) || 0,
      total_kills: Number(r.total_kills) || 0,
      total_kill_points: Number(r.total_kill_points) || 0,
      total_placement_points: Number(r.total_placement_points) || 0,
      total_points: Number(r.total_points) || 0,
      wwcd_count: Number(r.wwcd_count) || 0,
      best_placement: r.best_placement != null ? Number(r.best_placement) : null,
      has_saved_scores: Number(r.matches_played) > 0 || Number(r.total_points) > 0 || Number(r.total_kills) > 0,
    });
  }

  // 3. Last match placement for tie-breaking
  const placementMap = new Map();
  try {
    const lastMatchSql = roundId
      ? `SELECT m.id FROM tournament_matches m
         JOIN tournament_match_results mr ON mr.match_id = m.id AND mr.status = 'verified'
         WHERE m.round_id = $1::varchar AND m.tournament_id = $2::varchar
         ORDER BY m.match_number DESC, m.id DESC LIMIT 1`
      : `SELECT m.id FROM tournament_matches m
         JOIN tournament_match_results mr ON mr.match_id = m.id AND mr.status = 'verified'
         LEFT JOIN tournament_rounds rnd ON rnd.id = m.round_id
         WHERE m.tournament_id = $1::varchar
         ORDER BY COALESCE(rnd.round_number, 1) DESC, m.match_number DESC, m.id DESC LIMIT 1`;
    const lastMatchParams = roundId ? [roundId, tournamentId] : [tournamentId];
    const lastMatchRes = await client.query(lastMatchSql, lastMatchParams);

    if (lastMatchRes.rows.length > 0) {
      const lastMatchId = lastMatchRes.rows[0].id;
      const pRes = await client.query(`
        SELECT team_id, MIN(placement)::int as placement
        FROM tournament_match_results
        WHERE match_id = $1::varchar AND tournament_id = $2::varchar AND status = 'verified'
        GROUP BY team_id
      `, [lastMatchId, tournamentId]);
      for (const pr of pRes.rows) {
        const cId = teamCanonicalIdMap.get(pr.team_id) || pr.team_id;
        if (pr.placement != null) placementMap.set(cId, Number(pr.placement));
      }
    }
  } catch {
    // Non-blocking fallback
  }

  // 4. Advanced team set
  const advancedTeamSet = new Set();
  try {
    const advRes = await client.query(`
      SELECT DISTINCT team_id
      FROM tournament_qualification_decisions
      WHERE tournament_id = $1::varchar AND status IN ('confirmed', 'provisional')
      UNION
      SELECT DISTINCT tournament_team_id AS team_id
      FROM tournament_match_assignments
      WHERE tournament_id = $1::varchar AND source = 'advancement'
    `, [tournamentId]);
    for (const r of advRes.rows) {
      const cId = teamCanonicalIdMap.get(r.team_id) || r.team_id;
      advancedTeamSet.add(cId);
    }
  } catch {
    // Non-blocking fallback
  }

  // 5. Query approved allocated teams
  const eligibleMap = new Map();

  if (isFirstRound || !roundId) {
    // Round 1 or Overall View: Approved registrations
    const regSql = `
      SELECT
        t.id as team_id,
        r.id as registration_id,
        t.team_name,
        r.captain as leader_name,
        r.slot_number,
        r.group_id,
        r.group_name as district_name,
        t.status as team_status
      FROM tournament_registrations r
      JOIN tournament_teams t ON (t.registration_id = r.id OR (t.tournament_id = r.tournament_id AND LOWER(t.team_name) = LOWER(r.team_name)))
      WHERE r.tournament_id = $1::varchar
        AND LOWER(r.status) = ANY($2::text[])
      ORDER BY r.slot_number ASC NULLS LAST, r.created_at ASC
    `;
    const regRes = await client.query(regSql, [tournamentId, APPROVED_REG_STATUSES]);

    for (const r of regRes.rows) {
      const cId = teamCanonicalIdMap.get(r.team_id) || r.team_id;
      const isDisqualified = r.team_status === 'disqualified';
      const captain = r.leader_name || captainNameMap.get(cId) || 'Captain';

      // Pick score stats: round results if roundId is present, else overall leaderboard
      const scoreObj = roundId ? (roundResultsMap.get(cId) || null) : (lbMap.get(cId) || null);
      const hasScores = Boolean(scoreObj && scoreObj.has_saved_scores);

      eligibleMap.set(cId, {
        team_id: cId,
        registration_id: r.registration_id,
        team_name: r.team_name,
        leader_name: captain,
        slot_number: r.slot_number,
        group_id: r.group_id || null,
        district_id: r.group_id || null,
        district_name: r.district_name || null,
        status: r.team_status,
        is_disqualified: isDisqualified,
        is_advanced: advancedTeamSet.has(cId),
        advanced: advancedTeamSet.has(cId),
        last_match_placement: placementMap.get(cId) || null,
        has_saved_scores: hasScores,
        matches_played: hasScores ? scoreObj.matches_played : 0,
        total_kills: hasScores ? scoreObj.total_kills : null,
        total_kill_points: hasScores ? scoreObj.total_kill_points : null,
        total_placement_points: hasScores ? scoreObj.total_placement_points : null,
        total_points: hasScores ? scoreObj.total_points : null,
        wwcd_count: hasScores ? scoreObj.wwcd_count : null,
        best_placement: hasScores ? scoreObj.best_placement : null,
      });
    }

    // Include match assignments for round 1 if any exist
    if (roundId) {
      const asgnRes = await client.query(`
        SELECT a.tournament_team_id, a.group_id, g.group_name, g.id as district_id
        FROM tournament_match_assignments a
        JOIN tournament_matches m ON m.id = a.match_id
        LEFT JOIN tournament_groups g ON g.id = COALESCE(a.group_id, m.group_id)
        WHERE m.round_id = $1::varchar AND a.tournament_id = $2::varchar
      `, [roundId, tournamentId]);

      for (const asgn of asgnRes.rows) {
        const cId = teamCanonicalIdMap.get(asgn.tournament_team_id) || asgn.tournament_team_id;
        if (eligibleMap.has(cId)) {
          const entry = eligibleMap.get(cId);
          if (asgn.group_id) {
            entry.group_id = asgn.group_id;
            entry.district_id = asgn.district_id || asgn.group_id;
          }
          if (asgn.group_name) {
            entry.district_name = asgn.group_name;
          }
        }
      }
    }
  } else {
    // Subsequent rounds (Round 2+, Grand Final): Teams assigned/advanced to this round
    const asgnRes = await client.query(`
      SELECT
        t.id as team_id,
        t.registration_id,
        t.team_name,
        r.captain as leader_name,
        r.slot_number,
        COALESCE(a.group_id, m.group_id) as group_id,
        g.group_name as district_name,
        g.id as district_id,
        t.status as team_status
      FROM tournament_match_assignments a
      JOIN tournament_matches m ON m.id = a.match_id
      JOIN tournament_teams t ON t.id = a.tournament_team_id
      LEFT JOIN tournament_registrations r ON (r.id = t.registration_id OR (r.tournament_id = t.tournament_id AND LOWER(r.team_name) = LOWER(t.team_name)))
      LEFT JOIN tournament_groups g ON g.id = COALESCE(a.group_id, m.group_id)
      WHERE m.round_id = $1::varchar AND a.tournament_id = $2::varchar
    `, [roundId, tournamentId]);

    for (const r of asgnRes.rows) {
      const cId = teamCanonicalIdMap.get(r.team_id) || r.team_id;
      if (!eligibleMap.has(cId)) {
        const isDisqualified = r.team_status === 'disqualified';
        const captain = r.leader_name || captainNameMap.get(cId) || 'Captain';
        const scoreObj = roundResultsMap.get(cId) || null;
        const hasScores = Boolean(scoreObj && scoreObj.has_saved_scores);

        eligibleMap.set(cId, {
          team_id: cId,
          registration_id: r.registration_id,
          team_name: r.team_name,
          leader_name: captain,
          slot_number: r.slot_number,
          group_id: r.group_id || null,
          district_id: r.district_id || r.group_id || null,
          district_name: r.district_name || null,
          status: r.team_status,
          is_disqualified: isDisqualified,
          is_advanced: advancedTeamSet.has(cId),
          advanced: advancedTeamSet.has(cId),
          last_match_placement: placementMap.get(cId) || null,
          has_saved_scores: hasScores,
          matches_played: hasScores ? scoreObj.matches_played : 0,
          total_kills: hasScores ? scoreObj.total_kills : null,
          total_kill_points: hasScores ? scoreObj.total_kill_points : null,
          total_placement_points: hasScores ? scoreObj.total_placement_points : null,
          total_points: hasScores ? scoreObj.total_points : null,
          wwcd_count: hasScores ? scoreObj.wwcd_count : null,
          best_placement: hasScores ? scoreObj.best_placement : null,
        });
      }
    }

    // Also include teams qualified into this target round from qualification decisions
    try {
      const qualTeamsRes = await client.query(`
        SELECT
          t.id as team_id,
          t.registration_id,
          t.team_name,
          r.captain as leader_name,
          r.slot_number,
          qd.district_id,
          t.status as team_status
        FROM tournament_qualification_decisions qd
        JOIN tournament_teams t ON t.id = qd.team_id
        LEFT JOIN tournament_registrations r ON (r.id = t.registration_id OR (r.tournament_id = t.tournament_id AND LOWER(TRIM(r.team_name)) = LOWER(TRIM(t.team_name))))
        WHERE qd.tournament_id = $1::varchar
          AND qd.target_round_id = $2::varchar
          AND qd.status IN ('confirmed', 'provisional')
      `, [tournamentId, roundId]);

      for (const r of qualTeamsRes.rows) {
        const cId = teamCanonicalIdMap.get(r.team_id) || r.team_id;
        if (!eligibleMap.has(cId)) {
          const isDisqualified = r.team_status === 'disqualified';
          const captain = r.leader_name || captainNameMap.get(cId) || 'Captain';
          const scoreObj = roundResultsMap.get(cId) || null;
          const hasScores = Boolean(scoreObj && scoreObj.has_saved_scores);

          eligibleMap.set(cId, {
            team_id: cId,
            registration_id: r.registration_id,
            team_name: r.team_name,
            leader_name: captain,
            slot_number: r.slot_number,
            group_id: r.district_id || null,
            district_id: r.district_id || null,
            district_name: null,
            status: r.team_status,
            is_disqualified: isDisqualified,
            is_advanced: advancedTeamSet.has(cId),
            advanced: advancedTeamSet.has(cId),
            last_match_placement: placementMap.get(cId) || null,
            has_saved_scores: hasScores,
            matches_played: hasScores ? scoreObj.matches_played : 0,
            total_kills: hasScores ? scoreObj.total_kills : null,
            total_kill_points: hasScores ? scoreObj.total_kill_points : null,
            total_placement_points: hasScores ? scoreObj.total_placement_points : null,
            total_points: hasScores ? scoreObj.total_points : null,
            wwcd_count: hasScores ? scoreObj.wwcd_count : null,
            best_placement: hasScores ? scoreObj.best_placement : null,
          });
        }
      }
    } catch {
      // Table might not exist yet or query non-blocking
    }
  }

  let list = Array.from(eligibleMap.values());

  // Filter to specific district if requested
  if (districtId && districtId !== 'all') {
    list = list.filter((t) => t.group_id === districtId || t.district_id === districtId);
  }

  return list;
}

/**
 * Fetch district save state from tournament_district_save_states.
 *
 * @param {object} client
 * @param {string} tournamentId
 * @param {string} roundId
 * @param {string} districtId
 * @returns {Promise<{ version: number, status: string, saved_at: string|null, saved_by: string|null }>}
 */
export async function getDistrictSaveState(client, tournamentId, roundId, districtId) {
  try {
    const res = await client.query(`
      SELECT version, status, saved_at, saved_by
      FROM tournament_district_save_states
      WHERE tournament_id = $1::varchar
        AND round_id = $2::varchar
        AND district_id = $3::varchar
    `, [tournamentId, roundId, districtId]);

    if (res.rows.length > 0) {
      return {
        version: Number(res.rows[0].version) || 1,
        status: res.rows[0].status || 'saved',
        saved_at: res.rows[0].saved_at ? res.rows[0].saved_at.toISOString() : null,
        saved_by: res.rows[0].saved_by || null,
      };
    }
  } catch {
    // Non-blocking fallback if unmigrated
  }

  return {
    version: 0,
    status: 'unsaved',
    saved_at: null,
    saved_by: null,
  };
}

/**
 * Saves all teams of a district in ONE transaction with expected-version checks (Decision 3).
 * Returns 409 Conflict if expected version does not match.
 *
 * @param {object} client - pg pool client with transaction control
 * @param {object} params
 */
export async function saveDistrictScores(client, {
  tournamentId,
  roundId,
  districtId,
  teamScores = [],
  expectedVersion = null,
  actorId = null,
  scoringRules = {},
}) {
  if (!tournamentId || !districtId) {
    throw new Error('Tournament ID and District ID are required.');
  }

  // 1. Lock tournament and verify not finalized
  const tournRes = await client.query(
    'SELECT id, finalized_at FROM tournaments WHERE id = $1::varchar FOR UPDATE',
    [tournamentId]
  );
  if (tournRes.rows.length === 0) {
    throw new Error('Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    const err = new Error('Tournament is finalized; score entry is locked.');
    err.statusCode = 409;
    err.code = 'TOURNAMENT_FINALIZED';
    throw err;
  }

  // 2. Fetch or initialize district save state record with row lock
  let currentVersion = 0;
  let saveStateRow = null;
  try {
    const stateRes = await client.query(`
      SELECT id, version, status, saved_at
      FROM tournament_district_save_states
      WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND district_id = $3::varchar
      FOR UPDATE
    `, [tournamentId, roundId || 'default', districtId]);

    if (stateRes.rows.length > 0) {
      saveStateRow = stateRes.rows[0];
      currentVersion = Number(saveStateRow.version) || 1;
    }
  } catch {
    // Tolerant if table not yet created
  }

  // Expected-version check (Decision 3: returns 409 Conflict if someone else saved first)
  if (expectedVersion != null && currentVersion > 0) {
    const expNum = Number(expectedVersion);
    if (expNum !== currentVersion) {
      const conflictErr = new Error(
        `This district was modified by another organizer (server version ${currentVersion}, expected ${expNum}). Please reload the latest scores before saving.`
      );
      conflictErr.statusCode = 409;
      conflictErr.code = 'DISTRICT_VERSION_CONFLICT';
      conflictErr.current_version = currentVersion;
      conflictErr.expected_version = expNum;
      throw conflictErr;
    }
  }

  const newVersion = currentVersion + 1;
  const killMultiplier = Number(scoringRules.kill_points_multiplier ?? scoringRules.kill_multiplier ?? 1);
  const effectiveMultiplier = Number.isFinite(killMultiplier) && killMultiplier >= 0 ? killMultiplier : 1;

  let savedCount = 0;

  for (const item of teamScores) {
    if (!item || !item.team_id) continue;
    const teamId = item.team_id;

    // Validate scores
    const pCheck = validateScore(item.placement_points ?? item.placementPoints ?? 0, 'Placement points');
    if (!pCheck.valid) throw new Error(pCheck.error);

    const kCheck = validateScore(item.total_kills ?? item.totalKills ?? item.kills ?? 0, 'Total kills');
    if (!kCheck.valid) throw new Error(kCheck.error);

    const wwcdCheck = validateScore(item.wwcd_count ?? item.wwcdCount ?? (item.wwcd ? 1 : 0), 'WWCD count');
    if (!wwcdCheck.valid) throw new Error(wwcdCheck.error);

    const mpCheck = validateScore(item.matches_played ?? item.matchesPlayed ?? 1, 'Matches played');
    if (!mpCheck.valid) throw new Error(mpCheck.error);

    const finalPlacementPts = pCheck.value;
    const finalKills = kCheck.value;
    const finalKillPts = finalKills * effectiveMultiplier;
    const finalWwcd = wwcdCheck.value;
    const finalMatchesPlayed = mpCheck.value;
    const finalTotalPoints = finalPlacementPts + finalKillPts;

    // Ensure team exists in tournament_teams
    let teamRes = await client.query(
      'SELECT id, team_name, status FROM tournament_teams WHERE (id = $1::varchar OR registration_id = $1::varchar) AND tournament_id = $2::varchar FOR UPDATE',
      [teamId, tournamentId]
    );

    let resolvedTeamId = teamId;
    let teamName = '';
    if (teamRes.rows.length > 0) {
      resolvedTeamId = teamRes.rows[0].id;
      teamName = teamRes.rows[0].team_name;
      if (teamRes.rows[0].status === 'disqualified') {
        throw new Error(`Cannot edit scores for disqualified team "${teamName}".`);
      }
    } else {
      const regRes = await client.query(
        'SELECT id, team_name, user_id, status FROM tournament_registrations WHERE id = $1::varchar AND tournament_id = $2::varchar',
        [teamId, tournamentId]
      );
      if (regRes.rows.length === 0) {
        throw new Error(`Team "${teamId}" not found in this tournament.`);
      }
      const regRow = regRes.rows[0];
      teamName = regRow.team_name;
      const hashPart = crypto.createHash('md5').update(regRow.id + tournamentId).digest('hex').substring(0, 6);
      const newTeamId = 'TEAM-' + regRow.id.substring(0, 8) + '-' + hashPart;
      const insTeam = await client.query(`
        INSERT INTO tournament_teams (id, tournament_id, registration_id, team_name, leader_user_id, status, created_at, updated_at)
        VALUES ($1::varchar, $2::varchar, $3::varchar, $4::varchar, COALESCE($5::varchar, (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)), 'verified', NOW(), NOW())
        ON CONFLICT (tournament_id, team_name) DO UPDATE SET updated_at = NOW()
        RETURNING id
      `, [newTeamId, tournamentId, regRow.id, regRow.team_name, regRow.user_id || actorId]);
      resolvedTeamId = insTeam.rows[0]?.id || newTeamId;
    }

    // Previous data for audit
    const prevLbRes = await client.query(
      'SELECT * FROM tournament_leaderboard WHERE tournament_id = $1::varchar AND team_id = $2::varchar',
      [tournamentId, resolvedTeamId]
    );
    const prevData = prevLbRes.rows[0] || null;

    // Update match results if round is specified
    let updatedMatchResult = false;
    if (roundId) {
      const mrRes = await client.query(`
        SELECT mr.id, mr.match_id
        FROM tournament_match_results mr
        JOIN tournament_matches m ON mr.match_id = m.id
        WHERE mr.tournament_id = $1::varchar AND mr.team_id = $2::varchar AND m.round_id = $3::varchar
        ORDER BY mr.updated_at DESC LIMIT 1 FOR UPDATE
      `, [tournamentId, resolvedTeamId, roundId]);

      if (mrRes.rows.length > 0) {
        const matchResultId = mrRes.rows[0].id;
        await client.query(`
          UPDATE tournament_match_results
          SET placement_points = $1::int, kill_points = $2::int, kills = $3::int, total_points = $4::int,
              wwcd = $5::boolean, status = 'verified', verified_by = $6::varchar, updated_at = NOW()
          WHERE id = $7::varchar
        `, [finalPlacementPts, finalKillPts, finalKills, finalTotalPoints, finalWwcd > 0, actorId, matchResultId]);

        await client.query(`
          INSERT INTO tournament_match_results_audit (id, result_id, action, previous_data, new_data, actor_id, timestamp)
          VALUES (gen_random_uuid()::varchar, $1::varchar, 'update', $2::text, $3::text, $4::varchar, NOW())
        `, [
          matchResultId,
          prevData ? JSON.stringify(prevData) : null,
          JSON.stringify({ placement_points: finalPlacementPts, kill_points: finalKillPts, total_points: finalTotalPoints }),
          actorId,
        ]);
        updatedMatchResult = true;
      }
    }

    // Direct upsert to tournament_leaderboard
    await client.query(`
      INSERT INTO tournament_leaderboard (
        id, tournament_id, team_id, matches_played, total_kills,
        total_kill_points, total_placement_points, total_points,
        wwcd_count, updated_at
      ) VALUES (
        gen_random_uuid()::varchar, $1::varchar, $2::varchar, $3::int, $4::int,
        $5::int, $6::int, $7::int, $8::int, NOW()
      ) ON CONFLICT (tournament_id, team_id) DO UPDATE SET
        matches_played = EXCLUDED.matches_played,
        total_kills = EXCLUDED.total_kills,
        total_kill_points = EXCLUDED.total_kill_points,
        total_placement_points = EXCLUDED.total_placement_points,
        total_points = EXCLUDED.total_points,
        wwcd_count = EXCLUDED.wwcd_count,
        updated_at = NOW()
    `, [
      tournamentId,
      resolvedTeamId,
      finalMatchesPlayed,
      finalKills,
      finalKillPts,
      finalPlacementPts,
      finalTotalPoints,
      finalWwcd,
    ]);

    // Audit log
    await client.query(`
      INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
      VALUES (gen_random_uuid()::varchar, $1::varchar, 'save_district_score', 'scoring', 'team', $2::varchar, $3::text)
    `, [
      actorId,
      resolvedTeamId,
      JSON.stringify({
        tournament_id: tournamentId,
        team_id: resolvedTeamId,
        team_name: teamName,
        round_id: roundId || null,
        district_id: districtId,
        previous: prevData,
        updated: {
          total_points: finalTotalPoints,
          placement_points: finalPlacementPts,
          total_kills: finalKills,
          wwcd_count: finalWwcd,
          matches_played: finalMatchesPlayed,
        },
      }),
    ]);

    savedCount++;
  }

  // 3. Persist district save state in tournament_district_save_states
  try {
    await client.query(`
      INSERT INTO tournament_district_save_states (
        id, tournament_id, round_id, district_id, status, version, saved_by, saved_at
      ) VALUES (
        'DSS-' || gen_random_uuid()::varchar, $1::varchar, $2::varchar, $3::varchar, 'saved', $4::int, $5::varchar, NOW()
      ) ON CONFLICT (tournament_id, round_id, district_id) DO UPDATE SET
        status = 'saved',
        version = EXCLUDED.version,
        saved_by = EXCLUDED.saved_by,
        saved_at = NOW()
    `, [tournamentId, roundId || 'default', districtId, newVersion, actorId]);
  } catch {
    // Non-blocking fallback if unmigrated
  }

  // Also update legacy groups tables for backwards compatibility
  await client.query(`
    UPDATE tournament_groups
    SET scores_saved = true, scores_saved_at = NOW(), scores_status = 'saved'
    WHERE (id = $1::varchar OR district_id = $1::varchar) AND tournament_id = $2::varchar
  `, [districtId, tournamentId]);

  await client.query(`
    UPDATE tournament_registration_groups
    SET scores_saved = true, scores_saved_at = NOW(), scores_status = 'saved'
    WHERE id = $1::varchar AND tournament_id = $2::varchar
  `, [districtId, tournamentId]);

  return {
    success: true,
    tournament_id: tournamentId,
    round_id: roundId,
    district_id: districtId,
    saved_count: savedCount,
    version: newVersion,
    scores_status: 'saved',
    scores_saved_at: new Date().toISOString(),
  };
}

/**
 * Fetch overall tournament standings using the single authoritative ranking engine.
 */
export async function calculateRankings(pool, tournamentId) {
  const eligibleTeams = await getEligibleTournamentTeams(pool, tournamentId, { roundId: null, isFirstRound: false });
  return sortAndRank(eligibleTeams);
}

/**
 * Allows authorized administrators and tournament organizers to enter or edit a team's points individually.
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await saveDistrictScores(client, {
      tournamentId,
      roundId: round_id || 'default',
      districtId: 'individual-edit',
      teamScores: [
        {
          team_id: teamId,
          placement_points,
          total_kills: total_kills != null ? total_kills : kill_points,
          wwcd_count,
          matches_played,
        },
      ],
      expectedVersion: null,
      actorId,
    });
    await client.query('COMMIT');
    return {
      success: true,
      tournament_id: tournamentId,
      team_id: teamId,
      ...result,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}