import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function OrgPage({ onNavigate }) {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/org/by-slug/${slug}`)
        const data = await res.json()
        if (data.success && data.org) {
          setOrg(data.org)
        } else {
          setError(data.message || 'Organization not found')
        }
      } catch {
        setError('Failed to load organization')
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto animate-pulse">
            <span className="material-symbols-outlined text-primary text-xl">stadia_controller</span>
          </div>
          <p className="text-sm text-on-surface-variant">Loading organization...</p>
        </div>
      </div>
    )
  }

  if (error || !org) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-md mx-auto p-6">
          <div className="w-16 h-16 rounded-full bg-error/10 border border-error/20 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-error text-3xl">search_off</span>
          </div>
          <h2 className="text-lg font-bold text-on-background">Organization Not Found</h2>
          <p className="text-sm text-on-surface-variant">{error || 'This custom link does not exist or has been removed.'}</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-primary text-on-primary text-xs font-bold rounded-xl">Go Home</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-outline-variant/20 bg-surface-container-low/40 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 text-on-surface-variant hover:text-on-background transition-colors">
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            <span className="text-xs font-semibold">Match District</span>
          </button>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/tournaments')} className="text-xs text-on-surface-variant hover:text-primary transition-colors">Tournaments</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 sm:p-8 rounded-[24px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-4xl">stadia_controller</span>
            </div>
            <div className="space-y-2 flex-1">
              <h1 className="text-xl font-extrabold text-on-background">{org.name || org.org_name}</h1>
              <div className="flex flex-wrap items-center gap-3">
                {org.tier === 'Pro' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20 uppercase">Verified Pro</span>
                )}
                {org.tier === 'Basic' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-highest/50 text-on-surface-variant uppercase">Basic</span>
                )}
                {org.tier === 'Free' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-surface-container-highest/50 text-on-surface-variant uppercase">Free</span>
                )}
              </div>
              {org.bio && <p className="text-sm text-on-surface-variant leading-relaxed">{org.bio}</p>}
              {org.org_handle && (
                <p className="text-xs text-on-surface-variant/60 font-mono">@{org.org_handle}</p>
              )}
            </div>
          </div>
        </motion.div>

        {org.recent_tournaments?.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="glass-card p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
            <h2 className="text-sm font-bold text-on-background mb-4">Recent Tournaments</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {org.recent_tournaments.map(t => (
                <button key={t.id} onClick={() => navigate(`/tournaments/${t.id}`)}
                  className="text-left bg-surface-container-highest/20 hover:bg-surface-container-highest/40 border border-outline-variant/20 rounded-xl p-3 transition-all">
                  <p className="text-xs font-semibold text-on-surface truncate">{t.title}</p>
                  <p className="text-[10px] text-on-surface-variant mt-1">{t.game} · {new Date(t.startDate).toLocaleDateString()}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  )
}