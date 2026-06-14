import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAuthToken } from '../utils/getAuthToken'

export default function TournamentRegistrations() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedRow, setExpandedRow] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  useEffect(() => {
    if (!id) return
    const fetchRegistrations = async () => {
      setLoading(true)
      try {
        const token = await getAuthToken()
        const res = await fetch(`/api/tournaments/${id}/registrations`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) {
          setRegistrations(data.registrations || [])
        } else {
          triggerToast('Failed to load registrations.')
        }
      } catch {
        triggerToast('Error fetching registrations.')
      } finally {
        setLoading(false)
      }
    }
    fetchRegistrations()
  }, [id])

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

  const formatDate = (dateStr) => {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
      })
    } catch {
      return dateStr
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

        {/* Stats bar */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="px-3.5 py-2 rounded-xl bg-surface border border-outline-variant/20 text-xs">
            <span className="text-on-surface-variant">Teams: </span>
            <span className="font-bold text-on-background">{registrations.length}</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-xs">
            <span className="text-green-400">Approved: </span>
            <span className="font-bold text-green-300">{registrations.filter(r => r.status === 'approved').length}</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-xs">
            <span className="text-yellow-400">Pending: </span>
            <span className="font-bold text-yellow-300">{registrations.filter(r => r.status === 'pending').length}</span>
          </div>
          <div className="px-3.5 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
            <span className="text-blue-400">Total Players: </span>
            <span className="font-bold text-blue-300">{registrations.length * 4}</span>
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
          ) : registrations.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary mb-3">
                <span className="material-symbols-outlined text-2xl">groups</span>
              </div>
              <p className="text-sm font-medium text-on-surface-variant">No squads registered for this tournament yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Table header — hidden on very small screens */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_1fr_1fr_100px] gap-4 px-4 py-2 font-label-caps text-[9px] font-bold uppercase tracking-wider text-on-surface-variant">
                <span>Team Name</span>
                <span>Leader IGN</span>
                <span>Status</span>
                <span>Registered</span>
                <span className="text-right">Details</span>
              </div>

              {registrations.map((reg) => {
                const isExpanded = expandedRow === reg.id
                const players = parseMembers(reg.members)
                return (
                  <div key={reg.id}>
                    {/* Main row */}
                    <div
                      onClick={() => setExpandedRow(isExpanded ? null : reg.id)}
                      className={`grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_100px] gap-2 sm:gap-4 px-4 py-3 rounded-xl cursor-pointer transition-all ${
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

                      {/* Status badge */}
                      <div className="flex items-center gap-2 sm:gap-0">
                        <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-on-surface-variant w-20 shrink-0">Status</span>
                        {statusBadge(reg.status)}
                      </div>

                      {/* Date */}
                      <div className="flex items-center gap-2 sm:gap-0">
                        <span className="sm:hidden text-[9px] font-bold uppercase tracking-wider text-on-surface-variant w-20 shrink-0">Date</span>
                        <span className="text-[10px] text-on-surface-variant whitespace-nowrap">{formatDate(reg.created_at)}</span>
                      </div>

                      {/* Actions — informational only */}
                      <div className="flex items-center justify-end">
                        <span className="text-[10px] text-on-surface-variant italic">
                          {players.length > 0 ? `${players.length} players` : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Expanded panel */}
                    {isExpanded && (
                      <div className="bg-surface-variant/30 p-4 sm:p-5 rounded-b-lg border-x border-b border-outline-variant/30 space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <h4 className="font-headline-md text-[11px] font-bold text-on-background uppercase tracking-wider">Squad Roster</h4>
                            {statusBadge(reg.status)}
                          </div>
                          <span className="text-[10px] text-on-surface-variant font-mono">{reg.user_id || ''}</span>
                        </div>
                        {reg.transaction_id && (
                          <div className="flex items-center gap-4 flex-wrap text-[10px] text-on-surface-variant bg-surface/40 rounded-lg px-3 py-2">
                            <span>UTR: <strong className="font-mono text-on-background">{reg.transaction_id}</strong></span>
                            {reg.payment_app && <span>App: <strong className="text-on-background">{reg.payment_app}</strong></span>}
                          </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {players.length > 0 ? players.map((player, pi) => (
                            <div
                              key={pi}
                              className="flex items-center gap-3 p-3 rounded-xl bg-surface/60 border border-outline-variant/20"
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                player.role === 'Leader'
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                                  : 'bg-primary/10 text-primary border border-primary/20'
                              }`}>
                                {pi + 1}
                              </div>
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-on-background truncate">{player.ign || '—'}</span>
                                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                                    player.role === 'Leader'
                                      ? 'bg-amber-500/15 text-amber-400'
                                      : 'bg-primary/10 text-primary'
                                  }`}>
                                    {player.role || 'Member'}
                                  </span>
                                </div>
                                <p className="text-[10px] font-mono text-on-surface-variant truncate">ID: {player.in_game_id || '—'}</p>
                              </div>
                            </div>
                          )) : (
                            <div className="col-span-full text-center py-6 text-xs text-on-surface-variant">
                              No player data available for this squad.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
