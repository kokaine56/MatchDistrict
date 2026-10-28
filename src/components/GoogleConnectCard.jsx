import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDateIST12h } from '../utils/timeFormat.js'

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'

export default function GoogleConnectCard({ currentUser, providerIdentity, onUserUpdated, triggerToast }) {
  const buttonRef = useRef(null)
  const callbackRef = useRef(null)
  const linkInFlightRef = useRef(false)
  const [clientId, setClientId] = useState(import.meta.env.VITE_GOOGLE_CLIENT_ID || '')
  const [gisReady, setGisReady] = useState(() => typeof window !== 'undefined' && Boolean(window.google?.accounts?.id))
  const [isLinking, setIsLinking] = useState(false)
  const [isUnlinkMode, setIsUnlinkMode] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)
  const [unlinkPassword, setUnlinkPassword] = useState('')

  const handleCredential = useCallback(async (response) => {
    if (!response?.credential || linkInFlightRef.current) return
    linkInFlightRef.current = true
    setIsLinking(true)
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
      onUserUpdated?.()
    } catch {
      triggerToast?.('Could not reach the authentication server.')
    } finally {
      linkInFlightRef.current = false
      setIsLinking(false)
    }
  }, [onUserUpdated, triggerToast])

  useEffect(() => {
    callbackRef.current = handleCredential
  }, [handleCredential])

  const linkedAt = providerIdentity?.linked_at || currentUser?.google_linked_at || null
  const daysSinceLinked = linkedAt ? (Date.now() - new Date(linkedAt).getTime()) / (1000 * 60 * 60 * 24) : null
  const canUnlink = currentUser?.can_unlink_google !== undefined
    ? currentUser.can_unlink_google
    : (daysSinceLinked === null || daysSinceLinked >= 14)
  const remainingDays = currentUser?.google_unlink_remaining_days !== undefined
    ? currentUser.google_unlink_remaining_days
    : (daysSinceLinked !== null && daysSinceLinked < 14 ? Math.ceil(14 - daysSinceLinked) : 0)

  const handleUnlink = async () => {
    if (!canUnlink) {
      triggerToast?.(`Google account can only be unlinked 14 days after linking (${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining).`)
      return
    }
    if ((currentUser?.password_set !== false && !unlinkPassword) || isUnlinking) return
    setIsUnlinking(true)
    try {
      const res = await fetch('/api/auth/google/unlink', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: unlinkPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        triggerToast?.(data.message || 'Could not unlink Google.')
        return
      }
      setUnlinkPassword('')
      setIsUnlinkMode(false)
      triggerToast?.('Google account unlinked. Email and password sign-in is still available.')
      onUserUpdated?.()
    } catch {
      triggerToast?.('Could not reach the authentication server.')
    } finally {
      setIsUnlinking(false)
    }
  }

  useEffect(() => {
    let active = true
    const loadClientId = async () => {
      if (clientId) return
      try {
        const response = await fetch('/api/auth/config')
        const data = await response.json()
        if (active && data.success && data.googleClientId) setClientId(data.googleClientId)
      } catch { /* Runtime config remains unavailable; the component shows setup guidance. */ }
    }
    loadClientId()

    if (window.google?.accounts?.id) {
      queueMicrotask(() => { if (active) setGisReady(true) })
      return () => { active = false }
    }
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`)
    if (existing) {
      const onLoad = () => active && setGisReady(true)
      existing.addEventListener('load', onLoad)
      return () => {
        active = false
        existing.removeEventListener('load', onLoad)
      }
    }
    const script = document.createElement('script')
    script.src = GOOGLE_SCRIPT
    script.async = true
    script.defer = true
    script.onload = () => active && setGisReady(true)
    document.head.appendChild(script)
    return () => { active = false }
  }, [clientId])

  useEffect(() => {
    if (!gisReady || !clientId || !buttonRef.current || !window.google?.accounts?.id) return
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => callbackRef.current?.(response),
      auto_select: false,
      cancel_on_tap_outside: true,
    })
    buttonRef.current.replaceChildren()
    window.google.accounts.id.renderButton(buttonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'rectangular',
      width: 260,
    })
  }, [gisReady, clientId])

  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="font-headline-md text-sm font-bold text-on-background">Google sign-in</h4>
          <p className="mt-1 text-xs text-on-surface-variant">
            {currentUser?.google_id
              ? 'A Google account is linked to this Match District account.'
              : 'Link Google after signing in to this Match District account.'}
          </p>
          {providerIdentity?.provider_email && <p className="mt-1 text-xs text-on-surface-variant">Linked Google email: {providerIdentity.provider_email}</p>}
          {providerIdentity?.linked_at && <p className="mt-1 text-[11px] text-on-surface-variant">Connected on {formatDateIST12h(providerIdentity.linked_at)} (IST)</p>}
          {!canUnlink && (
            <p className="mt-1 text-[11px] text-amber-400 font-medium">
              Can be unlinked after 14 days ({remainingDays} day{remainingDays === 1 ? '' : 's'} remaining).
            </p>
          )}
        </div>
        {currentUser?.google_id ? (
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-500">Linked</span>
        ) : null}
      </div>
      {currentUser?.google_id && (
        <div className="space-y-2">
          {isUnlinkMode ? (
            <div className="space-y-2">
              {currentUser.password_set !== false && <input
                type="password"
                autoComplete="current-password"
                value={unlinkPassword}
                onChange={(event) => setUnlinkPassword(event.target.value)}
                placeholder="Current password to confirm"
                className="w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2 text-sm text-on-background outline-none focus:border-primary"
              />}
              {currentUser.password_set === false && <p className="text-xs text-on-surface-variant">Confirm within 10 minutes of signing in. Another login method must remain connected.</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => { setIsUnlinkMode(false); setUnlinkPassword('') }} className="rounded-full border border-outline-variant px-4 h-9 text-xs font-semibold text-on-background whitespace-nowrap">Cancel</button>
                <button type="button" disabled={(currentUser.password_set !== false && !unlinkPassword) || isUnlinking} onClick={handleUnlink} className="rounded-full bg-rose-500 px-4 h-9 text-xs font-bold text-white disabled:opacity-50 whitespace-nowrap">Confirm unlink</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={!canUnlink}
              onClick={() => {
                if (!canUnlink) {
                  triggerToast?.(`Google account can only be unlinked 14 days after linking (${remainingDays} day${remainingDays === 1 ? '' : 's'} remaining).`)
                  return
                }
                setIsUnlinkMode(true)
              }}
              title={!canUnlink ? `Can be unlinked after 14 days (${remainingDays} days remaining)` : 'Unlink Google'}
              className="rounded-full border border-outline-variant px-4 h-9 text-xs font-semibold text-on-surface-variant hover:text-rose-500 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Unlink Google
            </button>
          )}
        </div>
      )}
      {!currentUser?.google_id && (
        <div className={isLinking ? 'pointer-events-none opacity-60' : ''}>
          <div ref={buttonRef} className="min-h-[44px]" />
          {!clientId && <p className="mt-2 text-xs text-amber-500">Google linking is not configured on this site.</p>}
        </div>
      )}
    </section>
  )
}
