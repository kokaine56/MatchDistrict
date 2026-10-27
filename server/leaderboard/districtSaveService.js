// server/leaderboard/districtSaveService.js
import crypto from 'crypto';
import { getDistrictRoster, getMatchRoster } from './rosterService.js';
import { getScoringConfig, validateMatchScores } from './scoringConfig.js';
import { saveMatchResults } from './resultsService.js';
import { formatDateIST12h } from '../../src/utils/timeFormat.js';

function randomId(prefix = 'ds_') {
  return `${prefix}${crypto.randomBytes(8).toString('hex')}`;
}

export class DistrictSaveConflictError extends Error {
  constructor(message, { version, savedBy, savedAt }) {
    super(message);
    this.name = 'DistrictSaveConflictError';
    this.statusCode = 409;
    this.code = 'VERSION_CONFLICT';
    this.currentVersion = version;
    this.savedBy = savedBy;
    this.savedAt = savedAt;
  }
}

export class DistrictValidationError extends Error {
  constructor(errors = []) {
    super(errors[0] || 'Validation failed for score entry.');
    this.name = 'DistrictValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_FAILED';
    this.errors = errors;
  }
}

/**
 * Gets the save state for a district.
 *
 * @param {object} clientOrPool
 * @param {string} tournamentId
 * @param {string} roundId
 * @param {string} districtId
 * @returns {Promise<{
 *   version: number,
 *   saved_by: string|null,
 *   saved_at: string|null,
 *   matches_saved: number,
 *   matches_total: number,
 *   is_complete: boolean,
 *   status: string
 * }>}
 */
export async function getDistrictSaveState(clientOrPool, tournamentId, roundId, districtId) {
  if (!clientOrPool || !tournamentId || !roundId || !districtId) {
    return {
      version: 1,
      saved_by: null,
      saved_at: null,
      matches_saved: 0,
      matches_total: 0,
      is_complete: false,
      status: 'unsaved',
    };
  }

  // Check tournament_district_scores first, falling back to tournament_district_save_states
  try {
    const res = await clientOrPool.query(
      `SELECT version, saved_by, saved_at, matches_saved, matches_total, is_complete
       FROM tournament_district_scores
       WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND district_id = $3::varchar
       LIMIT 1`,
      [tournamentId, roundId, districtId]
    );

    if (res.rows.length > 0) {
      const row = res.rows[0];
      return {
        version: Number(row.version) || 1,
        saved_by: row.saved_by || null,
        saved_at: row.saved_at || null,
        matches_saved: Number(row.matches_saved) || 0,
        matches_total: Number(row.matches_total) || 0,
        is_complete: Boolean(row.is_complete),
        status: Boolean(row.is_complete) ? 'saved' : (Number(row.matches_saved) > 0 ? 'incomplete' : 'unsaved'),
      };
    }
  } catch {
    // Fall back to tournament_district_save_states
  }

  try {
    const resOld = await clientOrPool.query(
      `SELECT version, saved_by, saved_at, status
       FROM tournament_district_save_states
       WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND district_id = $3::varchar
       LIMIT 1`,
      [tournamentId, roundId, districtId]
    );

    if (resOld.rows.length > 0) {
      const row = resOld.rows[0];
      return {
        version: Number(row.version) || 1,
        saved_by: row.saved_by || null,
        saved_at: row.saved_at || null,
        matches_saved: 0,
        matches_total: 0,
        is_complete: row.status === 'saved',
        status: row.status || 'saved',
      };
    }
  } catch {
    // Non-blocking
  }

  return {
    version: 1,
    saved_by: null,
    saved_at: null,
    matches_saved: 0,
    matches_total: 0,
    is_complete: false,
    status: 'unsaved',
  };
}

/**
 * Saves all edited matches of a district atomically with optimistic concurrency control (P4, P6).
 *
 * @param {object} pool - PostgreSQL connection pool
 * @param {object} params
 * @param {string} params.tournamentId
 * @param {string} params.roundId
 * @param {string} params.districtId
 * @param {number} params.expectedVersion
 * @param {Array<{ matchId: string, scores: Array<object> }>} params.matches - Edited match scores
 * @param {string} params.actorId
 * @param {string} [params.actorName]
 * @returns {Promise<object>}
 */
