// server/userUtils.js
// Authoritative shared utilities for user display names, identity fallbacks, and privacy redaction.
// Enforces schema compliance: uses only real columns (name, "gamerTag", email) with fallbacks.
// NEVER returns or exposes full email addresses to other users.

/**
 * Returns the raw SQL expression that computes a user's display name from real database columns.
 * Fallback order:
 *  1. Non-empty users.name
 *  2. Non-empty users."gamerTag"
 *  3. Local part of users.email (split before '@')
 *  4. Default string 'Player'
 *
 * @param {string} [alias='u'] - Table alias or empty string if unqualified
 * @returns {string} Safe SQL expression
 */
export function userDisplayNameRawSql(alias = 'u') {
  const p = alias && alias.trim() ? `${alias.trim()}.` : '';
  return `COALESCE(NULLIF(${p}name, ''), NULLIF(${p}"gamerTag", ''), NULLIF(split_part(${p}email, '@', 1), ''), 'Player')`;
}

/**
 * Returns the SQL projection fragment with an alias (defaults to AS display_name).
 *
 * @param {string} [alias='u'] - Table alias or empty string
 * @param {string|null} [colAlias='display_name'] - Result column alias, or null for expression only
 * @returns {string}
 */
export function userDisplayNameSql(alias = 'u', colAlias = 'display_name') {
  const expr = userDisplayNameRawSql(alias);
  return colAlias ? `${expr} AS ${colAlias}` : expr;
}

/**
 * Formats a user record into a safe, non-empty display name.
 *
 * @param {object|null|undefined} user
 * @returns {string}
 */
export function formatUserDisplayName(user) {
  if (!user || typeof user !== 'object') return 'Player';
  if (user.display_name && typeof user.display_name === 'string' && user.display_name.trim()) {
    return user.display_name.trim();
  }
  if (user.name && typeof user.name === 'string' && user.name.trim()) {
    return user.name.trim();
  }
  if (user.gamerTag && typeof user.gamerTag === 'string' && user.gamerTag.trim()) {
    return user.gamerTag.trim();
  }
  if (user['gamerTag'] && typeof user['gamerTag'] === 'string' && user['gamerTag'].trim()) {
    return user['gamerTag'].trim();
  }
  if (user.email && typeof user.email === 'string' && user.email.includes('@')) {
    const local = user.email.split('@')[0].trim();
    if (local) return local;
  }
  return 'Player';
}

/**
 * Masks an email address to protect user privacy (e.g., ab***@domain.com).
 * Never exposes the full email address to unauthorized/public users.
 *
 * @param {string|null|undefined} email
 * @returns {string|null}
 */
export function maskUserEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return null;
  const [local, domain] = email.split('@');
  if (!domain) return null;
  const visibleLen = Math.min(2, local.length);
  const maskedLocal = local.slice(0, visibleLen) + '***';
  return `${maskedLocal}@${domain}`;
}

/**
 * Sanitizes a user database row for public consumption, stripping private credentials,
 * TOTP secrets, tokens, and redacting full email/phone.
 *
 * @param {object|null|undefined} user
 * @returns {object|null}
 */
export function sanitizeUserForPublic(user) {
  if (!user || typeof user !== 'object') return null;
  const safe = { ...user };
  delete safe.password;
  delete safe.admin_totp_secret;
  delete safe.admin_totp_activated;
  delete safe.kycDoc;

  safe.display_name = formatUserDisplayName(user);
  if (safe.email) {
    safe.masked_email = maskUserEmail(safe.email);
    delete safe.email;
  }
  if (safe.phone) {
    delete safe.phone;
  }
  return safe;
}
