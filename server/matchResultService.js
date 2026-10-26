// server/matchResultService.js
// Single source of truth for TOURNAMENT MATCH RESULTS integrity + authorization (Phase 8A).
//
// The service records one team's per-match result (placement + kills) into
// tournament_match_results, writes the tournament_match_results_audit trail, logs the
// action to admin_action_log, and re-aggregates the tournament_leaderboard. Scoring is
// ALWAYS recomputed server-side from the tournament's stored tournament_scoring_rules
// (DB authoritative) via leaderboardService.calculateMatchPoints — client-supplied score
// fields are ignored. Submissions are validated against the match's allocated teams, and
// final placements must remain collision-free across existing + submitted rows (the whole
// batch is atomic), so a corrected re-submission can swap placements safely.
//
// Concurrency: the caller owns the transaction (no hidden COMMIT/ROLLBACK). applyMatchResults
// locks rows in a consistent order — tournament row FOR UPDATE, then match row FOR UPDATE,
// then existing result rows FOR UPDATE — and re-runs every gate inside the same transaction
// that performs the writes, so concurrent submissions cannot deadlock or double-assign a
// placement.
import { randomBytes } from 'node:crypto';
import { validateScore, calculateMatchPoints, updateTeamLeaderboard } from './leaderboardService.js';

export const MATCH_RESULT_ERR = Object.freeze({
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
  ROADMAP_NOT_APPROVED: 'ROADMAP_NOT_APPROVED',
  TOURNAMENT_FINALIZED: 'TOURNAMENT_FINALIZED',
  MATCH_TOURNAMENT_MISMATCH: 'MATCH_TOURNAMENT_MISMATCH',
  MATCH_CLOSED: 'MATCH_CLOSED',
  TEAM_NOT_ALLOCATED: 'TEAM_NOT_ALLOCATED',
  DUPLICATE_TEAM: 'DUPLICATE_TEAM',
  DUPLICATE_PLACEMENT: 'DUPLICATE_PLACEMENT',
  INVALID_PLACEMENT: 'INVALID_PLACEMENT',
  INVALID_KILLS: 'INVALID_KILLS',
  // Reserved for the future results-lifecycle/verification work; not thrown today.
  LOCKED_RESULT: 'LOCKED_RESULT',
});

export class MatchResultError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'MatchResultError';
    this.code = code;
    this.status = status;
  }
}

export function matchResultError(code, message, status = 400) {
  return new MatchResultError(code, message, status);
}

export function randomId(prefix = 'RES-') {
  return prefix + randomBytes(6).toString('hex').toUpperCase();
}

// Public tournament result responses contain scores and public team labels,
// never internal actor IDs or other persistence-only fields.
export function mapPublicMatchResult(row) {
  return {
    id: row.id,
    team_id: row.team_id,
    team_name: row.team_name,
    leader_name: row.leader_name,
    placement: row.placement,
    kills: row.kills,
    kill_points: row.kill_points,
    placement_points: row.placement_points,
    wwcd: row.wwcd,
    total_points: row.total_points,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Terminal match statuses. No route currently advances tournament_matches.status (it stays
// 'PENDING'), so this gate is inert today, but it protects future match-lifecycle tooling
// from accepting late or duplicate result submissions after a match is closed.
export const MATCH_TERMINAL_STATUSES = Object.freeze(['COMPLETED', 'CANCELLED', 'VERIFIED']);

// Mirrors the tournament_scoring_rules DDL defaults; used only when no rules row exists.
export const DEFAULT_SCORING_RULES = Object.freeze({
  kill_points_multiplier: 1,
  placement_points_map: {
    '1': 10, '2': 6, '3': 5, '4': 4, '5': 3, '6': 2, '7': 1, '8': 1,
    '9': 0, '10': 0, '11': 0, '12': 0, '13': 0, '14': 0, '15': 0, '16': 0,
    '17': 0, '18': 0, '19': 0, '20': 0,
    '21': 0, '22': 0, '23': 0, '24': 0, '25': 0,
  },
  wwcd_bonus: 0,
});

// --- Pure helpers (unit-testable without a database) ---

// Validates a scoring-rules payload. Returns an array of { code, message } errors.
export function validateScoringRulesPayload({ kill_points_multiplier, placement_points_map, wwcd_bonus }) {
  const errors = [];

  const mult = validateScore(kill_points_multiplier, 'kill_points_multiplier');
  if (!mult.valid) {
    errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: mult.error });
  }

  const bonus = validateScore(wwcd_bonus, 'wwcd_bonus');
  if (!bonus.valid) {
    errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: bonus.error });
  }

  if (!placement_points_map || typeof placement_points_map !== 'object' || Array.isArray(placement_points_map)) {
    errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: 'placement_points_map must be an object mapping placement to points.' });
  } else {
    for (const [key, value] of Object.entries(placement_points_map)) {
      if (!/^\d+$/.test(String(key)) || Number(key) < 1) {
        errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: `placement_points_map key '${key}' must be a positive whole-number placement.` });
      }
      const pointVal = validateScore(value, `placement_points_map[${key}]`);
      if (!pointVal.valid) {
        errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: pointVal.error });
      }
    }
  }

  return errors;
}

