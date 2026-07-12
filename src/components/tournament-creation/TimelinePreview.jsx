import { motion } from 'framer-motion'

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

const ArrowRight = () => (
  <svg className="w-5 h-5 text-on-surface-variant/40 shrink-0 mx-1 self-center" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

const SUBTEXTS = {
  'Registration Opens': 'Entry channels unlock \u2014 players can begin registering their teams.',
  'Registration Closes': 'Registrations are sealed shut. No further entries will be accepted.',
  'Match Starts': 'The battle goes live. Match card moves to the Live Matches section.',
}

function getNodeState(date) {
  if (!date) return 'future'
  const diff = new Date(date).getTime() - Date.now()
  if (diff < 0) return 'past'
  if (diff < 86400000) return 'active'
  return 'future'
}

function formatDateIST(dateStr) {
  if (!dateStr) return ''
  try {
    const hasTz = /[Z+-]\d{2}:\d{2}$/.test(dateStr) || dateStr.endsWith('Z')
    const d = new Date(hasTz ? dateStr : dateStr + '+05:30')
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST'
  } catch { return dateStr }
}

function formatRoundDateTime(dateStr, timeStr) {
  if (!dateStr) return 'TBD'
  try {
    const combined = timeStr ? `${dateStr}T${timeStr}` : dateStr
    const hasTz = /[Z+-]\d{2}:\d{2}$/.test(combined) || combined.endsWith('Z')
    const d = new Date(hasTz ? combined : combined + '+05:30')
    if (isNaN(d.getTime())) return `${dateStr} ${timeStr || ''}`.trim()
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + 
           (timeStr ? ', ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' IST' : '')
  } catch (e) {
    return `${dateStr} ${timeStr || ''}`.trim()
  }
}

function TimelineNode({ label, date, icon: Icon, isLast, index }) {
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
      transition={{ delay: index * 0.1, duration: 0.3, ease: 'easeOut' }}
      className="relative flex gap-3"
    >
      <div className="flex flex-col items-center w-5 shrink-0">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.1 + 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          className={`w-3 h-3 rounded-full shrink-0 z-10 transition-all duration-300 ${dotStyle}`}
        />
        {!isLast && <div className={`w-[2px] flex-1 min-h-[28px] transition-colors duration-300 ${lineStyle}`} />}
      </div>
      <div className={`pb-3 flex-1 min-w-0 transition-opacity duration-300 ${state === 'past' ? 'opacity-50' : 'opacity-100'}`}>
        <div className="flex items-start gap-x-2 gap-y-0.5 flex-wrap">
          <span className={`text-xs shrink-0 mt-0.5 ${labelColor}`}><Icon className="w-3.5 h-3.5" /></span>
          <span className={`text-xs font-semibold transition-colors ${labelColor}`}>{label}</span>
          {date && (
            <span className="text-[11px] text-on-surface-variant ml-auto text-right shrink-0 tabular-nums w-full sm:w-auto">
              {formatDateIST(date)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-on-surface-variant/60 mt-0.5 leading-snug max-w-xs">{SUBTEXTS[label]}</p>
      </div>
    </motion.div>
  )
}

export default function TimelinePreview({ registrationOpen, registrationClose, matchStart, rounds = [] }) {
  const items = [
    { label: 'Registration Opens', date: registrationOpen, icon: UnlockIcon },
    { label: 'Registration Closes', date: registrationClose, icon: LockIcon },
    { label: 'Match Starts', date: matchStart, icon: GamepadIcon },
  ]

  return (
    <div className="space-y-6">
      {/* Static Timeline Nodes */}
      <div className="bg-surface-container/30 border border-outline-variant/20 rounded-xl p-4 sm:p-5">
        {items.map((item, idx) => (
          <TimelineNode
            key={item.label}
            label={item.label}
            date={item.date}
            icon={item.icon}
            isLast={idx === items.length - 1}
            index={idx}
          />
        ))}
      </div>

      {/* Rounds Progression */}
      <div>
        <h4 className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-3 flex items-center gap-2">
          <span>Rounds Progression</span>
          <span className="text-[10px] font-normal text-on-surface-variant/50 normal-case">({rounds.length} round{rounds.length !== 1 ? 's' : ''})</span>
        </h4>
        {rounds.length === 0 ? (
          <div className="bg-surface-container/30 border border-dashed border-outline-variant/20 rounded-xl p-5 text-center">
            <p className="text-xs text-on-surface-variant/50">No rounds added yet. Click <span className="text-primary font-semibold">+ Add Round</span> above to build your tournament bracket.</p>
          </div>
        ) : (
          <div className="flex items-center overflow-x-auto pb-2 gap-2 scrollbar-hide">
            {rounds.map((r, idx) => (
              <div key={r.id || idx} className="flex items-center shrink-0">
                {/* Node Box */}
                <div className="bg-surface-container/30 border border-outline-variant/20 rounded-xl p-3.5 min-w-[190px] space-y-2.5 flex flex-col justify-between shadow-sm">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
                        {idx + 1}
                      </span>
                      <h4 className="text-xs font-extrabold text-on-background truncate max-w-[140px]">
                        {r.name || `Round ${idx + 1}`}
                      </h4>
                    </div>
                    <p className="text-[10px] font-mono text-on-surface-variant/80 pl-7">
                      <span className="inline-block w-3.5 text-center mr-1">&#128197;</span>
                      {formatRoundDateTime(r.date, r.time)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pl-7">
                    {r.map ? (
                      <span className="inline-block px-2 py-0.5 rounded bg-surface border border-outline-variant/35 text-[9px] font-extrabold text-on-surface-variant uppercase tracking-wider">
                        {r.map}
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded bg-surface border border-dashed border-outline-variant/20 text-[9px] text-on-surface-variant/40 italic">
                        Map TBD
                      </span>
                    )}

                    {r.qualified ? (
                      <span className="text-[9px] font-bold text-primary whitespace-nowrap">
                        Top {r.qualified}
                      </span>
                    ) : (
                      <span className="text-[9px] text-on-surface-variant/40 italic whitespace-nowrap">
                        Adv. TBD
                      </span>
                    )}
                  </div>
                </div>

                {/* Directional Arrow */}
                {idx < rounds.length - 1 && <ArrowRight />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
