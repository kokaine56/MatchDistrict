// server/roadmapValidation.js
// Pure structural validation for the generated tournament roadmap (Phase 3).
//
// The roadmap is design-data authored by the planning engine and lightly edited
// by organizers (match start times / day dates). These helpers implement the
// single source of truth for "is this schedule structurally sound?" used by:
//   - POST /api/tournaments/:id/roadmap/validate
//   - PUT /api/tournaments/:id/roadmap/matches/:matchId   (single-edit gate)
//   - PUT /api/tournaments/:id/roadmap/days/:dayId        (single-edit gate)
//   - POST /api/tournaments/:id/roadmap/approve           (blocking gate)
//
// Nothing here performs planning/calculation — it only verifies invariants.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function toMins(t, label = 'time') {
  if (!t || typeof t !== 'string') return null
  const m = t.match(TIME_RE)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

export function minsToHHMM(mins) {
  const wrapped = ((mins % 1440) + 1440) % 1440
  const h = Math.floor(wrapped / 60)
  const m = wrapped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isValidDateStr(d) {
  if (!d || typeof d !== 'string' || !DATE_RE.test(d)) return false
  const parts = d.split('-').map(Number)
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  return dt.getUTCFullYear() === parts[0] && dt.getUTCMonth() === parts[1] - 1 && dt.getUTCDate() === parts[2]
}

// Normalize a config row (DB camelCase row) into the minimal shape validation needs.
export function normalizeConfig(config) {
  return {
    daily_start_time: String(config?.daily_start_time || '00:00'),
    daily_end_time: String(config?.daily_end_time || '23:59'),
    teams_per_room: Number(config?.teams_per_room) || 0,
    max_simultaneous_rooms: Number(config?.max_simultaneous_rooms) || 0,
    match_duration_minutes: Number(config?.match_duration_minutes) || 0,
    break_between_matches_minutes: Number(config?.break_between_matches_minutes) || 0
  }
}

// Compute the naive end time for a match given its start and the configured duration.
// Returns null when the duration is unset (caller should treat that as a defect).
export function computeMatchEndTime(startTime, matchDurationMinutes) {
  const start = toMins(startTime)
  const dur = Number(matchDurationMinutes)
  if (start == null || !Number.isFinite(dur) || dur <= 0) return null
  const end = start + dur
  if (end >= 1440) return null
  return minsToHHMM(end)
}

// ---------------------------------------------------------------------------
// Single-edit gates (returned via the PUT endpoints). These validate ONLY the
// proposed change so one stale legacy row can't block unrelated edits; the full
// validator below remains the approval gate.
// ---------------------------------------------------------------------------

// Validate editing a match's start_time. `siblings` = other matches in the SAME
// day + room (excluding the edited match). Returns { error } or { ok: true }.
export function validateSingleMatchEdit({ match, siblings, config }) {
  if (!match) return { ok: true, error: null }
  const start = toMins(match.start_time)
  if (start == null) return { ok: false, error: 'Invalid start time format (HH:MM).' }

  const end = computeMatchEndTime(match.start_time, config.match_duration_minutes)
  if (end == null) return { ok: false, error: 'Match start time cannot accommodate the configured match duration.' }

  const startM = start
  const endM = toMins(end)
  const windowStart = toMins(config.daily_start_time)
  const windowEnd = toMins(config.daily_end_time)

  if (windowStart == null || windowEnd == null || windowEnd <= windowStart) {
    return { ok: false, error: 'Planning configuration operating window is invalid.' }
  }
  if (startM < windowStart) {
    return { ok: false, error: `Match is earlier than the operating window (${config.daily_start_time}).` }
  }
  if (endM > windowEnd) {
    return { ok: false, error: `Match extends past the operating window (${config.daily_end_time}).` }
  }

  const siblingsArr = Array.isArray(siblings) ? siblings : []
  for (const s of siblingsArr) {
    const sStart = toMins(s.start_time)
    const sEnd = toMins(s.end_time)
    if (sStart == null || sEnd == null) continue
    if (startM < sEnd && sStart < endM) {
      return {
        ok: false,
        error: `Match ${match.match_number || '?'} overlaps ${s.match_number || '?'} (${s.start_time}–${s.end_time}) in the same room.`
      }
    }
  }

  const gap = config.break_between_matches_minutes
  const siblingsSorted = siblingsArr
    .filter((s) => toMins(s.start_time) != null && toMins(s.end_time) != null)
    .sort((a, b) => toMins(a.start_time) - toMins(b.start_time))

  if (gap > 0) {
    for (const s of siblingsSorted) {
      const sStart = toMins(s.start_time)
      const sEnd = toMins(s.end_time)
      const startsAfterUs = sStart >= endM
      const endsBeforeUs = sEnd <= startM
      if (startsAfterUs && sStart - endM < gap) {
        return {
          ok: false,
          error: `Match ${match.match_number || '?'} starts less than ${gap} min after ${s.match_number || '?'}.`
        }
      }
      if (endsBeforeUs && startM - sEnd < gap) {
        return {
          ok: false,
          error: `Match ${match.match_number || '?'} starts less than ${gap} min after ${s.match_number || '?'}.`
        }
      }
    }
  }

  return { ok: true, error: null }
}

// Validate editing a day's date. `rounds` = ordered round rows; `allDays` = all
// days of the tournament. Uses the same ordering invariant as the full validator:
// days strictly increase within a round, and a round starts strictly after the
// previous round's last day.
export function validateDayDateEdit({ day, editedDate, allDays, rounds }) {
  if (!isValidDateStr(editedDate)) {
    return { ok: false, error: 'Invalid date. Use YYYY-MM-DD.' }
  }
  if (!day) return { ok: false, error: 'Day not found.' }

  const roundId = day.round_id || null
  const round = (Array.isArray(rounds) ? rounds : []).find((r) => r.id === roundId)

  const daysArr = Array.isArray(allDays) ? allDays : []
  const sameRound = daysArr
    .filter((d) => d.id !== day.id && d.round_id === roundId)
    .sort((a, b) => a.day_number - b.day_number)
  const prevInRound = sameRound.find((d) => d.day_number < day.day_number)
  const nextInRound = sameRound.find((d) => d.day_number > day.day_number)

  if (prevInRound && String(editedDate) <= String(prevInRound.date)) {
    return { ok: false, error: `Day date must be after ${prevInRound.date} (Day ${prevInRound.day_number}).` }
  }
  if (nextInRound && String(editedDate) >= String(nextInRound.date)) {
    return { ok: false, error: `Day date must be before ${nextInRound.date} (Day ${nextInRound.day_number}).` }
  }

  if (round) {
    const orderedRounds = (Array.isArray(rounds) ? rounds : []).slice().sort((a, b) => a.round_number - b.round_number)
    const roundIdx = orderedRounds.findIndex((r) => r.id === roundId)
    const isFirstDayOfRound = !prevInRound
    const isLastDayOfRound = !nextInRound
    const prevRound = roundIdx > 0 ? orderedRounds[roundIdx - 1] : null
    const nextRound = roundIdx >= 0 && roundIdx < orderedRounds.length - 1 ? orderedRounds[roundIdx + 1] : null

    if (isFirstDayOfRound && prevRound) {
      const prevRoundLastDay = daysArr
        .filter((d) => d.round_id === prevRound.id)
        .sort((a, b) => b.day_number - a.day_number)[0]
      if (prevRoundLastDay && String(editedDate) <= String(prevRoundLastDay.date)) {
        return {
          ok: false,
          error: `Round ${round.round_number} must start after ${prevRoundLastDay.date} (end of Round ${prevRound.round_number}).`
        }
      }
    }
    if (isLastDayOfRound && nextRound) {
      const nextRoundFirstDay = daysArr
        .filter((d) => d.round_id === nextRound.id)
        .sort((a, b) => a.day_number - b.day_number)[0]
      if (nextRoundFirstDay && String(editedDate) >= String(nextRoundFirstDay.date)) {
        return {
          ok: false,
          error: `Round ${round.round_number} must finish before ${nextRoundFirstDay.date} (start of Round ${nextRound.round_number}).`
        }
      }
    }
  }

  return { ok: true, error: null }
}

// ---------------------------------------------------------------------------
// Full structural validation — the approval gate.
// ---------------------------------------------------------------------------

export function validateRoadmapStructure({ days, groups, rooms, matches, config, rounds }) {
  const errors = []
  const warnings = []
  const cfg = normalizeConfig(config)

  if (cfg.daily_start_time && cfg.daily_end_time) {
    const ws = toMins(cfg.daily_start_time)
    const we = toMins(cfg.daily_end_time)
    if (ws == null || we == null || we <= ws) {
      errors.push('Planning configuration has an invalid operating window.')
    }
  }
  if (cfg.teams_per_room < 1) errors.push('Planning configuration requires a positive teams-per-room value.')
  if (cfg.max_simultaneous_rooms < 1) errors.push('Planning configuration requires a positive simultaneous-rooms value.')
  if (cfg.match_duration_minutes < 1) errors.push('Planning configuration requires a positive match duration.')

  const daysArr = Array.isArray(days) ? days : []
  const groupsArr = Array.isArray(groups) ? groups : []
  const roomsArr = Array.isArray(rooms) ? rooms : []
  const matchesArr = Array.isArray(matches) ? matches : []
  const roundsArr = (Array.isArray(rounds) ? rounds : []).slice().sort((a, b) => a.round_number - b.round_number)

  const dayByNum = new Map(daysArr.map((d) => [d.day_number, d]))
  const dayById = new Map(daysArr.map((d) => [d.id, d]))
  const roomById = new Map(roomsArr.map((r) => [r.id, r]))
  const groupById = new Map(groupsArr.map((g) => [g.id, g]))

  // Config sanity that can't be evaluated without rows.
  if (daysArr.length === 0) errors.push('No days scheduled.')
  if (roomsArr.length === 0) errors.push('No rooms scheduled.')
  if (matchesArr.length === 0) errors.push('No matches scheduled.')

  // Day-level: valid dates + strict ordering within a round.
  const groupedByRound = new Map()
  for (const d of daysArr) {
    if (!groupedByRound.has(d.round_id)) groupedByRound.set(d.round_id, [])
    groupedByRound.get(d.round_id).push(d)
  }
  for (const [roundId, dayGroup] of groupedByRound) {
    if (roundId == null) {
      warnings.push('Some days are not assigned to a round.')
      continue
    }
    dayGroup.sort((a, b) => a.day_number - b.day_number)
    for (let i = 0; i < dayGroup.length; i++) {
      const d = dayGroup[i]
      if (!isValidDateStr(d.date)) {
        errors.push(`Day ${d.day_number} has an invalid date (${d.date}).`)
        continue
      }
      if (i > 0) {
        const prev = dayGroup[i - 1]
        if (String(d.date) < String(prev.date)) {
          errors.push(`Day ${d.day_number} (${d.date}) is dated before Day ${prev.day_number} (${prev.date}) in the same round.`)
        } else if (String(d.date) === String(prev.date)) {
          warnings.push(`Day ${d.day_number} and Day ${prev.day_number} share the same date (${d.date}).`)
        }
      }
    }
  }

  // Round-level ordering: a round starts strictly after the previous round's last day.
  for (let ri = 1; ri < roundsArr.length; ri++) {
    const prevRound = roundsArr[ri - 1]
    const round = roundsArr[ri]
    const prevDays = (groupedByRound.get(prevRound.id) || []).slice().sort((a, b) => a.day_number - b.day_number)
    const roundDays = (groupedByRound.get(round.id) || []).slice().sort((a, b) => a.day_number - b.day_number)
    if (prevDays.length === 0 || roundDays.length === 0) continue
    const prevLast = prevDays[prevDays.length - 1]
    const roundFirst = roundDays[0]
    if (isValidDateStr(prevLast.date) && isValidDateStr(roundFirst.date)) {
      if (String(roundFirst.date) < String(prevLast.date)) {
        errors.push(`Round ${round.round_number} (${roundFirst.date}) starts before Round ${prevRound.round_number} finishes (${prevLast.date}).`)
      } else if (String(roundFirst.date) === String(prevLast.date)) {
        warnings.push(`Round ${round.round_number} starts on the same day Round ${prevRound.round_number} finishes.`)
      }
    }
  }

  // Room-level: capacity sanity.
  for (const r of roomsArr) {
    if (cfg.teams_per_room >= 1 && Number(r.capacity) > cfg.teams_per_room) {
      warnings.push(`Room ${r.room_number} capacity (${r.capacity}) exceeds the configured ${cfg.teams_per_room} teams per room.`)
    }
    if (!groupById.has(r.group_id)) {
      errors.push(`Room ${r.room_number} is not linked to a valid group.`)
    }
    if (!dayById.has(r.day_id)) {
      errors.push(`Room ${r.room_number} is not linked to a valid day.`)
    }
  }

  // Match-level: formats, temporal constraints, per-room overlap, optional gap.
  const matchesByRoomDay = new Map()
  for (const m of matchesArr) {
    const key = `${m.day_id}::${m.room_id}`
    if (!matchesByRoomDay.has(key)) matchesByRoomDay.set(key, [])
    matchesByRoomDay.get(key).push(m)
  }
  for (const [, list] of matchesByRoomDay) {
    list.sort((a, b) => (toMins(a.start_time) ?? 0) - (toMins(b.start_time) ?? 0))
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      const room = roomById.get(m.room_id)
      const day = dayById.get(m.day_id)
      const label = `Match ${m.match_number || '?'}` + (room ? ` (Room ${room.room_number})` : '') + (day ? ` on Day ${day.day_number}` : '')
      const start = toMins(m.start_time)
      const end = toMins(m.end_time)
      if (start == null) {
        errors.push(`${label} has an invalid start time (${m.start_time}).`)
        continue
      }
      if (end == null) {
        errors.push(`${label} has an invalid end time (${m.end_time}).`)
        continue
      }
      if (end <= start) {
        errors.push(`${label} ends before it starts.`)
        continue
      }
      const ws = toMins(cfg.daily_start_time)
      const we = toMins(cfg.daily_end_time)
      if (ws != null && we != null && we > ws) {
        if (start < ws) errors.push(`${label} starts before the operating window (${cfg.daily_start_time}).`)
        else if (end > we) errors.push(`${label} finishes after the operating window (${cfg.daily_end_time}).`)
      }
      const expected = computeMatchEndTime(m.start_time, cfg.match_duration_minutes)
      if (expected && m.end_time !== expected) {
        warnings.push(`${label} duration (${m.start_time}–${m.end_time}) differs from the configured ${cfg.match_duration_minutes} min.`)
      }
      if (i > 0) {
        const prevEnd = toMins(list[i - 1].end_time)
        if (prevEnd != null && start < prevEnd) {
          errors.push(`${label} overlaps ${list[i - 1].match_number || '?'} in the same room.`)
        } else if (prevEnd != null && cfg.break_between_matches_minutes > 0 && start - prevEnd < cfg.break_between_matches_minutes) {
          warnings.push(`${label} has less than ${cfg.break_between_matches_minutes} min break after ${list[i - 1].match_number || '?'}.`)
        }
      }
    }
  }

  // Concurrency: simultaneous matches per day must not exceed the configured max.
  if (cfg.max_simultaneous_rooms >= 1) {
    const byDay = new Map()
    for (const m of matchesArr) {
      const start = toMins(m.start_time)
      const end = toMins(m.end_time)
      if (start == null || end == null) continue
      if (!byDay.has(m.day_id)) byDay.set(m.day_id, [])
      byDay.get(m.day_id).push({ start, end, m })
    }
    for (const [dayId, list] of byDay) {
      const events = list.flatMap((e) => [
        { t: e.start, delta: +1, m: e.m },
        { t: e.end, delta: -1, m: e.m }
      ]).sort((a, b) => a.t - b.t || a.delta - b.delta)
      let active = 0
      let peak = 0
      for (const ev of events) {
        active += ev.delta
        if (active > peak) peak = active
      }
      if (peak > cfg.max_simultaneous_rooms) {
        const day = dayById.get(dayId)
        errors.push(
          `Day ${day ? day.day_number : dayId} peaks at ${peak} simultaneous matches — over the configured ${cfg.max_simultaneous_rooms} simultaneous rooms.`
        )
      }
    }
  }

  // Completeness (informational).
  if (groupsArr.length === 0) warnings.push('No groups scheduled.')
  for (const g of groupsArr) {
    if (!dayById.has(g.day_id)) {
      errors.push(`Group ${g.group_name} is not linked to a valid day.`)
      continue
    }
    if (!roomsArr.some((r) => r.group_id === g.id)) {
      warnings.push(`Group ${g.group_name} has no rooms.`)
    }
  }
  for (const a of matchesArr) {
    if (!roomById.has(a.room_id) || !groupById.has(a.group_id) || !dayById.has(a.day_id)) {
      errors.push(`Match ${a.match_number || '?'} is not linked to a valid room/group/day.`)
    }
  }

  return { errors, warnings }
}