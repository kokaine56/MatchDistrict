import { motion } from 'framer-motion'

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

const CloseIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
    <circle cx="12" cy="12" r="10" />
  </svg>
)

const SwordsIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4 L16 14" />
    <path d="M6 4 L3 7" />
    <path d="M6 4 L8 6" />
    <path d="M3 7 L3 20" />
    <path d="M18 4 L8 14" />
    <path d="M18 4 L21 7" />
    <path d="M18 4 L16 6" />
    <path d="M21 7 L21 20" />
  </svg>
)

function TimelineNode({ label, date, icon, isLast, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.3, ease: 'easeOut' }}
      className="relative flex gap-4"
    >
      <div className="flex flex-col items-center w-6 shrink-0">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.1 + 0.1, type: 'spring', stiffness: 200, damping: 15 }}
          className="w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(99,102,241,0.45)] shrink-0 z-10"
        />
        {!isLast && <div className="w-0.5 flex-1 min-h-[32px] bg-primary/20" />}
      </div>
      <div className="flex items-center gap-2 pb-4 flex-1 min-w-0">
        <span className="text-[13px] text-primary shrink-0">{icon}</span>
        <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">{label}</span>
        <span className="text-xs text-on-background font-semibold ml-auto text-right shrink-0">
          {new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}

export default function TimelinePreview({ registrationOpen, registrationClose, matchStart, rounds = [] }) {
  const items = [
    { label: 'Registration Opens', date: registrationOpen, icon: <CalendarIcon /> },
    { label: 'Registration Closes', date: registrationClose, icon: <CloseIcon /> },
    { label: 'Match Starts', date: matchStart, icon: <SwordsIcon /> },
  ].filter((i) => i.date)

  if (items.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-on-background">Timeline Preview</h3>
      <div className="bg-surface-container/30 border border-outline-variant/20 rounded-xl p-5">
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
      {rounds.length > 0 && (
        <div className="pt-2 border-t border-outline-variant/20">
          <h4 className="text-xs font-medium text-on-surface-variant mb-2">Rounds</h4>
          <div className="flex flex-wrap items-center gap-2">
            {rounds.map((r, idx) => (
              <div key={r.id || idx} className="flex items-center gap-1">
                <span className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary font-medium">{r.name || `Round ${idx + 1}`}</span>
                {idx < rounds.length - 1 && <span className="text-on-surface-variant text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
