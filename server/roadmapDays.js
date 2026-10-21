// server/roadmapDays.js
// Pure, shared utilities for continuous tournament-wide day numbering,
// cross-round chronological date tracking, and calendar date arithmetic in IST.
//
// Rules:
// 1. Works ONLY with calendar date strings (YYYY-MM-DD), never passing through
//    UTC Date objects or local timezone conversions, so +1 day can never shift or repeat.
// 2. Continuous day numbering across rounds (1, 2, 3...)
// 3. Each round must start strictly after the previous round's last day.

/**
 * Returns true if year is a leap year in Gregorian calendar.
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Returns number of days in month (1-12) for a given year.
 */
function getDaysInMonth(year, month) {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] || 30;
}

/**
 * Extracts pure YYYY-MM-DD date string without timezone degradation.
 *
 * @param {string|Date} raw - Date string or Date object
 * @returns {string} YYYY-MM-DD string, or empty string if invalid
 */
export function toCalendarDateStr(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return `${m[1]}-${m[2]}-${m[3]}`;
    }
    const mDmy = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (mDmy) {
      const d = String(mDmy[1]).padStart(2, '0');
      const mth = String(mDmy[2]).padStart(2, '0');
      const y = mDmy[3];
      return `${y}-${mth}-${d}`;
    }
  }
  if (raw instanceof Date && !isNaN(raw.getTime())) {
    // Shift UTC timestamp to IST (+05:30) and inspect in UTC
    const istMs = raw.getTime() + (5 * 60 + 30) * 60 * 1000;
    const d = new Date(istMs);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

/**
 * Formats ISO YYYY-MM-DD string to user-friendly DD/MM/YYYY.
 *
 * @param {string} dateStr - Date string
 * @returns {string} DD/MM/YYYY string
 */
export function formatToDDMMYYYY(dateStr) {
  const clean = toCalendarDateStr(dateStr);
  if (!clean) return typeof dateStr === 'string' ? dateStr : '';
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Adds N calendar days to an ISO date string (YYYY-MM-DD) using pure integer arithmetic.
 * NEVER creates a Date object. Guaranteed to never shift or repeat dates regardless
 * of environment or client timezone.
 *
 * @param {string} dateStr - Date string in YYYY-MM-DD format (or ISO prefix)
 * @param {number} daysToAdd - Number of calendar days to add (default 1)
 * @returns {string} New date string in YYYY-MM-DD format, or original if invalid
 */
export function addCalendarDays(dateStr, daysToAdd = 1) {
  const clean = toCalendarDateStr(dateStr);
  if (!clean) return typeof dateStr === 'string' ? dateStr : '';
  const match = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return clean;

  let y = parseInt(match[1], 10);
  let m = parseInt(match[2], 10);
  let d = parseInt(match[3], 10);

  if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) {
    return clean;
  }

  const count = parseInt(daysToAdd, 10) || 0;
  if (count === 0) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  d += count;

  if (count > 0) {
    while (d > getDaysInMonth(y, m)) {
      d -= getDaysInMonth(y, m);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
  } else {
    while (d < 1) {
      m--;
      if (m < 1) {
        m = 12;
        y--;
      }
      d += getDaysInMonth(y, m);
    }
  }

  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Calculates Julian Day Number for pure calendar difference.
 */
function toJulianDayNumber(y, m, d) {
  const a = Math.floor((14 - m) / 12);
  const yr = y + 4800 - a;
  const mo = m + 12 * a - 3;
  return d + Math.floor((153 * mo + 2) / 5) + 365 * yr + Math.floor(yr / 4) - Math.floor(yr / 100) + Math.floor(yr / 400) - 32045;
}

/**
 * Returns difference in integer calendar days between two dates (dateStr2 - dateStr1).
 * Pure calendar calculation with no timezone shift.
 *
 * @param {string} dateStr1 - Starting date
 * @param {string} dateStr2 - Ending date
 * @returns {number} Integer day difference (positive if dateStr2 > dateStr1)
 */
export function calendarDayDiff(dateStr1, dateStr2) {
  const c1 = toCalendarDateStr(dateStr1);
  const c2 = toCalendarDateStr(dateStr2);
  if (!c1 || !c2) return 0;
  const m1 = c1.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const m2 = c2.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m1 || !m2) return 0;
  const j1 = toJulianDayNumber(Number(m1[1]), Number(m1[2]), Number(m1[3]));
  const j2 = toJulianDayNumber(Number(m2[1]), Number(m2[2]), Number(m2[3]));
  return j2 - j1;
}

/**
 * Computes a lookup map of continuous day numbers (1, 2, 3...) across all rounds
 * in tournament round order.
 *
 * @param {Array} rounds - Array of round objects in order
 * @returns {Map<string, number>} Map of day ID and `${rIdx}_${dIdx}` -> continuous day number
 */
export function getTournamentDayNumberMap(rounds = []) {
  const map = new Map();
  if (!Array.isArray(rounds)) return map;

  let counter = 1;
  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const round = rounds[rIdx];
    const days = Array.isArray(round?.days) ? round.days : [];

    for (let dIdx = 0; dIdx < days.length; dIdx++) {
      const day = days[dIdx];
      const currentNumber = counter++;

      map.set(`${rIdx}_${dIdx}`, currentNumber);
      if (day?.id) {
        map.set(String(day.id), currentNumber);
      }
    }
  }

  return map;
}

/**
 * Gets the continuous display day number for a specific day in a tournament roadmap.
 *
 * @param {Array} rounds - All rounds of the tournament
 * @param {number|Object} roundIdentifier - Round index or round object
 * @param {number|Object|string} dayIdentifier - Day index, day object, or day ID
 * @returns {number} 1-based continuous day number across the whole tournament (default 1)
 */
export function getContinuousDayNumber(rounds = [], roundIdentifier = 0, dayIdentifier = 0) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    if (typeof dayIdentifier === 'number') return dayIdentifier + 1;
    return 1;
  }

  // 1. Resolve round index
  let rIdx = -1;
  if (typeof roundIdentifier === 'number') {
    rIdx = roundIdentifier;
  } else if (roundIdentifier && typeof roundIdentifier === 'object') {
    rIdx = rounds.findIndex((r) => r === roundIdentifier || (r?.id && r.id === roundIdentifier.id));
  } else if (typeof roundIdentifier === 'string') {
    rIdx = rounds.findIndex((r) => r?.id === roundIdentifier);
  }

  if (rIdx < 0) rIdx = 0;

  // 2. Resolve day index within the round
  const targetRound = rounds[rIdx];
  const days = Array.isArray(targetRound?.days) ? targetRound.days : [];
  let dIdx = -1;

  if (typeof dayIdentifier === 'number') {
    dIdx = dayIdentifier;
  } else if (dayIdentifier && typeof dayIdentifier === 'object') {
    dIdx = days.findIndex((d) => d === dayIdentifier || (d?.id && d.id === dayIdentifier.id));
  } else if (typeof dayIdentifier === 'string') {
    dIdx = days.findIndex((d) => d?.id === dayIdentifier);
  }

  if (dIdx < 0) dIdx = 0;

  // 3. Count days in all preceding rounds + target day index + 1
  let count = 0;
  for (let i = 0; i < rIdx && i < rounds.length; i++) {
    const rDays = Array.isArray(rounds[i]?.days) ? rounds[i].days : [];
    count += rDays.length;
  }

  return count + dIdx + 1;
}

