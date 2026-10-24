// server/accountRules.js
// Shared validation helpers for profile fields.

/**
 * Normalizes an Indian mobile number to its 10 digits. Accepts "+91 98765 43210",
 * "09876543210", "9876543210". Returns null when invalid (must start with 6-9).
 */
export function normalizeIndianMobile(value) {
  if (value === undefined || value === null) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

/** Lower-cases/trims an email and validates a conservative shape. Returns null when invalid. */
export function normalizeEmailAddress(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}
