import { useMemo, useState, useEffect, useRef } from 'react'
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
        idpassCard: 'bg-white/70 border-[#D4A017]/25',
        connectorRing: 'border-[#D4A017]/60',
        state: 'text-emerald-700',
        placeholderBg: 'bg-[#241A05]/60',
        placeholderBorder: 'border-[#FFE082]/25',
        placeholderText: 'text-[#E9D9A8]',
        placeholderSub: 'text-[#A89052]',
        heading: 'text-[#FFE082]',
        headerSub: 'text-[#A89052]',
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
        idpassCard: 'bg-slate-50 border-slate-200',
        connectorRing: 'border-blue-600/50',
        state: 'text-emerald-600',
        placeholderBg: 'bg-slate-900/60',
        placeholderBorder: 'border-slate-700/60',
        placeholderText: 'text-slate-400',
        placeholderSub: 'text-slate-500',
        heading: 'text-white',
        headerSub: 'text-slate-400',
      }
}

function CalIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}

function MapIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  )
}

function RoadmapIcon() {
  return (
    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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
        <p className={`text-[10px] font-semibold ${labelCls} leading-tight`}>{label}</p>
        <p className={`text-[13px] font-semibold ${valueCls} leading-snug mt-0.5`}>{value}</p>
      </div>
    </div>
  )
}

