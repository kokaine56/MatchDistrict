// server/usernameValidator.js
// Single authoritative shared validator for MatchDistrict usernames.
// Used by both backend API routes and frontend profile / registration forms.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export const RESERVED_USERNAMES = Object.freeze(new Set([
  'admin',
  'administrator',
  'support',
  'matchdistrict',
  'match_district',
  'organizer',
  'organiser',
  'system',
  'mod',
  'moderator',
  'staff',
  'root',
  'api',
  'auth',
  'help',
  'billing',
  'official',
  'bot',
  'security',
  'null',
  'undefined',
  'everyone',
  'here',
]));

/**
 * Validates a candidate username against all site account rules:
 * - 3 to 32 characters
 * - lowercase letters, digits, underscore, and dot only
 * - no leading or trailing dot
 * - cannot consist entirely of digits
 * - not a reserved system username
 *
 * @param {string} username
 * @returns {{ valid: boolean, username?: string, error?: string, message?: string }}
 */
export function validateUsername(username) {
  if (username == null || typeof username !== 'string') {
    return {
      valid: false,
      error: 'INVALID_TYPE',
      message: 'Username must be a text string.'
    };
  }

  const trimmed = username.trim().toLowerCase();

  if (trimmed.length < USERNAME_MIN_LENGTH || trimmed.length > USERNAME_MAX_LENGTH) {
    return {
      valid: false,
      error: 'INVALID_LENGTH',
      message: `Username must be between ${USERNAME_MIN_LENGTH} and ${USERNAME_MAX_LENGTH} characters.`
    };
  }

  if (!/^[a-z0-9_.]+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'INVALID_CHARACTERS',
      message: 'Username may only contain lowercase letters, numbers, underscores, and dots.'
    };
  }

  if (trimmed.startsWith('.')) {
    return {
      valid: false,
      error: 'LEADING_DOT',
      message: 'Username cannot start with a dot.'
    };
  }

  if (trimmed.endsWith('.')) {
    return {
      valid: false,
      error: 'TRAILING_DOT',
      message: 'Username cannot end with a dot.'
    };
  }

  if (trimmed.includes('..')) {
    return {
      valid: false,
      error: 'CONSECUTIVE_DOTS',
      message: 'Username cannot contain consecutive dots.'
    };
  }

  if (/^\d+$/.test(trimmed)) {
    return {
      valid: false,
      error: 'ALL_DIGITS',
      message: 'Username cannot consist entirely of numbers.'
    };
  }

  if (RESERVED_USERNAMES.has(trimmed)) {
    return {
      valid: false,
      error: 'RESERVED_USERNAME',
      message: 'This username is reserved and cannot be registered.'
    };
  }

  return {
    valid: true,
    username: trimmed
  };
}

/**
 * Sanitizes an arbitrary string (Google profile name, Discord handle, or email prefix)
 * into a valid base candidate complying with username rules.
 *
 * @param {string} raw
 * @param {string} [fallback='player']
 * @returns {string}
 */
export function sanitizeToUsernameBase(raw, fallback = 'player') {
  if (!raw || typeof raw !== 'string') return fallback;

  let cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]+/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .replace(/^_+/, '')
    .replace(/_+$/, '');

  if (!cleaned || /^\d+$/.test(cleaned) || RESERVED_USERNAMES.has(cleaned)) {
    cleaned = `${fallback}_${cleaned || ''}`.replace(/_+$/, '');
  }

  if (cleaned.length < USERNAME_MIN_LENGTH) {
    cleaned = `${cleaned}_gamer`.slice(0, USERNAME_MAX_LENGTH);
    if (cleaned.length < USERNAME_MIN_LENGTH) cleaned = 'player_1';
  }

  if (cleaned.length > 26) {
    cleaned = cleaned.slice(0, 26).replace(/\.+$/, '').replace(/_+$/, '');
  }

  return cleaned;
}
