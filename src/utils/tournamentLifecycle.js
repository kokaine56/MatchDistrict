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
  if (!r) return null
  const dateStr = r.date || r.start_date || r.startDate
  if (!dateStr) return null
  const timeStr = r.start_time || r.startTime || r.time || '10:00'
  try {
    const [h, m] = timeStr.split(':').map(Number)
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    d.setHours(isNaN(h) ? 10 : h, isNaN(m) ? 0 : m, 0, 0)
    return d.getTime()
  } catch {
    return null
  }
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

export function getCTAButtonConfig(lifecycleStatus) {
  // Default CTA for un-registered viewers — overridden by getRegistrationButtonState
  // when the viewer has a registration record.
  if (lifecycleStatus === 'open') {
    return {
      text: 'Join Now',
      disabled: false,
      styleClass: 'bg-primary hover:bg-primary/90 text-white shadow-[0_4px_16px_rgba(99,102,241,0.3)]'
    }
  }
  if (lifecycleStatus === 'upcoming') {
    return {
      text: 'Registration Opens Later',
      disabled: true,
      styleClass: 'bg-slate-400/70 text-white cursor-not-allowed opacity-70'
    }
  }
  if (lifecycleStatus === 'closed') {
    return {
      text: 'Registration Ended',
      disabled: true,
      styleClass: 'bg-slate-400/70 text-white cursor-not-allowed opacity-70'
    }
  }
  if (lifecycleStatus === 'live') {
    return {
      text: 'Registration Closed',
      disabled: true,
      styleClass: 'bg-slate-400/70 text-white cursor-not-allowed opacity-70'
    }
  }
  if (lifecycleStatus === 'archived') {
    return {
      text: 'Tournament Ended',
      disabled: true,
      styleClass: 'bg-slate-400/70 text-white cursor-not-allowed opacity-70'
    }
  }
  // fallback
  return {
    text: 'View Details',
    disabled: false,
    styleClass: 'bg-primary hover:bg-primary/95 text-white'
  }
}

/**
 * Maps a viewer's registration row + tournament lifecycle → button config.
 *
 * @param {object|null} reg     - Row from GET /api/tournaments/:id/my-registration,
 *                                or a row from /api/users/:id/registrations.
 *                                May be null (not registered).
 * @param {string}      lifecycle - Output of getTournamentLifecycleStatus()
 *                                ('open'|'closed'|'upcoming'|'live'|'archived')
 * @returns {{ text: string, styleClass: string, disabled: boolean, icon: string|null, action: string|null }}
 *   action:
 *     'join'     → navigate to registration page (new registration)
 *     'pay'      → navigate to registration page at payment step (has registration, missing proof)
 *     null       → no navigation (disabled)
 */
export function getRegistrationButtonState(reg, lifecycle, options = {}) {
  const rawStatus = ((reg && reg.status) || '').toLowerCase().trim()

  // ── 1. User has an active registration ────────────────────────────────────
  if (rawStatus && !['rejected', 'payment_rejected', 'cancelled', 'expired'].includes(rawStatus)) {
    // Approved / Confirmed / VERIFIED_BY_HOST
    if (['approved', 'confirmed', 'verified_by_host', 'verified'].includes(rawStatus)) {
      return {
        text: 'Registered Successfully',
        icon: 'check',
        disabled: true,
        action: null,
        styleClass: 'bg-green-500 text-white cursor-not-allowed opacity-95 shadow-[0_4px_12px_rgba(34,197,94,0.3)]'
      }
    }
    // Proof uploaded, waiting for admin
    if (['pending', 'pending_admin_review', 'waitlisted'].includes(rawStatus)) {
      return {
        text: 'Verification Pending',
        icon: 'clock',
        disabled: true,
        action: null,
        styleClass: 'bg-amber-500 text-white cursor-not-allowed opacity-90 shadow-[0_4px_12px_rgba(245,158,11,0.3)]'
      }
    }
    // Proof not yet uploaded (registration exists, no payment proof)
    if (rawStatus === 'pending_payment') {
      return {
        text: 'Complete Payment',
        icon: null,
        disabled: false,
        action: 'pay',
        styleClass: 'bg-orange-500 hover:bg-orange-600 text-white shadow-[0_4px_12px_rgba(249,115,22,0.3)]'
      }
    }
    // Catch-all pending states
    return {
      text: 'Verification Pending',
      icon: 'clock',
      disabled: true,
      action: null,
      styleClass: 'bg-amber-500 text-white cursor-not-allowed opacity-90'
    }
  }

  // ── 2. Slots full enforcement ─────────────────────────────────────────────
  // If capacity is reached and the user does not have an active confirmed/pending registration:
  if (options && options.slotsFull) {
    return {
      text: 'Slots Full',
      icon: 'x',
      disabled: true,
      action: null,
      styleClass: 'bg-red-600 text-white font-bold cursor-not-allowed opacity-90 shadow-sm',
      rejectionReason: null,
      isRejected: false,
      isSlotsFull: true,
      rawStatus
    }
  }

  // ── 3. Registration rejected / no registration — fall back to lifecycle CTA ─
  const lifecycleCta = getCTAButtonConfig(lifecycle)
  // But if rejected, show distinct red state regardless of lifecycle
  if (['rejected', 'payment_rejected'].includes(rawStatus)) {
    const rawReason = reg && reg.rejection_reason ? reg.rejection_reason : ''
    const cleanReason = rawReason.replace(/^Payment verification failed\.?\s*(Note:\s*)?/i, '').trim() || rawReason
    return {
      text: 'Register Again',
      icon: 'refresh',
      disabled: false,
      action: 'join',
      styleClass: 'bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-[0_4px_12px_rgba(225,29,72,0.3)]',
      rejectionReason: cleanReason,
      isRejected: true,
      rawStatus
    }
  }
  return {
    ...lifecycleCta,
    icon: null,
    action: lifecycleCta.disabled ? null : 'join',
    rejectionReason: null,
    isRejected: false,
    rawStatus
  }
}