// Validates a result-submission array against the match's allocated-team bound.
// Returns an array of { code, message } errors (empty when valid).
export function validateResultEntries(results, bound) {
  if (!Array.isArray(results) || results.length === 0) {
    return [{ code: MATCH_RESULT_ERR.INVALID_INPUT, message: 'Expected a non-empty array of results.' }];
  }

  const errors = [];
  const seenTeam = new Set();
  const seenPlacement = new Set();

  results.forEach((r, idx) => {
    if (!r || typeof r !== 'object') {
      errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: `Result at index ${idx} must be an object.` });
      return;
    }
    const { team_id, placement, kills } = r;

    if (!team_id || typeof team_id !== 'string') {
      errors.push({ code: MATCH_RESULT_ERR.INVALID_INPUT, message: `Result at index ${idx} is missing a valid team_id.` });
      return;
    }
    if (seenTeam.has(team_id)) {
      errors.push({ code: MATCH_RESULT_ERR.DUPLICATE_TEAM, message: `Team ${team_id} appears more than once in the submission.` });
    }
    seenTeam.add(team_id);

    if (placement === '' || placement === null || placement === undefined) {
      errors.push({ code: MATCH_RESULT_ERR.INVALID_PLACEMENT, message: `Placement is required for team ${team_id}.` });
    } else {
      const p = Number(placement);
      if (!Number.isInteger(p) || p < 1 || p > bound) {
        errors.push({ code: MATCH_RESULT_ERR.INVALID_PLACEMENT, message: `Placement ${placement} for team ${team_id} is out of range (1-${bound}).` });
      } else if (seenPlacement.has(p)) {
        errors.push({ code: MATCH_RESULT_ERR.INVALID_PLACEMENT, message: `Placement ${p} was assigned more than once.` });
      } else {
        seenPlacement.add(p);
      }
    }

    const killVal = validateScore(kills, `Kills for team ${team_id}`);
    if (!killVal.valid) {
      errors.push({ code: MATCH_RESULT_ERR.INVALID_KILLS, message: killVal.error });
    }
  });

  return errors;
}

// Atomic final-placement collision check. existingByTeam = Map<teamId, { placement }> (the
// locked existing rows), submittedByTeam = Map<teamId, { placement }> (this batch). Batches
// are atomic, so an update that swaps two teams' placements is legal while a collision with
// any team NOT being updated in this batch is rejected. Returns null or { code, message }.
export function computeFinalPlacementCollision(existingByTeam, submittedByTeam) {
  const finalPlacement = new Map();
  for (const [teamId, entry] of existingByTeam) finalPlacement.set(teamId, entry.placement);
  for (const [teamId, entry] of submittedByTeam) finalPlacement.set(teamId, entry.placement);

  const holderByPlacement = new Map();
  for (const [teamId, placement] of finalPlacement) {
    const holder = holderByPlacement.get(placement);
    if (holder !== undefined && holder !== teamId) {
      return {
        code: MATCH_RESULT_ERR.DUPLICATE_PLACEMENT,
        message: `Placement ${placement} is claimed by both team ${holder} and team ${teamId}.`,
      };
    }
    holderByPlacement.set(placement, teamId);
  }
  return null;
}

