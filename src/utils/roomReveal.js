import { formatTime12hIST } from './timeFormat'

export const ID_PASS_RELEASE_OFFSETS = [15, 10, 5]
export const DEFAULT_ID_PASS_RELEASE_OFFSET_MINUTES = 15
const ROUND_LIVE_WINDOW_MS = 60 * 60 * 1000

export function normalizeReleaseOffset(value) {
  const n = parseInt(value, 10)
  return ID_PASS_RELEASE_OFFSETS.includes(n) ? n : DEFAULT_ID_PASS_RELEASE_OFFSET_MINUTES
}

function pad2(n) { return String(n).padStart(2, '0') }

function parseYMD(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return null
  const [y, m, d] = dateStr.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null
  return { y, m, d }
}

function toTimeMinutes(timeStr) {
  if (!/^\d{2}:\d{2}$/.test(timeStr || '')) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

export function subtractMinutesNaive(dateStr, timeStr, minutes) {
  const mins = toTimeMinutes(timeStr)
  const d = parseYMD(dateStr)
  if (mins === null || !d) return { date: '', time: '' }
  const total = mins - minutes
  const dayShift = Math.floor(total / 1440)
  const dayMinutes = ((total % 1440) + 1440) % 1440
  const dt = new Date(Date.UTC(d.y, d.m - 1, d.d + dayShift))
  return {
    date: `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`,
    time: `${pad2(Math.floor(dayMinutes / 60))}:${pad2(dayMinutes % 60)}`,
  }
}

export function getRoundRelease(round = {}) {
  const offsetMinutes = normalizeReleaseOffset(round.id_pass_release_offset_minutes)
  if (!round.date || !round.time) {
    return { offsetMinutes, date: '', time: '', at: '' }
  }
  const { date, time } = subtractMinutesNaive(round.date, round.time, offsetMinutes)
  return { offsetMinutes, date, time, at: date && time ? `${date}T${time}` : '' }
}

export function withReleaseDefaults(round = {}) {
  const out = {
    ...round,
    room_id: typeof round.room_id === 'string' ? round.room_id : '',
    room_password: typeof round.room_password === 'string' ? round.room_password : '',
    id_pass_release_offset_minutes: normalizeReleaseOffset(round.id_pass_release_offset_minutes),
  }
  delete out.id_password_release_mode
  delete out.id_password_release_offset_minutes
  delete out.id_password_release_at
  return out
}

function formatShortDate(dateStr) {
  const d = parseYMD(dateStr)
  if (!d) return ''
  const dt = new Date(Date.UTC(d.y, d.m - 1, d.d))
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

export function formatRevealLabel(round = {}) {
  const r = getRoundRelease(round)
  if (!r.date || !r.time) return ''
  const timeLabel = formatTime12hIST(r.time)
  if (round.date && r.date !== round.date) {
    const shortDate = formatShortDate(r.date)
    return shortDate ? `${shortDate} · ${timeLabel}` : timeLabel
  }
  return timeLabel
}

export function isRevealAvailable(round = {}, nowMs = Date.now()) {
  const r = getRoundRelease(round)
  if (!r.date || !r.time) return false
  const timeWithSec = r.time.length === 5 ? `${r.time}:00` : r.time
  const d = new Date(`${r.date}T${timeWithSec}+05:30`)
  if (isNaN(d.getTime())) return false
  return d.getTime() <= nowMs
}

export function getRoundState(round = {}, nowMs = Date.now()) {
  if (!round.date || !/^\d{2}:\d{2}$/.test(round.time || '')) return 'upcoming'
  const timeWithSec = round.time.length === 5 ? `${round.time}:00` : round.time
  const d = new Date(`${round.date}T${timeWithSec}+05:30`)
  if (isNaN(d.getTime())) return 'upcoming'
  const start = d.getTime()
  if (nowMs >= start + ROUND_LIVE_WINDOW_MS) return 'completed'
  if (nowMs >= start) return 'live'
  return 'upcoming'
}
