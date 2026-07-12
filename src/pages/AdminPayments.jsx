import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuthToken } from '../utils/getAuthToken'

export default function AdminPayments() {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedGame, setExpandedGame] = useState(null)
  const [expandedTournament, setExpandedTournament] = useState(null)
  const [screenshotModal, setScreenshotModal] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [bulkApproving, setBulkApproving] = useState(false)
  const [verifiedCount, setVerifiedCount] = useState(0)
  const [tab, setTab] = useState('pending')

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  const fetchPending = async () => {
    setLoading(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/pending-registrations', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setRegistrations(data.registrations || [])
      else triggerToast('Failed to load pending registrations.')
    } catch {
      triggerToast('Error fetching registrations.')
    } finally {
      setLoading(false)
    }
  }

  const fetchVerifiedCount = async () => {
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/verifier/pending-payments', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        const verified = (data.registrations || []).filter(r => r.status === 'VERIFIED_BY_HOST' || r.status === 'verified_by_host' || r.status === 'confirmed')
        setVerifiedCount(verified.length)
      }
    } catch {}
  }

  const handleBulkApproveAll = async () => {
    setBulkApproving(true)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/bulk-approve-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(data.message || `Approved ${data.approvedCount} registrations.`)
        setVerifiedCount(0)
        fetchPending()
      } else {
        triggerToast(data.error || 'Bulk approval failed.')
      }
    } catch {
      triggerToast('Error during bulk approval.')
    } finally {
      setBulkApproving(false)
    }
  }

  useEffect(() => { fetchPending(); fetchVerifiedCount() }, [])

  const pendingRegs = registrations.filter(r => r.status === 'pending' || r.status === 'pending_payment' || r.status === 'PENDING_PAYMENT_VERIFICATION')
  const verifiedRegs = registrations.filter(r => r.status === 'confirmed' || r.status === 'VERIFIED_BY_HOST' || r.status === 'verified_by_host' || r.pay_status === 'verified_by_host')

  const groupedByGame = (tab === 'pending' ? pendingRegs : verifiedRegs).reduce((acc, reg) => {
    const game = reg.tournament_game || 'Unknown Game'
    if (!acc[game]) acc[game] = []
    acc[game].push(reg)
    return acc
  }, {})

  const groupedByTournament = (gameRegs) => {
    return gameRegs.reduce((acc, reg) => {
      const title = reg.tournament_title || reg.tournament_id || 'Unknown Tournament'
      if (!acc[title]) acc[title] = []
      acc[title].push(reg)
      return acc
    }, {})
  }

  const handleApprove = async (regId, currentStatus) => {
    setActionLoading(regId)
    try {
      const token = await getAuthToken()
      const reg = registrations.find(r => r.id === regId)
      const isPaid = currentStatus === 'pending_payment' || currentStatus === 'PENDING_PAYMENT_VERIFICATION'
      const newStatus = isPaid ? 'confirmed' : 'approved'
      const res = await fetch(`/api/tournaments/${reg.tournament_id}/registrations/${regId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`Registration ${isPaid ? 'confirmed' : 'approved'}.`)
        setRegistrations((prev) => prev.filter((r) => r.id !== regId))
      } else {
        triggerToast(data.message || 'Failed to approve.')
      }
    } catch {
      triggerToast('Error approving registration.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReject = async (regId) => {
    setRejectModal(regId)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      triggerToast('Rejection reason is required.')
      return
    }
    const regId = rejectModal
    setRejectModal(null)
    setActionLoading(regId)
    try {
      const token = await getAuthToken()
      const reg = registrations.find(r => r.id === regId)
      const res = await fetch(`/api/tournaments/${reg.tournament_id}/registrations/${regId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'PAYMENT_REJECTED', rejection_reason: rejectReason.trim() })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast('Registration rejected.')
        setRegistrations((prev) => prev.filter((r) => r.id !== regId))
      } else {
        triggerToast(data.message || 'Failed to reject.')
      }
    } catch {
      triggerToast('Error rejecting registration.')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {showToast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl bg-surface border border-outline-variant/40 shadow-lg backdrop-blur-md text-xs font-medium text-on-background animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      <AnimatePresence>
        {screenshotModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setScreenshotModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="max-w-lg w-full bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between">
                <span className="text-xs font-medium text-on-surface-variant">Payment Screenshot</span>
                <button onClick={() => setScreenshotModal(null)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-variant/30 hover:bg-surface-variant transition-colors">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              <img src={screenshotModal} alt="Payment screenshot" className="w-full object-contain max-h-[70vh]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rejectModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setRejectModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-outline-variant/20">
                <h3 className="text-sm font-bold text-on-background">Reject Registration</h3>
                <p className="text-[11px] text-on-surface-variant mt-1">Provide a reason for rejection. The user will be notified.</p>
              </div>
              <div className="p-4">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  className="w-full min-h-[100px] px-3 py-3 rounded-xl border-2 text-[14px] outline-none transition-all bg-surface text-on-background placeholder:text-on-surface-variant/40 border-outline-variant/40 hover:border-outline-variant/60 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 resize-none"
                  autoFocus
                />
              </div>
              <div className="p-4 pt-0 flex items-center gap-2 justify-end">
                <button onClick={() => setRejectModal(null)}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-semibold bg-surface-variant/60 hover:bg-surface-variant text-on-background border border-outline-variant/30 transition-colors">
                  Cancel
                </button>
                <button onClick={confirmReject}
                  disabled={!rejectReason.trim()}
                  className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                  Reject Registration
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-6xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-headline-lg text-lg sm:text-xl font-black text-on-background">Payment Verification</h1>
            <p className="font-body-sm text-[11px] text-on-surface-variant">Review pending payments and auto-verified registrations</p>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'pending' && verifiedCount > 0 && (
              <button
                onClick={handleBulkApproveAll}
                disabled={bulkApproving}
                className="px-4 min-h-[44px] bg-emerald-500/15 hover:bg-emerald-500 border border-emerald-500/30 hover:border-emerald-500 text-emerald-400 hover:text-white rounded-xl font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
              >
                {bulkApproving ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-emerald-400/40 border-t-emerald-400 animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-sm">select_all</span>
                )}
                Approve All ({verifiedCount})
              </button>
            )}
            <button
              onClick={fetchPending}
              disabled={loading}
              className="px-4 min-h-[44px] bg-surface border border-outline-variant/30 hover:bg-surface-variant text-on-background rounded-xl font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-sm">refresh</span> Refresh
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 bg-surface-variant/20 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'pending' ? 'bg-primary text-white shadow-sm' : 'text-on-surface-variant hover:text-on-background'}`}
          >
            Pending ({pendingRegs.length})
          </button>
          <button
            onClick={() => setTab('verified')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'verified' ? 'bg-emerald-500 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-background'}`}
          >
            Verified ({verifiedRegs.length})
          </button>
        </div>

        <div className="glass-card p-4 sm:p-6 rounded-2xl border border-outline-variant/30 bg-surface/50 backdrop-blur-md shadow-sm">
          {loading ? (
            <div className="space-y-4 py-8">
               {[1, 2, 3].map((i) => (
                 <div key={i} className="h-12 bg-surface-variant/30 rounded-lg animate-pulse" />
               ))}
            </div>
          ) : (tab === 'pending' ? pendingRegs : verifiedRegs).length === 0 ? (
            <div className="text-center py-16">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${tab === 'pending' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-blue-500/10 border border-blue-500/20 text-blue-400'}`}>
                <span className="material-symbols-outlined text-2xl">check_circle</span>
              </div>
              <p className="text-sm font-medium text-on-surface-variant">{tab === 'pending' ? 'No pending registrations.' : 'No verified registrations.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(groupedByGame).map(([game, gameRegs]) => {
                const isGameOpen = expandedGame === game
                const tournaments = groupedByTournament(gameRegs)
                return (
                  <div key={game} className="border border-outline-variant/20 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setExpandedGame(isGameOpen ? null : game)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-surface-variant/20 hover:bg-surface-variant/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${isGameOpen ? 'rotate-90' : ''}`}>chevron_right</span>
                        <span className="text-xs font-bold text-on-background uppercase">{game}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${tab === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{gameRegs.length} {tab === 'pending' ? 'pending' : 'verified'}</span>
                    </button>

                    <AnimatePresence>
                      {isGameOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-outline-variant/20">
                            {Object.entries(tournaments).map(([tournamentTitle, tRegs]) => {
                              const isTournamentOpen = expandedTournament === tournamentTitle
                              return (
                                <div key={tournamentTitle}>
                                  <button
                                    onClick={() => setExpandedTournament(isTournamentOpen ? null : tournamentTitle)}
                                    className="w-full flex items-center justify-between px-6 py-2.5 bg-surface/40 hover:bg-surface-variant/20 transition-colors"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`material-symbols-outlined text-xs text-on-surface-variant transition-transform ${isTournamentOpen ? 'rotate-90' : ''}`}>chevron_right</span>
                                      <span className="text-[11px] font-semibold text-on-background truncate">{tournamentTitle}</span>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${tab === 'pending' ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>{tRegs.length} {tab === 'pending' ? 'pending' : 'verified'}</span>
                                  </button>

                                  <AnimatePresence>
                                    {isTournamentOpen && (
                                      <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                      >
                                        <div className="overflow-x-auto">
                                          <table className="w-full min-w-[600px]">
                                            <thead>
                                              <tr className="bg-surface-variant/10">
                                                <th className="text-left px-4 py-2 font-label-caps text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">Team</th>
                                                <th className="text-left px-4 py-2 font-label-caps text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">Status</th>
                                                <th className="text-left px-4 py-2 font-label-caps text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">UTR</th>
                                                <th className="text-left px-4 py-2 font-label-caps text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">App</th>
                                                <th className="text-left px-4 py-2 font-label-caps text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">Screenshot</th>
                                                <th className="text-right px-4 py-2 font-label-caps text-[8px] font-bold uppercase tracking-wider text-on-surface-variant">{tab === 'verified' ? 'Verified At' : 'Actions'}</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {tRegs.map((reg) => (
                                                <tr key={reg.id} className="border-t border-outline-variant/10 hover:bg-surface-variant/10 transition-colors">
                                                  <td className="px-4 py-2.5">
                                                    <div className="space-y-0.5">
                                                      <p className="text-xs font-semibold text-on-background">{reg.team_name || '—'}</p>
                                                      <p className="text-[9px] font-mono text-on-surface-variant">{reg.captain || reg.user_id || ''}</p>
                                                    </div>
                                                  </td>
                                                  <td className="px-4 py-2.5">
                                                    {tab === 'verified' ? (
                                                      <span className="inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-500/15 text-emerald-400">
                                                        Verified
                                                      </span>
                                                    ) : (
                                                      <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                                        reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION'
                                                          ? 'bg-amber-500/15 text-amber-400'
                                                          : 'bg-blue-500/15 text-blue-400'
                                                      }`}>
                                                        {reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'Payment' : 'Free'}
                                                      </span>
                                                    )}
                                                  </td>
                                                  <td className="px-4 py-2.5 text-[10px] font-mono text-on-surface-variant">{
                                                    reg.payment_utr || reg.transaction_id || '—'
                                                  }</td>
                                                  <td className="px-4 py-2.5 text-[10px] text-on-surface-variant">{reg.payment_app || '—'}</td>
                                                  <td className="px-4 py-2.5">
                                                    {(reg.payment_proof_url || reg.screenshot_url) ? (
                                                      <button onClick={() => setScreenshotModal(reg.payment_proof_url || reg.screenshot_url)} className="px-2.5 py-1 rounded-md text-[9px] font-medium bg-primary/10 text-primary hover:bg-primary hover:text-white transition-colors flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-xs">image</span> View
                                                      </button>
                                                    ) : (
                                                      <span className="text-[10px] text-on-surface-variant">—</span>
                                                    )}
                                                  </td>
                                                  <td className="px-4 py-2.5 text-right">
                                                    {tab === 'verified' ? (
                                                      <span className="text-[9px] text-on-surface-variant">
                                                        {reg.updated_at ? new Date(reg.updated_at).toLocaleString() : '—'}
                                                      </span>
                                                    ) : (
                                                      <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                          onClick={() => handleApprove(reg.id, reg.status)}
                                                          disabled={actionLoading === reg.id}
                                                          className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                        >
                                                          {actionLoading === reg.id ? '...' : reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'CONFIRM' : 'APPROVE'}
                                                        </button>
                                                        <button
                                                          onClick={() => handleReject(reg.id)}
                                                          disabled={actionLoading === reg.id}
                                                          className="px-3 py-1.5 rounded-md text-[10px] font-bold bg-red-500/15 text-red-400 hover:bg-red-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                        >
                                                          REJECT
                                                        </button>
                                                      </div>
                                                    )}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </div>
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
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
