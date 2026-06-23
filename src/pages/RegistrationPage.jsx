import React, { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useUser } from '../UserContext'
import { getAuthToken } from '../utils/getAuthToken'

const SUB_COUNT = 2
const STEPS = ['Registration', 'Payment', 'Verification', 'Confirmed']

const INITIAL_STATE = {
  teamName: '',
  phone: '',
  captainIgn: '',
  captainUid: '',
  players: Array.from({ length: 3 }, () => ({ ign: '', uid: '' })),
  substitutes: Array.from({ length: SUB_COUNT }, () => ({ ign: '', uid: '' })),
  errors: {},
  touched: {},
  isSubmitting: false,
  isSuccess: false,
  serverError: '',
  currentStep: 1
}

function validateAll(state) {
  const errs = {}
  if (!state.teamName.trim()) errs.teamName = 'Team name is required'
  else if (state.teamName.trim().length > 16) errs.teamName = 'Max 16 characters'
  const digits = state.phone.replace(/\D/g, '')
  if (!state.phone.trim()) errs.phone = 'WhatsApp number is required'
  else if (digits.length !== 10) errs.phone = 'Must be exactly 10 digits'
  if (!state.captainIgn.trim()) errs.captainIgn = 'Captain IGN is required'
  if (!state.captainUid.trim()) errs.captainUid = 'Captain UID is required'
  else if (!/^\d+$/.test(state.captainUid.trim())) errs.captainUid = 'Numbers only'
  state.players.forEach((p, i) => {
    if (!p.ign.trim()) errs[`p${i + 2}_ign`] = `Player ${i + 2} IGN is required`
    if (!p.uid.trim()) errs[`p${i + 2}_uid`] = `Player ${i + 2} UID is required`
    else if (!/^\d+$/.test(p.uid.trim())) errs[`p${i + 2}_uid`] = 'Numbers only'
  })
  state.substitutes.forEach((s, i) => {
    const bothFilled = s.ign.trim() && s.uid.trim()
    const oneFilled = s.ign.trim() || s.uid.trim()
    if (oneFilled && !bothFilled) {
      if (!s.ign.trim()) errs[`sub${i + 1}_ign`] = 'IGN required when UID filled'
      if (!s.uid.trim()) errs[`sub${i + 1}_uid`] = 'UID required when IGN filled'
    }
    if (s.uid.trim() && !/^\d+$/.test(s.uid.trim())) errs[`sub${i + 1}_uid`] = 'Numbers only'
  })
  return errs
}

function RequiredAsterisk() {
  return <span className="text-red-500 ml-0.5">*</span>
}

