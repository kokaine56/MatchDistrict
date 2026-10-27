// server/leaderboard/routes.js
import crypto from 'crypto';
import {
  computeDistrictStandings,
  computeRoundStandings,
} from './standingsService.js';
import {
  getDistrictRoster,
  getMatchRoster,
} from './rosterService.js';
import {
  getResultsForMatches,
} from './resultsService.js';
import {
  getDistrictSaveState,
  saveDistrictScores,
  DistrictSaveConflictError,
  DistrictValidationError,
} from './districtSaveService.js';
import {
  checkTournamentOrganizerAccess,
  checkTournamentOrganizerOrStaffAccess,
  isTournamentOrganizer,
} from '../tournamentAuth.js';
import { getAuthUser } from '../userUtils.js';

function makeErrorRef() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error('Request payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Dispatches Leaderboard v2 API routes under /api/tournaments/:id/leaderboard
 *
 * @param {object} req - HTTP request
 * @param {object} res - HTTP response
 * @param {object} pool - PostgreSQL connection pool
 * @returns {Promise<boolean>} True if route was handled, false otherwise
 */
export async function handleLeaderboardRoutes(req, res, pool) {
  const url = req.url || '';
  if (!url.startsWith('/api/tournaments/')) {
    return false;
  }

  // Matches /api/tournaments/:id/leaderboard/...
  const leaderboardPrefixMatch = url.match(/^\/api\/tournaments\/([^/]+)\/leaderboard(?:\/([^\??]*))?(?:\?(.*))?$/);
  if (!leaderboardPrefixMatch) {
    return false;
  }

  const tournamentId = decodeURIComponent(leaderboardPrefixMatch[1]);
  const subPath = leaderboardPrefixMatch[2] || '';
  const queryString = leaderboardPrefixMatch[3] || '';
  const queryParams = new URLSearchParams(queryString);

  // Fetch tournament record once
  let tournament = null;
  try {
    const tRes = await pool.query(
      `SELECT id, "orgId", status, finalized_at, "slotsTotal", roadmap_status
       FROM tournaments
       WHERE id = $1::varchar
       LIMIT 1`,
      [tournamentId]
    );
    if (tRes.rows.length === 0) {
      sendJson(res, 404, { success: false, error: 'NOT_FOUND', message: 'Tournament not found.' });
      return true;
    }
    tournament = tRes.rows[0];
  } catch (err) {
    const ref = makeErrorRef();
    console.error(`[Leaderboard] Error fetching tournament ${tournamentId} (Ref: ${ref}):`, err);
    sendJson(res, 500, { success: false, error: 'SERVER_ERROR', ref, message: `Could not load tournament. (Ref: ${ref})` });
    return true;
  }

  const authUser = getAuthUser(req);
  const isOrganizer = isTournamentOrganizer(authUser, tournament);

  // 1. GET /api/tournaments/:id/leaderboard/structure
  if (req.method === 'GET' && subPath === 'structure') {
    try {
      const roundsRes = await pool.query(
        `SELECT id, round_number, name, status, teams_advancing,
                advancement_type, teams_advancing_per_district, round_type
         FROM tournament_rounds
         WHERE tournament_id = $1::varchar
         ORDER BY round_number ASC, id ASC`,
        [tournamentId]
      );

      const rounds = [];
      const warnings = [];
      const slotsTotal = Number(tournament.slotsTotal) || 64;
      const teamsPerGroupDefault = 16;
      const expectedR1Districts = Math.max(1, Math.ceil(slotsTotal / teamsPerGroupDefault));

      for (const rnd of roundsRes.rows) {
        const groupsRes = await pool.query(
          `SELECT g.id, g.group_name, g.sequence, g.display_order, g.district_id
           FROM tournament_groups g
           WHERE g.round_id = $1::varchar AND g.tournament_id = $2::varchar
           ORDER BY COALESCE(g.display_order, g.sequence, 0) ASC, g.id ASC`,
          [rnd.id, tournamentId]
        );

        const districts = [];
        for (const g of groupsRes.rows) {
          const distId = g.district_id || g.id;
          const saveState = await getDistrictSaveState(pool, tournamentId, rnd.id, distId);
          const rData = await getDistrictRoster(pool, rnd.id, distId);

          districts.push({
            id: distId,
            group_id: g.id,
            name: g.group_name,
            team_count: rData.roster.length,
            matches: rData.matches,
            save_state: saveState,
          });
        }

        // P2: Capacity plan check for Round 1
        if (Number(rnd.round_number) === 1 && districts.length > 0 && districts.length !== expectedR1Districts) {
          warnings.push({
            round_id: rnd.id,
            round_number: rnd.round_number,
            type: 'district_capacity_mismatch',
            message: `The roadmap has ${districts.length} districts for Round 1, but the capacity plan expects ${expectedR1Districts} districts (${slotsTotal} teams / ${teamsPerGroupDefault} per district).`,
            link: `/tournaments/${tournamentId}/roadmap`,
          });
        }

        // Publication state for this round
        let publicationState = 'draft';
        let publishedAt = null;
        let publishedVersion = null;

        try {
          const pubRes = await pool.query(
            `SELECT version, published_at, is_active
             FROM tournament_leaderboard_publications
             WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND is_active = true
             ORDER BY version DESC LIMIT 1`,
            [tournamentId, rnd.id]
          );
          if (pubRes.rows.length > 0) {
            publicationState = 'published';
            publishedAt = pubRes.rows[0].published_at;
            publishedVersion = pubRes.rows[0].version;
          }
        } catch {
          // Non-blocking
        }

        rounds.push({
          id: rnd.id,
          round_number: rnd.round_number,
          name: rnd.name,
          status: rnd.status,
          round_type: rnd.round_type,
          advancement_type: rnd.advancement_type || (districts.length > 0 ? 'per_district' : 'overall'),
          teams_advancing: rnd.teams_advancing,
          teams_advancing_per_district: rnd.teams_advancing_per_district,
          districts,
          publication_state: publicationState,
          published_at: publishedAt,
          published_version: publishedVersion,
        });
      }

      sendJson(res, 200, {
        success: true,
        tournament_id: tournamentId,
        is_organizer: isOrganizer,
        rounds,
        warnings,
      });
      return true;
    } catch (err) {
      const ref = makeErrorRef();
      console.error(`[Leaderboard Structure] Error (Ref: ${ref}):`, err);
      sendJson(res, 500, { success: false, error: 'STRUCTURE_LOAD_ERROR', ref, message: `Could not load leaderboard structure. (Ref: ${ref})` });
      return true;
    }
  }

  // 2. GET /api/tournaments/:id/leaderboard/standings?roundId=...&districtId=...
  if (req.method === 'GET' && (subPath === 'standings' || subPath === '')) {
    try {
      const roundId = queryParams.get('roundId') || queryParams.get('round');
      const districtId = queryParams.get('districtId') || queryParams.get('district');

      let targetRoundId = roundId;
      if (!targetRoundId) {
        // Default to Round 1
        const rRes = await pool.query(
          `SELECT id FROM tournament_rounds WHERE tournament_id = $1::varchar ORDER BY round_number ASC LIMIT 1`,
          [tournamentId]
        );
        if (rRes.rows.length === 0) {
          sendJson(res, 200, { success: true, standings: [], message: 'No rounds configured.' });
          return true;
        }
        targetRoundId = rRes.rows[0].id;
      }

      // Check if participant is viewing unpublished results (P6 / participant view isolation)
      if (!isOrganizer) {
        try {
          const pubCheck = await pool.query(
            `SELECT snapshot_data, published_at, version
             FROM tournament_leaderboard_publications
             WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND is_active = true
             ORDER BY version DESC LIMIT 1`,
            [tournamentId, targetRoundId]
          );

          if (pubCheck.rows.length === 0) {
            sendJson(res, 200, {
              success: true,
              is_published: false,
              standings: [],
              message: 'Results not published yet',
            });
            return true;
          }

          const snap = pubCheck.rows[0];
          const snapData = typeof snap.snapshot_data === 'string'
            ? JSON.parse(snap.snapshot_data)
            : snap.snapshot_data;

          // If participant requested specific district, filter snapshot standings
          let returnStandings = snapData.standings || [];
          if (districtId && districtId !== 'overall') {
            const distSummary = (snapData.district_summaries || []).find((d) => d.district_id === districtId);
            returnStandings = distSummary ? distSummary.standings : returnStandings.filter((t) => t.source_district_id === districtId);
          }

          sendJson(res, 200, {
            success: true,
            is_published: true,
            published_at: snap.published_at,
            published_version: snap.version,
            standings: returnStandings,
          });
          return true;
        } catch {
          // If query fails, fall through
        }
      }

      // Organizer View: live computed standings (P5)
      if (districtId && districtId !== 'overall') {
        const districtResult = await computeDistrictStandings(pool, {
          tournamentId,
          roundId: targetRoundId,
          districtId,
        });

        sendJson(res, 200, {
          success: true,
          scope: 'district',
          round_id: targetRoundId,
          district_id: districtId,
          standings: districtResult.standings,
          matches: districtResult.matches,
          discrepancies: districtResult.discrepancies,
        });
        return true;
      }

      const roundResult = await computeRoundStandings(pool, {
        tournamentId,
        roundId: targetRoundId,
      });

      sendJson(res, 200, {
        success: true,
        scope: 'overall',
        round_id: targetRoundId,
        standings: roundResult.standings,
        district_summaries: roundResult.district_summaries,
        discrepancies: roundResult.discrepancies,
      });
      return true;
    } catch (err) {
      const ref = makeErrorRef();
      console.error(`[Leaderboard Standings] Error (Ref: ${ref}):`, err);
      sendJson(res, 500, { success: false, error: 'STANDINGS_COMPUTE_ERROR', ref, message: `Could not load standings. (Ref: ${ref})` });
      return true;
    }
  }

  // 3. GET /api/tournaments/:id/leaderboard/editor?roundId=...&districtId=...
  if (req.method === 'GET' && subPath === 'editor') {
    try {
      const access = await checkTournamentOrganizerOrStaffAccess(authUser, tournament, pool, 'score_entry');
      if (!access.authorized) {
        sendJson(res, access.statusCode, { success: false, error: access.error, message: access.message });
        return true;
      }

      const roundId = queryParams.get('roundId');
      const districtId = queryParams.get('districtId');

      if (!roundId || !districtId) {
        sendJson(res, 400, { success: false, error: 'MISSING_PARAMS', message: 'roundId and districtId are required.' });
        return true;
      }

      const districtData = await getDistrictRoster(pool, roundId, districtId);
      const districtMatches = districtData.matches || [];
      const matchIds = districtMatches.map((m) => m.id);

      const resultsByMatch = await getResultsForMatches(pool, matchIds, tournamentId);
      const saveState = await getDistrictSaveState(pool, tournamentId, roundId, districtId);

      // Matches with rosters in SLOT ORDER (Design Principle P3 & Spec B2)
      const matchesWithRosters = [];
      for (const m of districtMatches) {
        const matchRosterData = await getMatchRoster(pool, m.id);
        const matchResults = resultsByMatch.get(m.id) || new Map();

        const rosterRows = matchRosterData.roster.map((team) => {
          const res = matchResults.get(team.team_id) || null;
          return {
            slot_number: team.slot_number,
            team_id: team.team_id,
            team_name: team.team_name,
            captain_name: team.captain_name,
            status: team.status,
            is_disqualified: team.is_disqualified,
            placement: res ? res.placement : null,
            kills: res ? res.kills : null,
            kill_points: res ? res.kill_points : null,
            placement_points: res ? res.placement_points : null,
            total_points: res ? res.total_points : null,
          };
        });

        matchesWithRosters.push({
          match_id: m.id,
          match_number: m.match_number,
          capacity: m.capacity,
          roster: rosterRows,
          discrepancies: matchRosterData.discrepancies,
        });
      }

      sendJson(res, 200, {
        success: true,
        round_id: roundId,
        district_id: districtId,
        save_state: saveState,
        matches: matchesWithRosters,
        discrepancies: districtData.discrepancies,
      });
      return true;
    } catch (err) {
      const ref = makeErrorRef();
      console.error(`[Leaderboard Editor] Error (Ref: ${ref}):`, err);
      sendJson(res, 500, { success: false, error: 'EDITOR_LOAD_ERROR', ref, message: `Could not load editor data. (Ref: ${ref})` });
      return true;
    }
  }

  // 4. PUT /api/tournaments/:id/leaderboard/districts/:districtId/scores
  const districtScoresMatch = subPath.match(/^districts\/([^/]+)\/scores$/);
  if (req.method === 'PUT' && districtScoresMatch) {
    const districtId = decodeURIComponent(districtScoresMatch[1]);
    try {
      const access = await checkTournamentOrganizerOrStaffAccess(authUser, tournament, pool, 'score_entry');
      if (!access.authorized) {
        sendJson(res, access.statusCode, { success: false, error: access.error, message: access.message });
        return true;
      }

      const body = await parseJsonBody(req);
      const { roundId, expectedVersion, matches } = body;

      if (!roundId) {
        sendJson(res, 400, { success: false, error: 'MISSING_ROUND', message: 'Round ID is required.' });
        return true;
      }

      const result = await saveDistrictScores(pool, {
        tournamentId,
        roundId,
        districtId,
        expectedVersion,
        matches,
        actorId: authUser.id,
        actorName: authUser.name || authUser.email || 'Organizer',
      });

      sendJson(res, 200, {
        success: true,
        message: 'Scores saved successfully.',
        ...result,
      });
      return true;
    } catch (err) {
      if (err instanceof DistrictSaveConflictError) {
        sendJson(res, 409, {
          success: false,
          error: 'VERSION_CONFLICT',
          message: err.message,
          current_version: err.currentVersion,
          saved_by: err.savedBy,
          saved_at: err.savedAt,
        });
        return true;
      }

      if (err instanceof DistrictValidationError) {
        sendJson(res, 400, {
          success: false,
          error: 'VALIDATION_FAILED',
          message: err.message,
          errors: err.errors,
        });
        return true;
      }

      const ref = makeErrorRef();
      console.error(`[District Save Scores] Internal Error (Ref: ${ref}):`, err);
      sendJson(res, 500, {
        success: false,
        error: 'SAVE_SCORES_ERROR',
        ref,
        message: `Could not save scores. (Ref: ${ref})`,
      });
      return true;
    }
  }

  return false;
}
