import { motion } from 'framer-motion'
import SlotCalculator from '../SlotCalculator'
import { OptimizedInput } from '../../OptimizedInput'

const PLAN_MAX_SLOTS = { Free: 100, Basic: 300, Pro: 1000 }

export default function Step3Slots({ data, onChange, errors, planLimits, userTier, onNavigateToSubscription }) {
  const tier = userTier || 'Free'
  const maxSlots = planLimits?.maxSlots || PLAN_MAX_SLOTS[tier] || 100

  const enteredSlots = parseInt(data.slotsTotal) || 0;
  const slotsNotMultiple = enteredSlots > 0 && enteredSlots % 16 !== 0;
  const slotsExceedPlan = enteredSlots > maxSlots
  const teamsPerMatch = parseInt(data.teams_per_match) || 16

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

  // Calculate basic first-round match count for dynamic preview
  const firstRoundMatchCount = enteredSlots > 0 && teamsPerMatch > 0
    ? Math.ceil(enteredSlots / teamsPerMatch)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Slots & Match Configuration</h2>
        <p className="text-sm text-on-surface-variant mt-1">Configure total tournament capacity and room capacity.</p>
      </div>

      {/* Available Public Slots */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Available Public Slots</h3>

        <div className="space-y-3" data-error={slotsExceedPlan || errors?.slotsTotal ? true : undefined}>
          <label className="block text-sm font-medium text-on-surface-variant">
            Total Tournament Slots <span style={{ color: '#ef4444' }}>*</span>
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
          {!slotsExceedPlan && !errors?.slotsTotal && slotsNotMultiple && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>Total slots must be a multiple of 16.</p>}
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-on-surface-variant">
            Reserved Slots <span className="text-on-surface-variant/50">(optional)</span>
          </label>
          <OptimizedInput
            type="number"
            min={0}
            max={parseInt(data.slotsTotal) || 0}
            instant
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
      </div>

      {/* Match Configuration */}
      <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-outline-variant/20">
        <h3 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Match Configuration</h3>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-on-surface-variant">
            Maximum Teams per Match <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <p className="text-xs text-on-surface-variant mb-2">
            Maximum number of teams allowed in a single room/match (16–25).
          </p>
          <select
            value={data.teams_per_match || 16}
            onChange={(e) => onChange({ ...data, teams_per_match: parseInt(e.target.value) })}
            className="w-full px-4 py-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-on-background text-sm focus:outline-none focus:border-primary/40 transition-colors"
          >
            {[...Array(10)].map((_, i) => (
              <option key={i+16} value={i+16}>{i+16} Teams</option>
            ))}
          </select>
        </div>

        {/* Dynamic First-Round Match Count Preview */}
        {enteredSlots > 0 && !slotsNotMultiple && !slotsExceedPlan && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 space-y-1"
          >
            <div className="flex items-center justify-between text-xs text-on-surface-variant">
              <span>{enteredSlots} tournament slots</span>
              <span>{teamsPerMatch} teams per match</span>
            </div>
            <p className="text-sm font-bold text-primary flex items-center gap-1.5">
              <span>→</span>
              <span>{firstRoundMatchCount} match{firstRoundMatchCount !== 1 ? 'es' : ''} in the first round</span>
            </p>
          </motion.div>
        )}
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

