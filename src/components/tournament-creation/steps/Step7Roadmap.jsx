/* eslint-disable react-refresh/only-export-components */
import { useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RoundEditor from '../RoundEditor'
import TimelinePreview from '../TimelinePreview'
import { withReleaseDefaults } from '../../../utils/roomReveal'

const emptyRound = {
  date: '',
  time: '',
  name: '',
  map: '',
  qualified: '',
  room_id: '',
  room_password: '',
  id_pass_release_offset_minutes: 15
}
const ROUND_GAP_MINUTES = 45

function nextRoundName(prevName) {
  const trimmed = (prevName || '').trim()
  if (!trimmed) return ''
  const match = trimmed.match(/^(.*?)(\d+)$/)
  if (match) return `${match[1]}${Number(match[2]) + 1}`
  return `${trimmed} 2`
}

function shiftDateTime(dateStr, timeStr, minutes) {
  if (!dateStr) return { date: '', time: '' }
  const base = new Date(`${dateStr}T${timeStr || '00:00'}`)
  if (isNaN(base.getTime())) return { date: '', time: '' }
  const shifted = new Date(base.getTime() + minutes * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  return {
    date: `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`,
    time: `${pad(shifted.getHours())}:${pad(shifted.getMinutes())}`,
  }
}

function getRoundTs(r) {
  if (!r.date) return null
  const s = r.time ? `${r.date}T${r.time}` : `${r.date}T23:59`
  return new Date(s).getTime()
}

// Round authoring validation for the split Roadmap Preparation step.
export const validateStep7 = (data) => {
  if (!data) return { roadmap: 'Form data is not available' }
  const errors = {}
  const { roadmap, registrationCloseDate } = data
  const roundsPublishing = data.rounds_published !== false

  if (!roadmap || roadmap.length === 0) {
    if (roundsPublishing) errors.roadmap = 'At least one round is required'
  } else if (roundsPublishing) {
    const roundErrors = []
    roadmap.forEach((r, i) => {
      const err = {}
      if (!r.date) err.date = 'Date required'
      if (!r.time) err.time = 'Time required'
      if (!r.name) err.name = 'Round name required'
      if (!r.map) err.map = 'Map required'
      if (!r.qualified && r.qualified !== 0) err.qualified = 'Teams advancing required'

      if (r.date && r.time && registrationCloseDate) {
        const rTs = getRoundTs(r)
        const closeTs = new Date(registrationCloseDate).getTime()
        if (rTs && rTs <= closeTs) err.date = 'Round start must be after registration close'
      }

      if (i > 0) {
        const prev = roadmap[i - 1]
        if (r.date && r.time && prev.date && prev.time) {
          if (getRoundTs(r) <= getRoundTs(prev)) err.date = 'Must be after previous round'
        }
      }

      if (r.qualified && !['','0'].includes(String(r.qualified)) && roadmap.length > i + 1) {
        const remaining = roadmap.slice(i + 1).some(pr => !pr.date || !pr.time)
        if (remaining) err.qualified = 'Set dates/times for remaining rounds first'
      }

      roundErrors.push(Object.keys(err).length > 0 ? err : null)
    })
    errors.rounds = roundErrors
  }

  return errors
}

export default function Step7Roadmap({ data, onChange, errors, showAllErrors }) {
  const registrationOpenDate = data?.registrationOpenDate || ''
  const registrationCloseDate = data?.registrationCloseDate || ''
  const roadmap = data?.roadmap || []

  const updateRound = useCallback((index, updated) => {
    if (!onChange) return
    const prev = data || {}
    const r = [...(prev.roadmap || [])]
    r[index] = updated

    const thisTs = getRoundTs(updated)

    // Hard timestamp: round must be after registration close (round 0) or previous round
    if (thisTs) {
      if (index === 0 && prev.registrationCloseDate) {
        const closeTs = new Date(prev.registrationCloseDate).getTime()
        if (thisTs <= closeTs) {
          r[index] = withReleaseDefaults({ ...updated, date: '', time: '' })
          onChange({ ...prev, roadmap: r })
          return
        }
      }
      if (index > 0) {
        const prevTs = getRoundTs(r[index - 1])
        if (prevTs && thisTs <= prevTs) {
          r[index] = withReleaseDefaults({ ...updated, date: '', time: '' })
          onChange({ ...prev, roadmap: r })
          return
        }
      }
    }

    // Cascade forward: if this round moved past the next round, clear the next
    if (thisTs && index < r.length - 1) {
      const next = r[index + 1]
      const nextTs = getRoundTs(next)
      if (nextTs && nextTs <= thisTs) {
        const reset = { ...next, date: '', time: '' }
        r[index + 1] = withReleaseDefaults(reset)
      }
    }
    r[index] = withReleaseDefaults(r[index])
    onChange({ ...prev, roadmap: r })
  }, [data, onChange])

  const addRound = useCallback(() => {
    if (!onChange) return
    const prev = data || {}
    const list = [...(prev.roadmap || [])]
    const last = list[list.length - 1]

    let preset = { ...emptyRound }
    if (last) {
      const shifted = shiftDateTime(last.date, last.time, ROUND_GAP_MINUTES)
      preset = withReleaseDefaults({
        ...emptyRound,
        date: shifted.date,
        time: shifted.time,
        name: nextRoundName(last.name),
        map: last.map || '',
        qualified: ''
      })
    }

    onChange({ ...prev, roadmap: [...list, preset] })
  }, [data, onChange])

  const removeRound = useCallback((index) => {
    if (!onChange) return
    const prev = data || {}
    const r = [...(prev.roadmap || [])]
    r.splice(index, 1)
    onChange({ ...prev, roadmap: r.length > 0 ? r : [{ ...emptyRound }] })
  }, [data, onChange])

  const moveRound = useCallback((index, dir) => {
    if (!onChange) return
    const prev = data || {}
    const r = [...(prev.roadmap || [])]
    const target = index + dir
    if (target < 0 || target >= r.length) return
    ;[r[index], r[target]] = [r[target], r[index]]
    onChange({ ...prev, roadmap: r })
  }, [data, onChange])

  const getRoundMinDate = useCallback((idx) => {
    if (idx === 0) {
      return registrationCloseDate ? registrationCloseDate.slice(0, 10) : ''
    }
    const prev = (data?.roadmap || [])[idx - 1]
    return prev?.date || ''
  }, [registrationCloseDate, data])

  const getRoundMinTime = useCallback((idx) => {
    if (idx === 0) {
      if (!registrationCloseDate) return ''
      const closeStr = registrationCloseDate
      if (closeStr.includes('T')) {
        return closeStr.split('T')[1]?.slice(0, 5) || ''
      }
      return ''
    }
    const prev = (data?.roadmap || [])[idx - 1]
    return prev?.time || ''
  }, [registrationCloseDate, data])

  const roundErrors = useMemo(() => {
    if (!showAllErrors) return Array(roadmap.length || 0).fill(null)
    if (!errors?.rounds) return Array(roadmap.length || 0).fill(null)
    return errors.rounds
  }, [showAllErrors, errors, roadmap.length])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full max-w-2xl mx-auto space-y-8 pb-8"
    >
      {/* Section: Round Publication */}
      <div className="bg-surface-container-low/40 rounded-2xl p-5 md:p-6 space-y-5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-on-background">Round Publication</h3>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">Control when players see your tournament rounds</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-1.5 p-1.5 rounded-xl bg-surface/60 border border-outline-variant/30">
          <button
            type="button"
            onClick={() => onChange({ ...data, rounds_published: true })}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              data.rounds_published !== false
                ? 'bg-primary text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                : 'text-on-surface-variant hover:text-on-background hover:bg-surface'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Publish Rounds
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...data, rounds_published: false })}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              data.rounds_published === false
                ? 'bg-primary text-white shadow-[0_0_16px_rgba(59,130,246,0.3)]'
                : 'text-on-surface-variant hover:text-on-background hover:bg-surface'
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
            Publish Later
          </button>
        </div>

        <div>
          <p className="text-xs leading-relaxed text-on-surface-variant/70">
            {data.rounds_published === false
              ? 'Players will see a "Rounds will be published soon." note instead of the roadmap. You can publish your rounds anytime later from your tournament management page.'
              : 'Your rounds will be visible to players on the tournament page as soon as the tournament goes live.'}
          </p>
        </div>
      </div>

      {/* Section: Round Progression */}
      <div className="bg-surface-container-low/40 rounded-2xl p-5 md:p-6 space-y-5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-on-background">Round Progression</h3>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">Define each stage of your tournament — dates, maps, and advancing teams</p>
          </div>
        </div>

        {showAllErrors && errors?.roadmap && typeof errors.roadmap === 'string' && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-error/10">
            <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
            <p className="text-[11px] font-medium text-error">{errors.roadmap}</p>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {roadmap.map((round, i) => (
            <RoundEditor
              key={`round-${i}`}
              round={round}
              index={i}
              onChange={(v) => updateRound(i, v)}
              onDelete={() => removeRound(i)}
              onMoveUp={() => moveRound(i, -1)}
              onMoveDown={() => moveRound(i, 1)}
              isFirst={i === 0}
              isLast={i === roadmap.length - 1}
              error={roundErrors?.[i] ? Object.values(roundErrors[i]).join('. ') : null}
              minDate={getRoundMinDate(i)}
              minTime={getRoundMinTime(i)}
            />
          ))}
        </AnimatePresence>

        {/* Add Round Button */}
        <motion.button
          type="button"
          onClick={addRound}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          className="w-full py-3.5 rounded-xl bg-primary text-on-primary text-sm font-bold shadow-[0_4px_18px_-4px_rgba(59,130,246,0.45)] hover:shadow-[0_0_24px_rgba(59,130,246,0.35)] hover:bg-primary/90 transition-all flex items-center justify-center gap-2.5"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Add Round</span>
        </motion.button>
      </div>

      {/* Timeline Preview — always visible */}
      <div className="bg-surface-container-low/40 rounded-2xl p-5 md:p-6 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-background">Timeline Preview</h3>
            <p className="text-[11px] text-on-surface-variant/60 mt-0.5">Full tournament schedule at a glance</p>
          </div>
        </div>
        <TimelinePreview
          registrationOpen={registrationOpenDate}
          registrationClose={registrationCloseDate}
          matchStart={roadmap[0]?.date ? `${roadmap[0].date}T${roadmap[0].time || '00:00'}` : ''}
          rounds={roadmap}
        />
      </div>
    </motion.div>
  )
}