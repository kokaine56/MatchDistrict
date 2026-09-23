/* eslint-disable react-refresh/only-export-components */
import { useCallback } from 'react'
import { motion } from 'framer-motion'

function getRoundTs(r) {
  if (!r.date) return null
  const s = r.time ? `${r.date}T${r.time}` : `${r.date}T23:59`
  return new Date(s).getTime()
}

// Kept for backward compatibility: previously this step combined the
// registration window and round progression. Schedule is now its own step and
// round authoring lives in Step7Roadmap, but any existing caller of
// validateStep6 still receives the same keys.
export const validateStep6 = (data) => {
  if (!data) return { regOpen: 'Form data is not available' }
  const errors = {}
  const { registrationOpenDate, registrationCloseDate, roadmap } = data
  const roundsPublishing = data.rounds_published !== false

  if (!registrationOpenDate) errors.regOpen = 'Registration open date is required'
  if (!registrationCloseDate) errors.regClose = 'Registration close date is required'
  if (registrationOpenDate && registrationCloseDate) {
    if (new Date(registrationCloseDate).getTime() <= new Date(registrationOpenDate).getTime()) {
      errors.regClose = 'Registration close must be after registration open'
    }
  }

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

export default function Step6Schedule({ data, onChange, errors, showAllErrors }) {
  const registrationOpenDate = data?.registrationOpenDate || ''
  const registrationCloseDate = data?.registrationCloseDate || ''

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

    onChange(next)
  }, [data, onChange])

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
    </motion.div>
  )
}