// server/teamDisqualificationService.js
// Hardened Team Disqualification and Reinstatement Service (Phase 5)
// Allows tournament organizers and admins to disqualify or reinstate teams.
// Guarantees:
// - Existing match results and points remain untouched; only cutoff eligibility changes.
// - Reinstate restores the status the team had before disqualification (from column or audit log).
// - Re-run warnings if team was already advanced into subsequent rounds.
// - Full audit logging in admin_action_log.
// - Strict authorization (403 for non-owners).

import crypto from 'crypto';
import { isTournamentOrganizer } from './tournamentAuth.js';

export const TEAM_STATUS = Object.freeze({
  DISQUALIFIED: 'disqualified',
  ACTIVE: 'active',
  VERIFIED: 'verified',
  REINSTATED: 'reinstated',
});

function randomId(prefix = 'LOG-') {
  return `${prefix}${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Updates a team's qualification status (disqualify or reinstate).
 *
 * @param {object} poolOrClient - PostgreSQL pool or client
 * @param {object} params
 * @param {string} params.tournamentId
 * @param {string} params.teamId
 * @param {string} params.status - 'disqualified', 'reinstate' / 'reinstated', or 'active' / 'verified'
 * @param {string} [params.reason] - Optional reason for audit log
 * @param {string} [params.actorId] - User ID performing the action
 * @param {boolean} [params.isAdmin] - Whether the actor is a system admin
 */
export async function updateTeamQualificationStatus(poolOrClient, {
  tournamentId,
  teamId,
  status,
  reason = '',
  actorId = null,
  isAdmin = false,
}) {
  if (!poolOrClient || !tournamentId || !teamId || !status) {
    const err = new Error('tournamentId, teamId, and status are required.');
    err.code = 'INVALID_INPUT';
    err.status = 400;
    throw err;
  }

  const normalizedStatus = String(status).trim().toLowerCase();
  if (!['disqualified', 'active', 'verified', 'reinstate', 'reinstated'].includes(normalizedStatus)) {
    const err = new Error(`Invalid status "${status}". Allowed values: disqualified, active, verified, reinstate.`);
    err.code = 'INVALID_STATUS';
    err.status = 400;
    throw err;
  }

  const isPool = typeof poolOrClient.connect === 'function';
  const client = isPool ? await poolOrClient.connect() : poolOrClient;

  try {
    if (isPool) await client.query('BEGIN');

    // 1. Lock and verify tournament
    const tournRes = await client.query(
      'SELECT id, "orgId", roadmap_status, finalized_at FROM tournaments WHERE id = $1 FOR UPDATE',
      [tournamentId]
    );

    if (tournRes.rows.length === 0) {
      const err = new Error('Tournament not found.');
      err.code = 'TOURNAMENT_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const tournament = tournRes.rows[0];

    // 2. Authorization check: organizer or admin only
    const actorUser = { id: actorId, role: isAdmin ? 'admin' : 'user' };
    if (!isTournamentOrganizer(actorUser, tournament)) {
      const err = new Error('Only the tournament organizer or admin can modify team qualification status.');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }

    if (tournament.finalized_at) {
      const err = new Error('Tournament is finalized; team statuses are locked.');
      err.code = 'TOURNAMENT_FINALIZED';
      err.status = 409;
      throw err;
    }

    // 3. Lock and fetch team (attempting status_before_dq if column exists)
    let team;
    let hasStatusBeforeDqCol = true;
    try {
      const teamRes = await client.query(
        'SELECT id, tournament_id, team_name, status, status_before_dq, leader_user_id FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
        [teamId, tournamentId]
      );
      if (teamRes.rows.length === 0) {
        const err = new Error(`Team "${teamId}" not found in tournament.`);
        err.code = 'TEAM_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      team = teamRes.rows[0];
    } catch (colErr) {
      if (colErr.code === 'TEAM_NOT_FOUND') throw colErr;
      hasStatusBeforeDqCol = false;
      const teamRes = await client.query(
        'SELECT id, tournament_id, team_name, status, leader_user_id FROM tournament_teams WHERE id = $1 AND tournament_id = $2 FOR UPDATE',
        [teamId, tournamentId]
      );
      if (teamRes.rows.length === 0) {
        const err = new Error(`Team "${teamId}" not found in tournament.`);
        err.code = 'TEAM_NOT_FOUND';
        err.status = 404;
        throw err;
      }
      team = teamRes.rows[0];
    }

    const previousStatus = team.status;
    const isDisqualify = normalizedStatus === 'disqualified';
    let finalStatus = normalizedStatus;

    // 4. Update team status
    // - On disqualify: save prior status in status_before_dq
    // - On reinstate: restore status_before_dq (or fallback to audit log), NOT a hardcoded 'verified'
    if (isDisqualify) {
      finalStatus = 'disqualified';
      const statusToSave = previousStatus !== 'disqualified' ? previousStatus : (team.status_before_dq || 'verified');
      if (hasStatusBeforeDqCol) {
        await client.query(
          'UPDATE tournament_teams SET status = $1, status_before_dq = $2, updated_at = NOW() WHERE id = $3 AND tournament_id = $4',
          ['disqualified', statusToSave, teamId, tournamentId]
        );
      } else {
        await client.query(
          'UPDATE tournament_teams SET status = $1, updated_at = NOW() WHERE id = $2 AND tournament_id = $3',
          ['disqualified', teamId, tournamentId]
        );
      }
    } else {
      let restoredStatus = team.status_before_dq;

      if (!restoredStatus || restoredStatus === 'disqualified') {
        // Fallback: inspect audit log for previous status
        try {
          const logRes = await client.query(`
            SELECT details FROM admin_action_log
            WHERE target_id = $1 AND action_type = 'team_disqualified'
            ORDER BY created_at DESC LIMIT 1
          `, [teamId]);
          if (logRes.rows && logRes.rows.length > 0) {
            const rawDetails = logRes.rows[0].details;
            const parsedDetails = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails;
            if (parsedDetails && parsedDetails.previous_status && parsedDetails.previous_status !== 'disqualified') {
              restoredStatus = parsedDetails.previous_status;
            }
          }
        } catch {
          // ignore log lookup error
        }
      }

      finalStatus = restoredStatus || 'verified';

      if (hasStatusBeforeDqCol) {
        await client.query(
          'UPDATE tournament_teams SET status = $1, status_before_dq = NULL, updated_at = NOW() WHERE id = $2 AND tournament_id = $3',
          [finalStatus, teamId, tournamentId]
        );
      } else {
        await client.query(
          'UPDATE tournament_teams SET status = $1, updated_at = NOW() WHERE id = $2 AND tournament_id = $3',
          [finalStatus, teamId, tournamentId]
        );
      }
    }

    // 5. Inspect target round advancement assignments (source = 'advancement')
    const advAssignmentsRes = await client.query(`
      SELECT DISTINCT r.id AS round_id, r.round_number, r.name AS round_name
      FROM tournament_match_assignments a
      JOIN tournament_matches m ON a.match_id = m.id
      JOIN tournament_rounds r ON m.round_id = r.id
      WHERE a.tournament_team_id = $1
        AND a.tournament_id = $2
        AND a.source = 'advancement'
      ORDER BY r.round_number ASC
    `, [teamId, tournamentId]);

    const targetRounds = [];
    let warning = null;
    let targetHasResults = false;

    for (const r of advAssignmentsRes.rows) {
      const resultsCheck = await client.query(`
        SELECT 1
        FROM tournament_match_results mr
        JOIN tournament_matches m ON mr.match_id = m.id
        WHERE m.round_id = $1 AND m.tournament_id = $2
        LIMIT 1
      `, [r.round_id, tournamentId]);

      const roundHasResults = resultsCheck.rows.length > 0;
      if (roundHasResults) targetHasResults = true;

      targetRounds.push({
        round_id: r.round_id,
        round_number: r.round_number,
        round_name: r.round_name,
        has_results: roundHasResults,
      });
    }

    if (isDisqualify && targetRounds.length > 0) {
      const roundNames = targetRounds.map((r) => `Round ${r.round_number} (${r.round_name})`).join(', ');
      if (targetHasResults) {
        warning = `This team was already advanced into ${roundNames}. Target round already has recorded match results and is locked. Past assignments remain in place.`;
      } else {
        warning = `This team was already advanced into ${roundNames}. Advancing assignments have not been removed automatically. Please re-run round qualification to select replacement qualifiers.`;
      }
    }

    // 6. Audit log entry in admin_action_log
    const logId = randomId('AUD-');
    const actionType = isDisqualify ? 'team_disqualified' : 'team_reinstated';
    await client.query(`
      INSERT INTO admin_action_log (id, admin_id, action_type, target_type, target_id, details)
      VALUES ($1, $2, $3, 'tournament_team', $4, $5)
    `, [
      logId,
      actorId,
      actionType,
      teamId,
      JSON.stringify({
        tournament_id: tournamentId,
        team_name: team.team_name,
        previous_status: previousStatus,
        new_status: finalStatus,
        restored_status: isDisqualify ? null : finalStatus,
        reason: reason || null,
        target_rounds: targetRounds,
        warning: warning || null,
      }),
    ]);

    if (isPool) await client.query('COMMIT');

    return {
      success: true,
      team_id: team.id,
      team_name: team.team_name,
      previous_status: previousStatus,
      status: finalStatus,
      restored_status: isDisqualify ? null : finalStatus,
      reason: reason || null,
      target_rounds: targetRounds,
      warning,
      target_has_results: targetHasResults,
    };
  } catch (err) {
    if (isPool) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (isPool) client.release();
  }
}
