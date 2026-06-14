import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function SponsorRequestSection({ subscriptionApi, triggerToast, tier, tournaments }) {
  const [showForm, setShowForm] = useState(false)
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ tournamentId: '', prizePoolAmount: '', description: '' })

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const res = await subscriptionApi.getSponsorRequests()
      if (res.success) setRequests(res.requests || [])
    } catch (e) {} finally { setLoading(false) }
  }, [subscriptionApi])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await subscriptionApi.submitSponsorRequest({
        tournamentId: form.tournamentId || null,
        prizePoolAmount: parseInt(form.prizePoolAmount) || 0,
        description: form.description
      })
      if (res.success) {
        triggerToast('Sponsor request submitted!')
        setShowForm(false)
        setForm({ tournamentId: '', prizePoolAmount: '', description: '' })
        fetchRequests()
      } else {
        triggerToast(res.message || 'Failed to submit request')
      }
    } catch (e) {
      triggerToast('Network error')
    } finally { setSubmitting(false) }
  }

  const statusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-emerald-500/15 text-emerald-400'
      case 'rejected': return 'bg-error/15 text-error'
      default: return 'bg-warning/15 text-warning'
    }
  }

  return (
    <div className="glass-card p-4 sm:p-6 rounded-[20px] border border-outline-variant/30 bg-surface/40 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-headline-md text-sm sm:text-base font-bold text-on-background flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">sponsor</span>
          Sponsored Prize Pools
        </h3>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all">
          {showForm ? 'Cancel' : 'Request Sponsorship'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmit}
            className="space-y-3 mb-4 overflow-hidden"
          >
            <select
              value={form.tournamentId}
              onChange={(e) => setForm(f => ({ ...f, tournamentId: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50"
            >
              <option value="">Select Tournament (optional)</option>
              {tournaments.filter(t => t.status !== 'completed').map(t => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Prize Pool Amount (₹)"
              value={form.prizePoolAmount}
              onChange={(e) => setForm(f => ({ ...f, prizePoolAmount: e.target.value }))}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50"
            />
            <textarea
              placeholder="Describe your sponsorship needs..."
              value={form.description}
              onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 bg-surface-container-highest/40 border border-outline-variant/40 rounded-xl text-xs text-on-surface outline-none focus:border-primary/50 resize-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {loading ? (
        <p className="text-xs text-on-surface-variant text-center py-4">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-xs text-on-surface-variant text-center py-4">No sponsor requests yet</p>
      ) : (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {requests.map(req => (
            <div key={req.id} className="flex items-center justify-between bg-surface-container-highest/20 rounded-xl p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-on-surface truncate">
                  ₹{(req.prize_pool_amount || 0).toLocaleString('en-IN')}
                  {req.tournament_id && ' - ' + (tournaments.find(t => t.id === req.tournament_id)?.title || 'Unknown')}
                </p>
                {req.description && <p className="text-[10px] text-on-surface-variant truncate mt-0.5">{req.description}</p>}
                <p className="text-[9px] text-on-surface-variant/60 mt-0.5">{new Date(req.created_at).toLocaleDateString()}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium capitalize shrink-0 ml-2 ${statusColor(req.status)}`}>{req.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
