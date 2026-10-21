const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000; // +05:30 in milliseconds

/**
 * Normalizes any date string (ISO or YYYY-MM-DD) to an IST Date representation
 * using UTC methods to remain invariant of the client device timezone.
 */
function getISTDateComponents(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const str = dateStr.trim();
  if (!str) return null;

  // Pure date string (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return {
      year: utcNoon.getUTCFullYear(),
      month: utcNoon.getUTCMonth() + 1,
      day: utcNoon.getUTCDate(),
      weekdayIdx: utcNoon.getUTCDay(),
      weekday: SHORT_WEEKDAYS[utcNoon.getUTCDay()],
    };
  }

  // Full timestamp or ISO string
  const ms = new Date(str).getTime();
  if (isNaN(ms)) {
    // Attempt fallback to first 10 chars if like YYYY-MM-DD
    const prefix = str.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(prefix)) {
      return getISTDateComponents(prefix);
    }
    return null;
  }

  // Shift UTC timestamp to IST (+05:30) and inspect in UTC
  const istShifted = new Date(ms + IST_OFFSET_MS);
  return {
    year: istShifted.getUTCFullYear(),
    month: istShifted.getUTCMonth() + 1,
    day: istShifted.getUTCDate(),
    weekdayIdx: istShifted.getUTCDay(),
    weekday: SHORT_WEEKDAYS[istShifted.getUTCDay()],
  };
}

/**
 * Get short 3-letter weekday in IST (e.g. "Sat", "Sun")
 */
export function getWeekdayIST(dateStr) {
  const comps = getISTDateComponents(dateStr);
  return comps ? comps.weekday : '';
}

/**
 * Format a date string with weekday in IST: "Sat, 25/10/2026"
 */
export function formatDateWithWeekdayIST(dateStr) {
  const comps = getISTDateComponents(dateStr);
  if (!comps) return '';
  const dd = String(comps.day).padStart(2, '0');
  const mm = String(comps.month).padStart(2, '0');
  return `${comps.weekday}, ${dd}/${mm}/${comps.year}`;
}

/**
 * Format a start/end date range in IST: "Sat, 25/10/2026 to Sun, 02/11/2026"
 */
export function formatDateRangeIST(startStr, endStr) {
  const s = formatDateWithWeekdayIST(startStr);
  const e = formatDateWithWeekdayIST(endStr);
  if (s && e) {
    if (s === e) return s;
    return `${s} to ${e}`;
  }
  return s || e || '';
}

/**
 * Format ISO YYYY-MM-DD string to DD/MM/YYYY
 */
export function formatToDDMMYYYY(isoStr) {
  if (!isoStr || typeof isoStr !== 'string') return '';
  const clean = isoStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return '';
  const [y, m, d] = parts;
  if (!y || !m || !d) return '';
  return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
}

/**
 * Parse DD/MM/YYYY string to ISO YYYY-MM-DD
 * Returns null if invalid.
 */
export function parseFromDDMMYYYY(displayStr) {
  if (!displayStr || typeof displayStr !== 'string') return null;
  const parts = displayStr.trim().split(/[/.-]/);
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);

  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;
  if (y < 2000 || y > 2099) return null;

  // Validate days in month
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  if (
    dateObj.getUTCFullYear() !== y ||
    dateObj.getUTCMonth() !== m - 1 ||
    dateObj.getUTCDate() !== d
  ) {
    return null;
  }

  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

