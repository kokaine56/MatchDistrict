import crypto from 'crypto';
import { ROLES, hasRole, hasCapability, isSystemAdmin } from '../src/utils/iamRoles.js';
import { reconcileTournamentSlots } from '../workers/slotManagerWorker.js';

// Rejection reason mappings (code -> player-facing default text)
export const REJECTION_REASONS = {
  payment_not_received: 'Payment has not been received in organizer account.',
  wrong_amount: 'Paid amount does not match required entry fee.',
  invalid_utr: 'Invalid or unrecognized 12-digit UTR reference.',
  duplicate_utr: 'UTR has already been submitted for another registration.',
  unclear_proof: 'Payment screenshot proof is blurry, cropped, or illegible.',
  other: 'Payment verification failed.'
};

/**
 * Normalizes UTR: trims, removes all inner whitespace, and uppercases.
 */
export function normalizeUtr(utr) {
  if (!utr || typeof utr !== 'string') return '';
  return utr.trim().replace(/\s+/g, '').toUpperCase();
}

/**
 * Validates whether a UTR is an exact 12-digit UPI reference.
 */
export function isValidUpiUtr(utr) {
  const norm = normalizeUtr(utr);
  return /^\d{12}$/.test(norm);
}

export const SUPPORTED_PAYMENT_APPS = [
  'google_pay',
  'phonepe',
  'paytm',
  'bhim',
  'amazon_pay',
  'cred',
  'whatsapp_pay',
  'mobikwik',
  'other'
];

export const PAYMENT_APP_LABELS = {
  google_pay: 'Google Pay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  bhim: 'BHIM',
  amazon_pay: 'Amazon Pay',
  cred: 'CRED',
  whatsapp_pay: 'WhatsApp Pay',
  mobikwik: 'MobiKwik',
  other: 'Other UPI App'
};

export function normalizePaymentApp(val) {
  if (!val || typeof val !== 'string') return null;
  const s = val.toLowerCase().trim();
  if (['google_pay', 'google pay', 'gpay'].includes(s)) return 'google_pay';
  if (['phonepe', 'phone pe'].includes(s)) return 'phonepe';
  if (['paytm'].includes(s)) return 'paytm';
  if (['bhim'].includes(s)) return 'bhim';
  if (['amazon_pay', 'amazon pay'].includes(s)) return 'amazon_pay';
  if (['cred'].includes(s)) return 'cred';
  if (['whatsapp_pay', 'whatsapp pay', 'whatsapp'].includes(s)) return 'whatsapp_pay';
  if (['mobikwik', 'mobi kwik'].includes(s)) return 'mobikwik';
  if (['other', 'other upi app', 'other app', 'upi'].includes(s)) return 'other';
  return s;
}

export function isValidPaymentApp(val) {
  if (!val || typeof val !== 'string') return false;
  const norm = normalizePaymentApp(val);
  return SUPPORTED_PAYMENT_APPS.includes(norm);
}

export function formatPaymentApp(val) {
  if (!val) return 'UPI';
  const norm = normalizePaymentApp(val);
  return PAYMENT_APP_LABELS[norm] || val;
}

/**
 * Converts a numeric or currency value into integer paise.
 */
export function toPaise(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(val);
  if (isNaN(num)) return null;
  return Math.round(num * 100);
}

/**
 * Formats a Date object or ISO string to IST 12-hour: DD/MM/YYYY hh:mm A.
 */
export function formatIST12h(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const datePart = d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const timePart = d.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toUpperCase();
    return `${datePart} ${timePart}`;
  } catch {
    return String(dateStr);
  }
}

/**
 * Formats elapsed duration into concise human-readable waiting time string.
 */
