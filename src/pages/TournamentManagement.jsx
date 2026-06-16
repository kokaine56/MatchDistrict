import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../UserContext'
import { getAuthToken } from '../utils/getAuthToken'
import { normalizeTournamentRow } from '../utils/api'
import TournamentCard from '../components/TournamentCard'

const TABS = ['All Tournaments', 'Drafts', 'Published', 'Completed', 'Archived']

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

function formatDate(d) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' }) }
  catch { return d }
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
  const [selectedTournament, setSelectedTournament] = useState(null)
  const [analyticsCache, setAnalyticsCache] = useState({})
  const [actionLoading, setActionLoading] = useState(null)
  const [menuOpenId, setMenuOpenId] = useState(null)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (!currentUser || (currentUser.role !== 'organiser' && currentUser.role !== 'admin')) {
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
        case 'delete':
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
          setSelectedTournament(t)
          fetchAnalytics(t.id)
          break
        case 'sponsors':
          navigate(`/tournaments/${t.id}`)
          break
        case 'analytics':
          setSelectedTournament(t)
          fetchAnalytics(t.id)
          break
      }
    } catch (err) {
      showToast('Action failed: ' + err.message, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  if (!currentUser || (currentUser.role !== 'organiser' && currentUser.role !== 'admin')) return null

  return (
    <div className="min-h-screen bg-background">
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

        {/* Tournament List */}
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
          <div className="space-y-3">
            {filtered.map((t, i) => {
              const status = getStatus(t.status, t.isDraft)
              const entryFee = parseInt(t.entry_fee_amount) || 0
              const slotsTotal = parseInt(t.slotsTotal) || 0
              const basePool = entryFee * slotsTotal
              const sponsorAmount = parseFloat(t.sponsorRevenue) || parseFloat(t.totalSponsorContributions) || 0
              const totalPrize = (parseInt(t.prize_pool_amount) || basePool) + sponsorAmount
              const registrations = parseInt(t.registrationCount) || parseInt(t.slotsFilled) || 0
              const isOpen = menuOpenId === (t.id || i)

              return (
                <div key={t.id || i} className="relative">
                  <TournamentCard
                    id={t.id}
                    title={t.title || 'Untitled Tournament'}
                    game={t.game}
                    badgeText={statusLabel(status)}
                    badgeBg={STATUS_BADGE[status] || STATUS_BADGE.draft}
                    badgeTextColor=""
                    imgSrc={t.cover_image_url || t.bannerUrl}
                    imgAlt={t.title}
                    prizePool={`₹${totalPrize.toLocaleString('en-IN')}`}
                    entryFee={entryFee > 0 ? `₹${entryFee}` : 'Free'}
                    matchType={t.match_type || 'squad'}
                    perspective={t.perspective || 'tpp'}
                    slotsTotal={slotsTotal}
                    slotsFilled={registrations}
                    entryFeeAmount={entryFee}
                    orgName={t.orgName || 'My Organization'}
                    orgTier={t.orgTier || 'pro'}
                    buttonText="View Details"
                    onNavigate={(route, id) => handleAction('view', t)}
                    hasSponsors={t.hasApprovedSponsors || false}
                  />
                  {/* 3-dot action menu overlay */}
                  <div className="absolute top-3 right-3 z-10">
                    <button
                      onClick={() => setMenuOpenId(isOpen ? null : (t.id || i))}
                      className="p-1.5 rounded-lg bg-surface/80 backdrop-blur-sm text-on-surface-variant hover:text-on-background transition-colors border border-outline-variant/20 shadow-sm"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" /></svg>
                    </button>
                    <AnimatePresence>
                      {isOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="absolute right-0 top-10 w-48 bg-surface-container border border-outline-variant/20 rounded-xl shadow-xl z-30 overflow-hidden"
                        >
                          <div className="py-1">
                            <MenuButton icon="eye" label="View" onClick={() => { setMenuOpenId(null); handleAction('view', t) }} />
                            {t.isDraft && <MenuButton icon="edit" label="Continue Editing" onClick={() => { setMenuOpenId(null); handleAction('edit', t) }} />}
                            {!t.isDraft && <MenuButton icon="edit" label="Edit Tournament" onClick={() => { setMenuOpenId(null); handleAction('edit', t) }} />}
                            <MenuButton icon="copy" label="Copy Link" onClick={() => { setMenuOpenId(null); handleAction('copy', t) }} />
                            {!t.isDraft && <MenuButton icon="users" label="Registrations" onClick={() => { setMenuOpenId(null); handleAction('registrations', t) }} />}
                            {!t.isDraft && t.sponsors_enabled && <MenuButton icon="star" label="Sponsors" onClick={() => { setMenuOpenId(null); handleAction('sponsors', t) }} />}
                            {!t.isDraft && <MenuButton icon="chart" label="Analytics" onClick={() => { setMenuOpenId(null); handleAction('analytics', t) }} />}
                            <div className="border-t border-outline-variant/10 my-1" />
                            <MenuButton icon="duplicate" label="Duplicate" onClick={() => { setMenuOpenId(null); handleAction('duplicate', t) }} />
                            {!t.isDraft && t.status !== 'archived' && <MenuButton icon="archive" label="Archive" onClick={() => { setMenuOpenId(null); handleAction('archive', t) }} />}
                            <MenuButton icon="trash" label="Delete" onClick={() => { setMenuOpenId(null); handleAction('delete', t) }} danger />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Registrations Modal */}
      <AnimatePresence>
        {selectedTournament && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedTournament(null)}
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
                <button onClick={() => setSelectedTournament(null)} className="p-1.5 rounded-lg hover:bg-surface/50 text-on-surface-variant">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <p className="text-sm font-medium text-on-background mb-1">{selectedTournament.title}</p>
              <p className="text-xs text-on-surface-variant mb-4">ID: {selectedTournament.id}</p>
              {analyticsCache[selectedTournament.id] ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Total</p>
                      <p className="text-xl font-bold text-on-background">{analyticsCache[selectedTournament.id].totalRegistrations}</p>
                    </div>
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Approved</p>
                      <p className="text-xl font-bold text-emerald-500">{analyticsCache[selectedTournament.id].statusBreakdown?.approved || 0}</p>
                    </div>
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Pending</p>
                      <p className="text-xl font-bold text-amber-500">{analyticsCache[selectedTournament.id].statusBreakdown?.pending || 0}</p>
                    </div>
                    <div className="bg-surface/50 rounded-xl p-3">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-wider">Waitlisted</p>
                      <p className="text-xl font-bold text-sky-500">{analyticsCache[selectedTournament.id].statusBreakdown?.waitlisted || 0}</p>
                    </div>
                  </div>
                  <div className="bg-surface/50 rounded-xl p-3">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-wider mb-1">Registration Progress</p>
                    <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${analyticsCache[selectedTournament.id].registrationProgress}%` }}
                        className="h-full bg-primary rounded-full"
                      />
                    </div>
                    <p className="text-xs text-on-surface-variant mt-1">{analyticsCache[selectedTournament.id].slotsFilled} / {analyticsCache[selectedTournament.id].slotsTotal} slots filled</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant">Loading analytics...</p>
              )}
              <button
                onClick={() => { setSelectedTournament(null); navigate(`/tournaments/${selectedTournament.id}`) }}
                className="w-full mt-4 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                View Tournament Page
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// (local TournamentCard redefinition removed — replaced by shared TournamentCard with action overlay)

function MenuButton({ icon, label, onClick, danger }) {
  const icons = {
    eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    copy: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
    star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    duplicate: 'M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z',
    archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
    trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
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
