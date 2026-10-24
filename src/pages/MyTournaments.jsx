import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import TournamentCard from '../components/TournamentCard'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { getAuthToken } from '../utils/getAuthToken'
import { fetchJsonWithRetry } from '../utils/api'
import { getTournamentLifecycleStatus, getRegistrationButtonState } from '../utils/tournamentLifecycle'
import { hasOrganizerRights, isSystemAdmin } from '../utils/iamRoles.js'

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

// Mirrors the server's authoritative active-registration set (server.js).
// An active (non-terminal) registration is the current/valid record for a
// tournament; historical rejected/cancelled/expired rows only pick the tab
// when no active record exists.
const ACTIVE_REG_STATUSES = [
  'pending',
  'pending_payment',
  'PENDING_PAYMENT_VERIFICATION',
  'approved',
  'confirmed',
  'VERIFIED_BY_HOST',
  'verified_by_host',
]

function latestTimestamp(reg) {
  const raw = reg.updated_at || reg.created_at || 0
  return new Date(raw).getTime() || 0
}

// Determines one authoritative registration among the history rows for a
// tournament: an active-status record always wins; otherwise the newest
// historical record is kept.
function pickCurrentRegistration(records) {
  const active = records.filter(r => ACTIVE_REG_STATUSES.includes((r.status || '').toLowerCase()))
  const pool = active.length > 0 ? active : records
  return [...pool].sort((a, b) => latestTimestamp(b) - latestTimestamp(a))[0]
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
  const isOrganizer = Boolean(currentUser && (hasOrganizerRights(currentUser) || isSystemAdmin(currentUser)))
  const [viewMode, setViewMode] = useState('joined') // 'joined' | 'hosting'
  const [registrations, setRegistrations] = useState([])
  const [allTournaments, setAllTournaments] = useState([])
  const [hostedTournaments, setHostedTournaments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    if (!currentUser?.id) return
    let cancelled = false

    async function loadData() {
      setIsLoading(true)
      try {
        const token = await getAuthToken()

        const fetches = [
          fetch(`/api/users/${currentUser.id}/registrations`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }).then(r => r.json()),
          fetchJsonWithRetry('/api/tournaments')
        ]

        if (isOrganizer) {
          fetches.push(
            fetch('/api/organiser/tournaments', {
              headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()).catch(() => ({ success: false }))
          )
        }

        const [regRes, tourRes, orgRes] = await Promise.all(fetches)

        if (cancelled) return

        if (regRes.success && regRes.registrations) {
          setRegistrations(regRes.registrations)
        }
        if (tourRes.ok && tourRes.data?.success && tourRes.data?.tournaments) {
          setAllTournaments(tourRes.data.tournaments)
        }
        if (orgRes && orgRes.success && Array.isArray(orgRes.tournaments)) {
          setHostedTournaments(orgRes.tournaments)
        } else if (tourRes.ok && tourRes.data?.tournaments) {
          const hosted = tourRes.data.tournaments.filter(t =>
            t.orgId === currentUser.id ||
            t.organizer_id === currentUser.id ||
            t.org_id === currentUser.id ||
            (t.orgName && currentUser.name && t.orgName.toLowerCase() === currentUser.name.toLowerCase())
          )
          setHostedTournaments(hosted)
        }
      } catch (err) {
        console.warn('Failed to load My Tournaments:', err)
      }
      if (!cancelled) setIsLoading(false)
    }

    loadData()
    return () => { cancelled = true }
  }, [currentUser?.id, isOrganizer, currentUser?.name])

  const joinedTournaments = useMemo(() => {
    const tourMap = {}
    allTournaments.forEach(t => { tourMap[t.id] = t })

    // Group raw registration rows by the canonical tournament id, then pick
    // exactly one current/authoritative record per tournament so a tournament
    // can never render more than once (registration history is preserved in
    // the DB, it just never produces duplicate cards).
    const regGroups = new Map()
    for (const reg of registrations) {
      const tid = reg.tournament_id
      if (tid == null) {
        console.warn('[MyTournaments] registration record missing tournament_id:', reg.id || reg.created_at || '(unknown)')
        continue
      }
      if (!regGroups.has(tid)) regGroups.set(tid, [])
      regGroups.get(tid).push(reg)
    }

    const cards = []
    for (const [tid, group] of regGroups) {
      const t = tourMap[tid]
      if (!t) continue

      const reg = pickCurrentRegistration(group)
      const regStatus = (reg.status || 'pending').toLowerCase()
      const isApproved = regStatus === 'approved' || regStatus === 'confirmed'
      const config = REG_STATUS_CONFIG[regStatus] || REG_STATUS_CONFIG.pending

      let badgeText = config.label
      let badgeBg = config.bg

      if (isApproved) {
        if (reg.squad_waived) {
          badgeText = 'Registered (Waived)'
          badgeBg = 'bg-purple-600 text-white'
        } else if (reg.is_squad_complete) {
          badgeText = 'Fully Registered'
          badgeBg = 'bg-emerald-600 text-white'
        } else {
          const joined = reg.squad_joined != null ? reg.squad_joined : 1
          const req = reg.squad_required != null ? reg.squad_required : 4
          badgeText = `Squad ${joined}/${req}`
          badgeBg = 'bg-amber-600 text-white'
        }
      }

      // Compute button state using shared utility
      const lifecycle = getTournamentLifecycleStatus({
        registrationOpenDate: t.registrationOpenDate || t.registration_open_date,
        registrationCloseDate: t.registrationCloseDate || t.registration_close_date,
        startDate: t.startDate || t.start_date || t.date,
        status: t.status
      })
      const btnState = getRegistrationButtonState({ status: regStatus, rejection_reason: reg.rejection_reason }, lifecycle)

      cards.push({
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
        badgeText,
        badgeBg,
        buttonText: btnState.text,
        buttonClassName: btnState.styleClass,
        regStatus,
        squadIncomplete: isApproved && !reg.is_squad_complete && !reg.squad_waived,
        squadJoined: reg.squad_joined != null ? reg.squad_joined : 1,
        squadRequired: reg.squad_required != null ? reg.squad_required : 4,
      })
    }
    return cards
  }, [registrations, allTournaments])

  const hostedCards = useMemo(() => {
    return hostedTournaments.map(t => ({
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
      orgName: t.orgName || currentUser?.name || 'Match District',
      orgTier: t.orgTier || 'Free',
      badgeText: 'Hosting',
      badgeBg: 'bg-indigo-600 text-white font-bold',
      buttonText: 'Manage Tournament',
      buttonClassName: 'bg-primary hover:bg-primary/90 text-white font-bold',
      card_color: t.card_color || t.cardColor || t.theme || 'white',
    }))
  }, [hostedTournaments, currentUser?.name])

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
      <div 
        className="max-w-7xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-28 sm:pb-12"
        style={{ paddingBottom: 'calc(84px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-on-background tracking-tight">
              {viewMode === 'hosting' ? 'Hosted Tournaments' : 'My Tournaments'}
            </h1>
            <p className="text-xs text-on-surface-variant mt-1">
              {isLoading 
                ? 'Loading...' 
                : viewMode === 'hosting'
                  ? `${hostedCards.length} tournaments hosted`
                  : `${counts.Registered} registered, ${counts.Pending} pending, ${counts.Rejected} other`
              }
            </p>
          </div>

          {/* Two-option switch for organizers */}
          {isOrganizer && (
            <div className="flex items-center gap-1 p-1 bg-surface-container border border-outline-variant/30 rounded-xl w-fit shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('joined')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'joined'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-on-surface-variant hover:text-on-background'
                }`}
              >
                Joined ({joinedTournaments.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hosting')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'hosting'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-on-surface-variant hover:text-on-background'
                }`}
              >
                Hosting ({hostedCards.length})
              </button>
            </div>
          )}
        </div>

        {viewMode === 'joined' ? (
          <>
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
                  <motion.div key={t.id} variants={cardVariants} className="flex flex-col">
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
                        cardColor={t.card_color || t.cardColor || t.theme || 'white'}
                      />
                      {t.squadIncomplete && (
                        <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[10px] text-amber-300 font-semibold flex items-center justify-between gap-1 shadow-sm">
                          <span className="truncate">Squad: {t.squadJoined}/{t.squadRequired} claimed</span>
                          <span className="text-amber-400 font-mono text-[9px] shrink-0 font-bold">LOCKED</span>
                        </div>
                      )}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </>
        ) : (
          /* Hosting View */
          isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : hostedCards.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <span className="material-symbols-outlined text-5xl text-on-surface-variant/40 mb-3">corporate_fare</span>
              <p className="text-sm font-semibold text-on-surface-variant">No hosted tournaments yet</p>
              <button
                onClick={() => onNavigate && onNavigate('create-tournament')}
                className="mt-4 px-5 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">add_circle</span>
                Host Event
              </button>
            </div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-8 overflow-visible"
            >
              {hostedCards.map(t => (
                <motion.div key={t.id} variants={cardVariants} className="flex flex-col">
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
                    cardColor={t.card_color}
                  />
                </motion.div>
              ))}
            </motion.div>
          )
        )}
      </div>
    </div>
  )
}