export function formatWaitingTime(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `waiting ${Math.max(1, mins)} min${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `waiting ${hours} hr${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `waiting ${days} day${days === 1 ? '' : 's'}`;
}

/**
 * Formats registration age for awaiting-payment items.
 */
export function formatAge(dateStr) {
  if (!dateStr) return '';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'registered just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `registered ${Math.max(1, mins)} min${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `registered ${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `registered ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Checks reviewer capabilities and tournament scoping.
 */
export function checkReviewerPermissions(user, tournament, action = 'view') {
  if (!user) {
    return { authorized: false, statusCode: 401, error: 'UNAUTHORIZED', message: 'Authentication required.' };
  }
  // Admin: authorized for all actions on all tournaments
  if (hasRole(user, ROLES.ADMIN) || isSystemAdmin(user)) {
    return { authorized: true };
  }
  // Verifier: can view, approve, reject, releaseSlot on any tournament (reopen is ADMIN ONLY)
  const isVerifier = hasCapability(user, 'VERIFY_PAYMENTS') || hasRole(user, ROLES.REG_PAYMENT_VERIFIER);
  if (isVerifier) {
    if (action === 'reopen') {
      return { authorized: false, statusCode: 403, error: 'FORBIDDEN', message: 'Reopening verified registrations is restricted to Administrators.' };
    }
    return { authorized: true };
  }
  // Organizer: can view, approve, reject, releaseSlot strictly on their own tournament
  const userIds = [String(user.id || '')];
  if (user.uid) userIds.push(String(user.uid));
  const isOwner = tournament && (
    userIds.includes(String(tournament.orgId || '')) ||
    userIds.includes(String(tournament.org_id || '')) ||
    userIds.includes(String(tournament.tournament_org_id || '')) ||
    userIds.includes(String(tournament.tournament_org_id_alt || '')) ||
    userIds.includes(String(tournament.organizer_id || ''))
  );
  if (isOwner) {
    if (action === 'reopen') {
      return { authorized: false, statusCode: 403, error: 'FORBIDDEN', message: 'Reopening verified registrations is restricted to Administrators.' };
    }
    return { authorized: true };
  }

  return { authorized: false, statusCode: 403, error: 'FORBIDDEN', message: 'You do not have permission to review payments for this tournament.' };
}

/**
 * Automatic team squad creation helper (safe fallback if not already created).
 * Handled with a PostgreSQL SAVEPOINT to ensure team/member creation issues cannot
 * abort the enclosing transaction.
 */
async function ensureTeamForRegistrationSafe(client, tournamentId, userId, teamName, registrationId) {
  if (!tournamentId || !userId) return;

  await client.query('SAVEPOINT ensure_team_sp');
  try {
    const existing = await client.query(
      `SELECT t.id FROM tournament_teams t
       JOIN tournament_team_members tm ON tm.tournament_team_id = t.id
       WHERE t.tournament_id = $1 AND tm.user_id = $2 LIMIT 1`,
      [tournamentId, userId]
    );
    if (existing.rows.length > 0) {
      if (registrationId) {
        await client.query(
          `UPDATE tournament_teams SET registration_id = COALESCE(registration_id, $1), updated_at = NOW() WHERE id = $2`,
          [registrationId, existing.rows[0].id]
        );
      }
      await client.query('RELEASE SAVEPOINT ensure_team_sp');
      return existing.rows[0];
    }

    let targetName = (teamName || 'Team ' + String(userId).slice(0, 6)).trim().slice(0, 30);
    if (!targetName) targetName = 'Team ' + String(userId).slice(0, 6);

    // If a team with targetName already exists in this tournament, deduplicate name
    const nameCheck = await client.query(
      'SELECT id FROM tournament_teams WHERE tournament_id = $1 AND LOWER(team_name) = LOWER($2)',
      [tournamentId, targetName]
    );
    if (nameCheck.rows.length > 0) {
      const suffix = '-' + crypto.randomBytes(2).toString('hex');
      targetName = (targetName.slice(0, 30 - suffix.length) + suffix).trim();
    }

    const teamId = 'TEAM-' + Date.now().toString().slice(-6) + '-' + crypto.randomBytes(3).toString('hex');
    const memberId = 'MEM-' + crypto.randomBytes(6).toString('hex');

    const insTeamRes = await client.query(
      `INSERT INTO tournament_teams (id, tournament_id, team_name, leader_user_id, status, registration_id)
       VALUES ($1, $2, $3, $4, 'awaiting_members', $5)
       ON CONFLICT (tournament_id, team_name) DO NOTHING
       RETURNING *`,
      [teamId, tournamentId, targetName, userId, registrationId || null]
    );

    const actualTeamId = insTeamRes.rows.length > 0 ? insTeamRes.rows[0].id : teamId;

    await client.query(
      `INSERT INTO tournament_team_members (id, tournament_team_id, tournament_id, user_id, role, status, roster_slot)
       VALUES ($1, $2, $3, $4, 'leader', 'active', 0)
       ON CONFLICT (tournament_id, user_id) DO NOTHING`,
      [memberId, actualTeamId, tournamentId, userId]
    );

    await client.query('RELEASE SAVEPOINT ensure_team_sp');
    return { id: actualTeamId };
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT ensure_team_sp');
    console.warn('[paymentReviewService] ensureTeamForRegistrationSafe rolled back to savepoint:', err.message);
  }
}

/**
 * listQueue: Queries the review queue with tab counts, filters, cursor pagination, and duplicate UTR checks.
 */
export async function listQueue(pool, user, options = {}) {
  const {
    tab = 'pending_review',
    tournamentId = null,
    search = '',
    limit = 20,
    cursor = null
  } = options;

  const validTabs = ['pending_review', 'awaiting_payment', 'approved', 'rejected'];
  const activeTab = validTabs.includes(tab) ? tab : 'pending_review';

  const isAdmin = hasRole(user, ROLES.ADMIN) || isSystemAdmin(user);
  const isVerifier = hasCapability(user, 'VERIFY_PAYMENTS') || hasRole(user, ROLES.REG_PAYMENT_VERIFIER);

  // Scoping condition
  const scopeParams = [];
  let scopeSql = '1=1';

  if (!isAdmin && !isVerifier) {
    // Scoped strictly to tournaments owned by organizer
    const userIds = [String(user.id || '')];
    if (user.uid && !userIds.includes(String(user.uid))) userIds.push(String(user.uid));
    scopeParams.push(userIds);
    scopeSql += ` AND (t."orgId"::varchar = ANY($${scopeParams.length}::varchar[]) OR t.org_id::varchar = ANY($${scopeParams.length}::varchar[]))`;
  }

  if (tournamentId) {
    scopeParams.push(tournamentId);
    scopeSql += ` AND r.tournament_id = $${scopeParams.length}`;
  }

  // 1. Single query for counts across all 4 tabs
  const countQuery = `
    SELECT
      COUNT(*) FILTER (
        WHERE (r.status IN ('pending', 'pending_admin_review', 'VERIFIED_BY_HOST', 'verified_by_host')
               OR ps.payment_status = 'pending_admin_review')
          AND (ps.proof_url IS NOT NULL OR r.screenshot_url IS NOT NULL)
      )::int AS pending_review,
      COUNT(*) FILTER (
        WHERE r.status = 'pending_payment'
          AND ps.proof_url IS NULL
          AND r.screenshot_url IS NULL
      )::int AS awaiting_payment,
      COUNT(*) FILTER (
        WHERE r.status IN ('approved', 'confirmed')
      )::int AS approved,
      COUNT(*) FILTER (
        WHERE r.status IN ('rejected', 'PAYMENT_REJECTED')
      )::int AS rejected
    FROM tournament_registrations r
    LEFT JOIN tournaments t ON t.id = r.tournament_id
    LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
    LEFT JOIN users u ON u.id = r.user_id
    WHERE ${scopeSql}
  `;
  const countRes = await pool.query(countQuery, scopeParams);
  const counts = countRes.rows[0] || { pending_review: 0, awaiting_payment: 0, approved: 0, rejected: 0 };

  // 2. Tab status filter clause
  let tabSql = '';
  let sortSql = '';

  if (activeTab === 'pending_review') {
    tabSql = `
      AND (
        (r.status IN ('pending', 'pending_admin_review', 'VERIFIED_BY_HOST', 'verified_by_host')
         OR ps.payment_status = 'pending_admin_review')
        AND (ps.proof_url IS NOT NULL OR r.screenshot_url IS NOT NULL)
      )
    `;
    sortSql = 'ORDER BY COALESCE(ps.created_at, r.created_at) ASC, r.id ASC';
  } else if (activeTab === 'awaiting_payment') {
    tabSql = `
      AND r.status = 'pending_payment'
      AND ps.proof_url IS NULL
      AND r.screenshot_url IS NULL
    `;
    sortSql = 'ORDER BY r.created_at ASC, r.id ASC';
  } else if (activeTab === 'approved') {
    tabSql = `AND r.status IN ('approved', 'confirmed')`;
    sortSql = 'ORDER BY COALESCE(ps.reviewed_at, r.updated_at, r.created_at) DESC, r.id DESC';
  } else if (activeTab === 'rejected') {
    tabSql = `AND r.status IN ('rejected', 'PAYMENT_REJECTED')`;
    sortSql = 'ORDER BY COALESCE(r.rejected_at, r.updated_at, r.created_at) DESC, r.id DESC';
  }

  // 3. Search filter clause
  const queryParams = [...scopeParams];
  let searchSql = '';
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    queryParams.push(term);
    const pSearch = `$${queryParams.length}`;
    queryParams.push(search.trim());
    const pRaw = `$${queryParams.length}`;

    searchSql = `
      AND (
        r.team_name ILIKE ${pSearch}
        OR r.captain ILIKE ${pSearch}
        OR u.name ILIKE ${pSearch}
        OR CAST(u.district_id AS TEXT) ILIKE ${pSearch}
        OR ps.utr_number ILIKE ${pSearch}
        OR r.transaction_id ILIKE ${pSearch}
        OR CAST(r.amount_due AS TEXT) = ${pRaw}
        OR CAST(ps.amount AS TEXT) = ${pRaw}
      )
    `;
  }

  // 4. Cursor pagination clause
  let cursorSql = '';
  if (cursor) {
    queryParams.push(cursor);
    const pCur = `$${queryParams.length}`;
    if (activeTab === 'pending_review' || activeTab === 'awaiting_payment') {
      cursorSql = `AND COALESCE(ps.created_at, r.created_at) > ${pCur}::timestamptz`;
    } else {
      cursorSql = `AND COALESCE(ps.reviewed_at, r.rejected_at, r.updated_at, r.created_at) < ${pCur}::timestamptz`;
    }
  }

  queryParams.push(limit + 1);
  const pLimit = `$${queryParams.length}`;

  const itemsQuery = `
    SELECT
      r.id,
      r.tournament_id,
      r.user_id,
      r.team_name,
      r.captain,
      r.captain_uid,
      r.slot_number,
      r.status AS reg_status,
      r.amount_due,
      r.transaction_id,
      r.payment_app AS reg_payment_app,
      r.screenshot_url,
      r.rejection_reason,
      r.rejected_at,
      r.created_at AS reg_created_at,
      r.updated_at AS reg_updated_at,
      r.members,
      t.title AS tournament_title,
      t.game AS tournament_game,
      t.entry_fee_amount AS tournament_entry_fee,
      t."orgId" AS tournament_org_id,
      t.org_id AS tournament_org_id_alt,
      COALESCE(t."orgName", t.org_name, 'Organizer') AS tournament_org_name,
      ps.id AS payment_submission_id,
      ps.amount AS amount_paid,
      ps.proof_url AS payment_proof_url,
      ps.utr_number AS payment_utr,
      ps.payment_app AS ps_payment_app,
      ps.payment_status,
      ps.admin_notes,
      ps.reviewed_by,
      ps.reviewed_at,
      ps.created_at AS payment_submitted_at,
      u.name AS leader_name,
      u.email AS leader_email,
      u.district_id,
      rev.name AS reviewer_name
    FROM tournament_registrations r
    LEFT JOIN tournaments t ON t.id = r.tournament_id
    LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN users rev ON rev.id = ps.reviewed_by
    WHERE ${scopeSql} ${tabSql} ${searchSql} ${cursorSql}
    ${sortSql}
    LIMIT ${pLimit}
  `;

  const itemsRes = await pool.query(itemsQuery, queryParams);
  const rows = itemsRes.rows;
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  // 5. Batch Duplicate UTR Detection across other active registrations
  const utrMap = {};
  const utrList = [];
  const regIds = pageRows.map(r => r.id);

  pageRows.forEach(r => {
    const raw = r.payment_utr || r.transaction_id;
    const norm = normalizeUtr(raw);
    if (norm && norm.length >= 6) {
      utrMap[r.id] = norm;
      if (!utrList.includes(norm)) utrList.push(norm);
    }
  });

  const duplicateMap = {};
  if (utrList.length > 0) {
    const dupQuery = `
      SELECT
        r2.id AS registration_id,
        r2.team_name,
        r2.tournament_id,
        t2.title AS tournament_title,
        r2.status AS reg_status,
        UPPER(REGEXP_REPLACE(COALESCE(ps2.utr_number, r2.transaction_id, ''), '\\s+', '', 'g')) AS norm_utr
      FROM tournament_registrations r2
      LEFT JOIN tournaments t2 ON t2.id = r2.tournament_id
      LEFT JOIN payment_submissions ps2 ON ps2.registration_id = r2.id
      WHERE UPPER(REGEXP_REPLACE(COALESCE(ps2.utr_number, r2.transaction_id, ''), '\\s+', '', 'g')) = ANY($1::text[])
        AND r2.id != ALL($2::text[])
        AND r2.status NOT IN ('cancelled', 'expired', 'rejected', 'PAYMENT_REJECTED')
    `;
    const dupRes = await pool.query(dupQuery, [utrList, regIds]);
    dupRes.rows.forEach(d => {
      if (!duplicateMap[d.norm_utr]) duplicateMap[d.norm_utr] = [];
      duplicateMap[d.norm_utr].push({
        registrationId: d.registration_id,
        teamName: d.team_name,
        tournamentId: d.tournament_id,
        tournamentTitle: d.tournament_title,
        status: d.reg_status
      });
    });
  }

  // 6. Format Items and Compute Flags
  const items = pageRows.map(row => {
    const rawUtr = row.payment_utr || row.transaction_id || '';
    const normUtr = normalizeUtr(rawUtr);
    const proofUrl = row.payment_proof_url || row.screenshot_url || null;

    const duePaise = toPaise(row.amount_due);
    const paidPaise = toPaise(row.amount_paid);
    const amountMismatch = (duePaise !== null && paidPaise !== null && duePaise !== paidPaise);

    const dupMatches = normUtr ? (duplicateMap[normUtr] || []) : [];
    const isDuplicate = dupMatches.length > 0;
    const missingUtr = !normUtr;
    const missingProof = !proofUrl;

    const submittedAt = row.payment_submitted_at || row.reg_created_at;
    const waitingStr = formatWaitingTime(submittedAt);
    const ageStr = formatAge(row.reg_created_at);

    return {
      id: row.id,
      tournament_id: row.tournament_id,
      tournament_title: row.tournament_title || 'Untitled Tournament',
      tournament_game: row.tournament_game || 'BGMI',
      tournament_org_name: row.tournament_org_name || 'Organizer',
      user_id: row.user_id,
      team_name: row.team_name || 'Team',
      captain: row.captain || 'Captain',
      captain_uid: row.captain_uid || null,
      district_id: row.district_id || null,
      leader_name: row.leader_name || row.captain,
      leader_email: row.leader_email || null,
      slot_number: row.slot_number != null ? row.slot_number : null,
      status: row.reg_status,
      payment_status: row.payment_status || null,
      amount_due: row.amount_due != null ? parseFloat(row.amount_due).toFixed(2) : null,
      amount_paid: row.amount_paid != null ? parseFloat(row.amount_paid).toFixed(2) : null,
      raw_utr: rawUtr,
      normalized_utr: normUtr,
      payment_app: formatPaymentApp(row.ps_payment_app || row.reg_payment_app),
      proof_url: proofUrl,
      rejection_reason: row.rejection_reason || null,
      admin_notes: row.admin_notes || null,
      reviewed_by: row.reviewed_by || null,
      reviewer_name: row.reviewer_name || null,
      reviewed_at: row.reviewed_at || null,
      created_at: row.reg_created_at,
      submitted_at: submittedAt,
      waiting_time: waitingStr,
      age: ageStr,
      flags: {
        amount_mismatch: amountMismatch,
        duplicate_utr: isDuplicate,
        duplicate_utr_matches: dupMatches,
        missing_utr: missingUtr,
        missing_proof: missingProof,
        has_flags: Boolean(amountMismatch || isDuplicate || missingUtr || missingProof)
      }
    };
  });

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const lastItem = pageRows[pageRows.length - 1];
    nextCursor = (activeTab === 'pending_review' || activeTab === 'awaiting_payment')
      ? (lastItem.payment_submitted_at || lastItem.reg_created_at)
      : (lastItem.reviewed_at || lastItem.rejected_at || lastItem.reg_updated_at || lastItem.reg_created_at);
  }

  return {
    success: true,
    tab: activeTab,
    counts,
    items,
    nextCursor,
    hasMore
  };
}

