import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAuthToken } from '../utils/getAuthToken'
import { formatDateTime } from '../utils/timeFormat'
import PaymentReviewQueue from '../components/admin/PaymentReviewQueue.jsx'

export default function TournamentRegistrations() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState('squads') // 'squads' | 'payments'
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [filterTab, setFilterTab] = useState('all') // 'all' | 'incomplete' | 'complete' | 'pending'
  const [waivingTeamId, setWaivingTeamId] = useState(null)

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  const fetchRegistrations = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${id}/registrations`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 401) {
        navigate(`/login?redirect=/tournaments/${id}/registrations`, { replace: true })
        return
      }
      if (res.status === 403) {
        navigate(`/tournaments/${id}`, { replace: true })
        return
      }
      const data = await res.json()
      if (data.success) {
        setRegistrations(data.registrations || [])
      } else {
        triggerToast(data.message || data.error || 'Failed to load registrations.')
      }
    } catch {
      triggerToast('Error fetching registrations.')
    } finally {
      setLoading(false)
    }
  }, [id, navigate])

  useEffect(() => {
    fetchRegistrations()
  }, [fetchRegistrations])

  const handleWaiveSquad = async (teamId) => {
    if (!teamId) {
      triggerToast('No active team record for this registration yet.')
      return
    }
    const reason = window.prompt("Reason for waiving squad requirement (e.g. Organizer exemption):", "Organizer exemption")
    if (reason === null) return

    setWaivingTeamId(teamId)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${id}/teams/${teamId}/waive`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error)
      triggerToast('Squad requirement waived successfully.')
      await fetchRegistrations()
    } catch (err) {
      triggerToast('Failed to waive squad: ' + err.message)
    } finally {
      setWaivingTeamId(null)
    }
  }

  const handleUnwaiveSquad = async (teamId) => {
    if (!teamId) return
    if (!window.confirm("Reinstate the squad requirement? Credentials will lock until all slots are filled.")) return

    setWaivingTeamId(teamId)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${id}/teams/${teamId}/unwaive`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error)
      triggerToast('Squad requirement reinstated.')
      await fetchRegistrations()
    } catch (err) {
      triggerToast('Failed to reinstate squad requirement: ' + err.message)
    } finally {
      setWaivingTeamId(null)
    }
  }

  const parseMembers = (members) => {
    if (!members) return []
    if (Array.isArray(members)) return members
    try {
      const parsed = typeof members === 'string' ? JSON.parse(members) : members
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  const statusBadge = (status) => {
    switch (status) {
      case 'approved':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-green-500/10 text-green-500">Approved</span>
      case 'confirmed':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-emerald-500/10 text-emerald-400">Confirmed</span>
      case 'pending':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-yellow-500/10 text-yellow-500">Pending Verification</span>
      case 'pending_payment':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-amber-500/10 text-amber-400">Pending Payment</span>
      case 'rejected':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-red-500/10 text-red-500">Rejected</span>
      case 'waitlisted':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-blue-500/10 text-blue-500">Waitlisted</span>
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-red-500/10 text-red-400">Cancelled</span>
      case 'expired':
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-surface-variant/50 text-on-surface-variant">Expired</span>
      default:
        return <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-surface-container-highest text-on-surface-variant">{(status || 'unknown').toUpperCase()}</span>
    }
  }

  const squadBadge = (reg) => {
    if (reg.squad_waived) {
      return (
        <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-purple-500/15 text-purple-400 border border-purple-500/30">
          Waived
        </span>
      )
    }
    if (reg.is_squad_complete) {
      return (
        <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          Fully Registered
        </span>
      )
    }
    if (reg.stage === 'slot_secured_squad_incomplete' || reg.status === 'approved' || reg.status === 'confirmed') {
      const joined = reg.squad_joined != null ? reg.squad_joined : '1'
      const req = reg.squad_required != null ? reg.squad_required : '4'
      return (
        <span className="px-2 py-0.5 rounded font-label-caps text-[9px] font-bold tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
          Squad {joined}/{req}
        </span>
      )
    }
    return null
  }

  // Filter calculations
  const incompleteCount = registrations.filter(
    (r) => (r.status === 'approved' || r.status === 'confirmed') && !r.is_squad_complete
  ).length
  const completeCount = registrations.filter((r) => r.is_squad_complete).length
  const pendingCount = registrations.filter((r) => r.status === 'pending' || r.status === 'pending_payment').length

  const filteredRegistrations = registrations.filter((reg) => {
    if (filterTab === 'incomplete') {
      return (reg.status === 'approved' || reg.status === 'confirmed') && !reg.is_squad_complete
    }
    if (filterTab === 'complete') {
      return reg.is_squad_complete
    }
    if (filterTab === 'pending') {
      return reg.status === 'pending' || reg.status === 'pending_payment'
    }
    return true
  })

  return (
    <div className="min-h-screen bg-background">
      {showToast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl bg-surface border border-outline-variant/40 shadow-lg backdrop-blur-md text-xs font-medium text-on-background animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-surface border border-outline-variant/30 hover:bg-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-lg">arrow_back</span>
            </button>
            <div>
              <h1 className="font-headline-lg text-lg sm:text-xl font-black text-on-background">Squad Registrations</h1>
              <p className="font-body-sm text-[11px] text-on-surface-variant">Event ID: <span className="font-mono text-secondary">{id}</span></p>
            </div>
          </div>
          <button
            onClick={() => navigate('/org-management')}
            className="px-4 min-h-[44px] bg-primary text-white rounded-xl font-headline-md text-xs font-bold shadow-lg hover:bg-primary/95 transition-all flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-sm">dashboard</span>
            Dashboard
          </button>
        </div>

        {/* View Mode Toggle: Squads vs Manual Payment Review */}
        <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-3">
          <button
            type="button"
            onClick={() => setViewMode('squads')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'squads'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface border border-outline-variant/25 text-on-surface-variant hover:text-on-background'
            }`}
          >
            <span className="material-symbols-outlined text-sm">groups</span>
            Squad Rosters
          </button>
          <button
            type="button"
            onClick={() => setViewMode('payments')}
            className={`rounded-full px-4 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
              viewMode === 'payments'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-surface border border-outline-variant/25 text-on-surface-variant hover:text-on-background'
            }`}
          >
            <span className="material-symbols-outlined text-sm">verified</span>
            Manual Payment Review
          </button>
        </div>

        {viewMode === 'payments' ? (
          <PaymentReviewQueue tournamentId={id} role="organizer" />
        ) : (
          <>
            {/* Filter Tabs & Stats Bar (Part B9) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setFilterTab('all')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    filterTab === 'all'
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-surface border border-outline-variant/20 text-on-surface-variant hover:text-on-background'
                  }`}
                >
                  All ({registrations.length})
                </button>
            <button
              onClick={() => setFilterTab('incomplete')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterTab === 'incomplete'
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
              }`}
            >
              Incomplete Squads ({incompleteCount})
            </button>
            <button
              onClick={() => setFilterTab('complete')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterTab === 'complete'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            >
              Fully Registered ({completeCount})
            </button>
            <button
              onClick={() => setFilterTab('pending')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterTab === 'pending'
                  ? 'bg-yellow-500 text-black shadow-md'
                  : 'bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 hover:bg-yellow-500/20'
              }`}
            >
              Pending ({pendingCount})
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span>Showing: <strong className="text-on-background">{filteredRegistrations.length}</strong></span>
          </div>
        </div>

        {/* Accordion List */}
        <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/50 backdrop-blur-md shadow-sm">
          {loading ? (
            <div className="space-y-3 py-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 bg-surface-variant/30 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary mb-3">
                <span className="material-symbols-outlined text-2xl">groups</span>
              </div>
              <p className="text-sm font-medium text-on-surface-variant">
                {filterTab === 'incomplete'
                  ? 'No incomplete squads found! All approved squads are fully registered.'
                  : 'No registrations found for this filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1.2fr_1fr_1.2fr_1fr_90px] gap-4 px-4 py-2 font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                <span>Team Name</span>
                <span>Leader IGN</span>
                <span>Status & Stage</span>
                <span>Registered</span>
                <span className="text-right">Details</span>
              </div>

              {filteredRegistrations.map((reg) => {
                const isExpanded = expandedRow === reg.id
                const players = parseMembers(reg.members)
                const sBadge = squadBadge(reg)
                return (
                  <div key={reg.id}>
                    {/* Main row */}
                    <div
                      onClick={() => setExpandedRow(isExpanded ? null : reg.id)}
                      className={`grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_1.2fr_1fr_90px] gap-2 sm:gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${
                        isExpanded
                          ? 'bg-primary/5 rounded-b-none border border-primary/20'
                          : 'bg-surface-variant/10 hover:bg-surface-variant/30 border border-transparent'
                      }`}
                    >
                      {/* Team Name */}
                      <div className="flex items-center gap-2 sm:gap-0">
                        <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-on-surface-variant w-20 shrink-0">Team</span>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`material-symbols-outlined text-sm transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                            chevron_right
                          </span>
                          <span className="text-xs font-semibold text-on-background truncate">{reg.team_name || '—'}</span>
                        </div>
                      </div>

                      {/* Leader IGN */}
                      <div className="flex items-center gap-2 sm:gap-0">
                        <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-on-surface-variant w-20 shrink-0">Leader</span>
                        <span className="text-xs text-on-surface-variant truncate">{reg.captain || '—'}</span>
                      </div>

                      {/* Status & Squad Stage badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-on-surface-variant w-20 shrink-0">Status</span>
                        {statusBadge(reg.status)}
                        {sBadge}
                      </div>

                      {/* Date */}
                      <div className="flex items-center gap-2 sm:gap-0">
                        <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-on-surface-variant w-20 shrink-0">Date</span>
                        <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{formatDateTime(reg.created_at)}</span>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-end">
                        <span className="text-[10px] text-on-surface-variant italic">
                          {players.length > 0 ? `${players.length + 1} slots` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="bg-surface-variant/30 p-4 sm:p-5 rounded-b-lg border-x border-b border-outline-variant/30 space-y-4">
                        {/* Squad Stage Alert & Organizer Waive Controls (B7, B9) */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl border gap-3 bg-surface/50 border-outline-variant/20">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-on-background uppercase tracking-wide">Squad Stage:</span>
                              {sBadge}
                            </div>
                            <p className="text-[11px] text-on-surface-variant">
                              {reg.squad_waived
                                ? `Waived on ${formatDateTime(reg.squad_waived_at)}${reg.squad_waived_reason ? ` — "${reg.squad_waived_reason}"` : ''}`
                                : reg.is_squad_complete
                                ? 'All required roster slots have been linked to registered accounts.'
                                : `Squad has ${reg.squad_joined || 1} of ${reg.squad_required || 4} slots linked. Room credentials will remain locked until all slots are filled or waived.`}
                            </p>
                          </div>

                          {/* Organizer Waive / Unwaive Buttons */}
                          {reg.team_id && (
                            <div className="shrink-0 flex items-center gap-2">
                              {reg.squad_waived ? (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleUnwaiveSquad(reg.team_id); }}
                                  disabled={waivingTeamId === reg.team_id}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors"
                                >
                                  {waivingTeamId === reg.team_id ? 'Updating...' : 'Reinstate Squad Gate'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); handleWaiveSquad(reg.team_id); }}
                                  disabled={waivingTeamId === reg.team_id}
                                  className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-colors"
                                >
                                  {waivingTeamId === reg.team_id ? 'Waiving...' : 'Waive Squad Requirement'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {reg.transaction_id && (
                          <div className="flex items-center gap-4 flex-wrap text-[10px] text-on-surface-variant bg-surface/40 rounded-lg px-3 py-2">
                            <span>UTR: <strong className="font-mono text-on-background">{reg.transaction_id}</strong></span>
                            {reg.payment_app && <span>App: <strong className="text-on-background">{reg.payment_app}</strong></span>}
                          </div>
                        )}

                        {/* Roster list */}
                        <div className="space-y-2">
                          <h4 className="font-headline-md text-[11px] font-bold text-on-background uppercase tracking-wider">
                            Roster Slots ({players.length + 1})
                          </h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* Captain / Slot 0 */}
                            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface/60 border border-amber-500/20">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                                1
                              </div>
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-on-background truncate">{reg.captain || 'Leader'}</span>
                                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400">
                                    Captain (Slot 0)
                                  </span>
                                </div>
                                <p className="text-[10px] font-mono text-on-surface-variant truncate">User ID: {reg.user_id}</p>
                              </div>
                            </div>

                            {/* Teammates */}
                            {players.map((player, pi) => (
                              <div
                                key={pi}
                                className="flex items-center gap-3 p-3 rounded-xl bg-surface/60 border border-outline-variant/20"
                              >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                                  {pi + 2}
                                </div>
                                <div className="flex-1 min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-on-background truncate">{player.ign || `Player ${pi + 2}`}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                                      Slot {pi + 1}
                                    </span>
                                  </div>
                                  <p className="text-[10px] font-mono text-on-surface-variant truncate">IGN: {player.ign || '—'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </>
        )}
      </div>
    </div>
  )
}
