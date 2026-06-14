import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuthToken } from '../utils/getAuthToken'
import { uploadToImgbb } from '../utils/imgbbUpload'

const PAYMENT_APPS = ['Google Pay', 'PhonePe', 'Paytm', 'Amazon Pay', 'BHIM UPI', 'Other']

export default function RegistrationWizard({ tournamentId, entryFee, tournamentTitle, onComplete, onClose, existingRegistration }) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)

  // Step 1 — Squad Form
  const [teamName, setTeamName] = useState('')
  const [leaderIgn, setLeaderIgn] = useState('')
  const [leaderUid, setLeaderUid] = useState('')
  const [players, setPlayers] = useState([
    { ign: '', uid: '' },
    { ign: '', uid: '' },
    { ign: '', uid: '' }
  ])
  const [substitutes, setSubstitutes] = useState([])
  const [saveRoster, setSaveRoster] = useState(false)
  const [savedRosters, setSavedRosters] = useState([])
  const [loadingRosters, setLoadingRosters] = useState(false)

  // Step 2 — Payment
  const [paymentApp, setPaymentApp] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [screenshotFile, setScreenshotFile] = useState(null)
  const [screenshotUploading, setScreenshotUploading] = useState(false)

  // Step 3 — Rejection window
  const [rejectionReason, setRejectionReason] = useState('')
  const [rejectedAt, setRejectedAt] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  // Load saved rosters
  useEffect(() => {
    const fetchRosters = async () => {
      setLoadingRosters(true)
      try {
        const token = await getAuthToken()
        const res = await fetch('/api/team-presets', {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) setSavedRosters(data.presets || [])
      } catch {
        // silently fail
      } finally {
        setLoadingRosters(false)
      }
    }
    fetchRosters()
  }, [])

  // Handle existing rejected registration
  useEffect(() => {
    if (existingRegistration && existingRegistration.status === 'REJECTED') {
      setRejectionReason(existingRegistration.rejection_reason || 'No reason provided.')
      setRejectedAt(new Date(existingRegistration.rejected_at).getTime())
      setTeamName(existingRegistration.team_name || '')
      setLeaderIgn(existingRegistration.captain || '')
      setStep(3)
    }
  }, [existingRegistration])

  // 30-minute countdown for rejected registrations
  useEffect(() => {
    if (!rejectedAt) return
    const interval = setInterval(() => {
      const elapsed = Date.now() - rejectedAt
      const remaining = Math.max(0, 30 * 60 * 1000 - elapsed)
      setTimeRemaining(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        triggerToast('30-minute window expired. Please restart registration.')
        onClose && onClose()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [rejectedAt, onClose])

  const loadRoster = (roster) => {
    setTeamName(roster.team_name || '')
    setLeaderIgn(roster.captain || '')
    const members = Array.isArray(roster.members) ? roster.members : []
    const filled = players.map((p, i) => ({
      ign: members[i] || '',
      uid: ''
    }))
    setPlayers(filled)
    if (members.length > 3) {
      setSubstitutes(members.slice(3).map(m => ({ ign: m, uid: '' })))
    }
    triggerToast(`Loaded roster: ${roster.team_name}`)
  }

  const updatePlayer = (index, field, value) => {
    setPlayers((prev) => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)))
  }

  const addSubstitute = () => {
    if (substitutes.length >= 5) {
      triggerToast('Maximum 5 substitutes allowed.')
      return
    }
    setSubstitutes((prev) => [...prev, { ign: '', uid: '' }])
  }

  const updateSubstitute = (index, field, value) => {
    setSubstitutes((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  const removeSubstitute = (index) => {
    setSubstitutes((prev) => prev.filter((_, i) => i !== index))
  }

  const validateStep1 = () => {
    if (!teamName.trim()) { triggerToast('Please enter a team name.'); return false }
    if (!leaderIgn.trim()) { triggerToast('Please enter the leader IGN.'); return false }
    const emptyMember = players.some((p) => !p.ign.trim())
    if (emptyMember) { triggerToast('Please fill in all 3 member IGNs.'); return false }
    return true
  }

  const validateStep2 = () => {
    if (!paymentApp) { triggerToast('Please select a payment app.'); return false }
    if (!transactionId.trim()) { triggerToast('Please enter the transaction/UTR number.'); return false }
    if (!screenshotFile) { triggerToast('Please upload a payment screenshot.'); return false }
    return true
  }

  const handleNext = () => {
    if (step === 1 && validateStep1()) setStep(2)
    else if (step === 2 && validateStep2()) handleSubmit()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // Upload screenshot
      setScreenshotUploading(true)
      let screenshotUrl = null
      try {
        screenshotUrl = await uploadToImgbb(screenshotFile)
      } catch {
        triggerToast('Failed to upload screenshot. Please try again.')
        setScreenshotUploading(false)
        setSubmitting(false)
        return
      }
      setScreenshotUploading(false)

      const token = await getAuthToken()
      const allMembers = [...players.map(p => p.ign.trim()), ...substitutes.map(s => s.ign.trim())].filter(Boolean)

      const payload = {
        team_name: teamName.trim(),
        captain: leaderIgn.trim(),
        members: allMembers,
        transaction_id: transactionId.trim(),
        payment_app: paymentApp,
        screenshot_url: screenshotUrl,
        slot_number: null
      }

      const res = await fetch(`/api/tournaments/${tournamentId}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (data.success) {
        // Save roster if requested
        if (saveRoster) {
          try {
            await fetch('/api/team-presets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ team_name: teamName.trim(), captain: leaderIgn.trim(), members: allMembers })
            })
          } catch { /* non-critical */ }
        }
        triggerToast('Registration submitted! Awaiting verification.')
        setTimeout(() => { onComplete && onComplete(data.registration) }, 1500)
      } else {
        triggerToast(data.message || data.error || 'Registration failed.')
      }
    } catch (err) {
      triggerToast('Error submitting registration.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStep2 = () => {
    if (validateStep1()) setStep(2)
  }

  const formatTime = (ms) => {
    const mins = Math.floor(ms / 60000)
    const secs = Math.floor((ms % 60000) / 1000)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <>
      {showToast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl bg-surface border border-outline-variant/40 shadow-lg backdrop-blur-md text-xs font-medium text-on-background animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-outline-variant/20">
            <div>
              <h2 className="font-headline-lg text-base sm:text-lg font-black text-on-background">Squad Registration</h2>
              <p className="text-[11px] text-on-surface-variant">{tournamentTitle || 'Tournament'}</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-variant/30 hover:bg-surface-variant text-on-surface-variant transition-colors">
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center gap-2 px-4 sm:px-6 pt-4 pb-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  s === step ? 'bg-primary text-white shadow-sm' : s < step ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-variant/30 text-on-surface-variant'
                }`}>
                  {s < step ? <span className="material-symbols-outlined text-sm">check</span> : s}
                </div>
                <span className={`text-[10px] font-medium ${s === step ? 'text-on-background' : 'text-on-surface-variant'}`}>
                  {s === 1 ? 'Squad' : s === 2 ? 'Payment' : 'Verify'}
                </span>
                {s < 3 && <div className="w-6 h-px bg-outline-variant/30" />}
              </div>
            ))}
          </div>

          <div className="p-4 sm:p-6 space-y-5">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  {/* Load Saved Roster */}
                  <div>
                    <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">Load Saved Roster</label>
                    <select
                      onChange={(e) => { const r = savedRosters.find(s => s.team_name === e.target.value); if (r) loadRoster(r); }}
                      className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      defaultValue=""
                    >
                      <option value="" disabled>{loadingRosters ? 'Loading...' : '— Select a saved roster —'}</option>
                      {savedRosters.map((r) => (
                        <option key={r.id} value={r.team_name}>{r.team_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Team Name */}
                  <div>
                    <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">Team Name *</label>
                    <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Enter team name" className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>

                  {/* Leader */}
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-3.5 space-y-3">
                    <h4 className="font-headline-md text-[10px] font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">star</span> Squad Leader
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input type="text" value={leaderIgn} onChange={(e) => setLeaderIgn(e.target.value)} placeholder="Leader IGN *" className="px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                      <input type="text" value={leaderUid} onChange={(e) => setLeaderUid(e.target.value)} placeholder="Leader UID" className="px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                    </div>
                  </div>

                  {/* Members */}
                  <div className="space-y-2.5">
                    <h4 className="font-headline-md text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Squad Members</h4>
                    {players.map((p, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-surface-variant/30 flex items-center justify-center text-[9px] font-bold text-on-surface-variant shrink-0">{i + 1}</span>
                        <input type="text" value={p.ign} onChange={(e) => updatePlayer(i, 'ign', e.target.value)} placeholder={`Player ${i + 1} IGN *`} className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                        <input type="text" value={p.uid} onChange={(e) => updatePlayer(i, 'uid', e.target.value)} placeholder="UID" className="w-28 px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                      </div>
                    ))}
                  </div>

                  {/* Substitutes */}
                  {substitutes.map((s, i) => (
                    <div key={`sub-${i}`} className="flex items-center gap-2 pl-8">
                      <span className="text-[9px] font-bold text-amber-500 shrink-0">SUB {i + 1}</span>
                      <input type="text" value={s.ign} onChange={(e) => updateSubstitute(i, 'ign', e.target.value)} placeholder="Substitute IGN" className="flex-1 px-3 py-2 rounded-lg border border-amber-500/20 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-500/40" />
                      <input type="text" value={s.uid} onChange={(e) => updateSubstitute(i, 'uid', e.target.value)} placeholder="UID" className="w-28 px-3 py-2 rounded-lg border border-amber-500/20 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-500/40" />
                      <button onClick={() => removeSubstitute(i)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>
                  ))}

                  <button onClick={addSubstitute} disabled={substitutes.length >= 5} className="flex items-center gap-1.5 text-xs font-medium text-amber-500 hover:text-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <span className="material-symbols-outlined text-sm">add_circle</span> Add Substitute (Optional) {substitutes.length}/5
                  </button>

                  {/* Save Roster Checkbox */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={saveRoster} onChange={(e) => setSaveRoster(e.target.checked)} className="w-4 h-4 rounded border-outline-variant/30 bg-surface/60 text-primary focus:ring-primary/50" />
                    <span className="text-xs text-on-surface-variant">Save this roster for future use</span>
                  </label>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center space-y-1">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Entry Fee</p>
                    <p className="text-2xl font-black text-amber-400 font-prize-display">{entryFee || '₹0'}</p>
                  </div>

                  <div className="bg-surface/60 border border-outline-variant/20 rounded-xl p-4 text-center">
                    <p className="text-[10px] text-on-surface-variant mb-1">UPI ID</p>
                    <p className="text-sm font-mono font-bold text-on-background">matchdistrict@upi</p>
                  </div>

                  <div>
                    <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">Payment App *</label>
                    <select value={paymentApp} onChange={(e) => setPaymentApp(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50">
                      <option value="">— Select Payment App —</option>
                      {PAYMENT_APPS.map((app) => (
                        <option key={app} value={app}>{app}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">Transaction / UTR Number *</label>
                    <input type="text" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Enter UTR number" className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                  </div>

                  <div>
                    <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">Payment Screenshot *</label>
                    <div className="border-2 border-dashed border-outline-variant/30 rounded-xl p-4 text-center hover:border-primary/30 transition-colors cursor-pointer" onClick={() => document.getElementById('screenshot-upload').click()}>
                      {screenshotFile ? (
                        <div className="space-y-1">
                          <span className="material-symbols-outlined text-2xl text-emerald-400">check_circle</span>
                          <p className="text-xs text-on-surface-variant">{screenshotFile.name}</p>
                          <button onClick={(e) => { e.stopPropagation(); setScreenshotFile(null); }} className="text-[10px] text-red-500 hover:text-red-400">Remove</button>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <span className="material-symbols-outlined text-2xl text-on-surface-variant">cloud_upload</span>
                          <p className="text-xs text-on-surface-variant">Click to upload payment screenshot</p>
                          <p className="text-[10px] text-on-surface-variant/50">JPG, PNG, WEBP • Max 10MB</p>
                        </div>
                      )}
                      <input id="screenshot-upload" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { if (f.size > 10 * 1024 * 1024) { triggerToast('File too large. Max 10MB.'); return } setScreenshotFile(f) } }} />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-red-500 text-lg">warning</span>
                      <h4 className="font-headline-md text-xs font-bold text-red-500 uppercase">Registration Rejected</h4>
                    </div>
                    <p className="text-xs text-on-surface-variant">{rejectionReason}</p>
                    {rejectedAt && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-on-surface-variant">Time remaining to re-upload:</span>
                        <span className={`font-mono text-sm font-bold ${timeRemaining < 60000 ? 'text-red-500 animate-pulse' : 'text-amber-400'}`}>
                          {formatTime(timeRemaining)}
                        </span>
                      </div>
                    )}
                  </div>

                  {timeRemaining > 0 && (
                    <div className="space-y-3 border-t border-outline-variant/20 pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Upload New Payment Proof</p>
                      <div>
                        <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">Payment App</label>
                        <select value={paymentApp} onChange={(e) => setPaymentApp(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/50">
                          <option value="">— Select Payment App —</option>
                          {PAYMENT_APPS.map((app) => (
                            <option key={app} value={app}>{app}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">New Transaction / UTR Number</label>
                        <input type="text" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Enter new UTR number" className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface/60 text-on-background text-xs placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/50" />
                      </div>
                      <div>
                        <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant mb-1.5 block">New Screenshot</label>
                        <div className="border-2 border-dashed border-outline-variant/30 rounded-xl p-4 text-center hover:border-primary/30 transition-colors cursor-pointer" onClick={() => document.getElementById('rejection-upload').click()}>
                          {screenshotFile ? (
                            <div className="space-y-1">
                              <span className="material-symbols-outlined text-2xl text-emerald-400">check_circle</span>
                              <p className="text-xs text-on-surface-variant">{screenshotFile.name}</p>
                              <button onClick={(e) => { e.stopPropagation(); setScreenshotFile(null); }} className="text-[10px] text-red-500 hover:text-red-400">Remove</button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <span className="material-symbols-outlined text-2xl text-on-surface-variant">cloud_upload</span>
                              <p className="text-xs text-on-surface-variant">Click to upload new screenshot</p>
                            </div>
                          )}
                          <input id="rejection-upload" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { if (f.size > 10 * 1024 * 1024) { triggerToast('File too large. Max 10MB.'); return } setScreenshotFile(f) } }} />
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-t border-outline-variant/20">
            <div>
              {step > 1 && step !== 3 && (
                <button onClick={() => setStep(step - 1)} className="px-4 py-2 min-h-[44px] bg-surface-variant/30 hover:bg-surface-variant text-on-background rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">arrow_back</span> Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < 3 ? (
                <button
                  onClick={handleNext}
                  disabled={submitting || screenshotUploading}
                  className="px-6 py-2.5 min-h-[44px] bg-primary text-white rounded-xl text-xs font-bold shadow-lg hover:bg-primary/95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                >
                  {step === 2 && (submitting || screenshotUploading) ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {screenshotUploading ? 'Uploading...' : 'Submitting...'}</>
                  ) : (
                    <>{step === 1 ? 'Continue to Payment' : 'Submit Registration'} <span className="material-symbols-outlined text-sm">arrow_forward</span></>
                  )}
                </button>
              ) : timeRemaining > 0 ? (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || screenshotUploading || !transactionId.trim() || !screenshotFile}
                  className="px-6 py-2.5 min-h-[44px] bg-amber-500 text-white rounded-xl text-xs font-bold shadow-lg hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                >
                  {submitting ? 'Re-submitting...' : 'Re-submit Proof'}
                </button>
              ) : null}
            </div>
          </div>
        </motion.div>
      </div>
    </>
  )
}
