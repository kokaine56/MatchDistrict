import React, { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import LoadingScreen from '../components/LoadingScreen.jsx'
import { useUser } from '../UserContext.jsx'
import { fetchJsonWithRetry } from '../utils/api.js'
import { getTournamentLifecycleStatus } from '../utils/tournamentLifecycle.js'
import VerificationBadge from '../components/VerificationBadge.jsx'
import { DEFAULT_BANNER } from '../utils/defaults.js'
import gameBgmi from '../assets/supported_games/bgmi.png'
import gameFreeFire from '../assets/supported_games/freefire.png'
import gameCodm from '../assets/supported_games/codm.png'
import gameValorant from '../assets/supported_games/valorant.png'

const FALLBACK_IMG = DEFAULT_BANNER

const GAME_ICON_MAP = {
  bgmi: gameBgmi,
  'free fire': gameFreeFire,
  codm: gameCodm,
  'cod mobile': gameCodm,
  valorant: gameValorant,
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const formatINR = (val) => {
  const n = parseInt(String(val || '').replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? (val || 'TBA') : `\u20B9${n.toLocaleString('en-IN')}`
}

function Archive({ onNavigate }) {
  const { currentUser, loading: authLoading } = useUser()
  const [tournaments, setTournaments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (authLoading) return
    if (!currentUser) {
      navigate('/login?redirect=/archive', { replace: true })
      return
    }

    const fetchArchived = async () => {
      setIsLoading(true)
      const { ok, data } = await fetchJsonWithRetry('/api/tournaments')
      if (ok && data?.success && data.tournaments) {
        const completed = data.tournaments.filter(t => {
          const s = getTournamentLifecycleStatus(t, new Date())
          const stored = (t.status || '').toLowerCase()
          return s === 'completed' || stored === 'completed' || stored === 'archived'
        })
        setTournaments(completed)
      }
      setIsLoading(false)
    }

    fetchArchived()
  }, [currentUser, authLoading, navigate])

  const tournamentsByYear = useMemo(() => {
    const grouped = {}
    tournaments.forEach(t => {
      const dateStr = t.startDate || t.created_at || t.created_at
      const date = dateStr ? new Date(dateStr) : null
      const year = date ? date.getFullYear() : new Date().getFullYear()
      const month = date ? date.getMonth() : 0

      if (!grouped[year]) grouped[year] = {}
      if (!grouped[year][month]) grouped[year][month] = []
      grouped[year][month].push(t)
    })

    const sortedYears = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => b - a)

    return { grouped, sortedYears }
  }, [tournaments])

  useEffect(() => {
    if (tournamentsByYear.sortedYears.length > 0 && selectedYear === null) {
      setSelectedYear(tournamentsByYear.sortedYears[0])
    }
  }, [tournamentsByYear.sortedYears, selectedYear])

  if (authLoading || isLoading) {
    return <LoadingScreen message="Loading Archive..." />
  }

  if (!currentUser) return null

  const years = tournamentsByYear.sortedYears
  const currentYearMonths = selectedYear && tournamentsByYear.grouped[selectedYear]
    ? Object.keys(tournamentsByYear.grouped[selectedYear])
      .map(Number)
      .sort((a, b) => b - a)
    : []

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-container-max mx-auto px-4 sm:px-sm md:px-lg py-8 sm:py-10 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 sm:mb-10"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="material-symbols-outlined text-primary text-3xl" data-icon="archive">archive</span>
            <h1 className="font-headline-lg text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
              Tournament Archive
            </h1>
          </div>
          <p className="font-body-md text-sm text-on-surface-variant max-w-lg">
            Browse past tournaments organized year by year. Registration is closed for all archived events.
          </p>
        </motion.div>

        {years.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-10 sm:p-14 text-center rounded-2xl border border-outline-variant/30 space-y-4 bg-surface-container-low/40 backdrop-blur-md shadow-xl"
          >
            <span className="material-symbols-outlined text-5xl text-primary animate-pulse" data-icon="archive">archive</span>
            <h3 className="font-display-lg text-xl sm:text-2xl font-bold text-white tracking-tight">No Archived Tournaments</h3>
            <p className="font-body-md text-sm text-on-surface-variant max-w-md mx-auto leading-relaxed">
              Completed tournaments will appear here once they finish. Check back later.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Year Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {years.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedYear(year)}
                  className={`px-5 py-2.5 rounded-xl font-headline-md text-sm font-bold whitespace-nowrap transition-all ${
                    selectedYear === year
                      ? 'bg-primary text-white shadow-[0_0_20px_rgba(99,102,241,0.3)]'
                      : 'bg-surface-container-low/60 text-on-surface-variant border border-outline-variant/30 hover:border-primary/40 hover:text-white'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>

            {/* Months under selected year */}
            {selectedYear && currentYearMonths.length === 0 && (
              <div className="text-center py-12 text-on-surface-variant/50 font-body-md text-sm">
                No archived tournaments in {selectedYear}.
              </div>
            )}

            {currentYearMonths.map(month => {
              const monthTournaments = tournamentsByYear.grouped[selectedYear][month]
              return (
                <motion.div
                  key={`${selectedYear}-${month}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                  className="space-y-4"
                >
                  {/* Month header */}
                  <div className="flex items-center gap-3 border-b border-outline-variant/20 pb-2">
                    <span className="w-1 h-5 bg-primary rounded-full shadow-[0_0_10px_rgba(192,193,255,0.5)]"></span>
                    <h2 className="font-headline-md text-lg sm:text-xl font-bold text-white tracking-tight">
                      {MONTH_NAMES[month]} {selectedYear}
                    </h2>
                    <span className="ml-auto font-body-sm text-xs text-on-surface-variant/60 bg-surface-container-low/60 px-2.5 py-1 rounded-full border border-outline-variant/20">
                      {monthTournaments.length} tournament{monthTournaments.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Tournament cards grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {monthTournaments.map(tournament => {
                      const gameKey = (tournament.game || '').toLowerCase()
                      const gameIcon = GAME_ICON_MAP[gameKey]
                      const imgSrc = tournament.bannerUrl || tournament.cover_image_url || gameIcon || FALLBACK_IMG
                      const prize = tournament.prize || tournament.prize_pool_amount || 'TBA'
                      const entryFee = tournament.entry || tournament.entry_fee_amount || 'Free'
                      const modeLabel = [
                        tournament.match_type === 'solo' ? 'Solo' : tournament.match_type === 'duo' ? 'Duo' : 'Squad',
                        tournament.perspective === 'fpp' ? 'FPP' : 'TPP'
                      ].filter(Boolean).join(' • ')

                      return (
                        <motion.div
                          key={tournament.id}
                          whileHover={{ y: -3, scale: 1.01 }}
                          whileTap={{ scale: 0.99 }}
                          onClick={() => onNavigate && onNavigate('tournament-detail', tournament.id)}
                          className="rounded-2xl overflow-hidden border border-outline-variant/30 bg-surface-container-low/60 backdrop-blur-sm shadow-md hover:shadow-lg hover:border-primary/30 cursor-pointer transition-all duration-300 group"
                        >
                          {/* Image */}
                          <div className="relative h-40 sm:h-48 overflow-hidden">
                            <img
                              alt={tournament.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                              src={imgSrc}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                            <div className="absolute top-3 left-3">
                              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                Completed
                              </span>
                            </div>
                            <div className="absolute bottom-3 left-3 right-3">
                              <h3 className="font-headline-md text-sm sm:text-base font-bold text-white leading-snug line-clamp-2 drop-shadow-lg">
                                {tournament.title}
                              </h3>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="text-[10px] text-white/70 truncate">{tournament.orgName || 'Match District Organizer'}</span>
                                <VerificationBadge tier={tournament.orgTier || 'Pro'} size="xs" />
                              </div>
                            </div>
                          </div>

                          {/* Details */}
                          <div className="p-3 sm:p-4 space-y-3">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high border border-outline-variant/40 text-on-surface-variant">
                                {tournament.game}
                              </span>
                              {modeLabel && (
                                <span className="text-[10px] text-on-surface-variant/60 uppercase tracking-wider font-medium">
                                  {modeLabel}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px] text-amber-400" data-icon="emoji_events">emoji_events</span>
                                <span className="font-bold text-amber-500 dark:text-amber-400">{formatINR(prize)}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px] text-primary" data-icon="confirmation_number">confirmation_number</span>
                                <span className="font-semibold text-on-surface-variant">{formatINR(entryFee)}</span>
                              </div>
                            </div>

                            <button className="w-full py-2 rounded-xl font-label-caps text-[10px] font-bold tracking-wider bg-surface-container-high border border-outline-variant/40 text-on-surface-variant hover:bg-primary hover:text-white hover:border-primary transition-all duration-300">
                              VIEW DETAILS
                            </button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

export default Archive
