import React, { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCurrentUser } from '../hooks/useCurrentUser.js'
import { getAuthToken } from '../utils/getAuthToken.js'
import { uploadImage } from '../utils/cloudinaryUpload.js'

const GAMES = ['BGMI', 'Valorant', 'COD Mobile', 'Free Fire', 'CS2']
const MATCH_TYPES = [
  { value: 'squad', label: 'Squad', roomLimit: { max: 25, min: 13 } },
  { value: 'duo', label: 'Duo', roomLimit: { max: 50, min: 25 } },
  { value: 'solo', label: 'Solo', roomLimit: { max: 100, min: 50 } }
]
const PERSPECTIVES = ['tpp', 'fpp']

const emptyForm = () => ({
  title: '',
  game: '',
  description: '',
  match_type: 'squad',
  perspective: 'tpp',
  slotsTotal: '100',
  max_slots_per_room: '25',
  entry_fee_amount: '',
  prize_pool_amount: '',
  sponsors_enabled: false,
  cover_image_url: '',
  region: 'India',
  registrationOpenDate: '',
  registrationCloseDate: '',
  startDate: '',
  rules: ''
})

export default function AdminCreateTournament({ onComplete }) {
  const [currentUser] = useCurrentUser()
  const fileInputRef = useRef(null)

  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState(null)
  const [serverError, setServerError] = useState('')

  const isAdmin = currentUser?.role === 'admin'
  const selectedMatchType = MATCH_TYPES.find(m => m.value === form.match_type)
  const roomLimit = selectedMatchType?.roomLimit || { max: 25, min: 13 }

  const validate = () => {
    const errs = {}
    if (!form.title || form.title.length < 5) errs.title = 'Title must be at least 5 characters.'
    if (form.title && form.title.length > 100) errs.title = 'Title must be under 100 characters.'
    if (!form.game) errs.game = 'Select a game.'
    if (!form.slotsTotal || parseInt(form.slotsTotal) < 2) errs.slotsTotal = 'Minimum 2 slots.'
    const mVal = parseInt(form.max_slots_per_room)
    if (!mVal || mVal < roomLimit.min) errs.max_slots_per_room = `Minimum ${roomLimit.min} slots per room for ${selectedMatchType?.label}.`
    if (mVal > roomLimit.max) errs.max_slots_per_room = `Maximum ${roomLimit.max} slots per room for ${selectedMatchType?.label}.`
    if (parseInt(form.slotsTotal) < mVal) errs.slotsTotal = 'Total slots cannot be less than slots per room.'
    if (!form.cover_image_url) errs.cover_image_url = 'Cover image URL is required.'
    return errs
  }

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    setServerError('')

    if (field === 'match_type') {
      const mt = MATCH_TYPES.find(m => m.value === value)
      if (mt) {
        const autoVal = String(mt.roomLimit.max)
        setForm(prev => ({ ...prev, match_type: value, max_slots_per_room: autoVal }))
      }
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErrors(prev => ({ ...prev, cover_image_url: 'Only JPEG, PNG, or WebP images are allowed.' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, cover_image_url: 'Image must be under 5MB.' }))
      return
    }
    setUploading(true)
    try {
      const url = await uploadImage(file)
      setForm(prev => ({ ...prev, cover_image_url: url }))
      setErrors(prev => ({ ...prev, cover_image_url: '' }))
    } catch (err) {
      setErrors(prev => ({ ...prev, cover_image_url: 'Upload failed: ' + err.message }))
    }
    setUploading(false)
  }

  const handleSubmit = async () => {
    const errs = validate()
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSubmitting(true)
    setServerError('')
    try {
      const token = await getAuthToken()
      const payload = {
        ...form,
        slotsTotal: parseInt(form.slotsTotal),
        max_slots_per_room: parseInt(form.max_slots_per_room),
        entry_fee_amount: form.entry_fee_amount ? parseInt(form.entry_fee_amount) : 0,
        prize_pool_amount: form.prize_pool_amount ? parseInt(form.prize_pool_amount) : 0
      }

      const res = await fetch('/api/admin/tournaments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!data.success) {
        setServerError(data.message || data.error || 'Failed to create tournament.')
        setSubmitting(false)
        return
      }
      setResult(data)
      if (typeof onComplete === 'function') onComplete(data.tournament)
    } catch (err) {
      setServerError('Network error: ' + err.message)
    }
    setSubmitting(false)
  }

  const handleReset = () => {
    setForm(emptyForm())
    setErrors({})
    setResult(null)
    setServerError('')
  }

  // ── Guard ──
  if (!isAdmin) {
    return (
      <div className="glass-card rounded-2xl p-8 text-center">
        <p className="text-error font-bold">Admin access required.</p>
      </div>
    )
  }

  if (result) {
    return (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="glass-card rounded-2xl p-8 text-center space-y-4 border border-emerald-500/30 bg-emerald-500/5">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
            <span className="material-symbols-outlined text-emerald-400 text-3xl">check_circle</span>
          </div>
          <h2 className="text-2xl font-bold text-white">Tournament Created & Hosted</h2>
          <p className="text-on-surface-variant text-sm">
            <span className="text-primary font-bold">{result.tournament.title}</span> is now LIVE on the platform.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-4">
            <a
              href={`/tournaments/${result.tournament.id}`}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:-translate-y-0.5 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)]"
            >
              View Tournament
            </a>
            <button
              onClick={handleReset}
              className="px-6 py-3 bg-surface-container-high border border-outline-variant/30 text-white rounded-xl font-bold hover:-translate-y-0.5 transition-all"
            >
              Create Another
            </button>
          </div>
          {result.slotGrid && (
            <p className="text-xs text-on-surface-variant pt-2">
              Slot grid initialized: {result.slotGrid.totalSlots} slots across {result.slotGrid.numRooms} rooms ({result.slotGrid.maxSlotsPerRoom} max per room)
            </p>
          )}
        </div>
      </motion.div>
    )
  }

  // ── Input group helper ──
  const Field = ({ label, error, children, required }) => (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
        {label} {required && <span className="text-error">*</span>}
      </label>
      {children}
      {error && <p className="text-[11px] text-error font-medium">{error}</p>}
    </div>
  )

  return (
    <div className="space-y-6">
      {serverError && (
        <div className="glass-card rounded-2xl p-4 border border-error/30 bg-error/5">
          <p className="text-error text-sm font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            {serverError}
          </p>
        </div>
      )}

      <div className="glass-card rounded-2xl border border-outline-variant/30 bg-surface-container-low/40 backdrop-blur-md overflow-hidden">
        <div className="border-b border-outline-variant/20 px-6 py-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">add_circle</span>
            Create & Host Tournament
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Tournaments are created with <span className="text-emerald-400 font-bold">LIVE</span> status — instantly visible on all feeds.
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Section: Core Information ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">info</span>
              Core Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Tournament Title" required error={errors.title}>
                <input
                  type="text"
                  value={form.title}
                  onChange={e => handleChange('title', e.target.value)}
                  placeholder="e.g. BGIS Pro League 2026"
                  maxLength={100}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>

              <Field label="Game" required error={errors.game}>
                <select
                  value={form.game}
                  onChange={e => handleChange('game', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all appearance-none cursor-pointer"
                >
                  <option value="">Select Game</option>
                  {GAMES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
            </div>

            <Field label="Description" error={errors.description}>
              <textarea
                value={form.description}
                onChange={e => handleChange('description', e.target.value)}
                placeholder="Brief description of the tournament..."
                rows={3}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all resize-none"
              />
            </Field>
          </div>

          {/* ── Section: Format & Perspective ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">sports_esports</span>
              Format & Perspective
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Match Type" required error={errors.match_type}>
                <div className="flex gap-2">
                  {MATCH_TYPES.map(mt => (
                    <button
                      key={mt.value}
                      type="button"
                      onClick={() => handleChange('match_type', mt.value)}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all border ${
                        form.match_type === mt.value
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant hover:border-primary/40'
                      }`}
                    >
                      {mt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Perspective" required error={errors.perspective}>
                <div className="flex gap-2">
                  {PERSPECTIVES.map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => handleChange('perspective', p)}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-bold transition-all border uppercase ${
                        form.perspective === p
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant hover:border-primary/40'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </div>

          {/* ── Section: Banner Image ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">image</span>
              Cover / Banner Image
            </h3>
            <Field label="Image URL or Upload" required error={errors.cover_image_url}>
              <div className="space-y-3">
                <input
                  type="text"
                  value={form.cover_image_url}
                  onChange={e => handleChange('cover_image_url', e.target.value)}
                  placeholder="https://res.cloudinary.com/... or upload below"
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="px-4 py-2.5 bg-surface-container-high border border-outline-variant/30 rounded-xl text-xs font-bold text-white hover:bg-surface-variant transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                    {uploading ? 'Uploading...' : 'Upload Image'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  {form.cover_image_url && (
                    <span className="text-xs text-emerald-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      Image set
                    </span>
                  )}
                </div>
              </div>
            </Field>
            {form.cover_image_url && (
              <div className="w-full max-h-48 overflow-hidden rounded-xl border border-outline-variant/20">
                <img
                  src={form.cover_image_url}
                  alt="Cover preview"
                  className="w-full h-48 object-cover"
                  onError={e => { e.target.style.display = 'none' }}
                />
              </div>
            )}
          </div>

          {/* ── Section: Financial Structures ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">payments</span>
              Financial Structures
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Prize Pool (₹)" error={errors.prize_pool_amount}>
                <input
                  type="number"
                  value={form.prize_pool_amount}
                  onChange={e => handleChange('prize_pool_amount', e.target.value)}
                  placeholder="0"
                  min={0}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>

              <Field label="Entry Fee (₹)" error={errors.entry_fee_amount}>
                <input
                  type="number"
                  value={form.entry_fee_amount}
                  onChange={e => handleChange('entry_fee_amount', e.target.value)}
                  placeholder="0 (Free)"
                  min={0}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>

              <Field label="Sponsors">
                <button
                  type="button"
                  onClick={() => handleChange('sponsors_enabled', !form.sponsors_enabled)}
                  className={`w-full px-4 py-3 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2 ${
                    form.sponsors_enabled
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-surface-container-lowest border-outline-variant/40 text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {form.sponsors_enabled ? 'toggle_on' : 'toggle_off'}
                  </span>
                  {form.sponsors_enabled ? 'Enabled' : 'Disabled'}
                </button>
              </Field>
            </div>
          </div>

          {/* ── Section: Slot Management ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">grid_view</span>
              Slot Management
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Total Tournament Slots" required error={errors.slotsTotal}>
                <input
                  type="number"
                  value={form.slotsTotal}
                  onChange={e => handleChange('slotsTotal', e.target.value)}
                  placeholder="100"
                  min={2}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>

              <Field
                label={`Max Slots Per Room (${selectedMatchType?.label}: ${roomLimit.min}-${roomLimit.max})`}
                required
                error={errors.max_slots_per_room}
              >
                <input
                  type="number"
                  value={form.max_slots_per_room}
                  onChange={e => handleChange('max_slots_per_room', e.target.value)}
                  placeholder={String(roomLimit.max)}
                  min={roomLimit.min}
                  max={roomLimit.max}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>
            </div>
            {form.slotsTotal && form.max_slots_per_room && (
              <div className="text-xs text-on-surface-variant space-y-1 bg-surface-container-lowest/50 rounded-xl px-4 py-3 border border-outline-variant/10">
                <p>
                  Rooms to be created:{' '}
                  <span className="text-primary font-bold">
                    {Math.ceil(parseInt(form.slotsTotal) / parseInt(form.max_slots_per_room))}
                  </span>
                </p>
                <p>
                  Last room size:{' '}
                  <span className="text-on-surface-variant font-medium">
                    {parseInt(form.slotsTotal) % parseInt(form.max_slots_per_room) || parseInt(form.max_slots_per_room)} slots
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* ── Section: Schedule ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
              Schedule
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="Registration Opens" error={errors.registrationOpenDate}>
                <input
                  type="datetime-local"
                  value={form.registrationOpenDate}
                  onChange={e => handleChange('registrationOpenDate', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>
              <Field label="Registration Closes" error={errors.registrationCloseDate}>
                <input
                  type="datetime-local"
                  value={form.registrationCloseDate}
                  onChange={e => handleChange('registrationCloseDate', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>
              <Field label="Match Start" error={errors.startDate}>
                <input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={e => handleChange('startDate', e.target.value)}
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>
            </div>
          </div>

          {/* ── Section: Region & Rules ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-outline-variant/10 pb-2">
              <span className="material-symbols-outlined text-primary text-lg">description</span>
              Additional Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Region" error={errors.region}>
                <input
                  type="text"
                  value={form.region}
                  onChange={e => handleChange('region', e.target.value)}
                  placeholder="India"
                  className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </Field>
            </div>
            <Field label="Rules (optional)">
              <textarea
                value={form.rules}
                onChange={e => handleChange('rules', e.target.value)}
                placeholder="Tournament rules, restrictions, and guidelines..."
                rows={4}
                className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-4 py-3 text-sm text-white placeholder-on-surface-variant/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all resize-none"
              />
            </Field>
          </div>
        </div>

        {/* ── Submit Area ── */}
        <div className="border-t border-outline-variant/20 px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <span className="material-symbols-outlined text-[16px]">info</span>
            Tournament will be created as <span className="text-emerald-400 font-bold">LIVE</span> — no approval needed
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting}
              className="px-5 py-3 bg-surface-container-high border border-outline-variant/30 rounded-xl text-xs font-bold text-on-surface-variant hover:text-white transition-all disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-6 py-3 bg-primary text-white rounded-xl font-bold hover:-translate-y-0.5 transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] disabled:opacity-50 disabled:hover:translate-y-0 flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">bolt</span>
                  Create & Host Tournament
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
