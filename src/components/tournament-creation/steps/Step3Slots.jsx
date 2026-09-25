import { motion } from 'framer-motion'
import SlotCalculator from '../SlotCalculator'
import { OptimizedInput } from '../../OptimizedInput'
import { computeGroupCount, buildGroups } from '../../../utils/groupUtils'

const PLAN_MAX_SLOTS = { Free: 100, Basic: 300, Pro: 1000 }
const DEFAULT_TEAMS_PER_GROUP = 16

export default function Step3Slots({ data, onChange, errors, planLimits, userTier, onNavigateToSubscription }) {
  const tier = userTier || 'Free'
  const maxSlots = planLimits?.maxSlots || PLAN_MAX_SLOTS[tier] || 100

  const enteredSlots = parseInt(data.slotsTotal) || 0
  const slotsExceedPlan = enteredSlots > maxSlots

  const teamsPerGroup = parseInt(data.teams_per_group) || DEFAULT_TEAMS_PER_GROUP
  const groupLayout = buildGroups(enteredSlots > 0 ? enteredSlots : maxSlots, teamsPerGroup)
  const groupCount = computeGroupCount(enteredSlots > 0 ? enteredSlots : maxSlots, teamsPerGroup)

  const groupError = (() => {
    const v = data.teams_per_group
    if (!v) return ''
    const n = parseInt(v)
    if (n <= 0) return 'Teams per group must be at least 1.'
    if (n > enteredSlots && enteredSlots > 0) return 'Teams per group cannot exceed total slots.'
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

  const handleGroupChange = (v) => {
    if (v === '' || (parseInt(v) > 0 && parseInt(v) <= (enteredSlots || maxSlots))) {
      onChange({ ...data, teams_per_group: v })
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

      {/* Group Configuration */}
      <div className="pt-4 border-t border-slate-100 dark:border-outline-variant/20">
        <div className="flex items-center gap-2 mb-3">
          <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <h3 className="text-sm font-bold text-on-background">Group Configuration</h3>
        </div>

        <p className="text-xs text-on-surface-variant mb-3">
          Automatically split the lobby into lettered groups (Group A, B, C ...) for organized matches.
        </p>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-on-surface-variant">
            Teams Per Group <span className="text-on-surface-variant/50">(optional)</span>
          </label>
          <OptimizedInput
            type="number"
            min={1}
            max={enteredSlots || maxSlots}
            value={data.teams_per_group || ''}
            onChange={handleGroupChange}
            placeholder={`e.g. ${DEFAULT_TEAMS_PER_GROUP}`}
            className={`w-full px-4 py-3 rounded-xl bg-surface-container border ${
              groupError ? 'border-error/60' : 'border-slate-200 dark:border-outline-variant/30'
            } text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors`}
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-on-surface-variant">
              {groupCount > 0 ? (
                <><strong className="text-on-background">{groupCount}</strong> group{groupCount > 1 ? 's' : ''} needed</>
              ) : (
                'Enter total slots to preview groups'
              )}
            </span>
            {groupLayout.length > 0 && (
              <span className="text-xs text-on-surface-variant max-w-[60%] text-right truncate" title={groupLayout.map(g => `Group ${g.name} · ${g.capacity}`).join(', ')}>
                {groupLayout.slice(0, 4).map(g => `Group ${g.name} (${g.capacity})`).join(' · ')}
                {groupLayout.length > 4 ? ' …' : ''}
              </span>
            )}
          </div>
          {groupError && <p className="text-xs" style={{ color: '#ef4444' }}>{groupError}</p>}
          <div className="mt-2 flex items-start gap-2 p-3 rounded-md bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Leave blank to use the default of {DEFAULT_TEAMS_PER_GROUP} teams per group. Registered teams are assigned to groups automatically once confirmed.
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
