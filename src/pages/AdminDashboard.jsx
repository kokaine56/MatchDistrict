import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../ThemeContext.jsx'
import { motion, AnimatePresence } from 'framer-motion'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { subscriptionApi } from '../services/subscriptionApi.js'
import ActivityFeed from '../components/ActivityFeed'
import { injectDummyRegistrations } from '../utils/testInjector'
import { ROLES, hasRole, getUserRoles, hasCapability, hasOrganizerRights, ROLE_LABELS, getNextPromotionRole, getNextDemotionRole } from '../utils/iamRoles.js'
import AdminLayout from '../components/admin/AdminLayout.jsx'

export default function AdminDashboard({ onNavigate }) {
  const { theme, setTheme } = useTheme()
  const [currentUser, setCurrentUser] = useCurrentUser()

  // Active Tab
  const [activeTab, setActiveTab] = useState('overview')

  // API Data States
  const [kycApplications, setKycApplications] = useState([])
  const [upgradeRequests, setUpgradeRequests] = useState([])
  const [usersList, setUsersList] = useState([])
  const [activityLogs, setActivityLogs] = useState([])
  const [tournamentsList, setTournamentsList] = useState([])
  const [tournamentsLoading, setTournamentsLoading] = useState(false)
  const [tournamentSearchQuery, setTournamentSearchQuery] = useState('')
  const [financials, setFinancials] = useState({
    totalPrizePools: 0,
    totalOperationalRevenue: 0,
    activeTourneysCount: 0,
    platformFeePercentage: 10,
    ledger: [],
    engagementCurve: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    trafficBars: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  })
  const [commissionSaving, setCommissionSaving] = useState(false)
  const [themeMode, setThemeMode] = useState('dark')

  // UI state for Toast
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  // Modals & Details view states
  const [selectedKycApp, setSelectedKycApp] = useState(null)
  const [adminNotes, setAdminNotes] = useState('')
  const [kycActionLoading, setKycActionLoading] = useState(false)
  const [upgradeActionLoading, setUpgradeActionLoading] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [purgeLoading, setPurgeLoading] = useState(false)

  // Injector state
  const [injectTournamentId, setInjectTournamentId] = useState('')
  const [injectSlotCount, setInjectSlotCount] = useState(1000)
  const [isInjecting, setIsInjecting] = useState(false)

  // ── Abuse Filter state ────────────────────────────────────────────────────
  const [badWordsList, setBadWordsList] = useState([])   // Current saved list
  const [badWordsInput, setBadWordsInput] = useState('') // Raw textarea input
  const [badWordsSaving, setBadWordsSaving] = useState(false)
  const [badWordsFilter, setBadWordsFilter] = useState('') // search within list
  
  // Search state for users
  const [userSearchQuery, setUserSearchQuery] = useState('')

  // Build auth headers using Supabase session token — no localStorage
  const getHeaders = async () => {
    const token = await getAuthToken()
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  }

  const fetchKycApplications = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/org/applications', { headers: await getHeaders() })
    if (ok && data?.success) setKycApplications(data.applications || [])
  }

  const fetchUpgradeRequests = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/org/upgrade-requests', { headers: await getHeaders() })
    if (ok && data?.success) setUpgradeRequests(data.requests || [])
  }

  const fetchUsers = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/users', { headers: await getHeaders() })
    if (ok && data?.success) setUsersList(data.users || [])
  }

  const fetchTournaments = async () => {
    setTournamentsLoading(true)
    const { ok, data } = await fetchJsonWithRetry('/api/tournaments', { headers: await getHeaders() })
    if (ok && data?.success) setTournamentsList(data.tournaments || [])
    setTournamentsLoading(false)
  }

  const handleDeleteTournament = async (tId) => {
    const doubleCheck = window.confirm('Are you sure you want to permanently delete this tournament and all associated registrations, messages, and notices?')
    if (!doubleCheck) return
    try {
      const res = await fetch(`/api/tournaments/${tId}`, {
        method: 'DELETE',
        headers: await getHeaders()
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('Tournament deleted successfully.')
        fetchTournaments()
        fetchActivityLogs()
      } else {
        triggerToast(data.message || 'Failed to delete tournament.')
      }
    } catch {
      triggerToast('Error deleting tournament.')
    }
  }

  const handleToggleUserStatus = async (user) => {
    const nextStatus = user.status === 'Held' ? 'Active' : 'Held'
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ status: nextStatus })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`Organizer event hosting privilege set to: ${nextStatus}`)
        fetchUsers()
        fetchActivityLogs()
      } else {
        triggerToast(data.error || 'Failed to update user status')
      }
    } catch {
      triggerToast('Error updating user status')
    }
  }

  const handleRevokeOrganizerRole = async (user) => {
    const doubleCheck = window.confirm(`Are you sure you want to revoke the organizer role from ${user.name || user.email}? They will be demoted to player status.`)
    if (!doubleCheck) return
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ role: 'user', orgApplicationStatus: 'none', tier: 'Amateur' })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('Organizer role revoked successfully')
        fetchUsers()
        fetchActivityLogs()
      } else {
        triggerToast(data.error || 'Failed to revoke organizer role')
      }
    } catch {
      triggerToast('Error revoking organizer role')
    }
  }

  const fetchFinancials = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/admin/financials', { headers: await getHeaders() })
    if (ok && data?.success) {
      setFinancials({
        totalPrizePools: Number(data.totalPrizePools || 0),
        totalOperationalRevenue: Number(data.totalOperationalRevenue || 0),
        activeTourneysCount: Number(data.activeTourneysCount || 0),
        platformFeePercentage: Number(data.platformFeePercentage || 10),
        ledger: data.ledger || [],
        engagementCurve: data.engagementCurve || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        trafficBars: data.trafficBars || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      })
    }
  }

  const fetchActivityLogs = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/admin/activity-log', { headers: await getHeaders() })
    if (ok && data?.success) setActivityLogs(data.logs || [])
  }

  const fetchBadWords = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/admin/badwords')
    if (ok && data?.success) {
      setBadWordsList(data.words || [])
    }
  }

  const saveBadWords = async () => {
    setBadWordsSaving(true)
    try {
      // Parse the textarea: split by comma, newline, or semicolon
      const parsed = badWordsInput
        .split(/[,;\n]+/)
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0 && w.length <= 100)
      const merged = [...new Set([...badWordsList, ...parsed])]
      const res = await fetch('/api/admin/badwords', {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ words: merged })
      })
      const data = await res.json()
      if (data.success) {
        setBadWordsList(data.words)
        setBadWordsInput('')
        triggerToast(`✅ Banned word list saved — ${data.count} words active`)
      } else {
        triggerToast(data.error || 'Failed to save bad words list')
      }
    } catch (err) {
      triggerToast('Network error saving word list')
    } finally {
      setBadWordsSaving(false)
    }
  }

  const removeWord = async (wordToRemove) => {
    const updated = badWordsList.filter(w => w !== wordToRemove)
    try {
      const res = await fetch('/api/admin/badwords', {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ words: updated })
      })
      const data = await res.json()
      if (data.success) {
        setBadWordsList(data.words)
        triggerToast(`Removed "${wordToRemove}" from banned list`)
      }
    } catch {
      triggerToast('Error removing word')
    }
  }

  const fetchGlobalThemeSetting = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/settings/theme')
    if (ok && data?.success && data.theme) setThemeMode(data.theme)
  }

  const loadAllAdminData = useCallback(() => {
    fetchKycApplications()
    fetchUpgradeRequests()
    fetchUsers()
    fetchTournaments()
    fetchFinancials()
    fetchActivityLogs()
    fetchGlobalThemeSetting()
    fetchBadWords()
  }, [])

  const isAdmin = currentUser?.role === 'admin'

  useEffect(() => {
    if (currentUser && !isAdmin) {
      onNavigate && onNavigate('home')
    } else if (!currentUser) {
      onNavigate && onNavigate('login')
    }
  }, [currentUser, isAdmin, onNavigate])

  useEffect(() => {
    if (isAdmin) loadAllAdminData()
  }, [isAdmin, loadAllAdminData])

  useRefetchOnFocus(loadAllAdminData, isAdmin)

  // Handle global theme setting toggle
  const handleThemeSettingChange = async (newTheme) => {
    try {
      const res = await fetch('/api/settings/theme', {
        method: 'PUT',
        headers: await getHeaders(),
        body: JSON.stringify({ theme: newTheme })
      })
      const data = await res.json()
      if (data.success) {
        setThemeMode(newTheme)
        setTheme(newTheme)
        triggerToast(`Global Theme switched to ${newTheme.toUpperCase()}`)
      } else {
        triggerToast(data.error || 'Failed to update global theme setting')
      }
    } catch (e) {
      console.error('Error changing global theme setting:', e)
      triggerToast('Error saving theme configuration')
    }
  }

  // Handle commission percentage save
  const handleSaveCommission = async (newPercentage) => {
    setCommissionSaving(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/settings/platform-fee', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ percentage: newPercentage })
      })
      const data = await res.json()
      if (data.success) {
        setFinancials(prev => ({ ...prev, platformFeePercentage: data.percentage }))
        triggerToast(`Commission rate updated to ${data.percentage}%`)
      } else {
        triggerToast(data.error || 'Failed to update commission rate')
      }
    } catch (err) {
      triggerToast('Network error saving commission rate')
    } finally {
      setCommissionSaving(false)
    }
  }

  // Handle KYC verification approval / rejection
  const handleKycReview = async (status) => {
    if (!selectedKycApp) return
    setKycActionLoading(true)

    try {
      const res = await fetch('/api/org/approve', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          id: selectedKycApp.id,
          status,
          email: selectedKycApp.email,
          adminNotes: adminNotes.trim()
        })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`KYC Request ${selectedKycApp.id} ${status.toUpperCase()}!`)
        setSelectedKycApp(null)
        setAdminNotes('')
        fetchKycApplications()
        fetchActivityLogs()
      } else {
        triggerToast(data.error || 'Error submitting KYC action')
      }
    } catch (err) {
      console.error('KYC response failure:', err)
      triggerToast('Network error responding to KYC request')
    } finally {
      setKycActionLoading(false)
    }
  }

  // Handle premium upgrade requests approval / rejection
  const handleUpgradeRespond = async (request, status) => {
    setUpgradeActionLoading(true)
    try {
      const res = await fetch('/api/org/upgrade-respond', {
        method: 'POST',
        headers: await getHeaders(),
        body: JSON.stringify({
          id: request.id,
          status,
          organizer_id: request.organizer_id,
          requested_plan: request.requested_plan
        })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`Upgrade Request ${request.id} ${status.toUpperCase()}!`)
        fetchUpgradeRequests()
        fetchFinancials()
        fetchActivityLogs()
      } else {
        triggerToast(data.error || 'Error responding to upgrade request')
      }
    } catch (err) {
      console.error('Upgrade response error:', err)
      triggerToast('Network error responding to upgrade request')
    } finally {
      setUpgradeActionLoading(false)
    }
  }

  // Handle User Purge
  const handleSystemPurge = async () => {
    const doubleCheck = window.confirm('CRITICAL ACTION: Are you sure you want to purge all test match registrations, tournaments, and sandbox wallets? This action cannot be undone.')
    if (!doubleCheck) return

    setPurgeLoading(true)
    try {
      const res = await fetch('/api/admin/purge', {
        method: 'POST',
        headers: await getHeaders()
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('System mock data purged to clean state!')
        loadAllAdminData()
      } else {
        triggerToast(data.error || 'Purge request rejected by server')
      }
    } catch (err) {
      console.error('Purge endpoint failure:', err)
      triggerToast('Error connecting to system purge endpoint')
    } finally {
      setPurgeLoading(false)
    }
  }

  // Handle Slot Injection
  const handleInjectSlots = async () => {
    if (!injectTournamentId.trim()) {
      triggerToast('Please enter a Tournament ID.')
      return
    }
    const confirmMsg = `⚠️ DANGER: This will inject ${injectSlotCount} dummy registrations into tournament "${injectTournamentId.trim()}". This is a destructive test action. Continue?`
    if (!window.confirm(confirmMsg)) return

    setIsInjecting(true)
    const result = await injectDummyRegistrations(injectTournamentId.trim(), injectSlotCount)
    setIsInjecting(false)

    if (result.success) {
      triggerToast(result.message)
    } else {
      triggerToast(`Injection failed: ${result.error}`)
    }
  }

  // Handle User Deletion
  const handleDeleteUser = async () => {
    if (!deleteUserId) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/users/${deleteUserId}`, {
        method: 'DELETE',
        headers: await getHeaders()
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('User account successfully terminated from database.')
        setDeleteUserId(null)
        fetchUsers()
        fetchActivityLogs()
      } else {
        triggerToast(data.error || 'Failed to delete user account.')
      }
    } catch (err) {
      console.error('Error deleting user:', err)
      triggerToast('Network error deleting user.')
    } finally {
      setDeleteLoading(false)
    }
  }

  // Filter users by search input
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery) return usersList
    const q = userSearchQuery.toLowerCase()
    return usersList.filter(u => 
      (u.name && u.name.toLowerCase().includes(q)) || 
      (u.email && u.email.toLowerCase().includes(q)) || 
      (u.gamerTag && u.gamerTag.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    )
  }, [usersList, userSearchQuery])

  // Custom Chart SVG Coordinates (overview stats)
  const svgWidth = 500
  const svgHeight = 220
  const padding = 30
  
  const engagementCurve = financials.engagementCurve
  const trafficBars = financials.trafficBars

  const linePoints = useMemo(() => {
    const maxVal = Math.max(...engagementCurve) * 1.1 || 1
    return engagementCurve.map((val, idx) => {
      const x = padding + (idx * (svgWidth - 2 * padding)) / (engagementCurve.length - 1)
      const y = svgHeight - padding - (val * (svgHeight - 2 * padding)) / maxVal
      return { x, y, val }
    })
  }, [engagementCurve])

  const linePath = useMemo(() => {
    return linePoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }, [linePoints])

  const barWidth = 18
  const barChartPoints = useMemo(() => {
    const maxVal = Math.max(...trafficBars) * 1.1 || 1
    return trafficBars.map((val, idx) => {
      const x = padding + (idx * (svgWidth - 2 * padding)) / (trafficBars.length - 1) - barWidth / 2
      const height = (val * (svgHeight - 2 * padding)) / maxVal
      const y = svgHeight - padding - height
      return { x, y, height, val }
    })
  }, [trafficBars])

  // Render nothing while redirecting if the user is not verified admin
  if (!currentUser || !hasRole(getUserRoles(currentUser), ROLES.ADMIN)) {
    return null
  }

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onNavigate={onNavigate}
      currentUser={currentUser}
      badges={{
        kyc: kycApplications.filter(a => a.status === 'pending').length,
        upgrades: upgradeRequests.filter(r => r.status === 'pending').length,
        badWordsCount: badWordsList.length,
      }}
    >

        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            {/* Core KPIs grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">

              {/* Card 1: Total Prize Pools */}
              <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-outline-variant/30 bg-surface-container-low/40 flex flex-col justify-between space-y-3 shadow-sm backdrop-blur-md">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border text-indigo-500 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-lg sm:text-xl">payments</span>
                </div>
                <div className="space-y-0.5">
                  <div className="font-label-caps text-[9px] sm:text-[10px] text-slate-700 dark:text-white/50 uppercase font-bold tracking-wider">TOTAL PRIZE POOLS</div>
                  <div className="font-prize-display text-base sm:text-xl font-black text-slate-900 dark:text-white">₹{financials.totalPrizePools.toLocaleString('en-IN')}</div>
                  <p className="font-body-sm text-[8px] sm:text-[10px] text-slate-600 dark:text-white/40 truncate leading-none">Sum of ongoing &amp; upcoming arenas</p>
                </div>
              </div>

              {/* Card 2: Commission Pool (editable %) */}
              <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-outline-variant/30 bg-surface-container-low/40 flex flex-col justify-between space-y-3 shadow-sm backdrop-blur-md">
                <div className="flex items-center justify-between">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center border text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20 shadow-sm shrink-0">
                    <span className="material-symbols-outlined text-lg sm:text-xl">percent</span>
                  </div>
                  <CommissionEditor
                    percentage={financials.platformFeePercentage}
                    onSave={handleSaveCommission}
                    saving={commissionSaving}
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="font-label-caps text-[9px] sm:text-[10px] text-slate-700 dark:text-white/50 uppercase font-bold tracking-wider">COMMISSION POOL</div>
                  <div className="font-prize-display text-base sm:text-xl font-black text-slate-900 dark:text-white">₹{Math.round(financials.totalOperationalRevenue).toLocaleString('en-IN')}</div>
                  <p className="font-body-sm text-[8px] sm:text-[10px] text-slate-600 dark:text-white/40 truncate leading-none">At {financials.platformFeePercentage}% platform fee</p>
                </div>
              </div>

              {/* Card 3: Active Arenas */}
              <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-outline-variant/30 bg-surface-container-low/40 flex flex-col justify-between space-y-3 shadow-sm backdrop-blur-md">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border text-secondary bg-secondary/10 border-secondary/20 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-lg sm:text-xl">stadium</span>
                </div>
                <div className="space-y-0.5">
                  <div className="font-label-caps text-[9px] sm:text-[10px] text-slate-700 dark:text-white/50 uppercase font-bold tracking-wider">ACTIVE ARENAS</div>
                  <div className="font-prize-display text-base sm:text-xl font-black text-slate-900 dark:text-white">{financials.activeTourneysCount}</div>
                  <p className="font-body-sm text-[8px] sm:text-[10px] text-slate-600 dark:text-white/40 truncate leading-none">Live &amp; upcoming tournaments</p>
                </div>
              </div>

              {/* Card 4: Gamer Roster */}
              <div className="glass-card p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-outline-variant/30 bg-surface-container-low/40 flex flex-col justify-between space-y-3 shadow-sm backdrop-blur-md">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center border text-primary bg-primary/10 border-primary/20 shadow-sm shrink-0">
                  <span className="material-symbols-outlined text-lg sm:text-xl">groups</span>
                </div>
                <div className="space-y-0.5">
                  <div className="font-label-caps text-[9px] sm:text-[10px] text-slate-700 dark:text-white/50 uppercase font-bold tracking-wider">GAMER ROSTER</div>
                  <div className="font-prize-display text-base sm:text-xl font-black text-slate-900 dark:text-white">{usersList.length}</div>
                  <p className="font-body-sm text-[8px] sm:text-[10px] text-slate-600 dark:text-white/40 truncate leading-none">Total registered platform users</p>
                </div>
              </div>

            </div>

            {/* Charts section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              
              {/* Chart 1: Registration Velocity */}
              <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div className="border-b border-outline-variant/30 pb-3 flex items-center justify-between">
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold uppercase flex items-center gap-1.5 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-primary text-xl">insights</span>
                    <span>Engagement Trajectory</span>
                  </h3>
                  <span className="font-label-caps text-[9px] font-bold text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 uppercase tracking-widest">
                    LIVE SIGNUPS
                  </span>
                </div>
                
                <div className="relative w-full overflow-x-auto no-scrollbar pt-2">
                  <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full min-w-[400px] h-[190px] overflow-visible">
                    <defs>
                      <linearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#c0c1ff" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#c0c1ff" stopOpacity="0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Ticks */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                      <line
                        key={i}
                        x1={padding}
                        y1={padding + ratio * (svgHeight - 2 * padding)}
                        x2={svgWidth - padding}
                        y2={padding + ratio * (svgHeight - 2 * padding)}
                        stroke={theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}
                        strokeWidth="1"
                      />
                    ))}

                    {/* Area under the line */}
                    {linePoints.length > 0 && (
                      <path
                        d={`${linePath} L ${linePoints[linePoints.length - 1].x} ${svgHeight - padding} L ${linePoints[0].x} ${svgHeight - padding} Z`}
                        fill="url(#glowGrad)"
                      />
                    )}

                    {/* Main Line */}
                    <path
                      d={linePath}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                    />

                    {/* Interactive dots */}
                    {linePoints.map((pt, idx) => (
                      <g key={idx}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="5"
                          fill={theme === 'dark' ? '#07080C' : '#ffffff'}
                          stroke="#6366f1"
                          strokeWidth="3"
                          className="hover:scale-125 cursor-pointer transition-transform duration-100"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 12}
                          textAnchor="middle"
                          fill="#6366f1"
                          fontSize="8"
                          fontWeight="bold"
                          className="font-mono dark:text-indigo-400"
                        >
                          {pt.val}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Chart 2: Page Views Bar Chart */}
              <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div className="border-b border-outline-variant/30 pb-3 flex items-center justify-between">
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold uppercase flex items-center gap-1.5 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-secondary text-xl">query_stats</span>
                    <span>Platform Pulse</span>
                  </h3>
                  <span className="font-label-caps text-[9px] font-bold text-secondary px-2 py-0.5 rounded-full bg-secondary/10 border border-secondary/20 uppercase tracking-widest">
                    DAILY VISITS
                  </span>
                </div>

                <div className="relative w-full overflow-x-auto no-scrollbar pt-2">
                  <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full min-w-[400px] h-[190px] overflow-visible">
                    <defs>
                      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ff0055" stopOpacity="0.45" />
                        <stop offset="100%" stopColor="#ff0055" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Ticks */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
                      <line
                        key={i}
                        x1={padding}
                        y1={padding + ratio * (svgHeight - 2 * padding)}
                        x2={svgWidth - padding}
                        y2={padding + ratio * (svgHeight - 2 * padding)}
                        stroke={theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)'}
                        strokeWidth="1"
                      />
                    ))}

                    {/* Columns */}
                    {barChartPoints.map((bar, idx) => (
                      <g key={idx} className="group">
                        <rect
                          x={bar.x}
                          y={bar.y}
                          width={barWidth}
                          height={bar.height}
                          fill="url(#barGrad)"
                          stroke="#ff0055"
                          strokeWidth="1"
                          rx="4"
                          className="hover:opacity-80 transition-all duration-100 cursor-pointer"
                        />
                        <text
                          x={bar.x + barWidth / 2}
                          y={bar.y - 8}
                          textAnchor="middle"
                          fill="#ff0055"
                          fontSize="8"
                          fontWeight="bold"
                          className="font-mono hidden group-hover:block"
                        >
                          {bar.val}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

            </div>

            {/* Site Configuration & Purge Panel */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Site Settings */}
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div>
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl">tune</span>
                    <span>Site Configuration</span>
                  </h3>
                  <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                    Sync site-wide styles and set authoritative system defaults in PostgreSQL.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-white/5 rounded-xl p-3.5 flex items-center justify-between bg-slate-100/35 dark:bg-white/[0.01]">
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs font-bold text-slate-900 dark:text-white">Theme Synchronization</h4>
                    <p className="font-body-sm text-[10px] text-slate-600 dark:text-white/40">Force platform alignment with site settings theme.</p>
                  </div>
                  
                  <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-lg p-0.5 shrink-0">
                    <button
                      onClick={() => handleThemeSettingChange('light')}
                      className={`px-3 py-1 rounded-md font-label-caps text-[9px] font-extrabold uppercase tracking-wider transition-all ${
                        themeMode === 'light' 
                          ? 'bg-white dark:bg-white/10 text-primary dark:text-white shadow-sm' 
                          : 'text-slate-600 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Light
                    </button>
                    <button
                      onClick={() => handleThemeSettingChange('dark')}
                      className={`px-3 py-1 rounded-md font-label-caps text-[9px] font-extrabold uppercase tracking-wider transition-all ${
                        themeMode === 'dark' 
                          ? 'bg-white dark:bg-white/10 text-primary dark:text-white shadow-sm' 
                          : 'text-slate-600 dark:text-white/40 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      Dark
                    </button>
                  </div>
                </div>
              </div>

              {/* Maintenance Tools */}
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div>
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-rose-500 text-xl">construction</span>
                    <span>Maintenance &amp; Purge</span>
                  </h3>
                  <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                    Purge test matches and clean database schemas for active production resets.
                  </p>
                </div>

                <div className="border border-rose-500/10 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-500/[0.02]">
                  <div className="space-y-0.5">
                    <h4 className="font-headline-md text-xs font-bold text-slate-900 dark:text-white">Flush Sandbox Transactions</h4>
                    <p className="font-body-sm text-[10px] text-slate-600 dark:text-white/40">Truncate matches, timelines, registers &amp; wallets.</p>
                  </div>

                  <button
                    onClick={handleSystemPurge}
                    disabled={purgeLoading}
                    className="px-4 py-2.5 min-h-[44px] bg-rose-500 text-white rounded-xl font-headline-md text-[10px] font-bold uppercase tracking-wider shadow-md shadow-rose-500/10 hover:bg-rose-600 active:scale-95 transition-all shrink-0 self-start sm:self-center"
                  >
                    {purgeLoading ? 'Flushing...' : 'Purge DB State'}
                  </button>
                </div>
              </div>

              {/* Dev/Testing Tools — Injector */}
              <div className="glass-card p-5 rounded-2xl border border-amber-500/40 bg-amber-500/[0.03] backdrop-blur-md shadow-sm space-y-4">
                <div>
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-500 text-xl">science</span>
                    <span>Dev / Testing Tools</span>
                  </h3>
                  <p className="font-body-sm text-[10px] sm:text-xs text-amber-700/70 dark:text-amber-400/50">
                    Stress-test the slot-filling logic by bulk-injecting dummy registrations.
                  </p>
                </div>

                <div className="border border-amber-500/20 rounded-xl p-3.5 space-y-3 bg-amber-500/[0.04]">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1 space-y-1">
                      <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Tournament ID</label>
                      <input
                        type="text"
                        value={injectTournamentId}
                        onChange={(e) => setInjectTournamentId(e.target.value)}
                        placeholder="e.g. TRN-XXXX"
                        className="w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-surface/60 text-on-background text-xs font-mono placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                    </div>
                    <div className="w-full sm:w-28 space-y-1">
                      <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Slots</label>
                      <input
                        type="number"
                        value={injectSlotCount}
                        onChange={(e) => setInjectSlotCount(Math.max(1, Number(e.target.value)))}
                        min={1}
                        max={5000}
                        className="w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-surface/60 text-on-background text-xs font-mono placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                      />
                    </div>
                    <button
                      onClick={handleInjectSlots}
                      disabled={isInjecting || !injectTournamentId.trim()}
                      className="px-5 py-2.5 min-h-[44px] bg-amber-500 text-white rounded-xl font-headline-md text-[10px] font-bold uppercase tracking-wider shadow-md shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shrink-0"
                    >
                      {isInjecting ? (
                        <span className="flex items-center gap-1.5">
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Injecting...
                        </span>
                      ) : (
                        `Inject ${injectSlotCount.toLocaleString()} Slots`
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Organizer Usage Stats */}
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div>
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl">monitoring</span>
                    <span>Organizer Usage Statistics</span>
                  </h3>
                  <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">Aggregated platform usage across all organizers</p>
                </div>
                <OrganizerUsageStats />
              </div>

              {/* Activity Feed — Admin Only */}
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-xl">forum</span>
                    <span>Activity Feed</span>
                  </h3>
                  <span className="text-[9px] text-on-surface-variant/50 font-mono tracking-widest font-semibold uppercase">Live</span>
                </div>
                <ActivityFeed onNavigate={onNavigate} />
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: ORGANIZER KYC APPLICATIONS */}
        {activeTab === 'kyc' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-headline-lg text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                Organizer Accreditation desk
              </h2>
              <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                Verify host legal proofs, experience descriptions, and approve matching subscription plans.
              </p>
            </div>

            {/* KYC list cards */}
            <div className="space-y-3">
              {kycApplications.length > 0 ? (
                kycApplications.map((app) => (
                  <div 
                    key={app.id}
                    className={`glass-card p-4 rounded-xl border backdrop-blur-md transition-all ${
                      app.status === 'pending' 
                        ? 'border-amber-500/25 bg-amber-500/[0.02] hover:border-amber-500/40' 
                        : (app.status === 'approved' ? 'border-emerald-500/15 bg-emerald-500/[0.01]' : 'border-slate-200 dark:border-white/5 bg-slate-100/30 dark:bg-white/[0.01]')
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="space-y-1.5 w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{app.id}</span>
                          <span className="font-headline-md text-xs font-black text-primary">{app.orgName}</span>
                          
                          {/* Selected Plan Badge */}
                          <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-label-caps text-[8px] font-bold uppercase tracking-wider">
                            {app.selectedPlan || 'Free'} Plan
                          </span>
                          
                          {/* Status Pill */}
                          <span className={`px-2 py-0.5 rounded font-label-caps text-[8px] font-bold uppercase tracking-wider ${
                            app.status === 'approved' 
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                              : (app.status === 'rejected' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20')
                          }`}>
                            {app.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-slate-700 dark:text-white/50">
                          <div><span className="font-semibold text-slate-700 dark:text-white/60">Applicant:</span> {app.applicantName}</div>
                          <div><span className="font-semibold text-slate-700 dark:text-white/60">Email:</span> {app.email}</div>
                          <div><span className="font-semibold text-slate-700 dark:text-white/60">Phone:</span> {app.phone}</div>
                          <div><span className="font-semibold text-slate-700 dark:text-white/60">Region:</span> {app.cityRegion}</div>
                        </div>

                        {app.experience && (
                          <p className="font-body-sm text-[10px] text-slate-700 dark:text-white/55 border-t border-slate-200 dark:border-white/5 pt-1.5 mt-1.5 leading-relaxed">
                            <span className="font-semibold text-slate-700 dark:text-white/70">Experience:</span> {app.experience}
                          </p>
                        )}
                        
                        {app.adminNotes && (
                          <div className="bg-rose-500/5 dark:bg-white/[0.02] p-2 rounded-lg border border-slate-200 dark:border-white/5 text-[10px] text-slate-700 dark:text-white/50 mt-2">
                            <span className="font-bold text-slate-700 dark:text-white/60">Admin Notes:</span> {app.adminNotes}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      {app.status === 'pending' && (
                        <div className="flex sm:flex-col items-center gap-1.5 w-full sm:w-auto shrink-0 self-stretch justify-end">
                          <button
                            onClick={() => {
                              setSelectedKycApp(app)
                              setAdminNotes('')
                            }}
                            className="flex-1 sm:flex-none w-full sm:w-28 py-2 min-h-[44px] bg-primary hover:bg-primary-hover text-white rounded-lg font-headline-md text-[10px] font-bold uppercase tracking-wider transition-all shadow-md shadow-primary/10 flex items-center justify-center gap-1"
                          >
                            <span className="material-symbols-outlined text-sm">rate_review</span>
                            <span>Review KYC</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-600 dark:text-white/40 text-xs border border-dashed border-slate-300 dark:border-white/10 rounded-xl bg-white/30 dark:bg-white/[0.01]">
                  No organizer KYC applications found.
                </div>
              )}
            </div>

            {/* KYC Review Drawer/Modal Dialog */}
            <AnimatePresence>
              {selectedKycApp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  {/* Backdrop */}
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setSelectedKycApp(null)}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  />
                  
                  {/* Container card */}
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="w-full max-w-lg glass-card profile-edit-modal-card p-5 sm:p-6 rounded-2xl shadow-2xl relative z-10 space-y-4 border border-outline-variant/30 max-h-[90vh] overflow-y-auto"
                  >
                    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                      <h3 className="font-headline-lg text-sm sm:text-base font-extrabold uppercase text-slate-900 dark:text-white">
                        Review KYC: {selectedKycApp.orgName}
                      </h3>
                      <button 
                        onClick={() => setSelectedKycApp(null)}
                        className="w-7 h-7 rounded-full bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 flex items-center justify-center text-slate-700 dark:text-white/55"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    </div>

                    <div className="space-y-3 text-xs leading-normal">
                      <div className="bg-slate-50 dark:bg-white/[0.02] p-3 rounded-xl border border-slate-200 dark:border-white/5 space-y-1.5">
                        <div><span className="font-bold text-slate-700 dark:text-white/60">Applicant:</span> {selectedKycApp.applicantName}</div>
                        <div><span className="font-bold text-slate-700 dark:text-white/60">Email:</span> {selectedKycApp.email}</div>
                        <div><span className="font-bold text-slate-700 dark:text-white/60">Phone:</span> {selectedKycApp.phone}</div>
                        <div><span className="font-bold text-slate-700 dark:text-white/60">Selected Plan:</span> {selectedKycApp.selectedPlan || 'Free'}</div>
                        <div><span className="font-bold text-slate-700 dark:text-white/60">Portfolio:</span> {selectedKycApp.portfolio || 'N/A'}</div>
                        <div>
                          <span className="font-bold text-slate-700 dark:text-white/60">KYC Document:</span>{' '}
                          <a 
                            href={selectedKycApp.kycDoc && selectedKycApp.kycDoc.startsWith('http') ? selectedKycApp.kycDoc : '#'}
                            target="_blank" 
                            rel="noreferrer"
                            className="text-primary dark:text-indigo-400 font-semibold underline hover:text-primary-hover"
                          >
                            {selectedKycApp.kycDoc || 'Aadhaar / Passport / ID Upload'}
                          </a>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-700 dark:text-white/50 font-bold uppercase tracking-wider font-label-caps">
                          Accreditation Feedback / Admin Notes
                        </label>
                        <textarea
                          rows="3"
                          value={adminNotes}
                          onChange={(e) => setAdminNotes(e.target.value)}
                          placeholder="Provide reasoning for approval/rejection or staff guidelines..."
                          className="w-full bg-slate-50 dark:bg-white/5 border border-outline-variant/30 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                      <button
                        onClick={() => handleKycReview('rejected')}
                        disabled={kycActionLoading}
                        className="flex-1 py-3 min-h-[44px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 font-headline-md text-xs font-bold uppercase tracking-wider rounded-xl transition-all border border-rose-500/25 active:scale-95"
                      >
                        Reject Application
                      </button>
                      <button
                        onClick={() => handleKycReview('approved')}
                        disabled={kycActionLoading}
                        className="flex-1 py-3 min-h-[44px] bg-emerald-500 text-white hover:bg-emerald-600 font-headline-md text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-emerald-500/10 active:scale-95"
                      >
                        Approve &amp; Activate
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* TAB 3: PLAN UPGRADE REQUESTS */}
        {activeTab === 'upgrades' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-headline-lg text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                Premium Upgrade Ledger
              </h2>
              <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                Confirm UPI/screenshot deposits from organizers requesting Basic/Pro tier upgrades.
              </p>
            </div>

            <div className="space-y-3">
              {upgradeRequests.length > 0 ? (
                upgradeRequests.map((req) => (
                  <div 
                    key={req.id}
                    className={`glass-card p-4 rounded-xl border backdrop-blur-md transition-all ${
                      req.status === 'pending' 
                        ? 'border-amber-500/25 bg-amber-500/[0.02] hover:border-amber-500/40' 
                        : (req.status === 'approved' ? 'border-emerald-500/15 bg-emerald-500/[0.01]' : 'border-slate-200 dark:border-white/5 bg-slate-100/30 dark:bg-white/[0.01]')
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                      <div className="space-y-1.5 w-full">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900 dark:text-white">{req.id}</span>
                          <span className="font-headline-md text-xs font-bold text-primary">Organizer ID: {req.organizer_id}</span>
                          
                          <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-label-caps text-[8px] font-bold uppercase tracking-wider">
                            {req.current_plan} &rarr; {req.requested_plan}
                          </span>
                          
                          <span className={`px-2 py-0.5 rounded font-label-caps text-[8px] font-bold uppercase tracking-wider ${
                            req.status === 'approved' 
                              ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                              : (req.status === 'rejected' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20')
                          }`}>
                            {req.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px] text-slate-700 dark:text-white/50">
                          <div><span className="font-semibold text-slate-700 dark:text-white/60">Tx ID:</span> {req.transaction_id || 'N/A'}</div>
                          <div><span className="font-semibold text-slate-700 dark:text-white/60">Payment Notes:</span> {req.payment_notes || 'N/A'}</div>
                          <div>
                            <span className="font-semibold text-slate-700 dark:text-white/60">Receipt:</span>{' '}
                            <a 
                              href={req.payment_screenshot && req.payment_screenshot.startsWith('http') ? req.payment_screenshot : '#'}
                              target="_blank" 
                              rel="noreferrer"
                              className="text-primary dark:text-indigo-400 font-semibold underline hover:text-primary-hover"
                            >
                              View Screenshot Image
                            </a>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      {req.status === 'pending' && (
                        <div className="flex sm:flex-row items-center gap-1.5 w-full sm:w-auto shrink-0 justify-end">
                          <button
                            onClick={() => handleUpgradeRespond(req, 'rejected')}
                            disabled={upgradeActionLoading}
                            className="flex-1 sm:flex-none py-2 px-3.5 min-h-[44px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/25 rounded-lg font-headline-md text-[10px] font-bold uppercase tracking-wider transition-all"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleUpgradeRespond(req, 'approved')}
                            disabled={upgradeActionLoading}
                            className="flex-1 sm:flex-none py-2 px-3.5 min-h-[44px] bg-emerald-500 text-white hover:bg-emerald-600 rounded-lg font-headline-md text-[10px] font-bold uppercase tracking-wider transition-all shadow-md shadow-emerald-500/10"
                          >
                            Approve
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-slate-600 dark:text-white/40 text-xs border border-dashed border-slate-300 dark:border-white/10 rounded-xl bg-white/30 dark:bg-white/[0.01]">
                  No plan upgrade requests found.
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4.5: TOURNAMENTS GOVERNANCE */}
        {activeTab === 'tournaments' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-headline-lg text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                  Tournaments Arena Governance
                </h2>
                <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                  Inspect tournament details, view slots, and delete violating brackets.
                </p>
              </div>

              {/* Tournament search bar */}
              <div className="relative w-full sm:max-w-xs shrink-0">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-white/40 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Search game, title, host..."
                  value={tournamentSearchQuery}
                  onChange={(e) => setTournamentSearchQuery(e.target.value)}
                  className="w-full bg-white dark:bg-white/5 border border-outline-variant/30 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Tournaments List Grid */}
            <div className="glass-card border border-outline-variant/30 rounded-2xl bg-surface-container-low/40 overflow-hidden shadow-sm backdrop-blur-md">
              <div className="overflow-x-auto w-full">
                <table className="w-full border-collapse text-left text-xs leading-normal">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-surface-container-highest/50 text-slate-700 dark:text-white/50 font-bold">
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Tournament Title / Game</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Host Organizer</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Slots Filled</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Prize Pool</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Status</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournamentsList.filter(t => {
                      if (!tournamentSearchQuery) return true
                      const q = tournamentSearchQuery.toLowerCase()
                      return (
                        (t.title && t.title.toLowerCase().includes(q)) ||
                        (t.game && t.game.toLowerCase().includes(q)) ||
                        (t.orgName && t.orgName.toLowerCase().includes(q)) ||
                        (t.id && t.id.toLowerCase().includes(q))
                      )
                    }).length > 0 ? (
                      tournamentsList.filter(t => {
                        if (!tournamentSearchQuery) return true
                        const q = tournamentSearchQuery.toLowerCase()
                        return (
                          (t.title && t.title.toLowerCase().includes(q)) ||
                          (t.game && t.game.toLowerCase().includes(q)) ||
                          (t.orgName && t.orgName.toLowerCase().includes(q)) ||
                          (t.id && t.id.toLowerCase().includes(q))
                        )
                      }).map((t) => (
                        <tr 
                          key={t.id} 
                          className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-100/30 dark:hover:bg-white/[0.01] transition-colors"
                        >
                          <td className="p-3 sm:p-4">
                            <div className="leading-tight">
                              <p className="font-bold text-slate-900 dark:text-white text-[12px] sm:text-xs">
                                {t.title}
                              </p>
                              <p className="text-[10px] text-slate-600 dark:text-white/40">{t.game} • {t.id}</p>
                            </div>
                          </td>
                          <td className="p-3 sm:p-4 text-[11px] text-slate-700 dark:text-white/50 font-medium">{t.orgName}</td>
                          <td className="p-3 sm:p-4 text-[11px] text-slate-700 dark:text-white/50">{t.slotsFilled} / {t.slotsTotal}</td>
                          <td className="p-3 sm:p-4 text-[11px] text-secondary font-semibold font-prize-display">{t.prize || 'TBA'}</td>
                          <td className="p-3 sm:p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-label-caps uppercase ${
                              t.status === 'live' 
                                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-[0_0_8px_#ff000020]' 
                                : (t.status === 'completed' ? 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/40' : 'bg-primary/10 text-primary border border-primary/20')
                            }`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="p-3 sm:p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleDeleteTournament(t.id)}
                                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 dark:text-white/50 hover:text-rose-500 transition-colors"
                                title="Delete Tournament"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center py-10 text-slate-600 dark:text-white/40 text-xs">
                          No matching tournaments found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: USER GOVERNANCE & ROSTER */}
        {activeTab === 'users' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-headline-lg text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                  Gamer Database Governance
                </h2>
                <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                  Inspect gaming profiles, check subscription tiers, and terminate violating accounts.
                </p>
              </div>

              {/* User search bar */}
              <div className="relative w-full sm:max-w-xs shrink-0">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-white/40 text-[18px]">search</span>
                <input
                  type="text"
                  placeholder="Search tag, email, name..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="w-full bg-white dark:bg-white/5 border border-outline-variant/30 rounded-xl pl-9 pr-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>

            {/* Users Roster Table */}
            <div className="glass-card border border-outline-variant/30 rounded-2xl bg-surface-container-low/40 overflow-hidden shadow-sm backdrop-blur-md">
              <div className="overflow-x-auto w-full">
                <table className="w-full border-collapse text-left text-xs leading-normal">
                  <thead>
                    <tr className="border-b border-outline-variant/30 bg-surface-container-highest/50 text-slate-700 dark:text-white/50 font-bold">
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Gamer Tag / Name</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Email</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Role</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Tier</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider">Status</th>
                      <th className="p-3 sm:p-4 text-[10px] uppercase font-bold tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length > 0 ? (
                      filteredUsers.map((user) => (
                        <tr 
                          key={user.id} 
                          className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-100/30 dark:hover:bg-white/[0.01] transition-colors"
                        >
                          <td className="p-3 sm:p-4">
                            <div className="flex items-center gap-2.5">
                              <img 
                                src={user.avatar || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80'} 
                                alt={user.name} 
                                className="avatar-img w-7 h-7 rounded-full border border-outline-variant/30 shrink-0"
                              />
                              <div className="leading-tight">
                                <p className="font-bold text-slate-900 dark:text-white text-[12px] sm:text-xs">
                                  {user.gamerTag && user.gamerTag.startsWith('@') ? user.gamerTag : `@${user.gamerTag || (user.name || 'Anonymous').toLowerCase().replace(/\s+/g, '_')}`}
                                </p>
                                <p className="text-[10px] text-slate-600 dark:text-white/40 truncate max-w-[120px]">{user.name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 sm:p-4 text-[11px] text-slate-700 dark:text-white/50">{user.email}</td>
                          <td className="p-3 sm:p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-label-caps uppercase ${
                              user.role === 'admin' 
                                ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' 
                                : (user.role === 'organiser' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-white/40')
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="p-3 sm:p-4 text-[10px] text-slate-700 dark:text-white/50 font-semibold">{user.tier || 'Amateur'}</td>
                          <td className="p-3 sm:p-4">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-label-caps uppercase ${
                              user.status === 'Active' 
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            }`}>
                              {user.status || 'Active'}
                            </span>
                          </td>
                          <td className="p-3 sm:p-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => onNavigate && onNavigate('profile', user)}
                                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 dark:text-white/50 hover:text-primary dark:hover:text-white transition-colors"
                                title="View User Profile"
                              >
                                <span className="material-symbols-outlined text-[18px]">visibility</span>
                              </button>
                              
                              {(user.role === 'organiser' || user.role === 'verified organizer') && (
                                <>
                                  <button
                                    onClick={() => handleToggleUserStatus(user)}
                                    className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors ${user.status === 'Held' ? 'text-amber-500 hover:text-emerald-500' : 'text-slate-700 dark:text-white/50 hover:text-amber-500'}`}
                                    title={user.status === 'Held' ? "Resume event hosting privilege" : "Hold event hosting privilege"}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">
                                      {user.status === 'Held' ? 'play_circle' : 'pause_circle'}
                                    </span>
                                  </button>
                                  
                                  <button
                                    onClick={() => handleRevokeOrganizerRole(user)}
                                    className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 dark:text-white/50 hover:text-rose-500 transition-colors"
                                    title="Revoke organizer role (demote to player)"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">gavel</span>
                                  </button>
                                </>
                              )}

                              {user.role !== 'admin' && (
                                <button
                                  onClick={() => setDeleteUserId(user.id)}
                                  className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-700 dark:text-white/50 hover:text-rose-500 transition-colors"
                                  title="Terminate Account"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="text-center py-10 text-slate-600 dark:text-white/40 text-xs">
                          No matching users found in roster.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
              {deleteUserId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setDeleteUserId(null)}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                  />
                  
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-full max-w-sm glass-card profile-edit-modal-card p-5 sm:p-6 rounded-2xl shadow-2xl relative z-10 text-center space-y-4 border border-outline-variant/30 max-h-[90vh] overflow-y-auto"
                  >
                    <span className="material-symbols-outlined text-4xl text-rose-500 animate-bounce">warning</span>
                    
                    <div className="space-y-1">
                      <h3 className="font-headline-lg text-sm sm:text-base font-extrabold uppercase text-slate-900 dark:text-white">
                        Confirm Account Deletion
                      </h3>
                      <p className="font-body-sm text-[11px] text-slate-700 dark:text-white/50">
                        Are you sure you want to permanently delete user ID <code className="font-mono text-primary font-bold">{deleteUserId}</code>? All associated profile data, notices, and presets will be permanently erased.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
                      <button
                        onClick={() => setDeleteUserId(null)}
                        disabled={deleteLoading}
                        className="flex-1 py-2.5 min-h-[44px] bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white/55 border border-outline-variant/30 font-headline-md text-xs font-bold uppercase rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteUser}
                        disabled={deleteLoading}
                        className="flex-1 py-2.5 min-h-[44px] bg-rose-500 text-white hover:bg-rose-600 font-headline-md text-xs font-bold uppercase rounded-xl transition-all shadow-md shadow-rose-500/10"
                      >
                        {deleteLoading ? 'Deleting...' : 'Delete User'}
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* TAB 5: SYSTEM TIMELINE LOGS */}
        {activeTab === 'activity' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="space-y-1">
              <h2 className="font-headline-lg text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight">
                System Log Streams
              </h2>
              <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                Real-time monitor tracking dynamic database registers, registrations, and account creations.
              </p>
            </div>

            <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4 max-w-3xl mx-auto">
              <div className="flex items-center justify-between border-b border-outline-variant/30 pb-2">
                <span className="text-[10px] text-slate-700 dark:text-white/50 font-mono tracking-widest font-bold">STREAM LIVE TELEMETRY</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping shadow-[0_0_10px_2px_rgba(16,185,129,0.5)] shrink-0" />
              </div>

              <div className="space-y-4 pt-2">
                {activityLogs.length > 0 ? (
                  activityLogs.map((log, idx) => (
                    <div 
                      key={idx}
                      className="flex items-start gap-3 text-xs leading-normal animate-in slide-in-from-left duration-200"
                    >
                      <div className={`w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 border border-outline-variant/30 flex items-center justify-center shrink-0 ${log.color || 'text-primary'}`}>
                        <span className="material-symbols-outlined text-[16px]">{log.icon || 'history'}</span>
                      </div>
                      <div className="space-y-0.5 flex-1">
                        <p className="font-medium text-slate-900 dark:text-white text-[12px] sm:text-xs leading-normal">
                          {log.text}
                        </p>
                        <p className="font-mono text-[9px] text-slate-400 dark:text-white/20">
                          {log.time}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-600 dark:text-white/40 text-xs border border-dashed border-slate-300 dark:border-white/10 rounded-xl">
                    No recent telemetry records found.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: ABUSE FILTER — BAD WORDS MANAGER */}
        {activeTab === 'abusefilter' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-headline-lg text-sm sm:text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
                  <span className="material-symbols-outlined text-rose-500 text-xl">security</span>
                  Abuse Filter Engine
                </h2>
                <p className="font-body-sm text-[10px] sm:text-xs text-slate-700 dark:text-white/50">
                  Define the banned word list. The AbuseTracker Worker scans every form field in real-time and blocks submission if a match is detected.
                </p>
              </div>
              {/* Status badge */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                  <span className="font-label-caps text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Worker Active</span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="font-mono text-[11px] font-bold text-primary">{badWordsList.length} words banned</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* LEFT: Add new words panel */}
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div className="border-b border-outline-variant/30 pb-3">
                  <h3 className="font-headline-md text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-primary text-[18px]">add_circle</span>
                    Add Banned Words
                  </h3>
                  <p className="font-body-sm text-[10px] text-slate-600 dark:text-white/40 mt-1">
                    Enter words separated by commas, semicolons, or new lines. The worker handles basic leet-speak variations automatically.
                  </p>
                </div>

                <textarea
                  id="badwords-input"
                  rows={8}
                  value={badWordsInput}
                  onChange={e => setBadWordsInput(e.target.value)}
                  placeholder={`hate, slur1, badword2\nspam, insult...`}
                  className="w-full bg-slate-50 dark:bg-white/5 border border-outline-variant/30 rounded-xl p-3 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none placeholder:text-slate-400 dark:placeholder:text-white/20"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={saveBadWords}
                    disabled={badWordsSaving || !badWordsInput.trim()}
                    className="flex-1 py-3 min-h-[44px] bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-headline-md text-xs font-bold uppercase tracking-wider shadow-md shadow-primary/20 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                  >
                    {badWordsSaving ? (
                      <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">save</span>
                        <span>Add to Banned List</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setBadWordsInput('')}
                    className="px-4 py-3 min-h-[44px] bg-slate-100 dark:bg-white/5 border border-outline-variant/30 rounded-xl text-slate-700 dark:text-white/50 hover:bg-slate-200 dark:hover:bg-white/10 transition-all text-xs font-bold"
                  >
                    Clear
                  </button>
                </div>

                {/* Quick-paste tip */}
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15">
                  <span className="material-symbols-outlined text-amber-500 text-[16px] mt-0.5 shrink-0">lightbulb</span>
                  <p className="font-body-sm text-[10px] text-slate-600 dark:text-white/50 leading-relaxed">
                    <strong className="text-slate-700 dark:text-white/70">Tip:</strong> The worker also catches common leet-speak substitutions (e.g. <code className="font-mono bg-slate-200 dark:bg-white/10 px-1 rounded">h4te</code>, <code className="font-mono bg-slate-200 dark:bg-white/10 px-1 rounded">$lur</code>). You only need to add the base word.
                  </p>
                </div>
              </div>

              {/* RIGHT: Current word list */}
              <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
                <div className="border-b border-outline-variant/30 pb-3 flex items-center justify-between gap-2">
                  <h3 className="font-headline-md text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-rose-500 text-[18px]">block</span>
                    Active Banned List
                  </h3>
                  <span className="font-mono text-[10px] font-bold text-slate-600 dark:text-white/40">
                    {badWordsList.filter(w => w.includes(badWordsFilter.toLowerCase())).length} / {badWordsList.length}
                  </span>
                </div>

                {/* Search within list */}
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-white/30 text-[16px]">search</span>
                  <input
                    id="badwords-filter"
                    type="text"
                    placeholder="Filter current list..."
                    value={badWordsFilter}
                    onChange={e => setBadWordsFilter(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-white/5 border border-outline-variant/30 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Word tags cloud */}
                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto no-scrollbar pr-1">
                  {badWordsList.length === 0 ? (
                    <div className="w-full text-center py-8 text-slate-500 dark:text-white/30 text-xs border border-dashed border-slate-300 dark:border-white/10 rounded-xl">
                      No banned words configured yet.
                    </div>
                  ) : (
                    badWordsList
                      .filter(w => !badWordsFilter || w.includes(badWordsFilter.toLowerCase()))
                      .map(word => (
                        <motion.div
                          key={word}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="group flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/50 transition-all"
                        >
                          <span className="font-mono text-[11px] font-semibold text-rose-400">{word}</span>
                          <button
                            onClick={() => removeWord(word)}
                            className="w-4 h-4 rounded-full bg-rose-500/0 group-hover:bg-rose-500/20 flex items-center justify-center text-rose-400 opacity-0 group-hover:opacity-100 transition-all"
                            title={`Remove "${word}"`}
                          >
                            <span className="material-symbols-outlined text-[12px]">close</span>
                          </button>
                        </motion.div>
                      ))
                  )}
                </div>

                {/* Bulk clear option */}
                {badWordsList.length > 0 && (
                  <button
                    onClick={async () => {
                      const confirmed = window.confirm(`This will permanently remove ALL ${badWordsList.length} banned words. Proceed?`)
                      if (!confirmed) return
                      const res = await fetch('/api/admin/badwords', {
                        method: 'PUT',
                        headers: getHeaders(),
                        body: JSON.stringify({ words: [] })
                      })
                      const data = await res.json()
                      if (data.success) {
                        setBadWordsList([])
                        triggerToast('Banned word list cleared.')
                      }
                    }}
                    className="w-full py-2 border border-rose-500/20 rounded-xl text-rose-400 text-[10px] font-bold uppercase tracking-wider hover:bg-rose-500/10 transition-all"
                  >
                    Clear Entire List
                  </button>
                )}
              </div>
            </div>

            {/* How it works info card */}
            <div className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm">
              <h3 className="font-headline-md text-xs font-bold text-slate-900 dark:text-white uppercase flex items-center gap-1.5 mb-3">
                <span className="material-symbols-outlined text-secondary text-[18px]">info</span>
                How the AbuseTracker Worker Works
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { icon: 'settings_suggest', color: 'text-primary', title: 'Off-Thread Processing', desc: 'The worker runs in a dedicated Web Worker thread so it never blocks the UI, even on large word lists.' },
                  { icon: 'flash_on', color: 'text-amber-400', title: 'Real-Time Detection', desc: 'Every keystroke in every form field is checked within milliseconds via the worker postMessage API.' },
                  { icon: 'block', color: 'text-rose-400', title: 'Submit Blocked', desc: 'If a bad word is detected the field shows a warning and form submission is prevented until the content is changed.' }
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-container-highest/50 border border-slate-200 dark:border-white/5">
                    <div className={`w-8 h-8 rounded-lg bg-slate-200 dark:bg-white/5 border border-slate-300 dark:border-white/10 flex items-center justify-center shrink-0 ${item.color}`}>
                      <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-headline-md text-[11px] font-bold text-slate-900 dark:text-white">{item.title}</p>
                      <p className="font-body-sm text-[10px] text-slate-600 dark:text-white/40 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: REGISTRATIONS REVIEW */}
        {activeTab === 'registrations' && (
          <RegistrationsReviewTab triggerToast={triggerToast} />
        )}

        {/* TAB 8: SUBSCRIPTIONS MANAGEMENT */}
        {activeTab === 'subscriptions' && (
          <SubscriptionManagementTab triggerToast={triggerToast} />
        )}

        {/* TAB 8: PAYMENT VERIFICATION */}
        {activeTab === 'payments' && (
          <SubscriptionPaymentsTab triggerToast={triggerToast} />
        )}

        {activeTab === 'sponsor' && (
          <SponsorManagementTab triggerToast={triggerToast} />
        )}

        {activeTab === 'verify' && (
          <VerifySponsorTab triggerToast={triggerToast} />
        )}

        {activeTab === 'featureflags' && (
          <FeatureFlagsTab triggerToast={triggerToast} />
        )}

        {/* TAB 11: ROLE MANAGEMENT */}
        {activeTab === 'rolemanagement' && (
          <RoleManagementTab triggerToast={triggerToast} />
        )}

        {/* TAB 15: BULK APPROVALS */}
        {activeTab === 'bulk-approvals' && (
          <BulkApprovalsTab triggerToast={triggerToast} />
        )}

    </AdminLayout>
  )
}

// Registrations Review Tab for Admin
function RegistrationsReviewTab({ triggerToast }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [tournamentFilter, setTournamentFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [actionRegId, setActionRegId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [screenshotModal, setScreenshotModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/pending-registrations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) setRegistrations(data.registrations);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useRefetchOnFocus(fetchRegistrations);
  useEffect(() => { fetchRegistrations(); }, [fetchRegistrations]);

  const parseMembers = (membersStr) => {
    if (!membersStr) return [];
    try { return typeof membersStr === 'string' ? JSON.parse(membersStr) : membersStr; }
    catch { return []; }
  };

  const groupedByTournament = useMemo(() => {
    const map = {};
    registrations.forEach(r => {
      const statusMatch = statusFilter === 'all' || r.status === statusFilter || 
        (statusFilter === 'payment_pending' && ['pending_payment', 'PENDING_PAYMENT_VERIFICATION'].includes(r.status));
      if (!statusMatch) return;
      const key = r.tournament_id;
      if (!map[key]) map[key] = { id: key, title: r.tournament_title, game: r.tournament_game, entryFee: r.entry_fee_amount, registrations: [] };
      map[key].registrations.push(r);
    });
    return Object.values(map).sort((a, b) => a.title?.localeCompare(b.title));
  }, [registrations, statusFilter]);

  const filteredGroups = useMemo(() => {
    if (!tournamentFilter) return groupedByTournament;
    return groupedByTournament.filter(g =>
      g.title?.toLowerCase().includes(tournamentFilter.toLowerCase()) ||
      g.game?.toLowerCase().includes(tournamentFilter.toLowerCase())
    );
  }, [groupedByTournament, tournamentFilter]);

  const handleApprove = async (reg, tournamentId) => {
    setActionRegId(reg.id);
    setActionLoading(true);
    try {
      const token = await getAuthToken();
      const needsPayment = parseInt(reg.entry_fee_amount) > 0;
      const status = needsPayment || reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'confirmed' : 'approved';
      const res = await fetch(`/api/tournaments/${tournamentId}/registrations/${reg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      if (data.success) {
        setRegistrations(prev => prev.filter(r => r.id !== reg.id));
        triggerToast(`Registration ${status === 'confirmed' ? 'confirmed' : 'approved'}!`);
      } else {
        triggerToast(data.message || 'Failed to approve.');
      }
    } catch { triggerToast('Network error.'); }
    setActionLoading(false);
    setActionRegId(null);
  };

  const openRejectModal = (reg) => {
    setRejectModal(reg);
    setRejectReason('');
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setActionRegId(rejectModal.id);
    setActionLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${rejectModal.tournament_id}/registrations/${rejectModal.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'PAYMENT_REJECTED', rejection_reason: rejectReason.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setRegistrations(prev => prev.filter(r => r.id !== rejectModal.id));
        triggerToast('Registration rejected.');
        setRejectModal(null);
      } else {
        triggerToast(data.message || 'Failed to reject.');
      }
    } catch { triggerToast('Network error.'); }
    setActionLoading(false);
    setActionRegId(null);
  };

  const totalCount = registrations.length;
  const filterOptions = [
    { value: 'all', label: `All (${registrations.length})` },
    { value: 'pending', label: `Pending (${registrations.filter(r => r.status === 'pending').length})` },
    { value: 'payment_pending', label: `Payment Pending (${registrations.filter(r => ['pending_payment', 'PENDING_PAYMENT_VERIFICATION'].includes(r.status)).length})` },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-on-background">Registration Review</h2>
          <p className="text-xs text-on-surface-variant">{totalCount} pending registrations</p>
        </div>
        <button onClick={fetchRegistrations} disabled={loading}
          className="px-4 py-2 rounded-xl bg-surface border border-outline-variant/30 text-xs font-bold text-on-background hover:bg-surface-variant transition-all flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {filterOptions.map(f => (
            <button key={f.value} onClick={() => setStatusFilter(f.value)}
              className={`px-3.5 py-2 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
                statusFilter === f.value ? 'bg-primary text-white shadow-sm' : 'bg-surface border border-outline-variant/30 text-on-surface-variant hover:text-on-background'
              }`}>{f.label}</button>
          ))}
        </div>
        <input type="text" value={tournamentFilter} onChange={e => setTournamentFilter(e.target.value)}
          placeholder="Search tournament or game..."
          className="px-3 py-2 rounded-xl border border-outline-variant/30 bg-surface text-xs text-on-background placeholder:text-on-surface-variant/40 outline-none focus:border-primary sm:max-w-xs w-full" />
      </div>

      {/* Registration Groups */}
      {filteredGroups.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3">how_to_reg</span>
          <p className="text-sm font-medium text-on-surface-variant">No registrations to review</p>
        </div>
      ) : filteredGroups.map(group => (
        <div key={group.id} className="rounded-xl bg-surface border border-outline-variant/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-primary/10 text-primary border border-primary/20">{group.game || 'Game'}</span>
              <h3 className="font-bold text-sm text-on-background truncate">{group.title}</h3>
              <span className="text-[11px] text-on-surface-variant bg-surface-variant/50 px-2 py-0.5 rounded-full">{group.registrations.length} regs</span>
            </div>
            {group.entryFee > 0 && <span className="text-[11px] font-bold text-emerald-500">₹{group.entryFee}/slot</span>}
          </div>
          <div className="divide-y divide-outline-variant/10">
            {group.registrations.map(reg => {
              const members = parseMembers(reg.members);
              const isPaidReg = ['pending_payment', 'PENDING_PAYMENT_VERIFICATION'].includes(reg.status) || parseInt(group.entryFee) > 0;
              const isExpanded = expandedId === reg.id;
              return (
                <div key={reg.id}>
                  {/* Collapsed row */}
                  <div className="px-4 py-3 flex items-center gap-3 hover:bg-surface-variant/20 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : reg.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-on-background truncate">{reg.team_name}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          isPaidReg ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                        }`}>{isPaidReg ? 'Paid' : 'Free'}</span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant truncate">Captain: {reg.captain}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      reg.status === 'pending' ? 'bg-blue-500/10 text-blue-400' :
                      reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'bg-amber-500/10 text-amber-500' :
                      reg.status === 'PAYMENT_REJECTED' ? 'bg-red-500/10 text-red-400' :
                      'bg-emerald-500/10 text-emerald-400'
                    }`}>{reg.status}</span>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : '' }}>expand_more</span>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-outline-variant/10 bg-surface-variant/10">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
                        <div className="px-3 py-2 rounded-lg bg-surface-variant/30">
                          <p className="text-[9px] font-bold uppercase text-on-surface-variant/50 mb-0.5">Email</p>
                          <p className="text-[12px] font-medium text-on-background truncate">{reg.email || '—'}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-surface-variant/30">
                          <p className="text-[9px] font-bold uppercase text-on-surface-variant/50 mb-0.5">Phone</p>
                          <p className="text-[12px] font-medium text-on-background">{reg.phone || '—'}</p>
                        </div>
                        <div className="px-3 py-2 rounded-lg bg-surface-variant/30">
                          <p className="text-[9px] font-bold uppercase text-on-surface-variant/50 mb-0.5">Captain UID</p>
                          <p className="text-[12px] font-medium text-on-background">{reg.captain_uid || '—'}</p>
                        </div>
                      </div>

                      {/* Players */}
                      {members.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] font-bold uppercase text-on-surface-variant/50 mb-2">Team Members ({members.length})</p>
                          <div className="flex flex-wrap gap-1.5">
                            {members.map((m, i) => (
                              <div key={i} className="px-2.5 py-1.5 rounded-lg bg-surface-variant/40 border border-outline-variant/20 text-[11px]">
                                <span className="font-semibold text-on-background">{m.ign || m.name || `Player ${i+1}`}</span>
                                {m.uid && <span className="text-on-surface-variant ml-1.5">UID: {m.uid}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Payment details */}
                      {isPaidReg && (
                        <div className="mb-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/15">
                          <p className="text-[10px] font-bold uppercase text-amber-500/70 mb-2">Payment Details</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <p className="text-[9px] text-on-surface-variant/50">UTR / Transaction ID</p>
                              <p className="text-[12px] font-semibold text-on-background">{reg.payment_utr || reg.transaction_id || '—'}</p>
                            </div>
                            <div>
                              <p className="text-[9px] text-on-surface-variant/50">Payment App</p>
                              <p className="text-[12px] font-semibold text-on-background">{reg.payment_app || '—'}</p>
                            </div>
                          </div>
                          {(reg.payment_proof_url || reg.screenshot_url) && (
                            <button onClick={() => setScreenshotModal(reg.payment_proof_url || reg.screenshot_url)}
                              className="mt-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-500 text-[11px] font-bold hover:bg-amber-500/20 transition-colors">
                              View Screenshot
                            </button>
                          )}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/20">
                        <button onClick={() => handleApprove(reg, group.id)} disabled={actionLoading && actionRegId === reg.id}
                          className="px-4 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[11px] font-bold hover:bg-emerald-500/25 transition-all disabled:opacity-40 flex items-center gap-1.5">
                          {actionLoading && actionRegId === reg.id ? (
                            <span className="w-3.5 h-3.5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                          ) : <span className="material-symbols-outlined text-[14px]">check_circle</span>}
                          Approve
                        </button>
                        <button onClick={() => openRejectModal(reg)} disabled={actionLoading}
                          className="px-4 py-2 rounded-xl bg-red-500/15 text-red-400 border border-red-500/25 text-[11px] font-bold hover:bg-red-500/25 transition-all disabled:opacity-40 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[14px]">cancel</span>
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Screenshot Modal */}
      {screenshotModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setScreenshotModal(null)}>
          <div className="relative max-w-lg w-full max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <button onClick={() => setScreenshotModal(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-surface border border-outline-variant/30 flex items-center justify-center shadow-lg z-10 hover:bg-surface-variant transition-colors">
              <span className="material-symbols-outlined text-[16px] text-on-background">close</span>
            </button>
            <img src={screenshotModal} alt="Payment screenshot" className="w-full rounded-xl shadow-2xl" />
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRejectModal(null)}>
          <div className="bg-surface rounded-2xl border border-outline-variant/30 p-5 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-on-background mb-1">Reject Registration</h3>
            <p className="text-[12px] text-on-surface-variant mb-4">Provide a reason for rejecting <span className="font-semibold text-on-background">{rejectModal.team_name}</span></p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['Invalid Screenshot', 'Amount Mismatch', 'Transaction Not Found', 'Blurred Proof', 'Duplicate Entry'].map(reason => (
                <button key={reason} onClick={() => setRejectReason(reason)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                    rejectReason === reason ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-surface-variant/40 text-on-surface-variant border-outline-variant/20 hover:border-outline-variant/40'
                  }`}>{reason}</button>
              ))}
            </div>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Or type a custom reason..."
              className="w-full px-3 py-2.5 rounded-xl border border-outline-variant/30 bg-surface-variant/20 text-xs text-on-background placeholder:text-on-surface-variant/40 outline-none focus:border-red-500/50 resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setRejectModal(null)} disabled={actionLoading}
                className="flex-1 py-2.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-background hover:bg-surface-variant transition-all">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || actionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-xs font-bold hover:bg-red-600 transition-all disabled:opacity-40 flex items-center justify-center gap-1.5">
                {actionLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Subscription Management Tab for Admin
function SubscriptionManagementTab({ triggerToast }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [overrideModal, setOverrideModal] = useState(null);
  const [overridePlan, setOverridePlan] = useState('Free');
  const [overrideCycle, setOverrideCycle] = useState('monthly');
  const [earlyAccessUsers, setEarlyAccessUsers] = useState([]);
  const [eaLoading, setEaLoading] = useState(false);
  const [eaEmail, setEaEmail] = useState('');
  const [eaAdding, setEaAdding] = useState(false);

  const fetchEarlyAccess = async () => {
    setEaLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/early-access', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
      if (res.success) setEarlyAccessUsers(res.users || []);
    } catch (e) {} finally { setEaLoading(false); }
  };

  const handleAddEarlyAccess = async (e) => {
    e.preventDefault();
    if (!eaEmail) return;
    setEaAdding(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: eaEmail })
      }).then(r => r.json());
      if (res.success) { triggerToast('Early access granted!'); setEaEmail(''); fetchEarlyAccess(); }
      else triggerToast(res.message || 'Failed to add');
    } catch (e) { triggerToast('Network error'); }
    finally { setEaAdding(false); }
  };

  const handleRemoveEarlyAccess = async (userId) => {
    if (!window.confirm('Remove early access for this user?')) return;
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/admin/early-access?userId=${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }).then(r => r.json());
      if (res.success) { triggerToast('Early access removed'); fetchEarlyAccess(); }
    } catch (e) { triggerToast('Failed to remove'); }
  };

  const getToken = async () => {
    const { getAuthToken } = await import('../utils/getAuthToken.js');
    return getAuthToken();
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [subRes, statsRes] = await Promise.all([
        fetch('/api/admin/subscriptions', { headers }).then(r => r.json()),
        fetch('/api/admin/subscriptions/stats', { headers }).then(r => r.json())
      ]);
      if (subRes.success) setSubscriptions(subRes.subscriptions || []);
      if (statsRes.success) setStats(statsRes.stats);
    } catch (err) {
      console.error('Failed to fetch subscription data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); fetchEarlyAccess(); }, []);

  const handleOverride = async () => {
    if (!overrideModal) return;
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/subscriptions/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: overrideModal, plan: overridePlan, billingCycle: overrideCycle })
      }).then(r => r.json());
      if (res.success) {
        triggerToast(`User subscription set to ${overridePlan}`);
        setOverrideModal(null);
        fetchData();
      } else {
        triggerToast(res.message || 'Override failed');
      }
    } catch (err) {
      triggerToast('Network error');
    }
  };

  if (loading) return <div className="p-8 text-center text-on-surface-variant">Loading subscriptions...</div>;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Total Organizers</p>
            <p className="text-2xl font-bold text-on-surface">{stats.totalOrganizers}</p>
          </div>
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Active Subscriptions</p>
            <p className="text-2xl font-bold text-on-surface">{stats.activeSubscriptions}</p>
          </div>
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Monthly Revenue</p>
            <p className="text-2xl font-bold text-emerald-400">₹{stats.monthlyRevenue?.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl p-4">
            <p className="text-xs text-on-surface-variant">Plan Distribution</p>
            <div className="flex gap-2 mt-1">
              {stats.planDistribution?.map(p => (
                <span key={p.tier} className="text-xs px-2 py-0.5 rounded-full bg-surface-container-highest/50">
                  {p.tier}: {p.count}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions Table */}
      <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-outline-variant/20">
          <h3 className="text-sm font-semibold text-on-surface">All Subscriptions</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-highest/30">
              <tr>
                <th className="text-left p-3 text-xs font-medium text-on-surface-variant">Organizer</th>
                <th className="text-left p-3 text-xs font-medium text-on-surface-variant">Plan</th>
                <th className="text-left p-3 text-xs font-medium text-on-surface-variant">Cycle</th>
                <th className="text-left p-3 text-xs font-medium text-on-surface-variant">Status</th>
                <th className="text-left p-3 text-xs font-medium text-on-surface-variant">Start Date</th>
                <th className="text-left p-3 text-xs font-medium text-on-surface-variant">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map(sub => (
                <tr key={sub.id} className="border-t border-outline-variant/10 hover:bg-surface-container-highest/20">
                  <td className="p-3">
                    <p className="font-medium text-on-surface">{sub.user_name || 'N/A'}</p>
                    <p className="text-xs text-on-surface-variant">{sub.user_email}</p>
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      sub.tier === 'Pro' ? 'bg-amber-500/15 text-amber-400' : 
                      sub.tier === 'Basic' ? 'bg-sky-500/15 text-sky-400' : 
                      'bg-surface-container-highest/50 text-on-surface-variant'
                    }`}>
                      {sub.tier || 'Free'}
                    </span>
                  </td>
                  <td className="p-3 text-on-surface-variant text-xs">{sub.billing_cycle || '—'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      sub.billing_status === 'active' ? 'bg-emerald-500/15 text-emerald-400' : 
                      sub.billing_status === 'cancelled' ? 'bg-error/15 text-error' : 
                      'bg-warning/15 text-warning'
                    }`}>
                      {sub.billing_status || 'unknown'}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-on-surface-variant">
                    {sub.plan_start_date ? new Date(sub.plan_start_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => { setOverrideModal(sub.organizer_id); setOverridePlan(sub.tier || 'Free'); }}
                      className="text-xs text-primary font-medium hover:text-primary/80"
                    >
                      Override
                    </button>
                  </td>
                </tr>
              ))}
              {subscriptions.length === 0 && (
                <tr><td colSpan="6" className="p-6 text-center text-on-surface-variant text-xs">No subscriptions found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Override Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setOverrideModal(null)}>
            <div className="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-on-surface mb-4">Override Subscription</h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-on-surface-variant block mb-1">Plan</label>
                <select value={overridePlan} onChange={e => setOverridePlan(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-highest/50 border border-outline-variant/40 rounded-lg text-sm text-on-surface">
                  <option value="Free">Free</option>
                  <option value="Basic">Basic (₹149/mo)</option>
                  <option value="Pro">Pro (₹399/mo)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-on-surface-variant block mb-1">Billing Cycle</label>
                <select value={overrideCycle} onChange={e => setOverrideCycle(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-highest/50 border border-outline-variant/40 rounded-lg text-sm text-on-surface">
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={() => setOverrideModal(null)}
                  className="flex-1 px-4 py-2 min-h-[44px] rounded-xl border border-outline-variant/40 text-sm text-on-surface">Cancel</button>
                <button onClick={handleOverride}
                  className="flex-1 px-4 py-2 min-h-[44px] rounded-xl bg-primary text-on-primary text-sm font-semibold">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Early Access Management */}
      <div className="bg-surface-container-low/40 border border-outline-variant/30 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-on-surface">Early Access Management</h3>
            <p className="text-xs text-on-surface-variant mt-0.5">Grant Pro users early access to upcoming features</p>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 uppercase">{earlyAccessUsers.length} users</span>
        </div>
        <div className="p-4">
          <form onSubmit={handleAddEarlyAccess} className="flex gap-2 mb-4">
            <input type="email" value={eaEmail} onChange={e => setEaEmail(e.target.value)} placeholder="Enter user email to grant early access"
              className="flex-1 px-3 py-2 bg-surface-container-highest/50 border border-outline-variant/40 rounded-lg text-xs text-on-surface outline-none focus:border-primary/50" required />
            <button type="submit" disabled={eaAdding}
              className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary text-xs font-semibold rounded-lg transition-all disabled:opacity-50 whitespace-nowrap">
              {eaAdding ? 'Adding...' : 'Grant Access'}
            </button>
          </form>
          {eaLoading ? (
            <p className="text-xs text-on-surface-variant text-center py-4">Loading...</p>
          ) : earlyAccessUsers.length === 0 ? (
            <p className="text-xs text-on-surface-variant text-center py-4">No early access users yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {earlyAccessUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between py-2 px-3 hover:bg-surface-container-highest/20 rounded-lg">
                  <div>
                    <p className="text-xs font-medium text-on-surface">{u.name || 'N/A'}</p>
                    <p className="text-[10px] text-on-surface-variant">{u.email}</p>
                  </div>
                  <button onClick={() => handleRemoveEarlyAccess(u.id)} className="text-[10px] text-error hover:text-error/80">Revoke</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Payment Verification Tab for Admin
function SubscriptionPaymentsTab({ triggerToast }) {
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [expandedPayment, setExpandedPayment] = useState(null);

  const fetchPayments = async (status = '') => {
    setLoading(true);
    try {
      const res = await subscriptionApi.getAdminPayments(status || undefined);
      if (res.success) setPayments(res.payments || []);
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  };

  const fetchStats = async () => {
    try {
      const res = await subscriptionApi.getAdminPaymentStats();
      if (res.success) setStats(res.stats);
    } catch (err) { console.error(err) }
  };

  useEffect(() => { fetchPayments(statusFilter); fetchStats(); }, [statusFilter]);

  const handleApprove = async (paymentId) => {
    setActionLoading(paymentId);
    try {
      const res = await subscriptionApi.approvePayment(paymentId);
      if (res.success) { triggerToast(res.message); fetchPayments(statusFilter); fetchStats(); }
      else triggerToast(res.message || 'Failed to approve payment');
    } catch (err) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const handleReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setActionLoading(rejectModal);
    try {
      const res = await subscriptionApi.rejectPayment(rejectModal, rejectReason.trim());
      if (res.success) { triggerToast('Payment rejected.'); fetchPayments(statusFilter); fetchStats(); }
      else triggerToast(res.message || 'Failed to reject payment');
    } catch (err) { triggerToast('Network error'); }
    finally { setActionLoading(null); setRejectModal(null); setRejectReason(''); }
  };

  const statusConfig = (s) => ({
    pending: { label: 'Pending', color: 'text-amber-400', bg: 'bg-amber-400/10', icon: 'hourglass_top' },
    approved: { label: 'Approved', color: 'text-success', bg: 'bg-success/10', icon: 'check_circle' },
    rejected: { label: 'Rejected', color: 'text-error', bg: 'bg-error/10', icon: 'cancel' },
  }[s] || { label: s, color: 'text-on-surface-variant', bg: 'bg-outline-variant/20', icon: 'help' });

  const statCards = stats ? [
    { label: 'Total Submissions', value: stats.total, icon: 'receipt_long', color: 'text-primary' },
    { label: 'Pending', value: stats.pending, icon: 'hourglass_top', color: 'text-amber-400' },
    { label: 'Approved', value: stats.approved, icon: 'check_circle', color: 'text-success' },
    { label: 'Revenue', value: `₹${stats.totalRevenue?.toLocaleString('en-IN') || '0'}`, icon: 'payments', color: 'text-secondary' },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {statCards.map((s, i) => (
            <div key={i} className="glass-card p-4 rounded-[16px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-2">
                <span className={`material-symbols-outlined text-lg ${s.color}`}>{s.icon}</span>
                <span className="text-[10px] text-on-surface-variant font-medium">{s.label}</span>
              </div>
              <p className="text-xl font-bold text-on-surface">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
          {['', 'pending', 'approved', 'rejected'].map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 min-h-[44px] text-[10px] font-semibold rounded-lg border transition-all ${
              statusFilter === s ? 'bg-primary/10 border-primary/30 text-primary' : 'border-outline-variant/30 text-on-surface-variant hover:border-outline-variant/50'
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {/* Payments Table */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-surface-container-low/30 rounded-xl animate-pulse" />)}</div>
      ) : payments.length === 0 ? (
        <div className="glass-card p-8 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md text-center">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant block mb-3">payments</span>
          <p className="text-sm font-semibold text-on-background">No payments found</p>
          <p className="text-xs text-on-surface-variant">All payment submissions will appear here.</p>
        </div>
      ) : (
        <div className="glass-card rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-surface-container-low/50">
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left p-3 font-semibold text-on-surface-variant">User</th>
                  <th className="text-left p-3 font-semibold text-on-surface-variant">Plan</th>
                  <th className="text-left p-3 font-semibold text-on-surface-variant">Amount</th>
                  <th className="text-left p-3 font-semibold text-on-surface-variant">Transaction ID</th>
                  <th className="text-left p-3 font-semibold text-on-surface-variant">Date</th>
                  <th className="text-left p-3 font-semibold text-on-surface-variant">Status</th>
                  <th className="text-right p-3 font-semibold text-on-surface-variant">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const sc = statusConfig(p.status);
                  const isExpanded = expandedPayment === p.id;
                  return (
                    <React.Fragment key={p.id}>
                      <tr className="border-b border-outline-variant/10 hover:bg-surface-container-low/30 cursor-pointer transition-colors"
                        onClick={() => setExpandedPayment(isExpanded ? null : p.id)}>
                        <td className="p-3">
                          <p className="text-on-surface font-semibold">{p.user_name || 'Unknown'}</p>
                          <p className="text-[9px] text-on-surface-variant">{p.user_email}</p>
                        </td>
                        <td className="p-3">
                          <span className="font-semibold text-on-surface">{p.plan_name}</span>
                          <p className="text-[9px] text-on-surface-variant capitalize">{p.billing_cycle}</p>
                        </td>
                        <td className="p-3 text-on-surface font-medium">₹{Number(p.amount).toLocaleString('en-IN')}</td>
                        <td className="p-3">
                          <span className="font-mono text-[10px] text-on-surface-variant">{p.transaction_id || '—'}</span>
                        </td>
                        <td className="p-3 text-on-surface-variant text-[10px]">{new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                        <td className="p-3">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${sc.bg} ${sc.color}`}>{sc.label}</span>
                        </td>
                        <td className="p-3 text-right">
                          {p.status === 'pending' && (
                            <div className="flex items-center justify-end gap-1.5">
                              <button onClick={(e) => { e.stopPropagation(); handleApprove(p.id); }}
                                disabled={actionLoading === p.id}
                                className="px-2.5 py-1.5 min-h-[44px] bg-success/10 text-success text-[10px] font-semibold rounded-lg hover:bg-success/20 disabled:opacity-50 transition-colors flex items-center gap-1">
                                {actionLoading === p.id ? <span className="animate-spin material-symbols-outlined text-[10px]">sync</span> : <span className="material-symbols-outlined text-[10px]">check</span>}
                                Approve
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setRejectModal(p.id); }}
                                className="px-2.5 py-1.5 min-h-[44px] bg-error/10 text-error text-[10px] font-semibold rounded-lg hover:bg-error/20 transition-colors flex items-center gap-1">
                                <span className="material-symbols-outlined text-[10px]">close</span>
                                Reject
                              </button>
                            </div>
                          )}
                          {p.status !== 'pending' && (
                            <span className="text-[10px] text-on-surface-variant">{p.reviewed_at ? new Date(p.reviewed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}</span>
                          )}
                        </td>
                      </tr>
                      {/* Expanded Row */}
                      {isExpanded && (
                        <tr key={`${p.id}-details`}>
                          <td colSpan={7} className="p-4 bg-surface-container-low/20">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Payment Details</h4>
                                <div className="text-xs space-y-1">
                                  <p className="flex justify-between"><span className="text-on-surface-variant">Plan:</span><span className="text-on-surface font-medium">{p.plan_name}</span></p>
                                  <p className="flex justify-between"><span className="text-on-surface-variant">Cycle:</span><span className="text-on-surface capitalize">{p.billing_cycle}</span></p>
                                  <p className="flex justify-between"><span className="text-on-surface-variant">Amount:</span><span className="text-on-surface font-medium">₹{Number(p.amount).toLocaleString('en-IN')}</span></p>
                                  <p className="flex justify-between"><span className="text-on-surface-variant">TXN ID:</span><span className="text-on-surface font-mono text-[10px]">{p.transaction_id}</span></p>
                                  <p className="flex justify-between"><span className="text-on-surface-variant">Submitted:</span><span className="text-on-surface">{new Date(p.created_at).toLocaleString('en-IN')}</span></p>
                                  {p.reviewed_at && <p className="flex justify-between"><span className="text-on-surface-variant">Reviewed:</span><span className="text-on-surface">{new Date(p.reviewed_at).toLocaleString('en-IN')}</span></p>}
                                </div>
                                {p.payment_notes && (
                                  <div className="mt-2 p-2 bg-surface-container-low/30 rounded-lg">
                                    <p className="text-[9px] text-on-surface-variant font-medium">Notes:</p>
                                    <p className="text-[10px] text-on-surface">{p.payment_notes}</p>
                                  </div>
                                )}
                                {p.rejection_reason && (
                                  <div className="mt-2 p-2 bg-error/5 border border-error/20 rounded-lg">
                                    <p className="text-[9px] text-error font-medium">Rejection Reason:</p>
                                    <p className="text-[10px] text-error/80">{p.rejection_reason}</p>
                                  </div>
                                )}
                              </div>
                              {p.payment_screenshot_url && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Payment Screenshot</h4>
                                  <img src={p.payment_screenshot_url} alt="Payment Screenshot" className="w-full max-h-48 object-contain rounded-xl bg-black/20 border border-outline-variant/20" />
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setRejectModal(null); setRejectReason(''); }}>
          <div className="bg-surface-container-low border border-outline-variant/40 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-on-surface mb-4">Reject Payment</h3>
            <p className="text-xs text-on-surface-variant mb-4">Provide a reason for rejecting this payment.</p>
            <div className="space-y-3">
              {['Invalid Screenshot', 'Amount Mismatch', 'Transaction Not Found', 'Blurred Proof'].map(r => (
                <button key={r} onClick={() => setRejectReason(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs border transition-all ${
                    rejectReason === r ? 'border-error/50 bg-error/5 text-error' : 'border-outline-variant/30 text-on-surface-variant hover:border-outline-variant/50'
                  }`}>{r}</button>
              ))}
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Or type custom reason..."
                className="w-full bg-surface-container-highest/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 resize-none h-20"
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="flex-1 px-4 py-2 min-h-[44px] rounded-xl border border-outline-variant/40 text-sm text-on-surface">Cancel</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || actionLoading === rejectModal}
                className="flex-1 px-4 py-2 min-h-[44px] rounded-xl bg-error text-white text-sm font-semibold disabled:opacity-50">
                {actionLoading === rejectModal ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Verify Sponsor Tab (dedicated public contribution approval) ───────────
function VerifySponsorTab({ triggerToast }) {
  const [contributions, setContributions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [actionLoading, setActionLoading] = useState(null);
  const [showNotesModal, setShowNotesModal] = useState(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionMode, setActionMode] = useState('approve');
  const [rejectionReason, setRejectionReason] = useState('');

  const getHeaders = async () => {
    const token = await getAuthToken();
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  };

  const fetchContributions = async (status) => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const url = status ? `/api/admin/sponsor/contributions?status=${status}` : '/api/admin/sponsor/contributions';
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) setContributions(data.contributions || []);
    } catch (e) { triggerToast('Failed to load contributions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchContributions(statusFilter); }, [statusFilter]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/sponsor/contribution/approve', {
        method: 'POST', headers,
        body: JSON.stringify({ contributionId: id, adminNotes: actionNotes })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution approved! Prize pool updated.'); fetchContributions(statusFilter); setShowNotesModal(null); setActionNotes(''); }
      else triggerToast(data.message || 'Failed to approve');
    } catch (e) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/sponsor/contribution/reject', {
        method: 'POST', headers,
        body: JSON.stringify({ contributionId: id, adminNotes: actionNotes })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution rejected'); fetchContributions(statusFilter); setShowNotesModal(null); setActionNotes(''); }
      else triggerToast(data.message || 'Failed to reject');
    } catch (e) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const openApproveModal = (id) => { setActionMode('approve'); setActionNotes(''); setShowNotesModal(id); };
  const openRejectModal = (id) => { setActionMode('reject'); setActionNotes(''); setShowNotesModal(id); };

  const statusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500/15 text-emerald-400';
      case 'rejected': return 'bg-error/15 text-error';
      default: return 'bg-warning/15 text-warning';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-background">Verify Sponsor Contributions</h2>
          <p className="text-xs text-on-surface-variant">Approve or reject public sponsor contributions — approved amounts are added to prize pool</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['pending', 'approved', 'rejected', ''].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 min-h-[44px] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${statusFilter === s ? 'bg-primary text-white' : 'bg-surface-container-highest/40 text-on-surface-variant hover:text-on-background'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-xs text-on-surface-variant">Loading contributions...</div>
      ) : contributions.length === 0 ? (
        <div className="text-center py-12 bg-surface-container-low/30 rounded-2xl border border-outline-variant/20">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">verified</span>
          <p className="text-xs text-on-surface-variant mt-2">No {statusFilter || ''} contributions found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-outline-variant/20">
          <table className="w-full text-xs">
            <thead className="bg-surface-container-highest/40">
              <tr className="border-b border-outline-variant/20">
                <th className="text-left py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Contributor</th>
                <th className="text-left py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Tournament</th>
                <th className="text-right py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Amount</th>
                <th className="text-left py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Transaction ID</th>
                <th className="text-left py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Status</th>
                <th className="text-center py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Screenshot</th>
                <th className="text-center py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {contributions.map(c => (
                <tr key={c.id} className="hover:bg-surface-container-low/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-on-background">{c.contributor_name}</div>
                    {c.contributor_email && <div className="text-[10px] text-on-surface-variant/60">{c.contributor_email}</div>}
                    {c.message && <div className="text-[10px] text-on-surface-variant/40 italic mt-0.5">"{c.message}"</div>}
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-on-background">{c.tournament_title || c.tournament_id}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-bold text-on-background">₹{(parseInt(c.amount) || 0).toLocaleString('en-IN')}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-[10px] text-on-surface-variant">{c.transaction_id || '—'}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-medium capitalize ${statusColor(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {c.screenshot_url ? (
                      <a href={c.screenshot_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline text-[10px]">
                        <span className="material-symbols-outlined text-[14px]">image</span>
                        View
                      </a>
                    ) : (
                      <span className="text-on-surface-variant/40">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {c.status === 'pending' ? (
                      <div className="flex gap-1.5 justify-center">
                        <button onClick={() => openApproveModal(c.id)}
                          className="px-2.5 py-1 min-h-[32px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg transition-all">
                          Approve
                        </button>
                        <button onClick={() => openRejectModal(c.id)}
                          className="px-2.5 py-1 min-h-[32px] bg-error/10 hover:bg-error/20 text-error text-[10px] font-bold rounded-lg transition-all">
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-on-surface-variant/60">{c.admin_notes ? `Notes: ${c.admin_notes}` : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notes/Confirmation Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-[#0f111a] border border-outline-variant rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm">{actionMode === 'approve' ? 'Approve Contribution' : 'Reject Contribution'}</h3>
            <p className="text-xs text-on-surface-variant">
              {actionMode === 'approve'
                ? 'This will mark the contribution as approved and add the amount to the tournament prize pool.'
                : 'This will reject the contribution. You can optionally provide a reason below.'}
            </p>
            <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)}
              placeholder="Optional admin notes..."
              className="w-full bg-surface-container-highest/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 resize-none h-20"
            />
            <div className="flex gap-3">
              <button onClick={() => {
                if (actionMode === 'approve') handleApprove(showNotesModal);
                else handleReject(showNotesModal);
              }} disabled={actionLoading === showNotesModal}
                className={`flex-1 px-4 py-2 min-h-[44px] rounded-xl text-white text-sm font-semibold disabled:opacity-50 ${actionMode === 'approve' ? 'bg-emerald-500' : 'bg-error'}`}>
                {actionLoading === showNotesModal ? 'Processing...' : actionMode === 'approve' ? 'Approve' : 'Reject'}
              </button>
              <button onClick={() => setShowNotesModal(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-outline-variant/40 text-sm text-on-surface">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Sponsor Management Tab for Admin
function SponsorManagementTab({ triggerToast }) {
  const [subTab, setSubTab] = useState('requests');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [actionNotes, setActionNotes] = useState('');
  const [showNotesModal, setShowNotesModal] = useState(null);

  // Public contributions
  const [contributions, setContributions] = useState([]);
  const [contribLoading, setContribLoading] = useState(true);
  const [contribFilter, setContribFilter] = useState('');

  const getHeaders = async () => {
    const token = await getAuthToken();
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
  };

  const fetchRequests = async (status) => {
    setLoading(true);
    try {
      const headers = await getHeaders();
      const url = status ? `/api/admin/sponsor/requests?status=${status}` : '/api/admin/sponsor/requests';
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) setRequests(data.requests || []);
    } catch (e) { triggerToast('Failed to load sponsor requests'); }
    finally { setLoading(false); }
  };

  const fetchContributions = async (status) => {
    setContribLoading(true);
    try {
      const headers = await getHeaders();
      const url = status ? `/api/admin/sponsor/contributions?status=${status}` : '/api/admin/sponsor/contributions';
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) setContributions(data.contributions || []);
    } catch (e) { triggerToast('Failed to load contributions'); }
    finally { setContribLoading(false); }
  };

  useEffect(() => { if (subTab === 'requests') fetchRequests(statusFilter); }, [subTab, statusFilter]);
  useEffect(() => { if (subTab === 'contributions') fetchContributions(contribFilter); }, [subTab, contribFilter]);

  const handleApprove = async (id) => {
    setActionLoading(id);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/sponsor/approve', {
        method: 'POST', headers,
        body: JSON.stringify({ requestId: id, adminNotes: actionNotes })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Sponsor request approved!'); fetchRequests(statusFilter); setShowNotesModal(null); setActionNotes(''); }
      else triggerToast(data.message || 'Failed to approve');
    } catch (e) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const handleReject = async (id) => {
    setActionLoading(id);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/sponsor/reject', {
        method: 'POST', headers,
        body: JSON.stringify({ requestId: id, adminNotes: actionNotes })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Sponsor request rejected'); fetchRequests(statusFilter); setShowNotesModal(null); setActionNotes(''); }
      else triggerToast(data.message || 'Failed to reject');
    } catch (e) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const handleContributionApprove = async (id) => {
    setActionLoading(id);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/sponsor/contribution/approve', {
        method: 'POST', headers,
        body: JSON.stringify({ contributionId: id, adminNotes: actionNotes })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution approved! Prize pool updated.'); fetchContributions(contribFilter); setShowNotesModal(null); setActionNotes(''); }
      else triggerToast(data.message || 'Failed to approve');
    } catch (e) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const handleContributionReject = async (id) => {
    setActionLoading(id);
    try {
      const headers = await getHeaders();
      const res = await fetch('/api/admin/sponsor/contribution/reject', {
        method: 'POST', headers,
        body: JSON.stringify({ contributionId: id, adminNotes: actionNotes })
      });
      const data = await res.json();
      if (data.success) { triggerToast('Contribution rejected'); fetchContributions(contribFilter); setShowNotesModal(null); setActionNotes(''); }
      else triggerToast(data.message || 'Failed to reject');
    } catch (e) { triggerToast('Network error'); }
    finally { setActionLoading(null); }
  };

  const statusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500/15 text-emerald-400';
      case 'rejected': return 'bg-error/15 text-error';
      default: return 'bg-warning/15 text-warning';
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2">
        <button onClick={() => setSubTab('requests')}
          className={`px-4 py-2 min-h-[44px] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${subTab === 'requests' ? 'bg-primary text-white' : 'bg-surface-container-highest/40 text-on-surface-variant hover:text-on-background'}`}>
          Organizer Requests
        </button>
        <button onClick={() => setSubTab('contributions')}
          className={`px-4 py-2 min-h-[44px] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${subTab === 'contributions' ? 'bg-primary text-white' : 'bg-surface-container-highest/40 text-on-surface-variant hover:text-on-background'}`}>
          Public Contributions
        </button>
      </div>

      {subTab === 'requests' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-on-background">Organizer Sponsor Requests</h2>
              <p className="text-xs text-on-surface-variant">Review and manage prize pool sponsorship requests</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {['', 'pending', 'approved', 'rejected'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 min-h-[44px] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${statusFilter === s ? 'bg-primary text-white' : 'bg-surface-container-highest/40 text-on-surface-variant hover:text-on-background'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-xs text-on-surface-variant">Loading sponsor requests...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 bg-surface-container-low/30 rounded-2xl border border-outline-variant/20">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">sponsor</span>
              <p className="text-xs text-on-surface-variant mt-2">No sponsor requests found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map(req => (
                <div key={req.id} className="glass-card p-4 rounded-xl border border-outline-variant/30 bg-surface/40">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-on-background">{req.organizer_name || 'Unknown'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium capitalize ${statusColor(req.status)}`}>{req.status}</span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-on-surface-variant">
                          Amount: <span className="font-semibold text-on-surface">₹{(req.prize_pool_amount || 0).toLocaleString('en-IN')}</span>
                        </p>
                        {req.description && <p className="text-xs text-on-surface-variant">{req.description}</p>}
                        {req.admin_notes && <p className="text-[10px] text-on-surface-variant/60 italic">Admin notes: {req.admin_notes}</p>}
                        <p className="text-[10px] text-on-surface-variant/40">{new Date(req.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    {req.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setShowNotesModal(req.id); setActionNotes(''); }}
                          className="px-3 py-1.5 min-h-[44px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg transition-all">
                          Approve
                        </button>
                        <button onClick={() => { setShowNotesModal(req.id); setActionNotes(''); }}
                          className="px-3 py-1.5 min-h-[44px] bg-error/10 hover:bg-error/20 text-error text-[10px] font-bold rounded-lg transition-all">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {subTab === 'contributions' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-on-background">Public Sponsor Contributions</h2>
              <p className="text-xs text-on-surface-variant">Approve/reject public sponsor contributions — approved amounts are added to prize pool</p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {['', 'pending', 'approved', 'rejected'].map(s => (
              <button key={s} onClick={() => setContribFilter(s)}
                className={`px-3 py-1.5 min-h-[44px] rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${contribFilter === s ? 'bg-primary text-white' : 'bg-surface-container-highest/40 text-on-surface-variant hover:text-on-background'}`}>
                {s || 'All'}
              </button>
            ))}
          </div>

          {contribLoading ? (
            <div className="text-center py-12 text-xs text-on-surface-variant">Loading contributions...</div>
          ) : contributions.length === 0 ? (
            <div className="text-center py-12 bg-surface-container-low/30 rounded-2xl border border-outline-variant/20">
              <span className="material-symbols-outlined text-3xl text-on-surface-variant/40">handshake</span>
              <p className="text-xs text-on-surface-variant mt-2">No contributions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contributions.map(c => (
                <div key={c.id} className="glass-card p-4 rounded-xl border border-outline-variant/30 bg-surface/40">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-on-background">{c.contributor_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium capitalize ${statusColor(c.status)}`}>{c.status}</span>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs text-on-surface-variant">
                          Amount: <span className="font-semibold text-on-surface">₹{(parseInt(c.amount) || 0).toLocaleString('en-IN')}</span>
                        </p>
                        {c.tournament_title && <p className="text-xs text-on-surface-variant">Tournament: {c.tournament_title}</p>}
                        {c.contributor_email && <p className="text-xs text-on-surface-variant">Email: {c.contributor_email}</p>}
                        {c.message && <p className="text-xs text-on-surface-variant">Message: {c.message}</p>}
                        {c.screenshot_url && (
                          <a href={c.screenshot_url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">image</span> View Screenshot
                          </a>
                        )}
                        {c.admin_notes && <p className="text-[10px] text-on-surface-variant/60 italic">Admin notes: {c.admin_notes}</p>}
                        <p className="text-[10px] text-on-surface-variant/40">{new Date(c.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                    {c.status === 'pending' && (
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => { setShowNotesModal(c.id); setActionNotes(''); }}
                          className="px-3 py-1.5 min-h-[44px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-lg transition-all">
                          Approve
                        </button>
                        <button onClick={() => { setShowNotesModal(c.id); setActionNotes(''); }}
                          className="px-3 py-1.5 min-h-[44px] bg-error/10 hover:bg-error/20 text-error text-[10px] font-bold rounded-lg transition-all">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Notes Modal */}
      {showNotesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-[#0f111a] border border-outline-variant rounded-2xl p-5 max-w-md w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-sm">Add Admin Notes</h3>
            <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)}
              placeholder="Optional notes about this decision..."
              className="w-full bg-surface-container-highest/50 border border-outline-variant/30 rounded-lg px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 resize-none h-20"
            />
            <div className="flex gap-3">
              <button onClick={() => {
                if (subTab === 'requests') handleApprove(showNotesModal);
                else handleContributionApprove(showNotesModal);
              }} disabled={actionLoading === showNotesModal}
                className="flex-1 px-4 py-2 min-h-[44px] rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                {actionLoading === showNotesModal ? 'Processing...' : 'Approve'}
              </button>
              <button onClick={() => {
                if (subTab === 'requests') handleReject(showNotesModal);
                else handleContributionReject(showNotesModal);
              }} disabled={actionLoading === showNotesModal}
                className="flex-1 px-4 py-2 min-h-[44px] rounded-xl bg-error text-white text-sm font-semibold disabled:opacity-50">
                {actionLoading === showNotesModal ? 'Processing...' : 'Reject'}
              </button>
              <button onClick={() => setShowNotesModal(null)}
                className="px-4 py-2 min-h-[44px] rounded-xl border border-outline-variant/40 text-sm text-on-surface">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Feature Flags Tab for Admin
function FeatureFlagsTab({ triggerToast }) {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchFlags = async () => {
    setLoading(true);
    try {
      const res = await subscriptionApi.getFeatureFlags();
      if (res.success) setFlags(res.flags || []);
    } catch (e) { triggerToast('Failed to load feature flags'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchFlags(); }, []);

  const handleToggle = async (flagKey, currentValue) => {
    setToggling(flagKey);
    try {
      const res = await subscriptionApi.adminSaveFeatureFlag({ key: flagKey, value: !currentValue });
      if (res.success) {
        triggerToast(`Flag "${flagKey}" ${!currentValue ? 'enabled' : 'disabled'}`);
        fetchFlags();
      } else {
        triggerToast(res.message || 'Failed to update flag');
      }
    } catch (e) { triggerToast('Network error'); }
    finally { setToggling(null); }
  };

  const handleAddFlag = async (e) => {
    e.preventDefault();
    if (!newKey.trim()) return;
    setAdding(true);
    try {
      const res = await subscriptionApi.adminSaveFeatureFlag({ key: newKey.trim(), value: newValue, description: newDesc.trim() });
      if (res.success) {
        triggerToast(`Flag "${newKey}" created`);
        setNewKey(''); setNewValue(false); setNewDesc('');
        setShowAddForm(false);
        fetchFlags();
      } else {
        triggerToast(res.message || 'Failed to create flag');
      }
    } catch (e) { triggerToast('Network error'); }
    finally { setAdding(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-on-background">Feature Flags</h2>
          <p className="text-xs text-on-surface-variant">Toggle platform features on/off globally</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)}
          className="px-3.5 py-2 bg-primary hover:bg-primary-hover text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-md shadow-primary/10">
          <span className="material-symbols-outlined text-[16px]">{showAddForm ? 'close' : 'add'}</span>
          <span>{showAddForm ? 'Cancel' : 'New Flag'}</span>
        </button>
      </div>

      {/* Add Flag Form */}
      {showAddForm && (
        <form onSubmit={handleAddFlag}
          className="glass-card p-5 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm space-y-4">
          <h3 className="font-headline-md text-xs font-bold text-on-surface uppercase">Create New Flag</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Flag Key</label>
              <input type="text" value={newKey} onChange={e => setNewKey(e.target.value)}
                placeholder="e.g. new_checkout_flow"
                className="w-full bg-surface-container-highest/50 border border-outline-variant/30 rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20" required />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Default Value</label>
              <label className="flex items-center gap-2 cursor-pointer mt-2">
                <div onClick={() => setNewValue(!newValue)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${newValue ? 'bg-primary' : 'bg-outline-variant/50'}`}>
                  <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${newValue ? 'left-[18px]' : 'left-[3px]'}`} />
                </div>
                <span className="text-xs font-semibold text-on-surface">{newValue ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Description</label>
              <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="What does this flag control?"
                className="w-full bg-surface-container-highest/50 border border-outline-variant/30 rounded-xl px-3 py-2 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
          <button type="submit" disabled={adding || !newKey.trim()}
            className="px-5 py-2 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all shadow-md shadow-primary/10 flex items-center gap-1.5">
            {adding ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" /> : <span className="material-symbols-outlined text-[16px]">add_circle</span>}
            <span>Create Flag</span>
          </button>
        </form>
      )}

      {/* Flags List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="h-16 bg-surface-container-low/30 rounded-xl animate-pulse" />)}</div>
      ) : flags.length === 0 ? (
        <div className="glass-card p-8 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md text-center">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant/40 block mb-3">flag</span>
          <p className="text-sm font-semibold text-on-background">No feature flags defined</p>
          <p className="text-xs text-on-surface-variant">Create your first feature flag to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {flags.map(flag => (
            <div key={flag.flag_key}
              className="glass-card p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-mono font-bold text-on-background">{flag.flag_key}</code>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${flag.flag_value ? 'bg-emerald-500/15 text-emerald-400' : 'bg-on-surface-variant/15 text-on-surface-variant'}`}>
                    {flag.flag_value ? 'Active' : 'Inactive'}
                  </span>
                  {flag.updated_at && (
                    <span className="text-[9px] text-on-surface-variant/50 font-mono">
                      Updated {new Date(flag.updated_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                {flag.description && (
                  <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">{flag.description}</p>
                )}
              </div>
              <button onClick={() => handleToggle(flag.flag_key, flag.flag_value)}
                disabled={toggling === flag.flag_key}
                className="shrink-0">
                <div className={`w-11 h-6 rounded-full transition-colors relative ${flag.flag_value ? 'bg-primary' : 'bg-outline-variant/50'}`}>
                  {toggling === flag.flag_key ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    </div>
                  ) : (
                    <div className={`w-4.5 h-4.5 bg-white rounded-full absolute top-0.5 transition-all shadow-sm ${flag.flag_value ? 'left-[22px]' : 'left-[3px]'}`}
                      style={{ width: '18px', height: '18px', top: '3px' }} />
                  )}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Role Management Tab — Admin-only: promote/demote user roles
// ─────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────
// Multi-Role Helpers (local to this file)
// ─────────────────────────────────────────────────────────────

/**
 * Returns the highest-privilege role from a user's roles array.
 */
function getEffectiveRole(user) {
  const roles = user.roles || (user.role ? [user.role] : ['user']);
  const order = [ROLES.USER, ROLES.REG_PAYMENT_VERIFIER, ROLES.ORGANISER, ROLES.ADMIN];
  let highest = ROLES.USER;
  for (const r of order) {
    if (roles.includes(r)) highest = r;
  }
  return highest;
}

// Inline commission percentage editor with pencil icon toggle
function CommissionEditor({ percentage, onSave, saving }) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState(percentage)

  useEffect(() => { setInputVal(percentage) }, [percentage])

  const handleSave = () => {
    const num = parseFloat(inputVal)
    if (isNaN(num) || num < 0 || num > 100) return
    onSave(num)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          className="w-14 px-1.5 py-1 rounded-lg border border-emerald-500/50 bg-surface/60 text-on-background text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false) }}
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-6 h-6 rounded-md bg-emerald-500 text-white flex items-center justify-center hover:bg-emerald-600 transition-all shrink-0"
        >
          {saving ? (
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="material-symbols-outlined text-xs">check</span>
          )}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold transition-all"
      title="Edit commission rate"
    >
      <span>{percentage}%</span>
      <span className="material-symbols-outlined text-[12px]">edit</span>
    </button>
  )
}

function RoleManagementTab({ triggerToast }) {
  const rootAdminEmail = (import.meta.env.ADMIN_EMAIL || '').toLowerCase()
  const [searchQuery, setSearchQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [actioningUserId, setActioningUserId] = useState(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [privilegedUsers, setPrivilegedUsers] = useState([])

  const fetchAllUsers = useCallback(async () => {
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        const allUsers = data.users || []
        // Filter to users with privileged roles
        const priv = allUsers.filter(u => {
          const roles = u.roles || (u.role ? [u.role] : ['user'])
          return roles.some(r => r === ROLES.ADMIN || r === ROLES.ORGANISER || r === ROLES.REG_PAYMENT_VERIFIER)
        })
        setPrivilegedUsers(priv)
      }
    } catch { /* ignore */ }
  }, [])

  const fetchSearchResults = useCallback(async (query) => {
    if (!query.trim()) {
      setResults([])
      setHasSearched(false)
      return
    }
    setLoading(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        const q = query.toLowerCase()
        const filtered = (data.users || []).filter(u =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.orgHandle || '').toLowerCase().includes(q) ||
          (u.gamerTag || '').toLowerCase().includes(q)
        )
        setResults(filtered)
        setHasSearched(true)
      } else {
        triggerToast('Failed to fetch users')
      }
    } catch {
      triggerToast('Network error')
    }
    setLoading(false)
  }, [triggerToast])

  // Load privileged directory on mount
  useEffect(() => { fetchAllUsers() }, [fetchAllUsers])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) fetchSearchResults(searchQuery)
      else { setResults([]); setHasSearched(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery, fetchSearchResults])

  const handleUpdateRole = async (targetUserId, newRole, userName) => {
    const roleLabel = ROLE_LABELS[newRole] || newRole
    const confirmed = window.confirm(
      `Change ${userName || 'this user'}'s role to "${roleLabel}"?`
    )
    if (!confirmed) return

    setActioningUserId(targetUserId)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/update-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetUserId, newRole })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`Role updated to ${roleLabel}`)
        const updatedUser = { ...data.user }
        // Build expected roles array for local state
        const newRoles = newRole === ROLES.USER ? ['user'] :
          newRole === ROLES.ADMIN ? ['user', 'admin'] :
          newRole === ROLES.ORGANISER ? ['user', 'organiser'] :
          newRole === ROLES.REG_PAYMENT_VERIFIER ? ['user', 'reg_payment_verifier'] : ['user']
        updatedUser.roles = newRoles
        setResults(prev => prev.map(u =>
          u.id === targetUserId ? { ...u, ...updatedUser } : u
        ))
        fetchAllUsers() // refresh privileged directory
        // If the target user is the current admin, update context state immediately
        if (currentUser && targetUserId === currentUser.id) {
          setCurrentUser(prev => ({ ...prev, role: newRole, roles: newRoles }))
        }
      } else {
        triggerToast(data.message || data.error || 'Failed to update role')
      }
    } catch {
      triggerToast('Network error')
    }
    setActioningUserId(null)
  }

  const ROLE_ORDER = [ROLES.USER, ROLES.REG_PAYMENT_VERIFIER, ROLES.ORGANISER, ROLES.ADMIN]
  const ROLE_COLORS = {
    [ROLES.ADMIN]: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    [ROLES.ORGANISER]: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    [ROLES.REG_PAYMENT_VERIFIER]: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    [ROLES.USER]: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-on-background">Role Management</h2>
        <p className="text-xs text-on-surface-variant">Search users by name, email, or handle to promote or demote their platform role.</p>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">search</span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search by Name, Email, or Handle..."
          className="w-full bg-surface-container-highest/50 border border-outline-variant/30 rounded-xl pl-10 pr-4 py-2.5 text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {searchQuery && (
          <button onClick={() => { setSearchQuery(''); setResults([]); setHasSearched(false) }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        )}
      </div>

      {/* Assigned Privileged Users Directory */}
      {privilegedUsers.length > 0 && (
        <div className="glass-card rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant/20 bg-surface-container-lowest/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-primary">security</span>
              <h3 className="text-[11px] font-bold text-on-surface uppercase tracking-wider">Assigned Privileged Users</h3>
            </div>
            <span className="text-[10px] text-on-surface-variant/60">{privilegedUsers.length} user{privilegedUsers.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="divide-y divide-outline-variant/10 max-h-48 overflow-y-auto">
            {privilegedUsers.map(u => {
              const effectiveRole = getEffectiveRole(u)
              const isRootAdmin = u.email && rootAdminEmail && u.email.toLowerCase() === rootAdminEmail
              return (
                <div key={u.id} className="flex items-center justify-between px-4 py-2 hover:bg-surface-container-highest/10 transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-surface-container-highest/30 border border-outline-variant/20 flex items-center justify-center shrink-0 overflow-hidden">
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-[12px] text-on-surface-variant">person</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-on-background truncate">{u.name || 'Unknown'}</p>
                      <p className="text-[9px] text-on-surface-variant truncate">{u.email}</p>
                    </div>
                  </div>
                  {isRootAdmin ? (
                    <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400">
                      <span className="material-symbols-outlined text-[10px]">lock</span>
                      System Root
                    </span>
                  ) : (
                    <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${ROLE_COLORS[effectiveRole] || ROLE_COLORS[ROLES.USER]}`}>
                      {ROLE_LABELS[effectiveRole] || effectiveRole}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">{[1,2,3].map(i => (
          <div key={i} className="h-16 bg-surface-container-low/30 rounded-xl animate-pulse" />
        ))}</div>
      )}

      {/* No results */}
      {!loading && hasSearched && results.length === 0 && (
        <div className="glass-card p-8 rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md text-center">
          <span className="material-symbols-outlined text-3xl text-on-surface-variant/40 block mb-3">person_search</span>
          <p className="text-sm font-semibold text-on-background">No users found</p>
          <p className="text-xs text-on-surface-variant">Try a different search term.</p>
        </div>
      )}

      {/* Results Table */}
      {!loading && results.length > 0 && (
        <div className="glass-card rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-lowest/20">
                  <th className="text-left py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">User</th>
                  <th className="text-left py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Current Role</th>
                  <th className="text-right py-3 px-4 font-bold text-on-surface-variant uppercase tracking-wider text-[10px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {results.map(user => {
                  const effectiveRole = getEffectiveRole(user)
                  const roleIdx = ROLE_ORDER.indexOf(effectiveRole)
                  return (
                    <tr key={user.id} className="border-b border-outline-variant/10 hover:bg-surface-container-highest/10 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-surface-container-highest/30 border border-outline-variant/20 flex items-center justify-center shrink-0 overflow-hidden">
                            {user.avatar ? (
                              <img src={user.avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">person</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-on-background truncate">{user.name || 'Unknown'}</p>
                            <p className="text-[10px] text-on-surface-variant truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${ROLE_COLORS[effectiveRole] || ROLE_COLORS[ROLES.USER]}`}>
                          <span className="material-symbols-outlined text-[12px]">
                            {effectiveRole === ROLES.ADMIN ? 'shield' :
                             effectiveRole === ROLES.ORGANISER ? 'event' :
                             effectiveRole === ROLES.REG_PAYMENT_VERIFIER ? 'verified' : 'person'}
                          </span>
                          {ROLE_LABELS[effectiveRole] || effectiveRole}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* ─── ROOT ADMIN: Immutable System Account ─── */}
                          {user.email && rootAdminEmail && user.email.toLowerCase() === rootAdminEmail ? (
                            <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/5 border border-red-200 dark:border-red-500/20 text-[10px] font-semibold text-slate-500 dark:text-slate-400 italic shadow-sm">
                              <span className="material-symbols-outlined text-[12px]">lock</span>
                              Immutable System Account
                            </span>
                          ) : (
                            <>
                          {/* Promote: to reg_payment_verifier */}
                          {roleIdx < ROLE_ORDER.indexOf(ROLES.REG_PAYMENT_VERIFIER) && (
                            <button
                              onClick={() => handleUpdateRole(user.id, ROLES.REG_PAYMENT_VERIFIER, user.name)}
                              disabled={actioningUserId === user.id}
                              className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              {actioningUserId === user.id ? (
                                <div className="w-3 h-3 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
                              ) : (
                                <span className="material-symbols-outlined text-[12px]">verified</span>
                              )}
                              <span>Make Verifier</span>
                            </button>
                          )}
                          {/* Promote: to organiser */}
                          {roleIdx < ROLE_ORDER.indexOf(ROLES.ORGANISER) && (
                            <button
                              onClick={() => handleUpdateRole(user.id, ROLES.ORGANISER, user.name)}
                              disabled={actioningUserId === user.id}
                              className="px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              {actioningUserId === user.id ? (
                                <div className="w-3 h-3 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-spin" />
                              ) : (
                                <span className="material-symbols-outlined text-[12px]">event</span>
                              )}
                              <span>Make Organiser</span>
                            </button>
                          )}
                          {/* Demote: revoke to user */}
                          {roleIdx > ROLE_ORDER.indexOf(ROLES.USER) && (
                            <button
                              onClick={() => handleUpdateRole(user.id, ROLES.USER, user.name)}
                              disabled={actioningUserId === user.id}
                              className="px-2.5 py-1.5 bg-slate-500/10 hover:bg-slate-500/20 border border-slate-500/20 text-slate-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                            >
                              {actioningUserId === user.id ? (
                                <div className="w-3 h-3 rounded-full border-2 border-slate-400/30 border-t-slate-400 animate-spin" />
                              ) : (
                                <span className="material-symbols-outlined text-[12px]">undo</span>
                              )}
                              <span>Revoke to User</span>
                            </button>
                          )}
                          {/* No actions possible (already admin) */}
                          {effectiveRole === ROLES.ADMIN && (
                            <span className="text-[10px] text-on-surface-variant/50 italic px-2">Protected</span>
                          )}
                          </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-outline-variant/10 text-[10px] text-on-surface-variant/60">
            {results.length} user{results.length !== 1 ? 's' : ''} found
          </div>
        </div>
      )}

      {/* Quick role reference */}
      <div className="glass-card p-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md shadow-sm">
        <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-3">Role Hierarchy Reference</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[ROLES.USER, ROLES.REG_PAYMENT_VERIFIER, ROLES.ORGANISER, ROLES.ADMIN].map(role => (
            <div key={role} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${ROLE_COLORS[role]}`}>
              <span className="material-symbols-outlined text-[16px]">
                {role === ROLES.ADMIN ? 'shield' :
                 role === ROLES.ORGANISER ? 'event' :
                 role === ROLES.REG_PAYMENT_VERIFIER ? 'verified' : 'person'}
              </span>
              <div>
                <p className="text-[11px] font-bold">{ROLE_LABELS[role]}</p>
                <p className="text-[9px] opacity-70">{role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Organizer Usage Stats for Admin Overview
function OrganizerUsageStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getAuthToken();
        const res = await fetch('/api/admin/organizer-usage', {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => r.json());
        if (res.success) setStats(res.stats);
      } catch (e) {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <p className="text-xs text-on-surface-variant text-center py-4">Loading usage statistics...</p>;
  if (!stats) return <p className="text-xs text-on-surface-variant text-center py-4">No usage data available.</p>;

  const metrics = [
    { label: 'Total Tournaments Created', value: stats.totalTournaments?.toLocaleString() || '0', change: `${stats.tournamentGrowth || 0}%` },
    { label: 'Total Participants Registered', value: stats.totalParticipants?.toLocaleString() || '0', change: `${stats.participantGrowth || 0}%` },
    { label: 'Active Organizers', value: stats.activeOrganizers?.toString() || '0', change: '' },
    { label: 'Avg Tournaments/Organizer', value: stats.avgTournamentsPerOrganizer?.toString() || '0', change: '' },
    { label: 'Total Staff Invited', value: stats.totalStaff?.toLocaleString() || '0', change: '' },
    { label: 'Total Revenue Collected', value: `₹${(stats.totalRevenue || 0).toLocaleString('en-IN')}`, change: '' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {metrics.map((m, i) => (
        <div key={i} className="bg-surface-container-highest/20 border border-outline-variant/20 rounded-xl p-3">
          <p className="text-[10px] text-on-surface-variant">{m.label}</p>
          <p className="text-base font-bold text-on-surface">{m.value}</p>
          {m.change && <p className="text-[9px] text-emerald-400">+{m.change} growth</p>}
        </div>
      ))}
    </div>
  );
}

// Bulk Approvals Tab for Admin — VERIFIED_BY_HOST → APPROVED
function BulkApprovalsTab({ triggerToast }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selectAll, setSelectAll] = useState(false);

  const fetchVerified = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/pending-registrations', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setRegistrations(data.registrations.filter(r => r.status === 'VERIFIED_BY_HOST'));
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useRefetchOnFocus(fetchVerified);
  useEffect(() => { fetchVerified(); }, [fetchVerified]);

  const groupedByTournament = useMemo(() => {
    const map = {};
    registrations.forEach(r => {
      const key = r.tournament_id;
      if (!map[key]) map[key] = { id: key, title: r.tournament_title, game: r.tournament_game, entryFee: r.entry_fee_amount, registrations: [] };
      map[key].registrations.push(r);
    });
    return Object.values(map).sort((a, b) => a.title?.localeCompare(b.title));
  }, [registrations]);

  const totalSelected = Object.values(selected).filter(Boolean).length;

  const handleSelectAll = () => {
    const newVal = !selectAll;
    setSelectAll(newVal);
    const newSelected = {};
    registrations.forEach(r => { newSelected[r.id] = newVal; });
    setSelected(newSelected);
  };

  const handleToggle = (id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    setSelectAll(false);
  };

  const handleBulkApprove = async () => {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) { triggerToast('No registrations selected.'); return; }
    setBulkLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch('/api/admin/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ registrationIds: ids })
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(`${data.results.approved.length} registrations approved!`);
        setRegistrations(prev => prev.filter(r => !ids.includes(r.id)));
        setSelected({});
        setSelectAll(false);
        if (data.results.skipped.length > 0) {
          triggerToast(`${data.results.skipped.length} skipped (not in VERIFIED_BY_HOST status).`);
        }
      } else {
        triggerToast(data.message || 'Bulk approval failed.');
      }
    } catch { triggerToast('Network error.'); }
    setBulkLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-on-background">Bulk Approvals</h2>
          <p className="text-xs text-on-surface-variant">{registrations.length} registrations awaiting final approval (VERIFIED_BY_HOST)</p>
        </div>
        <div className="flex gap-2">
          {totalSelected > 0 && (
            <button onClick={handleBulkApprove} disabled={bulkLoading}
              className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-xs font-bold hover:bg-emerald-600 transition-all disabled:opacity-40 flex items-center gap-1.5">
              {bulkLoading ? <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <span className="material-symbols-outlined text-[14px]">how_to_reg</span>}
              Approve {totalSelected} Selected
            </button>
          )}
          <button onClick={fetchVerified} disabled={loading}
            className="px-4 py-2 rounded-xl bg-surface border border-outline-variant/30 text-xs font-bold text-on-background hover:bg-surface-variant transition-all flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px]">refresh</span> Refresh
          </button>
        </div>
      </div>

      {registrations.length > 0 && (
        <div className="flex items-center gap-3 px-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={selectAll} onChange={handleSelectAll}
              className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary/30" />
            <span className="text-xs font-medium text-on-background">Select All ({registrations.length})</span>
          </label>
        </div>
      )}

      {groupedByTournament.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-4xl text-on-surface-variant/30 mb-3">how_to_reg</span>
          <p className="text-sm font-medium text-on-surface-variant">No registrations awaiting final approval</p>
        </div>
      ) : groupedByTournament.map(group => (
        <div key={group.id} className="rounded-xl bg-surface border border-outline-variant/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-outline-variant/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">{group.game || 'Game'}</span>
              <h3 className="font-bold text-sm text-on-background truncate">{group.title}</h3>
              <span className="text-[11px] text-on-surface-variant bg-surface-variant/50 px-2 py-0.5 rounded-full">{group.registrations.length} regs</span>
            </div>
            {group.entryFee > 0 && <span className="text-[11px] font-bold text-emerald-500">₹{group.entryFee}/slot</span>}
          </div>
          <div className="divide-y divide-outline-variant/10">
            {group.registrations.map(reg => (
              <div key={reg.id} className="px-4 py-3 flex items-center gap-3">
                <input type="checkbox" checked={!!selected[reg.id]} onChange={() => handleToggle(reg.id)}
                  className="w-4 h-4 rounded border-outline-variant/30 text-primary focus:ring-primary/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-on-background">{reg.team_name}</p>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Verified</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">Captain: {reg.captain} &middot; UTR: {reg.payment_utr || reg.transaction_id || '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}