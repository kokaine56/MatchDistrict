// ============================================================
// Match District — Tournament Promotion (Trending & Featured)
// ------------------------------------------------------------
// Pure, dependency-free domain logic shared by the HTTP server
// (server.js) and the automated test-suite. Keeping the rules here
// means eligibility, ordering, expiry and validation are defined
// exactly once and can be unit-tested without a database.
// ============================================================

export const PROMOTION_PLACEMENTS = Object.freeze({
  TRENDING: 'trending',
  FEATURED: 'featured',
  BOTH: 'trending_featured',
});

export const PLACEMENT_VALUES = Object.freeze(Object.values(PROMOTION_PLACEMENTS));

// Human-facing priority presets mapped to an explicit numeric priority.
// Higher number wins. Administrators may also submit any integer in range.
export const PRIORITY_LEVELS = Object.freeze({
  low: 0,
  normal: 0,
  high: 50,
  top: 100,
});

export const PRIORITY_LABELS = Object.freeze({
  0: 'Normal',
  50: 'High',
  100: 'Top priority',
});

export const MIN_PRIORITY = 0;
export const MAX_PRIORITY = 100;
export const MAX_DISPLAY_ORDER = 10000;

// Centrally configured default for how many tournaments appear in the
// promoted section. Stored in site_settings under `promoted_section_limit`.
export const DEFAULT_PROMOTED_LIMIT = 12;
export const MIN_PROMOTED_LIMIT = 1;
export const MAX_PROMOTED_LIMIT = 50;
export const PROMOTED_LIMIT_SETTING_KEY = 'promoted_section_limit';

export const ROLES_ADMIN = 'admin';

/**
 * Normalizes a server-side user/roles value into a plain roles array.
 * Accepts: a user row `{ roles: [...], role }`, a roles array, or a role string.
 */
export function resolveRoles(user) {
  if (!user) return [];
  if (Array.isArray(user)) return user.filter((r) => typeof r === 'string');
  if (Array.isArray(user.roles) && user.roles.length > 0) return user.roles.filter((r) => typeof r === 'string');
  if (typeof user.role === 'string' && user.role) return [user.role];
  return [];
}

/**
 * Authoritative authorization predicate for promotion management.
 * Must be called with the roles loaded from the database — never with
 * client-supplied role claims. Admin membership grants access.
 */
export function canManagePromotions(user) {
  return resolveRoles(user).includes(ROLES_ADMIN);
}

/** Returns a valid placement value or null. */
export function normalizePlacement(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  return PLACEMENT_VALUES.includes(v) ? v : null;
}

/** Clamps/parses a numeric priority, defaulting when absent/blank/invalid. */
export function normalizePriority(value, fallback = PRIORITY_LEVELS.normal) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < MIN_PRIORITY) return MIN_PRIORITY;
  if (n > MAX_PRIORITY) return MAX_PRIORITY;
  return n;
}

/** Clamps/parses an explicit display order, defaulting when absent/blank/invalid. */
export function normalizeDisplayOrder(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > MAX_DISPLAY_ORDER) return MAX_DISPLAY_ORDER;
  return n;
}

/**
 * Converts a date input to an ISO (UTC) string, or returns null for
 * empty/absent values. Returns `undefined` only when the value is present
 * but unparseable, so callers can distinguish "clear" from "invalid".
 */
