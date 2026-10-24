/**
 * userStorage.js
 *
 * Pure sanitization and shape-normalization utilities for user profile records.
 * All localStorage/sessionStorage dependencies have been removed.
 * Profile state now lives exclusively in Supabase (server) and UserContext (memory).
 */

const MAX_IMAGE_URL_LENGTH = 2048;

/** Only allow http(s) image URLs — never base64 blobs in DB payloads from the client */
export function sanitizeImageUrl(value) {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) return null;
  if (trimmed.length > MAX_IMAGE_URL_LENGTH) return null;
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

export function sanitizeUserRecord(user) {
  if (!user || typeof user !== 'object') return null;
  const { password, ...rest } = user;
  return {
    ...rest,
    avatar: sanitizeImageUrl(rest.avatar),
    banner: sanitizeImageUrl(rest.banner),
  };
}

/**
 * Safely parse and sanitize a user record from any source (API response, etc.).
 * Returns null if the input is invalid or unparseable.
 */
export function parseStoredUser(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return sanitizeUserRecord(parsed);
  } catch {
    return null;
  }
}

/**
 * Sanitize a user record and dispatch a profile-change event for components
 * that listen on window (e.g. Header). Does NOT write to localStorage.
 */
export function setStoredUser(user) {
  const safe = sanitizeUserRecord(user);
  // Notify dependent components about the profile update
  window.dispatchEvent(new Event('userprofilechange'));
  return safe;
}

export function buildPlayerProfilePayload(form) {
  return {
    name: form.name,
    email: form.email,
    phone: form.phone,
    experience: form.bio,
    avatar: sanitizeImageUrl(form.avatar),
    banner: sanitizeImageUrl(form.banner),
    riotId: form.riotId,
    bgmiId: form.bgmiId,
    steamId: form.steamId,
    discordTag: form.discordTag,
  };
}

export function buildOrgProfilePayload(form) {
  return {
    name: form.name,
    tier: form.tier,
    avatar: sanitizeImageUrl(form.logo),
    banner: sanitizeImageUrl(form.banner),
    experience: form.bio,
  };
}
