/**
 * ONE shared rule for determining tournament organizer/owner mode across the entire application.
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
 * Returns { authorized: true } or { authorized: false, statusCode: 401|403, error, message }.
 *
 * @param {object|null|undefined} authUser
 * @param {object|null|undefined} tournament
 * @returns {{ authorized: boolean, statusCode?: number, error?: string, message?: string }}
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
