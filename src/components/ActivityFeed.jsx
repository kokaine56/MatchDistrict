import { useState, useEffect } from 'react'
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
    <div className="flex flex-col gap-1 py-1">
      {tournamentsList.slice(0, 8).map((match, idx) => (
        <div
          key={match.id || idx}
          onClick={() => onNavigate && onNavigate('tournament-detail', match.id)}
          className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-surface-variant/40 transition-colors cursor-pointer"
        >
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-200 dark:border-indigo-500/20">
            <span className="material-symbols-outlined text-sm sm:text-base text-indigo-500">stadium</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-on-background leading-snug flex items-center gap-1 flex-wrap">
              <span className="text-primary font-bold truncate max-w-[120px] sm:max-w-[150px]">{match.orgName || 'Match District Organizer'}</span>
              <VerificationBadge tier={['pro', 'elite', 'basic'].includes((match.orgTier || '').toLowerCase()) ? match.orgTier : 'Pro'} size="sm" />
              <span className="text-on-surface-variant/60">hosted</span>
              <span className="font-bold text-on-background truncate">{match.title}</span>
            </p>
            <p className="text-[9px] sm:text-[10px] text-on-surface-variant/60 font-label-caps tracking-wider mt-0.5">{timeAgo(match.created_at)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
