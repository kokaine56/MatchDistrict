import { motion } from 'framer-motion'
import { formatDateIST, formatRoundDateTime } from '../../utils/timeFormat'

const UnlockIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
  </svg>
)

const LockIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const GamepadIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="12" x2="10" y2="12" />
    <line x1="8" y1="10" x2="8" y2="14" />
    <line x1="15" y1="13" x2="15.01" y2="13" />
    <line x1="18" y1="11" x2="18.01" y2="11" />
    <rect x="2" y="6" width="20" height="12" rx="2" />
  </svg>
)

const TrophyIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0012 0V2Z" />
  </svg>
)

const ArchiveIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="5" rx="1" />
    <path d="M4 8v11a2 2 0 002 2h12a2 2 0 002-2V8" />
    <path d="M10 12h4" />
  </svg>
)

const RoundIcon = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)

const SUBTEXTS = {
  'Registration Opens': 'Entry channels unlock — players can begin registering their teams.',
  'Registration Closes': 'Registrations are sealed shut. No further entries will be accepted.',
  'Tournament Goes Live': 'Match card moves to Live Matches — 15 minutes before Round 1 starts.',
}

function getNodeState(date) {
  if (!date) return 'future'
  const diff = new Date(date).getTime() - Date.now()
  if (diff < 0) return 'past'
  if (diff < 86400000) return 'active'
  return 'future'
}

function TimelineNode({ label, date, icon: Icon, isLast, index, subtext, rightSlot }) {
  const state = getNodeState(date)

  const dotStyle = state === 'past'
    ? 'bg-on-surface-variant/40'
    : state === 'active'
      ? 'bg-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.55)]'
      : 'bg-primary shadow-[0_0_10px_rgba(59,130,246,0.4)]'

  const lineStyle = isLast
    ? ''
    : state === 'past'
      ? 'bg-on-surface-variant/20'
      : 'bg-primary/20'

  const labelColor = state === 'past'
    ? 'text-on-surface-variant/50'
    : state === 'active'
      ? 'text-emerald-400'
      : 'text-primary'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.3, ease: 'easeOut' }}
      className="relative flex gap-3"
    >
      <div className="flex flex-col items-center w-5 shrink-0">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.07 + 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          className={`w-3 h-3 rounded-full shrink-0 z-10 transition-all duration-300 ${dotStyle}`}
        />
        {!isLast && <div className={`w-[2px] flex-1 min-h-[28px] transition-colors duration-300 ${lineStyle}`} />}
      </div>
      <div className={`pb-4 flex-1 min-w-0 transition-opacity duration-300 ${state === 'past' ? 'opacity-50' : 'opacity-100'}`}>
        <div className="flex items-start gap-x-2 gap-y-0.5 flex-wrap">
          <span className={`text-xs shrink-0 mt-0.5 ${labelColor}`}><Icon className="w-3.5 h-3.5" /></span>
          <span className={`text-xs font-semibold transition-colors ${labelColor}`}>{label}</span>
          {date && (
            <span className="text-[11px] text-on-surface-variant ml-auto text-right shrink-0 tabular-nums w-full sm:w-auto">
              {formatDateIST(date)}
            </span>
          )}
        </div>
        {subtext && <p className="text-[11px] text-on-surface-variant/60 mt-0.5 leading-snug max-w-xs">{subtext}</p>}
        {rightSlot && <div className="mt-1.5">{rightSlot}</div>}
      </div>
    </motion.div>
  )
}

export default function TimelinePreview({ registrationOpen, registrationClose, matchStart, rounds = [] }) {
  const nodes = [
    { label: 'Registration Opens', date: registrationOpen, icon: UnlockIcon, subtext: SUBTEXTS['Registration Opens'] },
    { label: 'Registration Closes', date: registrationClose, icon: LockIcon, subtext: SUBTEXTS['Registration Closes'] },
  ]

  const roadmap = Array.isArray(rounds) ? rounds : []

  if (roadmap.length > 0) {
    roadmap.forEach((r, i) => {
      const roundDate = r.date && r.time ? `${r.date}T${r.time}` : r.date || ''
      nodes.push({
        label: r.name || `Round ${i + 1}`,
        date: roundDate,
        icon: RoundIcon,
        subtext: r.map ? `Map: ${r.map}` : undefined,
        rightSlot: r.qualified ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 text-[9px] font-bold text-primary">
            Top {r.qualified} advance
          </span>
        ) : null,
      })
    })
  } else if (matchStart) {
    nodes.push({ label: 'Tournament Starts', date: matchStart, icon: GamepadIcon, subtext: SUBTEXTS['Tournament Goes Live'] })
  }

  const lastRoundTs = roadmap.length > 0
    ? (() => {
        const last = roadmap[roadmap.length - 1]
        const s = last.time ? `${last.date}T${last.time}` : `${last.date}T23:59`
        const d = new Date(s)
        return isNaN(d.getTime()) ? null : d.getTime()
      })()
    : null

  if (lastRoundTs) {
    const archivedDate = new Date(lastRoundTs + 24 * 60 * 60 * 1000)
    nodes.push({
      label: 'Tournament Archives',
      date: archivedDate.toISOString().slice(0, 16),
      icon: ArchiveIcon,
      subtext: '24 hours after the final round — tournament moves to archive.',
    })
  }

  return (
    <div className="bg-surface-container/30 rounded-xl p-4 sm:p-5 shadow-inner">
      {nodes.map((item, idx) => (
        <TimelineNode
          key={`${item.label}-${idx}`}
          label={item.label}
          date={item.date}
          icon={item.icon}
          isLast={idx === nodes.length - 1}
          index={idx}
          subtext={item.subtext}
          rightSlot={item.rightSlot}
        />
      ))}
      {nodes.length === 0 && (
        <p className="text-xs text-on-surface-variant/50 text-center py-4">
          Set registration dates and add rounds to see the full timeline.
        </p>
      )}
    </div>
  )
}