/**
 * getItem: Returns a single review item with full verification data and flags.
 */
export async function getItem(pool, user, { registrationId, tournamentId = null }) {
  if (!registrationId) {
    return { statusCode: 400, success: false, error: 'INVALID_INPUT', message: 'registrationId is required.' };
  }

  const queryParams = [registrationId];
  let tidSql = '';
  if (tournamentId) {
    queryParams.push(tournamentId);
    tidSql = ` AND r.tournament_id = $2`;
  }

  const itemQuery = `
    SELECT
      r.id,
      r.tournament_id,
      r.user_id,
      r.team_name,
      r.captain,
      r.captain_uid,
      r.slot_number,
      r.status AS reg_status,
      r.amount_due,
      r.transaction_id,
      r.payment_app AS reg_payment_app,
      r.screenshot_url,
      r.rejection_reason,
      r.rejected_at,
      r.created_at AS reg_created_at,
      r.updated_at AS reg_updated_at,
      r.members,
      t.title AS tournament_title,
      t.game AS tournament_game,
      t.entry_fee_amount AS tournament_entry_fee,
      t."orgId" AS tournament_org_id,
      t.org_id AS tournament_org_id_alt,
      COALESCE(t."orgName", t.org_name, 'Organizer') AS tournament_org_name,
      ps.id AS payment_submission_id,
      ps.amount AS amount_paid,
      ps.proof_url AS payment_proof_url,
      ps.utr_number AS payment_utr,
      ps.payment_app AS ps_payment_app,
      ps.payment_status,
      ps.admin_notes,
      ps.reviewed_by,
      ps.reviewed_at,
      ps.created_at AS payment_submitted_at,
      u.name AS leader_name,
      u.email AS leader_email,
      u.district_id,
      rev.name AS reviewer_name
    FROM tournament_registrations r
    LEFT JOIN tournaments t ON t.id = r.tournament_id
    LEFT JOIN payment_submissions ps ON ps.registration_id = r.id
    LEFT JOIN users u ON u.id = r.user_id
    LEFT JOIN users rev ON rev.id = ps.reviewed_by
    WHERE r.id = $1 ${tidSql}
    LIMIT 1
  `;
  const res = await pool.query(itemQuery, queryParams);
  if (res.rows.length === 0) {
    return { statusCode: 404, success: false, error: 'NOT_FOUND', message: 'Registration not found.' };
  }

  const row = res.rows[0];
  const perm = checkReviewerPermissions(user, row, 'view');
  if (!perm.authorized) return perm;

  const rawUtr = row.payment_utr || row.transaction_id || '';
  const normUtr = normalizeUtr(rawUtr);
  const proofUrl = row.payment_proof_url || row.screenshot_url || null;

  const duePaise = toPaise(row.amount_due);
  const paidPaise = toPaise(row.amount_paid);
  const amountMismatch = (duePaise !== null && paidPaise !== null && duePaise !== paidPaise);

  let dupMatches = [];
  if (normUtr && normUtr.length >= 6) {
    const dupRes = await pool.query(
      `SELECT r2.id AS registration_id, r2.team_name, r2.tournament_id, t2.title AS tournament_title, r2.status AS reg_status
       FROM tournament_registrations r2
       LEFT JOIN tournaments t2 ON t2.id = r2.tournament_id
       LEFT JOIN payment_submissions ps2 ON ps2.registration_id = r2.id
       WHERE UPPER(REGEXP_REPLACE(COALESCE(ps2.utr_number, r2.transaction_id, ''), '\\s+', '', 'g')) = $1
         AND r2.id != $2
         AND r2.status NOT IN ('cancelled', 'expired', 'rejected', 'PAYMENT_REJECTED')`,
      [normUtr, row.id]
    );
    dupMatches = dupRes.rows.map(d => ({
      registrationId: d.registration_id,
      teamName: d.team_name,
      tournamentId: d.tournament_id,
      tournamentTitle: d.tournament_title,
      status: d.reg_status
    }));
  }

  const item = {
    id: row.id,
    tournament_id: row.tournament_id,
    tournament_title: row.tournament_title || 'Untitled Tournament',
    tournament_game: row.tournament_game || 'BGMI',
    tournament_org_name: row.tournament_org_name || 'Organizer',
    user_id: row.user_id,
    team_name: row.team_name || 'Team',
    captain: row.captain || 'Captain',
    captain_uid: row.captain_uid || null,
    district_id: row.district_id || null,
    leader_name: row.leader_name || row.captain,
    leader_email: row.leader_email || null,
    slot_number: row.slot_number != null ? row.slot_number : null,
    status: row.reg_status,
    payment_status: row.payment_status || null,
    amount_due: row.amount_due != null ? parseFloat(row.amount_due).toFixed(2) : null,
    amount_paid: row.amount_paid != null ? parseFloat(row.amount_paid).toFixed(2) : null,
    raw_utr: rawUtr,
    normalized_utr: normUtr,
    payment_app: formatPaymentApp(row.ps_payment_app || row.reg_payment_app),
    proof_url: proofUrl,
    rejection_reason: row.rejection_reason || null,
    admin_notes: row.admin_notes || null,
    reviewed_by: row.reviewed_by || null,
    reviewer_name: row.reviewer_name || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.reg_created_at,
    submitted_at: row.payment_submitted_at || row.reg_created_at,
    waiting_time: formatWaitingTime(row.payment_submitted_at || row.reg_created_at),
    age: formatAge(row.reg_created_at),
    members: row.members ? (typeof row.members === 'string' ? JSON.parse(row.members) : row.members) : [],
    flags: {
      amount_mismatch: amountMismatch,
      duplicate_utr: dupMatches.length > 0,
      duplicate_utr_matches: dupMatches,
      missing_utr: !normUtr,
      missing_proof: !proofUrl,
      has_flags: Boolean(amountMismatch || dupMatches.length > 0 || !normUtr || !proofUrl)
    }
  };

  return { success: true, item };
}

