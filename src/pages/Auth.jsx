import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import SafeImage from '../components/SafeImage.jsx'
import { useTheme } from '../ThemeContext.jsx'
import Header from '../components/Header.jsx'
import { supabase } from '../utils/supabaseClient'

import LoadingScreen from '../components/LoadingScreen.jsx'
import AbuseFieldWrapper from '../components/AbuseFieldWrapper.jsx'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useUser } from '../UserContext.jsx'
import { generateUniqueUsername } from '../utils/helpers.js'
import { SignOutModal } from '../components/SignOutModal.jsx'
import { ConfirmIdentityOTP } from '../components/ConfirmIdentityOTP.jsx'

const baseContentVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 }
}

const baseContentTransition = { type: "tween", ease: "easeOut", duration: 0.3 }

const cardLayoutTransition = { type: "tween", ease: "easeOut", duration: 0.3 }

const OTP_DIGITS_COUNT = 6

function OtpDigitBox({ value, onChange, onPaste, onKeyDown, autoFocus, inputRef, error }) {
  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={1}
      aria-label={`Digit`}
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/\D/g, '')
        onChange(v.slice(-1))
      }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      autoFocus={autoFocus}
      className={`w-[44px] h-[52px] sm:w-[48px] sm:h-[56px] text-center text-xl sm:text-[22px] font-mono font-semibold text-on-background bg-surface-container-lowest border rounded-xl outline-none transition-all duration-150 ${
        error
          ? 'border-error/60 focus:border-error focus:ring-[4px] focus:ring-error/15'
          : 'border-outline-variant/25 focus:border-primary focus:ring-[4px] focus:ring-primary/15'
      }`}
    />
  )
}

const otpShakeKeyframes = `
@keyframes otp-shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
  20%, 40%, 60%, 80% { transform: translateX(4px); }
}
`

