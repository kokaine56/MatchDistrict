import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getAuthToken } from '../../utils/getAuthToken.js'

// Placement values mirror server/tournamentPromotion.js PROMOTION_PLACEMENTS.
const PLACEMENT_OPTIONS = [
  { value: 'trending', label: 'Trending only', icon: 'trending_up' },
  { value: 'featured', label: 'Featured only', icon: 'star' },
  { value: 'trending_featured', label: 'Trending & Featured', icon: 'local_fire_department' },
]

const PRIORITY_OPTIONS = [
  { value: 0, label: 'Normal' },
  { value: 50, label: 'High' },
  { value: 100, label: 'Top priority' },
]

function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export default function TournamentPromotionModal({ isOpen, tournament, promotion, onClose, onSaved }) {
  const [placement, setPlacement] = useState(() => promotion?.placement || 'trending_featured')
  const [priority, setPriority] = useState(() => Number(promotion?.priority) || 0)
  const [displayOrder, setDisplayOrder] = useState(() => Number(promotion?.display_order) || 0)
  const [isActive, setIsActive] = useState(() => (promotion ? promotion.is_active !== false : true))
  const [startsAt, setStartsAt] = useState(() => isoToLocalInput(promotion?.starts_at))
  const [endsAt, setEndsAt] = useState(() => isoToLocalInput(promotion?.ends_at))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const hasEndBeforeStart = useMemo(() => {
    if (!startsAt || !endsAt) return false
    const s = new Date(startsAt).getTime()
    const e = new Date(endsAt).getTime()
    return Number.isFinite(s) && Number.isFinite(e) && e <= s
  }, [startsAt, endsAt])

  if (!isOpen || !tournament) return null

  const authHeaders = async () => {
    const token = await getAuthToken()
    const headers = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  const handleSave = async () => {
    if (hasEndBeforeStart) {
      setError('The end time must be after the start time.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/promotion`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          placement,
          priority,
          display_order: displayOrder,
          is_active: isActive,
          starts_at: localInputToIso(startsAt),
          ends_at: localInputToIso(endsAt),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.message || data.error || 'Could not save the promotion.')
        return
      }
      onSaved && onSaved('saved')
      onClose && onClose()
    } catch {
      setError('Network error while saving the promotion.')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setSaving(true)
    setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`/api/admin/tournaments/${encodeURIComponent(tournament.id)}/promotion`, {
        method: 'DELETE',
        headers,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        setError(data.message || data.error || 'Could not remove the promotion.')
        return
      }
      onSaved && onSaved('removed')
      onClose && onClose()
    } catch {
      setError('Network error while removing the promotion.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-2xl bg-surface border border-outline-variant/30 shadow-2xl text-on-background"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-xl bg-surface-variant/40 hover:bg-surface-variant border border-outline-variant/20 flex items-center justify-center text-on-surface-variant hover:text-on-background transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">local_fire_department</span>
                <h2 className="text-sm font-extrabold text-on-background tracking-tight uppercase">Promote Tournament</h2>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-1 truncate font-medium">{tournament.title || tournament.id}</p>
              <p className="text-[10px] text-on-surface-variant/60 mt-0.5">Presentation only — registration, payments, slots and schedule are untouched.</p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Placement */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Section placement</span>
                <div className="grid grid-cols-1 gap-2">
                  {PLACEMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPlacement(opt.value)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border ${
                        placement === opt.value
                          ? 'bg-primary/10 border-primary/40 text-primary font-bold'
                          : 'bg-surface-variant/30 border-outline-variant/20 text-on-surface-variant hover:text-on-background'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority + Display order */}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Priority</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-surface border border-outline-variant/30 text-on-background outline-none focus:border-primary"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value} className="bg-surface text-on-background">{p.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 block">
                  <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Order</span>
                  <input
                    type="number"
                    min={0}
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-surface border border-outline-variant/30 text-on-background outline-none focus:border-primary"
                  />
                </label>
              </div>

              {/* Active toggle */}
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-outline-variant/20 bg-surface-variant/30 transition-all text-xs font-semibold text-on-background"
              >
                <span>Active in section</span>
                <span
                  className={`relative inline-flex items-center w-8 h-4.5 rounded-full transition-colors ${
                    isActive ? 'bg-primary' : 'bg-outline-variant/50'
                  }`}
                >
                  <span
                    className={`absolute w-3.5 h-3.5 rounded-full bg-white transition-all ${
                      isActive ? 'left-4' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              {/* Schedule */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">Schedule (optional)</span>
                <label className="space-y-1 block">
                  <span className="text-[10px] text-on-surface-variant">Starts at</span>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-surface border border-outline-variant/30 text-on-background outline-none focus:border-primary"
                  />
                </label>
                <label className="space-y-1 block">
                  <span className="text-[10px] text-on-surface-variant">Ends at (blank = indefinite)</span>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2 text-xs bg-surface border border-outline-variant/30 text-on-background outline-none focus:border-primary"
                  />
                </label>
                {hasEndBeforeStart && (
                  <p className="text-[11px] text-rose-500">The end time must be after the start time.</p>
                )}
              </div>

              {error && (
                <div className="text-[11px] font-medium rounded-xl px-3 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-500">
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-outline-variant/20 flex items-center gap-2 bg-surface/50">
              {promotion && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRemove}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-500 bg-rose-500/10 hover:bg-rose-500 hover:text-white border border-rose-500/20 transition-all disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-background hover:bg-surface-variant/50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || hasEndBeforeStart}
                onClick={handleSave}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-white shadow-sm shadow-primary/20 transition-all disabled:opacity-50"
              >
                {saving ? 'Saving…' : promotion ? 'Update promotion' : 'Promote'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
