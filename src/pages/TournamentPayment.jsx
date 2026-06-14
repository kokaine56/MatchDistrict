import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAuthToken } from '../utils/getAuthToken'

const PAYMENT_STEPS = ['Registration', 'Payment', 'Verification', 'Confirmed']

function ProgressSteps({ currentStep }) {
  return (
    <div className="flex items-center justify-between max-w-xl mx-auto w-full mb-6 px-2">
      {PAYMENT_STEPS.map((label, i) => {
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
            {i < PAYMENT_STEPS.length - 1 && (
              <div className={`flex-1 h-px mx-2 mt-[-20px] ${isActive ? 'bg-primary/40' : 'bg-outline-variant/20'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function TournamentPayment() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const submitLockRef = useRef(false)

  const [session, setSession] = useState(null)
  const [tournament, setTournament] = useState(null)
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('payment')

  const [screenshot, setScreenshot] = useState(null)
  const [transactionId, setTransactionId] = useState('')
  const [paymentApp, setPaymentApp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)

  // Load session data
  useEffect(() => {
    if (!sessionId) return
    setLoading(true)
    ;(async () => {
      try {
        const token = await getAuthToken()
        const res = await fetch(`/api/sessions/${sessionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) {
          setSession(data.session)
          setTournament(data.tournament)
          if (data.completed) {
            setStep('success')
          }
        } else {
          setServerError(data.message || 'Session expired or not found.')
          setTimeout(() => navigate('/tournaments', { replace: true }), 2000)
        }
      } catch {
        setServerError('Connection error loading session.')
      } finally {
        setLoading(false)
      }
    })()
  }, [sessionId, navigate])

  const getEntryFeeDisplay = useCallback(() => {
    if (!tournament) return '—'
    if (tournament.entry && tournament.entry !== 'Free') return tournament.entry
    if (tournament.entry_fee_amount && tournament.entry_fee_amount > 0) return `₹${tournament.entry_fee_amount}`
    return 'Free'
  }, [tournament])

  const getEntryFeeAmount = useCallback(() => {
    if (!tournament) return 0
    return parseInt(tournament.entry_fee_amount) || 0
  }, [tournament])

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setServerError('Only JPEG, PNG, and WebP images are accepted.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setServerError('Screenshot must be under 10MB.')
      return
    }
    setServerError('')
    setScreenshot(file)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (submitLockRef.current) return
    setServerError('')

    if (needsPayment && !screenshot) {
      setServerError('Please upload a payment screenshot.')
      return
    }
    if (needsPayment && !transactionId.trim()) {
      setServerError('Please enter the transaction/UTR number.')
      return
    }

    submitLockRef.current = true
    setSubmitting(true)
    setUploadProgress(10)

    try {
      const token = await getAuthToken()
      if (!token) {
        setServerError('Session expired. Please sign in again.')
        setSubmitting(false)
        submitLockRef.current = false
        return
      }

      let screenshotUrl = null

      if (needsPayment) {
        setUploadProgress(30)
        const reader = new FileReader()
        const base64 = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result)
          reader.onerror = reject
          reader.readAsDataURL(screenshot)
        })
        setUploadProgress(50)

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ image: base64 })
        })
        const uploadData = await uploadRes.json()
        setUploadProgress(70)

        if (!uploadData.success) {
          setServerError('Failed to upload screenshot. Please try again.')
          setSubmitting(false)
          submitLockRef.current = false
          return
        }
        screenshotUrl = uploadData.url
      }

      const idempotencyKey = 'IK-' + Date.now().toString(36) + '-' + crypto.randomUUID().slice(0, 8)
      setUploadProgress(85)

      const payload = { idempotency_key: idempotencyKey }
      if (needsPayment) {
        payload.screenshot_url = screenshotUrl
        payload.utr_number = transactionId.trim()
        payload.payment_app = paymentApp.trim() || 'Unknown'
      }

      const res = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (data.success) {
        setUploadProgress(100)
        setStep('success')
      } else {
        setServerError(data.message || data.error || 'Failed to submit registration.')
        setSubmitting(false)
        submitLockRef.current = false
      }
    } catch (err) {
      setServerError(err.message || 'Connection error. Please try again.')
      setSubmitting(false)
      submitLockRef.current = false
    }
  }

  const fee = getEntryFeeDisplay()
  const feeAmount = getEntryFeeAmount()
  const needsPayment = feeAmount > 0

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-xs text-on-surface-variant">Loading payment details...</p>
        </div>
      </div>
    )
  }

  if (!tournament || !session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-base font-bold text-on-background mb-1">Session Expired</h1>
          <p className="text-xs text-on-surface-variant mb-5">Your registration session has expired. Please register again.</p>
          <button onClick={() => navigate('/tournaments')} className="px-5 py-2.5 min-h-[44px] rounded-xl bg-primary text-white text-xs font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all">
            Browse Tournaments
          </button>
        </div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md text-center">
          <ProgressSteps currentStep={3} />
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-on-background mb-1">Registration Submitted Successfully</h1>
          <p className="text-[13px] text-on-surface-variant mb-6">
            Your team <span className="font-semibold text-on-background">{session?.form_data?.team_name || ''}</span> has been {needsPayment ? 'registered and your payment proof has been submitted' : 'registered'}.
          </p>
          {needsPayment ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 mb-6 text-left space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <p className="text-sm font-semibold text-amber-400">Status: Pending Payment Verification</p>
              </div>
              <p className="text-[11px] text-on-surface-variant">Our team will review your payment shortly. You'll receive a notification once verified.</p>
            </div>
          ) : (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 mb-6 text-left space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <p className="text-sm font-semibold text-emerald-400">Status: Pending Organizer Approval</p>
              </div>
              <p className="text-[11px] text-on-surface-variant">Your registration has been received. The organizer will review and confirm your slot shortly.</p>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <button onClick={() => navigate(`/tournaments/${session.tournament_id}`, { replace: true })}
              className="w-full py-3 min-h-[44px] bg-primary text-white rounded-xl text-xs font-bold shadow-lg shadow-primary/20 hover:bg-primary/95 transition-all">
              View Tournament Details
            </button>
            <button onClick={() => navigate('/')}
              className="w-full py-3 min-h-[44px] text-xs font-medium text-on-surface-variant hover:text-on-background transition-colors">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {serverError && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-[13px] font-medium bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400">
          {serverError}
        </div>
      )}

      <div className="max-w-[1000px] mx-auto px-4 py-6 pb-28 md:pb-24">
        {/* Progress Steps */}
        <ProgressSteps currentStep={2} />

        {/* Tournament Summary */}
        <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 mb-5">
          <div className="flex items-center gap-4">
            {tournament.cover_image_url && (
              <img src={tournament.cover_image_url} alt="" className="w-14 h-11 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                  {tournament.game || 'Game'}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-on-background truncate leading-tight">{tournament.title}</h1>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-[13px] font-semibold text-amber-500 dark:text-amber-400">{tournament.prize || '—'}</span>
                <span className="text-[13px] font-semibold text-emerald-600 dark:text-emerald-400">{fee}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Warning Banner */}
        <div className={`rounded-xl p-3.5 mb-5 flex items-start gap-3 ${needsPayment ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
          <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${needsPayment ? 'text-amber-500' : 'text-emerald-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {needsPayment ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            )}
          </svg>
          <div>
            <p className={`text-sm font-semibold ${needsPayment ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {needsPayment ? 'Registration is not confirmed until payment is verified' : 'Free Tournament Registration'}
            </p>
            <p className={`text-[12px] mt-0.5 ${needsPayment ? 'text-amber-600/70 dark:text-amber-400/70' : 'text-emerald-600/70 dark:text-emerald-400/70'}`}>
              {needsPayment ? 'Complete the payment and upload proof below to confirm your slot.' : 'Click "Complete Registration" below to submit your registration.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
          {/* Payment Form */}
          <div className="md:col-span-3 space-y-4">
            <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-on-background pb-3 mb-4 border-b border-outline-variant/20">
                Payment Instructions
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">1</span>
                  <p className="text-[13px] text-on-surface-variant">Send <span className="font-bold text-on-background">{fee}</span> to UPI ID: <span className="font-mono font-bold text-primary">matchdistrict@upi</span></p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">2</span>
                  <p className="text-[13px] text-on-surface-variant">Take a screenshot of the successful payment.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">3</span>
                  <p className="text-[13px] text-on-surface-variant">Upload the screenshot and transaction/UTR number below.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-bold flex-shrink-0">4</span>
                  <p className="text-[13px] text-on-surface-variant">The organizer will verify and confirm your slot.</p>
                </div>
              </div>
            </div>

            {/* Upload Form */}
            <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5">
              <h2 className="text-sm font-semibold text-on-background pb-3 mb-4 border-b border-outline-variant/20">
                {needsPayment ? 'Upload Payment Proof' : 'Complete Registration'}
              </h2>
              <form id="pay-form" onSubmit={handleSubmit} className="space-y-4">
                {needsPayment && (
                  <div>
                    <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">
                      Payment Screenshot <span className="text-red-400">*</span>
                    </label>
                    <div className={`relative rounded-xl border-2 border-dashed transition-all ${
                      screenshot ? 'border-emerald-400/50 bg-emerald-500/5' : 'border-outline-variant/40 hover:border-outline-variant/60 bg-surface-variant/10'
                    }`}>
                      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      <div className="p-4 text-center">
                        {screenshot ? (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <p className="text-xs font-medium text-on-background truncate">{screenshot.name}</p>
                              <p className="text-[10px] text-on-surface-variant">{(screenshot.size / 1024 / 1024).toFixed(1)} MB</p>
                            </div>
                            <button type="button" onClick={() => { setScreenshot(null); setServerError('') }}
                              className="z-20 w-7 h-7 rounded-lg bg-surface-variant/40 hover:bg-surface-variant flex items-center justify-center flex-shrink-0 transition-colors">
                              <svg className="w-3.5 h-3.5 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5">
                            <svg className="w-8 h-8 text-on-surface-variant/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                            </svg>
                            <p className="text-xs text-on-surface-variant/60">Tap to upload screenshot</p>
                            <p className="text-[10px] text-on-surface-variant/40">JPEG, PNG, or WebP · Max 10MB</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Upload Progress */}
                {submitting && uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="w-full bg-surface-variant/20 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-primary h-full rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                  </div>
                )}

                {needsPayment && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">
                        Transaction / UTR Number <span className="text-red-400">*</span>
                      </label>
                      <input type="text" value={transactionId} onChange={(e) => setTransactionId(e.target.value)}
                        placeholder="e.g. HDFC123456789"
                        className="w-full px-3 py-[13px] rounded-xl border-2 text-[15px] outline-none transition-all duration-150 bg-surface text-on-background placeholder:text-on-surface-variant/40 border-outline-variant/40 hover:border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10" />
                    </div>
                    <div>
                      <label className="text-[13px] font-medium text-on-surface-variant mb-1.5 block">Payment App</label>
                      <input type="text" value={paymentApp} onChange={(e) => setPaymentApp(e.target.value)}
                        placeholder="e.g. GPay, PhonePe, PayTM"
                        className="w-full px-3 py-[13px] rounded-xl border-2 text-[15px] outline-none transition-all duration-150 bg-surface text-on-background placeholder:text-on-surface-variant/40 border-outline-variant/40 hover:border-outline-variant/60 focus:border-primary focus:ring-4 focus:ring-primary/10" />
                    </div>
                  </div>
                )}

                {/* Desktop Submit */}
                <div className="hidden md:flex flex-col gap-3 pt-2">
                  <button type="submit" disabled={submitting}
                    className="w-full py-3 min-h-[48px] rounded-xl text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-[0.98]">
                    {submitting ? (
                      <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
                    ) : (
                      <>{needsPayment ? 'Submit & Complete Registration' : 'Complete Registration'}</>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* QR Code Sidebar (paid only) */}
          {needsPayment && (
            <div className="md:col-span-2">
              <div className="rounded-xl bg-surface shadow-sm border border-outline-variant/30 p-4 sm:p-5 sticky top-24">
                <h2 className="text-sm font-semibold text-on-background pb-3 mb-4 border-b border-outline-variant/20">
                  Scan to Pay
                </h2>
                <div className="flex flex-col items-center">
                  <div className="w-48 h-48 rounded-xl bg-surface-variant/20 border border-outline-variant/20 flex items-center justify-center mb-3">
                    <div className="text-center p-4">
                      <svg className="w-32 h-32 text-on-surface-variant/30 mx-auto" viewBox="0 0 100 100" fill="none">
                        <rect x="10" y="10" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
                        <rect x="70" y="10" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
                        <rect x="10" y="70" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
                        <rect x="70" y="70" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
                        <rect x="40" y="40" width="20" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
                      </svg>
                      <p className="text-[9px] text-on-surface-variant/40 mt-1">QR placeholder</p>
                    </div>
                  </div>
                  <div className="text-center space-y-1.5 w-full">
                    <p className="text-[11px] text-on-surface-variant">
                      UPI ID: <span className="font-mono font-bold text-primary text-xs">matchdistrict@upi</span>
                    </p>
                    <p className="text-[11px] text-on-surface-variant">
                      Amount: <span className="font-bold text-on-background">{fee}</span>
                    </p>
                    <p className="text-[10px] text-on-surface-variant/50">Account: Match District</p>
                  </div>
                  <div className="mt-4 w-full pt-3 border-t border-outline-variant/20">
                    <a href={`upi://pay?pa=matchdistrict@upi&pn=Match%20District&am=${feeAmount}&cu=INR&tn=Tournament%20Registration%20-%20${encodeURIComponent(tournament.title)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="block w-full py-2.5 min-h-[44px] rounded-xl text-center text-[12px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 transition-all">
                      Open UPI App
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-surface border-t border-outline-variant/30 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-3 max-w-[1000px] mx-auto">
          <button type="button" onClick={() => navigate(-1)} disabled={submitting}
            className="px-5 py-3 min-h-[48px] rounded-xl text-[14px] font-semibold disabled:opacity-30 bg-surface-variant/60 hover:bg-surface-variant text-on-background border border-outline-variant/30 flex-shrink-0 transition-colors">
            Back
          </button>
          <button type="submit" form="pay-form" disabled={submitting}
            className="flex-1 py-3 min-h-[48px] rounded-xl text-[14px] font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90 transition-all active:scale-[0.98]">
            {submitting ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Submitting...</>
            ) : (
              <>Submit & Complete</>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