function CopyButton({ value, accent }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value)
      } else {
        const ta = document.createElement('textarea')
        ta.value = value
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch (err) {
      if (err) console.error('Copy failed:', err)
    }
  }
  return (
    <button type="button" onClick={copy}
      className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-all ${
        copied
          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600'
          : `${accent} border-outline-variant/40 bg-surface/50 hover:bg-surface`
      }`}
      aria-label={`Copy ${value}`}>
      {copied ? (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
          Copied
        </>
      ) : (
        <>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          Copy
        </>
      )}
    </button>
  )
}

function IdPassEditor({ initial, onSave, onCancel, isGoldTheme }) {
  const C = palette(isGoldTheme)
  const [values, setValues] = useState({ room_id: initial?.room_id || '', room_password: initial?.room_password || '' })
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className={`block text-[10px] font-semibold ${C.label} mb-1`}>Room ID</label>
          <input
            type="text"
            value={values.room_id}
            maxLength={80}
            onChange={(e) => setValues((v) => ({ ...v, room_id: e.target.value }))}
            placeholder="Enter room ID"
            className="w-full px-2.5 py-2 rounded-lg bg-surface/80 text-[13px] text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner border border-outline-variant/30"
          />
        </div>
        <div>
          <label className={`block text-[10px] font-semibold ${C.label} mb-1`}>Room Password</label>
          <input
            type="text"
            value={values.room_password}
            maxLength={80}
            onChange={(e) => setValues((v) => ({ ...v, room_password: e.target.value }))}
            placeholder="Enter room password"
            className="w-full px-2.5 py-2 rounded-lg bg-surface/80 text-[13px] text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner border border-outline-variant/30"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave(values.room_id.trim(), values.room_password.trim())}
          className="px-3.5 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-all shadow-[0_0_14px_rgba(59,130,246,0.3)]">
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`px-3.5 py-2 rounded-lg text-xs font-semibold border border-outline-variant/40 hover:bg-surface transition-all ${C.sub}`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function IdPassSection({ item, isGoldTheme, isOwner, onSaveCredentials }) {
  const C = palette(isGoldTheme)
  const { round, releaseLabel, configured, released, visibleValues } = item
  const [editing, setEditing] = useState(false)

  const valuesPresent = (round.room_id && round.room_id.trim()) || (round.room_password && round.room_password.trim())

  const renderLocked = () => (
    <div className={`flex items-start gap-2 min-w-0 ${C.title}`}>
      <span className={`${C.accent} shrink-0 mt-0.5`}><KeyIcon /></span>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold ${C.label} leading-tight`}>ID-Pass</p>
        <p className="text-[13px] font-semibold leading-snug mt-0.5">Locked</p>
        <p className={`text-[10px] ${C.sub} leading-snug mt-0.5`}>Available to registered teams</p>
      </div>
    </div>
  )

  const renderPending = () => (
    <div className={`flex items-start gap-2 min-w-0 ${C.title}`}>
      <span className={`${C.accent} shrink-0 mt-0.5`}><KeyIcon /></span>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold ${C.label} leading-tight`}>ID-Pass</p>
        <p className="text-[13px] font-semibold leading-snug mt-0.5">
          {releaseLabel ? `Available from ${releaseLabel}` : '—'}
        </p>
        <p className={`text-[10px] ${C.sub} leading-snug mt-0.5`}>Unlocks 15 minutes before the match</p>
      </div>
    </div>
  )

  const renderEmpty = () => (
    <div className={`flex items-start gap-2 min-w-0 ${C.title}`}>
      <span className={`${C.accent} shrink-0 mt-0.5`}><KeyIcon /></span>
      <div className="min-w-0">
        <p className={`text-[10px] font-semibold ${C.label} leading-tight`}>ID-Pass</p>
        <p className="text-[13px] font-semibold leading-snug mt-0.5">Not added yet</p>
        <p className={`text-[10px] ${C.sub} leading-snug mt-0.5`}>Unlocks 15 minutes before the match</p>
      </div>
    </div>
  )

  const renderValue = () => {
    if (editing) {
      return (
        <IdPassEditor
          initial={{ room_id: round.room_id, room_password: round.room_password }}
          isGoldTheme={isGoldTheme}
          onCancel={() => setEditing(false)}
          onSave={(roomId, roomPassword) => onSaveCredentials(roomId, roomPassword)}
        />
      )
    }
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className={`${C.accent} shrink-0 mt-0.5`}><KeyIcon /></span>
          <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold ${C.label} leading-tight`}>ID-Pass</p>
              <p className="text-[13px] font-semibold leading-snug mt-0.5">Room ID &amp; Password</p>
              <p className={`text-[10px] ${C.sub} leading-snug mt-0.5`}>Copy the credentials below to join the lobby</p>
            </div>
            {isOwner && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-outline-variant/40 bg-surface/50 hover:bg-surface transition-all ${C.sub}`}
                aria-label="Edit room credentials"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                Edit
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-6">
          <div className="flex items-center justify-between gap-2 min-w-0 rounded-lg border border-outline-variant/30 bg-surface/60 px-2.5 py-2">
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold ${C.label} leading-tight`}>Room ID</p>
              <p className={`text-[13px] font-semibold truncate ${C.value} leading-snug mt-0.5`} title={round.room_id || ''}>{round.room_id || '—'}</p>
            </div>
            {round.room_id && <CopyButton value={round.room_id} accent={C.accent} />}
          </div>
          <div className="flex items-center justify-between gap-2 min-w-0 rounded-lg border border-outline-variant/30 bg-surface/60 px-2.5 py-2">
            <div className="min-w-0">
              <p className={`text-[10px] font-semibold ${C.label} leading-tight`}>Room Password</p>
              <p className={`text-[13px] font-semibold truncate ${C.value} leading-snug mt-0.5`} title={round.room_password || ''}>{round.room_password || '—'}</p>
            </div>
            {round.room_password && <CopyButton value={round.room_password} accent={C.accent} />}
          </div>
        </div>
      </div>
    )
  }

  let content
  if (visibleValues && valuesPresent) {
    content = renderValue()
  } else if (isOwner) {
    content = editing
      ? <IdPassEditor initial={{ room_id: round.room_id || '', room_password: round.room_password || '' }} isGoldTheme={isGoldTheme} onCancel={() => setEditing(false)} onSave={(roomId, roomPassword) => onSaveCredentials(roomId, roomPassword)} />
      : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {renderEmpty()}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold hover:bg-primary/90 transition-all shadow-[0_0_12px_rgba(59,130,246,0.3)]"
            aria-label="Add room ID and password"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add ID-Pass
          </button>
        </div>
      )
  } else if (released || round.release_available) {
    content = renderLocked()
  } else if (configured) {
    content = renderPending()
  } else {
    content = renderEmpty()
  }

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 mt-3 ${C.idpassCard}`}>
      {content}
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
        <Field icon={<ClockIcon />} label="Match Start Time" value={round.time ? formatTime12hIST(round.time) : '—'} accent={C.accent} labelCls={C.label} valueCls={C.value} />
        <Field icon={<MapIcon />} label="Map" value={round.map || '—'} accent={C.accent} labelCls={C.label} valueCls={C.value} />
        <Field icon={<UsersIcon />} label="Qualifies" value={round.qualified || round.qualified === 0 ? `${round.qualified} teams` : '—'} accent={C.accent} labelCls={C.label} valueCls={C.value} />
      </div>
    </motion.div>
  )
}

export default function TournamentRoadmap({ roadmap = [], isGoldTheme = false, roundsPublished = true, isOwner = false, onSaveCredentials = null }) {
  const reduceMotion = useReducedMotion()

  const items = useMemo(
    () => roadmap.map((round, idx) => {
      const normalized = withReleaseDefaults(round || {})
      const configured = normalized.room_credentials_configured ?? (
        Boolean(String(normalized.room_id || '').trim()) || Boolean(String(normalized.room_password || '').trim())
      )
      const released = normalized.release_available ?? isRevealAvailable(normalized)
      return {
        round: normalized,
        name: normalized.name || `Round ${idx + 1}`,
        state: getRoundState(normalized),
        release: getRoundRelease(normalized),
        releaseLabel: formatRevealLabel(normalized),
        configured,
        released,
        visibleValues: normalized.room_id != null && normalized.room_password != null,
      }
    }),
    [roadmap]
  )

  const C = palette(isGoldTheme)
  const count = items.length
  const showPlaceholder = !roundsPublished || count === 0

  if (showPlaceholder) {
    return (
      <div className="w-full">
        <div className="mb-6">
          <h3 className={`text-base sm:text-lg font-black uppercase tracking-wider ${C.heading}`}>
            Tournament Roadmap
          </h3>
        </div>
        <div className={`rounded-2xl border border-dashed px-5 py-10 text-center ${C.placeholderBg} ${C.placeholderBorder}`}>
          <RoadmapIcon className={`${C.placeholderText} mx-auto mb-3 opacity-60`} />
          <p className={`text-sm font-semibold ${C.placeholderText}`}>Rounds will be published soon.</p>
          <p className={`text-xs mt-1.5 ${C.placeholderSub}`}>The tournament organizer is finalizing the match schedule.</p>
        </div>
      </div>
    )
  }

  const renderRound = (item, idx) => (
    <div className="min-w-0 w-full">
      <RoadmapCard item={item} index={idx} isGoldTheme={isGoldTheme} reduceMotion={reduceMotion} />
      <IdPassSection
        item={item}
        isGoldTheme={isGoldTheme}
        isOwner={isOwner}
        onSaveCredentials={onSaveCredentials
          ? (roomId, roomPassword) => onSaveCredentials(idx, roomId, roomPassword)
          : null}
      />
    </div>
  )

  return (
    <div className="w-full">
      <div className="mb-6">
        <h3 className={`text-base sm:text-lg font-black uppercase tracking-wider ${C.heading}`}>
          Tournament Roadmap
        </h3>
        <p className={`text-xs mt-1 ${C.headerSub}`}>
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
              {renderRound(item, idx)}
            </li>
          )
        })}
      </ol>

      {/* Desktop — horizontal flow with connecting segments */}
      <ol aria-label="Tournament rounds" className="hidden md:flex list-none m-0 p-0 items-stretch gap-6">
        {items.map((item, idx) => (
          <li key={idx} className="relative flex-1 min-w-0">
            {renderRound(item, idx)}
            {idx < count - 1 && (
              <div aria-hidden="true" className="absolute left-full top-10 -translate-y-1/2 w-6 flex items-center">
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