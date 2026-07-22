import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '../UserContext.jsx'
import { getAuthTokenSync } from '../utils/getAuthToken.js'
import { ROLES, hasRole, getUserRoles } from '../utils/iamRoles.js'

const API_BASE = import.meta.env.VITE_API_URL || ''

function Spinner({ className = 'w-4 h-4' }) {
  return <div className={`${className} border-2 border-white/20 border-t-white rounded-full animate-spin`} />
}

export default function AdminAuthenticatorSetup() {
  const navigate = useNavigate()
  const { currentUser, loading: userLoading } = useUser()

  useEffect(() => {
    if (!userLoading && (!currentUser || !hasRole(getUserRoles(currentUser), ROLES.ADMIN))) {
      navigate('/admin', { replace: true })
    }
  }, [currentUser, userLoading, navigate])

  const [loading, setLoading] = useState(true)
  const [activated, setActivated] = useState(false)
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [rawSecret, setRawSecret] = useState('')
  const [otpInput, setOtpInput] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)

  const fetchSetup = useCallback(async () => {
    setLoading(true)
    setError('')
    setAccessDenied(false)
    try {
      const token = getAuthTokenSync()
      const res = await fetch(`${API_BASE}/api/admin/authenticator/setup`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.status === 403) {
        setAccessDenied(true)
        return
      }
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
      const token = getAuthTokenSync()
      const res = await fetch(`${API_BASE}/api/admin/authenticator/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ otp: otpInput })
      })
      const data = await res.json()
      if (data.success) {
        setActivated(true)
        setShowSetup(false)
        setSuccess(data.message)
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
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = getAuthTokenSync()
      const res = await fetch(`${API_BASE}/api/admin/authenticator/revoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ confirm: true })
      })
      const data = await res.json()
      if (data.success) {
        setActivated(false)
        setShowRevokeConfirm(false)
        setSuccess(data.message)
        fetchSetup()
      } else {
        setError(data.message || 'Failed to revoke authenticator.')
      }
    } catch {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReconnect = async () => {
    setActionLoading(true)
    setError('')
    setSuccess('')
    try {
      const token = getAuthTokenSync()
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
        setShowSetup(true)
        setSuccess(data.message)
      } else {
        setError(data.message || 'Failed to reconnect device.')
      }
    } catch {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setActionLoading(false)
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
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm text-on-surface-variant">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />

      <div className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Back */}
        <button
          onClick={() => navigate('/admin')}
          className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary transition-colors mb-8 group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </button>

        {/* Header */}
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-on-background tracking-tight" style={{ fontFamily: 'var(--font-headline, inherit)' }}>
            Google Authenticator
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Two-factor authentication for your admin account
          </p>
        </div>

        {/* Error / Success */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-sm flex items-start gap-3"
            >
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              className="mb-5 p-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-start gap-3"
            >
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ========================================= */}
        {/* CONNECTED STATE */}
        {/* ========================================= */}
        {activated && !showRevokeConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="rounded-2xl bg-surface-container-low border border-outline-variant/20 overflow-hidden"
          >
            <div className="h-1 bg-gradient-to-r from-green-500 via-emerald-400 to-green-500" />
            <div className="p-5 sm:p-6">
              {/* Status */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-500/15 border border-green-500/25 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-on-background">Connected</h2>
                  <p className="text-xs text-green-400 font-medium">Authenticator is active</p>
                </div>
              </div>

              <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
                Your admin account is protected by two-factor authentication. Every login requires the current 6-digit code from Google Authenticator.
              </p>

              {/* Revoke */}
              <div className="border-t border-outline-variant/15 pt-4">
                <p className="text-xs text-on-surface-variant mb-3">Need to disable or change your authenticator device?</p>
                <div className="flex gap-3">
                  <button
                    onClick={handleReconnect}
                    disabled={actionLoading}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface transition-all duration-200"
                  >
                    {actionLoading ? <Spinner className="w-3.5 h-3.5" /> : (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10" />
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                      </svg>
                    )}
                    Reconnect
                  </button>
                  <button
                    onClick={() => setShowRevokeConfirm(true)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-error bg-error/10 border border-error/20 hover:bg-error/15 transition-all duration-200"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0-.54 7.07" />
                      <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0 .54-7.07" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </svg>
                    Revoke
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================= */}
        {/* REVOKE CONFIRM */}
        {/* ========================================= */}
        {activated && showRevokeConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl bg-surface-container-low border border-error/20 overflow-hidden"
          >
            <div className="h-1 bg-gradient-to-r from-error via-red-400 to-error" />
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-error/15 border border-error/25 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-bold text-on-background">Revoke Access</h2>
                  <p className="text-xs text-error font-medium">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
                This will <strong className="text-error">completely disable</strong> two-factor authentication on your account. You will be able to log in using only your password until you set it up again.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRevokeConfirm(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:bg-surface transition-all duration-200"
                >
                  Keep Active
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-error hover:bg-error/90 disabled:opacity-50 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <Spinner className="w-3.5 h-3.5" />
                      Revoking...
                    </>
                  ) : 'Yes, Revoke'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ========================================= */}
        {/* NOT CONNECTED STATE — Setup */}
        {/* ========================================= */}
        {!activated && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {/* Status Card — collapsed when setup is closed */}
            {!showSetup && (
              <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary via-blue-400 to-primary" />
                <div className="p-5 sm:p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                      <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-on-background">Not Connected</h2>
                      <p className="text-xs text-primary font-medium">Setup recommended</p>
                    </div>
                  </div>

                  <p className="text-sm text-on-surface-variant leading-relaxed mb-5">
                    Secure your admin account with two-factor authentication. Once enabled, every login will require a code from Google Authenticator.
                  </p>

                  <button
                    onClick={() => setShowSetup(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    Connect Authenticator
                  </button>
                </div>
              </div>
            )}

            {/* Expanded Setup */}
            {showSetup && (
              <div className="space-y-4">
                {/* Steps */}
                <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 sm:p-6">
                  <h3 className="text-sm font-semibold text-on-background mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    How to connect
                  </h3>
                  <ol className="text-sm text-on-surface-variant space-y-2.5 list-none">
                    {[
                      'Install Google Authenticator on your phone.',
                      'Scan the QR code below.',
                      'Enter the 6-digit code to verify.'
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0 mt-0.5">{i + 1}</span>
                        <span className="leading-relaxed">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* QR Code */}
                <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 sm:p-6">
                  <h3 className="text-sm font-semibold text-on-background mb-4 text-center">Scan QR Code</h3>

                  {qrCode ? (
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-lg shadow-black/10">
                          <img
                            src={qrCode}
                            alt="Google Authenticator QR Code"
                            className="w-[200px] h-[200px] sm:w-[240px] sm:h-[240px] object-contain"
                            draggable={false}
                          />
                        </div>
                        <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 border-primary/40 rounded-tl-lg" />
                        <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 border-primary/40 rounded-tr-lg" />
                        <div className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 border-primary/40 rounded-bl-lg" />
                        <div className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 border-primary/40 rounded-br-lg" />
                      </div>

                      {/* Secret */}
                      <div className="w-full max-w-sm mt-5">
                        <p className="text-[10px] text-on-surface-variant text-center mb-2 uppercase tracking-wider font-bold">Manual Entry Key</p>
                        <div className="flex items-center justify-center bg-surface-container-lowest rounded-xl border border-outline-variant/20 px-3 py-2.5">
                          <code className="text-xs sm:text-sm font-mono text-on-background tracking-[0.1em] select-all break-all">{secret}</code>
                        </div>
                        <button
                          onClick={handleCopySecret}
                          className="mt-2.5 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-on-surface-variant bg-surface-container-lowest border border-outline-variant/20 hover:text-primary hover:border-primary/20 transition-all duration-200"
                        >
                          {copied ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span className="text-green-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                              </svg>
                              Copy Secret Key
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-10">
                      <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
                      <p className="text-xs text-on-surface-variant">Generating...</p>
                    </div>
                  )}
                </div>

                {/* Verify */}
                <div className="rounded-2xl bg-surface-container-low border border-outline-variant/20 p-5 sm:p-6">
                  <h3 className="text-sm font-semibold text-on-background mb-1 text-center">Verify</h3>
                  <p className="text-xs text-on-surface-variant text-center mb-4">Enter the 6-digit code from Google Authenticator</p>

                  <div className="max-w-[240px] mx-auto">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otpInput}
                      onChange={(e) => {
                        setOtpInput(e.target.value.replace(/\D/g, ''))
                        setError('')
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && otpInput.length === 6) handleVerify()
                      }}
                      placeholder="000000"
                      className="w-full text-center text-xl font-mono tracking-[0.3em] px-4 py-3 rounded-xl bg-surface-container-lowest border border-outline-variant/20 text-on-background placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40 transition-all"
                      autoFocus
                    />

                    <button
                      onClick={handleVerify}
                      disabled={verifying || otpInput.length !== 6}
                      className="mt-3 w-full px-4 py-3 rounded-xl font-bold text-white text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {verifying ? (
                        <>
                          <Spinner className="w-4 h-4" />
                          Verifying...
                        </>
                      ) : 'Verify & Activate'}
                    </button>
                  </div>
                </div>

                {/* Collapse button */}
                <button
                  onClick={() => {
                    setShowSetup(false)
                    setOtpInput('')
                    setError('')
                  }}
                  className="w-full text-center text-xs text-on-surface-variant hover:text-primary transition-colors py-2"
                >
                  Collapse setup
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