/**
 * Calculates start and end dates for a round based on its scheduled days.
 *
 * @param {Object} round - Round object with days array
 * @returns {{ startDate: string|null, endDate: string|null, firstDayIdx: number, lastDayIdx: number }}
 */
export function getRoundDateBoundaries(round) {
  const days = Array.isArray(round?.days) ? round.days : [];
  let startDate = null;
  let endDate = null;
  let firstDayIdx = 0;
  let lastDayIdx = 0;

  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    const cleanDate = toCalendarDateStr(d?.date);
    if (cleanDate) {
      if (!startDate) {
        startDate = cleanDate;
        firstDayIdx = i;
      }
      endDate = cleanDate;
      lastDayIdx = i;
    }
  }

  return { startDate, endDate, firstDayIdx, lastDayIdx };
}

/**
 * Checks for date overlaps or ordering inversions across consecutive rounds.
 * Returns a list of detailed warning objects.
 *
 * Rule: A round's first date should be strictly after the previous round's last date.
 * Format: "Round 2 starts on 27/10/2026 but Round 1 ends on 27/10/2026"
 *
 * @param {Array} rounds - Array of rounds in order
 * @returns {Array<Object>} List of overlap warning objects
 */
export function checkRoundDateOverlaps(rounds = []) {
  const warnings = [];
  if (!Array.isArray(rounds) || rounds.length <= 1) return warnings;

  let prevRoundEndDate = null;
  let prevRoundName = null;
  let prevRoundLastDayNum = null;
  let cumulativeDays = 0;

  for (let rIdx = 0; rIdx < rounds.length; rIdx++) {
    const round = rounds[rIdx];
    const rName = round?.name || `Round ${round?.round_number || rIdx + 1}`;
    const days = Array.isArray(round?.days) ? round.days : [];
    const boundaries = getRoundDateBoundaries(round);

    if (boundaries.startDate && prevRoundEndDate) {
      if (boundaries.startDate <= prevRoundEndDate) {
        const firstDayNum = cumulativeDays + boundaries.firstDayIdx + 1;
        const targetStartDate = addCalendarDays(prevRoundEndDate, 1);
        const requiredShiftDays = Math.max(1, calendarDayDiff(boundaries.startDate, targetStartDate));

        const formattedStart = formatToDDMMYYYY(boundaries.startDate);
        const formattedPrevEnd = formatToDDMMYYYY(prevRoundEndDate);
        const msg = `${rName} starts on ${formattedStart} but ${prevRoundName} ends on ${formattedPrevEnd}`;

        warnings.push({
          roundIndex: rIdx,
          roundName: rName,
          firstDayNumber: firstDayNum,
          startDate: boundaries.startDate,
          startDateDisplay: formattedStart,
          prevRoundIndex: rIdx - 1,
          prevRoundName,
          prevRoundLastDayNumber: prevRoundLastDayNum,
          prevEndDate: prevRoundEndDate,
          prevEndDateDisplay: formattedPrevEnd,
          targetStartDate,
          requiredShiftDays,
          message: msg,
        });
      }
    }

    if (boundaries.endDate) {
      prevRoundEndDate = boundaries.endDate;
      prevRoundName = rName;
      prevRoundLastDayNum = cumulativeDays + boundaries.lastDayIdx + 1;
    }

    cumulativeDays += days.length;
  }

  return warnings;
}

