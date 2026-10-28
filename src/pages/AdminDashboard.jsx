import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../ThemeContext.jsx'
import { motion, AnimatePresence } from 'framer-motion'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus.js'
import { usePolling } from '../hooks/usePolling.js'
import { fetchJsonWithRetry } from '../utils/api.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { subscriptionApi } from '../services/subscriptionApi.js'
import ActivityFeed from '../components/ActivityFeed'
import { formatDate, formatDateTime } from '../utils/timeFormat'
import { injectDummyRegistrations, getTestInjectionSummary, deleteTestInjectionData, pruneOverflowRegistrations, clearDevTestingData } from '../utils/testInjector'
import BottomSheetModal from '../components/BottomSheetModal.jsx'
import { ROLES, hasRole, getUserRoles } from '../utils/iamRoles.js'
import AdminLayout from '../components/admin/AdminLayout.jsx'
import { ReviewKYCModal } from '../components/admin/ReviewKYCModal.jsx'
import { UserGovernance } from '../components/admin/UserGovernance.jsx'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function AdminDashboard({ onNavigate }) {
  const { theme, setTheme } = useTheme()
  const [currentUser, setCurrentUser] = useCurrentUser()

  // Active Tab
  const [activeTab, setActiveTab] = useState('overview')

  // API Data States
  const [kycApplications, setKycApplications] = useState([])
  const [sponsorContributions, setSponsorContributions] = useState([])
  const [usersList, setUsersList] = useState([])
  const [tournamentsList, setTournamentsList] = useState([])
  const [, setTournamentsLoading] = useState(false)
  const [tournamentSearchQuery, setTournamentSearchQuery] = useState('')
  const [financials, setFinancials] = useState({
    totalPrizePools: 0,
    totalOperationalRevenue: 0,
    activeTourneysCount: 0,
    platformFeePercentage: 10,
    allTimePrizePool: 0,
    allTimeCommission: 0,
    totalHostedArenas: 0,
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
  const [kycActionLoading, setKycActionLoading] = useState(false)
  const [deleteUserId, setDeleteUserId] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [isClearingDevData, setIsClearingDevData] = useState(false)

  // Injector state
  const [injectTournamentId, setInjectTournamentId] = useState('')
  const [injectSlotCount, setInjectSlotCount] = useState(128)
  const [isInjecting, setIsInjecting] = useState(false)
  const [isPruning, setIsPruning] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [deleteSummary, setDeleteSummary] = useState(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [isDeletingTestData, setIsDeletingTestData] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  // Search state for users
  const [userSearchQuery, setUserSearchQuery] = useState('')

  // Tournaments Governance Drilldown Details View
  const [activeTournament, setActiveTournament] = useState(null)
  const [registrationData, setRegistrationData] = useState([])
  const [registrationLoading, setRegistrationLoading] = useState(false)

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

  const fetchSponsorContributions = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/admin/sponsor/contributions', { headers: await getHeaders() })
    if (ok && data?.success) setSponsorContributions(data.contributions || [])
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
        allTimePrizePool: Number(data.allTimePrizePool || 0),
        allTimeCommission: Number(data.allTimeCommission || 0),
        totalHostedArenas: Number(data.totalHostedArenas || 0),
        ledger: data.ledger || [],
        engagementCurve: data.engagementCurve || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        trafficBars: data.trafficBars || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      })
    }
  }

  const fetchGlobalThemeSetting = async () => {
    const { ok, data } = await fetchJsonWithRetry('/api/settings/theme')
    if (ok && data?.success && data.theme) setThemeMode(data.theme)
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
    } catch {
      setRegistrationData([])
    } finally {
      setRegistrationLoading(false)
    }
  }

  const handleConfirmRegistration = async (regId) => {
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
        triggerToast('Registration confirmed. User notified.')
        fetchRegistrations(activeTournament.id)
        fetchTournaments()
      } else {
        triggerToast(json.message || json.error || 'Failed to confirm registration.')
      }
    } catch {
      triggerToast('Network error confirming registration.')
    }
  }

  const handleRejectRegistration = async (regId) => {
    const reason = window.prompt('Enter rejection reason:', 'Invalid Screenshot')
    if (reason === null) return
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${activeTournament.id}/registrations/${regId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason })
      })
      const json = await res.json()
      if (json.success) {
        setRegistrationData(prev => prev.map(r => r.id === regId ? { ...r, status: 'rejected', rejection_reason: reason } : r))
        triggerToast('Registration rejected.')
        fetchRegistrations(activeTournament.id)
        fetchTournaments()
      } else {
        triggerToast(json.message || json.error || 'Failed to reject registration.')
      }
    } catch {
      triggerToast('Network error rejecting registration.')
    }
  }

  const loadAllAdminData = useCallback(() => {
    fetchKycApplications()
    fetchSponsorContributions()
    fetchUsers()
    fetchTournaments()
    fetchFinancials()
    fetchGlobalThemeSetting()
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
  usePolling(loadAllAdminData, 10000, isAdmin)

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
  const handleKycReview = async (status, notes) => {
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
          adminNotes: notes?.trim() || ''
        })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`KYC Request ${selectedKycApp.id} ${status.toUpperCase()}!`)
        setSelectedKycApp(null)
        fetchKycApplications()
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

  // Handle Clear Dev Testing Data
  const handleClearDevData = async () => {
    const targetTourney = injectTournamentId.trim()
    const confirmMsg = targetTourney
      ? `Are you sure you want to delete dev testing data for tournament "${targetTourney}"? Only test registrations and dummy teams will be removed.`
      : `Are you sure you want to delete ALL dev testing injected data across the platform? Only mock/dummy test records will be deleted without touching real tournaments, players, or wallets.`

    if (!window.confirm(confirmMsg)) return

    setIsClearingDevData(true)
    try {
      const res = await clearDevTestingData(targetTourney || null)
      if (res.success) {
        triggerToast(res.message || 'Dev testing data cleared successfully!')
        loadAllAdminData()
        if (activeTournament) {
          loadTournamentRegistrations(activeTournament.id)
        }
      } else {
        triggerToast(res.error || 'Failed to clear dev testing data')
      }
    } catch (err) {
      console.error('Error clearing dev testing data:', err)
      triggerToast(err.message || 'Error clearing dev testing data')
    } finally {
      setIsClearingDevData(false)
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
      loadAllAdminData()
    } else {
      triggerToast(`Injection failed: ${result.error}`)
    }
  }

  // Handle Pruning Overflow Registrations
  const handlePruneOverflow = async (targetId = null) => {
    const rawId = typeof targetId === 'string' && targetId ? targetId : injectTournamentId
    const tId = (rawId || '').trim()
    if (!tId) {
      triggerToast('Please select or enter a Tournament ID first.')
      return
    }
    const confirmMsg = `Prune all registrations exceeding the tournament slot capacity? This strictly ensures max registrations equals the number of slots.`
    if (!window.confirm(confirmMsg)) return

    setIsPruning(true)
    const result = await pruneOverflowRegistrations(tId)
    setIsPruning(false)

    if (result.success) {
      triggerToast(result.message)
      loadAllAdminData()
      if (activeTournament && activeTournament.id === tId) {
        handleDrilldownTournament(activeTournament)
      }
    } else {
      triggerToast(`Pruning failed: ${result.error}`)
    }
  }

  // Handle Test Injection Data Cleanup
  const handleOpenDeleteModal = async (targetId = null) => {
    const rawId = typeof targetId === 'string' && targetId ? targetId : injectTournamentId
    const tId = (rawId || '').trim()
    if (!tId) {
      triggerToast('Please select or enter a Tournament ID first.')
      return
    }
    setInjectTournamentId(tId)
    setDeleteError(null)
    setDeleteSummary(null)
    setIsDeleteModalOpen(true)
    setSummaryLoading(true)

    const result = await getTestInjectionSummary(tId)
    setSummaryLoading(false)
    if (result.success) {
      setDeleteSummary(result.summary)
    } else {
      setDeleteError(result.error || 'Failed to inspect test injection data.')
    }
  }

  const handleConfirmDeleteTestData = async () => {
    const tId = injectTournamentId.trim()
    if (!tId) return

    setIsDeletingTestData(true)
    setDeleteError(null)
    const result = await deleteTestInjectionData(tId)
    setIsDeletingTestData(false)

    if (result.success) {
      const deleted = result.deleted || {}
      const matchRecords = (deleted.matchAssignments ?? 0) + (deleted.matchResults ?? 0)
      const standingsRecords = (deleted.qualificationDecisions ?? 0)
        + (deleted.qualifiedTeams ?? 0)
        + (deleted.leaderboardRows ?? 0)
        + (deleted.finalStandings ?? 0)
        + (deleted.prizeAwards ?? 0)
      triggerToast(
        `Removed ${deleted.registrations ?? 0} registrations, ${deleted.teams ?? 0} teams, ${matchRecords} match records, and ${standingsRecords} qualification/standings records from ${result.tournamentId}. Payment records were preserved.`
      )
      setIsDeleteModalOpen(false)
      setDeleteSummary(null)
      fetchTournaments()
      if (activeTournament && (
        activeTournament.id === tId ||
        activeTournament.id.toLowerCase() === tId.toLowerCase() ||
        (result.tournamentId && activeTournament.id.toLowerCase() === result.tournamentId.toLowerCase())
      )) {
        fetchRegistrations(activeTournament.id)
        setActiveTournament(prev => prev ? { ...prev, slotsFilled: result.slotsFilled ?? prev.slotsFilled } : prev)
      }
    } else {
      setDeleteError(result.error || 'Failed to delete test injection data.')
      triggerToast(`Deletion failed: ${result.error}`)
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
      (u.district_id && u.district_id.toLowerCase().includes(q)) ||
      (u.role && u.role.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    )
  }, [usersList, userSearchQuery])

  const engagementCurve = financials.engagementCurve
  const trafficBars = financials.trafficBars

  const chartData = useMemo(() => {
    return financials.engagementCurve.map((val, idx) => ({
      name: `D${idx + 1}`,
      signups: val,
      visits: financials.trafficBars[idx] || 0
    }))
  }, [financials.engagementCurve, financials.trafficBars])

  // Render nothing while redirecting if the user is not verified admin
  if (!currentUser || !hasRole(getUserRoles(currentUser), ROLES.ADMIN)) {
    return null
  }

  return (
    <>
    <AdminLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onNavigate={onNavigate}
      currentUser={currentUser}
      badges={{
        kyc: kycApplications.filter(a => a.status === 'pending').length,
        sponsors: sponsorContributions.filter(c => c.status === 'pending').length,
      }}
      activeTournament={activeTournament}
      onBackTournament={() => { setActiveTournament(null); setRegistrationData([]); }}
    >
      {/* Toast Alert Banner */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 right-4 z-[9999] px-4 py-3 bg-[#07080C] text-white border border-outline-variant/30 rounded-xl shadow-2xl text-xs font-semibold"
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
          {/* Core KPIs grid — Rich Cards with Live + All-Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

            {/* Card 1: Prize Pools (Live + All-Time) */}
            <div className="flex flex-col p-5 rounded-xl border border-slate-200 dark:border-outline-variant/20 bg-white dark:bg-[#111827] shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10 shrink-0">
                  <span className="material-symbols-outlined text-lg">payments</span>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">Prize Pools</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">₹{financials.totalPrizePools.toLocaleString('en-IN')}</span>
                <span className="flex items-center px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 rounded-full gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  LIVE
                </span>
              </div>
              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-white/40">
                  <span className="material-symbols-outlined text-sm">history</span>
                  All-Time History
                </span>
                <span className="font-semibold text-slate-700 dark:text-white/80">₹{financials.allTimePrizePool.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Card 2: Platform Earnings (Live + All-Time) */}
            <div className="flex flex-col p-5 rounded-xl border border-slate-200 dark:border-outline-variant/20 bg-white dark:bg-[#111827] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 shrink-0">
                    <span className="material-symbols-outlined text-lg">percent</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">Platform Earnings</span>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">{financials.platformFeePercentage}%</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">₹{Math.round(financials.totalPrizePools * (financials.platformFeePercentage / 100)).toLocaleString('en-IN')}</span>
                <span className="flex items-center px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-500/10 rounded-full gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  LIVE
                </span>
              </div>
              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-white/40">
                  <span className="material-symbols-outlined text-sm">history</span>
                  All-Time Revenue
                </span>
                <span className="font-semibold text-slate-700 dark:text-white/80">₹{Math.round(financials.allTimeCommission).toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Card 3: Arenas (Active + Total Hosted) */}
            <div className="flex flex-col p-5 rounded-xl border border-slate-200 dark:border-outline-variant/20 bg-white dark:bg-[#111827] shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sky-500 bg-sky-50 dark:bg-sky-500/10 shrink-0">
                  <span className="material-symbols-outlined text-lg">stadium</span>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">Arenas</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl font-bold text-slate-900 dark:text-white">{financials.activeTourneysCount}</span>
                <span className="flex items-center px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-500/10 rounded-full gap-1">
                  ACTIVE
                </span>
              </div>
              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-500 dark:text-white/40">
                  <span className="material-symbols-outlined text-sm">history</span>
                  Total Hosted
                </span>
                <span className="font-semibold text-slate-700 dark:text-white/80">{financials.totalHostedArenas}</span>
              </div>
            </div>

            {/* Card 4: Gamer Roster */}
            <div className="flex flex-col p-5 rounded-xl border border-slate-200 dark:border-outline-variant/20 bg-white dark:bg-[#111827] shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-primary bg-primary/10 shrink-0">
                  <span className="material-symbols-outlined text-lg">groups</span>
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-white/50 uppercase tracking-wider">Gamer Roster</span>
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-white mb-3">{usersList.length}</span>
              <div className="mt-auto pt-3 border-t border-slate-100 dark:border-white/10 text-sm text-slate-500 dark:text-white/40 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">people</span>
                Total registered platform users
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
              
              <div className="w-full h-[200px] pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#e2e8f0'} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="signups" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Platform Pulse Bar Chart */}
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

              <div className="w-full h-[200px] pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? 'rgba(255,255,255,0.06)' : '#e2e8f0'} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontSize: '12px' }}
                    />
                    <Bar dataKey="visits" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
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

            {/* Dev/Testing Tools — Injector & Cleanup */}
            <div className="glass-card p-5 rounded-2xl border border-amber-500/40 bg-amber-500/[0.03] backdrop-blur-md shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="font-headline-md text-xs sm:text-sm font-bold text-amber-600 dark:text-amber-400 uppercase flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-500 text-xl">science</span>
                    <span>Dev / Testing Tools</span>
                  </h3>
                  <p className="font-body-sm text-[10px] sm:text-xs text-amber-700/70 dark:text-amber-400/50">
                    Inject mock registrations for capacity stress-testing or clear all dev testing dummy data.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold uppercase">
                    Safe Isolation
                  </span>
                </div>
              </div>

              <div className="border border-amber-500/20 rounded-xl p-3.5 space-y-3 bg-amber-500/[0.04]">
                {(() => {
                  const selectedInjectTourney = tournamentsList.find(t => t.id === injectTournamentId.trim());
                  const tourneySlotsTotal = selectedInjectTourney ? (parseInt(selectedInjectTourney.slotsTotal, 10) || 128) : 128;
                  const tourneySlotsFilled = selectedInjectTourney ? (parseInt(selectedInjectTourney.slotsFilled, 10) || 0) : 0;
                  const isOverflowing = selectedInjectTourney && (tourneySlotsFilled > tourneySlotsTotal);

                  return (
                    <>
                      {isOverflowing && (
                        <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="font-bold flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                              <span className="material-symbols-outlined text-sm">warning</span>
                              <span>Registration Overflow Detected ({tourneySlotsFilled} / {tourneySlotsTotal} slots)</span>
                            </div>
                            <p className="text-[11px] leading-tight">
                              This tournament has <strong>{tourneySlotsFilled}</strong> registrations but only <strong>{tourneySlotsTotal}</strong> total slots. Max registrations must equal number of slots.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handlePruneOverflow(injectTournamentId)}
                            disabled={isPruning}
                            className="px-3.5 py-1.5 min-h-[36px] bg-rose-600 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider hover:bg-rose-700 disabled:opacity-50 active:scale-95 transition-all shrink-0 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">content_cut</span>
                            <span>{isPruning ? 'Pruning...' : `Prune to ${tourneySlotsTotal} Slots`}</span>
                          </button>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                              Tournament ID {selectedInjectTourney && `(${selectedInjectTourney.slotsFilled || 0}/${tourneySlotsTotal} Filled)`}
                            </label>
                            {injectTournamentId && (
                              <button
                                type="button"
                                onClick={() => setInjectTournamentId('')}
                                className="text-[9px] text-amber-600/70 hover:text-amber-600 font-bold uppercase cursor-pointer"
                              >
                                Clear Selection
                              </button>
                            )}
                          </div>
                          <input
                            type="text"
                            list="admin-inject-tournaments-list"
                            value={injectTournamentId}
                            onChange={(e) => {
                              const val = e.target.value;
                              setInjectTournamentId(val);
                              const tMatch = tournamentsList.find(t => t.id === val.trim());
                              if (tMatch) {
                                const total = parseInt(tMatch.slotsTotal, 10) || 128;
                                const filled = parseInt(tMatch.slotsFilled, 10) || 0;
                                const rem = Math.max(0, total - filled);
                                setInjectSlotCount(rem > 0 ? rem : total);
                              }
                            }}
                            placeholder="Optional: Enter Tournament ID (Leave empty to target all)"
                            className="w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-surface/60 text-on-background text-xs font-mono placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          />
                          <datalist id="admin-inject-tournaments-list">
                            {tournamentsList.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.title ? `${t.title} (${t.id}) — ${t.slotsFilled || 0}/${t.slotsTotal || 128} slots` : t.id}
                              </option>
                            ))}
                          </datalist>
                        </div>

                        <div className="w-full sm:w-36 space-y-1">
                          <label className="font-label-caps text-[9px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Slots (Max: {tourneySlotsTotal})
                          </label>
                          <input
                            type="number"
                            value={injectSlotCount}
                            onChange={(e) => setInjectSlotCount(Math.min(tourneySlotsTotal, Math.max(1, Number(e.target.value))))}
                            min={1}
                            max={tourneySlotsTotal}
                            className="w-full px-3 py-2 rounded-lg border border-amber-500/30 bg-surface/60 text-on-background text-xs font-mono placeholder:text-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                          />
                        </div>

                        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleInjectSlots}
                            disabled={isInjecting || !injectTournamentId.trim()}
                            className="px-5 py-2.5 min-h-[44px] bg-amber-500 text-white rounded-xl font-headline-md text-[10px] font-bold uppercase tracking-wider shadow-md shadow-amber-500/20 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shrink-0 cursor-pointer"
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

                          <button
                            type="button"
                            onClick={handleClearDevData}
                            disabled={isClearingDevData || isInjecting}
                            className="px-4 py-2.5 min-h-[44px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 rounded-xl font-headline-md text-[10px] font-bold uppercase tracking-wider disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                            title={injectTournamentId.trim() ? `Clear dev testing data for tournament ${injectTournamentId}` : "Clear all dev testing injected data across all tournaments"}
                          >
                            {isClearingDevData ? (
                              <span className="flex items-center gap-1.5">
                                <span className="w-3.5 h-3.5 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                                Clearing Data...
                              </span>
                            ) : (
                              <>
                                <span className="material-symbols-outlined text-base">delete_sweep</span>
                                <span>Clear Data</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="text-[10px] text-amber-700/80 dark:text-amber-400/70 flex items-center gap-1.5 pt-1">
                        <span className="material-symbols-outlined text-xs shrink-0">info</span>
                        <span>
                          <strong>Clear Data</strong> removes test-marked registrations and dummy teams without touching real users, tournaments, or transactions.
                          {injectTournamentId.trim() ? ` Target: tournament ${injectTournamentId}.` : ' Target: all tournaments across platform.'}
                        </span>
                      </div>
                    </>
                  );
                })()}
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
              <p className="text-xs text-on-surface-variant text-center py-4">Usage statistics dashboard coming soon</p>
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
        <div className="flex flex-col max-w-6xl gap-6 mx-auto animate-in fade-in duration-300">
          
          {/* Page Header */}
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">ORGANIZER ACCREDITATION DESK</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-white/50">
              Verify host legal proofs, experience descriptions, and approve matching subscription plans.
            </p>
          </div>

          {kycApplications.filter(a => a.status === 'pending').length === 0 ? (

            /* --- PREMIUM EMPTY STATE --- */
            <div className="flex flex-col items-center justify-center p-12 text-center bg-white dark:bg-[#111827] border border-dashed rounded-2xl border-slate-300 dark:border-white/10">
              <div className="flex items-center justify-center w-16 h-16 mb-4 rounded-full bg-slate-50 dark:bg-white/5">
                <span className="material-symbols-outlined text-3xl text-slate-400">assignment</span>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Inbox Clear</h3>
              <p className="max-w-sm mt-2 text-sm text-slate-500 dark:text-white/40">
                There are no organizer KYC applications pending review at this time. New submissions will appear here.
              </p>
            </div>

          ) : (

            /* --- POPULATED REVIEW QUEUE --- */
            <div className="flex flex-col gap-4">
              {kycApplications.filter(a => a.status === 'pending').map((app) => (
                <div key={app.id} className="flex flex-col gap-4 p-5 transition-shadow bg-white dark:bg-[#111827] border border-slate-200 dark:border-outline-variant/20 rounded-xl shadow-sm hover:shadow-md sm:flex-row sm:items-start sm:justify-between">
                  
                  {/* Left Section: User Info */}
                  <div className="flex items-start gap-4">
                    <div className="flex items-center justify-center flex-shrink-0 w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/10">
                      <span className="material-symbols-outlined text-xl text-indigo-600 dark:text-indigo-400">person</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">{app.applicantName}</h3>
                        <span className="flex items-center px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-500/10 rounded-full gap-1">
                          <span className="material-symbols-outlined text-xs">schedule</span>
                          PENDING REVIEW
                        </span>
                      </div>
                      <span className="text-sm text-slate-500 dark:text-white/50">{app.email}</span>
                      {app.experience && (
                        <p className="text-xs text-slate-500 dark:text-white/40 mt-1">
                          <span className="font-semibold text-slate-700 dark:text-white/60">Experience:</span> {app.experience}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 dark:text-white/40">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">description</span>
                          App ID: {app.id}
                        </span>
                        {app.kycDoc && (
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">check_circle</span>
                            ID Proof Attached
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Section: Actions */}
                  <div className="flex flex-col items-stretch gap-3 pt-4 border-t sm:pt-0 sm:border-t-0 sm:flex-row sm:items-center sm:justify-end border-slate-100 dark:border-white/10">
                    <button
                      onClick={() => setSelectedKycApp(app)}
                      className="flex items-center justify-center w-full px-4 py-2.5 text-sm font-semibold transition-colors bg-white dark:bg-transparent border rounded-lg sm:w-auto text-slate-700 dark:text-white/70 border-slate-200 dark:border-outline-variant/20 hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      Review Details
                      <span className="material-symbols-outlined ml-1 text-sm text-slate-400">chevron_right</span>
                    </button>
                    <div className="flex w-full gap-2 sm:w-auto">
                      <button
                        onClick={() => setSelectedKycApp(app)}
                        className="flex items-center justify-center flex-1 px-4 py-2.5 text-sm font-semibold text-white transition-colors rounded-lg sm:flex-none bg-emerald-600 hover:bg-emerald-700"
                      >
                        <span className="material-symbols-outlined text-sm mr-1.5">check_circle</span>
                        Approve
                      </button>
                      <button
                        onClick={() => setSelectedKycApp(app)}
                        className="flex items-center justify-center flex-1 px-4 py-2.5 text-sm font-semibold text-red-700 dark:text-red-400 transition-colors bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg sm:flex-none hover:bg-red-100 dark:hover:bg-red-500/20"
                      >
                        <span className="material-symbols-outlined text-sm mr-1.5">cancel</span>
                        Reject
                      </button>
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}

          <ReviewKYCModal
            application={selectedKycApp}
            onClose={() => setSelectedKycApp(null)}
            onApprove={(notes) => handleKycReview('approved', notes)}
            onReject={(notes) => handleKycReview('rejected', notes)}
          />
        </div>
      )}

      {/* TAB 3: PLAN UPGRADES — Payment Verification for Subscriptions */}
      {activeTab === 'upgrades' && (
        <SubscriptionPaymentsTab triggerToast={triggerToast} />
      )}

      {/* TAB 4.5: TOURNAMENTS GOVERNANCE */}
      {activeTab === 'tournaments' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {activeTournament ? (
            <RegistrationManager
              tournament={activeTournament}
              registrations={registrationData}
              loading={registrationLoading}
              onBack={() => { setActiveTournament(null); setRegistrationData([]); }}
              onConfirm={handleConfirmRegistration}
              onReject={handleRejectRegistration}
              onDeleteTestData={handleOpenDeleteModal}
              onPruneOverflow={handlePruneOverflow}
            />
          ) : (
            <>
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
                            className="border-b border-slate-200 dark:border-white/5 hover:bg-slate-100/30 dark:hover:bg-white/[0.01] transition-colors cursor-pointer"
                            onClick={() => { setActiveTournament(t); setInjectTournamentId(t.id); fetchRegistrations(t.id); }}
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
                            <td className="p-3 sm:p-4 text-[11px] text-slate-700 dark:text-white/50">{t.slotsFilled ?? 0} / {t.slotsTotal}</td>
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
                                  onClick={(e) => { e.stopPropagation(); handleDeleteTournament(t.id); }}
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
            </>
          )}
        </div>
      )}

      {/* TAB 4: USER GOVERNANCE & ROSTER */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-in fade-in duration-300">

          <UserGovernance
            users={filteredUsers}
            userSearchQuery={userSearchQuery}
            onSearchChange={setUserSearchQuery}
            onNavigate={onNavigate}
            onToggleStatus={handleToggleUserStatus}
            onRevokeRole={handleRevokeOrganizerRole}
            onDelete={setDeleteUserId}
          />

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

    </AdminLayout>

    </>
  )
}

// Payment Verification Tab for Admin — used by Plan Upgrades module
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
                        <td className="p-3 text-on-surface-variant text-[10px]">{formatDate(p.created_at)}</td>
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
                            <span className="text-[10px] text-on-surface-variant">{p.reviewed_at ? formatDate(p.reviewed_at) : '—'}</span>
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
                                  <p className="flex justify-between"><span className="text-on-surface-variant">Submitted:</span><span className="text-on-surface">{formatDateTime(p.created_at)}</span></p>
                                  {p.reviewed_at && <p className="flex justify-between"><span className="text-on-surface-variant">Reviewed:</span><span className="text-on-surface">{formatDateTime(p.reviewed_at)}</span></p>}
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
      {/* Tournament-Specific Test Injection Data Cleanup Modal */}
      <BottomSheetModal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeletingTestData) {
            setIsDeleteModalOpen(false)
            setDeleteSummary(null)
            setDeleteError(null)
          }
        }}
        title="Delete Test Injection Data"
        icon="delete_sweep"
        maxWidth="max-w-lg"
        actions={
          <div className="flex items-center justify-end gap-3 w-full">
            <button
              type="button"
              onClick={() => {
                setIsDeleteModalOpen(false)
                setDeleteSummary(null)
                setDeleteError(null)
              }}
              disabled={isDeletingTestData}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteTestData}
              disabled={isDeletingTestData || summaryLoading || !deleteSummary || !deleteSummary.canDelete}
              className="px-5 py-2 min-h-[40px] bg-rose-600 text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-md shadow-rose-600/20 flex items-center gap-2"
            >
              {isDeletingTestData ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">delete_forever</span>
                  <span>Confirm Deletion</span>
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="space-y-4 text-xs">
          {/* Target Tournament Badge */}
          <div className="p-3.5 rounded-xl border border-outline-variant/40 bg-surface-container-low/60 space-y-1">
            <div className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">Target Tournament</div>
            <div className="font-bold text-sm text-on-background flex items-center justify-between gap-2">
              <span className="truncate">
                {deleteSummary?.tournamentTitle || tournamentsList.find(t => t.id === injectTournamentId.trim())?.title || 'Selected Tournament'}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container-high text-primary border border-primary/20 shrink-0">
                {injectTournamentId.trim()}
              </span>
            </div>
          </div>

          {/* Warning Banner */}
          <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">
              <span className="material-symbols-outlined text-base">warning</span>
              <span>Scoped Deletion Warning</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              This will permanently remove test-injected data belonging to the selected tournament. Real registrations and data belonging to other tournaments will not be deleted.
            </p>
          </div>

          {summaryLoading && (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
              <span className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <span className="text-[11px]">Auditing tournament records and dependencies...</span>
            </div>
          )}

          {deleteError && (
            <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[11px]">
              {deleteError}
            </div>
          )}

          {!summaryLoading && deleteSummary && (
            <div className="space-y-3">
              <div className="text-[10px] uppercase font-bold text-on-surface-variant/70 tracking-wider">
                Expected Deletion Impact
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Test Registrations</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {deleteSummary.provenTestRegistrations.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Test Teams</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {deleteSummary.testTeams.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Match Allocations</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {deleteSummary.matchAssignments.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Match Results</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {deleteSummary.matchResults.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-rose-500/20 bg-rose-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-rose-600 dark:text-rose-400">Qualifications</div>
                  <div className="text-lg font-bold text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {(deleteSummary.qualificationDecisions + deleteSummary.qualifiedTeams).toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Other Registrations Protected</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {deleteSummary.otherRegistrationsProtected.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Payment Submissions Preserved</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {deleteSummary.paymentSubmissions.toLocaleString()}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04]">
                  <div className="text-[9px] uppercase font-bold text-emerald-600 dark:text-emerald-400">Prize Payments Preserved</div>
                  <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-0.5">
                    {deleteSummary.prizePayments.toLocaleString()}
                  </div>
                </div>
              </div>

              {deleteSummary.blockedByPaymentRecords && (
                <div className="p-2.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300 text-[10px]">
                  Cleanup is blocked because payment records are linked to the test-marked data. Payment evidence will be preserved; resolve those records manually before retrying.
                </div>
              )}

              {deleteSummary.ambiguousRegistrations > 0 && (
                <div className="p-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[10px] flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-sm shrink-0 mt-0.5">verified_user</span>
                  <span>
                    <strong>{deleteSummary.ambiguousRegistrations}</strong> registration(s) have test-like team names but lack reliable test provenance. They are protected and will remain untouched.
                  </span>
                </div>
              )}

              {!deleteSummary.canDelete && !deleteSummary.blockedByPaymentRecords && (
                <div className="p-3 rounded-xl border border-outline-variant/40 bg-surface-container-low text-center text-on-surface-variant text-[11px]">
                  No test-injected data with reliable provenance was found. Unmarked or ambiguous records will remain untouched.
                </div>
              )}
            </div>
          )}
        </div>
      </BottomSheetModal>

    </div>
  );
}

// ── Registration Verification Dashboard Component ────────────
function RegistrationManager({
  tournament,
  registrations: propRegistrations,
  loading,
  onBack,
  onConfirm,
  onReject,
  onDeleteTestData,
  onPruneOverflow
}) {
  const [selectedProof, setSelectedProof] = useState(null);

  const registrations = propRegistrations || [];

  const entryFee = parseInt(tournament.entry_fee_amount) || 0;
  const confirmedCount = registrations.filter(r => r.status === 'confirmed' || r.status === 'approved' || r.status === 'VERIFIED_BY_HOST').length;
  const pendingCount = registrations.filter(r => r.status === 'pending' || r.status === 'pending_payment' || r.status === 'PENDING_PAYMENT_VERIFICATION').length;
  const rejectedCount = registrations.filter(r => r.status === 'rejected' || r.status === 'PAYMENT_REJECTED').length;
  const slotsTotal = parseInt(tournament.slotsTotal || tournament.max_slots || tournament.slots) || 128;
  const progressPct = slotsTotal > 0 ? Math.round((confirmedCount / slotsTotal) * 100) : 0;
  const isOverflow = registrations.length > slotsTotal;
  const overflowCount = Math.max(0, registrations.length - slotsTotal);

  // Parse team members — supports both `teamMembers` array (mock) and `members` JSON string (server)
  const getTeamMembers = (reg) => {
    if (reg.teamMembers) return reg.teamMembers;
    if (reg.members) {
      try {
        const parsed = typeof reg.members === 'string' ? JSON.parse(reg.members) : reg.members;
        return Array.isArray(parsed) ? parsed : [];
      } catch { return []; }
    }
    return [];
  };

  const getStatusBadgeClass = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'confirmed' || s === 'approved' || s === 'verified_by_host') {
      return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20';
    }
    if (s === 'rejected' || s === 'payment_rejected') {
      return 'bg-rose-500/10 text-rose-500 border border-rose-500/20';
    }
    return 'bg-amber-500/10 text-amber-500 border border-amber-500/20';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Breadcrumb has been hoisted to AdminLayout for a clean single top-level header breadcrumb */}

      {/* Header Info Card */}
      <div className="glass-card border border-outline-variant/30 rounded-2xl bg-surface-container-low/40 p-5 backdrop-blur-md text-slate-900 dark:text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold uppercase tracking-tight">
              {tournament.title || 'Untitled Tournament'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-white/40 mt-0.5">
              Game: <span className="font-semibold uppercase text-slate-850 dark:text-white/80">{tournament.game || 'N/A'}</span>
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-slate-500 dark:text-white/40 block">Slots Filled</span>
            <span className="text-sm font-bold">
              {confirmedCount} / {slotsTotal} Slots Confirmed
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4">
          <div className="w-full bg-slate-200 dark:bg-white/5 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-2 text-[10px] text-slate-500 dark:text-white/40">
            <span>Pending: {pendingCount} · Rejected: {rejectedCount}</span>
            <span>{progressPct}% filled</span>
          </div>
        </div>
      </div>

      {/* Registration Overflow Banner */}
      {isOverflow && (
        <div className="p-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-700 dark:text-rose-300">
          <div className="flex items-start gap-2.5">
            <span className="material-symbols-outlined text-rose-500 text-xl shrink-0 mt-0.5">warning</span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider">Registration Slot Overflow Detected</div>
              <p className="text-[11px] text-rose-600/90 dark:text-rose-300/80 mt-0.5">
                Tournament has <strong>{slotsTotal}</strong> slots, but <strong>{registrations.length}</strong> registrations exist ({overflowCount} excess records). Total registrations should not exceed slot capacity.
              </p>
            </div>
          </div>
          {onPruneOverflow && (
            <button
              type="button"
              onClick={() => onPruneOverflow(tournament.id)}
              className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">content_cut</span>
              <span>Prune to {slotsTotal} Slots</span>
            </button>
          )}
        </div>
      )}

      {/* Verification Table */}
      <div className="glass-card border border-outline-variant/30 rounded-2xl bg-surface-container-low/40 overflow-hidden backdrop-blur-md">
        <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between">
          <h4 className="text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-emerald-500">verified</span>
            Registrations Verification
          </h4>
          <div className="flex items-center gap-2">
            {onPruneOverflow && isOverflow && (
              <button
                type="button"
                onClick={() => onPruneOverflow(tournament.id)}
                className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                title={`Prune ${overflowCount} excess registrations down to ${slotsTotal}`}
              >
                <span className="material-symbols-outlined text-xs">content_cut</span>
                <span>Prune Overflow ({overflowCount})</span>
              </button>
            )}
            {onDeleteTestData && registrations.length > 0 && (
              <button
                type="button"
                onClick={() => onDeleteTestData(tournament.id)}
                className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg transition-colors flex items-center gap-1"
                title="Delete test-injected dummy registrations for this tournament"
              >
                <span className="material-symbols-outlined text-xs">delete_sweep</span>
                <span>Clear Test Data</span>
              </button>
            )}
            <span className={`text-[10px] border px-2 py-0.5 rounded font-bold uppercase ${isOverflow ? 'bg-rose-500/10 text-rose-500 border-rose-500/30' : 'bg-primary/10 text-primary border-primary/20'}`}>
              Total: {registrations.length} {isOverflow && `(Max: ${slotsTotal})`}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <svg className="w-5 h-5 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="ml-2 text-xs text-slate-600 dark:text-white/50">Loading registrations...</span>
          </div>
        ) : registrations.length === 0 ? (
          <div className="text-center py-10 text-slate-600 dark:text-white/40 text-xs">
            No registrations found for this tournament.
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full border-collapse text-left text-xs leading-normal">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-container-highest/50 text-slate-700 dark:text-white/55 font-bold">
                  <th className="p-3 uppercase font-bold tracking-wider text-[10px]">Player / Team</th>
                  <th className="p-3 uppercase font-bold tracking-wider text-[10px]">Contact Info</th>
                  <th className="p-3 uppercase font-bold tracking-wider text-[10px]">Payment Details</th>
                  <th className="p-3 uppercase font-bold tracking-wider text-[10px]">Status</th>
                  <th className="p-3 uppercase font-bold tracking-wider text-[10px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {registrations.map((reg) => {
                  const isPending = reg.status === 'pending' || reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION';
                  const teamMembers = getTeamMembers(reg);
                   const amountDisplay = reg.amount || (entryFee > 0 ? `₹${entryFee.toLocaleString('en-IN')}` : 'Free');
                   const proofUrl = reg.proofImg || reg.screenshot_url;
                  return (
                    <tr key={reg.id} className="hover:bg-slate-100/30 dark:hover:bg-white/[0.01] transition-colors">
                      {/* Player / Team Column — teamName + full member roster */}
                      <td className="p-3 min-w-[200px] align-top">
                        <p className="font-bold text-slate-900 dark:text-white text-[12px] leading-tight mb-1">
                          {reg.team_name || reg.teamName || '—'}
                        </p>
                        <ul className="mt-1.5 space-y-0.5 text-[11px] text-slate-500 dark:text-white/40">
                          {/* Render Captain first */}
                          {(() => {
                            const captainName = reg.captain || (teamMembers[0] && teamMembers[0].name) || (teamMembers[0] && teamMembers[0].ign) || '—';
                            const captainUid = reg.captain_uid || (teamMembers[0] && teamMembers[0].inGameId) || (teamMembers[0] && teamMembers[0].uid) || '—';
                            return (
                              <li className="leading-tight font-semibold text-slate-800 dark:text-white/80 flex items-center gap-1">
                                <span>{captainName} (UID: {captainUid})</span>
                                <span className="text-[8px] bg-amber-500/10 text-amber-500 font-bold uppercase tracking-wider px-1 py-0.2 rounded border border-amber-500/20">Captain</span>
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
                              <li key={idx} className="leading-tight pl-4 text-slate-500 dark:text-white/40">
                                • {m.name || m.ign || '—'} (UID: {m.inGameId || m.uid || '—'})
                              </li>
                            ));
                          })()}
                        </ul>
                      </td>

                      {/* Contact Info Column — email, whatsapp with distinct SVG icons and labels */}
                      <td className="p-3 min-w-[210px] align-top">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-white/30 w-[68px] shrink-0 whitespace-nowrap">Email</span>
                          <span className="text-[11px] text-slate-800 dark:text-white/80 truncate select-all">{reg.email || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-green-600 dark:text-green-400 w-[68px] shrink-0 whitespace-nowrap font-semibold">WhatsApp</span>
                          <span className="text-[11px] text-slate-800 dark:text-white/80 select-all">{reg.phone || '—'}</span>
                        </div>
                      </td>

                      {/* Payment Details Column — amount, UTR, View Screenshot */}
                      <td className="p-3 min-w-[210px] align-top">
                        <div className="flex items-center gap-2">
                          <svg className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-white/30 w-[68px] shrink-0 whitespace-nowrap">Amount</span>
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 select-all">
                            {amountDisplay}
                          </span>
                        </div>
                        {reg.transaction_id && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400 dark:text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-white/30 w-[68px] shrink-0 whitespace-nowrap">UTR</span>
                            <span className="text-[10px] font-mono text-slate-800 dark:text-white/80 select-all">{reg.transaction_id}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <svg className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-450" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                          <span className="text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-450 w-[68px] shrink-0 whitespace-nowrap font-semibold">Proof</span>
                          <button
                            onClick={() => setSelectedProof(proofUrl)}
                            className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline w-max block"
                          >
                            View Screenshot
                          </button>
                        </div>
                      </td>

                      <td className="p-3 align-top">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getStatusBadgeClass(reg.status)}`}>
                          {reg.status === 'pending_payment' ? 'Pending Payment' : reg.status}
                        </span>
                      </td>
                      <td className="p-3 text-right align-top">
                        {(() => {
                          const statusLower = (reg.status || '').toLowerCase();
                          const isPendingStatus = statusLower === 'pending' || statusLower === 'pending_payment' || statusLower === 'pending_payment_verification';
                          const isConfirmedStatus = statusLower === 'confirmed' || statusLower === 'approved' || statusLower === 'verified_by_host';
                          
                          if (isPendingStatus) {
                            return (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => onConfirm(reg.id)}
                                  className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-[12px]">check</span>
                                  Approve
                                </button>
                                <button
                                  onClick={() => onReject(reg.id)}
                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-[12px]">close</span>
                                  Reject
                                </button>
                              </div>
                            );
                          }
                          
                          if (isConfirmedStatus) {
                            return (
                              <div className="flex items-center justify-end">
                                <button
                                  onClick={() => onReject(reg.id)}
                                  className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold transition-all flex items-center gap-1 shadow-sm"
                                >
                                  <span className="material-symbols-outlined text-[12px]">close</span>
                                  Reject
                                </button>
                              </div>
                            );
                          }
                          
                          return (
                            <span className="text-[10px] text-slate-400 dark:text-white/30 italic">Handled</span>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Screenshot Modal */}
      {selectedProof && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedProof(null)}>
          <div className="relative bg-white dark:bg-surface-container-low rounded-xl shadow-xl max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-outline-variant/30">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Payment Screenshot</h3>
              <button onClick={() => setSelectedProof(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-black/20 flex justify-center">
              <img
                src={selectedProof}
                alt="Payment Proof"
                className="max-h-[60vh] object-contain rounded border border-outline-variant/30 shadow-sm"
              />
            </div>
            <div className="p-4 border-t border-outline-variant/30 flex justify-end">
              <button
                onClick={() => setSelectedProof(null)}
                className="px-4 py-2 text-xs font-bold text-slate-700 dark:text-white bg-slate-100 dark:bg-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-white/20 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
