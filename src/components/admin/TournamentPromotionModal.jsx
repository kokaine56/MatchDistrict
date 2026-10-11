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

// ISO string -> value accepted by <input type="datetime-local"> (local time).
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// datetime-local value (local time) -> ISO UTC string (or null when blank).
function localInputToIso(value) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/**
 * Admin-only dialog for creating / editing / removing a tournament promotion.
 * Promotion is presentation-only and never mutates the tournament record.
 */
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
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: 'rgba(7, 8, 12, 0.85)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-2xl"
            style={{
              background: 'linear-gradient(135deg, #0d0e16 0%, #0a0b12 100%)',
              border: '1px solid rgba(192,193,255,0.12)',
              boxShadow: '0 40px 120px rgba(0,0,0,0.95), 0 0 0 1px rgba(192,193,255,0.05)',
            }}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <span className="material-symbols-outlined text-white/50 hover:text-white text-base transition-colors">close</span>
            </button>

            {/* Header */}
            <div className="px-6 pt-6 pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-lg">local_fire_department</span>
                <h2 className="text-sm font-extrabold text-white tracking-tight uppercase">Promote Tournament</h2>
              </div>
              <p className="text-[11px] text-white/40 mt-1 truncate">{tournament.title || tournament.id}</p>
              <p className="text-[10px] text-white/25 mt-0.5">Presentation only — registration, payments, slots and schedule are never affected.</p>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* Placement */}
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Section placement</span>
                <div className="grid grid-cols-1 gap-2">
                  {PLACEMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPlacement(opt.value)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold text-left transition-all"
                      style={{
                        background: placement === opt.value ? 'rgba(192,193,255,0.12)' : 'rgba(255,255,255,0.03)',
                        border: placement === opt.value ? '1px solid rgba(192,193,255,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        color: placement === opt.value ? '#c0c1ff' : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      <span className="material-symbols-outlined text-[16px]">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Priority + Display order */}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-2 block">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Priority</span>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value} className="bg-[#0d0e16]">{p.label}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 block">
                  <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Order</span>
                  <input
                    type="number"
                    min={0}
                    value={displayOrder}
                    onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
                    className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                </label>
              </div>
              <p className="-mt-3 text-[10px] text-white/25 leading-relaxed">
                Ordering: highest priority first, then lowest order, then earliest promoted.
              </p>

              {/* Active toggle */}
              <button
                type="button"
                onClick={() => setIsActive((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <span className="text-xs font-bold text-white/70">Active in section</span>
                <span
                  className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors"
                  style={{ background: isActive ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.12)' }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                    style={{ left: isActive ? '18px' : '2px' }}
                  />
                </span>
              </button>

              {/* Schedule */}
              <div className="space-y-3">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">Schedule (optional)</span>
                <label className="space-y-1.5 block">
                  <span className="text-[10px] text-white/35">Starts at</span>
                  <input
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />
                </label>
                <label className="space-y-1.5 block">
                  <span className="text-[10px] text-white/35">Ends at (blank = no expiry)</span>
                  <input
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full rounded-xl px-3 py-2.5 text-xs text-white outline-none"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', colorScheme: 'dark' }}
                  />
                </label>
                {hasEndBeforeStart && (
                  <p className="text-[10px] text-rose-400">The end time must be after the start time.</p>
                )}
              </div>

              {error && (
                <div
                  className="text-[11px] rounded-xl px-3 py-2"
                  style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/5 flex items-center gap-2">
              {promotion && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleRemove}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171' }}
                >
                  Remove
                </button>
              )}
              <div className="flex-1" />
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || hasEndBeforeStart}
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #c0c1ff, #a5b4fc)', color: '#07080C' }}
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