function ProgressSteps({ currentStep }) {
  return (
    <div className="flex items-center justify-between max-w-xl mx-auto w-full mb-6 px-2">
      {STEPS.map((label, i) => {
        const stepNum = i + 1
        const isActive = currentStep >= stepNum
        const isCurrent = currentStep === stepNum
        return (
          <div key={label} className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-300 ${
                isActive ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-surface-variant/50 text-on-surface-variant/40'
              } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}>
                {isActive && currentStep > stepNum ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : stepNum}
              </div>
              <span className={`text-[9px] mt-1 font-medium whitespace-nowrap ${isActive ? 'text-primary' : 'text-on-surface-variant/30'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mt-[-20px] ${isActive ? 'bg-primary/40' : 'bg-outline-variant/20'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function scrollToFirstError(formEl) {
  const firstErr = formEl.querySelector('[data-error]')
  if (!firstErr) return
  firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' })
  // Find the closest input or textarea and focus it
  const fieldContainer = firstErr.closest('[data-field]')
  if (fieldContainer) {
    const input = fieldContainer.querySelector('input, textarea, select')
    input?.focus()
  }
}

export default function RegistrationPage() {
  const { id: tournamentId } = useParams()
  const navigate = useNavigate()
  const { currentUser } = useUser()

  const [state, setState] = useState(INITIAL_STATE)
  const [tournament, setTournament] = useState(null)
  const [tournamentLoading, setTournamentLoading] = useState(true)
  const formRef = useRef(null)
  const submitLockRef = useRef(false)

  // Auth check (defense-in-depth)
  useEffect(() => {
    if (!currentUser) {
      navigate(`/login?redirect=${encodeURIComponent('/tournaments/' + tournamentId + '/register')}`, { replace: true })
    }
  }, [currentUser, tournamentId, navigate])

  // Fetch tournament data + check existing registrations
  useEffect(() => {
    if (!tournamentId || !currentUser) return
    setTournamentLoading(true)
    let cancelled = false

    const load = async () => {
      try {
        const [tRes, regRes] = await Promise.all([
          fetch(`/api/tournaments/${tournamentId}`),
          fetch(`/api/tournaments/${tournamentId}/registrations`)
        ])
        const tData = await tRes.json()
        const regData = await regRes.json()

        if (cancelled) return

        // Check existing registration for this user
        if (regData.success && regData.registrations) {
          const myReg = regData.registrations.find(r => {
            if (r.user_id === currentUser.id) return true
            if (currentUser.email && r.email && r.email.toLowerCase() === currentUser.email.toLowerCase()) return true
            return false
          })
          if (myReg) {
            const active = ['pending', 'pending_payment', 'approved', 'confirmed', 'PENDING_PAYMENT_VERIFICATION']
            if (active.includes(myReg.status)) {
              setState(prev => ({ ...prev, serverError: 'You have already registered a team for this tournament.' }))
            }
          }
        }

        // Set tournament data
        if (tData?.success && tData.tournament) {
          const t = tData.tournament
          setTournament(t)
          if (!cancelled) {
            if (t.status === 'archived' || t.status === 'completed') {
              setState(prev => ({ ...prev, serverError: 'This tournament has ended.' }))
            } else if (t.registrationCloseDate && (
              /^\d{4}-\d{2}-\d{2}$/.test(t.registrationCloseDate)
                ? new Date(t.registrationCloseDate + 'T23:59:59.999Z') < new Date()
                : new Date(t.registrationCloseDate) < new Date()
            )) {
              setState(prev => ({ ...prev, serverError: 'Registration for this tournament has closed.' }))
            } else if (t.slotsFilled >= t.slotsTotal) {
              setState(prev => ({ ...prev, serverError: 'All slots for this tournament are filled.' }))
            }
          }
        } else setTournament(null)
      } catch {
        if (!cancelled) setTournament(null)
      } finally {
        if (!cancelled) setTournamentLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [tournamentId, currentUser])

  const [submitted, setSubmitted] = useState(false)
  const visibleErrors = submitted ? state.errors : {}

  const setField = useCallback((field, value) => {
    setState(prev => {
      const next = { ...prev, [field]: value, serverError: '' }
      if (next.errors[field]) next.errors = { ...next.errors, [field]: '' }
      return next
    })
  }, [])

  const setPlayer = useCallback((index, subField, value) => {
    setState(prev => {
      const players = prev.players.map((p, i) => i === index ? { ...p, [subField]: value } : p)
      const errKey = `p${index + 2}_${subField}`
      return { ...prev, players, errors: { ...prev.errors, [errKey]: '' }, serverError: '' }
    })
  }, [])

  const setSub = useCallback((index, subField, value) => {
    setState(prev => {
      const substitutes = prev.substitutes.map((s, i) => i === index ? { ...s, [subField]: value } : s)
      const errKey = `sub${index + 1}_${subField}`
      return { ...prev, substitutes, errors: { ...prev.errors, [errKey]: '' }, serverError: '' }
    })
  }, [])

  const blurField = useCallback((key) => {
    setState(prev => {
      const touched = { ...prev.touched, [key]: true }
      if (submitted) return { ...prev, touched, errors: validateAll(prev) }
      return { ...prev, touched }
    })
  }, [submitted])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    if (submitLockRef.current) return // Prevent double click
    setSubmitted(true)

    const errs = validateAll(state)
    const allTouch = { teamName: true, phone: true, captainIgn: true, captainUid: true }
    state.players.forEach((_, i) => { allTouch[`p${i + 2}_ign`] = true; allTouch[`p${i + 2}_uid`] = true })
    state.substitutes.forEach((_, i) => { allTouch[`sub${i + 1}_ign`] = true; allTouch[`sub${i + 1}_uid`] = true })

    if (Object.keys(errs).length > 0) {
      setState(prev => ({ ...prev, touched: { ...prev.touched, ...allTouch }, errors: errs }))
      // Use requestAnimationFrame to ensure DOM has updated with error elements before scrolling
      requestAnimationFrame(() => {
        scrollToFirstError(formRef.current)
      })
      return
    }

    submitLockRef.current = true
    setState(prev => ({ ...prev, isSubmitting: true, serverError: '' }))

    try {
      const token = await getAuthToken()
      if (!token) throw new Error('Not authenticated')

      const members = [
        ...state.players.filter(p => p.ign.trim()).map(p => ({ ign: p.ign.trim(), uid: p.uid.trim() })),
        ...state.substitutes.filter(s => s.ign.trim()).map(s => ({ ign: s.ign.trim(), uid: s.uid.trim() }))
      ]

      const payload = {
        team_name: state.teamName.trim(),
        email: currentUser?.email || '',
        phone: state.phone.replace(/\D/g, ''),
        captain: state.captainIgn.trim(),
        captain_uid: state.captainUid.trim(),
        members
      }

      const res = await fetch(`/api/sessions/create/${tournamentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (data.success) {
        setState(prev => ({ ...prev, isSubmitting: false, currentStep: 2 }))
        navigate(`/payment/${data.session.id}`, { replace: true })
      } else {
        submitLockRef.current = false
        setState(prev => ({
          ...prev,
          isSubmitting: false,
          serverError: data.message || data.error || 'Registration failed'
        }))
      }
    } catch (err) {
      submitLockRef.current = false
      setState(prev => ({
        ...prev,
        isSubmitting: false,
        serverError: err.message || 'Connection error. Please try again.'
      }))
    }
  }, [state, tournamentId, navigate, currentUser])

  // Guard
  if (!currentUser) return null

  const needsPayment = tournament?.entry && tournament.entry !== 'Free'

  // Blocking errors — user cannot proceed with the form
  const blockingErrors = ['You have already registered a team for this tournament.', 'This tournament has ended.', 'Registration for this tournament has closed.', 'All slots for this tournament are filled.']
  const isBlocked = state.serverError && blockingErrors.includes(state.serverError)

  const inputBase = `w-full px-3 py-[13px] rounded-xl border-2 text-[15px] outline-none transition-all duration-150 bg-surface text-on-background placeholder:text-on-surface-variant/40`
  const inputNormal = 'border-outline-variant/40 hover:border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10'
  const inputCompact = 'py-[10px] rounded-lg text-[14px]'
  const inputError = 'border-red-400/60 bg-red-50/50 dark:bg-red-500/5 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'

  return (
    <div className="min-h-screen bg-background">
      {/* Error Banner */}
      {state.serverError && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-[13px] font-medium bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
          {state.serverError}
        </div>
      )}

      <div className="max-w-[1000px] mx-auto px-4 py-6 pb-28 md:pb-24">
        {/* Blocking state — show message + Go Back, hide form */}
        {isBlocked ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-500/10 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-on-background mb-2">Cannot Proceed</h2>
            <p className="text-sm text-on-surface-variant mb-6 max-w-sm">{state.serverError}</p>
            <button type="button" onClick={() => navigate(`/tournaments/${tournamentId}`)}
              className="px-6 py-3 min-h-[48px] rounded-xl text-[14px] font-bold bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all">
              Go Back to Tournament
            </button>
          </div>
        ) : (
          <>
        {/* Progress Steps */}
        <ProgressSteps currentStep={1} />

        <form id="reg-form" ref={formRef} onSubmit={handleSubmit} className="space-y-5">
          {/* Team Information */}
          <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-outline-variant/20">
              <h2 className="text-sm font-semibold text-on-background">Team Information</h2>
            </div>
            <div className="space-y-4">
              <div data-field>
                <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">
                  Team Name<RequiredAsterisk />
                </label>
                <input type="text" value={state.teamName} onChange={(e) => setField('teamName', e.target.value)}
                  onBlur={() => blurField('teamName')} placeholder="Enter team name" maxLength={16}
                  className={`${inputBase} ${visibleErrors.teamName ? inputError : inputNormal}`} />
                {visibleErrors.teamName && <p data-error className="text-[12px] text-red-500 mt-1.5">{visibleErrors.teamName}</p>}
                <span className="text-[11px] text-on-surface-variant/40 mt-1 block">{state.teamName.length}/16</span>
              </div>
              <div data-field>
                <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">
                  WhatsApp<RequiredAsterisk />
                </label>
                <input type="tel" value={state.phone} onChange={(e) => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={() => blurField('phone')} placeholder="9876543210" maxLength={10} inputMode="numeric" autoComplete="tel"
                  className={`${inputBase} ${visibleErrors.phone ? inputError : inputNormal}`} />
                {visibleErrors.phone && <p data-error className="text-[12px] text-red-500 mt-1.5">{visibleErrors.phone}</p>}
              </div>
            </div>
          </div>

          {/* Captain */}
          <div className="rounded-xl bg-surface shadow-sm border border-amber-200/60 dark:border-amber-500/15 p-4 sm:p-5">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-amber-200/40 dark:border-amber-500/10">
              <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
              <h2 className="text-sm font-semibold text-amber-600 dark:text-amber-400">Captain</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div data-field>
                <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">
                  IGN<RequiredAsterisk />
                </label>
                <input type="text" value={state.captainIgn} onChange={(e) => setField('captainIgn', e.target.value)}
                  onBlur={() => blurField('captainIgn')} placeholder="Captain IGN"
                  className={`${inputBase} ${visibleErrors.captainIgn ? inputError : inputNormal}`} />
                {visibleErrors.captainIgn && <p data-error className="text-[12px] text-red-500 mt-1.5">{visibleErrors.captainIgn}</p>}
              </div>
              <div data-field>
                <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">
                  UID<RequiredAsterisk />
                </label>
                <input type="text" value={state.captainUid} onChange={(e) => setField('captainUid', e.target.value.replace(/\D/g, ''))}
                  onBlur={() => blurField('captainUid')} placeholder="Captain UID" inputMode="numeric"
                  className={`${inputBase} ${visibleErrors.captainUid ? inputError : inputNormal}`} />
                {visibleErrors.captainUid && <p data-error className="text-[12px] text-red-500 mt-1.5">{visibleErrors.captainUid}</p>}
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/20">
              <h2 className="text-sm font-semibold text-on-background">Players <span className="text-red-500 font-normal">*</span></h2>
              <span className="text-[11px] font-medium text-on-surface-variant/60 bg-surface-variant/40 px-2 py-0.5 rounded-md">Required</span>
            </div>
            <div className="space-y-2.5">
              {state.players.map((p, i) => (
                <div key={i} data-field className="flex items-center gap-3 bg-surface-variant/20 rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 border border-outline-variant/20">
                  <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold flex-shrink-0">{i + 2}</span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input type="text" value={p.ign} onChange={(e) => setPlayer(i, 'ign', e.target.value)}
                      onBlur={() => blurField(`p${i + 2}_ign`)} placeholder="IGN"
                      className={`${inputBase} ${inputCompact} ${visibleErrors[`p${i + 2}_ign`] ? inputError : inputNormal}`} />
                    <input type="text" value={p.uid} onChange={(e) => setPlayer(i, 'uid', e.target.value.replace(/\D/g, ''))}
                      onBlur={() => blurField(`p${i + 2}_uid`)} placeholder="UID" inputMode="numeric"
                      className={`${inputBase} ${inputCompact} ${visibleErrors[`p${i + 2}_uid`] ? inputError : inputNormal}`} />
                  </div>
                  {(visibleErrors[`p${i + 2}_ign`] || visibleErrors[`p${i + 2}_uid`]) && (
                    <span className="text-[11px] text-red-500 flex-shrink-0 w-[72px] text-right leading-tight">
                      {visibleErrors[`p${i + 2}_ign`] || visibleErrors[`p${i + 2}_uid`]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Substitutes */}
          <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5">
            <div className="pb-3 mb-4 border-b border-outline-variant/20">
              <h2 className="text-sm font-semibold text-on-background">Substitutes <span className="font-normal text-on-surface-variant/50">(optional)</span></h2>
            </div>
            <div className="space-y-2.5">
              {state.substitutes.map((s, i) => (
                <div key={i} className="flex items-center gap-3 bg-amber-50/40 dark:bg-amber-500/[0.03] rounded-xl px-3 py-2.5 sm:px-4 sm:py-3 border border-amber-200/40 dark:border-amber-500/10">
                  <span className="w-6 h-6 rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">S{i + 1}</span>
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input type="text" value={s.ign} onChange={(e) => setSub(i, 'ign', e.target.value)}
                      onBlur={() => blurField(`sub${i + 1}_ign`)} placeholder="IGN (optional)"
                      className={`${inputBase} ${inputCompact} ${visibleErrors[`sub${i + 1}_ign`] ? inputError : inputNormal}`} />
                    <input type="text" value={s.uid} onChange={(e) => setSub(i, 'uid', e.target.value.replace(/\D/g, ''))}
                      onBlur={() => blurField(`sub${i + 1}_uid`)} placeholder="UID (optional)" inputMode="numeric"
                      className={`${inputBase} ${inputCompact} ${visibleErrors[`sub${i + 1}_uid`] ? inputError : inputNormal}`} />
                  </div>
                  {(visibleErrors[`sub${i + 1}_ign`] || visibleErrors[`sub${i + 1}_uid`]) && (
                    <span className="text-[11px] text-red-500 flex-shrink-0 w-[72px] text-right leading-tight">
                      {visibleErrors[`sub${i + 1}_ign`] || visibleErrors[`sub${i + 1}_uid`]}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Review */}
          <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-outline-variant/20">
              <h2 className="text-sm font-semibold text-on-background">Review</h2>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between py-2 px-3 rounded-lg bg-surface-variant/30">
                <span className="text-[13px] text-on-surface-variant">Team</span>
                <span className="text-[14px] font-semibold text-on-background">{state.teamName.trim() || '—'}</span>
              </div>
              <div className="flex justify-between py-2 px-3 rounded-lg bg-surface-variant/30">
                <span className="text-[13px] text-on-surface-variant">Captain</span>
                <span className="text-[14px] font-semibold text-amber-600 dark:text-amber-400">{state.captainIgn.trim() || '—'}</span>
              </div>
              <div className="flex justify-between py-2 px-3 rounded-lg bg-surface-variant/30">
                <span className="text-[13px] text-on-surface-variant">Players</span>
                <span className="text-[14px] text-on-background">{1 + state.players.filter(p => p.ign.trim()).length}</span>
              </div>
              {state.substitutes.some(s => s.ign.trim()) && (
                <div className="flex justify-between py-2 px-3 rounded-lg bg-surface-variant/30">
                  <span className="text-[13px] text-on-surface-variant">Substitutes</span>
                  <span className="text-[14px] text-on-background">{state.substitutes.filter(s => s.ign.trim()).length}</span>
                </div>
              )}
              {needsPayment && (
                <div className="flex justify-between py-2 px-3 rounded-lg bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/10">
                  <span className="text-[13px] font-semibold text-amber-600 dark:text-amber-400">Entry Fee</span>
                  <span className="text-[14px] font-bold text-amber-600 dark:text-amber-400">{tournament.entry}</span>
                </div>
              )}
              {Object.keys(visibleErrors).length > 0 && (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/10">
                  <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  <span className="text-[12px] text-red-600 dark:text-red-400">Fix errors above before submitting.</span>
                </div>
              )}
            </div>
          </div>

          {/* Desktop submit */}
          <div className="hidden md:flex flex-col gap-3 pt-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => navigate(-1)} disabled={state.isSubmitting}
                className="px-6 py-3 min-h-[48px] rounded-xl text-[14px] font-semibold disabled:opacity-30 bg-surface-variant/60 hover:bg-surface-variant text-on-background border border-outline-variant/30 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={state.isSubmitting}
                className="flex-1 py-3 min-h-[48px] rounded-xl text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 hover:shadow-primary/30 transition-all active:scale-[0.98]">
                 {state.isSubmitting ? (
                   <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                 ) : (
                   <>{needsPayment ? 'Continue to Payment' : 'Continue to Registration'}</>
                 )}
               </button>
              </div>
            </div>
          </form>
          </>
        )}
        </div>

        {/* Loading overlay */}
       {state.isSubmitting && <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" />}

        {/* Mobile sticky bar (hidden when blocked) */}
        {!isBlocked && <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-surface border-t border-outline-variant/30 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
         <div className="flex items-center gap-3 max-w-[1000px] mx-auto">
           <button type="button" onClick={() => navigate(-1)} disabled={state.isSubmitting}
             className="px-5 py-3 min-h-[48px] rounded-xl text-[14px] font-semibold disabled:opacity-30 bg-surface-variant/60 hover:bg-surface-variant text-on-background border border-outline-variant/30 flex-shrink-0 transition-colors">
             Cancel
           </button>
           <button type="submit" form="reg-form" disabled={state.isSubmitting}
             className="flex-1 py-3 min-h-[48px] rounded-xl text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-[0.98]">
             {state.isSubmitting ? (
               <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
             ) : (
               <>{needsPayment ? 'Continue to Payment' : 'Continue to Registration'}</>
             )}
           </button>
          </div>
        </div>}
     </div>
  )
}
