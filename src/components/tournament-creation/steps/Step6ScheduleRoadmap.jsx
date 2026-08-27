import { useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RoundEditor from '../RoundEditor'
import TimelinePreview from '../TimelinePreview'

const emptyRound = { date: '', time: '', name: '', map: '', qualified: '' }
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

export const validateStep6 = (data) => {
  if (!data) return { regOpen: 'Form data is not available' }
  const errors = {}
  const { registrationOpenDate, registrationCloseDate, roadmap } = data

  if (!registrationOpenDate) errors.regOpen = 'Registration open date is required'
  if (!registrationCloseDate) errors.regClose = 'Registration close date is required'
  if (registrationOpenDate && registrationCloseDate) {
    if (new Date(registrationCloseDate).getTime() <= new Date(registrationOpenDate).getTime()) {
      errors.regClose = 'Registration close must be after registration open'
    }
  }

  if (!roadmap || roadmap.length === 0) {
    errors.roadmap = 'At least one round is required'
  } else {
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

export default function Step6ScheduleRoadmap({ data, onChange, errors, showAllErrors }) {
  const registrationOpenDate = data?.registrationOpenDate || ''
  const registrationCloseDate = data?.registrationCloseDate || ''
  const roadmap = data?.roadmap || []

  const handleRegChange = useCallback((field, value) => {
    if (!onChange) return
    const prev = data || {}
    const next = { ...prev, [field]: value }

    // Hard timestamp: Registration Closes must be strictly after Registration Opens
    if (field === 'registrationCloseDate' && value && prev.registrationOpenDate) {
      if (new Date(value).getTime() <= new Date(prev.registrationOpenDate).getTime()) {
        next.registrationCloseDate = ''
      }
    }

    // Cascade: if Registration Opens moved past Registration Closes, clear closes
    if (field === 'registrationOpenDate' && value && prev.registrationCloseDate) {
      if (new Date(prev.registrationCloseDate).getTime() <= new Date(value).getTime()) {
        next.registrationCloseDate = ''
      }
    }

    // Cascade: if Registration Closes moved past Round 1, clear round 1
    if (field === 'registrationCloseDate' && value && prev.roadmap?.[0]?.date && prev.roadmap[0].time) {
      const closeTs = new Date(value).getTime()
      const r1Ts = getRoundTs(prev.roadmap[0])
      if (r1Ts && r1Ts <= closeTs) {
        const reset = { ...prev.roadmap[0] }
        reset.date = ''
        reset.time = ''
        next.roadmap = [reset, ...prev.roadmap.slice(1)]
      }
    }
    onChange(next)
  }, [data, onChange])

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
          r[index] = { ...updated, date: '', time: '' }
          onChange({ ...prev, roadmap: r })
          return
        }
      }
      if (index > 0) {
        const prevTs = getRoundTs(r[index - 1])
        if (prevTs && thisTs <= prevTs) {
          r[index] = { ...updated, date: '', time: '' }
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
        r[index + 1] = reset
      }
    }
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
      preset = {
        date: shifted.date,
        time: shifted.time,
        name: nextRoundName(last.name),
        map: last.map || '',
        qualified: ''
      }
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
    const prev = roadmap[idx - 1]
    return prev?.date || ''
  }, [registrationCloseDate, roadmap])

  const getRoundMinTime = useCallback((idx) => {
    if (idx === 0) {
      if (!registrationCloseDate) return ''
      const closeStr = registrationCloseDate
      if (closeStr.includes('T')) {
        return closeStr.split('T')[1]?.slice(0, 5) || ''
      }
      return ''
    }
    const prev = roadmap[idx - 1]
    return prev?.time || ''
  }, [registrationCloseDate, roadmap])

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
      {/* Section: Registration Window */}
      <div className="bg-surface-container-low/40 rounded-2xl p-5 md:p-6 space-y-5 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.12)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-on-background">Registration Window</h3>
            <p className="text-xs text-on-surface-variant/60 mt-0.5">When players can submit their entries</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Registration Opens <span className="text-[10px] font-normal text-on-surface-variant/50">IST</span>
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={registrationOpenDate}
                onChange={(e) => handleRegChange('registrationOpenDate', e.target.value)}
                className={`w-full p-3 rounded-xl bg-surface/80 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner ${
                  showAllErrors && errors?.regOpen ? 'ring-2 ring-error/50' : ''
                }`}
              />
            </div>
            {showAllErrors && errors?.regOpen && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1 text-error">
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                {errors.regOpen}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Registration Closes <span className="text-[10px] font-normal text-on-surface-variant/50">IST</span>
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={registrationCloseDate}
                min={registrationOpenDate || ''}
                onChange={(e) => handleRegChange('registrationCloseDate', e.target.value)}
                className={`w-full p-3 rounded-xl bg-surface/80 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner ${
                  showAllErrors && errors?.regClose ? 'ring-2 ring-error/50' : ''
                }`}
              />
            </div>
            {showAllErrors && errors?.regClose && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1 text-error">
                <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                {errors.regClose}
              </p>
            )}
          </div>
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
