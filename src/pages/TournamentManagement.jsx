import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../UserContext'
import { getAuthToken } from '../utils/getAuthToken'
import { normalizeTournamentRow } from '../utils/api'
import { hasOrganizerRights, isSystemAdmin } from '../utils/iamRoles.js'
import TournamentPlanningConfigEditor from '../components/TournamentPlanningConfigEditor'
import TournamentPlanningResultCard from '../components/TournamentPlanningResultCard'
import AllocationManagement from '../components/AllocationManagement'

const TABS = ['All Tournaments', 'Drafts', 'Published', 'Completed', 'Archived']

const REG_STATUS_BADGE = {
  pending: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  pending_payment: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  PENDING_PAYMENT_VERIFICATION: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  approved: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  confirmed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  VERIFIED_BY_HOST: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  verified_by_host: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  rejected: 'bg-rose-500/15 text-rose-500 border-rose-500/25',
  cancelled: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
  waitlisted: 'bg-sky-500/15 text-sky-500 border-sky-500/25',
  expired: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
}

const STATUS_BADGE = {
  draft: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
  upcoming: 'bg-primary/15 text-primary border-primary/25',
  live: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  'registration open': 'bg-sky-500/15 text-sky-500 border-sky-500/25',
  'registration closed': 'bg-violet-500/15 text-violet-500 border-violet-500/25',
  completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
  cancelled: 'bg-rose-500/15 text-rose-500 border-rose-500/25',
  archived: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
}