/**
 * Calculates the next default date when adding a day to a round.
 *
 * Rule:
 * 1. If the current round already has days with dates, next day is +1 after current round's last day.
 * 2. If the current round has no days, next day is +1 after the previous round's last day.
 * 3. Fallback to fallbackDate or minDate.
 *
 * @param {Array} rounds - All rounds
 * @param {number} currentRoundIdx - Index of round where day is being added
 * @param {string} fallbackDate - Fallback date string
 * @returns {string} ISO YYYY-MM-DD date string
 */
export function getNextDefaultDayDate(rounds = [], currentRoundIdx = 0, fallbackDate = '') {
  if (!Array.isArray(rounds)) return toCalendarDateStr(fallbackDate) || '';

  const currentRound = rounds[currentRoundIdx];
  const currentDays = Array.isArray(currentRound?.days) ? currentRound.days : [];

  // Check last day in current round
  for (let i = currentDays.length - 1; i >= 0; i--) {
    const clean = toCalendarDateStr(currentDays[i]?.date);
    if (clean) {
      return addCalendarDays(clean, 1);
    }
  }

  // Current round has no dates yet: look back at previous rounds
  for (let r = currentRoundIdx - 1; r >= 0; r--) {
    const prevDays = Array.isArray(rounds[r]?.days) ? rounds[r].days : [];
    for (let i = prevDays.length - 1; i >= 0; i--) {
      const clean = toCalendarDateStr(prevDays[i]?.date);
      if (clean) {
        return addCalendarDays(clean, 1);
      }
    }
  }

  return toCalendarDateStr(fallbackDate) || '';
}

/**
 * Shifts later rounds forward to eliminate schedule overlaps while preserving gaps.
 * Moves all later rounds starting from `targetRoundIdx` forward by the required number of days.
 * Does NOT touch rounds that have locked days or verified results.
 *
 * @param {Array} rounds - All tournament rounds
 * @param {number|null} targetRoundIdx - Round index to shift, or null to auto-shift first overlapping round
 * @returns {Array} New rounds array with later dates adjusted
 */
export function shiftLaterRoundsToFollow(rounds = [], targetRoundIdx = null) {
  if (!Array.isArray(rounds) || rounds.length === 0) return rounds;
  const cloned = JSON.parse(JSON.stringify(rounds));

  let startIdx = targetRoundIdx;
  if (startIdx == null) {
    const overlaps = checkRoundDateOverlaps(cloned);
    if (overlaps.length === 0) return cloned;
    startIdx = overlaps[0].roundIndex;
  }

  if (startIdx <= 0 || startIdx >= cloned.length) return cloned;

  const prevRound = cloned[startIdx - 1];
  const targetRound = cloned[startIdx];
  const prevBoundaries = getRoundDateBoundaries(prevRound);
  const targetBoundaries = getRoundDateBoundaries(targetRound);

  if (!prevBoundaries.endDate || !targetBoundaries.startDate) return cloned;

  const targetStartDate = addCalendarDays(prevBoundaries.endDate, 1);
  const shiftDays = calendarDayDiff(targetBoundaries.startDate, targetStartDate);
  if (shiftDays <= 0) return cloned;

  // Shift target round and all subsequent rounds forward by shiftDays, keeping their gaps
  for (let r = startIdx; r < cloned.length; r++) {
    const round = cloned[r];
    if (round.is_locked) continue;
    const days = Array.isArray(round.days) ? round.days : [];
    for (const d of days) {
      if (d.is_locked || d.has_results) continue;
      if (d.date) {
        d.date = addCalendarDays(d.date, shiftDays);
      }
    }
  }

  return cloned;
}

