// server/roadmapConfig.js
// Pure configuration + district/scheduling mathematics for the dynamic
// tournament roadmap generator.
//
// This module is intentionally dependency-free so it can be unit tested
// without a database. It is the single source of truth for:
//   - district-count calculation        (computeDistrictCount)
//   - non-divisible district sizing     (distributeDistrictSizes)
//   - advancement defaults              (defaultTeamsAdvancing)
//   - organizer configuration parsing   (normalizeRoadmapConfig)
//   - configuration validation          (validateRoadmapConfig)
//   - deterministic match scheduling    (scheduleMatches)
//
// Nothing here reads the database or writes anything.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_TEAMS_PER_GROUP = 16;
export const DEFAULT_MATCHES_PER_DAY = 2;
export const DEFAULT_FIRST_MATCH_TIME = '13:00';
export const DEFAULT_MATCH_GAP_MINUTES = 60;
export const DEFAULT_MATCH_DURATION_MINUTES = 30;
export const DEFAULT_RELEASE_OFFSET_MINUTES = 15;

export const MAX_MATCHES_PER_DAY = 50;

/** True when `t` is a valid 24h "HH:MM" string. */
export function isValidTime(t) {
  return typeof t === 'string' && TIME_RE.test(t);
}

/** "HH:MM" -> minutes since midnight, or null when invalid. */
export function parseTimeToMinutes(t) {
  if (!isValidTime(t)) return null;
  const m = t.match(TIME_RE);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** minutes since midnight -> "HH:MM" (wraps across midnight). */
export function minutesToHHMM(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** minutes since midnight -> "hh:MM AM/PM" (wraps across midnight). */
export function minutesTo12h(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

/** Release time = start - offset, expressed as 12h clock text. */
export function releaseTimeFor(startTime, offsetMinutes = DEFAULT_RELEASE_OFFSET_MINUTES) {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return '';
  return minutesTo12h(start - offsetMinutes);
}

function pick(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const k of keys) {
    if (source[k] !== undefined && source[k] !== null && source[k] !== '') return source[k];
  }
  return undefined;
}

function toInt(v, fallback) {
  const n = typeof v === 'number' ? v : parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function toBool(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1 || v === '1') return true;
  if (v === 'false' || v === 0 || v === '0') return false;
  return fallback;
}

/** ceil(slots / teamsPerGroup), or 0 when the inputs are not usable. */
export function computeDistrictCount(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal);
  const tpg = Number(teamsPerGroup);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(tpg) || tpg <= 0) return 0;
  return Math.ceil(total / tpg);
}

// Sizes of each district. Equal when divisible; otherwise the earlier
// districts absorb the remainder (smallest possible imbalance) so no team is
// discarded and the final district is never larger than the others.
export function distributeDistrictSizes(slotsTotal, teamsPerGroup) {
  const total = Number(slotsTotal);
  const tpg = Math.floor(Number(teamsPerGroup));
  if (!Number.isFinite(total) || total <= 0) return [];
  if (!Number.isFinite(tpg) || tpg <= 0) return [];
  const count = computeDistrictCount(total, tpg);
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const extra = total % count;
  const sizes = [];
  for (let i = 0; i < count; i++) sizes.push(i < extra ? base + 1 : base);
  return sizes;
}

/** Default number of teams advancing from a district of `size` teams. */
export function defaultTeamsAdvancing(size) {
  const n = Number(size) || 0;
  if (n <= 1) return n;
  return Math.ceil(n / 2);
}

/**
 * Normalize any organizer/tournament source object into a stable roadmap
 * configuration. Unknown/missing values fall back to the documented defaults,
 * which reproduce the platform's historical behavior.
 *
 * @returns {{
 *   matchesPerDay: number, matchesPerDayProvided: boolean,
 *   firstMatchTime: string, matchGapMinutes: number,
 *   matchDurationMinutes: number, releaseOffsetMinutes: number,
 *   teamsAdvancingPerDistrict: number|null, enableSemiFinals: boolean,
 *   errors: string[]
 * }}
 */