function statusLabel(s) {
  if (!s) return 'Draft'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function getStatus(s, isDraft) {
  if (isDraft) return 'draft'
  if (!s) return 'draft'
  return s
}

function getRoundsFromTournament(t) {
  let timeline = t.timeline
  if (typeof timeline === 'string') {
    try { timeline = JSON.parse(timeline) } catch { timeline = null }
  }
  return Array.isArray(timeline?.roadmap) ? timeline.roadmap : []
}

function roundsReadyToPublish(t) {
  const rounds = getRoundsFromTournament(t)
  if (rounds.length === 0) return { ok: false, message: 'Add at least one round before publishing.' }
  const incomplete = rounds.find((r) => !r.date || !r.time)
  if (incomplete) return { ok: false, message: 'Every round needs a date and time before publishing.' }
  return { ok: true }
}

function getGameIcon(game) {
  const map = {
    'bgmi': '/images/games/bgmi.png',
    'codm': '/images/games/codm.png',
    'valorant': '/images/games/valorant.png',
    'free fire': '/images/games/freefire.png',
    'cs2': '/images/games/cs2.png',
  }
  return map[game?.toLowerCase()] || null
}

export default function TournamentManagement({ onNavigate }) {
  const navigate = useNavigate()
  const { currentUser } = useUser()
  const [activeTab, setActiveTab] = useState('All Tournaments')
  const [tournaments, setTournaments] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterGame, setFilterGame] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [analyticsTournament, setAnalyticsTournament] = useState(null)
  const [analyticsCache, setAnalyticsCache] = useState({})
  const [actionLoading, setActionLoading] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [toast, setToast] = useState(null)
  const [activeTournament, setActiveTournament] = useState(null)
  const [registrationData, setRegistrationData] = useState([])
  const [registrationLoading, setRegistrationLoading] = useState(false)
  const [regActionLoading, setRegActionLoading] = useState(null)
  const [planningConfigTournament, setPlanningConfigTournament] = useState(null)
  const [planningResultTournament, setPlanningResultTournament] = useState(null)
  const [allocationTournament, setAllocationTournament] = useState(null)
  const [prizeAwardsTournament, setPrizeAwardsTournament] = useState(null)
  const [prizeAwards, setPrizeAwards] = useState([])
  const [prizeAwardsMeta, setPrizeAwardsMeta] = useState(null)
  const [prizeAwardsLoading, setPrizeAwardsLoading] = useState(false)
  const [settlementAward, setSettlementAward] = useState(null)
  const [settlementUtr, setSettlementUtr] = useState('')
  const [manualPaymentConfirmed, setManualPaymentConfirmed] = useState(false)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const refreshPrizePayouts = async (tournamentId, headers) => {
    const res = await fetch(`/api/tournaments/${tournamentId}/prize-awards/payouts`, { headers })
    const json = await res.json()
    if (!json.success) throw new Error(json.message || 'Could not load payout details')
    const payouts = json.payouts || []
    setPrizeAwards(payouts)
    setPrizeAwardsMeta({
      award_count: payouts.length,
      total_award_amount: payouts.reduce((sum, award) => sum + Number(award.prize_amount || 0), 0),
      alreadyGenerated: payouts.length > 0,
    })
  }

  const submitManualPayout = async (award) => {
    if (!manualPaymentConfirmed || !settlementUtr.trim()) return
    setActionLoading(`settle-prize:${award.id}`)
    try {
      const token = await getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      const res = await fetch(`/api/tournaments/${award.tournament_id}/prize-awards/${award.id}/settle`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ utr_reference: settlementUtr, confirm_manual_payment: true, upi_id_used: award.payout_upi_id }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.message || json.error || 'Could not record the payout')
      showToast(json.alreadyPaid ? 'This payment was already recorded' : 'Manual UPI payment recorded')
      setSettlementAward(null)
      setSettlementUtr('')
      setManualPaymentConfirmed(false)
      await refreshPrizePayouts(award.tournament_id, headers)
    } catch (error) {
      showToast(error.message || 'Could not record the payout', 'error')
    } finally {
      setActionLoading(null)
    }
  }

  useEffect(() => {
    if (!currentUser || !hasOrganizerRights(currentUser)) {
      onNavigate?.('profile')
      return
    }
    fetchTournaments()
  }, [currentUser])

  const fetchTournaments = async () => {
    setLoading(true)
    try {
      const token = await getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/organiser/tournaments', { headers })
      const json = await res.json()
      if (json.success && Array.isArray(json.tournaments)) {
        setTournaments(json.tournaments.map(t => normalizeTournamentRow(t) || t))
      }
    } catch (err) {
      console.error('Failed to fetch tournaments:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async (id) => {
    if (analyticsCache[id]) return
    try {
      const token = await getAuthToken()
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/tournaments/${id}/analytics`, { headers })
      const json = await res.json()
      if (json.success) {
        setAnalyticsCache(prev => ({ ...prev, [id]: json.analytics }))
      }
    } catch {}
  }

  const fetchRegistrations = async (tournamentId) => {
    setRegistrationLoading(true)
    try {
      const token = await getAuthToken()
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/tournaments/${tournamentId}/registrations`, { headers })
      const json = await res.json()
      if (json.success) setRegistrationData(json.registrations || [])
    } catch { setRegistrationData([]) }
    finally { setRegistrationLoading(false) }
  }

  const handleConfirmRegistration = async (regId) => {
    setRegActionLoading(regId)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${activeTournament.id}/registrations/${regId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'confirmed' })
      })
      const json = await res.json()
      if (json.success) {
        setRegistrationData(prev => prev.map(r => r.id === regId ? { ...r, status: 'confirmed' } : r))
        showToast('Payment verified. Success email sent to user.')
      } else {
        showToast(json.message || 'Verification failed', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    }
    finally { setRegActionLoading(null) }
  }

  const handleRejectRegistration = async (regId) => {
    setRegActionLoading(regId)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${activeTournament.id}/registrations/${regId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'rejected' })
      })
      const json = await res.json()
      if (json.success) {
        setRegistrationData(prev => prev.map(r => r.id === regId ? { ...r, status: 'rejected' } : r))
        showToast('Registration rejected')
      } else {
        showToast(json.message || 'Failed to reject', 'error')
      }
    } catch {
      showToast('Network error', 'error')
    }
    finally { setRegActionLoading(null) }
  }

  const filtered = useMemo(() => {
    let list = [...tournaments]
    const tab = activeTab.toLowerCase()
    if (tab === 'drafts') list = list.filter(t => t.isDraft === true)
    else if (tab === 'published') list = list.filter(t => t.isDraft === false && t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived')
    else if (tab === 'completed') list = list.filter(t => t.status === 'completed')
    else if (tab === 'archived') list = list.filter(t => t.status === 'archived')
    else list = list.filter(t => t.isDraft === false || t.isDraft === true)

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(t => t.title?.toLowerCase().includes(q) || t.id?.toLowerCase().includes(q) || t.game?.toLowerCase().includes(q))
    }
    if (filterGame) list = list.filter(t => t.game?.toLowerCase() === filterGame.toLowerCase())
    if (filterStatus) list = list.filter(t => (t.isDraft ? 'draft' : t.status) === filterStatus.toLowerCase())
    return list
  }, [tournaments, activeTab, searchQuery, filterGame, filterStatus])

  const games = useMemo(() => {
    const s = new Set()
    tournaments.forEach(t => { if (t.game) s.add(t.game) })
    return [...s]
  }, [tournaments])

  const stats = useMemo(() => {
    const total = tournaments.length
    const drafts = tournaments.filter(t => t.isDraft).length
    const published = tournaments.filter(t => !t.isDraft && t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived').length
    const completed = tournaments.filter(t => t.status === 'completed').length
    const archived = tournaments.filter(t => t.status === 'archived').length
    const totalRegistrations = tournaments.reduce((s, t) => s + (parseInt(t.slotsFilled) || 0), 0)
    const totalSponsors = tournaments.reduce((s, t) => s + (parseFloat(t.sponsorRevenue) || 0), 0)
    return { total, drafts, published, completed, archived, totalRegistrations, totalSponsors }
  }, [tournaments])

  const handleAction = async (action, t) => {
    setActionLoading(`${action}:${t.id}`)
    try {
      const token = await getAuthToken()
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      let res, json
      switch (action) {
        case 'duplicate':
          res = await fetch(`/api/tournaments/${t.id}/duplicate`, { method: 'POST', headers })
          json = await res.json()
          if (json.success) {
            showToast('Tournament duplicated as draft')
            navigate(`/create-tournament?edit=${json.tournament.id}`)
          } else showToast(json.message || 'Failed to duplicate', 'error')
          break
        case 'archive':
          res = await fetch(`/api/tournaments/${t.id}/archive`, { method: 'POST', headers })
          json = await res.json()
          if (json.success) { showToast('Tournament archived'); fetchTournaments() }
          else showToast(json.message || 'Failed to archive', 'error')
          break
        case 'finalize':
          if (!confirm(`Finalize ${t.title}? All final-round matches must have verified results. Finalization locks the results and tournament structure.`)) break
          res = await fetch(`/api/tournaments/${t.id}/finalize`, { method: 'POST', headers })
          json = await res.json()
          if (json.success) {
            showToast(json.alreadyFinalized ? 'Tournament was already finalized' : 'Tournament finalized and standings saved')
            fetchTournaments()
          } else showToast(json.message || json.error || 'Finalization is blocked', 'error')
          break
        case 'prize-awards': {
          setPrizeAwardsTournament(t)
          setSettlementAward(null)
          setSettlementUtr('')
          setManualPaymentConfirmed(false)
          setPrizeAwards([])
          setPrizeAwardsMeta(null)
          setPrizeAwardsLoading(true)
          try {
            await refreshPrizePayouts(t.id, headers)
          } catch {
            showToast('Could not load prize awards', 'error')
            setPrizeAwardsTournament(null)
          } finally {
            setPrizeAwardsLoading(false)
          }
          break
        }        case 'delete':
          if (!confirm('Delete this tournament permanently? This cannot be undone.')) break
          res = await fetch(`/api/tournaments/${t.id}`, { method: 'DELETE', headers })
          json = await res.json()
          if (json.success) { showToast('Tournament deleted'); fetchTournaments() }
          else showToast(json.message || 'Failed to delete', 'error')
          break
        case 'view':
          navigate(`/tournaments/${t.id}`)
          break
        case 'edit':
          navigate(`/create-tournament?edit=${t.id}`)
          break
        case 'copy':
          navigator.clipboard.writeText(`${window.location.origin}/tournaments/${t.id}`)
          showToast('Link copied!')
          break
        case 'registrations':
          setAnalyticsTournament(t)
          fetchAnalytics(t.id)
          break
        case 'sponsors':
          navigate(`/tournaments/${t.id}`)
          break
        case 'analytics':
          setAnalyticsTournament(t)
          fetchAnalytics(t.id)
          break
        case 'allocations':
          setAllocationTournament(t)
          break
        case 'review-registrations':
          setActiveTournament(t)
          fetchRegistrations(t.id)
          break
        case 'publish-rounds': {
          const ready = roundsReadyToPublish(t)
          if (!ready.ok) { showToast(ready.message, 'error'); break }
          res = await fetch(`/api/tournaments/${t.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ rounds_published: true })
          })
          json = await res.json()
          if (json.success) { showToast('Rounds published'); fetchTournaments() }
          else showToast(json.message || 'Failed to publish rounds', 'error')
          break
        }
        case 'hide-rounds': {
          res = await fetch(`/api/tournaments/${t.id}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ rounds_published: false })
          })
          json = await res.json()
          if (json.success) { showToast('Rounds hidden'); fetchTournaments() }
          else showToast(json.message || 'Failed to hide rounds', 'error')
          break
        }
        case 'planning-config':
          setPlanningConfigTournament(t)
          break
        case 'planning-result':
          setPlanningResultTournament(t)
          break
      }
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  if (!currentUser || !hasOrganizerRights(currentUser)) return null

  return (
    <div className="min-h-screen bg-[#07080C] text-white">
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-xl shadow-lg border text-sm font-medium ${
              toast.type === 'error' ? 'bg-rose-500/20 border-rose-500/30 text-rose-500' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-500'
            }`}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTournament ? (
          <RegistrationManager
            tournament={activeTournament}
            registrations={registrationData}
            loading={registrationLoading}
            actionLoading={regActionLoading}
            onBack={() => { setActiveTournament(null); setRegistrationData([]) }}
            onConfirm={handleConfirmRegistration}
            onReject={handleRejectRegistration}
          />
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-2xl font-bold text-on-background">Tournament Management</h1>
                <p className="text-sm text-on-surface-variant mt-1">Manage all your tournaments from one dashboard</p>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/create-tournament')}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:bg-primary/90 transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Create Tournament
              </motion.button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
              {[
                { label: 'Total', value: stats.total, color: 'text-on-background' },
                { label: 'Drafts', value: stats.drafts, color: 'text-amber-500' },
                { label: 'Published', value: stats.published, color: 'text-primary' },
                { label: 'Completed', value: stats.completed, color: 'text-emerald-500' },
                { label: 'Registrations', value: stats.totalRegistrations, color: 'text-sky-500' },
                { label: 'Sponsor ₹', value: `₹${stats.totalSponsors.toLocaleString('en-IN')}`, color: 'text-secondary' },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-surface-container/50 border border-outline-variant/20 rounded-xl px-4 py-3"
                >
                  <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">{s.label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-surface-container/60 border border-outline-variant/20 rounded-xl p-1 mb-6 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                    activeTab === tab ? 'bg-primary text-white shadow-[0_0_12px_rgba(99,102,241,0.25)]' : 'text-on-surface-variant hover:text-on-background hover:bg-surface/50'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Search & Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, ID, or game..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/50 transition-colors"
                />
              </div>
              <select
                value={filterGame}
                onChange={(e) => setFilterGame(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/50"
              >
                <option value="">All Games</option>
                {games.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-surface-container/60 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/50"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="upcoming">Upcoming</option>
                <option value="registration open">Registration Open</option>
                <option value="registration closed">Registration Closed</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                <span className="ml-3 text-sm text-on-surface-variant">Loading tournaments...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="w-16 h-16 rounded-2xl bg-surface-container/60 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-on-surface-variant" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <h3 className="text-lg font-semibold text-on-background mb-1">
                  {activeTab === 'Drafts' ? 'No Draft Tournaments Yet' : activeTab === 'Published' ? 'No Published Tournaments Yet' : activeTab === 'Completed' ? 'No Completed Tournaments Yet' : activeTab === 'Archived' ? 'No Archived Tournaments' : 'No Tournaments Found'}
                </h3>
                <p className="text-sm text-on-surface-variant mb-6">
                  {activeTab === 'Drafts' ? 'Start creating a tournament and save it as a draft.' : activeTab === 'Published' ? 'Publish a tournament to make it visible to players.' : activeTab === 'Completed' ? 'Completed tournaments will appear here.' : 'No tournaments match your search criteria.'}
                </p>
                {(activeTab === 'Drafts' || activeTab === 'All Tournaments') && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => navigate('/create-tournament')}
                    className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-semibold shadow-[0_0_20px_rgba(99,102,241,0.3)]"
                  >
                    Create Tournament
                  </motion.button>
                )}
              </div>
            ) : (
              <div className="glass-card border border-outline-variant/20 rounded-2xl bg-surface-container-low/40 overflow-hidden shadow-xl backdrop-blur-md">
                <div className="overflow-x-auto w-full">
                  <table className="w-full border-collapse text-left text-xs leading-normal">
                    <thead>
                      <tr className="border-b border-outline-variant/20 bg-surface-container-highest/20 text-on-surface-variant/80 font-bold">
                        <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Tournament</th>
                        <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Game</th>
                        <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Slots Filled</th>
                        <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Prize Pool / Fee</th>
                        <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Status</th>
                        <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10">
                      {filtered.map((t, i) => {
                        const status = getStatus(t.status, t.isDraft)
                        const totalPrize = parseInt(t.prize_pool_amount) || 0
                        const registrations = parseInt(t.registrationCount) || parseInt(t.slotsFilled) || 0
                        const isOpen = menuOpenId === (t.id || i)

                        return (
                          <tr
                            key={t.id || i}
                            className="group border-b border-outline-variant/10 hover:bg-white/[0.02] cursor-pointer transition-colors"
                            onClick={() => { setActiveTournament(t); fetchRegistrations(t.id) }}
                          >
                            <td className="p-3 sm:p-4">
                              <div className="flex items-center gap-3">
                                {t.cover_image_url || t.bannerUrl ? (
                                  <img
                                    src={t.cover_image_url || t.bannerUrl}
                                    alt={t.title}
                                    className="w-10 h-10 rounded-lg object-cover border border-outline-variant/20"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-surface-container-highest/60 flex items-center justify-center border border-outline-variant/20 text-on-surface-variant font-bold">
                                    T
                                  </div>
                                )}
                                <div>
                                  <p className="font-bold text-on-background text-sm group-hover:text-primary transition-colors">
                                    {t.title || 'Untitled Tournament'}
                                  </p>
                                  <p className="text-[10px] text-on-surface-variant">by {t.orgName || 'My Organization'}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 sm:p-4">
                              <div className="flex items-center gap-1.5">
                                {getGameIcon(t.game) && (
                                  <img src={getGameIcon(t.game)} alt={t.game} className="w-4 h-4 object-contain" />
                                )}
                                <span className="font-semibold text-on-background uppercase">{t.game || '—'}</span>
                              </div>
                            </td>
                            <td className="p-3 sm:p-4">
                              <div className="flex flex-col gap-1 w-24">
                                <div className="flex items-center justify-between text-[10px] font-medium text-on-surface-variant">
                                  <span>{registrations} / {slotsTotal}</span>
                                  <span>{slotsTotal > 0 ? Math.round((registrations / slotsTotal) * 100) : 0}%</span>
                                </div>
                                <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary rounded-full transition-all duration-300"
                                    style={{ width: `${slotsTotal > 0 ? Math.min((registrations / slotsTotal) * 100, 100) : 0}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="p-3 sm:p-4">
                              <p className="font-bold text-emerald-500">₹{totalPrize.toLocaleString('en-IN')}</p>
                              <p className="text-[10px] text-on-surface-variant">Fee: {entryFee > 0 ? `₹${entryFee}` : 'Free'}</p>
                            </td>
                            <td className="p-3 sm:p-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${STATUS_BADGE[status] || STATUS_BADGE.draft}`}>
                                {statusLabel(status)}
                              </span>
                            </td>
                            <td className="p-3 sm:p-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="relative inline-block text-left">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(isOpen ? null : (t.id || i)) }}
                                  className="p-1.5 rounded-lg bg-surface-container-highest/60 hover:bg-surface-container-highest text-on-surface-variant hover:text-on-background transition-colors border border-outline-variant/20 shadow-sm"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                                </button>
                                <AnimatePresence>
                                  {isOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, scale: 0.95 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.95 }}
                                      className="absolute right-0 top-8 w-48 bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl z-30 overflow-hidden"
                                    >
                                      <div className="py-1">
                                        <MenuButton icon="eye" label="View" onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); handleAction('view', t) }} />
                                        {t.isDraft && <MenuButton icon="edit" label="Continue Editing" onClick={() => { setMenuOpenId(null); handleAction('edit', t) }} />}
                                        {!t.isDraft && <MenuButton icon="edit" label="Edit Tournament" onClick={() => { setMenuOpenId(null); handleAction('edit', t) }} />}
                                        <MenuButton icon="copy" label="Copy Link" onClick={() => { setMenuOpenId(null); handleAction('copy', t) }} />
                                        {!t.isDraft && <MenuButton icon="clipboard" label="Review Registrations" onClick={() => { setMenuOpenId(null); handleAction('review-registrations', t) }} />}
                                        {!t.isDraft && <MenuButton icon="users" label="Registrations" onClick={() => { setMenuOpenId(null); handleAction('registrations', t) }} />}
                                        {!t.isDraft && t.sponsors_enabled && <MenuButton icon="star" label="Sponsors" onClick={() => { setMenuOpenId(null); handleAction('sponsors', t) }} />}
                                        {!t.isDraft && <MenuButton icon="chart" label="Analytics" onClick={() => { setMenuOpenId(null); handleAction('analytics', t) }} />}
                                        {!t.isDraft && t.status !== 'archived' && t.status !== 'completed' && t.rounds_published === false && (
                                          <MenuButton icon="eye" label="Publish Rounds" onClick={() => { setMenuOpenId(null); handleAction('publish-rounds', t) }} />
                                        )}
                                        {!t.isDraft && t.status !== 'archived' && t.status !== 'completed' && t.rounds_published !== false && (
                                          <MenuButton icon="eyeOff" label="Hide Rounds" onClick={() => { setMenuOpenId(null); handleAction('hide-rounds', t) }} />
                                        )}
                                        <MenuButton icon="duplicate" label="Duplicate" onClick={() => { setMenuOpenId(null); handleAction('duplicate', t) }} />
                                        {!t.isDraft && t.status === 'live' && !t.finalized_at && (
                                          <MenuButton icon="check" label="Finalize Tournament" onClick={() => { setMenuOpenId(null); handleAction('finalize', t) }} />
                                        )}
                                        {!t.isDraft && t.finalized_at && (
                                          <MenuButton icon="star" label="Prize Awards" onClick={() => { setMenuOpenId(null); handleAction('prize-awards', t) }} />
                                        )}
                                        {t.status !== 'archived' && t.status !== 'completed' && (
                                          <>
                                            <MenuButton icon="calendar" label="Capacity Planning" onClick={() => { setMenuOpenId(null); handleAction('planning-config', t) }} />
                                            <MenuButton icon="clipboard" label="View Planning Result" onClick={() => { setMenuOpenId(null); handleAction('planning-result', t) }} />
                                            <MenuButton icon="calendar" label="Allocation Management" onClick={() => { setMenuOpenId(null); handleAction('allocations', t) }} />
                                          </>
                                        )}
                                        {!t.isDraft && t.status !== 'archived' && <MenuButton icon="archive" label="Archive" onClick={() => { setMenuOpenId(null); handleAction('archive', t) }} />}
                                        <MenuButton icon="trash" label="Delete" onClick={() => { setMenuOpenId(null); handleAction('delete', t) }} danger />
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Registrations Modal */}
      <AnimatePresence>
        {analyticsTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setAnalyticsTournament(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container border border-outline-variant/20 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-on-background">Registrations</h3>
                <button onClick={() => setAnalyticsTournament(null)} className="p-1.5 rounded-lg hover:bg-surface/50 text-on-surface-variant">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm font-medium text-on-background mb-1">{analyticsTournament.title}</p>
              <p className="text-xs text-on-surface-variant mb-4">ID: {analyticsTournament.id}</p>
              {analyticsCache[analyticsTournament.id] ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Total</p>
                      <p className="text-xl font-bold text-on-background">{analyticsCache[analyticsTournament.id].totalRegistrations}</p>
                    </div>
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Approved</p>
                      <p className="text-xl font-bold text-emerald-500">{analyticsCache[analyticsTournament.id].statusBreakdown?.approved || 0}</p>
                    </div>
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Pending</p>
                      <p className="text-xl font-bold text-amber-500">{analyticsCache[analyticsTournament.id].statusBreakdown?.pending || 0}</p>
                    </div>
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Waitlisted</p>
                      <p className="text-xl font-bold text-sky-500">{analyticsCache[analyticsTournament.id].statusBreakdown?.waitlisted || 0}</p>
                    </div>
                  </div>
                  <div className="bg-surface/50 rounded-xl p-3">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Registration Progress</p>
                    <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${analyticsCache[analyticsTournament.id].registrationProgress}%` }}
                        className="h-full bg-primary rounded-full"
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">{analyticsCache[analyticsTournament.id].slotsFilled} / {analyticsCache[analyticsTournament.id].slotsTotal} slots filled</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Loading analytics...</p>
              )}
              <button
                onClick={() => { setAnalyticsTournament(null); navigate(`/tournaments/${analyticsTournament.id}`) }}
                className="w-full mt-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                View Tournament Page
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Prize Awards and manual settlement (Phase 9C) */}
      <AnimatePresence>
        {prizeAwardsTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setPrizeAwardsTournament(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-surface-container border border-outline-variant/30 p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-on-background">Prize Awards</h2>
                  <p className="text-xs text-on-surface-variant mt-0.5">{prizeAwardsTournament.title}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPrizeAwardsTournament(null)}
                  className="text-on-surface-variant hover:text-on-background text-sm"
                >
                  Close
                </button>
              </div>

              {prizeAwardsLoading ? (
                <p className="text-sm text-on-surface-variant py-8 text-center">Loading…</p>
              ) : prizeAwards.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-on-surface-variant">
                    No prize awards yet. Generation creates immutable obligations from final standings and the configured prize distribution. No money is sent.
                  </p>
                  <button
                    type="button"
                    disabled={actionLoading === `generate-prize-awards:${prizeAwardsTournament.id}`}
                    onClick={async () => {
                      const t = prizeAwardsTournament
                      setActionLoading(`generate-prize-awards:${t.id}`)
                      setPrizeAwardsLoading(true)
                      try {
                        const token = await getAuthToken()
                        const headers = { 'Content-Type': 'application/json' }
                        if (token) headers['Authorization'] = `Bearer ${token}`
                        const res = await fetch(`/api/tournaments/${t.id}/prize-awards/generate`, { method: 'POST', headers })
                        const json = await res.json()
                        if (json.success) {
                          await refreshPrizePayouts(t.id, headers)
                          setPrizeAwardsMeta(prev => ({ ...prev, alreadyGenerated: true }))
                          showToast(json.alreadyGenerated ? 'Prize awards were already generated' : 'Prize awards generated')
                        } else {
                          showToast(json.message || json.error || 'Could not generate prize awards', 'error')
                        }
                      } catch {
                        showToast('Could not generate prize awards', 'error')
                      } finally {
                        setPrizeAwardsLoading(false)
                        setActionLoading(null)
                      }
                    }}
                    className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50"
                  >
                    Generate Prize Awards
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-on-surface-variant">
                    {prizeAwardsMeta?.award_count || prizeAwards.length} award{(prizeAwardsMeta?.award_count || prizeAwards.length) === 1 ? '' : 's'}
                    {' · '}
                    Total obligation ₹{(prizeAwardsMeta?.total_award_amount || 0).toLocaleString('en-IN')}
                    {' · '}
                    Manual UPI settlement only; this system does not send payments.
                  </p>
                  <div className="space-y-2">
                    {prizeAwards.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-xl border border-outline-variant/20 bg-surface/40 px-3 py-2.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-background truncate">
                            #{a.rank} · {a.team_name || a.team_id}
                          </p>
                          <p className="text-[11px] text-on-surface-variant mt-0.5">
                            Recipient: {a.recipient_user_id
                              ? (a.recipient_name || 'Team leader assigned')
                              : 'Pending assignment'}
                            {' · '}
                            {a.status === 'pending_payout' ? 'Pending payout' : a.status === 'pending_recipient' ? 'Pending recipient' : a.status}
                          </p>
                          {a.payout_upi_id && <p className="text-[11px] text-on-surface-variant mt-1">UPI ID: <span className="font-mono">{a.payout_upi_id}</span></p>}
                          {a.utr_reference && <p className="text-[11px] text-on-surface-variant mt-1">UTR: <span className="font-mono">{a.utr_reference}</span> · Paid {a.paid_at ? new Date(a.paid_at).toLocaleString() : ''}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <p className="text-sm font-bold text-emerald-500 whitespace-nowrap">₹{Number(a.prize_amount || 0).toLocaleString('en-IN')}</p>
                          {a.status !== 'paid' && a.status !== 'pending_recipient' && a.recipient_user_id && a.payout_upi_id && (
                            <button
                              type="button"
                              onClick={() => { setSettlementAward(settlementAward === a.id ? null : a.id); setSettlementUtr(''); setManualPaymentConfirmed(false) }}
                              className="rounded-lg border border-primary/40 px-2.5 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/10"
                            >Record UPI Payment</button>
                          )}
                        </div>
                        </div>
                      {settlementAward === a.id && (
                        <form
                          onSubmit={(event) => { event.preventDefault(); submitManualPayout(a) }}
                          className="mt-2 space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
                        >
                          <p className="text-xs font-semibold text-on-background">Payment has to be sent manually via UPI before marking this award as paid.</p>
                          <p className="text-[11px] text-on-surface-variant">Recipient: {a.recipient_name} · {a.payout_upi_id}</p>
                          <p className="text-[11px] text-on-surface-variant">Authoritative full award amount: <strong className="text-on-background">₹{Number(a.prize_amount).toLocaleString('en-IN')}</strong></p>
                          <label className="block text-[11px] font-semibold text-on-surface-variant">
                            UTR / payment reference
                            <input
                              required
                              minLength={6}
                              maxLength={128}
                              value={settlementUtr}
                              onChange={(event) => setSettlementUtr(event.target.value)}
                              className="mt-1 w-full rounded-lg border border-outline-variant/40 bg-surface px-3 py-2 text-sm text-on-background"
                              placeholder="Enter the UPI transaction reference"
                            />
                          </label>
                          <label className="flex items-start gap-2 text-[11px] text-on-surface-variant">
                            <input type="checkbox" checked={manualPaymentConfirmed} onChange={(event) => setManualPaymentConfirmed(event.target.checked)} className="mt-0.5" />
                            I confirm I have already sent the full amount manually to this recipient.
                          </label>
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setSettlementAward(null)} className="rounded-lg px-3 py-2 text-xs text-on-surface-variant">Cancel</button>
                            <button
                              type="submit"
                              disabled={!manualPaymentConfirmed || !settlementUtr.trim() || actionLoading === `settle-prize:${a.id}`}
                              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                            >{actionLoading === `settle-prize:${a.id}` ? 'Recording…' : 'Record payment'}</button>
                          </div>
                        </form>
                      )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Roadmap planning controls */}
      <AnimatePresence>
        {planningConfigTournament && (
          <TournamentPlanningConfigEditor
            tournamentId={planningConfigTournament.id}
            tournamentTitle={planningConfigTournament.title}
            onClose={() => setPlanningConfigTournament(null)}
            onSaved={() => {
              showToast('Roadmap planning saved successfully.')
            }}
          />
        )}
      </AnimatePresence>

      {/* Planning Result Card Modal */}
      <AnimatePresence>
        {planningResultTournament && (
          <TournamentPlanningResultCard
            tournamentId={planningResultTournament.id}
            tournamentTitle={planningResultTournament.title}
            onClose={() => setPlanningResultTournament(null)}
            onRegenerate={() => {
              showToast('Capacity plan regenerated successfully.')
            }}
            onApproved={() => {
              showToast('Capacity plan approved successfully.')
              fetchTournaments() // optionally refresh
            }}
          />
        )}
      </AnimatePresence>

      {/* Allocation Management Modal */}
      <AnimatePresence>
        {allocationTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto"
          >
            <div className="min-h-screen p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">Allocation Management</h2>
                  <p className="text-gray-400 text-sm mt-1">{allocationTournament.title}</p>
                </div>
                <button 
                  onClick={() => setAllocationTournament(null)} 
                  className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-xl transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="flex-1 bg-[#0A0C10] rounded-2xl border border-white/10 p-4 sm:p-6 shadow-2xl">
                <AllocationManagement tournamentId={allocationTournament.id} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  )
}


// ── Registration Manager (Master-Detail Drill-Down) ────────────
function RegistrationManager({
  tournament,
  registrations: propRegistrations,
  loading,
  actionLoading,
  onBack,
  onConfirm,
  onReject,
}) {
  const [selectedProof, setSelectedProof] = useState(null)

  const registrations = propRegistrations || []

  const status = tournament.isDraft ? 'draft' : tournament.status || 'draft'
  const entryFee = parseInt(tournament.entry_fee_amount) || 0
  const slotsTotal = parseInt(tournament.slotsTotal) || 0
  const confirmedCount = registrations.filter(r => r.status === 'confirmed' || r.status === 'approved').length
  const pendingCount = registrations.filter(r => r.status === 'pending' || r.status === 'pending_payment').length
  const rejectedCount = registrations.filter(r => r.status === 'rejected').length
  const totalPrize = parseInt(tournament.prize_pool_amount) || 0
  const progressPct = slotsTotal > 0 ? Math.round((confirmedCount / slotsTotal) * 100) : 0

  // Parse team members — supports both `teamMembers` array (mock) and `members` JSON string (server)
  const getTeamMembers = (reg) => {
    if (reg.teamMembers) return reg.teamMembers
    if (reg.members) {
      try {
        const parsed = typeof reg.members === 'string' ? JSON.parse(reg.members) : reg.members
        return Array.isArray(parsed) ? parsed : []
      } catch { return [] }
    }
    return []
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="animate-in fade-in duration-300">
      {/* SINGLE BREADCRUMB — Admin > Tournaments > Registration */}
      <nav className="flex items-center gap-2 mb-6 text-sm text-slate-500">
        <span className="text-slate-400">Admin</span>
        <span className="text-slate-400">›</span>
        <button onClick={onBack} className="font-medium text-blue-600 hover:text-blue-800 hover:underline transition-colors">
          Tournaments
        </button>
        <span className="text-slate-400">›</span>
        <span className="font-semibold text-slate-900">Registration</span>
      </nav>

      {/* Header Card — Tournament Info + Slots Progress */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 uppercase">{tournament.title || 'Untitled Tournament'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Game: <span className="font-semibold text-slate-700">{tournament.game || '—'}</span>
        </p>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-2 text-sm">
            <span className="text-slate-500">Slots Filled</span>
            <span className="font-bold text-slate-900">{confirmedCount} / {slotsTotal} Slots Confirmed</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              className="h-full bg-blue-600 rounded-full"
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[10px] text-slate-400">Pending: {pendingCount} · Rejected: {rejectedCount}</span>
            <span className="text-[10px] font-medium text-slate-500">{progressPct}% filled</span>
          </div>
        </div>
      </div>

      {/* Main: Registration Verification Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 bg-emerald-50 shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Registration Verification</h3>
            <p className="text-[11px] text-slate-500">Verify player payments and confirm slots</p>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Total</p>
            <p className="text-xl font-bold text-slate-900">{registrations.length}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Pending</p>
            <p className="text-xl font-bold text-amber-500">{pendingCount}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Approved</p>
            <p className="text-xl font-bold text-emerald-500">{confirmedCount}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">Rejected</p>
            <p className="text-xl font-bold text-rose-500">{rejectedCount}</p>
          </div>
        </div>

        {/* Data table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="w-6 h-6 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <span className="ml-3 text-sm text-slate-500">Loading registrations...</span>
          </div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-sm text-slate-500">No registrations yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-slate-500 bg-slate-50 rounded-xl">
                  <th className="text-left px-4 py-3 font-semibold rounded-l-xl">Player / Team Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Contact Info</th>
                  <th className="text-left px-4 py-3 font-semibold">Payment Details</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-right px-4 py-3 font-semibold rounded-r-xl">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map((reg) => {
                  const isPending = reg.status === 'pending' || reg.status === 'pending_payment'
                  const teamMembers = getTeamMembers(reg)
                  const amountDisplay = reg.amount || (entryFee > 0 ? `₹${entryFee.toLocaleString('en-IN')}` : 'Free')
                  const proofUrl = reg.proofImg || reg.screenshot_url
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Player / Team Column — teamName + full member roster */}
                      <td className="px-4 py-3 align-top min-w-[200px]">
                        <p className="font-bold text-slate-900 text-sm mb-1">
                          {reg.team_name || reg.teamName || '—'}
                        </p>
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                          {/* Render Captain first */}
                          {(() => {
                            const captainName = reg.captain || (teamMembers[0] && teamMembers[0].name) || (teamMembers[0] && teamMembers[0].ign) || '—';
                            const captainUid = reg.captain_uid || (teamMembers[0] && teamMembers[0].inGameId) || (teamMembers[0] && teamMembers[0].uid) || '—';
                            return (
                              <li className="leading-tight font-semibold text-slate-800 flex items-center gap-1">
                                <span>{captainName} (UID: {captainUid})</span>
                                <span className="text-[8px] bg-amber-500/10 text-amber-600 font-bold uppercase tracking-wider px-1 py-0.2 rounded border border-amber-500/20">Captain</span>
                              </li>
                            );
                          })()}
                          {/* Render remaining team members */}
                          {(() => {
                            const captainNameLower = (reg.captain || '').toLowerCase();
                            const captainUidLower = (reg.captain_uid || '').toLowerCase();
                            const remaining = teamMembers.filter((m, idx) => {
                              if (!reg.captain) return idx > 0;
                              const nameMatch = (m.name || m.ign || '').toLowerCase() === captainNameLower;
                              const uidMatch = (m.inGameId || m.uid || '').toLowerCase() === captainUidLower;
                              return !(nameMatch || uidMatch);
                            });
                            return remaining.map((m, idx) => (
                              <li key={idx} className="leading-tight pl-4 text-slate-500">
                                • {m.name || m.ign || '—'} (UID: {m.inGameId || m.uid || '—'})
                              </li>
                            ));
                          })()}
                        </ul>
                      </td>
                      {/* Contact Info Column — email, whatsapp with distinct labels */}
                      <td className="px-4 py-3 align-top min-w-[210px]">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-slate-455 w-[68px] shrink-0 whitespace-nowrap">Email</span>
                          <span className="text-sm text-slate-700 truncate select-all">{reg.email || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-green-600 w-[68px] shrink-0 whitespace-nowrap font-semibold">WhatsApp</span>
                          <span className="text-sm text-slate-700 select-all">{reg.phone || '—'}</span>
                        </div>
                      </td>
                       {/* Payment Details Column — amount, UTR, View Screenshot */}
                      <td className="px-4 py-3 align-top min-w-[210px]">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 w-[68px] shrink-0 whitespace-nowrap">Amount</span>
                          <span className="text-sm font-semibold text-green-600 select-all">{amountDisplay}</span>
                        </div>
                        {reg.transaction_id && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <span className="text-[9px] uppercase tracking-wider text-slate-400 w-[68px] shrink-0 whitespace-nowrap">UTR</span>
                            <span className="text-xs font-mono text-slate-700 select-all">{reg.transaction_id}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-blue-600 w-[68px] shrink-0 whitespace-nowrap font-semibold">Proof</span>
                          <button onClick={() => setSelectedProof(proofUrl)}
                            className="text-xs font-medium text-blue-600 hover:underline w-max block">
                            View Screenshot
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${REG_STATUS_BADGE[reg.status] || 'bg-slate-500/15 text-slate-400 border-slate-500/25'}`}>
                          {reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'Pending Payment' : reg.status === 'VERIFIED_BY_HOST' || reg.status === 'verified_by_host' ? 'Verified by Host' : reg.status ? reg.status.charAt(0).toUpperCase() + reg.status.slice(1) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        {(() => {
                          const statusLower = (reg.status || '').toLowerCase();
                          const isPendingStatus = statusLower === 'pending' || statusLower === 'pending_payment' || statusLower === 'pending_payment_verification';
                          const isConfirmedStatus = statusLower === 'confirmed' || statusLower === 'approved' || statusLower === 'verified_by_host';
                          
                          if (isPendingStatus) {
                            return (
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => onConfirm(reg.id)} disabled={actionLoading === reg.id}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-bold hover:bg-emerald-600 transition-all disabled:opacity-40 flex items-center gap-1 shadow-sm">
                                  {actionLoading === reg.id ? (
                                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  ) : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                  Approve
                                </button>
                                <button onClick={() => onReject(reg.id)} disabled={actionLoading === reg.id}
                                  className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold hover:bg-rose-600 transition-all disabled:opacity-40 flex items-center gap-1 shadow-sm">
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  Reject
                                </button>
                              </div>
                            );
                          }
                          
                          if (isConfirmedStatus) {
                            return (
                              <div className="flex items-center justify-end">
                                <button onClick={() => onReject(reg.id)} disabled={actionLoading === reg.id}
                                  className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-[11px] font-bold hover:bg-rose-600 transition-all disabled:opacity-40 flex items-center gap-1 shadow-sm">
                                  {actionLoading === reg.id ? (
                                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  ) : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                                  Reject
                                </button>
                              </div>
                            );
                          }
                          
                          return (
                            <span className="text-[11px] text-slate-400 italic">Handled</span>
                          );
                        })()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for viewing payment screenshot */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedProof(null)}>
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Payment Screenshot</h3>
              <button onClick={() => setSelectedProof(null)} className="text-slate-400 hover:text-slate-700 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 bg-slate-50 flex justify-center">
              <img src={selectedProof} alt="Payment Proof" className="max-h-[60vh] object-contain rounded border border-slate-200 shadow-sm" />
            </div>
            <div className="p-4 border-t border-slate-100 flex justify-end">
              <button onClick={() => setSelectedProof(null)} className="px-4 py-2 text-sm font-bold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  )
}

function MenuButton({ icon, label, onClick, danger }) {
  const icons = {
    eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    eyeOff: 'M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18',
    edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
    star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    duplicate: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    clipboard: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    play: 'M8 5v14l11-7z',
    check: 'M5 13l4 4L19 7',
    calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  }
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
        danger ? 'text-rose-500 hover:bg-rose-500/10' : 'text-on-surface-variant hover:bg-surface/50 hover:text-on-background'
      }`}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icons[icon] || icons.eye} /></svg>
      {label}
    </button>
  )
}
