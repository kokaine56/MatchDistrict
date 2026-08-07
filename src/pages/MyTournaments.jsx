import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import TournamentCard from '../components/TournamentCard'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { getAuthToken } from '../utils/getAuthToken'
import { fetchJsonWithRetry } from '../utils/api'

const REG_STATUS_CONFIG = {
  'approved': { label: 'Registered', bg: 'bg-green-500 text-white', btnText: 'View Details', group: 'Registered' },
  'confirmed': { label: 'Registered', bg: 'bg-green-500 text-white', btnText: 'View Details', group: 'Registered' },
  'pending': { label: 'Pending Verification', bg: 'bg-amber-500 text-white', btnText: 'View Details', group: 'Pending' },
  'pending_payment': { label: 'Pending Verification', bg: 'bg-amber-500 text-white', btnText: 'View Details', group: 'Pending' },
  'waitlisted': { label: 'Waitlisted', bg: 'bg-amber-500/80 text-white', btnText: 'View Details', group: 'Pending' },
  'rejected': { label: 'Rejected', bg: 'bg-red-500 text-white', btnText: 'View Details', group: 'Rejected' },
  'cancelled': { label: 'Cancelled', bg: 'bg-surface-variant text-on-surface-variant', btnText: 'View Details', group: 'Rejected' },
  'expired': { label: 'Expired', bg: 'bg-surface-variant text-on-surface-variant', btnText: 'View Details', group: 'Rejected' },
}

const FILTER_TABS = ['All', 'Registered', 'Pending', 'Rejected']

const FILTER_STATUSES = {
  Registered: ['approved', 'confirmed'],
  Pending: ['pending', 'pending_payment', 'waitlisted'],
  Rejected: ['rejected', 'cancelled', 'expired'],
}

function getStatusGroup(regStatus) {
  const config = REG_STATUS_CONFIG[regStatus]
  return config ? config.group : 'Rejected'
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 }
  }
}

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 200, damping: 20 } }
}

export default function MyTournaments({ onNavigate }) {
  const [currentUser] = useCurrentUser()
  const [registrations, setRegistrations] = useState([])
  const [allTournaments, setAllTournaments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    if (!currentUser?.id) return
    let cancelled = false

    async function loadData() {
      setIsLoading(true)
      try {
        const token = await getAuthToken()

        const [regRes, tourRes] = await Promise.all([
          fetch(`/api/users/${currentUser.id}/registrations`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(r => r.json()),
          fetchJsonWithRetry('/api/tournaments')
        ])

        if (cancelled) return

        if (regRes.success && regRes.registrations) {
          setRegistrations(regRes.registrations)
        }
        if (tourRes.ok && tourRes.data?.success && tourRes.data?.tournaments) {
          setAllTournaments(tourRes.data.tournaments)
        }
      } catch (err) {
        console.warn('Failed to load My Tournaments:', err)
      }
      if (!cancelled) setIsLoading(false)
    }

    loadData()
    return () => { cancelled = true }
  }, [currentUser?.id])

  const joinedTournaments = useMemo(() => {
    const tourMap = {}
    allTournaments.forEach(t => { tourMap[t.id] = t })

    return registrations.map(reg => {
      const t = tourMap[reg.tournament_id]
      if (!t) return null

      const regStatus = (reg.status || 'pending').toLowerCase()
      const config = REG_STATUS_CONFIG[regStatus] || REG_STATUS_CONFIG.pending

      return {
        id: t.id,
        title: t.title,
        game: t.game,
        status: t.status || 'upcoming',
        imgSrc: t.cover_image_url || t.bannerUrl || '',
        prizePool: t.prize || `₹${(parseInt(t.prize_pool_amount) || 0).toLocaleString('en-IN')}`,
        entryFee: t.entry,
        entryFeeAmount: parseInt(t.entry_fee_amount) || 0,
        matchType: t.match_type || t.matchType || 'squad',
        perspective: t.perspective || 'tpp',
        slotsTotal: parseInt(t.slotsTotal) || parseInt(t.slots_total) || 100,
        slotsFilled: parseInt(t.slotsFilled) || parseInt(t.slots_filled) || 0,
        orgName: t.orgName || 'Match District',
        orgTier: t.orgTier || 'Free',
        badgeText: config.label,
        badgeBg: config.bg,
        buttonText: config.btnText,
        buttonClassName: config.btnClassName || '',
        regStatus,
      }
    }).filter(Boolean)
  }, [registrations, allTournaments])

  const filteredData = useMemo(() => {
    if (filter === 'All') return joinedTournaments
    const allowed = FILTER_STATUSES[filter]
    if (!allowed) return []
    return joinedTournaments.filter(t => allowed.includes(t.regStatus))
  }, [joinedTournaments, filter])

  const counts = useMemo(() => {
    const c = { All: joinedTournaments.length, Registered: 0, Pending: 0, Rejected: 0 }
    joinedTournaments.forEach(t => {
      for (const [group, statuses] of Object.entries(FILTER_STATUSES)) {
        if (statuses.includes(t.regStatus)) {
          c[group]++
          break
        }
      }
    })
    return c
  }, [joinedTournaments])

  if (!currentUser) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-on-background tracking-tight">My Tournaments</h1>
            <p className="text-xs text-on-surface-variant mt-1">
              {isLoading ? 'Loading...' : `${counts.Registered} registered, ${counts.Pending} pending, ${counts.Rejected} other`}
            </p>
          </div>
        </div>

        <div className="flex gap-1.5 mb-6 overflow-x-auto scrollbar-hide">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                filter === tab
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-surface-container text-on-surface-variant hover:text-on-background border border-outline-variant/30'
              }`}
            >
              {tab} <span className="ml-1 opacity-60">({counts[tab] || 0})</span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3">sports_esports</span>
            <p className="text-sm font-semibold text-on-surface-variant">
              {filter === 'All' ? 'No tournament registrations yet' : `No ${filter.toLowerCase()} tournaments`}
            </p>
            <button
              onClick={() => onNavigate && onNavigate('tournaments')}
              className="mt-4 px-5 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              Browse Tournaments
            </button>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8 overflow-visible"
          >
            {filteredData.map(t => (
              <motion.div key={t.id} variants={cardVariants}>
                  <TournamentCard
                    id={t.id}
                    title={t.title}
                    game={t.game}
                    status={t.status}
                    imgSrc={t.imgSrc}
                    prizePool={t.prizePool}
                    entryFee={t.entryFee}
                    entryFeeAmount={t.entryFeeAmount}
                    matchType={t.matchType}
                    perspective={t.perspective}
                    slotsTotal={t.slotsTotal}
                    slotsFilled={t.slotsFilled}
                    orgName={t.orgName}
                    orgTier={t.orgTier}
                    badgeText={t.badgeText}
                    badgeBg={t.badgeBg}
                    buttonText={t.buttonText}
                    buttonClassName={t.buttonClassName}
                    onNavigate={onNavigate}
                    forceWalletCard
                    cardColor={t.card_color || 'white'}
                  />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