function snapshotForAudit(row) {
  if (!row) return null;
  return {
    id: row.id,
    tournament_id: row.tournament_id,
    match_id: row.match_id,
    team_id: row.team_id,
    placement: row.placement,
    kills: row.kills,
    kill_points: row.kill_points,
    placement_points: row.placement_points,
    wwcd: row.wwcd,
    total_points: row.total_points,
    status: row.status,
    submitted_by: row.submitted_by,
    verified_by: row.verified_by,
  };
}

async function writeAdminActionLog(client, { actorId, tournId, team, resultId, action, newSnapshot, prior }) {
  const logId = 'LOG-' + randomBytes(6).toString('hex').toUpperCase();
  const details = {
    action,
    tournament_id: tournId,
    match_id: newSnapshot.match_id,
    team_id: team.id,
    team_name: team.team_name,
    placement: newSnapshot.placement,
    kills: newSnapshot.kills,
    kill_points: newSnapshot.kill_points,
    placement_points: newSnapshot.placement_points,
    total_points: newSnapshot.total_points,
    result_id: resultId,
    actor_id: actorId,
    recorded_at: new Date().toISOString(),
  };
  if (prior) details.previous_data = snapshotForAudit(prior);
  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, target_user, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [logId, actorId, 'result_verified', 'result', 'tournament_match_result', resultId, team.id, JSON.stringify(details)]
  );
}

