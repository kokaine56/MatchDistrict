import { useMemo } from 'react'
import { PLATFORM_FEE_ENABLED } from '../../utils/prizePool.js'

export default function PrizeAllocationEngine({ data, platformFeePct = 0, organizerFeePct = 0, organizerName = 'Organizer', onOrganizerFeeChange }) {
  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0

  const basePrizePool = entryFee * totalSlots

  const mvpAmount = data.mvp_enabled ? (parseInt(data.mvp_amount) || 0) : 0
  const killRewardPerKill = parseInt(data.kill_reward_per_kill) || 0
  const killRewardBudget = data.kill_reward_enabled ? (totalSlots * killRewardPerKill) : 0

  const platformFeeAmount = useMemo(() => {
    if (!PLATFORM_FEE_ENABLED || !platformFeePct || basePrizePool <= 0) return 0
    return Math.round(basePrizePool * (platformFeePct / 100))
  }, [platformFeePct, basePrizePool])

  const organizerFeeAmount = useMemo(() => {
    if (!organizerFeePct || basePrizePool <= 0) return 0
    return Math.round(basePrizePool * (organizerFeePct / 100))
  }, [organizerFeePct, basePrizePool])

  const availablePlacementPool = Math.max(0, basePrizePool - mvpAmount - killRewardBudget - organizerFeeAmount - platformFeeAmount)

  const hasDeductions = mvpAmount > 0 || killRewardBudget > 0 || organizerFeeAmount > 0 || platformFeeAmount > 0

  return (
    <div className="prize-breakdown-card space-y-4">
      <h3 className="text-sm font-bold text-on-background">Prize Pool Allocation Engine</h3>

      <div className="space-y-2">
        {/* 1. Base Prize Pool */}
        {basePrizePool > 0 && (
          <div className="flex items-center justify-between py-1.5">
            <div>
              <span className="text-sm text-on-surface-variant">Base Prize Pool</span>
              <p className="text-[10px] text-on-surface-variant/70">
                ₹{entryFee.toLocaleString('en-IN')} × {totalSlots} slots
              </p>
            </div>
            <span className="text-sm font-semibold text-on-background">₹{basePrizePool.toLocaleString('en-IN')}</span>
          </div>
        )}
      </div>

      {/* 2. MVP Reward */}
      {mvpAmount > 0 && (
        <div className="flex items-center justify-between py-1.5 border-t border-outline-variant/10">
          <span className="text-sm text-on-surface-variant">MVP Reward</span>
          <span className="text-sm font-semibold text-error">−₹{mvpAmount.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* 3. Kill Reward Budget */}
      {killRewardBudget > 0 && (
        <div className="flex items-center justify-between py-1.5">
          <div>
            <span className="text-sm text-on-surface-variant">Kill Reward Budget</span>
            <p className="text-[10px] text-on-surface-variant/70">
              {totalSlots} Max Kills × ₹{killRewardPerKill}
            </p>
          </div>
          <span className="text-sm font-semibold text-error">−₹{killRewardBudget.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* 4. Organizer Fee — editable */}
      {basePrizePool > 0 && (
        <div className="flex items-center justify-between py-1.5 border-t border-outline-variant/10">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-on-surface-variant">
              Your Fees  <span className="text-xs text-on-surface-variant/60">({organizerName})</span>
            </span>
            <span className="text-xs text-on-surface-variant/70">
              You will receive <strong className="text-emerald-500">₹{organizerFeeAmount.toLocaleString('en-IN')}</strong> for hosting and managing this tournament.
            </span>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="range"
                min="0"
                max="5"
                step="1"
                value={organizerFeePct}
                onChange={(e) => onOrganizerFeeChange && onOrganizerFeeChange(e.target.value)}
                className="w-24 h-1.5 accent-primary"
              />
              <input
                type="number"
                min="0"
                max="5"
                step="1"
                value={organizerFeePct}
                onChange={(e) => {
                  const clamped = Math.min(parseInt(e.target.value) || 0, 5)
                  onOrganizerFeeChange && onOrganizerFeeChange(String(clamped))
                }}
                className="w-14 px-1.5 py-0.5 rounded bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-xs text-on-background text-center focus:outline-none focus:border-primary/40"
              />
              <span className="text-xs text-on-surface-variant">%</span>
            </div>
          </div>
          <span className="text-sm font-semibold text-error shrink-0 ml-4">−₹{organizerFeeAmount.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* 5. Platform Fee */}
      {platformFeeAmount > 0 && (
        <div className="flex items-center justify-between py-1.5">
          <div className="flex flex-col">
            <span className="text-sm text-on-surface-variant">Platform Fee ({platformFeePct}%)</span>
            <span className="text-xs text-slate-400 dark:text-gray-500 mt-0.5">Retained for platform operations, server infrastructure maintenance, domain costs, and secure transaction handling.</span>
          </div>
          <span className="text-sm font-semibold text-error shrink-0 ml-4">−₹{platformFeeAmount.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* 6. Available for Placement */}
      {basePrizePool > 0 && (
        <div className={`border-t ${hasDeductions ? 'border-emerald-200/50 dark:border-emerald-500/20' : 'border-blue-200/50 dark:border-blue-500/20'} pt-2 flex items-center justify-between`}>
          <span className="text-sm font-bold text-on-background">Available for Placement</span>
          <span className="text-base font-bold text-emerald-500">
            ₹{availablePlacementPool.toLocaleString('en-IN')}
          </span>
        </div>
      )}

      {basePrizePool > 0 && (mvpAmount + killRewardBudget) > basePrizePool && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          <p className="text-xs text-error font-medium">
            MVP + Kill Reward budget exceeds base prize pool. Reduce values.
          </p>
        </div>
      )}
    </div>
  )
}
