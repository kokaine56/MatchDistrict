/* eslint-disable react-refresh/only-export-components */
import { useCallback } from 'react'
import { motion } from 'framer-motion'

// Kept for backward compatibility: Schedule captures only the registration
// window. Round/roadmap authoring is done in Tournament Management, not here.
export const validateStep6 = (data) => {
  if (!data) return { regOpen: 'Form data is not available' }
  const errors = {}
  const { registrationOpenDate, registrationCloseDate } = data

  if (!registrationOpenDate) errors.regOpen = 'Registration open date is required'
  if (!registrationCloseDate) errors.regClose = 'Registration close date is required'
  if (registrationOpenDate && registrationCloseDate) {
    if (new Date(registrationCloseDate).getTime() <= new Date(registrationOpenDate).getTime()) {
      errors.regClose = 'Registration close must be after registration open'
    }
  }

  return errors
}

function getNowLocalISOString() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const year = d.getFullYear()
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const mins = pad(d.getMinutes())
  return `${year}-${month}-${day}T${hours}:${mins}`
}

function isStartNowActive(val) {
  if (!val) return false
  const dateVal = new Date(val).getTime()
  if (isNaN(dateVal)) return false
  const diffMinutes = Math.abs(Date.now() - dateVal) / (1000 * 60)
  return diffMinutes <= 3
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
            <div className="relative space-y-2">
              <input
                type="datetime-local"
                value={registrationOpenDate}
                onChange={(e) => handleRegChange('registrationOpenDate', e.target.value)}
                className={`w-full p-3 rounded-xl bg-surface/80 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner ${
                  showAllErrors && errors?.regOpen ? 'ring-2 ring-error/50' : ''
                }`}
              />
              <div className="flex items-center justify-between pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const nowISO = getNowLocalISOString()
                    handleRegChange('registrationOpenDate', nowISO)
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                    isStartNowActive(registrationOpenDate)
                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                      : 'bg-surface-container/60 hover:bg-surface-container text-on-surface-variant border-white/10 hover:text-white'
                  }`}
                >
                  <span className="text-amber-400 font-bold">⚡</span>
                  <span>Start right now</span>
                </button>
                {isStartNowActive(registrationOpenDate) && (
                  <span className="text-[11px] font-medium text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Now selected
                  </span>
                )}
              </div>
              <p className="text-[11px] text-on-surface-variant/60">
                Open registration immediately after publishing.
              </p>
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