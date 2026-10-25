import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuthToken } from '../utils/getAuthToken'
import { formatDateTime } from '../utils/timeFormat'
import AdminLayout from '../components/admin/AdminLayout.jsx'

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
      const res = await fetch('/api/admin/bulk-approve-verified', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(`Bulk approved ${data.approvedCount} registrations.`)
        fetchPending()
        setVerifiedCount(0)
      } else {
        triggerToast(data.message || 'Bulk approval failed.')
      }
    } catch {
      triggerToast('Error during bulk approval.')
    } finally {
      setBulkApproving(false)
    }
  }

  useEffect(() => {
    fetchPending()
    fetchVerifiedCount()
  }, [])

  const pendingRegs = registrations.filter(r => r.status !== 'confirmed' && r.status !== 'approved' && r.status !== 'VERIFIED_BY_HOST' && r.status !== 'verified_by_host')
  const verifiedRegs = registrations.filter(r => r.status === 'VERIFIED_BY_HOST' || r.status === 'verified_by_host' || r.status === 'confirmed')

  const currentList = tab === 'pending' ? pendingRegs : verifiedRegs

  const groupedByGame = currentList.reduce((acc, reg) => {
    const game = reg.tournament_game || reg.game || 'Other Games'
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
    <AdminLayout activeTab="payments">
      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-2.5 rounded-xl bg-surface border border-outline-variant/40 shadow-lg backdrop-blur-md text-xs font-semibold text-on-background animate-in fade-in slide-in-from-top-2 duration-200">
          {toastMessage}
        </div>
      )}

      {/* Screenshot Proof Modal */}
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
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="max-w-lg w-full bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between">
                <span className="text-xs font-bold text-on-background">Payment Screenshot Proof</span>
                <button
                  onClick={() => setScreenshotModal(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-variant/40 hover:bg-surface-variant text-on-surface-variant hover:text-on-background transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
              <div className="p-4 bg-black/40 flex items-center justify-center">
                <img src={screenshotModal} alt="Payment screenshot proof" className="w-full object-contain max-h-[70vh] rounded-lg" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Reason Modal */}
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
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="max-w-md w-full bg-surface rounded-2xl border border-outline-variant/30 shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 sm:p-5 border-b border-outline-variant/20">
                <h3 className="text-sm font-bold text-on-background">Reject Registration</h3>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Provide a reason for rejection. The participant will be notified.</p>
              </div>
              <div className="p-4 sm:p-5">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter specific rejection reason (e.g. Invalid UTR, wrong amount, mismatch screenshot)..."
                  className="w-full min-h-[110px] px-3.5 py-2.5 rounded-xl border border-outline-variant/30 bg-surface text-on-background placeholder:text-on-surface-variant/40 text-xs focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 resize-none transition-all"
                  autoFocus
                />
              </div>
              <div className="p-4 sm:p-5 pt-0 flex items-center gap-2.5 justify-end">
                <button
                  onClick={() => setRejectModal(null)}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-surface-variant/40 hover:bg-surface-variant text-on-background border border-outline-variant/30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmReject}
                  disabled={!rejectReason.trim()}
                  className="px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm shadow-rose-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  Confirm Rejection
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto space-y-6 w-full">
        {/* Page Title & Controls */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-headline-lg text-lg sm:text-2xl font-black text-on-background tracking-tight">
                Payment Verification
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                {pendingRegs.length} Pending
              </span>
            </div>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Review participant payment proofs, verify bank UTRs, and approve tournament slots.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {tab === 'pending' && verifiedCount > 0 && (
              <button
                onClick={handleBulkApproveAll}
                disabled={bulkApproving}
                className="px-4 min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-emerald-600/20 disabled:opacity-40 active:scale-95"
              >
                {bulkApproving ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-sm">select_all</span>
                )}
                Approve All ({verifiedCount})
              </button>
            )}
            <button
              onClick={() => { fetchPending(); fetchVerifiedCount(); }}
              disabled={loading}
              className="px-4 min-h-[40px] bg-surface border border-outline-variant/30 hover:bg-surface-variant text-on-background rounded-xl font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">refresh</span> Refresh
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 bg-surface-variant/30 border border-outline-variant/20 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab('pending')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'pending'
                ? 'bg-primary text-white shadow-sm shadow-primary/20'
                : 'text-on-surface-variant hover:text-on-background'
            }`}
          >
            Pending Review ({pendingRegs.length})
          </button>
          <button
            onClick={() => setTab('verified')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              tab === 'verified'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/20'
                : 'text-on-surface-variant hover:text-on-background'
            }`}
          >
            Verified ({verifiedRegs.length})
          </button>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-surface border border-outline-variant/20 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (tab === 'pending' ? pendingRegs : verifiedRegs).length === 0 ? (
          <div className="text-center py-16 bg-surface border border-outline-variant/30 rounded-2xl">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
              tab === 'pending'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500'
                : 'bg-primary/10 border border-primary/20 text-primary'
            }`}>
              <span className="material-symbols-outlined text-2xl">check_circle</span>
            </div>
            <p className="text-sm font-semibold text-on-background">
              {tab === 'pending' ? 'All caught up! No pending registrations.' : 'No verified registrations.'}
            </p>
            <p className="text-xs text-on-surface-variant mt-1">New submissions will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedByGame).map(([game, gameRegs]) => {
              const isGameOpen = expandedGame === game
              const tournaments = groupedByTournament(gameRegs)
              return (
                <div key={game} className="bg-surface border border-outline-variant/30 rounded-2xl overflow-hidden shadow-sm">
                  {/* Game header toggle */}
                  <button
                    onClick={() => setExpandedGame(isGameOpen ? null : game)}
                    className="w-full flex items-center justify-between px-5 py-3.5 bg-surface hover:bg-surface-variant/20 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`material-symbols-outlined text-base text-primary transition-transform ${isGameOpen ? 'rotate-90' : ''}`}>
                        chevron_right
                      </span>
                      <span className="text-xs font-bold text-on-background uppercase tracking-wider">{game}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      tab === 'pending' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                    }`}>
                      {gameRegs.length} {tab === 'pending' ? 'pending' : 'verified'}
                    </span>
                  </button>

                  <AnimatePresence>
                    {isGameOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-outline-variant/20 divide-y divide-outline-variant/15">
                          {Object.entries(tournaments).map(([tournamentTitle, tRegs]) => {
                            const isTournamentOpen = expandedTournament === tournamentTitle
                            return (
                              <div key={tournamentTitle} className="bg-surface/50">
                                <button
                                  onClick={() => setExpandedTournament(isTournamentOpen ? null : tournamentTitle)}
                                  className="w-full flex items-center justify-between px-6 py-3 hover:bg-surface-variant/30 transition-colors text-left"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className={`material-symbols-outlined text-sm text-on-surface-variant transition-transform ${isTournamentOpen ? 'rotate-90' : ''}`}>
                                      chevron_right
                                    </span>
                                    <span className="text-xs font-semibold text-on-background truncate">{tournamentTitle}</span>
                                  </div>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    tab === 'pending' ? 'bg-amber-500/10 text-amber-500' : 'bg-emerald-500/10 text-emerald-500'
                                  }`}>
                                    {tRegs.length} {tab === 'pending' ? 'pending' : 'verified'}
                                  </span>
                                </button>

                                <AnimatePresence>
                                  {isTournamentOpen && (
                                    <motion.div
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: 'auto', opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      className="overflow-hidden"
                                    >
                                      <div className="overflow-x-auto border-t border-outline-variant/20 bg-surface">
                                        <table className="w-full min-w-[650px] text-left text-xs">
                                          <thead>
                                            <tr className="bg-surface-variant/30 border-b border-outline-variant/20 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                                              <th className="px-5 py-2.5">Team &amp; Captain</th>
                                              <th className="px-5 py-2.5">Payment Type</th>
                                              <th className="px-5 py-2.5">Bank UTR</th>
                                              <th className="px-5 py-2.5">App</th>
                                              <th className="px-5 py-2.5">Screenshot Proof</th>
                                              <th className="px-5 py-2.5 text-right">{tab === 'verified' ? 'Verified At' : 'Actions'}</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-outline-variant/15">
                                            {tRegs.map((reg) => (
                                              <tr key={reg.id} className="hover:bg-surface-variant/20 transition-colors">
                                                <td className="px-5 py-3">
                                                  <div className="space-y-0.5">
                                                    <p className="text-xs font-bold text-on-background">{reg.team_name || '—'}</p>
                                                    <p className="text-[10px] font-mono text-on-surface-variant">{reg.captain || reg.user_id || ''}</p>
                                                  </div>
                                                </td>
                                                <td className="px-5 py-3">
                                                  {tab === 'verified' ? (
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                                      Verified
                                                    </span>
                                                  ) : (
                                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                                      reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION'
                                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                        : 'bg-primary/10 text-primary border border-primary/20'
                                                    }`}>
                                                      {reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'Paid' : 'Free'}
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="px-5 py-3 font-mono text-xs font-semibold text-on-surface-variant">
                                                  {reg.payment_utr || reg.transaction_id || '—'}
                                                </td>
                                                <td className="px-5 py-3 text-xs text-on-surface-variant">
                                                  {reg.payment_app || '—'}
                                                </td>
                                                <td className="px-5 py-3">
                                                  {(reg.payment_proof_url || reg.screenshot_url) ? (
                                                    <button
                                                      onClick={() => setScreenshotModal(reg.payment_proof_url || reg.screenshot_url)}
                                                      className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors flex items-center gap-1"
                                                    >
                                                      <span className="material-symbols-outlined text-xs">image</span> View Proof
                                                    </button>
                                                  ) : (
                                                    <span className="text-[11px] text-on-surface-variant/50 italic">No screenshot</span>
                                                  )}
                                                </td>
                                                <td className="px-5 py-3 text-right">
                                                  {tab === 'verified' ? (
                                                    <span className="text-[11px] text-on-surface-variant font-medium">
                                                      {reg.updated_at ? formatDateTime(reg.updated_at) : '—'}
                                                    </span>
                                                  ) : (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                      <button
                                                        onClick={() => handleApprove(reg.id, reg.status)}
                                                        disabled={actionLoading === reg.id}
                                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                                      >
                                                        {actionLoading === reg.id ? '...' : (reg.status === 'pending_payment' || reg.status === 'PENDING_PAYMENT_VERIFICATION' ? 'CONFIRM' : 'APPROVE')}
                                                      </button>
                                                      <button
                                                        onClick={() => handleReject(reg.id)}
                                                        disabled={actionLoading === reg.id}
                                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
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
    </AdminLayout>
  )
}
