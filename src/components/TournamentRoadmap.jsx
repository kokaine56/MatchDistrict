import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { formatTime12hIST } from '../utils/timeFormat'
import {
  withReleaseDefaults,
  getRoundRelease,
  formatRevealLabel,
  isRevealAvailable,
  getRoundState,
} from '../utils/roomReveal'

function palette(isGoldTheme) {
  return isGoldTheme
    ? {
        title: 'text-[#1F2937]',
        label: 'text-[#8A6A1F]',
        sub: 'text-[#6B7280]',
        value: 'text-[#1F2937]',
        muted: 'text-[#9CA3AF]',
        accent: 'text-[#B8860B]',
        line: 'bg-[#D4A017]/30',
        node: 'bg-gradient-to-br from-[#FFE082] to-[#B8860B] text-[#1F2937] shadow-[0_2px_8px_rgba(212,160,23,0.4)]',
        nodeDone: 'bg-[#E7DFC8] text-[#8A6A1F]',
        nodeLive: 'bg-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]',
        card: 'bg-[#FAF7F0] border-[#D4A017]/35',
        connectorRing: 'border-[#D4A017]/60',
        state: 'text-emerald-700',
        roomBox: 'bg-[#FFF8DC]/70 border-[#D4A017]/25',
      }
    : {
        title: 'text-slate-900',
        label: 'text-slate-400',
        sub: 'text-slate-500',
        value: 'text-slate-700',
        muted: 'text-slate-400',
        accent: 'text-blue-600',
        line: 'bg-slate-300',
        node: 'bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.4)]',
        nodeDone: 'bg-slate-200 text-slate-500',
        nodeLive: 'bg-emerald-500 text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]',
        card: 'bg-white border-slate-200',
        connectorRing: 'border-blue-600/50',
        state: 'text-emerald-600',
        roomBox: 'bg-slate-50 border-slate-200',
      }
}

function CalIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}

function MapIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function UsersIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function KeyIcon({ className = '' }) {
  return (
    <svg className={`w-4 h-4 ${className}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  )
}

function formatRoundDate(dateStr) {
  if (!dateStr) return '—'
  try {
    const d = new Date(`${dateStr}T00:00`)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function Field({ icon, label, value, accent, labelCls, valueCls }) {
  return (
    <div className="flex items-start gap-2 min-w-0">
      <span className={`${accent} shrink-0 mt-0.5`}>{icon}</span>
      <div className="min-w-0">
        <p className={`text-[9px] font-bold uppercase tracking-wider ${labelCls} leading-tight`}>{label}</p>
        <p className={`text-[13px] font-semibold ${valueCls} truncate leading-snug mt-0.5`}>{value}</p>
      </div>
    </div>
  )
}

function RoomField({ item, isGoldTheme }) {
  const C = palette(isGoldTheme)
  const { round, release, releaseLabel, available } = item
  const show = Boolean(round.date && round.time)
  const modeText = release.mode === 'custom'
    ? 'custom release'
    : `${release.offsetMinutes} min before match`
  return (
    <div className="col-span-2 mt-1">
      <div className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${C.roomBox}`}>
        <span className={`${C.accent} shrink-0 mt-0.5`}><KeyIcon /></span>
        <div className="min-w-0 flex-1">
          <p className={`text-[9px] font-bold uppercase tracking-wider ${C.label}`}>ID / PWD · {modeText}</p>
          {show ? (
            <p className={`text-[13px] font-semibold ${C.value} leading-snug mt-0.5`}>
              {available ? 'Available' : `Unlocks at ${releaseLabel}`}
            </p>
          ) : (
            <p className={`text-[13px] font-semibold ${C.muted} leading-snug mt-0.5`}>Set the match schedule</p>
          )}
        </div>
      </div>
    </div>
  )
}

