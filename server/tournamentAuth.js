// server/tournamentAuth.js
/**
 * ONE shared rule for determining tournament organizer/owner mode on the server.
 *
 * Rules:
 * 1. Viewer must be authenticated (user object present and non-null).
 * 2. If the user's role is admin (or roles array includes 'admin'), returns true.
 * 3. Otherwise, returns true ONLY when user ID and tournament orgId are BOTH non-empty strings and strictly equal.
 * 4. Default is ALWAYS false (including while loading, unauthenticated, partial objects, or missing/empty/undefined IDs).
 *
 * @param {object|null|undefined} user
 * @param {object|null|undefined} tournament
 * @returns {boolean}
 */
export function isTournamentOrganizer(user, tournament) {
  if (!user || typeof user !== 'object') return false;

  // Admin override (system admins have full host access)
  if (
    user.role === 'admin' ||
    user.role === 'superadmin' ||
    user.is_admin === true ||
    user.isAdmin === true ||
    (Array.isArray(user.roles) && (user.roles.includes('admin') || user.roles.includes('superadmin')))
  ) {
    return true;
  }

  // Non-empty user id required
  const rawUserId = user.id ?? user.userId ?? user.uid;
  if (rawUserId === null || rawUserId === undefined) return false;
  const userId = String(rawUserId).trim();
  if (!userId) return false;

  if (!tournament || typeof tournament !== 'object') return false;

  // Non-empty tournament orgId required
  const rawOrgId =
    tournament.orgId ??
    tournament.organizer_id ??
    tournament.organizerId ??
    tournament.org_id ??
    tournament.created_by;
  if (rawOrgId === null || rawOrgId === undefined) return false;
  const orgId = String(rawOrgId).trim();
  if (!orgId) return false;

  return userId === orgId;
}

/**
 * Server-side guard helper.
 * Returns { authorized: true, statusCode: 200 } or { authorized: false, statusCode: 401|403, error, message }.
 *
 * @param {object|null|undefined} authUser
 * @param {object|null|undefined} tournament
 * @returns {{ authorized: boolean, statusCode: number, error?: string, message?: string }}
 */
export function checkTournamentOrganizerAccess(authUser, tournament) {
  if (!authUser || typeof authUser !== 'object') {
    return {
      authorized: false,
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Authentication required.',
    };
  }

  if (!isTournamentOrganizer(authUser, tournament)) {
    return {
      authorized: false,
      statusCode: 403,
      error: 'FORBIDDEN',
      message: 'Access denied. Only the tournament organizer or admin may perform this action.',
    };
  }

  return { authorized: true, statusCode: 200 };
}

/**
 * Server-side guard helper that checks organizer/admin access OR authorized staff permissions.
 *
 * @param {object|null|undefined} authUser
 * @param {object|null|undefined} tournament
 * @param {object|null|undefined} pool
 * @param {string} [requiredPermission='score_entry']
 * @returns {Promise<{ authorized: boolean, statusCode: number, error?: string, message?: string, isStaff?: boolean }>}
 */
export async function checkTournamentOrganizerOrStaffAccess(authUser, tournament, pool, requiredPermission = 'score_entry') {
  if (!authUser || typeof authUser !== 'object') {
    return {
      authorized: false,
      statusCode: 401,
      error: 'UNAUTHORIZED',
      message: 'Authentication required.',
    };
  }

  // 1. Check owner or platform admin
  if (isTournamentOrganizer(authUser, tournament)) {
    return { authorized: true, statusCode: 200, isStaff: false };
  }

  // 2. Check organizer staff members table if pool provided
  const rawOrgId =
    tournament?.orgId ??
    tournament?.organizer_id ??
    tournament?.organizerId ??
    tournament?.org_id ??
    tournament?.created_by;

  if (pool && rawOrgId && (authUser.email || authUser.id)) {
    try {
      const staffRes = await pool.query(
        `SELECT role, admin_role, permissions, status
         FROM staff_members
         WHERE organizer_id = $1::varchar
           AND (LOWER(email) = LOWER($2::varchar) OR id = $3::varchar)
           AND status = 'active'`,
        [String(rawOrgId).trim(), authUser.email || '', authUser.id || '']
      );

      if (staffRes.rows.length > 0) {
        const staff = staffRes.rows[0];
        const adminRole = (staff.admin_role || staff.role || '').toLowerCase();
        if (adminRole === 'admin' || adminRole === 'co-host' || adminRole === 'manager') {
          return { authorized: true, statusCode: 200, isStaff: true };
        }

        let perms = [];
        try {
          perms = typeof staff.permissions === 'string' ? JSON.parse(staff.permissions) : (staff.permissions || []);
        } catch {
          perms = [];
        }

        const validScorePerms = [
          'manage_tournaments',
          'edit_scores',
          'manage_scores',
          'scoring',
          'score_entry',
          requiredPermission,
        ];

        if (perms.some((p) => validScorePerms.includes(p))) {
          return { authorized: true, statusCode: 200, isStaff: true };
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }

  return {
    authorized: false,
    statusCode: 403,
    error: 'FORBIDDEN',
    message: 'Access denied. Only tournament organizers, administrators, or authorized scoring staff may perform this action.',
  };
}
