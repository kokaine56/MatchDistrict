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

function getFirstMatchStart(t) {
  if (!t) return null
  const roadmap = parseRoadmap(t)
  if (roadmap.length > 0) {
    const ts = getRoundTimestamp(roadmap[0])
    if (ts) return ts
  }
  const startDate = parseDate(t.startDate || t.start_date || t.date)
  if (startDate) return startDate.getTime()
  return null
}

/**
 * Tournament lifecycle state machine.
 *
 * Timeline:
 *   REGISTRATION NOT OPEN → REGISTRATION OPEN → REGISTRATION CLOSED → TOURNAMENT UPCOMING → FIRST MATCH STARTS → LIVE → COMPLETED
 *
 * Rules:
 *   - Opening registration MUST NOT make matches live.
 *   - LIVE status is strictly derived from actual match/round kickoff timing.
 */
export function getTournamentLifecycleStatus(t, now = new Date()) {
  if (!t) return 'upcoming'

  const stored = (t.status || '').toLowerCase()
  if (stored === 'archived' || stored === 'completed') return 'archived'

  const nowTs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const regOpen = parseDate(t.registrationOpenDate || t.registration_open_date)
  const regClose = parseDate(t.registrationCloseDate || t.registration_close_date)

  const roadmap = parseRoadmap(t)
  const firstMatchTs = getFirstMatchStart(t)
  const lastMatchTs = roadmap.length > 1 ? getRoundTimestamp(roadmap[roadmap.length - 1]) : firstMatchTs

  // Match live check: tournament is LIVE only if actual match start time (or 5 min buffer) has arrived
  if (firstMatchTs) {
    const liveStartsAt = firstMatchTs - 5 * 60 * 1000
    const archivedAt = (lastMatchTs || firstMatchTs) + 24 * 60 * 60 * 1000

    if (nowTs >= liveStartsAt) {
      if (nowTs >= archivedAt) return 'archived'
      return 'live'
    }
  } else if (stored === 'live' || stored === 'active') {
    // Fallback if server explicitly set status live and no dates exist
    return 'live'
  }

  // Before first match starts (or while first match has not arrived):
  // Return registration window status or upcoming
  if (regOpen && nowTs < regOpen.getTime()) return 'upcoming'
  if (regOpen && nowTs >= regOpen.getTime() && (!regClose || nowTs <= regClose.getTime())) return 'open'
  if (regClose && nowTs > regClose.getTime()) return 'closed'

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
