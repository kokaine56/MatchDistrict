import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuthToken } from '../utils/getAuthToken'
import { formatDateTime } from '../utils/timeFormat'
import AdminLayout from '../components/admin/AdminLayout.jsx'

const EMPTY_STATE_ICON = { pending: 'hourglass_top', approved: 'verified', rejected: 'cancel' }
const EMPTY_STATE_TEXT = { pending: 'No pending sponsorships.', approved: 'No approved sponsorships yet.', rejected: 'No rejected sponsorships.' }

export default function AdminSponsorships() {
  const [contributions, setContributions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('pending')
  const [screenshotModal, setScreenshotModal] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [toastMessage, setToastMessage] = useState('')
  const [showToast, setShowToast] = useState(false)

  const triggerToast = (msg) => {
    setToastMessage(msg)
    setShowToast(true)
    setTimeout(() => setShowToast(false), 3000)
  }

  const fetchContributions = useCallback(async () => {
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/sponsor/contributions', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setContributions(data.contributions || [])
      else triggerToast(data.message || 'Failed to load sponsorships.')
    } catch {
      triggerToast('Error fetching sponsorships.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchContributions(), 0)
    return () => clearTimeout(t)
  }, [fetchContributions])

  const filtered = contributions.filter(c => c.status === tab)

  const handleApprove = async (contributionId) => {
    setActionLoading(contributionId)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/sponsor/contribution/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contributionId })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(data.message || 'Contribution approved!')
        fetchContributions()
      } else {
        triggerToast(data.message || 'Failed to approve.')
      }
    } catch {
      triggerToast('Error approving contribution.')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectOpen = (contributionId) => {
    setRejectModal(contributionId)
    setRejectReason('')
  }

  const confirmReject = async () => {
    if (!rejectReason.trim()) {
      triggerToast('Rejection reason is required.')
      return
    }
    const contributionId = rejectModal
    setRejectModal(null)
    setActionLoading(contributionId)
    try {
      const token = await getAuthToken()
      const res = await fetch('/api/admin/sponsor/contribution/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contributionId, adminNotes: rejectReason.trim() })
      })
      const data = await res.json()
      if (data.success) {
        triggerToast(data.message || 'Contribution rejected.')
        fetchContributions()
      } else {
        triggerToast(data.message || 'Failed to reject.')
      }
    } catch {
      triggerToast('Error rejecting contribution.')
    } finally {
      setActionLoading(null)
    }
  }

  const statusPillClass = (status) => {
    if (status === 'approved') return 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
    if (status === 'rejected') return 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
    return 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
  }

  return (
    <AdminLayout activeTab="sponsorships">
      {/* Toast */}
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
                <span className="text-xs font-bold text-on-background">Sponsorship Payment Proof</span>
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

      {/* Reject Modal */}
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
                <h3 className="text-sm font-bold text-on-background">Reject Sponsorship</h3>
                <p className="text-[11px] text-on-surface-variant mt-0.5">Provide a reason for rejection. The contributor will be notified.</p>
              </div>
              <div className="p-4 sm:p-5">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter rejection reason..."
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
        {/* Header & Controls */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-headline-lg text-lg sm:text-2xl font-black text-on-background tracking-tight">
              Sponsorship Payments
            </h1>
            <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
              Verify UPI contributions, validate transaction IDs, and approve public tournament sponsors.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setLoading(true); fetchContributions() }}
              disabled={loading}
              className="px-4 min-h-[40px] bg-surface border border-outline-variant/30 hover:bg-surface-variant text-on-background rounded-xl font-headline-md text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">refresh</span> Refresh
            </button>
          </div>
        </div>

        {/* Tab Filters */}
        <div className="flex items-center gap-1.5 bg-surface-variant/30 border border-outline-variant/20 p-1 rounded-xl w-fit">
          {['pending', 'approved', 'rejected'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-bold capitalize transition-all ${
                tab === t
                  ? 'bg-primary text-white shadow-sm shadow-primary/20'
                  : 'text-on-surface-variant hover:text-on-background'
              }`}
            >
              {t} ({contributions.filter(c => c.status === t).length})
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 bg-surface border border-outline-variant/20 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-surface border border-outline-variant/30 rounded-2xl">
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 bg-surface-variant/30 border border-outline-variant/20 text-on-surface-variant">
              <span className="material-symbols-outlined text-2xl">{EMPTY_STATE_ICON[tab]}</span>
            </div>
            <p className="text-sm font-semibold text-on-background">{EMPTY_STATE_TEXT[tab]}</p>
            <p className="text-xs text-on-surface-variant mt-1">Incoming contributions will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5">
            {filtered.map((c) => (
              <div key={c.id} className="bg-surface border border-outline-variant/30 rounded-2xl p-5 shadow-sm space-y-3.5 hover:border-primary/40 transition-colors">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-on-background truncate">{c.contributor_name}</p>
                    <p className="text-xs text-on-surface-variant truncate">{c.contributor_email || 'No email provided'}</p>
                    <p className="text-xs text-primary font-semibold truncate mt-0.5">{c.tournament_title || c.tournament_id}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusPillClass(c.status)}`}>
                      {c.status}
                    </span>
                    <span className="text-lg font-black text-on-background">
                      ₹{Number(c.amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-surface-container/50 border border-outline-variant/20 rounded-xl p-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Transaction ID</p>
                    <p className="font-mono font-semibold text-on-background mt-0.5 break-all">{c.transaction_id || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Payment App</p>
                    <p className="font-semibold text-on-background mt-0.5">{c.payment_app || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Submitted</p>
                    <p className="text-on-surface-variant mt-0.5">{c.created_at ? formatDateTime(c.created_at) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">{tab === 'pending' ? 'Review Status' : 'Reviewed At'}</p>
                    <p className="text-on-surface-variant mt-0.5">{c.reviewed_at ? formatDateTime(c.reviewed_at) : 'Pending review'}</p>
                  </div>
                </div>

                {c.message && (
                  <div className="bg-surface-variant/30 border border-outline-variant/15 rounded-xl px-3.5 py-2.5 text-xs text-on-surface-variant leading-relaxed italic">
                    “{c.message}”
                  </div>
                )}

                {tab === 'rejected' && c.admin_notes && (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl px-3.5 py-2.5 text-xs text-rose-500 leading-relaxed">
                    <span className="font-bold uppercase tracking-wider text-[10px] block">Rejection Note:</span>
                    {c.admin_notes}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  {c.screenshot_url ? (
                    <button
                      onClick={() => setScreenshotModal(c.screenshot_url)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors flex items-center gap-1.5"
                    >
                      <span className="material-symbols-outlined text-sm">image</span> View Screenshot Proof
                    </button>
                  ) : (
                    <span className="text-xs text-on-surface-variant/60 italic">No screenshot proof</span>
                  )}

                  {tab === 'pending' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRejectOpen(c.id)}
                        disabled={actionLoading === c.id}
                        className="px-3.5 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20 hover:bg-rose-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        Reject
                      </button>
                      <button
                        onClick={() => handleApprove(c.id)}
                        disabled={actionLoading === c.id}
                        className="px-4 py-2 min-h-[38px] rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs shadow-emerald-600/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                      >
                        {actionLoading === c.id ? (
                          <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        ) : (
                          <span className="material-symbols-outlined text-sm">check</span>
                        )}
                        Approve Sponsorship
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}