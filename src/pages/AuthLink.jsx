import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function AuthLink() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [provider, setProvider] = useState('provider')
  const [maskedProviderEmail, setMaskedProviderEmail] = useState('')

  useEffect(() => {
    fetch('/api/auth/link/pending', { credentials: 'include' }).then(response => response.json()).then(data => {
      if (data.success) {
        setProvider(data.provider === 'discord' ? 'Discord' : 'Google')
        setMaskedProviderEmail(data.maskedProviderEmail || '')
      } else {
        setError('This confirmation expired. Start provider sign-in again.')
      }
    }).catch(() => setError('Could not verify the pending provider flow. Start sign-in again.'))
  }, [])

  const requestCode = async () => {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/auth/link/send-code', { method: 'POST', credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not send a confirmation code.')
      setMaskedEmail(data.maskedEmail || '')
      setCodeSent(true)
      setMessage(data.message || 'Check your email for the confirmation code.')
    } catch (err) { setError(err.message || 'Could not send a confirmation code.') }
    finally { setBusy(false) }
  }

  const complete = async (event) => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/auth/link/complete', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password || undefined, code: code || undefined }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Account confirmation failed.')
      setMessage(data.message || 'Provider connected and you are logged in.')
      window.setTimeout(() => { window.location.assign(data.redirect || '/') }, 700)
    } catch (err) { setError(err.message || 'Account confirmation failed.') }
    finally { setBusy(false) }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background text-on-background">
      <section className="w-full max-w-md rounded-2xl border border-outline-variant/40 bg-surface-container-low p-5 sm:p-7 space-y-5">
        <div>
          <h1 className="font-headline-lg text-xl font-bold">Confirm it’s your account</h1>
          <p className="mt-2 text-sm text-on-surface-variant">An account already uses this verified {provider} email{maskedProviderEmail ? ` (${maskedProviderEmail})` : ''}. Confirm ownership to connect {provider}. Your accounts will not be merged.</p>
        </div>
        <form onSubmit={complete} className="space-y-3">
          <label className="block space-y-1 text-xs font-semibold">
            <span>Password, if this account has one</span>
            <input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-3 text-sm" />
          </label>
          {codeSent && <label className="block space-y-1 text-xs font-semibold"><span>6-digit code {maskedEmail && `sent to ${maskedEmail}`}</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} className="w-full rounded-lg border border-outline-variant bg-surface-container px-3 py-3 text-sm tracking-[0.3em]" /></label>}
          {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
          {message && <p role="status" className="text-sm text-emerald-400">{message}</p>}
          <button disabled={busy || (!password && !code)} className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-on-primary disabled:opacity-50">{busy ? 'Confirming…' : 'Confirm and connect'}</button>
        </form>
        <div className="space-y-2">
          <button type="button" disabled={busy} onClick={requestCode} className="w-full rounded-lg border border-outline-variant px-4 py-3 text-sm font-semibold disabled:opacity-50">{codeSent ? 'Resend email code' : 'Send a code to the account email'}</button>
          <button type="button" onClick={() => navigate('/login', { replace: true })} className="w-full px-4 py-2 text-sm text-on-surface-variant">Cancel and sign in another way</button>
        </div>
      </section>
    </main>
  )
}
