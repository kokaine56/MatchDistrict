import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useUser } from '../UserContext.jsx'
import { getAuthTokenSync } from '../utils/getAuthToken.js'
import { ROLES, hasRole, getUserRoles } from '../utils/iamRoles.js'

const API_BASE = import.meta.env.VITE_API_URL || ''
const OTP_LENGTH = 6

function Spinner({ className = 'w-4 h-4' }) {
  return <div className={`${className} border-2 border-white/20 border-t-white rounded-full animate-spin`} />
}

function OtpBox({ value, onChange, onPaste, onKeyDown, autoFocus, inputRef }) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      maxLength={1}
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '')
        onChange(v.slice(-1))
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      autoFocus={autoFocus}
      className="w-[40px] h-[48px] sm:w-[50px] sm:h-[58px] text-center text-lg sm:text-[22px] font-mono font-semibold text-on-background bg-white border border-[#EAEAEA] rounded-[10px] sm:rounded-[12px] outline-none transition-all duration-150 focus:border-primary focus:ring-[3px] focus:ring-primary/15"
    />
  )
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
  const [otpDigits, setOtpDigits] = useState(Array(OTP_LENGTH).fill(''))
  const [verifying, setVerifying] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [copied, setCopied] = useState(false)
  const [showDisableConfirm, setShowDisableConfirm] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const otpRefs = React.useRef([])

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
    const otp = otpDigits.join('')
    if (otp.length !== OTP_LENGTH) {
      setError('Please enter all 6 digits.')
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
        body: JSON.stringify({ otp })
      })
      const data = await res.json()
      if (data.success) {
        setActivated(true)
        setShowSetup(false)
        setSuccess(data.message)
        setOtpDigits(Array(OTP_LENGTH).fill(''))
      } else {
        setError(data.message || 'Invalid verification code.')
      }
    } catch {
      setError('Unable to communicate with the authentication server.')
    } finally {
      setVerifying(false)
    }
  }

  const handleDisable = async () => {
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
        setShowDisableConfirm(false)
        setSuccess(data.message)
        fetchSetup()
      } else {
        setError(data.message || 'Failed to disable authenticator.')
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
        setOtpDigits(Array(OTP_LENGTH).fill(''))
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

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return
    const next = [...otpDigits]
    next[index] = value
    setOtpDigits(next)
    setError('')
    if (value && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus()
    }
    if (e.key === 'Enter' && otpDigits.every(d => d !== '')) {
      handleVerify()
    }
  }

  const handleOtpPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (!pasted) return
    const next = Array(OTP_LENGTH).fill('')
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i]
    setOtpDigits(next)
    setError('')
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1)
    otpRefs.current[focusIdx]?.focus()
  }

  if (userLoading || loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#E2E8F0] border-t-[#3B82F6] rounded-full animate-spin" />
          <p className="text-sm text-[#64748B] font-medium">Loading security settings...</p>
        </div>
      </div>
    )
  }

  if (accessDenied) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="max-w-sm mx-auto px-4 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-[#0F172A] mb-2">Access Denied</h2>
          <p className="text-sm text-[#64748B] mb-6">You need admin privileges to access this page.</p>
          <button
            onClick={() => navigate('/admin')}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] transition-all duration-200 shadow-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-5 sm:py-10">

        {/* Back navigation */}
        <motion.button
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => navigate('/admin')}
          className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#3B82F6] transition-colors mb-5 sm:mb-8 group"
        >
          <svg className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to Dashboard
        </motion.button>

        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mb-6 sm:mb-10"
        >
          <div className="flex items-start gap-3 sm:gap-4 mb-2 sm:mb-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-4.5 h-4.5 sm:w-5.5 sm:h-5.5 text-[#3B82F6]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <h1 className="text-[22px] sm:text-[34px] font-bold text-[#0F172A] tracking-tight leading-tight">
                Google Authenticator
              </h1>
              <p className="text-[13px] sm:text-[17px] text-[#64748B] mt-0.5 sm:mt-1 leading-snug sm:leading-relaxed">
                Protect your administrator account using Time-based One-Time Password (TOTP).
              </p>
            </div>
          </div>
        </motion.div>

        {/* Error / Success */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 p-4 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-start gap-3"
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
              className="mb-5 p-4 rounded-xl bg-[#ECFDF5] border border-[#BBF7D0] text-[#166534] text-sm flex items-start gap-3"
            >
              <svg className="w-4 h-4 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ============================================ */}
        {/* CONNECTED STATE */}
        {/* ============================================ */}
        {activated && !showDisableConfirm && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-white rounded-[14px] sm:rounded-[18px] border border-[#EAEAEA] p-4 sm:p-8"
            style={{ boxShadow: '0 12px 40px rgba(0,0,0,.05)' }}
          >
            {/* Status Badge */}
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ECFDF5] border border-[#BBF7D0] mb-4 sm:mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span className="text-[10px] sm:text-xs font-semibold text-[#166534] tracking-wide uppercase">Connected</span>
            </div>

            {/* Status Icon + Heading */}
            <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-5">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#ECFDF5] border border-[#BBF7D0] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h2 className="text-[17px] sm:text-[22px] font-semibold text-[#0F172A]">Authenticator Active</h2>
                <p className="text-xs sm:text-sm text-[#64748B] mt-0.5">Google Authenticator Enabled</p>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5 sm:space-y-2.5 mb-4 sm:mb-6">
              <p className="text-[13px] sm:text-[15px] text-[#475569] leading-relaxed sm:leading-[1.7]">
                Your administrator account is protected using Google Authenticator.
              </p>
              <p className="text-[13px] sm:text-[15px] text-[#475569] leading-relaxed sm:leading-[1.7]">
                Every administrator login now requires a valid six-digit verification code.
              </p>
              <p className="text-[13px] sm:text-[15px] text-[#475569] leading-relaxed sm:leading-[1.7]">
                This greatly improves security against password theft and unauthorized access.
              </p>
            </div>

            {/* Security Tips */}
            <div className="bg-[#F0F9FF] border border-[#BAE6FD] rounded-xl sm:rounded-2xl p-3.5 sm:p-5 mb-5 sm:mb-7">
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#0EA5E9] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
                <span className="text-xs sm:text-sm font-semibold text-[#0C4A6E]">Security Tips</span>
              </div>
              <ul className="space-y-1 sm:space-y-1.5 text-xs sm:text-sm text-[#0369A1] leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-[#0EA5E9] mt-0.5 text-[10px] sm:text-xs">&#8226;</span>
                  Never share your authentication code with anyone.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#0EA5E9] mt-0.5 text-[10px] sm:text-xs">&#8226;</span>
                  Keep a backup of your recovery codes in a safe place.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#0EA5E9] mt-0.5 text-[10px] sm:text-xs">&#8226;</span>
                  Only disable 2FA if you have access to another secure device.
                </li>
              </ul>
            </div>

            {/* Divider */}
            <div className="border-t border-[#EAEAEA] mb-4 sm:mb-6" />

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <button
                onClick={handleReconnect}
                disabled={actionLoading}
                className="flex-1 inline-flex items-center justify-center gap-2 h-10 sm:h-12 px-4 sm:px-5 rounded-xl text-[13px] sm:text-[14px] font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? (
                  <Spinner className="w-4 h-4" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10" />
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                  </svg>
                )}
                Reconnect
              </button>
              <button
                onClick={() => setShowDisableConfirm(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 h-10 sm:h-12 px-4 sm:px-5 rounded-xl text-[13px] sm:text-[14px] font-semibold text-red-600 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-all duration-200 active:scale-[0.98]"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18.84 12.25l1.72-1.71a5 5 0 0 0-7.07-7.07l-3 3a5 5 0 0 0-.54 7.07" />
                  <path d="M5.16 11.75l-1.72 1.71a5 5 0 0 0 7.07 7.07l3-3a5 5 0 0 0 .54-7.07" />
                  <line x1="2" y1="2" x2="22" y2="22" />
                </svg>
                Disable Authentication
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================ */}
        {/* DISABLE CONFIRM */}
        {/* ============================================ */}
        {activated && showDisableConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.25 }}
            className="bg-white rounded-[14px] sm:rounded-[18px] border border-[#EAEAEA] p-4 sm:p-8"
            style={{ boxShadow: '0 12px 40px rgba(0,0,0,.05)' }}
          >
            <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div>
                <h2 className="text-[17px] sm:text-[20px] font-semibold text-[#0F172A]">Disable Authentication</h2>
                <p className="text-xs sm:text-sm text-red-500 font-medium mt-0.5">This action removes 2FA from your account</p>
              </div>
            </div>

            <p className="text-[13px] sm:text-[15px] text-[#475569] leading-relaxed sm:leading-[1.7] mb-4 sm:mb-6">
              Disabling Google Authenticator will <strong className="text-red-600">remove two-factor protection</strong> from your admin account. You will be able to log in using only your password until you set it up again.
            </p>

            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
              <button
                onClick={() => setShowDisableConfirm(false)}
                className="flex-1 h-10 sm:h-12 px-4 sm:px-5 rounded-xl text-[13px] sm:text-[14px] font-semibold text-[#475569] bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] hover:border-[#CBD5E1] transition-all duration-200 active:scale-[0.98]"
              >
                Keep Active
              </button>
              <button
                onClick={handleDisable}
                disabled={actionLoading}
                className="flex-1 h-10 sm:h-12 px-4 sm:px-5 rounded-xl text-[13px] sm:text-[14px] font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-all duration-200 shadow-sm flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {actionLoading ? (
                  <>
                    <Spinner className="w-4 h-4" />
                    Disabling...
                  </>
                ) : 'Yes, Disable'}
              </button>
            </div>
          </motion.div>
        )}

        {/* ============================================ */}
        {/* NOT CONNECTED STATE */}
        {/* ============================================ */}
        {!activated && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            {/* Collapsed — Not Connected Card */}
            {!showSetup && (
              <div
                className="bg-white rounded-[14px] sm:rounded-[18px] border border-[#EAEAEA] p-4 sm:p-8"
                style={{ boxShadow: '0 12px 40px rgba(0,0,0,.05)' }}
              >
                {/* Status Badge */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FFF7ED] border border-[#FED7AA] mb-4 sm:mb-6">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]" />
                  <span className="text-[10px] sm:text-xs font-semibold text-[#9A3412] tracking-wide uppercase">Not Connected</span>
                </div>

                {/* Icon + Heading */}
                <div className="flex items-center gap-3 sm:gap-4 mb-3 sm:mb-5">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[#FFF7ED] border border-[#FED7AA] flex items-center justify-center shrink-0">
                    <svg className="w-5 h-5 sm:w-6 sm:h-6 text-[#F97316]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-[17px] sm:text-[22px] font-semibold text-[#0F172A]">Authenticator Not Active</h2>
                    <p className="text-xs sm:text-sm text-[#9A3412] font-medium mt-0.5">Setup recommended</p>
                  </div>
                </div>

                <p className="text-[13px] sm:text-[15px] text-[#475569] leading-relaxed sm:leading-[1.7] mb-5 sm:mb-7">
                  Secure your administrator account with two-factor authentication. Once enabled, every login will require a verification code from Google Authenticator.
                </p>

                <button
                  onClick={() => setShowSetup(true)}
                  className="w-full inline-flex items-center justify-center gap-2 h-10 sm:h-12 px-5 rounded-xl text-[13px] sm:text-[14px] font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] transition-all duration-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Connect Authenticator
                </button>
              </div>
            )}

            {/* Expanded Setup */}
            {showSetup && (
              <div className="space-y-3 sm:space-y-5">
                {/* Steps */}
                <div
                  className="bg-white rounded-[14px] sm:rounded-[18px] border border-[#EAEAEA] p-4 sm:p-8"
                  style={{ boxShadow: '0 12px 40px rgba(0,0,0,.05)' }}
                >
                  <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#0F172A] mb-3 sm:mb-4 flex items-center gap-2.5">
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#3B82F6] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    How to connect
                  </h3>
                  <ol className="text-[13px] sm:text-[15px] text-[#475569] space-y-2 sm:space-y-3 list-none">
                    {[
                      'Install Google Authenticator on your phone.',
                      'Scan the QR code below.',
                      'Enter the 6-digit code to verify and activate.'
                    ].map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 sm:gap-3">
                        <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-center text-[10px] sm:text-[11px] font-bold text-[#3B82F6] shrink-0 mt-0.5">{i + 1}</span>
                        <span className="leading-relaxed sm:leading-[1.7]">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* QR Code */}
                <div
                  className="bg-white rounded-[14px] sm:rounded-[18px] border border-[#EAEAEA] p-4 sm:p-8"
                  style={{ boxShadow: '0 12px 40px rgba(0,0,0,.05)' }}
                >
                  <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#0F172A] mb-3 sm:mb-5 text-center">Scan QR Code</h3>

                  {qrCode ? (
                    <div className="flex flex-col items-center">
                      <div className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] border border-[#F1F5F9]">
                        <img
                          src={qrCode}
                          alt="Google Authenticator QR Code"
                          className="w-[160px] h-[160px] sm:w-[240px] sm:h-[240px] object-contain"
                          draggable={false}
                        />
                      </div>

                      {/* Secret */}
                      <div className="w-full max-w-sm mt-4 sm:mt-6">
                        <p className="text-[10px] sm:text-[11px] text-[#94A3B8] text-center mb-1.5 sm:mb-2 uppercase tracking-wider font-bold">Manual Entry Key</p>
                        <div className="flex items-center justify-center bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] px-3 sm:px-4 py-2.5 sm:py-3">
                          <code className="text-[12px] sm:text-sm font-mono text-[#334155] tracking-[0.08em] select-all break-all">{secret}</code>
                        </div>
                        <button
                          onClick={handleCopySecret}
                          className="mt-2.5 sm:mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 sm:py-2.5 rounded-xl text-[12px] sm:text-[13px] font-medium text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] hover:text-[#3B82F6] hover:border-[#BFDBFE] hover:bg-[#EFF6FF] transition-all duration-200"
                        >
                          {copied ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-[#22C55E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              <span className="text-[#22C55E]">Copied!</span>
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
                    <div className="flex flex-col items-center py-8 sm:py-12">
                      <div className="w-7 h-7 sm:w-9 sm:h-9 border-2 border-[#E2E8F0] border-t-[#3B82F6] rounded-full animate-spin mb-2.5 sm:mb-3" />
                      <p className="text-xs sm:text-sm text-[#94A3B8]">Generating QR code...</p>
                    </div>
                  )}
                </div>

                {/* Verify */}
                <div
                  className="bg-white rounded-[14px] sm:rounded-[18px] border border-[#EAEAEA] p-4 sm:p-8"
                  style={{ boxShadow: '0 12px 40px rgba(0,0,0,.05)' }}
                >
                  <h3 className="text-[15px] sm:text-[16px] font-semibold text-[#0F172A] mb-0.5 sm:mb-1 text-center">Verify</h3>
                  <p className="text-xs sm:text-sm text-[#64748B] text-center mb-4 sm:mb-6">Enter the 6-digit code from Google Authenticator</p>

                  <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
                    {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                      <OtpBox
                        key={i}
                        inputRef={(el) => { otpRefs.current[i] = el }}
                        value={otpDigits[i]}
                        onChange={(v) => handleOtpChange(i, v)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={handleOtpPaste}
                        autoFocus={i === 0}
                      />
                    ))}
                  </div>

                  <button
                    onClick={handleVerify}
                    disabled={verifying || otpDigits.some(d => !d)}
                    className="w-full h-10 sm:h-12 px-5 rounded-xl text-[13px] sm:text-[14px] font-semibold text-white bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    {verifying ? (
                      <>
                        <Spinner className="w-4 h-4" />
                        Verifying...
                      </>
                    ) : 'Verify & Activate'}
                  </button>
                </div>

                {/* Collapse */}
                <button
                  onClick={() => {
                    setShowSetup(false)
                    setOtpDigits(Array(OTP_LENGTH).fill(''))
                    setError('')
                  }}
                  className="w-full text-center text-sm text-[#94A3B8] hover:text-[#3B82F6] transition-colors py-2"
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