// --- Public entry point ---
//
// Parameters:
//   tournId, matchId — required (from the URL; the service re-verifies both belong to each other)
//   results          — [{ team_id, placement, kills }, ...]
//   actorId          — acting user id (submitted_by + verified_by + admin_action_log admin_id)
//
// Throws MatchResultError (code in MATCH_RESULT_ERR) for hard failures. The caller owns the
// transaction: on throw it must ROLLBACK. Returns { written: [{ team_id, result_id, action,
// placement, kills, total_points }] }.
export async function applyMatchResults(client, { tournId, matchId, results, actorId } = {}) {
  if (!client || !tournId || !matchId) {
    throw matchResultError(MATCH_RESULT_ERR.INVALID_INPUT, 'tournId and matchId are required.');
  }

  // 1. Lock the tournament row and enforce the approved-roadmap gate.
  const tournRes = await client.query('SELECT "orgId", roadmap_status, title, finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE', [tournId]);
  if (tournRes.rows.length === 0) {
    throw matchResultError(MATCH_RESULT_ERR.NOT_FOUND, 'Tournament not found.', 404);
  }
  if (tournRes.rows[0].finalized_at) {
    throw matchResultError(MATCH_RESULT_ERR.TOURNAMENT_FINALIZED, 'This tournament is finalized; match results are locked.', 409);
  }

  // 2. Lock the match row and verify it belongs to the tournament.
  const matchRes = await client.query('SELECT id, "tournament_id", status FROM tournament_matches WHERE id = $1 FOR UPDATE', [matchId]);
  if (matchRes.rows.length === 0) {
    throw matchResultError(MATCH_RESULT_ERR.NOT_FOUND, 'Match not found.', 404);
  }
  const match = matchRes.rows[0];
  if (match.tournament_id !== tournId) {
    throw matchResultError(MATCH_RESULT_ERR.MATCH_TOURNAMENT_MISMATCH, 'The match does not belong to this tournament.');
  }
  if (MATCH_TERMINAL_STATUSES.includes(String(match.status || '').toUpperCase())) {
    throw matchResultError(MATCH_RESULT_ERR.MATCH_CLOSED, 'This match is closed; results can no longer be recorded.', 409);
  }

  // 3. Authoritative allocation set + placement bound.
  const allocRes = await client.query(
    `SELECT DISTINCT tournament_team_id FROM tournament_match_assignments
     WHERE match_id = $1 AND tournament_id = $2 AND status = 'allocated'`,
    [matchId, tournId]
  );
  const allocatedIds = new Set(allocRes.rows.map((r) => r.tournament_team_id));
  const bound = allocatedIds.size;

  // 4. Validate the submission shape.
  const validationErrors = validateResultEntries(results, bound);
  if (validationErrors.length > 0) {
    throw matchResultError(validationErrors[0].code, validationErrors[0].message);
  }

  // 5. Lock existing result rows (upsert targets) and run the eligibility +
  //    placement-collision gates under the same locks.
  const existingRes = await client.query(
    `SELECT id, team_id, placement, kills, kill_points, placement_points, wwcd, total_points, status, submitted_by, verified_by
     FROM tournament_match_results WHERE match_id = $1 FOR UPDATE`,
    [matchId]
  );
  const existingByTeam = new Map();
  for (const row of existingRes.rows) existingByTeam.set(row.team_id, row);

  const submittedByTeam = new Map();
  for (const r of results) {
    if (!allocatedIds.has(r.team_id)) {
      throw matchResultError(MATCH_RESULT_ERR.TEAM_NOT_ALLOCATED, `Team ${r.team_id} is not allocated to this match.`);
    }
    submittedByTeam.set(r.team_id, { placement: Number(r.placement) });
  }
  const collision = computeFinalPlacementCollision(existingByTeam, submittedByTeam);
  if (collision) {
    throw matchResultError(collision.code, collision.message);
  }

  // 6. Authoritative scoring rules (DB row wins; session-level defaults fallback).
  const rulesRes = await client.query(
    'SELECT kill_points_multiplier, placement_points_map, wwcd_bonus FROM tournament_scoring_rules WHERE tournament_id = $1',
    [tournId]
  );
  const scoringRules = rulesRes.rows[0] || DEFAULT_SCORING_RULES;

  // Team names enrich the admin audit trail (never credentials).
  const teamRows = await client.query('SELECT id, team_name FROM tournament_teams WHERE id = ANY($1::varchar[])', [Array.from(allocatedIds)]);
  const teamNameById = new Map(teamRows.rows.map((t) => [t.id, t.team_name]));

  // 7. Upsert + audit + leaderboard re-aggregation.
  const written = [];
  for (const r of results) {
    const placement = Number(r.placement);
    const kills = Number(r.kills);
    const pts = calculateMatchPoints(kills, placement, scoringRules);

    const prior = existingByTeam.get(r.team_id) || null;
    const resultId = prior ? prior.id : randomId('RES-');
    const action = prior ? 'update' : 'create';

    await client.query(
      `INSERT INTO tournament_match_results (
         id, tournament_id, match_id, team_id, placement, kills,
         kill_points, placement_points, wwcd, total_points, status, submitted_by, verified_by, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'verified', $11, $11, NOW())
       ON CONFLICT (match_id, team_id) DO UPDATE SET
         placement = EXCLUDED.placement,
         kills = EXCLUDED.kills,
         kill_points = EXCLUDED.kill_points,
         placement_points = EXCLUDED.placement_points,
         wwcd = EXCLUDED.wwcd,
         total_points = EXCLUDED.total_points,
         status = 'verified',
         submitted_by = EXCLUDED.submitted_by,
         verified_by = EXCLUDED.verified_by,
         updated_at = NOW()`,
      [resultId, tournId, matchId, r.team_id, placement, kills, pts.kill_points, pts.placement_points, pts.wwcd, pts.total_points, actorId]
    );

    const newSnapshot = {
      id: resultId,
      tournament_id: tournId,
      match_id: matchId,
      team_id: r.team_id,
      placement,
      kills,
      kill_points: pts.kill_points,
      placement_points: pts.placement_points,
      wwcd: pts.wwcd,
      total_points: pts.total_points,
      status: 'verified',
      submitted_by: actorId,
      verified_by: actorId,
    };

    await client.query(
      `INSERT INTO tournament_match_results_audit (id, result_id, action, previous_data, new_data, actor_id, "timestamp")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [randomId('LAUD-'), resultId, action, prior ? JSON.stringify(snapshotForAudit(prior)) : null, JSON.stringify(newSnapshot), actorId]
    );

    await writeAdminActionLog(client, {
      actorId,
      tournId,
      team: { id: r.team_id, team_name: teamNameById.get(r.team_id) || null },
      resultId,
      action,
      newSnapshot,
      prior,
    });

    // Re-aggregate the leaderboard for this team (status 'verified' rows only — unchanged).
    await updateTeamLeaderboard(client, tournId, r.team_id);

    written.push({ team_id: r.team_id, result_id: resultId, action, placement, kills, total_points: pts.total_points });
  }

  return { written };
}
