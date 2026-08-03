function parseDate(v) {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function parseRoadmap(t) {
  if (!t) return []
  try {
    const raw = typeof t.timeline === 'string' ? JSON.parse(t.timeline) : t.timeline
    const rm = raw?.roadmap || raw || []
    return Array.isArray(rm) ? rm : []
  } catch { return [] }
}

function getRoundTimestamp(r) {
  if (!r?.date) return null
  const s = r.time ? `${r.date}T${r.time}` : `${r.date}T23:59`
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

/**
 * Tournament lifecycle state machine.
 *
 * Timeline:
 *   UPCOMING → OPEN → CLOSED → LIVE → ARCHIVED
 *
 * Rules:
 *   UPCOMING : now < registrationOpenDate
 *   OPEN     : registrationOpenDate <= now <= registrationCloseDate
 *   CLOSED   : registrationCloseDate < now < (Round1Start − 15 min)
 *   LIVE     : (Round1Start − 15 min) <= now < (LastRoundStart + 24 h)
 *   ARCHIVED : now >= (LastRoundStart + 24 h) or server status archived
 *
 * If no roadmap rounds exist, the tournament stays CLOSED after
 * registration closes (no LIVE / ARCHIVED transitions).
 */
export function getTournamentLifecycleStatus(t, now = new Date()) {
  if (!t) return 'upcoming'

  const stored = (t.status || '').toLowerCase()
  if (stored === 'archived') return 'archived'
  if (stored === 'live' || stored === 'active') return 'live'
  if (stored === 'completed') return 'archived'

  const regOpen = parseDate(t.registrationOpenDate || t.registration_open_date)
  const regClose = parseDate(t.registrationCloseDate || t.registration_close_date)

  const roadmap = parseRoadmap(t)
  const firstRoundTs = roadmap.length > 0 ? getRoundTimestamp(roadmap[0]) : null
  const lastRoundTs = roadmap.length > 1
    ? getRoundTimestamp(roadmap[roadmap.length - 1])
    : firstRoundTs

  if (regOpen && now < regOpen) return 'upcoming'
  if (regOpen && now >= regOpen && (!regClose || now <= regClose)) return 'open'

  if (regClose && now > regClose) {
    if (!firstRoundTs) return 'closed'
    const liveStartsAt = firstRoundTs - 15 * 60 * 1000
    if (now < liveStartsAt) return 'closed'
    const archivedAt = lastRoundTs + 24 * 60 * 60 * 1000
    if (now >= archivedAt) return 'archived'
    return 'live'
  }

  return 'upcoming'
}

export function getStatusBadgeConfig(status) {
  switch (status) {
    case 'upcoming':
      return {
        text: 'Upcoming',
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      }
    case 'open':
      return {
        text: 'Reg. open',
        bg: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      }
    case 'closed':
      return {
        text: 'Reg. closed',
        bg: 'bg-slate-500/25 text-slate-400 border border-slate-500/30'
      }
    case 'live':
      return {
        text: 'Live',
        bg: 'bg-rose-500/20 text-rose-400 border border-rose-500/30 font-black animate-pulse'
      }
    case 'archived':
      return {
        text: 'Archived',
        bg: 'bg-slate-600/25 text-slate-400 border border-slate-600/30'
      }
    default:
      return {
        text: 'Upcoming',
        bg: 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      }
  }
}

export function getCTAButtonConfig(status) {
  return {
    text: 'View Details',
    disabled: false,
    styleClass: 'bg-primary hover:bg-primary/95 text-white active:scale-95 shadow-[0_0_12px_rgba(99,102,241,0.25)]'
  }
}