export async function saveDistrictScores(pool, {
  tournamentId,
  roundId,
  districtId,
  expectedVersion,
  matches: submittedMatches,
  actorId,
  actorName = 'Another organizer',
}) {
  if (!pool || !tournamentId || !roundId || !districtId) {
    throw new Error('pool, tournamentId, roundId, and districtId are required.');
  }

  if (!Array.isArray(submittedMatches) || submittedMatches.length === 0) {
    throw new DistrictValidationError(['No matches provided to save.']);
  }

  // Load district roster and scoring config
  const scoringConfig = await getScoringConfig(pool, tournamentId);
  const districtData = await getDistrictRoster(pool, roundId, districtId);
  const districtMatches = districtData.matches || [];

  if (districtMatches.length === 0) {
    throw new DistrictValidationError([`District has no configured matches in this round.`]);
  }

  const matchRosterMap = new Map();
  const matchInfoMap = new Map();

  for (const m of districtMatches) {
    const rData = await getMatchRoster(pool, m.id);
    matchRosterMap.set(m.id, rData.roster);
    matchInfoMap.set(m.id, m);
  }

  // Validate all submitted matches before opening transaction
  const allValidatedMatchScores = [];
  const allValidationErrors = [];

  for (const item of submittedMatches) {
    const matchId = item.matchId || item.match_id;
    const matchInfo = matchInfoMap.get(matchId);

    if (!matchInfo) {
      allValidationErrors.push(`Match ${matchId} does not belong to this district.`);
      continue;
    }

    const roster = matchRosterMap.get(matchId) || [];
    const { validScores, errors } = validateMatchScores(item.scores || [], roster, matchInfo);

    if (errors.length > 0) {
      allValidationErrors.push(...errors);
    } else {
      allValidatedMatchScores.push({
        matchId,
        validScores,
        rosterLength: roster.length,
      });
    }
  }

  if (allValidationErrors.length > 0) {
    throw new DistrictValidationError(allValidationErrors);
  }

  // Transaction for optimistic concurrency and atomic results persistence
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Optimistic Concurrency Check
    let currentVersion = 1;
    let lastSavedBy = null;
    let lastSavedAt = null;

    const vCheck = await client.query(
      `SELECT version, saved_by, saved_at
       FROM tournament_district_scores
       WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND district_id = $3::varchar
       FOR UPDATE`,
      [tournamentId, roundId, districtId]
    );

    if (vCheck.rows.length > 0) {
      currentVersion = Number(vCheck.rows[0].version) || 1;
      lastSavedBy = vCheck.rows[0].saved_by;
      lastSavedAt = vCheck.rows[0].saved_at;
    } else {
      // Check legacy save states
      const oldCheck = await client.query(
        `SELECT version, saved_by, saved_at
         FROM tournament_district_save_states
         WHERE tournament_id = $1::varchar AND round_id = $2::varchar AND district_id = $3::varchar
         FOR UPDATE`,
        [tournamentId, roundId, districtId]
      );
      if (oldCheck.rows.length > 0) {
        currentVersion = Number(oldCheck.rows[0].version) || 1;
        lastSavedBy = oldCheck.rows[0].saved_by;
        lastSavedAt = oldCheck.rows[0].saved_at;
      }
    }

    if (expectedVersion != null && Number(expectedVersion) !== currentVersion) {
      await client.query('ROLLBACK');
      const timeFormatted = lastSavedAt ? formatDateIST12h(lastSavedAt) : 'recently';
      const saverDisplay = lastSavedBy || actorName || 'Another organizer';
      throw new DistrictSaveConflictError(
        `Another organizer (${saverDisplay}) saved scores at ${timeFormatted}. Refresh to load their changes.`,
        {
          version: currentVersion,
          savedBy: saverDisplay,
          savedAt: lastSavedAt,
        }
      );
    }

    // 2. Save results for each edited match
    for (const matchSubmission of allValidatedMatchScores) {
      await saveMatchResults(client, {
        matchId: matchSubmission.matchId,
        tournamentId,
        validScores: matchSubmission.validScores,
        actorId,
        scoringConfig,
      });
    }

    // 3. Calculate district completion
    // A match is saved if all its roster teams have verified results.
    let matchesWithFullScores = 0;
    for (const m of districtMatches) {
      const roster = matchRosterMap.get(m.id) || [];
      const resCheck = await client.query(
        `SELECT COUNT(DISTINCT team_id)::int AS count
         FROM tournament_match_results
         WHERE match_id = $1::varchar AND placement IS NOT NULL AND kills IS NOT NULL`,
        [m.id]
      );
      const scoredCount = resCheck.rows.length > 0 ? Number(resCheck.rows[0].count) : 0;
      if (roster.length > 0 && scoredCount >= roster.length) {
        matchesWithFullScores += 1;
      }
    }

    const matchesTotal = districtMatches.length;
    const isComplete = matchesWithFullScores >= matchesTotal && matchesTotal > 0;
    const nextVersion = currentVersion + 1;
    const saveStateId = randomId('tds_');

    // 4. Update tournament_district_scores
    await client.query(
      `INSERT INTO tournament_district_scores (
         id, tournament_id, round_id, district_id,
         version, saved_by, saved_at,
         matches_saved, matches_total, is_complete
       ) VALUES (
         $1::varchar, $2::varchar, $3::varchar, $4::varchar,
         $5::int, $6::varchar, NOW(),
         $7::int, $8::int, $9::boolean
       )
       ON CONFLICT (tournament_id, round_id, district_id) DO UPDATE SET
         version = EXCLUDED.version,
         saved_by = EXCLUDED.saved_by,
         saved_at = NOW(),
         matches_saved = EXCLUDED.matches_saved,
         matches_total = EXCLUDED.matches_total,
         is_complete = EXCLUDED.is_complete`,
      [
        saveStateId,
        tournamentId,
        roundId,
        districtId,
        nextVersion,
        actorName || actorId || 'Organizer',
        matchesWithFullScores,
        matchesTotal,
        isComplete,
      ]
    );

    // 5. Keep legacy tournament_district_save_states updated
    await client.query(
      `INSERT INTO tournament_district_save_states (
         id, tournament_id, round_id, district_id,
         status, version, saved_by, saved_at
       ) VALUES (
         $1::varchar, $2::varchar, $3::varchar, $4::varchar,
         $5::varchar, $6::int, $7::varchar, NOW()
       )
       ON CONFLICT (tournament_id, round_id, district_id) DO UPDATE SET
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         saved_by = EXCLUDED.saved_by,
         saved_at = NOW()`,
      [
        saveStateId,
        tournamentId,
        roundId,
        districtId,
        isComplete ? 'saved' : 'incomplete',
        nextVersion,
        actorName || actorId || 'Organizer',
      ]
    );

    await client.query('COMMIT');

    return {
      success: true,
      version: nextVersion,
      saved_at: new Date().toISOString(),
      saved_by: actorName || 'Organizer',
      matches_saved: matchesWithFullScores,
      matches_total: matchesTotal,
      is_complete: isComplete,
      status: isComplete ? 'saved' : 'incomplete',
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
