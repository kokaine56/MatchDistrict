import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import TimelinePreview from '../TimelinePreview'

function validateTiming(regOpen, regClose, matchStart) {
  const errs = {}
  if (!regOpen) errs.registrationOpenDate = 'Registration open date is required.'
  if (!regClose) errs.registrationCloseDate = 'Registration close date is required.'
  if (!matchStart) errs.startDate = 'Match start date is required.'

  if (regOpen && regClose) {
    if (new Date(regClose) <= new Date(regOpen)) {
      errs.registrationCloseDate = 'Registration Close date must be after Registration Open date.'
    }
  }

  if (regClose && matchStart) {
    if (new Date(matchStart) <= new Date(regClose)) {
      const closeDate = new Date(regClose)
      const startDate = new Date(matchStart)
      errs.startDate = closeDate.toDateString() === startDate.toDateString()
        ? 'Match Start time must occur after Registration Close time.'
        : 'Match Start time must be after Registration Close time.'
    }
  }

  return errs
}

function DateInput({ label, value, onChange, min, localError, isValid }) {
  const [touched, setTouched] = useState(false)
  const showError = localError && (touched || localError)
  const showValid = isValid && touched && !localError

  return (
    <div>
      <label className={`block text-sm font-medium mb-1.5 transition-colors ${
        showError ? 'text-error' : 'text-on-surface-variant'
      }`}>
        {showError && <span className="mr-1">✕</span>}
        {label}
      </label>
      <div className="relative">
        <input
          type="datetime-local"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          min={min || ''}
          className={`w-full px-4 py-3 rounded-xl bg-surface-container text-sm text-on-background transition-all duration-200 ${
            showError
              ? 'border-2 border-error pr-10'
              : showValid
                ? 'border-2 border-emerald-500/60 pr-10'
                : 'border border-slate-200 dark:border-outline-variant/30 focus:border-primary/40'
          } focus:outline-none`}
        />
        {showValid && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 text-sm font-bold">✓</span>
        )}
      </div>
      {showError && (
        <p className="text-xs text-error mt-1.5 flex items-start gap-1">
          <span>⚠</span>
          <span>{localError}</span>
        </p>
      )}
    </div>
  )
}

export default function Step6Timing({ data, onChange, onValidationChange }) {
  const [localErrors, setLocalErrors] = useState({})

  const runValidation = useCallback(() => {
    const errs = validateTiming(data.registrationOpenDate, data.registrationCloseDate, data.startDate)
    setLocalErrors(errs)
    if (onValidationChange) {
      onValidationChange(Object.keys(errs).length > 0)
    }
  }, [data.registrationOpenDate, data.registrationCloseDate, data.startDate, onValidationChange])

  useEffect(() => {
    runValidation()
  }, [runValidation])

  const handleChange = (field, value) => {
    onChange({ ...data, [field]: value })
  }

  const hasErrors = Object.keys(localErrors).length > 0
  const now = new Date().toISOString().slice(0, 16)
  const allFieldsFilled = data.registrationOpenDate && data.registrationCloseDate && data.startDate

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Registration & Match Timings</h2>
        <p className="text-sm text-on-surface-variant mt-1">Set key dates and times for your event.</p>
      </div>

      <div className="space-y-5">
        <DateInput
          label="Registration Opens"
          value={data.registrationOpenDate}
          onChange={(v) => handleChange('registrationOpenDate', v)}
          min={now}
          localError={localErrors.registrationOpenDate}
          isValid={!!data.registrationOpenDate}
        />
        <DateInput
          label="Registration Closes"
          value={data.registrationCloseDate}
          onChange={(v) => handleChange('registrationCloseDate', v)}
          min={data.registrationOpenDate || now}
          localError={localErrors.registrationCloseDate}
          isValid={!!data.registrationCloseDate}
        />
        <DateInput
          label="Match Start Time"
          value={data.startDate}
          onChange={(v) => handleChange('startDate', v)}
          min={data.registrationCloseDate || now}
          localError={localErrors.startDate}
          isValid={!!data.startDate}
        />
      </div>

      {hasErrors && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-error/10 border border-error/30 rounded-xl px-4 py-3"
        >
          <p className="text-sm text-error font-medium flex items-center gap-2">
            <span>✕</span>
            Fix schedule errors before continuing.
          </p>
        </motion.div>
      )}

      <div className="pt-1">
        <TimelinePreview
          registrationOpen={data.registrationOpenDate}
          registrationClose={data.registrationCloseDate}
          matchStart={data.startDate}
        />
      </div>
    </motion.div>
  )
}
