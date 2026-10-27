// server/testDataCleanupService.js
// Dedicated service for inspecting and safely removing tournament-specific test injection data.
// Guarantees strict tournament isolation, transactions, and foreign-key dependency integrity.

import crypto from 'crypto';

let _hasTestColumns = null;

/**
 * Checks whether server-controlled test provenance columns exist in tournament_registrations.
 * Cached in memory to minimize metadata query overhead.
 *
 * @param {object} clientOrPool
 * @returns {Promise<boolean>}
 */
export async function hasTestProvenanceColumns(clientOrPool) {
  if (_hasTestColumns !== null) return _hasTestColumns;
  try {
    const res = await clientOrPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'tournament_registrations'
        AND column_name = ANY($1::text[])
    `, [['is_test', 'test_batch_id', 'injected_by', 'injected_at']]);
    _hasTestColumns = res.rows.length === 4;
  } catch {
    _hasTestColumns = false;
  }
  return _hasTestColumns;
}

/**
 * Internal helper to query proven test registrations for a given tournament.
 * Matches only server-controlled provenance or reserved IDs assigned by the injector.
 */
async function fetchProvenTestRegistrations(clientOrPool, canonicalId, hasCols) {
  const query = `
    SELECT r.id, r.user_id, r.team_name, r.slot_number, r.status
    FROM tournament_registrations r
    WHERE r.tournament_id = $1::varchar
      AND (
        ${hasCols ? 'r.is_test = TRUE OR r.test_batch_id IS NOT NULL OR' : ''}
        r.id LIKE 'REG-TEST-%'
        OR r.user_id LIKE 'USR-TEST-%'
      )
    ORDER BY r.created_at ASC
  `;

  const res = await clientOrPool.query(query, [canonicalId]);
  return res.rows;
}

/**
 * Internal helper to query exclusively owned test teams for a set of test registration IDs.
 */
async function fetchTestTeams(clientOrPool, canonicalId, testRegIds) {
  const regIds = Array.isArray(testRegIds) ? testRegIds : [];

  const res = await clientOrPool.query(`
    SELECT id, registration_id, team_name
    FROM tournament_teams
    WHERE tournament_id = $1::varchar
      AND (
        (registration_id IS NOT NULL AND registration_id = ANY($2::text[]))
        OR leader_user_id LIKE 'USR-TEST-%'
        OR id LIKE 'TEAM-REG-TEST-%'
      )
  `, [canonicalId, regIds]);
  return res.rows;
}

/**
 * Retrieves a detailed, non-destructive summary of test-injected data for one tournament.
 *
 * @param {object} poolOrClient
 * @param {string} tournamentId
 * @returns {Promise<object>} Summary of test and real records
 */
export async function getTournamentTestInjectionSummary(poolOrClient, tournamentId) {
  if (!tournamentId || typeof tournamentId !== 'string' || !tournamentId.trim() || tournamentId.trim().length > 50) {
    const err = new Error('Tournament ID is required.');
    err.status = 400;
    err.code = 'INVALID_TOURNAMENT_ID';
    throw err;
  }

  const cleanTournamentId = tournamentId.trim();

  const tRes = await poolOrClient.query(
    'SELECT id, title, "slotsTotal", "slotsFilled", status FROM tournaments WHERE id = $1::varchar LIMIT 1',
    [cleanTournamentId]
  );
  if (tRes.rows.length === 0) {
    const err = new Error(`Tournament "${cleanTournamentId}" does not exist.`);
    err.status = 404;
    err.code = 'TOURNAMENT_NOT_FOUND';
    throw err;
  }
  const tournament = tRes.rows[0];
  const canonicalId = tournament.id;

  const hasCols = await hasTestProvenanceColumns(poolOrClient);
  const testRegs = await fetchProvenTestRegistrations(poolOrClient, canonicalId, hasCols);
  const testRegIds = testRegs.map(r => r.id);

  // Total registrations in this tournament
  const totalRegsRes = await poolOrClient.query(
    'SELECT COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1::varchar',
    [canonicalId]
  );
  const totalRegistrations = totalRegsRes.rows[0]?.count || 0;
  const realRegistrations = Math.max(0, totalRegistrations - testRegs.length);

  // Ambiguous registrations: have [TEST] in name but did NOT match test markers
  const ambiguousRes = await poolOrClient.query(`
    SELECT COUNT(*)::int AS count
    FROM tournament_registrations r
    WHERE r.tournament_id = $1::varchar
      AND (r.team_name ILIKE '%[TEST]%' OR r.team_name ILIKE 'TEST %')
      AND NOT (
        ${hasCols ? 'r.is_test = TRUE OR r.test_batch_id IS NOT NULL OR' : ''}
        r.id LIKE 'REG-TEST-%'
        OR r.user_id LIKE 'USR-TEST-%'
      )
  `, [canonicalId]);
  const ambiguousCount = ambiguousRes.rows[0]?.count || 0;

  // Exclusively test-owned teams
  const testTeams = await fetchTestTeams(poolOrClient, canonicalId, testRegIds);
  const testTeamIds = testTeams.map(t => t.id);

  // Dependent counts
  let matchAssignments = 0;
  let matchResults = 0;
  let qualificationDecisions = 0;
  let qualifiedTeams = 0;
  let leaderboardRows = 0;
  let finalStandings = 0;
  let prizeAwards = 0;
  let paymentSubmissions = 0;
  let prizePayments = 0;

  {
    const paymentRes = await poolOrClient.query(`
      SELECT COUNT(*)::int AS count
      FROM payment_submissions
      WHERE registration_id = ANY($1::text[])
        OR (tournament_id = $2::varchar AND (user_id LIKE 'USR-TEST-%' OR id LIKE 'PAY-TEST-%'))
    `, [testRegIds, canonicalId]);
    paymentSubmissions = paymentRes.rows[0]?.count || 0;
  }

  if (testTeamIds.length > 0) {
    const countsRes = await poolOrClient.query(`
      SELECT
        (SELECT COUNT(*)::int FROM tournament_match_assignments WHERE tournament_id = $1::varchar AND tournament_team_id = ANY($2::text[])) AS match_assignments,
        (SELECT COUNT(*)::int FROM tournament_match_results WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])) AS match_results,
        (SELECT COUNT(*)::int FROM tournament_qualification_decisions WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])) AS qual_decisions,
        (SELECT COUNT(*)::int FROM tournament_qualified_teams WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])) AS qual_teams,
        (SELECT COUNT(*)::int FROM tournament_leaderboard WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])) AS leaderboard_rows,
        (SELECT COUNT(*)::int FROM tournament_final_standings WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])) AS final_standings,
        (SELECT COUNT(*)::int FROM tournament_prize_awards WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])) AS prize_awards,
        (SELECT COUNT(*)::int FROM tournament_prize_payments WHERE team_id = ANY($2::text[])) AS prize_payments
    `, [canonicalId, testTeamIds]);

    const row = countsRes.rows[0] || {};
    matchAssignments = row.match_assignments || 0;
    matchResults = row.match_results || 0;
    qualificationDecisions = row.qual_decisions || 0;
    qualifiedTeams = row.qual_teams || 0;
    leaderboardRows = row.leaderboard_rows || 0;
    finalStandings = row.final_standings || 0;
    prizeAwards = row.prize_awards || 0;
    prizePayments = row.prize_payments || 0;
  }

  return {
    tournamentId: canonicalId,
    tournamentTitle: tournament.title,
    slotsTotal: parseInt(tournament.slotsTotal, 10) || 100,
    slotsFilled: parseInt(tournament.slotsFilled, 10) || 0,
    provenTestRegistrations: testRegs.length,
    otherRegistrationsProtected: realRegistrations,
    ambiguousRegistrations: ambiguousCount,
    testTeams: testTeams.length,
    matchAssignments,
    matchResults,
    qualificationDecisions,
    qualifiedTeams,
    leaderboardRows,
    finalStandings,
    prizeAwards,
    paymentSubmissions,
    prizePayments,
    blockedByPaymentRecords: paymentSubmissions > 0 || prizePayments > 0,
    canDelete: (testRegs.length > 0 || testTeams.length > 0) && paymentSubmissions === 0 && prizePayments === 0
  };
}

/**
 * Permanently deletes only proven test injection data for the selected tournament.
 * Runs in a strict single-database transaction respecting all foreign-key relationships.
 *
 * @param {object} pool
 * @param {object} options
 * @param {string} options.tournamentId
 * @param {string} options.adminId
 * @param {string} options.adminEmail
 * @returns {Promise<object>} Deletion summary result
 */
export async function deleteTournamentTestInjectionData(pool, { tournamentId, adminId, adminEmail }) {
  if (!tournamentId || typeof tournamentId !== 'string' || !tournamentId.trim() || tournamentId.trim().length > 50) {
    const err = new Error('Tournament ID is required.');
    err.status = 400;
    err.code = 'INVALID_TOURNAMENT_ID';
    throw err;
  }

  const cleanTournamentId = tournamentId.trim();

  const client = await pool.connect();
  let canonicalId = cleanTournamentId;
  try {
    await client.query('BEGIN');

    // 1. Verify tournament existence with exclusive row lock
    const tRes = await client.query(
      'SELECT id, title, "slotsTotal", "slotsFilled", status FROM tournaments WHERE id = $1::varchar FOR UPDATE',
      [cleanTournamentId]
    );
    if (tRes.rows.length === 0) {
      const err = new Error(`Tournament "${cleanTournamentId}" does not exist.`);
      err.status = 404;
      err.code = 'TOURNAMENT_NOT_FOUND';
      throw err;
    }
    const tournament = tRes.rows[0];
    canonicalId = tournament.id;

    const hasCols = await hasTestProvenanceColumns(client);

    // 2. Locate proven test registrations for this tournament
    const testRegs = await fetchProvenTestRegistrations(client, canonicalId, hasCols);
    const testRegIds = testRegs.map(r => r.id);

    // 3. Locate exclusively test-owned teams for this tournament
    const testTeams = await fetchTestTeams(client, canonicalId, testRegIds);
    const testTeamIds = testTeams.map(t => t.id);

    // Payment evidence is never removed by this utility. The injector creates no payment rows,
    // so linked submissions or payouts make this cleanup unsafe and must stop before any writes.
    const paymentSubmissionsRes = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM payment_submissions
      WHERE registration_id = ANY($1::text[])
        OR (tournament_id = $2::varchar AND (user_id LIKE 'USR-TEST-%' OR id LIKE 'PAY-TEST-%'))
    `, [testRegIds, canonicalId]);
    let linkedPrizePayments = 0;
    if (testTeamIds.length > 0) {
      const prizePaymentsRes = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM tournament_prize_payments
        WHERE team_id = ANY($1::text[])
      `, [testTeamIds]);
      linkedPrizePayments = prizePaymentsRes.rows[0]?.count || 0;
    }
    const linkedPaymentSubmissions = paymentSubmissionsRes.rows[0]?.count || 0;
    if (linkedPaymentSubmissions > 0 || linkedPrizePayments > 0) {
      const err = new Error(
        `Cleanup stopped without deleting anything: ${linkedPaymentSubmissions} payment submission(s) and ${linkedPrizePayments} prize payment(s) are linked to test-marked data. Payment records are preserved; resolve these records manually before retrying.`
      );
      err.status = 409;
      err.code = 'TEST_CLEANUP_PAYMENT_RECORDS_PRESENT';
      throw err;
    }

    let deletedRegistrations = 0;
    let deletedTeams = 0;
    let deletedMatchResults = 0;
    let deletedMatchAssignments = 0;
    let deletedQualDecisions = 0;
    let deletedQualTeams = 0;
    let deletedLeaderboard = 0;
    let deletedFinalStandings = 0;
    let deletedPrizeAwards = 0;

    // 4. Safely delete dependent team records in reverse-dependency order
    if (testTeamIds.length > 0) {
      // 4a. Qualification decisions (no FK cascade)
      const qdRes = await client.query(
        'DELETE FROM tournament_qualification_decisions WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedQualDecisions = qdRes.rowCount || 0;

      // 4b. Qualified teams
      const qtRes = await client.query(
        'DELETE FROM tournament_qualified_teams WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedQualTeams = qtRes.rowCount || 0;

      // 4c. Prize awards (the preflight above guarantees there are no payout rows)
      const paRes = await client.query(
        'DELETE FROM tournament_prize_awards WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedPrizeAwards = paRes.rowCount || 0;

      // 4d. Final standings
      const fsRes = await client.query(
        'DELETE FROM tournament_final_standings WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedFinalStandings = fsRes.rowCount || 0;

      // 4e. Leaderboard
      const lbRes = await client.query(
        'DELETE FROM tournament_leaderboard WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedLeaderboard = lbRes.rowCount || 0;

      // 4f. Match results audit & results
      await client.query(`
        DELETE FROM tournament_match_results_audit
        WHERE result_id IN (
          SELECT id FROM tournament_match_results
          WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])
        )
      `, [canonicalId, testTeamIds]);

      const mrRes = await client.query(
        'DELETE FROM tournament_match_results WHERE tournament_id = $1::varchar AND team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedMatchResults = mrRes.rowCount || 0;

      // 4g. Match allocations
      const maRes = await client.query(
        'DELETE FROM tournament_match_assignments WHERE tournament_id = $1::varchar AND tournament_team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedMatchAssignments = maRes.rowCount || 0;

      // 4h. Team invitations & members
      await client.query(
        'DELETE FROM tournament_team_invitations WHERE tournament_id = $1::varchar AND tournament_team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      await client.query(
        'DELETE FROM tournament_team_members WHERE tournament_id = $1::varchar AND tournament_team_id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );

      // 4i. Teams
      const dtRes = await client.query(
        'DELETE FROM tournament_teams WHERE tournament_id = $1::varchar AND id = ANY($2::text[])',
        [canonicalId, testTeamIds]
      );
      deletedTeams = dtRes.rowCount || 0;
    }

    // 5. Registration-level dependencies
    // Clear slot grid references and restore slot status to 'empty'
    await client.query(
      "UPDATE slot_grid SET registration_id = NULL, status = 'empty' WHERE tournament_id = $1::varchar AND registration_id = ANY($2::text[])",
      [canonicalId, testRegIds]
    );

    // Delete test registrations using combined matching (IDs array + provenance markers)
    const delRegsRes = await client.query(`
      DELETE FROM tournament_registrations
      WHERE tournament_id = $1::varchar
        AND (
          ${testRegIds.length > 0 ? 'id = ANY($2::text[]) OR' : ''}
          ${hasCols ? 'is_test = TRUE OR test_batch_id IS NOT NULL OR' : ''}
          id LIKE 'REG-TEST-%'
          OR user_id LIKE 'USR-TEST-%'
        )
    `, testRegIds.length > 0 ? [canonicalId, testRegIds] : [canonicalId]);

    deletedRegistrations = delRegsRes.rowCount || 0;

    // 5b. Transactionally update remaining verified slot count for the tournament
    const remSlotsRes = await client.query(
      "SELECT COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1::varchar AND status IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')",
      [canonicalId]
    );
    const remainingSlotsFilled = remSlotsRes.rows[0]?.count || 0;
    await client.query(
      'UPDATE tournaments SET "slotsFilled" = $1 WHERE id = $2::varchar',
      [remainingSlotsFilled, canonicalId]
    );

    // 6. Audit log entry in admin_action_log
    const auditId = `AAL-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const auditDetails = JSON.stringify({
      action: 'DELETE_TEST_INJECTION_DATA',
      tournamentId: canonicalId,
      tournamentTitle: tournament.title,
      deletedRegistrations,
      deletedTeams,
      deletedMatchAssignments,
      deletedMatchResults,
      deletedQualDecisions,
      deletedQualTeams,
      deletedLeaderboard,
      deletedFinalStandings,
      deletedPrizeAwards,
      performedBy: adminEmail || adminId,
      timestamp: new Date().toISOString()
    });

    await client.query(`
      INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      auditId,
      String(adminId || 'admin').slice(0, 50),
      'DELETE_TEST_INJECTION_DATA',
      'DELETE_TEST_INJECTION_DATA',
      'tournament',
      canonicalId,
      auditDetails
    ]);

    await client.query('COMMIT');

    console.log(`🛡️ [ADMIN CLEANUP] Removed ${deletedRegistrations} test registration(s) and ${deletedTeams} test team(s) from tournament "${canonicalId}" by admin "${adminEmail || adminId}".`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`❌ [ADMIN CLEANUP] Error deleting test injection data for ${tournamentId}:`, err);
    throw err;
  } finally {
    client.release();
  }

  // Read the slot count updated in the transaction. The general slot reconciler can
  // promote waitlists and rewrite registration-group assignments, so do not run it here.
  let updatedSlotsFilled = 0;
  try {
    const updatedTRes = await pool.query(
      'SELECT "slotsFilled" FROM tournaments WHERE id = $1::varchar LIMIT 1',
      [cleanTournamentId]
    );
    updatedSlotsFilled = parseInt(updatedTRes.rows[0]?.slotsFilled, 10) || 0;
  } catch {
    // fallback
  }

  return {
    success: true,
    message: `Successfully removed test data from tournament "${tournamentId}".`,
    tournamentId: canonicalId,
    deleted: {
      registrations: deletedRegistrations,
      teams: deletedTeams,
      matchAssignments: deletedMatchAssignments,
      matchResults: deletedMatchResults,
      qualificationDecisions: deletedQualDecisions,
      qualifiedTeams: deletedQualTeams,
      leaderboardRows: deletedLeaderboard,
      finalStandings: deletedFinalStandings,
      prizeAwards: deletedPrizeAwards
    },
    slotsFilled: updatedSlotsFilled
  };
}

/**
 * Permanently deletes ALL proven test injection data across ALL tournaments.
 * Runs in a strict single-database transaction respecting all foreign-key relationships.
 *
 * @param {object} pool
 * @param {object} options
 * @param {string} options.adminId
 * @param {string} options.adminEmail
 * @returns {Promise<object>} Global deletion summary result
 */
export async function deleteAllTestInjectionData(pool, { adminId, adminEmail }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hasCols = await hasTestProvenanceColumns(client);

    // 1. Locate all test registrations across the database
    const testRegsRes = await client.query(`
      SELECT r.id, r.tournament_id, r.user_id, r.team_name, r.slot_number, r.status
      FROM tournament_registrations r
      WHERE (
        ${hasCols ? 'r.is_test = TRUE OR r.test_batch_id IS NOT NULL OR' : ''}
        r.id LIKE 'REG-TEST-%'
        OR r.user_id LIKE 'USR-TEST-%'
      )
    `);
    const testRegs = testRegsRes.rows;
    const testRegIds = testRegs.map(r => r.id);

    // 2. Locate all test teams across the database
    const testTeamsRes = await client.query(`
      SELECT id, tournament_id, registration_id, team_name
      FROM tournament_teams
      WHERE (
        (registration_id IS NOT NULL AND registration_id = ANY($1::text[]))
        OR leader_user_id LIKE 'USR-TEST-%'
        OR id LIKE 'TEAM-REG-TEST-%'
      )
    `, [testRegIds]);
    const testTeams = testTeamsRes.rows;
    const testTeamIds = testTeams.map(t => t.id);

    // Track all affected tournament IDs
    const affectedTournamentIdSet = new Set();
    testRegs.forEach(r => { if (r.tournament_id) affectedTournamentIdSet.add(r.tournament_id); });
    testTeams.forEach(t => { if (t.tournament_id) affectedTournamentIdSet.add(t.tournament_id); });
    const affectedTournamentIds = Array.from(affectedTournamentIdSet);

    // Ensure no real payment records are linked to test data
    let linkedPaymentSubmissions = 0;
    if (testRegIds.length > 0) {
      const psRes = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM payment_submissions
        WHERE registration_id = ANY($1::text[])
          OR user_id LIKE 'USR-TEST-%'
          OR id LIKE 'PAY-TEST-%'
      `, [testRegIds]);
      linkedPaymentSubmissions = psRes.rows[0]?.count || 0;
    }
    let linkedPrizePayments = 0;
    if (testTeamIds.length > 0) {
      const ppRes = await client.query(`
        SELECT COUNT(*)::int AS count
        FROM tournament_prize_payments
        WHERE team_id = ANY($1::text[])
      `, [testTeamIds]);
      linkedPrizePayments = ppRes.rows[0]?.count || 0;
    }

    if (linkedPaymentSubmissions > 0 || linkedPrizePayments > 0) {
      const err = new Error(
        `Global cleanup stopped: ${linkedPaymentSubmissions} payment submission(s) and ${linkedPrizePayments} prize payment(s) are linked to test-marked data. Resolve these records manually.`
      );
      err.status = 409;
      err.code = 'TEST_CLEANUP_PAYMENT_RECORDS_PRESENT';
      throw err;
    }

    let deletedRegistrations = 0;
    let deletedTeams = 0;
    let deletedMatchResults = 0;
    let deletedMatchAssignments = 0;
    let deletedQualDecisions = 0;
    let deletedQualTeams = 0;
    let deletedLeaderboard = 0;
    let deletedFinalStandings = 0;
    let deletedPrizeAwards = 0;

    if (testTeamIds.length > 0) {
      const qdRes = await client.query('DELETE FROM tournament_qualification_decisions WHERE team_id = ANY($1::text[])', [testTeamIds]);
      deletedQualDecisions = qdRes.rowCount || 0;

      const qtRes = await client.query('DELETE FROM tournament_qualified_teams WHERE team_id = ANY($1::text[])', [testTeamIds]);
      deletedQualTeams = qtRes.rowCount || 0;

      const paRes = await client.query('DELETE FROM tournament_prize_awards WHERE team_id = ANY($1::text[])', [testTeamIds]);
      deletedPrizeAwards = paRes.rowCount || 0;

      const fsRes = await client.query('DELETE FROM tournament_final_standings WHERE team_id = ANY($1::text[])', [testTeamIds]);
      deletedFinalStandings = fsRes.rowCount || 0;

      const lbRes = await client.query('DELETE FROM tournament_leaderboard WHERE team_id = ANY($1::text[])', [testTeamIds]);
      deletedLeaderboard = lbRes.rowCount || 0;

      await client.query(`
        DELETE FROM tournament_match_results_audit
        WHERE result_id IN (
          SELECT id FROM tournament_match_results
          WHERE team_id = ANY($1::text[])
        )
      `, [testTeamIds]);

      const mrRes = await client.query('DELETE FROM tournament_match_results WHERE team_id = ANY($1::text[])', [testTeamIds]);
      deletedMatchResults = mrRes.rowCount || 0;

      const maRes = await client.query('DELETE FROM tournament_match_assignments WHERE tournament_team_id = ANY($1::text[])', [testTeamIds]);
      deletedMatchAssignments = maRes.rowCount || 0;

      await client.query('DELETE FROM tournament_team_invitations WHERE tournament_team_id = ANY($1::text[])', [testTeamIds]);
      await client.query('DELETE FROM tournament_team_members WHERE tournament_team_id = ANY($1::text[])', [testTeamIds]);

      const dtRes = await client.query('DELETE FROM tournament_teams WHERE id = ANY($1::text[])', [testTeamIds]);
      deletedTeams = dtRes.rowCount || 0;
    }

    if (testRegIds.length > 0) {
      await client.query(
        "UPDATE slot_grid SET registration_id = NULL, status = 'empty' WHERE registration_id = ANY($1::text[])",
        [testRegIds]
      );

      const delRegsRes = await client.query(`
        DELETE FROM tournament_registrations
        WHERE id = ANY($1::text[])
          OR (
            ${hasCols ? 'is_test = TRUE OR test_batch_id IS NOT NULL OR' : ''}
            id LIKE 'REG-TEST-%'
            OR user_id LIKE 'USR-TEST-%'
          )
      `, [testRegIds]);
      deletedRegistrations = delRegsRes.rowCount || 0;
    } else {
      const delRegsRes = await client.query(`
        DELETE FROM tournament_registrations
        WHERE (
          ${hasCols ? 'is_test = TRUE OR test_batch_id IS NOT NULL OR' : ''}
          id LIKE 'REG-TEST-%'
          OR user_id LIKE 'USR-TEST-%'
        )
      `);
      deletedRegistrations = delRegsRes.rowCount || 0;
    }

    // Recalculate slotsFilled for all affected tournaments
    if (affectedTournamentIds.length > 0) {
      for (const tId of affectedTournamentIds) {
        const remRes = await client.query(
          "SELECT COUNT(*)::int AS count FROM tournament_registrations WHERE tournament_id = $1::varchar AND status IN ('approved', 'confirmed', 'VERIFIED_BY_HOST', 'verified_by_host')",
          [tId]
        );
        const remCount = remRes.rows[0]?.count || 0;
        await client.query('UPDATE tournaments SET "slotsFilled" = $1 WHERE id = $2::varchar', [remCount, tId]);
      }
    }

    // Audit log
    const auditId = `AAL-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const auditDetails = JSON.stringify({
      action: 'CLEAR_ALL_TEST_INJECTION_DATA',
      deletedRegistrations,
      deletedTeams,
      affectedTournamentsCount: affectedTournamentIds.length,
      affectedTournaments: affectedTournamentIds,
      performedBy: adminEmail || adminId,
      timestamp: new Date().toISOString()
    });

    await client.query(`
      INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    `, [
      auditId,
      String(adminId || 'admin').slice(0, 50),
      'CLEAR_ALL_TEST_INJECTION_DATA',
      'CLEAR_ALL_TEST_INJECTION_DATA',
      'system',
      'all_tournaments',
      auditDetails
    ]);

    await client.query('COMMIT');
    console.log(`🛡️ [ADMIN CLEANUP] Globally removed ${deletedRegistrations} test registration(s) and ${deletedTeams} test team(s) across ${affectedTournamentIds.length} tournament(s) by admin "${adminEmail || adminId}".`);

    return {
      success: true,
      message: `Successfully cleared ${deletedRegistrations} test registration(s) and ${deletedTeams} test team(s) across ${affectedTournamentIds.length} tournament(s).`,
      affectedTournaments: affectedTournamentIds.length,
      deleted: {
        registrations: deletedRegistrations,
        teams: deletedTeams,
        matchAssignments: deletedMatchAssignments,
        matchResults: deletedMatchResults,
        qualificationDecisions: deletedQualDecisions,
        qualifiedTeams: deletedQualTeams,
        leaderboardRows: deletedLeaderboard,
        finalStandings: deletedFinalStandings,
        prizeAwards: deletedPrizeAwards
      }
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [ADMIN CLEANUP] Error deleting all test injection data:', err);
    throw err;
  } finally {
    client.release();
  }
}

