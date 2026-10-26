// ============================================================
// Match District — IAM Role Hierarchy & Capability Engine
// Multi-Role Array Model
// ============================================================
// Every user has a `roles` array (e.g. ["user", "organiser"]).
// Admin in the array grants automatic system-wide override.
//
// Role inheritance model:
//   admin (4) → organiser (3) → reg_payment_verifier (2) → user (1)
//
// USAGE:
//   import { ROLES, hasRole, hasOrganizerRights,
//            hasCapability, isSystemAdmin } from '../utils/iamRoles.js'
// ============================================================

export const ROLES = Object.freeze({
  ADMIN:               'admin',
  ORGANISER:           'organiser',
  REG_PAYMENT_VERIFIER: 'reg_payment_verifier',
  USER:                'user',
})

export const ROLE_HIERARCHY = Object.freeze({
  [ROLES.USER]:               1,
  [ROLES.REG_PAYMENT_VERIFIER]: 2,
  [ROLES.ORGANISER]:           3,
  [ROLES.ADMIN]:              4,
})

const PERMISSIONS = Object.freeze({
  PUBLISH_TOURNAMENT: [ROLES.ADMIN, ROLES.ORGANISER],
  VERIFY_PAYMENTS:    [ROLES.ADMIN, ROLES.REG_PAYMENT_VERIFIER],
  MANAGE_ROLES:       [ROLES.ADMIN],
})

/**
 * Normalizes a user object to always return a roles array.
 * Handles backward compatibility: if user object has `role` string but no `roles`,
 * wraps it in an array.
 * Accepts a plain string role as shorthand.
 *
 * @param {object|string|null} user - User object with `roles`/`role`, or plain role string
 * @returns {string[]}
 */
export const getUserRoles = (user) => {
  if (!user) return []
  if (typeof user === 'string') return [user]
  if (user.roles && Array.isArray(user.roles) && user.roles.length > 0) return user.roles
  if (user.role) return [user.role]
  return []
}

/**
 * Pure function: checks if a roles array includes the target role.
 * Admin automatically passes all role checks.
 *
 * @param {string[]} roles       - Array of role strings
 * @param {string}   targetRole  - The role to check for
 * @returns {boolean}
 */
export const hasRole = (userOrRoles, targetRole) => {
  if (!userOrRoles || !targetRole) return false
  const roles = Array.isArray(userOrRoles) ? userOrRoles : getUserRoles(userOrRoles)
  if (roles.includes(ROLES.ADMIN)) return true
  return roles.includes(targetRole)
}

/**
 * Checks if a user object's roles have sufficient hierarchical clearance.
 * Accepts user object OR plain role string.
 *
 * @param {object|string|null} user        - User object or role string
 * @param {string}              requiredRole - Minimum role required
 * @returns {boolean}
 */
export const hasRoleClearance = (user, requiredRole) => {
  if (!user || !requiredRole) return false
  const roles = getUserRoles(user)
  if (roles.includes(ROLES.ADMIN)) return true
  let userLevel = 0
  for (const r of roles) {
    const level = ROLE_HIERARCHY[r] ?? 0
    if (level > userLevel) userLevel = level
  }
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? Infinity
  return userLevel >= requiredLevel
}

/**
 * Validates if a user has the required capability.
 * Accepts user object OR plain role string.
 *
 * @param {object|string|null} user       - User object or role string
 * @param {string}             capability - Key from PERMISSIONS matrix
 * @returns {boolean}
 */
export const hasCapability = (user, capability) => {
  if (!user || !capability) return false
  const roles = getUserRoles(user)
  if (roles.includes(ROLES.ADMIN)) return true
  const authorizedRoles = PERMISSIONS[capability]
  if (!authorizedRoles) return false
  return roles.some(r => authorizedRoles.includes(r))
}

/**
 * Returns true if the user has at least organiser-level clearance.
 *
 * @param {object|string|null} user - User object or role string
 * @returns {boolean}
 */
export const hasOrganizerRights = (user) => {
  if (!user) return false
  return hasRoleClearance(user, ROLES.ORGANISER)
}

/**
 * Returns true if the user has admin-level clearance.
 *
 * @param {object|string|null} user - User object or role string
 * @returns {boolean}
 */
export const hasAdminRights = (user) => {
  if (!user) return false
  return hasRoleClearance(user, ROLES.ADMIN)
}

/**
 * Clean boolean predicate: is this user a system administrator?
 * Checks the roles array for 'admin' directly.
 *
 * @param {object|string|null} user - User object or role string
 * @returns {boolean}
 */
export const isSystemAdmin = (user) => {
  if (!user) return false
  const roles = getUserRoles(user)
  return roles.includes(ROLES.ADMIN)
}

/**
 * Returns the effective host/organizer brand label.
 *
 * @param {object|null} user    - User object
 * @param {string} [fallback='Match District']
 * @returns {string}
 */
export const getEffectiveHostLabel = (user, fallback = 'Match District') => {
  if (!user) return fallback
  if (isSystemAdmin(user)) return fallback
  return user.orgName || fallback
}

/**
 * Human-readable labels for each role.
 */
export const ROLE_LABELS = Object.freeze({
  [ROLES.ADMIN]:               'Administrator',
  [ROLES.ORGANISER]:           'Organiser',
  [ROLES.REG_PAYMENT_VERIFIER]: 'Payment Verifier',
  [ROLES.USER]:                'User',
})

/**
 * Returns the next role up in the hierarchy, or null if already max.
 */
export const getNextPromotionRole = (currentRole) => {
  const order = [ROLES.USER, ROLES.REG_PAYMENT_VERIFIER, ROLES.ORGANISER, ROLES.ADMIN]
  const idx = order.indexOf(currentRole)
  if (idx === -1 || idx >= order.length - 1) return null
  return order[idx + 1]
}

/**
 * Returns the previous role down in the hierarchy, or null if already min.
 */
export const getNextDemotionRole = (currentRole) => {
  const order = [ROLES.USER, ROLES.REG_PAYMENT_VERIFIER, ROLES.ORGANISER, ROLES.ADMIN]
  const idx = order.indexOf(currentRole)
  if (idx <= 0) return null
  return order[idx - 1]
}
