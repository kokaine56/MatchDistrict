import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '../UserContext.jsx'

const API_BASE = import.meta.env.VITE_API_URL || ''

function ShieldIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function CheckCircleIcon({ className = 'w-5 h-5' }) {
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

function XIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function LinkIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function UnlinkIcon({ className = 'w-5 h-5' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0-.54 7.07" />
      <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0 .54-7.07" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  )
}

function InfoIcon({ className = 'w-4 h-4' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function Spinner({ className = 'w-4 h-4' }) {
  return (
    <div className={`${className} border-2 border-white/20 border-t-white rounded-full animate-spin`} />
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
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false)
  const [showReconnectModal, setShowReconnectModal] = useState(false)
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
    } catch {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!userLoading) fetchSetup()
  }, [userLoading, fetchSetup])

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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
    } catch {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setVerifying(false)
    }
  }

  const handleRevoke = async () => {
    setResetting(true)
    setError('')
    setSuccess('')
    try {
      const token = localStorage.getItem('md_persistent_session')
      const res = await fetch(`${API_BASE}/api/admin/authenticator/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ confirm: true })
      })
      const data = await res.json()
      if (data.success) {
        setQrCode(data.qrCode)
        setSecret(data.secret)
        setRawSecret(data.rawSecret)
        setActivated(false)
        setSuccess(data.message)
        setShowRevokeConfirm(false)
        setShowReconnectModal(false)
      } else {
        setError(data.message || 'Failed to revoke authenticator.')
      }
    } catch {
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

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
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
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <ShieldIcon className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-on-background tracking-tight" style={{ fontFamily: 'var(--font-headline, inherit)' }}>
              Google Authenticator
            </h1>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-0.5">
              Two-factor authentication for your admin account
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
              className="mb-5 p-3.5 sm:p-4 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-center gap-3"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span>{error}</span>
            </motion.div>
          )}
          {success && (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 p-3.5 sm:p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-3"
            >
              <CheckCircleIcon className="w-5 h-5 shrink-0" />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================ */}
        {/* ACTIVATED STATE */}
        {/* ============================================ */}
        {activated && !showRevokeConfirm && !showReconnectModal && (
          <motion.div {...fadeIn} transition={{ ...transition, delay: 0.1 }} className="space-y-5">
            {/* Status Card */}
            <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 overflow-hidden">
              {/* Top accent bar */}
              <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />

              <div className="p-5 sm:p-7">
                {/* Status row */}
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div className="flex items-center gap-3">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
                      className="w-11 h-11 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0"
                    >
                      <CheckCircleIcon className="w-6 h-6 text-green-400" />
                    </motion.div>
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-on-background">Authenticator Active</h2>
                      <p className="text-xs text-green-400 font-medium mt-0.5">2FA is protecting your account</p>
                    </div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] font-bold text-green-400 uppercase tracking-wider">
                    Enabled
                  </span>
                </div>

                {/* Info panel */}
                <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/10 p-4 mb-5">
                  <div className="flex items-start gap-3">
                    <LockIcon className="w-4 h-4 text-on-surface-variant mt-0.5 shrink-0" />
                    <div className="space-y-1.5">
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        Every admin login now requires the current 6-digit code from Google Authenticator on your phone.
                      </p>
                      <p className="text-xs text-on-surface-variant leading-relaxed">
                        The QR code and secret key are hidden for security. Use the options below to manage your setup.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setOtpInput('')
                      setError('')
                      setSuccess('')
                      setShowReconnectModal(true)
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold text-primary bg-primary/10 border border-primary/20 hover:bg-primary/15 hover:border-primary/30 transition-all duration-200"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Reconnect Device
                  </button>
                  <button
                    onClick={() => {
                      setError('')
                      setSuccess('')
                      setShowRevokeConfirm(true)
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold text-error bg-error/10 border border-error/20 hover:bg-error/15 hover:border-error/30 transition-all duration-200"
                  >
                    <UnlinkIcon className="w-4 h-4" />
                    Revoke Access
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================ */}
        {/* REVOKE CONFIRM */}
        {/* ============================================ */}
        {activated && showRevokeConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl bg-surface-container-low border border-error/20 overflow-hidden"
          >
            <div className="h-1 bg-gradient-to-r from-error via-red-400 to-error" />

            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center shrink-0">
                  <UnlinkIcon className="w-5 h-5 text-error" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-on-background">Revoke Authenticator</h2>
                  <p className="text-xs text-error/80 font-medium mt-0.5">This action is permanent</p>
                </div>
              </div>

              <div className="rounded-xl bg-error/5 border border-error/10 p-4 mb-6">
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  Revoking will <strong className="text-error">permanently disable</strong> two-factor authentication on your admin account. You will be able to log in using only your password until you set it up again.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowRevokeConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface transition-all duration-200"
                >
                  Keep Active
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={resetting}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-error hover:bg-error/90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {resetting ? (
                    <>
                      <Spinner className="w-4 h-4" />
                      Revoking...
                    </>
                  ) : (
                    'Yes, Revoke Access'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================ */}
        {/* RECONNECT MODAL */}
        {/* ============================================ */}
        {activated && showReconnectModal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl bg-surface-container-low border border-primary/20 overflow-hidden"
          >
            <div className="h-1 bg-gradient-to-r from-primary via-blue-400 to-primary" />

            <div className="p-5 sm:p-7">
              <div className="flex items-start gap-3 mb-5">
                <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <LinkIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-on-background">Reconnect Device</h2>
                  <p className="text-xs text-primary/80 font-medium mt-0.5">Generate a new QR code</p>
                </div>
              </div>

              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 mb-6">
                <p className="text-sm text-on-surface-variant leading-relaxed">
                  This will <strong className="text-primary">replace your current authenticator</strong> with a new one. Your old QR code and secret will be invalidated. Scan the new QR code to reconnect.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => setShowReconnectModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={resetting}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {resetting ? (
                    <>
                      <Spinner className="w-4 h-4" />
                      Generating...
                    </>
                  ) : (
                    'Generate New QR Code'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ============================================ */}
        {/* SETUP STATE — QR + Verify */}
        {/* ============================================ */}
        {!activated && (
          <>
            {/* Steps Card */}
            <motion.div
              {...fadeIn}
              transition={{ ...transition, delay: 0.1 }}
              className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 sm:p-6 mb-5"
            >
              <h3 className="text-sm sm:text-base font-semibold text-on-background mb-4 flex items-center gap-2">
                <InfoIcon className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                How it works
              </h3>
              <ol className="text-sm text-on-surface-variant space-y-3 list-none">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0 mt-0.5">1</span>
                  <span className="leading-relaxed">Install <strong className="text-on-background">Google Authenticator</strong> on your phone.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0 mt-0.5">2</span>
                  <span className="leading-relaxed">Scan the QR code below. It generates a new 6-digit code every <strong className="text-on-background">30 seconds</strong>.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0 mt-0.5">3</span>
                  <span className="leading-relaxed">Enter the current code below to verify and activate 2FA.</span>
                </li>
              </ol>
            </motion.div>

            {/* QR Code Card */}
            <motion.div
              {...fadeIn}
              transition={{ ...transition, delay: 0.15 }}
              className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 sm:p-7 mb-5"
            >
              <h3 className="text-sm sm:text-base font-semibold text-on-background mb-5 text-center">Scan QR Code</h3>

              {qrCode ? (
                <div className="flex flex-col items-center">
                  {/* QR container */}
                  <div className="relative">
                    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-lg shadow-black/10">
                      <img
                        src={qrCode}
                        alt="Google Authenticator QR Code"
                        className="w-[200px] h-[200px] sm:w-[260px] sm:h-[260px] object-contain"
                        draggable={false}
                      />
                    </div>
                    {/* Corner accents */}
                    <div className="absolute -top-1.5 -left-1.5 w-4 h-4 border-t-2 border-l-2 border-primary/40 rounded-tl-lg" />
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 border-t-2 border-r-2 border-primary/40 rounded-tr-lg" />
                    <div className="absolute -bottom-1.5 -left-1.5 w-4 h-4 border-b-2 border-l-2 border-primary/40 rounded-bl-lg" />
                    <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 border-b-2 border-r-2 border-primary/40 rounded-br-lg" />
                  </div>

                  {/* Secret Key */}
                  <div className="w-full max-w-sm mt-6">
                    <p className="text-[10px] text-on-surface-variant text-center mb-2 uppercase tracking-wider font-bold">Secret Key (manual entry)</p>
                    <div className="flex items-center justify-center gap-2 bg-surface-container-lowest rounded-xl border border-outline-variant/20 px-3 py-2.5">
                      <code className="text-xs sm:text-sm font-mono text-on-background tracking-[0.12em] select-all break-all">{secret}</code>
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
                  <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
                  <p className="text-sm text-on-surface-variant">Generating QR code...</p>
                </div>
              )}
            </motion.div>

            {/* Verification Section */}
            <motion.div
              {...fadeIn}
              transition={{ ...transition, delay: 0.2 }}
              className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 sm:p-7"
            >
              <h3 className="text-sm sm:text-base font-semibold text-on-background mb-2 text-center">Verify & Activate</h3>
              <p className="text-xs sm:text-sm text-on-surface-variant text-center mb-5">
                Enter the 6-digit code from Google Authenticator
              </p>

              <div className="max-w-xs mx-auto">
                <label className="block text-[10px] text-on-surface-variant uppercase tracking-wider font-bold mb-2 text-center">
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
                  className="w-full text-center text-xl sm:text-2xl font-mono tracking-[0.3em] px-4 py-3.5 sm:py-4 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                  autoFocus
                />

                <button
                  onClick={handleVerify}
                  disabled={verifying || otpInput.length !== 6}
                  className="mt-4 w-full px-6 py-3.5 rounded-xl font-bold text-white text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  {verifying ? (
                    <>
                      <Spinner className="w-4 h-4" />
                      Verifying...
                    </>
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
