import { formatTime12hIST } from './timeFormat'

export const DEFAULT_RELEASE_OFFSET_MINUTES = 10
const ROUND_LIVE_WINDOW_MS = 60 * 60 * 1000
const RELEASE_AT_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

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

export function splitReleaseAt(at) {
  if (!at || typeof at !== 'string') return { date: '', time: '' }
  const idx = at.indexOf('T')
  if (idx < 0) return { date: '', time: '' }
  const date = at.slice(0, idx)
  const time = at.slice(idx + 1)
  if (!parseYMD(date) || !/^\d{2}:\d{2}$/.test(time)) return { date: '', time: '' }
  return { date, time }
}

export function normalizeReleaseConfig(round = {}) {
  const offset = Number(round.id_password_release_offset_minutes)
  return {
    mode: round.id_password_release_mode === 'custom' ? 'custom' : 'automatic',
    offsetMinutes: Number.isInteger(offset) && offset > 0 ? offset : DEFAULT_RELEASE_OFFSET_MINUTES,
    releaseAt: RELEASE_AT_REGEX.test(round.id_password_release_at || '') ? round.id_password_release_at : '',
  }
}

export function computeReleaseAt(round = {}) {
  const cfg = normalizeReleaseConfig(round)
  if (!round.date || !round.time) return ''
  const { date, time } = subtractMinutesNaive(round.date, round.time, cfg.offsetMinutes)
  if (!date || !time) return ''
  return `${date}T${time}`
}

export function getRoundRelease(round = {}) {
  const cfg = normalizeReleaseConfig(round)
  if (cfg.mode === 'custom' && cfg.releaseAt) {
    const { date, time } = splitReleaseAt(cfg.releaseAt)
    if (date && time) {
      return { mode: 'custom', offsetMinutes: cfg.offsetMinutes, date, time, at: cfg.releaseAt }
    }
  }
  const { date, time } = subtractMinutesNaive(round.date, round.time, cfg.offsetMinutes)
  return { mode: 'automatic', offsetMinutes: cfg.offsetMinutes, date, time, at: date && time ? `${date}T${time}` : '' }
}

export function withReleaseDefaults(round = {}) {
  const cfg = normalizeReleaseConfig(round)
  const out = {
    ...round,
    id_password_release_mode: cfg.mode,
    id_password_release_offset_minutes: cfg.offsetMinutes,
    id_password_release_at: round.id_password_release_at || '',
  }
  if (cfg.mode === 'automatic') {
    out.id_password_release_at = computeReleaseAt(out) || ''
  }
  return out
}

export function setReleaseMode(round = {}, mode) {
  const cfg = normalizeReleaseConfig(round)
  if (mode === 'custom') {
    const existing = RELEASE_AT_REGEX.test(round.id_password_release_at || '') ? round.id_password_release_at : ''
    return {
      ...round,
      id_password_release_mode: 'custom',
      id_password_release_offset_minutes: cfg.offsetMinutes,
      id_password_release_at: existing || computeReleaseAt(round) || '',
    }
  }
  const normalized = withReleaseDefaults({ ...round, id_password_release_mode: 'automatic' })
  return normalized
}

export function setReleaseAt(round = {}, releaseAt) {
  return {
    ...round,
    id_password_release_at: RELEASE_AT_REGEX.test(releaseAt || '') ? releaseAt : '',
    id_password_release_mode: 'custom',
  }
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
  if (r.date && round.date && r.date !== round.date) {
    const shortDate = formatShortDate(r.date)
    return shortDate ? `${shortDate} · ${timeLabel}` : timeLabel
  }
  return timeLabel
}

export function isRevealAvailable(round = {}, nowMs = Date.now()) {
  const r = getRoundRelease(round)
  if (!r.date || !r.time) return false
  const d = new Date(`${r.date}T${r.time}`)
  if (isNaN(d.getTime())) return false
  return d.getTime() <= nowMs
}

export function getRoundState(round = {}, nowMs = Date.now()) {
  if (!round.date || !/^\d{2}:\d{2}$/.test(round.time || '')) return 'upcoming'
  const d = new Date(`${round.date}T${round.time}`)
  if (isNaN(d.getTime())) return 'upcoming'
  const start = d.getTime()
  if (nowMs >= start + ROUND_LIVE_WINDOW_MS) return 'completed'
  if (nowMs >= start) return 'live'
  return 'upcoming'
}