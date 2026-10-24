import { useCallback, useEffect, useRef, useState } from 'react'

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'

export default function LoginMethodsCard({ currentUser, onUserUpdated, triggerToast }) {
  const [methods, setMethods] = useState(null)
  const [error, setError] = useState('')
  const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '')
  const [gisReady, setGisReady] = useState(() => typeof window !== 'undefined' && Boolean(window.google?.accounts?.id))
  const [showGoogleConnectModal, setShowGoogleConnectModal] = useState(false)
  const [disconnectModal, setDisconnectModal] = useState(null) // 'google' | 'discord' | null
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [modalError, setModalError] = useState('')
  const googleBtnRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/login-methods', { credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Could not load sign-in methods.')
      }
      setMethods(data.methods)
      setError('')
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh, currentUser?.id])

  // Load Google client ID
  useEffect(() => {
    let active = true
    if (!clientId) {
      fetch('/api/auth/config')
        .then((res) => res.json())
        .then((data) => {
          if (active && data.success && data.googleClientId) {
            setClientId(data.googleClientId)
          }
        })
        .catch(() => {})
    }
    return () => { active = false }
  }, [clientId])

  // Load Google GIS script
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.google?.accounts?.id) {
      setGisReady(true)
      return
    }
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`)
    if (existing) {
      const onLoad = () => setGisReady(true)
      existing.addEventListener('load', onLoad)
      return () => existing.removeEventListener('load', onLoad)
    }
    const script = document.createElement('script')
    script.src = GOOGLE_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => setGisReady(true)
    document.head.appendChild(script)
  }, [])

  // Handle Google credential linking
  const handleGoogleCredential = useCallback(async (response) => {
    if (!response?.credential) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/auth/google/link', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: response.credential }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        triggerToast?.(data.message || 'Could not link Google. Please try again.')
        return
      }
      triggerToast?.('Google account linked successfully.')
      setShowGoogleConnectModal(false)
      onUserUpdated?.()
      refresh()
    } catch {
      triggerToast?.('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }, [onUserUpdated, refresh, triggerToast])

  // Render Google button when connect modal opens
  useEffect(() => {
    if (!showGoogleConnectModal || !gisReady || !clientId || !googleBtnRef.current || !window.google?.accounts?.id) return
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true,
    })
    googleBtnRef.current.replaceChildren()
    window.google.accounts.id.renderButton(googleBtnRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 260,
    })
  }, [showGoogleConnectModal, gisReady, clientId, handleGoogleCredential])

  // Calculate methods & safety rule
  const passwordSet = Boolean(
    methods?.email?.passwordSet ||
    (currentUser?.password_set !== false && currentUser?.email && !currentUser?.google_id && !currentUser?.discord_id)
  )
  const isGoogleConnected = Boolean(methods?.google || currentUser?.google_id)
  const isDiscordConnected = Boolean(methods?.discord || currentUser?.discord_id || currentUser?.discord?.connected)

  let connectedCount = 0
  if (passwordSet) connectedCount += 1
  if (isGoogleConnected) connectedCount += 1
  if (isDiscordConnected) connectedCount += 1

  const isLastMethod = connectedCount <= 1

  const handleOpenDisconnect = (provider) => {
    if (isLastMethod) {
      triggerToast?.('The last remaining login method cannot be removed.')
      return
    }
    setModalError('')
    setConfirmPassword('')
    setDisconnectModal(provider)
  }

  const handleConfirmDisconnect = async () => {
    if (isSubmitting) return
    if (passwordSet && !confirmPassword) {
      setModalError('Please enter your current password to confirm.')
      return
    }
    setIsSubmitting(true)
    setModalError('')
    try {
      const endpoint = disconnectModal === 'google' ? '/api/auth/google/unlink' : '/api/auth/discord/disconnect'
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: confirmPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setModalError(data.message || `Failed to disconnect ${disconnectModal === 'google' ? 'Google' : 'Discord'}.`)
        return
      }
      triggerToast?.(`${disconnectModal === 'google' ? 'Google' : 'Discord'} disconnected successfully.`)
      setDisconnectModal(null)
      setConfirmPassword('')
      onUserUpdated?.()
      refresh()
    } catch {
      setModalError('Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handlePasswordAction = () => {
    const el = document.getElementById('password-management')
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const btn = el.querySelector('button')
      if (btn) btn.click()
    }
  }

  const googleEmail = methods?.google?.provider_email || (currentUser?.google_id ? currentUser?.email : null)
  const discordName = methods?.discord?.display_name || methods?.discord?.provider_email || currentUser?.discord?.username || currentUser?.discord?.global_name

  return (
    <section
      className="glass-card p-4 sm:p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-3"
      aria-label="Login methods"
    >
      <h3 className="font-headline-md text-xs sm:text-sm font-bold uppercase flex items-center gap-2 text-on-background tracking-tight pb-2 border-b border-outline-variant/30">
        <span className="material-symbols-outlined text-primary text-lg">shield</span> Login methods
      </h3>

      {error && <p role="status" className="text-xs text-rose-400">{error}</p>}

      {/* Row 1: Email & password */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="material-symbols-outlined text-primary text-lg shrink-0">lock</span>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider block">Email &amp; password</span>
            <p className="text-xs font-semibold text-on-background truncate">
              {passwordSet ? 'Password set' : 'No password'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handlePasswordAction}
          className="px-4 h-9 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-sm">{passwordSet ? 'edit' : 'add'}</span>
          <span>{passwordSet ? 'Change password' : 'Create password'}</span>
        </button>
      </div>

      {/* Row 2: Google */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider block">Google</span>
            <p className="text-xs font-semibold text-on-background truncate">
              {isGoogleConnected ? (googleEmail || 'Connected') : 'Not connected'}
            </p>
          </div>
        </div>
        {isGoogleConnected ? (
          <button
            type="button"
            onClick={() => handleOpenDisconnect('google')}
            disabled={isLastMethod}
            title={isLastMethod ? 'The last remaining login method cannot be removed.' : 'Disconnect Google'}
            className="px-4 h-9 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 disabled:pointer-events-none text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-sm">link_off</span> Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowGoogleConnectModal(true)}
            className="px-4 h-9 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-sm">link</span> Connect
          </button>
        )}
      </div>

      {/* Row 3: Discord */}
      <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-container/60 border border-outline-variant/30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-5 h-5 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 fill-[#5865F2]" viewBox="0 0 24 24">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </div>
          <div className="min-w-0">
            <span className="text-[10px] uppercase font-bold text-on-surface-variant tracking-wider block">Discord</span>
            <p className="text-xs font-semibold text-on-background truncate">
              {isDiscordConnected ? (discordName ? `@${discordName}` : 'Connected') : 'Not connected'}
            </p>
          </div>
        </div>
        {isDiscordConnected ? (
          <button
            type="button"
            onClick={() => handleOpenDisconnect('discord')}
            disabled={isLastMethod}
            title={isLastMethod ? 'The last remaining login method cannot be removed.' : 'Disconnect Discord'}
            className="px-4 h-9 rounded-full border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 disabled:pointer-events-none text-rose-400 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-sm">link_off</span> Disconnect
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { window.location.href = '/api/auth/discord/connect' }}
            className="px-4 h-9 rounded-full border border-outline-variant/60 hover:border-primary/40 text-xs font-semibold text-on-background hover:bg-surface-variant flex items-center gap-1.5 transition-all shrink-0 whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-sm">link</span> Connect
          </button>
        )}
      </div>

      {/* Google Connect Modal */}
      {showGoogleConnectModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => !isSubmitting && setShowGoogleConnectModal(false)}
        >
          <div
            className="relative w-full max-w-sm bg-surface-container border-t sm:border border-outline-variant/60 rounded-t-2xl sm:rounded-2xl p-5 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:pb-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <h4 className="font-headline-md text-sm font-bold text-on-background">Connect Google</h4>
              <button
                type="button"
                onClick={() => setShowGoogleConnectModal(false)}
                className="w-7 h-7 rounded-full bg-surface-variant hover:bg-outline-variant/30 flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>
            <p className="text-xs text-on-surface-variant">
              Link your Google account to sign in with Google in one click.
            </p>
            <div className="flex justify-center py-2">
              <div ref={googleBtnRef} className="min-h-[44px]" />
            </div>
            {!clientId && (
              <p className="text-xs text-amber-500 text-center">Google sign-in is not configured on this server.</p>
            )}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowGoogleConnectModal(false)}
                className="px-5 h-9 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-background hover:bg-surface-variant whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnect Modal */}
      {disconnectModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => !isSubmitting && setDisconnectModal(null)}
        >
          <div
            className="relative w-full max-w-md bg-surface-container border-t sm:border border-outline-variant/60 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:pb-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-500 text-lg">link_off</span>
                <h4 className="font-headline-md text-sm font-bold text-on-background">
                  Disconnect {disconnectModal === 'google' ? 'Google' : 'Discord'}
                </h4>
              </div>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDisconnectModal(null)}
                className="w-7 h-7 rounded-full bg-surface-variant hover:bg-outline-variant/30 flex items-center justify-center text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Are you sure you want to disconnect {disconnectModal === 'google' ? 'Google' : 'Discord'}? You will no longer be able to log in with this method.
            </p>

            {modalError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {modalError}
              </div>
            )}

            {passwordSet && (
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant block">
                  Current Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Enter current password to confirm"
                  className="w-full h-10 px-3 rounded-lg bg-surface-container-low border border-outline-variant text-xs text-on-background outline-none focus:border-primary"
                />
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-2 border-t border-outline-variant/20">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setDisconnectModal(null)}
                className="px-4 h-9 rounded-full border border-outline-variant/60 text-xs font-semibold text-on-background hover:bg-surface-variant whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting || (passwordSet && !confirmPassword)}
                onClick={handleConfirmDisconnect}
                className="px-5 h-9 rounded-full bg-rose-500 hover:bg-rose-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap shadow-sm"
              >
                {isSubmitting ? 'Disconnecting...' : 'Confirm Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
