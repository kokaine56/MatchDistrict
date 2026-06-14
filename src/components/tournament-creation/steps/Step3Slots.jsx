import { motion } from 'framer-motion'
import SlotCalculator from '../SlotCalculator'

const PLAN_MAX_SLOTS = { Free: 100, Basic: 300, Pro: 1000 }
const PLAN_VALIDATION = {
  Free: 'Free Plan supports up to 100 slots per tournament.',
  Basic: 'Basic Plan supports up to 300 slots per tournament.',
  Pro: 'Pro Plan supports up to 1000 slots per tournament.',
}

export default function Step3Slots({ data, onChange, errors, planLimits, userTier }) {
  const tier = userTier || 'Free'
  const maxSlots = planLimits?.maxSlots || PLAN_MAX_SLOTS[tier] || 100
  const validationMsg = PLAN_VALIDATION[tier] || PLAN_VALIDATION.Free

  const handleSlotsChange = (e) => {
    const v = e.target.value
    if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= maxSlots)) {
      onChange({ ...data, slotsTotal: v })
    }
  }

  const handleReservedChange = (e) => {
    const v = e.target.value
    const total = parseInt(data.slotsTotal) || 0
    if (v === '' || (parseInt(v) >= 0 && parseInt(v) <= total)) {
      onChange({ ...data, reserved_slots: v })
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

      <div className="space-y-3">
        <label className="block text-sm font-medium text-on-surface-variant">
          Total Slots <span className="text-error">*</span>
        </label>
        <input
          type="number"
          min={2}
          max={maxSlots}
          value={data.slotsTotal || ''}
          onChange={handleSlotsChange}
          placeholder="Enter total tournament slots"
          className={`w-full px-4 py-3 rounded-xl bg-surface-container border ${
            errors?.slotsTotal ? 'border-error/60' : 'border-slate-200 dark:border-outline-variant/30'
          } text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors`}
        />
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-on-surface-variant">Plan:</span>
            <span className={`plan-limit-badge ${tier.toLowerCase()}`}>{tier}</span>
            <span className="text-xs text-on-surface-variant">Max: <strong>{maxSlots}</strong> slots</span>
          </div>
          {data.slotsTotal && parseInt(data.slotsTotal) > 0 && (
            <span className="text-xs text-on-surface-variant">
              {parseInt(data.slotsTotal)} / {maxSlots} slots used
            </span>
          )}
        </div>
        {errors?.slotsTotal && <p className="text-xs text-error">{errors.slotsTotal}</p>}
        <p className="text-xs text-on-surface-variant mt-1">{validationMsg}</p>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-on-surface-variant">
          Reserved Slots <span className="text-on-surface-variant/50">(optional)</span>
        </label>
        <input
          type="number"
          min={0}
          max={parseInt(data.slotsTotal) || 0}
          value={data.reserved_slots || ''}
          onChange={handleReservedChange}
          placeholder="e.g. 10"
          className="w-full px-4 py-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors"
        />
        <p className="text-xs text-on-surface-variant">Reserved slots are hidden from public registration and can be assigned manually.</p>
      </div>

      <SlotCalculator total={data.slotsTotal} reserved={data.reserved_slots} />
    </motion.div>
  )
}
