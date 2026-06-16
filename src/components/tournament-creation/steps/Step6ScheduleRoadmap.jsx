import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TimelinePreview from '../TimelinePreview'
import RoundEditor from '../RoundEditor'

let roundIdCounter = 0
function newRound() {
  roundIdCounter++
  return { id: `rnd-${Date.now()}-${roundIdCounter}`, name: '', date: '', time: '', map: '', qualified: '' }
}

function getRoundTs(r) {
  if (!r.date || !r.time) return null
  return new Date(`${r.date}T${r.time}`)
}

function formatRegDuration(openDate, closeDate) {
  if (!openDate || !closeDate) return null
  const start = new Date(openDate)
  const end = new Date(closeDate)
  if (end <= start) return null
  const diffMs = end.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const diffHours = Math.round(diffMs / (1000 * 60 * 60))
  const startStr = start.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const endStr = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
  const dayLabel = diffDays === 1 ? 'day' : 'days'
  const hourLabel = diffHours === 1 ? 'hour' : 'hours'
  return `Registration starts on ${startStr} and closes on ${endStr} (Total duration: ${diffDays} ${dayLabel} / ${diffHours} ${hourLabel})`
}

function computeRoundErrors(regClose, rounds) {
  const errs = {}
  if (!rounds || rounds.length === 0) return errs
  const regCloseTs = regClose ? new Date(regClose) : null
  rounds.forEach((r, idx) => {
    const rTs = getRoundTs(r)
    if (!rTs) return
    if (idx === 0) {
      if (regCloseTs && rTs <= regCloseTs) {
        errs[r.id] = 'Suggestion: Round 1 must start after registration closes.'
      }
    } else {
      const prevTs = getRoundTs(rounds[idx - 1])
      if (prevTs && rTs <= prevTs) {
        errs[r.id] = `Suggestion: Round ${idx + 1} must be scheduled after the start time of Round ${idx}.`
      }
    }
  })
  return errs
}

function hasBlockingErrors(errs) {
  return Object.values(errs).some(msg => !msg.startsWith('Suggestion:'))
}

function DateInput({ label, value, onChange, min, subtext }) {
  return (
    <div className="relative pb-5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[10px] sm:text-xs font-bold text-on-surface-variant uppercase tracking-widest">
          <span className="text-error mr-1">*</span>{label}
        </span>
        <div className="relative border-b border-outline-variant/30 focus-within:border-primary transition-colors py-1">
          <input
            type="datetime-local"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            min={min || ''}
            className="w-full bg-transparent text-sm text-white placeholder-on-surface-variant/40 focus:outline-none py-1.5 tabular-nums focus:ring-0"
          />
        </div>
        {subtext && (
          <p className="text-[11px] text-on-surface-variant/60 leading-snug mt-1">{subtext}</p>
        )}
      </div>
    </div>
  )
}

export default function Step6ScheduleRoadmap({ data, onChange, onValidationChange }) {
  const rounds = data.roadmap || []
  const roundErrors = computeRoundErrors(data.registrationCloseDate, rounds)

  const updateRounds = useCallback((newRounds) => {
    onChange({ ...data, roadmap: newRounds })
  }, [data, onChange])

  const addRound = useCallback(() => updateRounds([...rounds, newRound()]), [rounds, updateRounds])

  const updateRound = useCallback((idx, updated) => {
    const next = [...rounds]
    next[idx] = updated
    updateRounds(next)
  }, [rounds, updateRounds])

  const deleteRound = useCallback((idx) => {
    if (rounds.length <= 1) return
    updateRounds(rounds.filter((_, i) => i !== idx))
  }, [rounds, updateRounds])

  const moveRound = useCallback((idx, dir) => {
    const target = idx + dir
    if (target < 0 || target >= rounds.length) return
    const next = [...rounds]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateRounds(next)
  }, [rounds, updateRounds])

  const handleRegChange = useCallback((field, value) => {
    onChange({ ...data, [field]: value })
  }, [data, onChange])

  const blocked = hasBlockingErrors(roundErrors)

  useEffect(() => {
    if (onValidationChange) {
      onValidationChange(blocked)
    }
  }, [blocked, onValidationChange])

  const now = new Date().toISOString().slice(0, 16)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <div>
        <h2 className="text-xl font-bold text-white">Schedule & Roadmap</h2>
        <p className="text-sm text-on-surface-variant mt-1">Configure timings and layout the rounds roadmap progression.</p>
      </div>

      <div className="bg-surface-container/30 border border-outline-variant/20 rounded-2xl p-6 sm:p-8 shadow-sm">
        <h3 className="text-sm font-semibold text-on-background mb-4 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
          Registration Window
        </h3>
        <DateInput
          label="Registration Opens"
          value={data.registrationOpenDate}
          onChange={(v) => handleRegChange('registrationOpenDate', v)}
          min={now}
          subtext="Registration will start at this time."
        />
        <DateInput
          label="Registration Closes"
          value={data.registrationCloseDate}
          onChange={(v) => handleRegChange('registrationCloseDate', v)}
          min={data.registrationOpenDate || now}
          subtext="Registration will close at this time."
        />
        {formatRegDuration(data.registrationOpenDate, data.registrationCloseDate) && (
          <p className="text-[11px] text-on-surface-variant/60 leading-snug -mt-4">{formatRegDuration(data.registrationOpenDate, data.registrationCloseDate)}</p>
        )}
      </div>

      <div className="bg-surface-container/30 border border-outline-variant/20 rounded-2xl p-6 sm:p-8 shadow-sm">
        <h3 className="text-sm font-semibold text-on-background mb-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
          Rounds Progression
        </h3>

        <AnimatePresence mode="popLayout">
          {rounds.map((r, idx) => (
            <RoundEditor
              key={r.id}
              round={r}
              index={idx}
              onChange={(updated) => updateRound(idx, updated)}
              onDelete={() => deleteRound(idx)}
              onMoveUp={() => moveRound(idx, -1)}
              onMoveDown={() => moveRound(idx, 1)}
              isFirst={idx === 0}
              isLast={idx === rounds.length - 1}
              error={roundErrors[r.id]}
            />
          ))}
        </AnimatePresence>

        {rounds.length === 0 && (
          <div className="text-center py-8 border-2 border-dashed border-outline-variant/20 rounded-xl mb-4">
            <p className="text-xs text-on-surface-variant/50">No rounds added yet.</p>
          </div>
        )}

        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={addRound}
          className="w-full py-3 rounded-xl border-2 border-dashed border-outline-variant/30 text-sm text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all bg-background/30"
        >
          + Add Round
        </motion.button>
      </div>

      <div className="pt-2">
        <TimelinePreview
          registrationOpen={data.registrationOpenDate}
          registrationClose={data.registrationCloseDate}
          matchStart={rounds[0]?.date && rounds[0]?.time ? `${rounds[0].date}T${rounds[0].time}` : data.startDate || ''}
          rounds={rounds}
        />
      </div>
    </motion.div>
  )
}