function Auth({ onNavigate, initialMode = 'login' }) {
  const { theme } = useTheme()
  const navigate = useNavigate()
  const [redirectTo, setRedirectTo] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('redirect') || ''
  })
  const [authMode, setAuthMode] = useState(initialMode) // 'login' | 'register' | 'forgot' | 'reset-password'
  const [direction, setDirection] = useState(0) // -1 for left, 1 for right, 0 for vertical
  const [forgotStep, setForgotStep] = useState(1) // 1: enter email, 2: link sent confirmation
  const [isLoading, setIsLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading District...')
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [currentUser, setCurrentUser] = useCurrentUser()

  // prefers-reduced-motion detection
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e) => setPrefersReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const contentVariants = prefersReducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : baseContentVariants

  const contentTransition = prefersReducedMotion
    ? { duration: 0.1 }
    : baseContentTransition

  const [resetToken, setResetToken] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('token') || ''
  })
  const [isTokenValid, setIsTokenValid] = useState(null) // null = loading/unchecked, true = valid, false = invalid

  // OTP Cooldown State (in seconds)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)

  // Registration Spam Protection Cooldown (in seconds)
  const [regSpamCooldownSeconds, setRegSpamCooldownSeconds] = useState(0)

  // Show/Hide Password toggles
  const [showPasswordLogin, setShowPasswordLogin] = useState(false)
  const [showPasswordRegister, setShowPasswordRegister] = useState(false)
  const [showPasswordForgot, setShowPasswordForgot] = useState(false)

  // Login form state
  const [loginForm, setLoginForm] = useState({ 
    email: '', // email or username
    password: '', 
    rememberMe: true 
  })

  // Admin TOTP login state
  const [isAdminLogin, setIsAdminLogin] = useState(false)
  const [adminOtp, setAdminOtp] = useState('')
  const [adminTotpNotConfigured, setAdminTotpNotConfigured] = useState(false)
  const adminTotpCheckRef = useRef(null)
  const otpBoxRefs = useRef([])
  const [otpShake, setOtpShake] = useState(false)

  const handleOtpBoxChange = (index, digit) => {
    if (digit.length > 1) return
    const next = adminOtp.split('')
    while (next.length < OTP_DIGITS_COUNT) next.push('')
    next[index] = digit
    const joined = next.join('')
    setAdminOtp(joined.replace(/ /g, ''))
    if (digit && index < OTP_DIGITS_COUNT - 1) {
      otpBoxRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpBoxKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !adminOtp[index] && index > 0) {
      otpBoxRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault()
      otpBoxRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < OTP_DIGITS_COUNT - 1) {
      e.preventDefault()
      otpBoxRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpBoxPaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_DIGITS_COUNT)
    if (!pasted) return
    setAdminOtp(pasted)
    const focusIdx = Math.min(pasted.length, OTP_DIGITS_COUNT - 1)
    otpBoxRefs.current[focusIdx]?.focus()
  }

  const triggerOtpShake = () => {
    setOtpShake(true)
    setTimeout(() => setOtpShake(false), 600)
  }

  // Check TOTP status when admin username is detected
  const checkAdminTotpStatus = useCallback(async (emailValue) => {
    const isAdmin = emailValue.toLowerCase() === 'admin' || emailValue.toLowerCase() === 'matchdistrict.in@gmail.com'
    if (!isAdmin) {
      setIsAdminLogin(false)
      setAdminTotpNotConfigured(false)
      return
    }
    setIsAdminLogin(true)
    // Debounce: clear previous pending check
    if (adminTotpCheckRef.current) clearTimeout(adminTotpCheckRef.current)
    adminTotpCheckRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/totp-status')
        const data = await res.json()
        if (data.success) {
          setAdminTotpNotConfigured(!data.totpActivated)
        }
      } catch {
        setAdminTotpNotConfigured(false)
      }
    }, 300)
  }, [])

  // Account Switcher state
  const [loginPageState, setLoginPageState] = useState('loading')
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [showSignOutModal, setShowSignOutModal] = useState(false)
  const [activeMenuId, setActiveMenuId] = useState(null)
  const [rememberedAccounts, setRememberedAccounts] = useState([])
  const menuRef = useRef(null)
  const { signOut } = useUser()
  const REMEMBERED_KEY = 'md_remembered_accounts'

  // Register form state (without browser-side persistence as requested)
  const [regForm, setRegForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false
  })
  
  // Abuse tracking for register fields
  const [regNameAbuse, setRegNameAbuse] = useState(false)
  const [isFormEditedSinceLastSubmit, setIsFormEditedSinceLastSubmit] = useState(true)
  const [backWithoutEditCount, setBackWithoutEditCount] = useState(0)
  const [regAttempts, setRegAttempts] = useState(0)
  const [hasFreeChance, setHasFreeChance] = useState(false)

  // Forgot password form state
  const [forgotForm, setForgotForm] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  })

  // OTP Verification State (used for registration otp step)
  const [showOtpModal, setShowOtpModal] = useState(false)
  const [otpExpiry, setOtpExpiry] = useState(null)
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', ''])
  const [otpSent, setOtpSent] = useState(false)

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 4000)
  }

  // OTP Cooldown Timer Effect
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldownSeconds])

  // Registration Spam Protection Cooldown Timer Effect
  useEffect(() => {
    if (regSpamCooldownSeconds <= 0) return
    const timer = setInterval(() => {
      setRegSpamCooldownSeconds(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          setHasFreeChance(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [regSpamCooldownSeconds])

  // Helper to start local OTP cooldown
  const startCooldown = (seconds) => {
    setCooldownSeconds(seconds)
  }

  // Helper to start local Registration Spam cooldown
  const startRegSpamCooldown = (seconds) => {
    setRegSpamCooldownSeconds(seconds)
  }

  // Parse reset token from search params or sync when initialMode prop changes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      setResetToken(token)
      setAuthMode('reset-password')
      
      // Validate reset token on mount
      setLoadingMessage('Loading District...')
      setIsLoading(true)
      fetch(`/api/auth/validate-reset-token?token=${token}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.valid) {
            setIsTokenValid(true)
          } else {
            setIsTokenValid(false)
            triggerToast(data.message || 'The password reset link is invalid or has expired.')
          }
        })
        .catch(() => {
          setIsTokenValid(false)
          triggerToast('Failed to validate password reset link.')
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else if (initialMode) {
      if (authMode === 'login' && initialMode === 'register') {
        setDirection(1)
      } else if (authMode === 'register' && initialMode === 'login') {
        setDirection(-1)
      }
      setAuthMode(initialMode)
    }
  }, [initialMode])

  // Handle Google OAuth session sync
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        setIsLoading(true)
        try {
          // Pull user profile directly from server-side database using a single query
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single()
          
          if (profile) {
            setCurrentUser(profile)
            triggerToast(`Welcome back, ${profile.name}!`)
          } else {
            // First-time social sign-in: register local database profile
            const nameFromMetadata = session.user.user_metadata?.full_name || session.user.user_metadata?.name
            const autoGamerTag = '@' + generateUniqueUsername(nameFromMetadata || session.user.email.split('@')[0])
            const newUser = {
              name: nameFromMetadata || session.user.email.split('@')[0],
              email: session.user.email,
              password: 'OAuthAccountPasswordPlaceholder_' + Math.random().toString(36).slice(-8),
              gamerTag: autoGamerTag
            }
            
            const regRes = await fetch('/api/auth/register', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(newUser)
            })
            const regData = await regRes.json()
            
            if (regRes.ok && regData.success) {
              const { data: createdProfile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', session.user.id)
                .single()
              
              if (createdProfile) {
                setCurrentUser(createdProfile)
              }
              triggerToast('Account registered successfully via Google!')
            } else {
              triggerToast('Failed to initialize profile record. Please configure registration.')
            }
          }
          
          setTimeout(() => {
            setIsLoading(false)
            onNavigate && onNavigate('home')
          }, 2000)
        } catch (e) {
          setIsLoading(false)
          triggerToast('Error synchronizing database profile.')
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [onNavigate])

  // Google OAuth triggers
  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login'
        }
      })
      if (error) {
        setIsLoading(false)
        triggerToast(error.message || 'Google authentication failed.')
      }
    } catch (err) {
      setIsLoading(false)
      triggerToast('Google authentication failed. Please try again.')
    }
  }

  // Common OTP sending utility (used for registration)
  const sendOtp = async (email) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString()
    const expiry = Date.now() + 5 * 60 * 1000 // 5 minutes
    
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, expiry })
    })
    
    const data = await res.json()
    if (!res.ok) {
      throw {
        status: res.status,
        message: data.message || 'Failed to send OTP',
        error: data.error,
        secondsLeft: data.secondsLeft || 180
      }
    }
    
    return { otp, expiry, emailSent: data.emailSent !== false }
  }

  // --- Real-time Validation Rules & Helper ---
  const checkPasswordStrength = (pass) => {
    const hasMinLen = pass.length >= 6
    const hasAlphabet = /[A-Za-z]/.test(pass)
    const hasNumber = /[0-9]/.test(pass)
    const hasSymbol = /[^A-Za-z0-9]/.test(pass)
    return { hasMinLen, hasAlphabet, hasNumber, hasSymbol }
  }

  const renderPasswordRequirements = (pass) => {
    const { hasMinLen, hasAlphabet, hasNumber, hasSymbol } = checkPasswordStrength(pass)
    return (
      <div className="flex flex-col gap-1 mt-1.5 text-[11px] font-medium leading-tight pl-1">
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${hasMinLen ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={hasMinLen ? 'text-emerald-400' : 'text-red-400'}>At least 6 characters</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${hasAlphabet ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={hasAlphabet ? 'text-emerald-400' : 'text-red-400'}>Contains alphabets (A-Z, a-z)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${hasNumber ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={hasNumber ? 'text-emerald-400' : 'text-red-400'}>Contains a number (0-9)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${hasSymbol ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className={hasSymbol ? 'text-emerald-400' : 'text-red-400'}>Contains a symbol (e.g., !@#$%^&*)</span>
        </div>
      </div>
    )
  }

  // Login Validation
  const isLoginFormValid = loginForm.email.trim().length > 0 && (
    isAdminLogin
      ? (adminTotpNotConfigured ? loginForm.password.length > 0 : adminOtp.length === 6)
      : loginForm.password.length > 0
  )

  // Register Validation
  const isNameValid = regForm.name.trim().length > 0 && regForm.name.trim().length <= 20 && /^[A-Za-z\s]+$/.test(regForm.name)
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regForm.email)
  
  const regPassStrength = checkPasswordStrength(regForm.password)
  const isPasswordValid = regPassStrength.hasMinLen && regPassStrength.hasAlphabet && regPassStrength.hasNumber && regPassStrength.hasSymbol
  const isConfirmPasswordValid = regForm.confirmPassword === regForm.password

  const isRegisterFormValid = 
    isNameValid &&
    isEmailValid &&
    isPasswordValid &&
    isConfirmPasswordValid &&
    regForm.agreeTerms &&
    !regNameAbuse

  // Forgot Password Validation
  const isForgotEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(forgotForm.email)
  const forgotPassStrength = checkPasswordStrength(forgotForm.password)
  const isForgotResetValid = forgotPassStrength.hasMinLen && forgotPassStrength.hasAlphabet && forgotPassStrength.hasNumber && forgotPassStrength.hasSymbol && forgotForm.confirmPassword === forgotForm.password

  // --- Submit Handlers ---

  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    if (!isLoginFormValid) return

    const isEmailAdmin = (loginForm.email || '').toLowerCase() === 'admin' || 
                          (loginForm.email || '').toLowerCase() === 'matchdistrict.in@gmail.com'

    // Admin TOTP login flow
    if (isEmailAdmin) {
      // If TOTP is not configured, use password
      const otpValue = adminTotpNotConfigured ? loginForm.password : adminOtp
      if (adminTotpNotConfigured) {
        // Password flow
        if (!loginForm.password || loginForm.password.length < 1) {
          triggerToast('Please enter your admin password.')
          return
        }
      } else {
        // TOTP flow
        if (!adminOtp || adminOtp.length !== 6) {
          triggerToast('Please enter a valid 6-digit Google Authenticator code.')
          return
        }
      }
      setLoadingMessage('Verifying admin credentials...')
      setIsLoading(true)
      try {
        const body = adminTotpNotConfigured
          ? { username: 'admin', password: loginForm.password }
          : { username: 'admin', otp: adminOtp }
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })
        const data = await res.json()
        if (res.ok && data.success) {
          if (data.encryptedSession) {
            localStorage.setItem('md_persistent_session', data.encryptedSession)
          }
          setCurrentUser(data.user)

          // If TOTP setup is required, redirect to setup page
          if (data.setupRequired) {
            triggerToast('Please set up Google Authenticator for secure access.')
            setTimeout(() => {
              setIsLoading(false)
              navigate('/admin/security/authenticator', { replace: true })
            }, 1500)
          } else {
            triggerToast(data.message || 'Welcome back, Admin! Redirecting...')
            setTimeout(() => {
              setIsLoading(false)
              if (redirectTo) {
                navigate(redirectTo, { replace: true })
              } else {
                onNavigate && onNavigate('admin')
              }
            }, 2000)
          }
        } else {
          setIsLoading(false)
          // If error indicates TOTP not configured, show password field
          if (data.error === 'TOTP_NOT_CONFIGURED' || data.error === 'PASSWORD_REQUIRED') {
            setAdminTotpNotConfigured(true)
          }
          if (data.error === 'INVALID_OTP') {
            setAdminOtp('')
            triggerOtpShake()
            otpBoxRefs.current[0]?.focus()
          }
          triggerToast(data.message || data.error || 'Invalid credentials.')
        }
      } catch (err) {
        setIsLoading(false)
        triggerToast('Unable to communicate with the authentication server.')
      }
      return
    }

    // Regular user login flow
    setLoadingMessage('Loading District...')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginForm.email, password: loginForm.password })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (data.encryptedSession) {
          localStorage.setItem('md_persistent_session', data.encryptedSession)
        }
        const loginRoles = data.user?.roles || (data.user?.role ? [data.user.role] : []);
        if (loginRoles.includes('admin')) {
          setCurrentUser(data.user)
          triggerToast(data.message || 'Welcome back, Admin! Redirecting...')
          setTimeout(() => {
            setIsLoading(false)
            if (redirectTo) {
              navigate(redirectTo, { replace: true })
            } else {
              onNavigate && onNavigate('admin')
            }
          }, 2000)
          return
        }

        // Establish client-side Supabase session for persistence
        // If the email is unconfirmed on Supabase, it will fail.
        // We log the warning but proceed to log the user in locally anyway.
        try {
          const { error: authError } = await supabase.auth.signInWithPassword({
            email: data.user.email,
            password: loginForm.password
          })
          if (authError) {
            console.warn('Client-side Supabase session login skipped (unconfirmed/pending):', authError.message)
          }
        } catch (supErr) {
          console.warn('Client-side Supabase session login exception:', supErr)
        }

        if (loginForm.rememberMe) addRememberedAccount(data.user)
        setCurrentUser(data.user)
        triggerToast(data.message || 'Welcome back! Redirecting...')
        setTimeout(() => {
          setIsLoading(false)
          if (redirectTo) {
            navigate(redirectTo, { replace: true })
          } else {
            onNavigate && onNavigate('home')
          }
        }, 2000)
      } else {
        setIsLoading(false)
        triggerToast(data.error || 'Incorrect email/username or password.')
      }
    } catch (err) {
      // Fallback directly to client-side Supabase authentication if server is offline
      try {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: loginForm.email,
          password: loginForm.password
        })

        if (authError) {
          setIsLoading(false)
          triggerToast(authError.message || 'Incorrect email/username or password.')
          return
        }

        const user = authData.user
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (profileError || !profile) {
          setIsLoading(false)
          triggerToast(profileError?.message || 'Failed to retrieve user profile.')
          return
        }

        if (loginForm.rememberMe) addRememberedAccount(profile)
        setCurrentUser(profile)
        triggerToast('Welcome back! Redirecting...')
        setTimeout(() => {
          setIsLoading(false)
          if (redirectTo) {
            navigate(redirectTo, { replace: true })
          } else {
            onNavigate && onNavigate(profile.role === 'admin' ? 'admin' : 'home')
          }
        }, 2000)
      } catch (fallbackErr) {
        setIsLoading(false)
        triggerToast('Server connection failed. Please try again.')
      }
    }
  }

  const handleRegisterSubmit = async (e) => {
    e.preventDefault()
    if (!isRegisterFormValid) return

    if (regSpamCooldownSeconds > 0) return

    const nextAttempts = regAttempts + 1
    setRegAttempts(nextAttempts)

    let durationSeconds = 0
    if (hasFreeChance) {
      setHasFreeChance(false)
    } else {
      if (nextAttempts >= 3) {
        durationSeconds = 59
        if (nextAttempts === 4) durationSeconds = 120
        else if (nextAttempts === 5) durationSeconds = 300
        else if (nextAttempts >= 6) durationSeconds = 600
      }
    }

    if (durationSeconds > 0) {
      startRegSpamCooldown(durationSeconds)
    }

    setLoadingMessage('Processing...')
    setIsLoading(true)
    try {
      const autoGamerTag = '@' + generateUniqueUsername(regForm.name)
      const tempUser = {
        name: regForm.name,
        email: regForm.email,
        password: regForm.password,
        gamerTag: autoGamerTag,
        role: 'player',
        agreeTerms: regForm.agreeTerms
      }

      const res = await fetch('/api/auth/register-temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tempUser)
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setIsFormEditedSinceLastSubmit(false)
        setOtpDigits(['', '', '', '', '', ''])
        
        // Auto-request OTP code immediately on registration submit
        try {
          const { expiry } = await sendOtp(regForm.email)
          setOtpExpiry(expiry)
          setOtpSent(true)
          startCooldown(180)
        } catch (otpErr) {
          if (otpErr.error === 'TOO_MANY_REQUESTS' && otpErr.secondsLeft) {
            startCooldown(otpErr.secondsLeft)
          }
          triggerToast(otpErr.message || 'OTP limit hit. Please request manually.')
        }

        setDirection(0)
        setShowOtpModal(true)
      } else {
        triggerToast(data.error || data.message || 'Registration failed. Please try again.')
      }
    } catch (err) {
      console.error('REGISTER_ERROR', err)
      triggerToast(err?.message ? `Registration failed: ${err.message}` : 'Registration failed. Check connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRequestOtp = async () => {
    if (cooldownSeconds > 0 || regSpamCooldownSeconds > 0) return

    setLoadingMessage('Sending the code...')
    setIsLoading(true)
    try {
      const { expiry } = await sendOtp(regForm.email)
      setOtpExpiry(expiry)
      setOtpDigits(['', '', '', '', '', ''])
      setOtpSent(true)
      startCooldown(180)
    } catch (err) {
      if (err.error === 'TOO_MANY_REQUESTS' && err.secondsLeft) {
        startCooldown(err.secondsLeft)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpVerification = async (enteredOtp) => {
    if (Date.now() > otpExpiry) {
      triggerToast('OTP code has expired. Please request a new one.')
      return
    }

    setLoadingMessage('Please wait while your account is being created...')
    setIsLoading(true)
    
    try {
      const verifyRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regForm.email, otp: enteredOtp })
      })
      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.success) {
        setIsLoading(false)
        triggerToast(verifyData.error || verifyData.message || 'Invalid verification code.')
        return
      }

      // Complete registration on the server using temp details
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regForm.email, password: regForm.password })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        if (data.encryptedSession) {
          localStorage.setItem('md_persistent_session', data.encryptedSession)
        }
        // Sign in via Supabase
        // If email confirmation is enabled, this will fail. We bypass the error to log the user in locally.
        try {
          await supabase.auth.signInWithPassword({
            email: regForm.email,
            password: regForm.password
          })
        } catch (supErr) {
          console.warn('Client-side Supabase session login skipped on signup:', supErr)
        }

        if (data.user) {
          setCurrentUser(data.user)
        }

        setTimeout(() => {
          setIsLoading(false)
          onNavigate && onNavigate('profile')
        }, 2000)
      } else {
        setIsLoading(false)
        triggerToast(data.error || data.message || 'Failed to complete registration.')
      }
    } catch (err) {
      setIsLoading(false)
      triggerToast('Verification failed. Check connection.')
    }
  }

  const handleResendOtp = async () => {
    if (cooldownSeconds > 0 || regSpamCooldownSeconds > 0) {
      return
    }

    const targetEmail = regForm.email
    setLoadingMessage('Sending the code...')
    setIsLoading(true)
    try {
      const { expiry } = await sendOtp(targetEmail)
      setOtpExpiry(expiry)
      setOtpDigits(['', '', '', '', '', ''])
      startCooldown(180)
    } catch (err) {
      if (err.error === 'TOO_MANY_REQUESTS' && err.secondsLeft) {
        startCooldown(err.secondsLeft)
      }
    } finally {
      setIsLoading(false)
    }
  }

  // --- Forgot Password Handlers ---

  const handleForgotEmailSubmit = async (e) => {
    e.preventDefault()
    if (!isForgotEmailValid) return

    setLoadingMessage('Loading District...')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotForm.email })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setDirection(0)
        setForgotStep(2)
        triggerToast(`Password reset link dispatched to ${forgotForm.email}`)
      } else {
        triggerToast(data.error || 'Failed to send reset link.')
      }
    } catch (err) {
      triggerToast('Failed to send reset email. Check server connection.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotResetSubmit = async (e) => {
    e.preventDefault()
    if (!isForgotResetValid) return

    setLoadingMessage('Loading District...')
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: forgotForm.password })
      })
      const data = await res.json()
      if (res.ok && data.success) {
        triggerToast('Password updated successfully! Redirecting to login...')
        setTimeout(() => {
          setDirection(0)
          setAuthMode('login')
          setForgotStep(1)
          setForgotForm({ email: '', password: '', confirmPassword: '' })
          onNavigate && onNavigate('login')
        }, 2000)
      } else {
        triggerToast(data.error || 'Failed to reset password. Link may be invalid or expired.')
      }
    } catch (err) {
      triggerToast('Server connection failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // --- Account Switcher Helpers ---

  const getRememberedAccounts = () => {
    try {
      const raw = localStorage.getItem(REMEMBERED_KEY)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  }

  const saveRememberedAccounts = (accounts) => {
    try { localStorage.setItem(REMEMBERED_KEY, JSON.stringify(accounts)) } catch {}
  }

  const addRememberedAccount = (user) => {
    const accounts = getRememberedAccounts().filter(a => a.id !== user.id)
    const avatarUrl = user.avatar || user.orgImage || user.avatar_url || user.profile_image || ''
    accounts.unshift({
      id: user.id,
      name: user.name || user.gamerTag || 'Player',
      email: user.email || '',
      username: user.gamerTag || '',
      avatar: avatarUrl,
      lastUsed: Date.now()
    })
    saveRememberedAccounts(accounts)
    setRememberedAccounts(accounts)
  }

  const removeRememberedAccount = (id) => {
    const accounts = getRememberedAccounts().filter(a => a.id !== id)
    saveRememberedAccounts(accounts)
    setRememberedAccounts(accounts)
  }

  // Refresh remembered account avatars from currentUser data
  useEffect(() => {
    if (!currentUser) return
    const accounts = getRememberedAccounts()
    let changed = false
    const updated = accounts.map(a => {
      if (a.id === currentUser.id && (currentUser.avatar || currentUser.orgImage) && a.avatar !== (currentUser.avatar || currentUser.orgImage)) {
        changed = true
        return { ...a, avatar: currentUser.avatar || currentUser.orgImage || a.avatar, name: currentUser.name || currentUser.gamerTag || a.name, email: currentUser.email || a.email }
      }
      return a
    })
    if (changed) {
      saveRememberedAccounts(updated)
      setRememberedAccounts(updated)
    }
  }, [currentUser])

  // Determine initial login page state
  const userLoadResolved = useRef(false)

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null)
      }
    }
    if (activeMenuId) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [activeMenuId])

  useEffect(() => {
    if (currentUser === undefined) return // still loading
    if (userLoadResolved.current) return
    userLoadResolved.current = true
    const accounts = getRememberedAccounts()
    setRememberedAccounts(accounts)
    if (currentUser) {
      setLoginPageState('authenticated')
    } else if (accounts.length > 0) {
      setLoginPageState('account-picker')
    } else {
      setLoginPageState('login')
    }
  }, [currentUser])

  // --- Account Switcher Handlers ---

  const handleContinueAsUser = () => {
    onNavigate && onNavigate('home')
  }

  const handleSignOutClick = () => {
    setShowSignOutModal(true)
  }

  const handleSignOutConfirm = async (type) => {
    setShowSignOutModal(false)
    if (type === 'remove') {
      const accounts = getRememberedAccounts().filter(a => a.id !== currentUser?.id)
      saveRememberedAccounts(accounts)
      setRememberedAccounts(accounts)
    }
    await signOut()
  }

  const handleAccountSelect = (account) => {
    setSelectedAccount(account)
    setLoginForm({ ...loginForm, email: account.email || account.username, password: '', rememberMe: true })
    setLoginPageState('password-screen')
  }

  const handleUseAnotherAccount = () => {
    setSelectedAccount(null)
    setLoginForm({ ...loginForm, email: '', password: '', rememberMe: true })
    setLoginPageState('login')
  }

  const handleRemoveAccount = (id, e) => {
    e.stopPropagation()
    removeRememberedAccount(id)
    setActiveMenuId(null)
    const accounts = getRememberedAccounts()
    if (accounts.length === 0) {
      setLoginPageState('login')
    }
  }

  const handleMenuClick = (id, e) => {
    e.stopPropagation()
    setActiveMenuId(prev => prev === id ? null : id)
  }

  const handleContinueFromMenu = (account) => {
    setActiveMenuId(null)
    handleAccountSelect(account)
  }

  // Format last used time
  const formatLastUsed = (ts) => {
    if (!ts) return ''
    const diff = Date.now() - ts
    if (diff < 60000) return 'Just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    if (diff < 172800000) return 'Yesterday'
    return `${Math.floor(diff / 86400000)}d ago`
  }

  const isAccountActive = (accountId) => {
    return currentUser && String(currentUser.id) === String(accountId)
  }

  return (
    <div className="min-h-screen bg-background text-on-background font-body-md overflow-x-hidden selection:bg-primary/30 selection:text-primary transition-colors duration-300 flex flex-col justify-between">
      <style dangerouslySetInnerHTML={{ __html: otpShakeKeyframes }} />
      {/* Global Site Header */}
      <Header activePage="auth" onNavigate={onNavigate} />

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 right-4 left-4 sm:left-auto sm:top-6 sm:right-6 z-[100] bg-white dark:bg-[#07080C]/90 backdrop-blur-2xl border border-primary/25 text-slate-900 dark:text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl shadow-lg flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-lg">info</span>
            </div>
            <span className="font-bold text-sm tracking-tight">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <main className="relative flex-1 flex items-center justify-center px-4 pt-24 pb-12 sm:px-6 lg:px-8">
        {/* Background Ambient Blobs - Sleek Matte/Neon Glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/8 blur-[130px] rounded-full pointer-events-none -z-10" />

        {/* Auth Card wrapper */}
        <div className="w-full max-w-md relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
          <motion.div 
            layout
            transition={cardLayoutTransition}
            className="glass-card bg-[#07080C]/65 border border-white/10 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] dark:shadow-[0_0_40px_rgba(99,102,241,0.1)] relative overflow-hidden p-4"
          >
            {/* Loading Arena Overlay */}
            <AnimatePresence>
              {isLoading && <LoadingScreen message={loadingMessage} overlay={true} />}
            </AnimatePresence>

            {/* Header Content */}
            <AnimatePresence mode="wait">
              <motion.div
                key={authMode !== 'login' ? authMode : loginPageState === 'loading' ? 'loading-header' : loginPageState === 'authenticated' ? 'authenticated-header' : loginPageState === 'account-picker' ? 'account-picker-header' : showOtpModal ? "otp-header" : authMode}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="text-center space-y-1 mb-6"
              >
                <h1 className="font-display-lg text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                  {showOtpModal ? "Confirm Identity" : 
                   authMode === 'reset-password' ? (isTokenValid === false ? "Access Denied" : "Update Credentials") :
                   authMode === 'forgot' ? "Security Reset" : 
                   authMode !== 'login' ? (authMode === 'register' ? "Join District" : "Welcome Back") :
                   loginPageState === 'authenticated' ? "Already Signed In" :
                   loginPageState === 'account-picker' ? "Welcome Back" :
                   loginPageState === 'loading' ? "Loading" :
                   "Welcome Back"}
                </h1>
                <p className="text-xs text-on-surface-variant font-medium">
                  {showOtpModal ? (
                    otpSent ? "Enter the 6-digit verification code below." : "Verify your email to complete registration."
                  ) : authMode === 'reset-password' ? (
                    isTokenValid === false ? "Your session validation has failed." : "Establish your new terminal passcode."
                  ) : authMode === 'forgot' ? (
                    "Recover your command credentials via email dispatch."
                  ) : authMode !== 'login' ? (
                    authMode === 'register' ? "Register profiles for global majors." : "Submit terminal to compete."
                  ) : loginPageState === 'authenticated' ? (
                    "You are signed in. Continue to the arena or sign out."
                  ) : loginPageState === 'account-picker' ? (
                    "Choose an account to continue to Match District."
                  ) : loginPageState === 'loading' ? (
                    "Checking authentication status..."
                  ) : authMode === 'login' ? (
                    "Submit terminal to compete."
                  ) : (
                    "Register profiles for global majors."
                  )}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Sliding Switch for Login/Register */}
            {!showOtpModal && authMode !== 'forgot' && authMode !== 'reset-password' && loginPageState !== 'loading' && loginPageState !== 'authenticated' && loginPageState !== 'password-screen' && (
              <div className="relative flex p-1 bg-slate-100 dark:bg-white/10 rounded-xl border border-slate-200 dark:border-white/5 w-full mb-6 shrink-0">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setDirection(-1); setAuthMode('login'); onNavigate && onNavigate('login'); }}
                  className={`relative z-10 flex-1 py-2.5 font-headline-md text-[11px] font-black tracking-[0.08em] transition-colors duration-200 ${authMode === 'login' ? 'text-white' : 'text-slate-600 dark:text-on-surface-variant/70 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  LOG IN
                  {authMode === 'login' && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute inset-0 bg-primary rounded-lg -z-10 shadow-md shadow-primary/25"
                      transition={{ type: 'tween', ease: 'easeOut', duration: 0.25 }}
                    />
                  )}
                </motion.button>
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setDirection(1); setAuthMode('register'); onNavigate && onNavigate('register'); }}
                  className={`relative z-10 flex-1 py-2.5 font-headline-md text-[11px] font-black tracking-[0.08em] transition-colors duration-200 ${authMode === 'register' ? 'text-white' : 'text-slate-600 dark:text-on-surface-variant/70 hover:text-slate-900 dark:hover:text-white'}`}
                >
                  REGISTER
                  {authMode === 'register' && (
                    <motion.div 
                      layoutId="activeTab"
                      className="absolute inset-0 bg-primary rounded-lg -z-10 shadow-md shadow-primary/25"
                      transition={{ type: 'tween', ease: 'easeOut', duration: 0.25 }}
                    />
                  )}
                </motion.button>
              </div>
            )}

            <div className="relative">
            <AnimatePresence mode="popLayout" custom={direction}>
              {loginPageState === 'loading' ? (
                <motion.div
                  key="loading"
                  custom={0}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="flex items-center justify-center py-16"
                >
                  <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </motion.div>
              ) : showOtpModal ? (
                /* --- REGISTRATION OTP VERIFICATION VIEW --- */
                <motion.div 
                  key="otp"
                  custom={direction}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="w-full space-y-6 text-center"
                >
                  <form onSubmit={otpSent ? (e) => e.preventDefault() : handleRequestOtp} className="space-y-6 w-full">
                    {otpSent ? (
                      <ConfirmIdentityOTP
                        email={regForm.email}
                        onVerify={handleOtpVerification}
                        onBack={() => {
                          setShowOtpModal(false)
                          if (!isFormEditedSinceLastSubmit) {
                            setBackWithoutEditCount(prev => prev + 1)
                          }
                        }}
                      />
                    ) : (
                      <div className="space-y-6">
                        <div className="text-center py-4">
                          <p className="font-body-sm text-sm text-slate-900 dark:text-white font-bold">{regForm.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRequestOtp}
                          disabled={cooldownSeconds > 0 || isLoading || regSpamCooldownSeconds > 0}
                          className="w-full h-11 bg-primary hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 text-white rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_4px_12px_rgba(90,93,250,0.2)] flex items-center justify-center gap-1.5"
                        >
                          <span>
                            {regSpamCooldownSeconds > 0
                              ? `Spam Lock: Wait ${regSpamCooldownSeconds}s`
                              : cooldownSeconds > 0
                                ? `Request Code in ${Math.floor(cooldownSeconds / 60)}:${String(cooldownSeconds % 60).padStart(2, '0')}`
                                : 'Request Verification Code'}
                          </span>
                          <span className="material-symbols-outlined text-[18px]">send</span>
                        </button>
                      </div>
                    )}
                  </form>
                </motion.div>
              ) : authMode === 'forgot' ? (
                /* --- FORGOT PASSWORD FLOW PANELS --- */
                <motion.div 
                  key={`forgot-step-${forgotStep}`}
                  custom={direction}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="w-full"
                >
                  {forgotStep === 1 ? (
                    /* Forgot Step 1: Request reset link email */
                    <form onSubmit={handleForgotEmailSubmit} className="space-y-4 w-full">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Email Address</label>
                        <div className="relative group">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">mail</span>
                          <input 
                            type="email" 
                            placeholder="registered@email.com" 
                            value={forgotForm.email} 
                            onChange={(e) => setForgotForm({...forgotForm, email: e.target.value})} 
                            className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-4 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                            required 
                          />
                        </div>
                        {forgotForm.email && !isForgotEmailValid && (
                          <p className="text-red-500 text-[10px] font-bold">Enter a valid email address.</p>
                        )}
                      </div>

                      <div className="pt-2 flex flex-col gap-3">
                        <button 
                          type="submit" 
                          disabled={!isForgotEmailValid || isLoading}
                          className="w-full h-11 bg-primary hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl font-headline-md text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                        >
                          <span>Send Password Reset Link</span>
                          <span className="material-symbols-outlined text-[18px]">send</span>
                        </button>
                        <button 
                          type="button" 
                          onClick={() => { setDirection(0); setAuthMode('login'); setForgotStep(1); }}
                          className="text-center text-xs font-bold text-on-surface-variant/70 hover:text-primary transition-colors"
                        >
                          Cancel & Return
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Forgot Step 2: Confirmation that reset link email was sent */
                    <div className="text-center space-y-4 py-4">
                      <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
                        <span className="material-symbols-outlined text-3xl">mark_email_read</span>
                      </div>
                      <h3 className="text-slate-900 dark:text-white font-bold text-sm">Reset Link Dispatched</h3>
                      <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                        A secure password reset link has been sent to:<br />
                        <span className="text-primary font-bold">{forgotForm.email}</span>
                      </p>
                      <p className="font-body-sm text-[10px] text-on-surface-variant/60 leading-relaxed">
                        The link is valid for <strong>1 hour</strong>. Once utilized, it will automatically deactivate. If you don't receive it shortly, please verify your spam folder.
                      </p>
                      <button 
                        type="button" 
                        onClick={() => { setDirection(0); setAuthMode('login'); setForgotStep(1); setForgotForm({ email: '', password: '', confirmPassword: '' }); }}
                        className="w-full h-11 bg-white/5 border border-white/10 hover:bg-white/10 active:scale-[0.98] text-slate-900 dark:text-white rounded-xl font-headline-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-4"
                      >
                        <span>Return to Login</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              ) : authMode === 'reset-password' ? (
                /* --- RESET PASSWORD DIRECT LINK VIEW --- */
                isTokenValid === false ? (
                  /* --- INVALID OR EXPIRED LINK VIEW --- */
                  <motion.div 
                    key="invalid-link"
                    custom={direction}
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={contentTransition}
                    className="w-full text-center space-y-6 py-6"
                  >
                    <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto animate-pulse">
                      <span className="material-symbols-outlined text-3xl">gavel</span>
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-slate-900 dark:text-white font-bold text-sm tracking-tight uppercase">Access Denied</h3>
                      <p className="font-body-sm text-xs text-on-surface-variant leading-relaxed">
                        This password reset authorization link is invalid, expired, or has already been utilized.
                      </p>
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setDirection(0); setAuthMode('login'); onNavigate && onNavigate('login'); }}
                      className="w-full h-11 bg-primary hover:bg-primary/95 active:scale-[0.98] text-white rounded-xl font-headline-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(90,93,250,0.15)]"
                    >
                      <span>Return to Login Page</span>
                    </button>
                  </motion.div>
                ) : (
                  /* --- VALID TOKEN RESET FORM --- */
                  <motion.div 
                    key="reset-password-form"
                    custom={direction}
                    variants={contentVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    transition={contentTransition}
                    className="w-full"
                  >
                    <form onSubmit={handleForgotResetSubmit} className="space-y-4 w-full">
                      <div className="space-y-3">
                        <div className="space-y-1">
                          <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">New Password</label>
                          <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">lock</span>
                            <input 
                              type={showPasswordForgot ? "text" : "password"} 
                              placeholder="Min 6 characters" 
                              value={forgotForm.password} 
                              onChange={(e) => setForgotForm({...forgotForm, password: e.target.value})} 
                              className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-11 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all" 
                              required 
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswordForgot(!showPasswordForgot)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors focus:outline-none"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {showPasswordForgot ? 'visibility_off' : 'visibility'}
                              </span>
                            </button>
                          </div>
                          {forgotForm.password && renderPasswordRequirements(forgotForm.password)}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Confirm New Password</label>
                          <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">shield</span>
                            <input 
                              type={showPasswordForgot ? "text" : "password"}
                              placeholder="Re-enter password" 
                              value={forgotForm.confirmPassword} 
                              onChange={(e) => setForgotForm({...forgotForm, confirmPassword: e.target.value})} 
                              className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-4 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all" 
                              required 
                            />
                          </div>
                          {forgotForm.confirmPassword && forgotForm.password !== forgotForm.confirmPassword && (
                            <p className="text-red-500 text-[10px] font-bold pl-1">Passwords do not match.</p>
                          )}
                        </div>
                      </div>

                      <button 
                        type="submit" 
                        disabled={!isForgotResetValid || isLoading}
                        className="w-full h-11 bg-primary hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl font-headline-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 mt-2"
                      >
                        <span>Apply New Password</span>
                        <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      </button>
                    </form>
                  </motion.div>
                )
              ) : authMode === 'login' && loginPageState === 'authenticated' ? (
                /* --- AUTHENTICATED VIEW --- */
                <motion.div
                  key="authenticated"
                  custom={direction}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="w-full"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 min-h-[64px] transition-shadow duration-200 hover:shadow-sm">
                      <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-primary/20">
                        {currentUser?.orgImage || currentUser?.avatar ? (
                          <img src={currentUser.orgImage || currentUser.avatar} alt="" className="avatar-img" />
                        ) : (
                          <span className="material-symbols-outlined text-primary text-2xl">person</span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{currentUser?.name || currentUser?.gamerTag || 'Player'}</p>
                          <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Active
                          </span>
                        </div>
                        <p className="text-[11px] sm:text-xs text-on-surface-variant truncate mt-0.5">{currentUser?.email || ''}</p>
                      </div>
                      <span className="material-symbols-outlined text-primary text-xl">verified</span>
                    </div>

                    <button
                      type="button"
                      onClick={handleContinueAsUser}
                      className="w-full h-12 bg-primary hover:bg-primary/95 active:scale-[0.98] text-white rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_4px_12px_rgba(90,93,250,0.2)] flex items-center justify-center gap-1.5"
                    >
                      <span>Continue as {currentUser?.name || currentUser?.gamerTag || 'User'}</span>
                      <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSignOutClick}
                      className="w-full h-12 bg-slate-50 dark:bg-white/5 border-2 border-slate-300 dark:border-white/10 hover:border-red-500/40 hover:text-red-500 active:scale-[0.98] rounded-xl font-headline-md text-xs font-bold text-slate-900 dark:text-white transition-all flex items-center justify-center gap-1.5 group"
                    >
                      <span className="material-symbols-outlined text-[18px] group-hover:text-red-500">logout</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </motion.div>
              ) : authMode === 'login' && loginPageState === 'account-picker' ? (
                /* --- ACCOUNT PICKER VIEW --- */
                <motion.div
                  key="account-picker"
                  custom={direction}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="w-full"
                >
                  <div className="space-y-2.5">
                    {rememberedAccounts.map((account) => (
                      <div key={account.id} className="relative">
                        <button
                          type="button"
                          onClick={() => handleAccountSelect(account)}
                          className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl bg-white/5 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-white/[0.08] active:scale-[0.99] transition-all text-left relative min-h-[64px] shadow-sm hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none duration-200"
                        >
                          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
                            {account.avatar ? (
                              <img src={account.avatar} alt="" className="avatar-img" />
                            ) : (
                              <span className="material-symbols-outlined text-primary text-2xl">person</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-[15px] sm:text-base text-slate-900 dark:text-white truncate">{account.name}</p>
                              {isAccountActive(account.id) && (
                                <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  Active
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-on-surface-variant truncate mt-0.5">{account.email}</p>
                            {account.lastUsed && (
                              <p className="text-[11px] text-on-surface-variant/50 mt-0.5">Last used {formatLastUsed(account.lastUsed)}</p>
                            )}
                          </div>
                        </button>

                        {/* 3-dot menu button */}
                        <button
                          type="button"
                          onClick={(e) => handleMenuClick(account.id, e)}
                          className="absolute top-3 right-3 sm:top-3.5 sm:right-3.5 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-white/10 text-on-surface-variant/50 hover:text-on-surface-variant transition-all active:scale-95"
                          style={{ minWidth: '44px', minHeight: '44px' }}
                        >
                          <span className="material-symbols-outlined text-xl">more_vert</span>
                        </button>

                        {/* Dropdown menu */}
                        {activeMenuId === account.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-3 top-[52px] z-50 w-52 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#121212] shadow-xl overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => handleContinueFromMenu(account)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-left"
                            >
                              <span className="material-symbols-outlined text-[18px] text-primary">login</span>
                              Continue
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleRemoveAccount(account.id, e)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/5 transition-all text-left"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                              Remove From Device
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={handleUseAnotherAccount}
                      className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border border-dashed border-slate-300 dark:border-white/10 hover:border-primary/40 hover:bg-slate-50 dark:hover:bg-white/[0.08] active:scale-[0.99] transition-all text-on-surface-variant hover:text-slate-900 dark:hover:text-white min-h-[56px]"
                    >
                      <div className="w-11 h-11 rounded-full bg-white/5 dark:bg-white/5 border-2 border-dashed border-slate-300 dark:border-white/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-xl text-on-surface-variant/60">add</span>
                      </div>
                      <span className="font-semibold text-xs sm:text-sm">Use Another Account</span>
                    </button>
                  </div>
                </motion.div>
              ) : authMode === 'login' || loginPageState === 'password-screen' ? (
                /* --- LOGIN VIEW --- */
                <motion.div 
                  key="login"
                  custom={direction}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="w-full text-slate-900 dark:text-white"
                >
                  {loginPageState === 'password-screen' && (
                    <button
                      type="button"
                      onClick={() => setLoginPageState('account-picker')}
                      className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-black dark:hover:text-white transition-all mb-4 px-1"
                    >
                      <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                      <span>All Accounts</span>
                    </button>
                  )}
                  <form onSubmit={handleLoginSubmit} className="space-y-4 w-full">
                    <div className="space-y-3.5">
                      <div className="space-y-1">
                        <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Email or Username</label>
                        <div className="relative group">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">person</span>
                          <input 
                            type="text" 
                            placeholder="Email address or tag" 
                            value={loginForm.email} 
                            onChange={(e) => {
                              const val = e.target.value
                              setLoginForm({...loginForm, email: val})
                              checkAdminTotpStatus(val)
                            }} 
                            className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-4 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                            required 
                          />
                        </div>
                      </div>

                      {isAdminLogin && !adminTotpNotConfigured ? (
                        <div className="space-y-3">
                          <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">Google Authenticator Code</label>
                          <div
                            className={`flex items-center justify-center gap-2.5 sm:gap-3 ${otpShake ? 'animate-[otp-shake_0.4s_ease-in-out]' : ''}`}
                            style={otpShake ? { animation: 'otp-shake 0.4s ease-in-out' } : undefined}
                          >
                            {Array.from({ length: OTP_DIGITS_COUNT }).map((_, i) => (
                              <OtpDigitBox
                                key={i}
                                inputRef={(el) => { otpBoxRefs.current[i] = el }}
                                value={adminOtp[i] || ''}
                                onChange={(v) => handleOtpBoxChange(i, v)}
                                onKeyDown={(e) => handleOtpBoxKeyDown(i, e)}
                                onPaste={handleOtpBoxPaste}
                                autoFocus={i === 0}
                                error={otpShake}
                              />
                            ))}
                          </div>
                          <p className="text-[10px] text-on-surface-variant/60 px-1 text-center">Enter the current 6-digit code from Google Authenticator</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex justify-between items-baseline">
                            <label className="text-[10px] text-on-surface-variant/80 font-bold uppercase tracking-wider font-label-caps">{isAdminLogin ? 'Admin Password' : 'Password'}</label>
                            {!isAdminLogin && <button type="button" onClick={() => { setDirection(0); setAuthMode('forgot'); }} className="font-label-caps text-[9px] text-primary hover:text-black dark:hover:text-white uppercase transition-all font-bold">Forgot Password?</button>}
                          </div>
                          <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">lock</span>
                            <input 
                              type={showPasswordLogin ? "text" : "password"} 
                              placeholder={isAdminLogin ? "Enter admin password" : "Password details"} 
                              value={loginForm.password} 
                              onChange={(e) => setLoginForm({...loginForm, password: e.target.value})} 
                              className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-11 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                              required 
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswordLogin(!showPasswordLogin)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors focus:outline-none"
                            >
                              <span className="material-symbols-outlined text-[18px]">
                                {showPasswordLogin ? 'visibility_off' : 'visibility'}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}


                    </div>

                      {/* Remember Account Checkbox */}
                      <div className="px-1 pt-1">
                        <label className="flex items-start gap-2.5 cursor-pointer group">
                          <div className="relative flex items-center justify-center mt-0.5">
                            <input 
                              type="checkbox" 
                              checked={loginForm.rememberMe} 
                              onChange={(e) => setLoginForm({...loginForm, rememberMe: e.target.checked})} 
                              className="peer appearance-none w-4.5 h-4.5 rounded border border-slate-300 dark:border-white/20 checked:bg-slate-200 dark:checked:bg-primary transition-all cursor-pointer" 
                            />
                            <span className="absolute material-symbols-outlined text-black dark:text-white text-[14px] scale-0 peer-checked:scale-100 transition-transform pointer-events-none font-black">check</span>
                          </div>
                          <div className="font-body-sm text-[11px] text-on-surface-variant leading-normal group-hover:text-slate-900 dark:group-hover:text-white transition-colors font-medium">
                            Remember Account on This Device
                          </div>
                        </label>
                      </div>

                    <button 
                      type="submit" 
                      disabled={!isLoginFormValid || isLoading}
                      className="w-full h-11 bg-primary hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_4px_12px_rgba(90,93,250,0.2)] flex items-center justify-center gap-1.5"
                    >
                      <span>{isAdminLogin ? 'Admin Login' : 'Submit'}</span>
                      <span className="material-symbols-outlined text-[18px]">{isAdminLogin ? 'security' : 'login'}</span>
                    </button>
                  </form>

                  {/* Google Sign-in Option */}
                  <div className="space-y-4 pt-2 w-full">
                    <div className="relative flex items-center justify-center">
                      <div className="border-t border-slate-200 dark:border-white/10 w-full" />
                      <span className="absolute bg-white dark:bg-[#1B1B1F] px-3 font-label-caps text-[9px] text-on-surface-variant uppercase tracking-wider">or continue with</span>
                    </div>
                    
                    <button
                      type="button"
                      onClick={handleGoogleSignIn}
                      className="w-full h-11 bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-primary/30 rounded-xl font-headline-md text-xs font-bold text-slate-900 dark:text-white transition-all flex items-center justify-center gap-2.5 group"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22c-.23-.67-.35-1.37-.35-2.09z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* --- REGISTER VIEW --- */
                <motion.div 
                  key="register"
                  custom={direction}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={contentTransition}
                  className="w-full text-slate-900 dark:text-white"
                >
                  <form onSubmit={handleRegisterSubmit} className="space-y-3.5 w-full">
                    <div className="space-y-3">
                      {/* Full Name */}
                      <div className="space-y-0.5">
                        <AbuseFieldWrapper fieldId="reg-name" value={regForm.name} onWarning={setRegNameAbuse}>
                          <div className="relative group">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">person</span>
                            <input 
                              type="text" 
                              name="name"
                              autoComplete="name"
                              placeholder="Full Name (Max 20 chars)" 
                              maxLength={20}
                              value={regForm.name} 
                              onChange={(e) => { setRegForm({...regForm, name: e.target.value}); setIsFormEditedSinceLastSubmit(true); setBackWithoutEditCount(0); }}
                              className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-4 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                              required 
                            />
                          </div>
                        </AbuseFieldWrapper>
                        {regForm.name && !isNameValid && !regNameAbuse && (
                          <p className="text-red-500 text-[10px] font-bold pl-1">Name must only contain letters & spaces, max 20 characters.</p>
                        )}
                      </div>

                      {/* Email Address */}
                      <div className="space-y-0.5">
                        <div className="relative group">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">mail</span>
                          <input 
                            type="email" 
                            name="email"
                            autoComplete="email"
                            placeholder="Email Address" 
                            value={regForm.email} 
                            onChange={(e) => { setRegForm({...regForm, email: e.target.value}); setIsFormEditedSinceLastSubmit(true); setBackWithoutEditCount(0); }}
                            className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-4 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                            required 
                          />
                        </div>
                        {regForm.email && !isEmailValid && (
                          <p className="text-red-500 text-[10px] font-bold pl-1">Enter a valid email address.</p>
                        )}
                        <p className="text-on-surface-variant/40 text-[10px] font-medium pl-1 mt-0.5"></p>
                      </div>

                      {/* Password */}
                      <div className="space-y-0.5">
                        <div className="relative group">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">lock</span>
                          <input 
                            type={showPasswordRegister ? "text" : "password"} 
                            name="password"
                            autoComplete="new-password"
                            placeholder="Password (Min 6 characters)" 
                            value={regForm.password} 
                            onChange={(e) => { setRegForm({...regForm, password: e.target.value}); setIsFormEditedSinceLastSubmit(true); setBackWithoutEditCount(0); }}
                            className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-11 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                            required 
                          />
                          <button
                            type="button"
                            onClick={() => setShowPasswordRegister(!showPasswordRegister)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant/50 hover:text-primary transition-colors focus:outline-none"
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {showPasswordRegister ? 'visibility_off' : 'visibility'}
                            </span>
                          </button>
                        </div>
                        {regForm.password && renderPasswordRequirements(regForm.password)}
                      </div>

                      {/* Confirm Password */}
                      <div className="space-y-0.5">
                        <div className="relative group">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-[18px] group-focus-within:text-primary transition-colors">shield</span>
                          <input 
                            type={showPasswordRegister ? "text" : "password"} 
                            name="confirm-password"
                            autoComplete="new-password"
                            placeholder="Confirm Password" 
                            value={regForm.confirmPassword} 
                            onChange={(e) => { setRegForm({...regForm, confirmPassword: e.target.value}); setIsFormEditedSinceLastSubmit(true); setBackWithoutEditCount(0); }}
                            className="w-full h-11 bg-slate-50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl pl-11 pr-4 text-slate-900 dark:text-white font-body-md font-bold focus:border-primary focus:ring-[3px] focus:ring-primary/10 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-on-surface-variant/30" 
                            required 
                          />
                        </div>
                        {regForm.confirmPassword && !isConfirmPasswordValid && (
                          <p className="text-red-500 text-[10px] font-bold pl-1">Passwords do not match.</p>
                        )}
                      </div>

                      {/* Terms Checkbox */}
                      <div className="px-1 pt-1">
                        <label className="flex items-start gap-2.5 cursor-pointer group">
                          <div className="relative flex items-center justify-center mt-0.5">
                            <input 
                              type="checkbox" 
                              checked={regForm.agreeTerms} 
                              onChange={(e) => setRegForm({...regForm, agreeTerms: e.target.checked})} 
                              className="peer appearance-none w-4.5 h-4.5 rounded border border-slate-300 dark:border-white/20 checked:bg-slate-200 dark:checked:bg-primary transition-all cursor-pointer" 
                              required 
                            />
                            <span className="absolute material-symbols-outlined text-black dark:text-white text-[14px] scale-0 peer-checked:scale-100 transition-transform pointer-events-none font-black">check</span>
                          </div>
                          <div className="font-body-sm text-[11px] text-on-surface-variant leading-normal group-hover:text-slate-900 dark:group-hover:text-white transition-colors font-medium">
                            I agree to the <button type="button" className="text-primary font-bold hover:underline underline-offset-2">Terms</button> & <button type="button" className="text-primary font-bold hover:underline underline-offset-2">Privacy Policy</button>
                          </div>
                        </label>
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={!isRegisterFormValid || isLoading || regSpamCooldownSeconds > 0}
                      className="w-full h-11 bg-primary hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none text-white rounded-xl font-headline-md text-xs font-bold transition-all shadow-[0_4px_12px_rgba(90,93,250,0.2)] flex items-center justify-center gap-1.5"
                    >
                      <span>Join The Arena</span>
                      <span className="material-symbols-outlined text-[18px]">sports_esports</span>
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            <SignOutModal
              isOpen={showSignOutModal}
              onClose={() => setShowSignOutModal(false)}
              onConfirm={handleSignOutConfirm}
            />
          </motion.div>
        </motion.div>
        </div>
      </main>

      {/* Global Site Footer */}
      <footer className="w-full bg-surface-container-lowest border-t border-outline-variant py-6 px-4">
        <div className="w-full max-w-container-max mx-auto flex flex-col gap-5">
          <div className="flex justify-center items-center gap-5 border-b border-outline-variant/20 pb-4">
            <button onClick={() => onNavigate && onNavigate('terms-service')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Terms</button>
            <button onClick={() => onNavigate && onNavigate('privacy-policy')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Privacy</button>
            <button onClick={() => onNavigate && onNavigate('help-support')} className="font-body-sm text-[11px] text-on-surface-variant hover:text-primary transition-colors">Support</button>
          </div>
          <div className="flex flex-col items-center justify-center gap-1.5 text-center">
            <button onClick={() => onNavigate && onNavigate('home')} className="font-headline-md text-[16px] font-extrabold text-primary tracking-tight hover:opacity-85 transition-opacity">
              Match District
            </button>
            <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">&copy; 2024 MATCH DISTRICT. ALL RIGHTS RESERVED.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Auth