export function normalizeTimestamp(value) {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Validates a promotion payload. Never trusts the client for identity,
 * priority bounds, placement membership or schedule coherence.
 * @returns {{ ok: boolean, errors: string[], value: object }}
 */
export function validatePromotionPayload(payload = {}) {
  const errors = [];
  const src = payload && typeof payload === 'object' ? payload : {};

  const placement = normalizePlacement(src.placement);
  if (!placement) {
    errors.push(`placement must be one of: ${PLACEMENT_VALUES.join(', ')}`);
  }

  let isActive = true;
  if (src.is_active !== undefined && src.is_active !== null) {
    if (typeof src.is_active === 'boolean') isActive = src.is_active;
    else if (src.is_active === 'true' || src.is_active === 1 || src.is_active === '1') isActive = true;
    else if (src.is_active === 'false' || src.is_active === 0 || src.is_active === '0') isActive = false;
    else errors.push('is_active must be a boolean');
  }

  const priority = normalizePriority(src.priority);
  const displayOrder = normalizeDisplayOrder(src.display_order);

  let startsAt = null;
  if (src.starts_at !== undefined) {
    const parsed = normalizeTimestamp(src.starts_at);
    if (parsed === undefined) errors.push('starts_at is not a valid date/time');
    else startsAt = parsed;
  }

  let endsAt = null;
  if (src.ends_at !== undefined) {
    const parsed = normalizeTimestamp(src.ends_at);
    if (parsed === undefined) errors.push('ends_at is not a valid date/time');
    else endsAt = parsed;
  }

  if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    errors.push('ends_at must be after starts_at');
  }

  return {
    ok: errors.length === 0,
    errors,
    value: {
      is_active: isActive,
      placement: placement || PROMOTION_PLACEMENTS.BOTH,
      priority,
      display_order: displayOrder,
      starts_at: startsAt,
      ends_at: endsAt,
    },
  };
}

/**
 * True only when a promotion is enabled AND now falls inside its window.
 * `nowMs` is injectable for deterministic tests. The server relies on the
 * database clock, but this mirrors those semantics for unit tests and UI.
 */
export function isPromotionActive(promotion, nowMs = Date.now()) {
  if (!promotion || promotion.is_active !== true) return false;
  const start = promotion.starts_at ? new Date(promotion.starts_at).getTime() : null;
  const end = promotion.ends_at ? new Date(promotion.ends_at).getTime() : null;
  if (start !== null && !Number.isNaN(start) && nowMs < start) return false;
  if (end !== null && !Number.isNaN(end) && nowMs > end) return false;
  return true;
}

/**
 * Whether a placement value qualifies a tournament for a section
 * ('trending' or 'featured'). "trending_featured" covers both.
 */
export function placementIncludes(placement, section) {
  const p = normalizePlacement(placement);
  const s = normalizePlacement(section);
  if (!p || !s) return false;
  if (p === PROMOTION_PLACEMENTS.BOTH) return true;
  return p === s;
}

/**
 * Deterministic ordering:
 *   1. Highest priority first.
 *   2. Lowest explicit display_order next.
 *   3. Earliest promotion created_at next.
 *   4. Stable id tie-break.
 */
export function sortPromotions(list = []) {
  return [...list].sort((a, b) => {
    const pa = normalizePriority(a && a.priority);
    const pb = normalizePriority(b && b.priority);
    if (pb !== pa) return pb - pa;

    const oa = normalizeDisplayOrder(a && a.display_order);
    const ob = normalizeDisplayOrder(b && b.display_order);
    if (oa !== ob) return oa - ob;

    const ta = a && a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b && b.created_at ? new Date(b.created_at).getTime() : 0;
    const safeTa = Number.isNaN(ta) ? 0 : ta;
    const safeTb = Number.isNaN(tb) ? 0 : tb;
    if (safeTa !== safeTb) return safeTa - safeTb;

    return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
  });
}

/**
 * Removes any duplicate rows for the same tournament so a tournament can
 * never render twice even if upstream data is inconsistent.
 */
export function dedupePromotionsByTournament(list = []) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item) continue;
    const key = item.tournament_id ?? item.id;
    if (key === undefined || key === null) continue;
    const k = String(key);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Clamps/parses a display limit value, falling back to the given default. */
export function parseDisplayLimit(value, fallback = DEFAULT_PROMOTED_LIMIT) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < MIN_PROMOTED_LIMIT) return MIN_PROMOTED_LIMIT;
  if (n > MAX_PROMOTED_LIMIT) return MAX_PROMOTED_LIMIT;
  return n;
}

/** Projects a promotion row down to the fields safe for a public response. */
export function toPublicPromotion(row) {
  if (!row) return null;
  return {
    tournament_id: row.tournament_id,
    placement: normalizePlacement(row.placement) || PROMOTION_PLACEMENTS.BOTH,
    priority: normalizePriority(row.priority),
    display_order: normalizeDisplayOrder(row.display_order),
    is_active: row.is_active === true,
    starts_at: row.starts_at || null,
    ends_at: row.ends_at || null,
  };
}