function RoadmapCard({ item, index, isGoldTheme, reduceMotion }) {
  const C = palette(isGoldTheme)
  const { round, name, state } = item
  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
      className={`h-full rounded-2xl border p-4 sm:p-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.3)] ${C.card}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${C.label}`}>
          Round {String(index + 1).padStart(2, '0')}
        </span>
        {state === 'live' && (
          <span className={`flex items-center gap-1.5 text-[11px] font-bold ${C.state}`}>
            <span className="relative flex w-1.5 h-1.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${C.state === 'text-emerald-600' ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
              <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-emerald-500" />
            </span>
            Live
          </span>
        )}
        {state === 'completed' && <span className={`text-[11px] font-semibold ${C.muted}`}>Completed</span>}
      </div>

      <h4 className={`text-sm sm:text-base font-bold ${C.title} mb-4 pr-1`}>{name}</h4>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Field icon={<CalIcon />} label="Date" value={formatRoundDate(round.date)} accent={C.accent} labelCls={C.label} valueCls={C.value} />
        <Field icon={<ClockIcon />} label="Time" value={round.time ? formatTime12hIST(round.time) : '—'} accent={C.accent} labelCls={C.label} valueCls={C.value} />
        <Field icon={<MapIcon />} label="Map" value={round.map || '—'} accent={C.accent} labelCls={C.label} valueCls={C.value} />
        <Field icon={<UsersIcon />} label="Qualifies" value={round.qualified || round.qualified === 0 ? `${round.qualified} teams` : '—'} accent={C.accent} labelCls={C.label} valueCls={C.value} />
        <RoomField item={item} isGoldTheme={isGoldTheme} />
      </div>
    </motion.div>
  )
}

export default function TournamentRoadmap({ roadmap = [], isGoldTheme = false }) {
  const reduceMotion = useReducedMotion()

  const items = useMemo(
    () => roadmap.map((round, idx) => {
      const normalized = withReleaseDefaults(round || {})
      return {
        round: normalized,
        name: normalized.name || `Round ${idx + 1}`,
        state: getRoundState(normalized),
        release: getRoundRelease(normalized),
        releaseLabel: formatRevealLabel(normalized),
        available: isRevealAvailable(normalized),
      }
    }),
    [roadmap]
  )

  const C = palette(isGoldTheme)
  const count = items.length

  if (count === 0) {
    return (
      <div className="w-full">
        <div className={`rounded-xl border px-5 py-8 text-center text-sm font-medium ${
          isGoldTheme ? 'bg-[#241A05]/60 border-[#FFE082]/25 text-[#E9D9A8]' : 'bg-slate-900/60 border-slate-700/60 text-slate-400'
        }`}>
          No roadmap rounds scheduled yet.
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className={`text-base sm:text-lg font-black uppercase tracking-wider ${isGoldTheme ? 'text-[#FFE082]' : 'text-white'}`}>
          Tournament Roadmap
        </h3>
        <p className={`text-xs mt-1 ${isGoldTheme ? 'text-[#A89052]' : 'text-slate-400'}`}>
          Follow the tournament progression and match schedule.
        </p>
      </div>

      {/* Mobile & tablet — vertical timeline with left spine */}
      <ol aria-label="Tournament rounds" className="md:hidden relative list-none m-0 p-0">
        {items.map((item, idx) => {
          const nodeCls = item.state === 'completed' ? C.nodeDone : item.state === 'live' ? C.nodeLive : C.node
          return (
            <li key={idx} className="relative pl-9 pb-6 last:pb-0">
              {idx < count - 1 && (
                <span aria-hidden="true" className={`absolute left-[13px] top-9 bottom-0 w-px ${C.line}`} />
              )}
              <span aria-hidden="true" className={`absolute left-0 top-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold z-10 ${nodeCls}`}>
                {idx + 1}
              </span>
              <RoadmapCard item={item} index={idx} isGoldTheme={isGoldTheme} reduceMotion={reduceMotion} />
            </li>
          )
        })}
      </ol>

      {/* Desktop — horizontal flow with connecting segments */}
      <ol aria-label="Tournament rounds" className="hidden md:flex list-none m-0 p-0 items-stretch gap-6">
        {items.map((item, idx) => (
          <li key={idx} className="relative flex-1 min-w-0">
            <RoadmapCard item={item} index={idx} isGoldTheme={isGoldTheme} reduceMotion={reduceMotion} />
            {idx < count - 1 && (
              <div aria-hidden="true" className="absolute left-full top-1/2 -translate-y-1/2 w-6 flex items-center">
                <span className={`flex-1 h-px ${C.line}`} />
                <span className={`mx-1 w-1.5 h-1.5 rounded-full border-2 ${C.connectorRing}`} />
                <span className={`flex-1 h-px ${C.line}`} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}