export function normalizeRoadmapConfig(source = {}) {
  const errors = [];

  const mpdRaw = pick(source, ['matches_per_day', 'matchesPerDay', 'matchesPerDayLimit']);
  const matchesPerDayProvided = mpdRaw !== undefined;
  let matchesPerDay = toInt(mpdRaw, DEFAULT_MATCHES_PER_DAY);
  if (matchesPerDay < 1) {
    errors.push('matches_per_day must be at least 1.');
    matchesPerDay = DEFAULT_MATCHES_PER_DAY;
  } else if (matchesPerDay > MAX_MATCHES_PER_DAY) {
    errors.push(`matches_per_day cannot exceed ${MAX_MATCHES_PER_DAY}.`);
    matchesPerDay = MAX_MATCHES_PER_DAY;
  }

  const firstRaw = pick(source, ['first_match_time', 'firstMatchTime', 'roadmap_start_time']);
  let firstMatchTime = firstRaw === undefined ? DEFAULT_FIRST_MATCH_TIME : String(firstRaw);
  if (!isValidTime(firstMatchTime)) {
    errors.push('first_match_time must be a valid HH:MM time.');
    firstMatchTime = DEFAULT_FIRST_MATCH_TIME;
  }

  const gapRaw = toInt(pick(source, ['match_gap_minutes', 'matchGapMinutes', 'break_between_matches_minutes']), DEFAULT_MATCH_GAP_MINUTES);
  const matchGapMinutes = clamp(gapRaw, 0, 1440);

  const durRaw = toInt(pick(source, ['match_duration_minutes', 'matchDurationMinutes']), DEFAULT_MATCH_DURATION_MINUTES);
  const matchDurationMinutes = clamp(durRaw, 5, 1440);

  const relRaw = toInt(pick(source, ['release_offset_minutes', 'room_credentials_release_minutes', 'releaseMinutes']), DEFAULT_RELEASE_OFFSET_MINUTES);
  const releaseOffsetMinutes = clamp(relRaw, 0, 720);

  const advRaw = pick(source, ['teams_advancing_per_district', 'teams_advancing', 'teamsAdvancingPerDistrict']);
  let teamsAdvancingPerDistrict = null;
  if (advRaw !== undefined) {
    const n = toInt(advRaw, NaN);
    if (!Number.isFinite(n) || n < 1) {
      errors.push('teams_advancing_per_district must be a positive integer.');
    } else {
      teamsAdvancingPerDistrict = n;
    }
  }

  const semiRaw = pick(source, ['enable_semi_finals', 'enableSemiFinals', 'semi_finals']);
  const enableSemiFinalsProvided = semiRaw !== undefined;
  const enableSemiFinals = toBool(semiRaw, false);

  return {
    matchesPerDay,
    matchesPerDayProvided,
    firstMatchTime,
    matchGapMinutes,
    matchDurationMinutes,
    releaseOffsetMinutes,
    teamsAdvancingPerDistrict,
    enableSemiFinals,
    enableSemiFinalsProvided,
    errors,
  };
}

/**
 * Validate a normalized config against a tournament's slot capacity.
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateRoadmapConfig(config, { slotsTotal, teamsPerGroup } = {}) {
  const errors = [];
  const total = Number(slotsTotal);
  const tpg = Number(teamsPerGroup);

  if (!Number.isFinite(total) || total <= 0) errors.push('Tournament slot capacity must be a positive number.');
  if (!Number.isFinite(tpg) || tpg <= 0) errors.push('Teams per district must be a positive number.');
  if (Number.isFinite(total) && Number.isFinite(tpg) && tpg > total) {
    errors.push('Teams per district cannot exceed the tournament slot capacity.');
  }
  if (config && config.teamsAdvancingPerDistrict != null && Number.isFinite(tpg)) {
    if (config.teamsAdvancingPerDistrict > tpg) {
      errors.push('Teams advancing per district cannot exceed teams per district.');
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Deterministically schedule `count` matches across days.
 *
 * - `count` matches are laid out `matchesPerDay` per day.
 * - Match `i` starts at `firstMatchTime + (i % matchesPerDay) * matchGapMinutes`.
 *   `match_gap_minutes` is the start-to-start interval between consecutive
 *   matches in the same day (this matches the generator's historical spacing).
 * - Each match's end time is `start + matchDurationMinutes`.
 * - Days advance by calendar day from `startDate`.
 *
 * @returns {Array<{index:number, dayOffset:number, startTime:string, endTime:string, startMins:number, endMins:number, releaseTime:string}>}
 */
export function scheduleMatches({
  count,
  matchesPerDay = DEFAULT_MATCHES_PER_DAY,
  firstMatchTime = DEFAULT_FIRST_MATCH_TIME,
  matchGapMinutes = DEFAULT_MATCH_GAP_MINUTES,
  matchDurationMinutes = DEFAULT_MATCH_DURATION_MINUTES,
  releaseOffsetMinutes = DEFAULT_RELEASE_OFFSET_MINUTES,
} = {}) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const perDay = Math.max(1, Math.floor(Number(matchesPerDay) || DEFAULT_MATCHES_PER_DAY));
  const first = parseTimeToMinutes(firstMatchTime);
  if (first == null) return [];
  const step = Math.max(1, Number(matchGapMinutes) || DEFAULT_MATCH_GAP_MINUTES);

  const out = [];
  for (let i = 0; i < n; i++) {
    const dayOffset = Math.floor(i / perDay);
    const slot = i % perDay;
    const startMins = first + slot * step;
    const endMins = startMins + Math.max(1, Number(matchDurationMinutes) || 0);
    const startTime = minutesToHHMM(startMins);
    out.push({
      index: i,
      dayOffset,
      slot,
      startMins,
      endMins,
      startTime,
      endTime: minutesToHHMM(endMins),
      releaseTime: releaseTimeFor(startTime, releaseOffsetMinutes),
    });
  }
  return out;
}

/** Number of calendar days required to schedule `count` matches. */
export function daysRequired(count, matchesPerDay = DEFAULT_MATCHES_PER_DAY) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const perDay = Math.max(1, Math.floor(Number(matchesPerDay) || DEFAULT_MATCHES_PER_DAY));
  return Math.ceil(n / perDay);
}

/** True when `d` is a valid "YYYY-MM-DD" date string. */
export function isValidDateStr(d) {
  if (!isValidDateLike(d)) return false;
  const parts = d.split('-').map(Number);
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return dt.getUTCFullYear() === parts[0] && dt.getUTCMonth() === parts[1] - 1 && dt.getUTCDate() === parts[2];
}

function isValidDateLike(d) {
  return typeof d === 'string' && DATE_RE.test(d);
}
