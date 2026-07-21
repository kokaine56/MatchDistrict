import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '../UserContext.jsx'

const API_BASE = import.meta.env.VITE_API_URL || ''

function ShieldIcon({ className = 'w-8 h-8' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function CheckCircleIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  )
}

function CopyIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function RefreshIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function LockIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function Spinner() {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  )
}

export default function AdminAuthenticatorSetup() {
  const navigate = useNavigate()
  const { currentUser, loading: userLoading } = useUser()

  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [rawSecret, setRawSecret] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    setPrefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  const fadeIn = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }

  const transition = prefersReducedMotion ? { duration: 0.15 } : { type: 'tween', ease: 'easeOut', duration: 0.35 }

  const fetchSetup = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = localStorage.getItem('md_persistent_session')
      const res = await fetch(`${API_BASE}/api/admin/authenticator/setup`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        setActivated(data.activated)
        if (!data.activated) {
          setQrCode(data.qrCode)
          setSecret(data.secret)
          setRawSecret(data.rawSecret)
        }
      } else {
        setError(data.message || 'Failed to load setup data.')
      }
    } catch (err) {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userLoading && currentUser) {
      fetchSetup()
    } else if (!userLoading && !currentUser) {
      navigate('/login?redirect=/admin/security/authenticator')
    }
  }, [currentUser, userLoading, navigate, fetchSetup])

  const handleVerify = async () => {
    if (!otpInput || otpInput.length !== 6) {
      setError('Please enter a valid 6-digit code.')
      return
    }
    setVerifying(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('md_persistent_session')
      const res = await fetch(`${API_BASE}/api/admin/authenticator/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ otp: otpInput })
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(data.message)
        setActivated(true)
        setOtpInput('')
      } else {
        setError(data.message || 'Invalid verification code.')
      }
    } catch (err) {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setVerifying(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('md_persistent_session')
      const res = await fetch(`${API_BASE}/api/admin/authenticator/reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ confirm: true })
      })
      const data = await res.json()
      if (data.success) {
        setQrCode(data.qrCode)
        setSecret(data.secret)
        setRawSecret(data.rawSecret)
        setActivated(false)
        setSuccess(data.message)
        setShowResetConfirm(false)
      } else {
        setError(data.message || 'Failed to reset authenticator.')
      }
    } catch (err) {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setResetting(false)
    }
  }

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(rawSecret)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = rawSecret
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative z-10 flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant font-body-lg">Loading security settings...</p>
        </motion.div>
      </div>
    )
  }

  if (!currentUser) return null

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Back button */}
        <motion.button
          {...fadeIn}
          transition={{ ...transition, delay: 0 }}
          onClick={() => navigate('/admin')}
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors mb-6 group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </motion.button>

        {/* Header */}
        <motion.div
          {...fadeIn}
          transition={{ ...transition, delay: 0.05 }}
          className="flex items-center gap-4 mb-8"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldIcon className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-on-background tracking-tight" style={{ fontFamily: 'var(--font-headline, inherit)' }}>
              Google Authenticator
            </h1>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Secure your admin account with two-factor authentication
            </p>
          </div>
        </motion.div>

        {/* Error / Success banners */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-3"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </motion.div>
          )}
          {success && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-3"
            >
              <CheckCircleIcon className="w-5 h-5 shrink-0" />
              {success}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTIVATED STATE */}
        {activated && (
          <motion.div
            {...fadeIn}
            transition={{ ...transition, delay: 0.1 }}
            className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
              className="w-20 h-20 rounded-full bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6"
            >
              <CheckCircleIcon className="w-10 h-10 text-green-400" />
            </motion.div>

            <h2 className="text-xl font-bold text-on-background mb-2">Authenticator Active</h2>
            <p className="text-sm text-on-surface-variant mb-8 max-w-sm mx-auto leading-relaxed">
              Google Authenticator is configured for your admin account. Every admin login now requires the current 6-digit code.
            </p>

            <div className="rounded-xl bg-green-500/5 border border-green-500/10 p-4 mb-8 max-w-sm mx-auto">
              <div className="flex items-center gap-3">
                <LockIcon className="w-5 h-5 text-green-400 shrink-0" />
                <p className="text-xs text-on-surface-variant text-left">
                  Your admin login is now protected. The QR code and secret are hidden for security.
                </p>
              </div>
            </div>

            {/* Reset button */}
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-error/10 hover:border-error/20 hover:text-error transition-all duration-200"
              >
                <RefreshIcon className="w-4 h-4" />
                Reset Google Authenticator
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl bg-error/5 border border-error/20 p-5 max-w-sm mx-auto"
              >
                <p className="text-sm text-error/90 mb-4 leading-relaxed">
                  This will invalidate your current Google Authenticator setup. You will need to scan a new QR code. Continue?
                </p>
                <div className="flex items-center gap-3 justify-center">
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-error hover:bg-error/90 transition-all disabled:opacity-50 flex items-center gap-2"
                  >
                    {resetting ? <Spinner /> : 'Yes, Reset'}
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* SETUP STATE — QR + Verify */}
        {!activated && !loading && (
          <>
            {/* Instructions Card */}
            <motion.div
              {...fadeIn}
              transition={{ ...transition, delay: 0.1 }}
              className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-6 mb-6"
            >
              <h3 className="text-base font-semibold text-on-background mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                How it works
              </h3>
              <ol className="text-sm text-on-surface-variant space-y-2.5 list-none">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">1</span>
                  <span>Scan this QR code using <strong className="text-on-background">Google Authenticator</strong> on your phone.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">2</span>
                  <span>After scanning, Google Authenticator will generate a new verification code every <strong className="text-on-background">30 seconds</strong>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0 mt-0.5">3</span>
                  <span>Enter the current code below to verify and activate. Use that code when logging into the Match District Admin Dashboard.</span>
                </li>
              </ol>
            </motion.div>

            {/* QR Code Card */}
            <motion.div
              {...fadeIn}
              transition={{ ...transition, delay: 0.15 }}
              className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-6 sm:p-8 mb-6"
            >
              <h3 className="text-base font-semibold text-on-background mb-6 text-center">Scan QR Code</h3>

              {qrCode ? (
                <div className="flex flex-col items-center">
                  <div className="bg-white rounded-2xl p-4 shadow-lg shadow-black/10 mb-6">
                    <img
                      src={qrCode}
                      alt="Google Authenticator QR Code"
                      className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] object-contain"
                      draggable={false}
                    />
                  </div>

                  {/* Secret Key */}
                  <div className="w-full max-w-sm">
                    <p className="text-xs text-on-surface-variant text-center mb-2 uppercase tracking-wider font-medium">Secret Key</p>
                    <div className="flex items-center justify-center gap-2 bg-surface-container-lowest rounded-xl border border-outline-variant/20 p-3">
                      <code className="text-sm font-mono text-on-background tracking-[0.15em] select-all">{secret}</code>
                    </div>
                    <button
                      onClick={handleCopySecret}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-primary/5 hover:border-primary/20 hover:text-primary transition-all duration-200"
                    >
                      {copied ? (
                        <>
                          <CheckCircleIcon className="w-4 h-4 text-green-400" />
                          <span className="text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <CopyIcon className="w-4 h-4" />
                          Copy Secret Key
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-12">
                  <div className="w-12 h-12 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                  <p className="text-sm text-on-surface-variant">Generating QR code...</p>
                </div>
              )}
            </motion.div>

            {/* Verification Section */}
            <motion.div
              {...fadeIn}
              transition={{ ...transition, delay: 0.2 }}
              className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-6 sm:p-8"
            >
              <h3 className="text-base font-semibold text-on-background mb-4 text-center">Verify & Activate</h3>
              <p className="text-sm text-on-surface-variant text-center mb-6">
                Enter the 6-digit code displayed in Google Authenticator
              </p>

              <div className="max-w-xs mx-auto">
                <label className="block text-xs text-on-surface-variant uppercase tracking-wider font-medium mb-2 text-center">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otpInput}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '')
                    setOtpInput(v)
                    setError('')
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && otpInput.length === 6) handleVerify()
                  }}
                  placeholder="000000"
                  className="w-full text-center text-2xl font-mono tracking-[0.3em] px-4 py-4 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  autoFocus
                />

                <button
                  onClick={handleVerify}
                  disabled={verifying || otpInput.length !== 6}
                  className="mt-4 w-full px-6 py-3.5 rounded-xl font-bold text-white text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98]"
                >
                  {verifying ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                      Verifying...
                    </div>
                  ) : (
                    'Verify & Activate'
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  )
}
