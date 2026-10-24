import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

export default function AuthSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const provider = params.get('provider') === 'discord' ? 'Discord' : 'Google'
  const requested = params.get('next') || '/'
  const next = requested.startsWith('/') && !requested.startsWith('//') && !requested.includes('\\') ? requested : '/'
  useEffect(() => {
    try { sessionStorage.removeItem('md_logged_out') } catch {}
    const timer = window.setTimeout(() => navigate(next, { replace: true }), 1100)
    return () => window.clearTimeout(timer)
  }, [navigate, next])
  return <main className="min-h-screen flex items-center justify-center bg-background px-4 text-on-background"><div className="text-center"><span className="material-symbols-outlined text-4xl text-emerald-400">check_circle</span><h1 className="mt-3 font-headline-lg text-xl font-bold">Logged in with {provider}</h1><p className="mt-2 text-sm text-on-surface-variant">Taking you to your destination…</p></div></main>
}
