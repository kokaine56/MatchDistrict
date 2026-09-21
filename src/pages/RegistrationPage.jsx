import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { uploadImage } from '../utils/cloudinaryUpload.js'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'

const PAYMENT_APPS = ['PhonePe', 'Google Pay', 'Paytm', 'BHIM', 'Other']

function RegistrationPage({ onNavigate }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [currentUser] = useCurrentUser()
  const fileInputRef = useRef(null)
  const paymentSubmittedRef = useRef(false)

  const [tourney, setTourney] = useState(null)
  const [loadingTourney, setLoadingTourney] = useState(true)
  const [step, setStep] = useState('form')

  const [form, setForm] = useState({
    teamName: '',
    email: '',
    phone: '',
    captainIgn: '',
    captainUid: '',
    players: [{ ign: '', uid: '' }, { ign: '', uid: '' }, { ign: '', uid: '' }],
    substitutes: [{ ign: '', uid: '' }, { ign: '', uid: '' }],
  })
  const [errors, setErrors] = useState({})
  const [touched, setTouched] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [registeredTeam, setRegisteredTeam] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [amountToPay, setAmountToPay] = useState(null)

  const [payment, setPayment] = useState({
    app: '',
    transactionId: '',
    screenshotFile: null,
    screenshotPreview: null,
  })
  const [paymentErrors, setPaymentErrors] = useState({})
  const [paymentSubmitting, setPaymentSubmitting] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const isPaid = parseInt(tourney?.entry_fee_amount || 0) > 0
  const entryFee = parseInt(tourney?.entry_fee_amount || 0)
  const isGpay = payment.app === 'Google Pay'

  useEffect(() => {
    if (!id) return
    setLoadingTourney(true)
    fetchJsonWithRetry(`/api/tournaments/${id}`).then(({ ok, data }) => {
      if (ok && data?.success && data.tournament) {
        setTourney(data.tournament)
      }
      setLoadingTourney(false)
    })
  }, [id])

  useEffect(() => {
    if (!currentUser || !tourney) return
    setForm(prev => ({
      ...prev,
      email: prev.email || currentUser.email || '',
      captainIgn: prev.captainIgn || currentUser.gamerTag || currentUser.name || '',
    }))
  }, [currentUser, tourney])

  // Reset modal state when entering payment step
  useEffect(() => {
    if (step === 'payment') {
      setShowConfirmModal(false)
      paymentSubmittedRef.current = false
    }
  }, [step])

  // Redirect if already registered with an active status
  useEffect(() => {
    if (!currentUser || !tourney || !id) return
    let cancelled = false
    ;(async () => {
      try {
        const token = await getAuthToken()
        if (!token) return
        const res = await fetch(`/api/tournaments/${id}/registrations`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json()
        if (cancelled) return
        if (data.success && data.registrations) {
          const activeStatuses = ['pending', 'pending_payment', 'approved', 'confirmed', 'waitlisted']
          const myReg = data.registrations.find(r =>
            r.user_id === currentUser.id && activeStatuses.includes((r.status || '').toLowerCase())
          )
          if (myReg) {
            navigate(`/tournaments/${id}`, { replace: true })
          }
        }
      } catch (_) {}
    })()
    return () => { cancelled = true }
  }, [currentUser, tourney, id, navigate])

  const updateField = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
  }

  const updatePlayer = (index, field, value) => {
    setForm(prev => {
      const players = [...prev.players]
      players[index] = { ...players[index], [field]: value }
      return { ...prev, players }
    })
  }

  const updateSub = (index, field, value) => {
    setForm(prev => {
      const subs = [...prev.substitutes]
      subs[index] = { ...subs[index], [field]: value }
      return { ...prev, substitutes: subs }
    })
  }

  const validate = () => {
    const errs = {}
    if (!form.teamName.trim()) errs.teamName = 'Team name is required'
    else if (form.teamName.trim().length > 16) errs.teamName = 'Max 16 characters'
    // email is auto-populated from authenticated user — no visible field, no validation needed
    if (!form.phone.trim()) errs.phone = 'Phone is required'
    else if (form.phone.replace(/\D/g, '').length !== 10) errs.phone = 'Must be 10 digits'
    if (!form.captainIgn.trim()) errs.captainIgn = 'Captain IGN is required'
    if (!form.captainUid.trim()) errs.captainUid = 'Captain UID is required'
    else if (!/^\d+$/.test(form.captainUid)) errs.captainUid = 'Numbers only'

    form.players.forEach((p, i) => {
      if (!p.ign.trim()) errs[`player_${i}_ign`] = 'Required'
      if (!p.uid.trim()) errs[`player_${i}_uid`] = 'Required'
      else if (!/^\d+$/.test(p.uid)) errs[`player_${i}_uid`] = 'Numbers only'
    })

    form.substitutes.forEach((s, i) => {
      if (s.ign.trim() || s.uid.trim()) {
        if (!s.ign.trim()) errs[`sub_${i}_ign`] = 'Required if filling sub'
        if (!s.uid.trim()) errs[`sub_${i}_uid`] = 'Required if filling sub'
        else if (!/^\d+$/.test(s.uid)) errs[`sub_${i}_uid`] = 'Numbers only'
      }
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleRegisterTeam = async (e) => {
    e.preventDefault()
    setServerError('')
    if (!validate()) {
      const firstErr = document.querySelector('[data-error]')
      if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setIsSubmitting(true)
    try {
      const token = await getAuthToken()
      const members = form.players.filter(p => p.ign.trim() && p.uid.trim())
      const subs = form.substitutes.filter(s => s.ign.trim() && s.uid.trim())
      const allMembers = [...members, ...subs]

      const formPayload = {
        team_name: form.teamName.trim(),
        email: form.email.trim(),
        phone: form.phone.replace(/\D/g, ''),
        captain: form.captainIgn.trim(),
        captain_uid: form.captainUid.trim(),
        members: allMembers,
      }

      // Create a registration session (validates form, checks dupes, but NO DB registration yet)
      const sessionRes = await fetch(`/api/sessions/create/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(formPayload),
      })
      const sessionData = await sessionRes.json()
      if (!sessionData.success) {
        setServerError(sessionData.message || 'Registration failed. Please try again.')
        return
      }

      const newSessionId = sessionData.session.id
      setSessionId(newSessionId)

      if (isPaid) {
        // Paid tournament: go to payment step (no DB write yet)
        setStep('payment')
      } else {
        // Free tournament: complete registration immediately via session
        const completeRes = await fetch(`/api/sessions/${newSessionId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({}),
        })
        const completeData = await completeRes.json()
        if (completeData.success) {
          setRegisteredTeam(completeData.registration)
          setAmountToPay(completeData.amount_to_pay || null)
          setStep('success')
        } else {
          setServerError(completeData.message || 'Registration failed. Please try again.')
        }
      }
    } catch (err) {
      setServerError('Network error. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleScreenshotChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPaymentErrors(prev => ({ ...prev, screenshot: 'Only JPEG, PNG, WebP allowed' }))
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setPaymentErrors(prev => ({ ...prev, screenshot: 'Max 10MB' }))
      return
    }
    setPayment(prev => ({
      ...prev,
      screenshotFile: file,
      screenshotPreview: URL.createObjectURL(file),
    }))
    setPaymentErrors(prev => ({ ...prev, screenshot: '' }))
  }

  const validatePayment = () => {
    const errs = {}
    if (!payment.app) errs.app = 'Please select a UPI app'
    if (!payment.transactionId.trim()) errs.transactionId = 'Transaction ID / UTR is required'
    if (!isGpay && !payment.screenshotFile) errs.screenshot = 'Upload payment screenshot'
    setPaymentErrors(errs)
    return Object.keys(errs).length === 0
  }

  const totalPlayers = 1 + form.players.filter(p => p.ign.trim() && p.uid.trim()).length
  const entryDisplay = useMemo(() => {
    if (!tourney) return ''
    const fee = parseInt(tourney.entry_fee_amount) || 0
    if (fee === 0) return 'Free'
    return `₹${fee.toLocaleString('en-IN')}`
  }, [tourney])

  if (loadingTourney) {
    return <LoadingScreen message="Loading registration page..." />
  }

  if (!tourney) {
    return (
      <div className="min-h-screen bg-[#07080C] text-white flex flex-col items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center space-y-4"
        >
          <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold">Unable to load registration page</h2>
          <p className="text-sm text-white/50">The tournament details could not be loaded or may no longer be available.</p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => navigate(-1)}
              className="flex-1 px-4 py-2.5 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl text-sm transition-colors"
            >
              Go Back
            </button>
            <button
              onClick={() => {
                setLoadingTourney(true)
                fetchJsonWithRetry(`/api/tournaments/${id}`).then(({ ok, data }) => {
                  if (ok && data?.success && data.tournament) {
                    setTourney(data.tournament)
                  }
                  setLoadingTourney(false)
                })
              }}
              className="flex-1 px-4 py-2.5 bg-primary hover:opacity-90 text-white font-bold rounded-xl text-sm transition-opacity"
            >
              Retry
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-[#07080C] text-white flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white/5 border border-white/10 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Team Registered!</h2>
          <p className="text-white/60 mb-6">
            {isPaid
              ? 'Your payment proof has been submitted. Awaiting admin verification.'
              : 'Your registration is pending organizer approval.'}
          </p>
          {registeredTeam && (
            <div className="bg-white/5 rounded-xl p-4 mb-6 text-left text-sm space-y-1">
              <p><span className="text-white/40">Team:</span> <span className="font-bold">{form.teamName}</span></p>
              <p><span className="text-white/40">Status:</span> <span className="text-amber-400 font-semibold">{registeredTeam.status}</span></p>
              <p><span className="text-white/40">Registration ID:</span> <span className="font-mono text-xs">{registeredTeam.id}</span></p>
              {amountToPay && (
                <p className="pt-1 border-t border-white/10 mt-2">
                  <span className="text-white/40">Amount to Pay:</span>{' '}
                  <span className="text-green-400 font-bold text-base">₹{Number(amountToPay).toFixed(2)}</span>
                </p>
              )}
            </div>
          )}
          <button
            onClick={() => navigate(`/tournaments/${id}`)}
            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl hover:opacity-90 transition-all"
          >
            View Tournament Details
          </button>
        </motion.div>
      </div>
    )
  }

  if (step === 'payment') {
    const upiLink = `upi://pay?pa=matchdistrict@upi&pn=Match%20District&am=${entryFee}&cu=INR&tn=${encodeURIComponent(tourney.title)}`

    // 4 core UPI apps — official CDN logos, no card styling
    const upiApps = [
      {
        name: 'Google Pay',
        scheme: 'tez://upi/pay',
        package: 'com.google.android.apps.nbu.paisa.user',
        ringColor: 'ring-[#4285F4]',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Google_Pay_Logo.svg/320px-Google_Pay_Logo.svg.png',
      },
      {
        name: 'PhonePe',
        scheme: 'phonepe://pay',
        package: 'com.phonepe.app',
        ringColor: 'ring-[#5f259f]',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/PhonePe_Logo.svg/320px-PhonePe_Logo.svg.png',
      },
      {
        name: 'Paytm',
        scheme: 'paytmmp://pay',
        package: 'net.one97.paytm',
        ringColor: 'ring-[#00baf2]',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/320px-Paytm_Logo_%28standalone%29.svg.png',
      },
      {
        name: 'BHIM',
        scheme: 'bhim://pay',
        package: 'in.org.npci.upiapp',
        ringColor: 'ring-[#128807]',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/ee/BHIM_logo_%28orange_background%29.svg/240px-BHIM_logo_%28orange_background%29.svg.png',
      },
    ]

    const handleAppClick = (app) => {
      setPayment(prev => ({ ...prev, app: app.name }))
      setPaymentErrors(prev => ({ ...prev, app: '' }))

      const pa = 'matchdistrict@upi'
      const pn = 'Match%20District'
      const am = entryFee
      const cu = 'INR'
      const tn = encodeURIComponent(tourney.title)
      const isAndroid = /Android/i.test(navigator.userAgent)

      let targetUrl = ''
      if (isAndroid && app.package) {
        // Strict Android Intent URI format — forces OS to route directly to the installed app
        // Format: intent://pay?pa=...&pn=...&am=...&cu=INR#Intent;scheme=upi;package=PKG_NAME;end;
        targetUrl = `intent://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}#Intent;scheme=upi;package=${app.package};end;`
      } else {
        // Proprietary scheme fallback for iOS / desktop
        targetUrl = `${app.scheme}?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}&tn=${tn}`
      }

      window.location.href = targetUrl
    }

    return (
      <div className="min-h-screen bg-[#07080C] text-white relative">
        <div className="max-w-2xl mx-auto px-4 py-8 pb-32">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('form')} className="p-2 -ml-2 hover:bg-white/5 rounded-xl transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-black">Confirm Payment</h1>
              <p className="text-sm text-white/40">Complete your registration</p>
            </div>
          </div>

          {/* Tournament Summary */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 flex items-center gap-4">
            <div className="w-16 h-20 rounded-lg overflow-hidden shrink-0 bg-white/10">
              {tourney.cover_image_url && (
                <img src={tourney.cover_image_url} className="w-full h-full object-cover" alt="" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/25">
                  {tourney.game}
                </span>
              </div>
              <p className="text-sm font-bold truncate">{form.teamName}</p>
              <p className="text-xs text-white/40">Entry Fee: <span className="text-green-400 font-bold">₹{entryFee.toLocaleString('en-IN')}</span></p>
            </div>
          </div>

          {serverError && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
              {serverError}
            </div>
          )}

          <div className="space-y-6">
            {/* UPI Details & QR Code Redesign */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Pay via UPI</h2>
              <div className="bg-white/5 rounded-xl p-6 text-center space-y-4 flex flex-col items-center">
                
                {/* QR Code Container */}
                <div className="bg-white p-3 rounded-2xl shadow-[0_0_25px_rgba(59,130,246,0.2)] border border-white/20 hover:scale-102 transition-transform duration-300">
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiLink)}`}
                    alt="Scan to Pay"
                    className="w-[180px] h-[180px] block"
                  />
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider">Amount to Pay</p>
                  <p className="text-3xl font-black text-green-400">₹{entryFee.toLocaleString('en-IN')}</p>
                </div>

                <div className="bg-white/10 rounded-xl p-3 inline-flex items-center gap-2 mx-auto border border-white/5">
                  <span className="text-sm text-white/50">UPI ID:</span>
                  <span className="text-sm font-bold text-primary">matchdistrict@upi</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText('matchdistrict@upi'); setServerError(''); }}
                    className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors"
                    title="Copy UPI ID"
                  >
                    <svg className="w-4 h-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>

                {/* Direct UPI App row — single row, 4 apps, no card borders */}
                <div className="w-full pt-4 border-t border-white/10 space-y-3">
                  <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider text-left">Open App to Pay</p>
                  <div className="grid grid-cols-4 gap-4">
                    {upiApps.map(app => (
                      <button
                        key={app.name}
                        type="button"
                        onClick={() => handleAppClick(app)}
                        className={`flex flex-col items-center gap-2 py-2 rounded-xl transition-all duration-200 ${
                          payment.app === app.name
                            ? `ring-2 ${app.ringColor} bg-white/5 scale-105`
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                      >
                        <img
                          src={app.logo}
                          alt={app.name}
                          className="w-12 h-12 rounded-xl object-contain"
                          draggable={false}
                        />
                        <span className="text-[10px] font-semibold text-white/70 tracking-wide">{app.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            </div>

            {/* Payment Proof Details */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Submit Payment Proof</h2>

              {paymentErrors.app && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-xs">
                  {paymentErrors.app} (Please select a UPI app above to continue)
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">Transaction ID / UTR *</label>
                <input
                  type="text"
                  value={payment.transactionId}
                  onChange={e => { setPayment(prev => ({ ...prev, transactionId: e.target.value })); setPaymentErrors(prev => ({ ...prev, transactionId: '' })); }}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="Enter UTR or transaction ID"
                />
                {paymentErrors.transactionId && <p className="text-red-400 text-xs mt-1">{paymentErrors.transactionId}</p>}
              </div>

              {/* Screenshot upload — hidden for Google Pay */}
              {!isGpay && (
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Payment Screenshot *</label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors"
                  >
                    {payment.screenshotPreview ? (
                      <div className="relative inline-block">
                        <img src={payment.screenshotPreview} alt="Screenshot preview" className="max-h-48 rounded-lg" />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPayment(prev => ({ ...prev, screenshotFile: null, screenshotPreview: null })); }}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center"
                        >
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <svg className="w-8 h-8 mx-auto text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-xs text-white/40">Click to upload screenshot</p>
                        <p className="text-[10px] text-white/20">JPEG, PNG, WebP • Max 10MB</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleScreenshotChange} />
                  {paymentErrors.screenshot && <p className="text-red-400 text-xs mt-1">{paymentErrors.screenshot}</p>}
                </div>
              )}

              {isGpay && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                  <p className="text-xs text-blue-400 flex items-center gap-2">
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Google Pay selected — no screenshot required. Just enter the UTR number.
                  </p>
                </div>
              )}
            </div>

            {/* Desktop Submit */}
            <div className="hidden sm:block">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  if (!e.nativeEvent.isTrusted) return
                  setServerError('')
                  if (!validatePayment()) return
                  setShowConfirmModal(true)
                }}
                disabled={paymentSubmitting}
                className="w-full bg-primary text-white font-bold py-3.5 px-6 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {paymentSubmitting ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>
                ) : (
                  <>Submit</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Sticky Bar */}
        <div
          className="fixed bottom-0 left-0 right-0 sm:hidden z-30 px-4 pt-3 flex items-center gap-3 rounded-t-2xl border-t border-white/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
          style={{
            background: 'rgba(255, 255, 255, 0.84)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
          }}
        >
          <button
            onClick={() => setStep('form')}
            className="flex-1 bg-black/5 hover:bg-black/10 border border-black/10 text-slate-800 font-semibold py-2.5 rounded-xl transition-colors text-sm"
          >
            Back
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!e.nativeEvent.isTrusted) return
              setServerError('')
              if (!validatePayment()) return
              setShowConfirmModal(true)
            }}
            disabled={paymentSubmitting}
            className="flex-1 bg-primary text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-md shadow-primary/25"
          >
            {paymentSubmitting ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting</>
            ) : (
              <>Submit</>
            )}
          </button>
        </div>

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <>
            <div className="fixed inset-0 bg-black/60 z-40" onClick={() => setShowConfirmModal(false)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#111] border border-white/10 rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4"
              >
                <h3 className="text-lg font-bold">Submit for Verification?</h3>
                <p className="text-sm text-white/60">
                  Your payment proof and details will be sent for admin verification.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowConfirmModal(false)}
                    className="flex-1 bg-white/10 text-white font-bold py-3 rounded-xl hover:bg-white/20 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={paymentSubmittedRef.current}
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (!e.nativeEvent.isTrusted) return
                      if (paymentSubmittedRef.current) return
                      paymentSubmittedRef.current = true
                      setShowConfirmModal(false)
                      setPaymentSubmitting(true)
                      try {
                        const token = await getAuthToken()
                        let screenshotUrl = null
                        if (!isGpay && payment.screenshotFile) {
                          try {
                            screenshotUrl = await uploadImage(payment.screenshotFile)
                          } catch (uploadErr) {
                            setServerError(`Screenshot upload failed: ${uploadErr.message}. Please try again or choose a different image.`)
                            setPaymentSubmitting(false)
                            paymentSubmittedRef.current = false
                            return
                          }
                        }
                        const res = await fetch(`/api/sessions/${sessionId}/complete`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({
                            utr_number: payment.transactionId.trim(),
                            payment_app: payment.app,
                            screenshot_url: screenshotUrl,
                          }),
                        })
                        const data = await res.json()
                        if (data.success) {
                          setRegisteredTeam(data.registration)
                          setAmountToPay(data.amount_to_pay || null)
                          setStep('success')
                        } else {
                          setServerError(data.message || 'Payment submission failed. Please try again.')
                          paymentSubmittedRef.current = false
                        }
                      } catch (err) {
                        setServerError('Network error. Please try again.')
                        paymentSubmittedRef.current = false
                      } finally {
                        setPaymentSubmitting(false)
                      }
                    }}
                    className="flex-1 bg-primary text-white font-bold py-3 rounded-xl hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirm
                  </button>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </div>
    );
  }

  const _gameKey = (tourney.game || '').toLowerCase().trim()
  const gameIconSrc =
    _gameKey === 'bgmi' || _gameKey === 'battlegrounds mobile india' ? gameBgmi
    : _gameKey === 'free fire' ? gameFreeFire
    : _gameKey === 'codm' || _gameKey === 'cod mobile' ? gameCodm
    : _gameKey === 'valorant' ? gameValorant
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="min-h-screen bg-[#07080C] text-white relative"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-white/5 rounded-xl transition-colors shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {gameIconSrc && (
            <img src={gameIconSrc} alt={tourney.game} className="w-8 h-8 rounded-lg object-cover shrink-0 shadow-md" />
          )}
          <div>
            <h1 className="text-xl font-black leading-tight">Register Team</h1>
            <p className="text-sm text-white/40 leading-tight">{tourney.title}</p>
          </div>
        </div>



        {serverError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {serverError}
          </div>
        )}

        <form onSubmit={handleRegisterTeam} className="space-y-6">

          {/* Desktop: Team Info + Captain side-by-side; Mobile: stacked */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Team Information */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Team Information</h2>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">Team Name *</label>
                <input
                  type="text"
                  value={form.teamName}
                  onChange={e => updateField('teamName', e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, teamName: true }))}
                  maxLength={16}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="Enter your team name"
                />
                {errors.teamName && <p className="text-red-400 text-xs mt-1">{errors.teamName}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">Phone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                  onBlur={() => setTouched(prev => ({ ...prev, phone: true }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="9876543210"
                />
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </div>
            </div>

            {/* Captain */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-amber-400/80 uppercase tracking-wider">Captain</h2>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">IGN *</label>
                <input
                  type="text"
                  value={form.captainIgn}
                  onChange={e => updateField('captainIgn', e.target.value)}
                  onBlur={() => setTouched(prev => ({ ...prev, captainIgn: true }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="In-game name"
                />
                {errors.captainIgn && <p className="text-red-400 text-xs mt-1">{errors.captainIgn}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-1.5">UID *</label>
                <input
                  type="text"
                  value={form.captainUid}
                  onChange={e => updateField('captainUid', e.target.value.replace(/\D/g, ''))}
                  onBlur={() => setTouched(prev => ({ ...prev, captainUid: true }))}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                  placeholder="Game UID"
                />
                {errors.captainUid && <p className="text-red-400 text-xs mt-1">{errors.captainUid}</p>}
              </div>
            </div>

          </div>

          {/* Players */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Players</h2>
            {form.players.map((player, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-white/5 rounded-xl" data-error={errors[`player_${i}_ign`] || errors[`player_${i}_uid`] ? true : undefined}>
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Player {i + 2} IGN *</label>
                  <input
                    type="text"
                    value={player.ign}
                    onChange={e => updatePlayer(i, 'ign', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="In-game name"
                  />
                  {errors[`player_${i}_ign`] && <p className="text-red-400 text-xs mt-1">{errors[`player_${i}_ign`]}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Player {i + 2} UID *</label>
                  <input
                    type="text"
                    value={player.uid}
                    onChange={e => updatePlayer(i, 'uid', e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="Game UID"
                  />
                  {errors[`player_${i}_uid`] && <p className="text-red-400 text-xs mt-1">{errors[`player_${i}_uid`]}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Substitutes */}
          <div className="bg-white/5 border border-amber-400/10 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-amber-400/60 uppercase tracking-wider">Substitutes (Optional)</h2>
            {form.substitutes.map((sub, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 bg-white/5 rounded-xl">
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Sub {i + 1} IGN</label>
                  <input
                    type="text"
                    value={sub.ign}
                    onChange={e => updateSub(i, 'ign', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="In-game name"
                  />
                  {errors[`sub_${i}_ign`] && <p className="text-red-400 text-xs mt-1">{errors[`sub_${i}_ign`]}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-white/60 mb-1.5">Sub {i + 1} UID</label>
                  <input
                    type="text"
                    value={sub.uid}
                    onChange={e => updateSub(i, 'uid', e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                    placeholder="Game UID"
                  />
                  {errors[`sub_${i}_uid`] && <p className="text-red-400 text-xs mt-1">{errors[`sub_${i}_uid`]}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Review */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
            <h2 className="text-sm font-bold text-white/60 uppercase tracking-wider">Review</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-white/40">Team</span><span className="font-semibold">{form.teamName || '—'}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Captain</span><span className="font-semibold">{form.captainIgn || '—'}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Players</span><span className="font-semibold">{totalPlayers}</span></div>
              <div className="flex justify-between"><span className="text-white/40">Entry Fee</span><span className="font-semibold">{entryDisplay || '—'}</span></div>
            </div>
          </div>

          {/* Desktop Submit — Cancel + primary action, right-aligned */}
          <div className="hidden sm:flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-semibold hover:bg-white/10 hover:text-white transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting...</>
              ) : (
                <>{isPaid ? 'Proceed to Payment' : 'Register Team'}{isPaid ? ` • ₹${entryFee.toLocaleString('en-IN')}` : ''}</>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Mobile Sticky Bar — clean frosted-glass treatment */}
      <div
        className="fixed bottom-0 left-0 right-0 sm:hidden z-30 px-4 pt-3 flex items-center gap-3 rounded-t-2xl border-t border-white/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{
          background: 'rgba(255, 255, 255, 0.84)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom, 12px))',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex-1 bg-black/5 hover:bg-black/10 border border-black/10 text-slate-800 font-semibold py-2.5 rounded-xl transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleRegisterTeam}
          disabled={isSubmitting}
          className="flex-[2] bg-primary text-white font-bold py-2.5 rounded-xl hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm shadow-md shadow-primary/25"
        >
          {isSubmitting ? (
            <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Submitting</>
          ) : (
            <>{isPaid ? 'Proceed to Payment' : 'Register Team'}</>
          )}
        </button>
      </div>
    </motion.div>
  )
}

export default RegistrationPage
