import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { fetchJsonWithRetry } from '../utils/api.js'
import VerificationBadge from './VerificationBadge'

function timeAgo(dateStr) {
  if (!dateStr) return 'Recently'
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function ActivityFeed({ onNavigate }) {
  const [tournamentsList, setTournamentsList] = useState([])

  useEffect(() => {
    (async () => {
      const { ok, data } = await fetchJsonWithRetry('/api/tournaments')
      if (ok && data?.success && data.tournaments) {
        setTournamentsList(data.tournaments.filter(t => !t.isDraft))
      }
    })()
  }, [])

  if (tournamentsList.length === 0) {
    return (
      <div className="glass-card rounded-xl overflow-hidden bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/20 shadow-sm p-4 text-center text-xs text-on-surface-variant">
        No recent activity in the arena.
      </div>
    )
  }

  return (
    <div className="glass-card rounded-xl overflow-hidden divide-y divide-outline-variant/20 bg-surface-container-low/30 backdrop-blur-sm border border-outline-variant/20 shadow-sm">
      {tournamentsList.slice(0, 8).map((match, idx) => (
        <div
          key={match.id || idx}
          onClick={() => onNavigate && onNavigate('tournament-detail', match.id)}
          className="p-2.5 sm:p-3 flex gap-2.5 sm:gap-3 hover:bg-surface-variant/40 transition-colors cursor-pointer items-center"
        >
          <img
            alt="Organiser"
            className="avatar-img w-7 h-7 sm:w-8 sm:h-8 rounded-full shrink-0 border border-primary/20 bg-surface-container"
            src={match.logo || match.logoUrl || "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=100&q=80"}
          />
          <div className="space-y-0.5 min-w-0 flex-grow">
            <p className="font-body-sm text-xs text-on-background leading-snug flex items-center gap-1 min-w-0">
              <span className="text-primary font-bold truncate max-w-[120px] sm:max-w-[150px]">{match.orgName || 'Match District Organizer'}</span>
              <VerificationBadge tier={['pro', 'elite', 'basic'].includes((match.orgTier || '').toLowerCase()) ? match.orgTier : 'Pro'} size="sm" />
              <span className="text-on-surface-variant/80 shrink-0">hosted</span>
              <span className="font-bold text-on-background truncate flex-1 min-w-0">{match.title}</span>
            </p>
            <p className="text-[9px] sm:text-[10px] text-on-surface-variant/80 font-label-caps tracking-wider">{timeAgo(match.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
