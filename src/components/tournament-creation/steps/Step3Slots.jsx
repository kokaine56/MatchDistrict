import { motion } from 'framer-motion'
import SlotCalculator from '../SlotCalculator'
import { OptimizedInput } from '../../OptimizedInput'

const PLAN_MAX_SLOTS = { Free: 100, Basic: 300, Pro: 1000 }
const ROOM_MAX_SLOTS = { solo: 100, duo: 50, squad: 25 }

export default function Step3Slots({ data, onChange, errors, planLimits, userTier, onNavigateToSubscription }) {
  const tier = userTier || 'Free'
  const maxSlots = planLimits?.maxSlots || PLAN_MAX_SLOTS[tier] || 100

  const matchType = data.match_type || 'squad'
  const roomMax = ROOM_MAX_SLOTS[matchType] || 25

  const enteredSlots = parseInt(data.slotsTotal) || 0
  const slotsExceedPlan = enteredSlots > maxSlots

  const roomError = (() => {
    const v = data.max_slots_per_room
    if (!v) return ''
    const n = parseInt(v)
    if (n > roomMax) return `${matchType.charAt(0).toUpperCase() + matchType.slice(1)} tournaments allow at most ${roomMax} slots per room.`
    return ''
  })()

  const handleSlotsChange = (v) => {
    if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= 1000)) {
      onChange({ ...data, slotsTotal: v })
    }
  }

  const handleReservedChange = (v) => {
    const total = parseInt(data.slotsTotal) || 0
    if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= total)) {
      onChange({ ...data, reserved_slots: v })
    }
  }

  const handleRoomChange = (v) => {
    if (v === '' || (parseInt(v) > 0 && parseInt(v) <= roomMax)) {
      onChange({ ...data, max_slots_per_room: v })
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Slots</h2>
        <p className="text-sm text-on-surface-variant mt-1">Configure tournament capacity.</p>
      </div>

      <div className="space-y-3" data-error={slotsExceedPlan || errors?.slotsTotal ? true : undefined}>
        <label className="block text-sm font-medium text-on-surface-variant">
          Total Slots <span style={{ color: '#ef4444' }}>*</span>
        </label>
        <OptimizedInput
          type="number"
          min={2}
          max={1000}
          instant
          value={data.slotsTotal || ''}
          onChange={handleSlotsChange}
          placeholder="Enter total tournament slots"
          className={`w-full px-4 py-3 rounded-xl bg-surface-container border ${
            errors?.slotsTotal || slotsExceedPlan ? 'border-error/60' : 'border-slate-200 dark:border-outline-variant/30'
          } text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors`}
        />
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-on-surface-variant">Plan:</span>
          <span className={`plan-limit-badge ${tier.toLowerCase()}`}>{tier}</span>
        </div>
        {slotsExceedPlan && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <p className="text-xs" style={{ color: '#ef4444' }}>
              Your {tier} plan supports up to {maxSlots} slots.
            </p>
            <button
              type="button"
              onClick={() => onNavigateToSubscription && onNavigateToSubscription()}
              className="text-xs font-bold bg-primary px-2 py-0.5 rounded-md hover:bg-primary/90 transition-colors"
              style={{ color: '#ef4444' }}
            >
              Upgrade
            </button>
          </div>
        )}
        {!slotsExceedPlan && errors?.slotsTotal && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{errors.slotsTotal}</p>}
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-on-surface-variant">
          Reserved Slots <span className="text-on-surface-variant/50">(optional)</span>
        </label>
        <OptimizedInput
          type="number"
          min={0}
          max={parseInt(data.slotsTotal) || 0}
          value={data.reserved_slots || ''}
          onChange={handleReservedChange}
          placeholder="e.g. 10"
          className="w-full px-4 py-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors"
        />
        <div className="mt-1 flex items-start gap-2 p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
          <svg className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-blue-700 dark:text-blue-300">Reserved slots are hidden from public registration and can be assigned manually.</p>
        </div>
      </div>

      <SlotCalculator total={data.slotsTotal} reserved={data.reserved_slots} />

      {/* Room Configuration */}
      <div className="pt-4 border-t border-slate-100 dark:border-outline-variant/20">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <path d="M8 21h8" /><path d="M12 17v4" />
          </svg>
          <h3 className="text-sm font-bold text-on-background">Room Configuration</h3>
        </div>

        <p className="text-xs text-on-surface-variant mb-3">
          Optionally split slots across multiple game lobbies.
          Leave blank to use the match type's default maximum per room.
        </p>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-on-surface-variant">
            Max Slots Per Room <span className="text-on-surface-variant/50">(optional)</span>
          </label>
          <OptimizedInput
            type="number"
            min={1}
            max={roomMax}
            value={data.max_slots_per_room || ''}
            onChange={handleRoomChange}
            placeholder="e.g. 16"
            className={`w-full px-4 py-3 rounded-xl bg-surface-container border ${
              roomError ? 'border-error/60' : 'border-slate-200 dark:border-outline-variant/30'
            } text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors`}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-on-surface-variant">
              <strong className="text-on-background capitalize">{matchType}</strong>
              {' '}— max <strong>{roomMax}</strong> per room
            </span>
            {data.max_slots_per_room && parseInt(data.max_slots_per_room) > 0 && data.slotsTotal && (
              <span className="text-xs text-on-surface-variant">
                {Math.ceil(parseInt(data.slotsTotal) / parseInt(data.max_slots_per_room))} room{Math.ceil(parseInt(data.slotsTotal) / parseInt(data.max_slots_per_room)) > 1 ? 's' : ''} needed
              </span>
            )}
          </div>
          {roomError && <p className="text-xs" style={{ color: '#ef4444' }}>{roomError}</p>}
          <div className="mt-2 flex items-start gap-2 p-3 rounded-md bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Maximum {roomMax} slots per room for {matchType} format. Additional rooms are created automatically as needed.
            </p>
          </div>
        </div>
      </div>

      {/* Unique Amount Suffix */}
      {parseInt(data.entry_fee_amount) > 0 && (
        <div className="pt-4 border-t border-slate-100 dark:border-outline-variant/20">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
            <h3 className="text-sm font-bold text-on-background">Unique Payment Amount</h3>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/30">
            <div className="flex-1">
              <p className="text-sm font-medium text-on-background">Random paisa suffix</p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Adds a small random amount (e.g. ₹{data.entry_fee_amount}.07) to guarantee unique payment amounts during high-volume registration.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ ...data, unique_amount_suffix_enabled: !data.unique_amount_suffix_enabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                data.unique_amount_suffix_enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                data.unique_amount_suffix_enabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>
        </div>
      )}
    </motion.div>
  )
}