/**
 * approve: Concurrency-safe atomic transaction for approving a payment registration.
 */
export async function approve(pool, user, { registrationId, tournamentId, note = '' }) {
  if (!registrationId) {
    return { statusCode: 400, success: false, error: 'INVALID_INPUT', message: 'registrationId is required.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock registration row with tournament lock
    const tidClause = tournamentId ? 'AND r.tournament_id = $2' : '';
    const tidParams = tournamentId ? [registrationId, tournamentId] : [registrationId];
    const regRes = await client.query(
      `SELECT r.*, t.title AS tournament_title, t."orgId" AS tournament_org_id, t.org_id AS tournament_org_id_alt, t."slotsTotal"
       FROM tournament_registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.id = $1 ${tidClause}
       FOR UPDATE OF r`,
      tidParams
    );
    if (regRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 404, success: false, error: 'NOT_FOUND', message: 'Registration not found.' };
    }
    const reg = regRes.rows[0];
    const actualTournamentId = reg.tournament_id;

    // 2. Lock payment_submissions row if exists
    const payRes = await client.query(
      `SELECT * FROM payment_submissions WHERE registration_id = $1 FOR UPDATE`,
      [registrationId]
    );
    const payment = payRes.rows[0] || null;

    // 3. Permission check
    const perm = checkReviewerPermissions(user, reg, 'approve');
    if (!perm.authorized) {
      await client.query('ROLLBACK');
      return perm;
    }

    const reviewerId = String(user.id || user.uid || user.userId || 'admin');

    // 4. Idempotency & Concurrency check
    const currentStatus = (reg.status || '').toLowerCase();
    if (currentStatus === 'approved' || currentStatus === 'confirmed') {
      await client.query('COMMIT');
      return { success: true, idempotent: true, message: 'Registration is already approved.', registration: reg };
    }

    const allowedStatuses = [
      'pending',
      'pending_payment',
      'pending_admin_review',
      'pending_payment_verification',
      'pending_verification',
      'verified_by_host',
      'waitlisted',
      'submitted'
    ];
    if (!allowedStatuses.includes(currentStatus)) {
      let reviewerName = 'another reviewer';
      let reviewedAt = reg.updated_at || reg.created_at;
      if (payment && payment.reviewed_by) {
        const uRes = await client.query('SELECT name FROM users WHERE id = $1', [payment.reviewed_by]);
        if (uRes.rows.length > 0) reviewerName = uRes.rows[0].name;
        if (payment.reviewed_at) reviewedAt = payment.reviewed_at;
      }
      const formattedTime = formatIST12h(reviewedAt);
      await client.query('ROLLBACK');
      return {
        statusCode: 409,
        success: false,
        error: 'CONFLICT',
        message: `Already handled by ${reviewerName} at ${formattedTime}.`
      };
    }

    // 5. Update registration status
    const updRegRes = await client.query(
      `UPDATE tournament_registrations
       SET status = 'approved', updated_at = NOW(), rejection_reason = NULL, rejected_at = NULL
       WHERE id = $1 AND tournament_id = $2
       RETURNING *`,
      [registrationId, actualTournamentId]
    );
    const updatedReg = updRegRes.rows[0];

    // 6. Update payment_submissions
    if (payment) {
      await client.query(
        `UPDATE payment_submissions
         SET payment_status = 'verified', reviewed_by = $1, reviewed_at = NOW(), admin_notes = COALESCE($2, admin_notes), updated_at = NOW()
         WHERE id = $3`,
        [reviewerId, note || null, payment.id]
      );
    }

    // 7. Ensure team squad is created
    await ensureTeamForRegistrationSafe(client, actualTournamentId, reg.user_id, reg.team_name, registrationId);

    // 8. Write audit entry INSIDE transaction
    const logId = 'LOG-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    await client.query(
      `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, target_user, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        logId,
        reviewerId,
        'payment_approved',
        'payment_approved',
        'registration',
        registrationId,
        reg.user_id || null,
        JSON.stringify({
          note: note || null,
          previousStatus: currentStatus,
          teamName: reg.team_name,
          tournamentTitle: reg.tournament_title
        })
      ]
    );

    // 9. Write alert player notification INSIDE transaction (if player has user record)
    if (reg.user_id) {
      const alertId = 'ALT-' + crypto.randomBytes(8).toString('hex').toUpperCase();
      await client.query(
        `INSERT INTO alerts (id, user_id, title, message, tournament_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())`,
        [
          alertId,
          reg.user_id,
          'Registration Approved ✅',
          `Your team "${reg.team_name}" has been approved for ${reg.tournament_title}. Slot #${reg.slot_number || 'allocated'} secured!`,
          actualTournamentId
        ]
      );
    }

    await client.query('COMMIT');

    // 10. Reconcile slots once after commit
    reconcileTournamentSlots(pool, actualTournamentId).catch(err => console.error('[paymentReviewService.approve] Slot reconciliation error:', err));

    return { success: true, message: 'Registration approved successfully.', registration: updatedReg };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[paymentReviewService.approve] Error approving registration ${registrationId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * reject: Concurrency-safe atomic transaction for rejecting a payment registration.
 */
export async function reject(pool, user, { registrationId, tournamentId, reason = 'other', note = '' }) {
  if (!registrationId) {
    return { statusCode: 400, success: false, error: 'INVALID_INPUT', message: 'registrationId is required.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock registration row with tournament lock
    const tidClause = tournamentId ? 'AND r.tournament_id = $2' : '';
    const tidParams = tournamentId ? [registrationId, tournamentId] : [registrationId];
    const regRes = await client.query(
      `SELECT r.*, t.title AS tournament_title, t."orgId" AS tournament_org_id, t.org_id AS tournament_org_id_alt
       FROM tournament_registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.id = $1 ${tidClause}
       FOR UPDATE OF r`,
      tidParams
    );
    if (regRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 404, success: false, error: 'NOT_FOUND', message: 'Registration not found.' };
    }
    const reg = regRes.rows[0];
    const actualTournamentId = reg.tournament_id;

    // 2. Lock payment_submissions row
    const payRes = await client.query(
      `SELECT * FROM payment_submissions WHERE registration_id = $1 FOR UPDATE`,
      [registrationId]
    );
    const payment = payRes.rows[0] || null;

    // 3. Permission check
    const perm = checkReviewerPermissions(user, reg, 'reject');
    if (!perm.authorized) {
      await client.query('ROLLBACK');
      return perm;
    }

    // 4. Idempotency & Concurrency check
    const currentStatus = (reg.status || '').toLowerCase();
    if (currentStatus === 'rejected' || currentStatus === 'payment_rejected') {
      await client.query('COMMIT');
      return { success: true, idempotent: true, message: 'Registration is already rejected.', registration: reg };
    }

    const allowedStatuses = [
      'pending',
      'pending_payment',
      'pending_admin_review',
      'pending_payment_verification',
      'pending_verification',
      'verified_by_host',
      'waitlisted',
      'submitted',
      'approved',
      'confirmed'
    ];
    if (!allowedStatuses.includes(currentStatus)) {
      let reviewerName = 'another reviewer';
      let reviewedAt = reg.updated_at || reg.created_at;
      if (payment && payment.reviewed_by) {
        const uRes = await client.query('SELECT name FROM users WHERE id = $1', [payment.reviewed_by]);
        if (uRes.rows.length > 0) reviewerName = uRes.rows[0].name;
        if (payment.reviewed_at) reviewedAt = payment.reviewed_at;
      }
      const formattedTime = formatIST12h(reviewedAt);
      await client.query('ROLLBACK');
      return {
        statusCode: 409,
        success: false,
        error: 'CONFLICT',
        message: `Already handled by ${reviewerName} at ${formattedTime}.`
      };
    }

    const reviewerId = String(user.id || user.uid || user.userId || 'admin');

    // 5. Resolve reason text and code
    const reasonCode = reason || 'other';
    const defaultText = REJECTION_REASONS[reasonCode] || 'Payment verification failed.';
    const reasonText = (reasonCode === 'other' || note)
      ? (note ? `${defaultText} Note: ${note.trim()}` : defaultText)
      : defaultText;

    // 6. Update registration status & release slot
    const updRegRes = await client.query(
      `UPDATE tournament_registrations
       SET status = 'rejected', slot_number = NULL, rejection_reason = $1, rejected_at = NOW(), updated_at = NOW()
       WHERE id = $2 AND tournament_id = $3
       RETURNING *`,
      [reasonText, registrationId, actualTournamentId]
    );
    const updatedReg = updRegRes.rows[0];

    // 7. Update payment_submissions
    if (payment) {
      await client.query(
        `UPDATE payment_submissions
         SET payment_status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), admin_notes = $2, updated_at = NOW()
         WHERE id = $3`,
        [reviewerId, reasonText, payment.id]
      );
    }

    // 8. Write audit entry INSIDE transaction
    const logId = 'LOG-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    await client.query(
      `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, target_user, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        logId,
        reviewerId,
        'payment_rejected',
        'payment_rejected',
        'registration',
        registrationId,
        reg.user_id || null,
        JSON.stringify({
          reasonCode,
          reasonText,
          note: note || null,
          teamName: reg.team_name,
          tournamentTitle: reg.tournament_title
        })
      ]
    );

    // 9. Write alert notification INSIDE transaction (if user record exists)
    if (reg.user_id) {
      const alertId = 'ALT-' + crypto.randomBytes(8).toString('hex').toUpperCase();
      await client.query(
        `INSERT INTO alerts (id, user_id, title, message, tournament_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())`,
        [
          alertId,
          reg.user_id,
          'Payment Proof Rejected ❌',
          `Payment proof for "${reg.team_name}" was rejected. Reason: ${reasonText}. You may re-upload correct proof from the tournament page.`,
          actualTournamentId
        ]
      );
    }

    await client.query('COMMIT');

    // 10. Reconcile slots once after commit
    reconcileTournamentSlots(pool, actualTournamentId).catch(err => console.error('[paymentReviewService.reject] Slot reconciliation error:', err));

    return { success: true, message: 'Registration rejected.', registration: updatedReg };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[paymentReviewService.reject] Error rejecting registration ${registrationId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * reopen: Moves an approved or rejected registration back to pending review (ADMIN ONLY).
 */
export async function reopen(pool, user, { registrationId, tournamentId, reason }) {
  if (!registrationId) {
    return { statusCode: 400, success: false, error: 'INVALID_INPUT', message: 'registrationId is required.' };
  }
  if (!reason || !reason.trim()) {
    return { statusCode: 400, success: false, error: 'REASON_REQUIRED', message: 'A reason is required to move a registration back to pending review.' };
  }

  // Strict Admin Check
  if (!hasRole(user, ROLES.ADMIN) && !isSystemAdmin(user)) {
    return { statusCode: 403, success: false, error: 'FORBIDDEN', message: 'Reopening verified registrations is strictly restricted to Administrators.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tidClause = tournamentId ? 'AND r.tournament_id = $2' : '';
    const tidParams = tournamentId ? [registrationId, tournamentId] : [registrationId];
    const regRes = await client.query(
      `SELECT r.*, t.title AS tournament_title
       FROM tournament_registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.id = $1 ${tidClause}
       FOR UPDATE OF r`,
      tidParams
    );
    if (regRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 404, success: false, error: 'NOT_FOUND', message: 'Registration not found.' };
    }
    const reg = regRes.rows[0];
    const actualTournamentId = reg.tournament_id;
    const reviewerId = String(user.id || user.uid || user.userId || 'admin');

    const currentStatus = (reg.status || '').toLowerCase();
    const reopenable = ['approved', 'confirmed', 'rejected', 'payment_rejected'];
    if (!reopenable.includes(currentStatus)) {
      await client.query('ROLLBACK');
      return { statusCode: 409, success: false, error: 'INVALID_STATUS', message: `Cannot reopen registration from status "${reg.status}". Must be approved or rejected.` };
    }

    // Update registration back to 'pending'
    const updRegRes = await client.query(
      `UPDATE tournament_registrations
       SET status = 'pending', rejection_reason = NULL, rejected_at = NULL, updated_at = NOW()
       WHERE id = $1 AND tournament_id = $2
       RETURNING *`,
      [registrationId, actualTournamentId]
    );
    const updatedReg = updRegRes.rows[0];

    // Update payment_submissions
    await client.query(
      `UPDATE payment_submissions
       SET payment_status = 'pending_admin_review', reviewed_by = NULL, reviewed_at = NULL, updated_at = NOW()
       WHERE registration_id = $1`,
      [registrationId]
    );

    // Write audit log entry
    const logId = 'LOG-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    await client.query(
      `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, target_user, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        logId,
        reviewerId,
        'payment_reopened',
        'payment_reopened',
        'registration',
        registrationId,
        reg.user_id || null,
        JSON.stringify({
          reason: reason.trim(),
          previousStatus: currentStatus,
          teamName: reg.team_name,
          tournamentTitle: reg.tournament_title
        })
      ]
    );

    // Write player notification (if player has user record)
    if (reg.user_id) {
      const alertId = 'ALT-' + crypto.randomBytes(8).toString('hex').toUpperCase();
      await client.query(
        `INSERT INTO alerts (id, user_id, title, message, tournament_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())`,
        [
          alertId,
          reg.user_id,
          'Registration Under Re-review ⏳',
          `Your registration for "${reg.team_name}" has been returned to pending review by an administrator. Reason: ${reason.trim()}`,
          actualTournamentId
        ]
      );
    }

    await client.query('COMMIT');
    reconcileTournamentSlots(pool, actualTournamentId).catch(err => console.error('[paymentReviewService.reopen] Slot reconciliation error:', err));

    return { success: true, message: 'Registration reopened and returned to pending review.', registration: updatedReg };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[paymentReviewService.reopen] Error reopening registration ${registrationId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * releaseSlot: Releases a reserved slot for registrations in 'pending_payment' with no proof submitted.
 */
export async function releaseSlot(pool, user, { registrationId, tournamentId, note = '' }) {
  if (!registrationId) {
    return { statusCode: 400, success: false, error: 'INVALID_INPUT', message: 'registrationId is required.' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tidClause = tournamentId ? 'AND r.tournament_id = $2' : '';
    const tidParams = tournamentId ? [registrationId, tournamentId] : [registrationId];
    const regRes = await client.query(
      `SELECT r.*, t.title AS tournament_title, t."orgId" AS tournament_org_id, t.org_id AS tournament_org_id_alt
       FROM tournament_registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.id = $1 ${tidClause}
       FOR UPDATE OF r`,
      tidParams
    );
    if (regRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return { statusCode: 404, success: false, error: 'NOT_FOUND', message: 'Registration not found.' };
    }
    const reg = regRes.rows[0];
    const actualTournamentId = reg.tournament_id;
    const reviewerId = String(user.id || user.uid || user.userId || 'admin');

    const perm = checkReviewerPermissions(user, reg, 'releaseSlot');
    if (!perm.authorized) {
      await client.query('ROLLBACK');
      return perm;
    }

    const currentStatus = (reg.status || '').toLowerCase();
    if (currentStatus === 'cancelled') {
      await client.query('COMMIT');
      return { success: true, idempotent: true, message: 'Slot has already been released.', registration: reg };
    }

    if (currentStatus !== 'pending_payment') {
      await client.query('ROLLBACK');
      return {
        statusCode: 409,
        success: false,
        error: 'INVALID_STATUS',
        message: `Cannot release slot for registration with status "${reg.status}". Only registrations awaiting payment can be cancelled.`
      };
    }

    // Update status to 'cancelled' and free slot
    const updRegRes = await client.query(
      `UPDATE tournament_registrations
       SET status = 'cancelled', slot_number = NULL, updated_at = NOW()
       WHERE id = $1 AND tournament_id = $2
       RETURNING *`,
      [registrationId, actualTournamentId]
    );
    const updatedReg = updRegRes.rows[0];

    // Write audit log entry
    const logId = 'LOG-' + crypto.randomBytes(8).toString('hex').toUpperCase();
    await client.query(
      `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, target_user, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        logId,
        reviewerId,
        'slot_released',
        'slot_released',
        'registration',
        registrationId,
        reg.user_id || null,
        JSON.stringify({
          note: note || null,
          teamName: reg.team_name,
          tournamentTitle: reg.tournament_title
        })
      ]
    );

    // Write player notification (if user record exists)
    if (reg.user_id) {
      const alertId = 'ALT-' + crypto.randomBytes(8).toString('hex').toUpperCase();
      await client.query(
        `INSERT INTO alerts (id, user_id, title, message, tournament_id, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())`,
        [
          alertId,
          reg.user_id,
          'Registration Slot Released',
          `Your reserved slot for "${reg.team_name}" in ${reg.tournament_title} has been released due to pending payment timeout.`,
          actualTournamentId
        ]
      );
    }

    await client.query('COMMIT');
    reconcileTournamentSlots(pool, actualTournamentId).catch(err => console.error('[paymentReviewService.releaseSlot] Slot reconciliation error:', err));

    return { success: true, message: 'Slot released and registration cancelled.', registration: updatedReg };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[paymentReviewService.releaseSlot] Error releasing slot for registration ${registrationId}:`, err);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * bulkApprove: Filters and approves clean items (no flags) up to 50 at a time.
 */
export async function bulkApprove(pool, user, { registrationIds }) {
  if (!Array.isArray(registrationIds) || registrationIds.length === 0) {
    return { statusCode: 400, success: false, error: 'INVALID_INPUT', message: 'registrationIds array is required.' };
  }

  const toProcess = registrationIds.slice(0, 50);
  const results = { approved: [], skipped: [], errors: [] };

  for (const regId of toProcess) {
    try {
      const itemRes = await getItem(pool, user, { registrationId: regId });
      if (!itemRes.success) {
        results.skipped.push({ id: regId, reason: itemRes.message || 'Item not found' });
        continue;
      }
      const item = itemRes.item;
      if (item.flags && item.flags.has_flags) {
        results.skipped.push({ id: regId, reason: 'Item has verification flags (must review manually)' });
        continue;
      }
      const statusLower = (item.status || '').toLowerCase();
      if (!['pending', 'verified_by_host'].includes(statusLower)) {
        results.skipped.push({ id: regId, reason: `Status is "${item.status}", expected pending review` });
        continue;
      }

      const approveRes = await approve(pool, user, {
        registrationId: regId,
        tournamentId: item.tournament_id,
        note: 'Bulk approved (clean verification)'
      });

      if (approveRes.success) {
        results.approved.push({ id: regId, teamName: item.team_name });
      } else {
        results.errors.push({ id: regId, error: approveRes.message });
      }
    } catch (err) {
      results.errors.push({ id: regId, error: err.message });
    }
  }

  return {
    success: true,
    results,
    approvedCount: results.approved.length,
    skippedCount: results.skipped.length,
    errorCount: results.errors.length,
    message: `Bulk approved ${results.approved.length} clean registrations (${results.skipped.length} skipped, ${results.errors.length} errors).`
  };
}
