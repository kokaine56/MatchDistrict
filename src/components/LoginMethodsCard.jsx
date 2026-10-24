import { useCallback, useEffect, useState } from 'react'
import GoogleConnectCard from './GoogleConnectCard.jsx'
import DiscordConnectCard from './DiscordConnectCard.jsx'

export default function LoginMethodsCard({ currentUser, onUserUpdated, triggerToast }) {
  const [methods, setMethods] = useState(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/login-methods', { credentials: 'include' })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.message || 'Could not load sign-in methods.')
      setMethods(data.methods)
      setError('')
    } catch (err) {
      setError(err.message || 'Could not load sign-in methods.')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh, currentUser?.id])
  const update = useCallback(() => { onUserUpdated?.(); refresh() }, [onUserUpdated, refresh])
  const linkedDiscord = methods?.discord ? {
    connected: true,
    username: currentUser?.discord?.username || '',
    global_name: methods.discord.display_name || currentUser?.discord?.global_name || '',
    avatar_url: methods.discord.avatar_url || currentUser?.discord?.avatar_url || null,
    connected_at: methods.discord.linked_at || currentUser?.discord?.connected_at || null,
  } : { connected: false }
  const cardUser = methods ? {
    ...currentUser,
    google_id: methods.google ? 'linked' : null,
    discord_id: methods.discord ? 'linked' : null,
    discord: linkedDiscord,
  } : currentUser

  return (
    <section className="space-y-4" aria-label="Login methods">
      <header>
        <h3 className="font-headline-md text-base font-bold text-on-background">Login methods</h3>
        <p className="mt-1 text-xs text-on-surface-variant">Manage the email, Google, and Discord methods that can access this account.</p>
        {methods?.email && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><span>Email: {methods.email.address} · Password {methods.email.passwordSet ? 'set' : 'not set'}</span>{!methods.email.passwordSet && <button type="button" onClick={() => document.getElementById('password-management')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="rounded-md border border-outline-variant px-2 py-1 font-semibold text-primary">Create password</button>}</div>}
        {error && <p role="status" className="mt-2 text-xs text-rose-400">{error}</p>}
      </header>
      <GoogleConnectCard currentUser={cardUser} providerIdentity={methods?.google} onUserUpdated={update} triggerToast={triggerToast} />
      <DiscordConnectCard currentUser={cardUser} providerIdentity={methods?.discord} onUserUpdated={update} triggerToast={triggerToast} />
    </section>
  )
}
