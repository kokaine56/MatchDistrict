// Single source of truth for tournament match room-credential release timing.
//
// The roadmap release rule: a participant may only see a match's room
// credentials once the SERVER-computed release time has passed. The release
// time equals `match date + start_time - releaseMinutes` (naive local time,
// the same convention the rest of the scheduling stack uses:
// `new Date(\`${date}T${start_time}:00\`)`).
//
// Every consumer MUST go through these helpers so the arithmetic can never
// drift between endpoints (uses: GET .../matches/:id/credentials and the
// participant roadmap GET).

export const DEFAULT_CREDENTIALS_RELEASE_MINUTES = 15;

/**
 * Normalize a tournament-level `room_credentials_release_minutes` value to a
 * bounded, non-negative integer. Mirrors the timeline system's
 * `normalizeReleaseOffset` semantics (client and server stay in lock-step).
 * @param {*} value  raw DB value (int, numeric string, null, …)
 * @param {number} [fallback]  value to use when `value` is unusable
 * @returns {number}
 */
export function normalizeReleaseMinutes(value, fallback = DEFAULT_CREDENTIALS_RELEASE_MINUTES) {
  const n = Number.parseInt(value, 10);
  if (Number.isInteger(n) && n >= 0 && n <= 1440) return n;
  // A null/undefined/empty fallback is unusable (Number(null) === 0 would
  // otherwise be mistaken for a legitimate "release at match start" window).
  const fb = (fallback === null || fallback === undefined || fallback === '')
    ? NaN
    : Number(fallback);
  return Number.isInteger(fb) && fb >= 0 && fb <= 1440 ? fb : DEFAULT_CREDENTIALS_RELEASE_MINUTES;
}

/**
 * Compute the absolute release timestamp for a match as an epoch (ms).
 * Explicit IST time: `new Date(`${date}T${startTime}:00+05:30`)` minus the release
 * window. Returns null when the date/start time cannot be interpreted.
 * @param {string} date  `YYYY-MM-DD`
 * @param {string} startTime  24h `HH:MM`
 * @param {number} releaseMinutes
 * @returns {number|null}
 */
export function matchReleaseEpoch(date, startTime, releaseMinutes) {
  if (!date || !startTime || /^\d{2}:\d{2}$/.test(String(startTime)) === false) return null;
  const matchDateTime = new Date(`${date}T${startTime}:00+05:30`);
  if (Number.isNaN(matchDateTime.getTime())) return null;
  return matchDateTime.getTime() - normalizeReleaseMinutes(releaseMinutes) * 60000;
}

/**
 * Whether a match's room credentials are currently available to an eligible
 * participant. Server-time comparison only — never trusts the client clock.
 * @param {string} date  `YYYY-MM-DD`
 * @param {string} startTime  24h `HH:MM`
 * @param {number} releaseMinutes
 * @param {number} [nowMs]
 * @returns {boolean}
 */
export function isMatchReleased(date, startTime, releaseMinutes, nowMs = Date.now()) {
  const epoch = matchReleaseEpoch(date, startTime, releaseMinutes);
  return epoch !== null && nowMs >= epoch;
}