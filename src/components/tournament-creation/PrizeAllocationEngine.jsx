import { useMemo } from 'react'

export default function PrizeAllocationEngine({ data, platformFeePct = 0 }) {
  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0
  const teams = data.match_type === 'solo' ? totalSlots
    : data.match_type === 'duo' ? Math.floor(totalSlots / 2)
    : Math.floor(totalSlots / 4)

  const basePrizePool = useMemo(() => entryFee * totalSlots, [entryFee, totalSlots])

  const sponsorContributions = useMemo(() => {
    return (data.sponsors || [])
      .filter((s) => s.status === 'approved')
      .reduce((sum, s) => sum + (s.amount || 0), 0)
  }, [data.sponsors])

  const totalPrizePool = basePrizePool + sponsorContributions

  const mvpAmount = data.mvp_enabled ? (parseInt(data.mvp_amount) || 0) : 0
  const killRewardEnabled = data.kill_reward_enabled
  const killRewardPerKill = parseInt(data.kill_reward_per_kill) || 0
  const killRewardBudget = killRewardEnabled ? (teams * killRewardPerKill) : 0

  const platformFeeAmount = useMemo(() => {
    if (!platformFeePct || totalPrizePool <= 0) return 0
    return Math.round(totalPrizePool * (platformFeePct / 100))
  }, [platformFeePct, totalPrizePool])

  const availablePlacementPool = Math.max(0, totalPrizePool - platformFeeAmount - mvpAmount - killRewardBudget)

  const positions = data.prize_positions || []
  const totalAllocatedPercentage = positions.reduce((sum, p) => sum + (parseInt(p.percentage) || 0), 0)
  const totalAllocatedAmount = positions.reduce((sum, p) => {
    const pct = parseInt(p.percentage) || 0
    return sum + Math.round((pct / 100) * availablePlacementPool)
  }, 0)

  const remainingAmount = availablePlacementPool - totalAllocatedAmount
  const isValid = totalAllocatedPercentage <= 100
  const isFullyAllocated = totalAllocatedPercentage === 100 && availablePlacementPool >= 0

  return (
    <div className="prize-breakdown-card space-y-4">
      <h3 className="text-sm font-bold text-on-background">Prize Pool Allocation Engine</h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between py-1.5">
          <div>
            <span className="text-sm text-on-surface-variant">Base Prize Pool</span>
            <p className="text-[10px] text-on-surface-variant/70">
              {entryFee.toLocaleString('en-IN')} × {totalSlots} slots
            </p>
          </div>
          <span className="text-sm font-semibold text-on-background">₹{basePrizePool.toLocaleString('en-IN')}</span>
        </div>

        {sponsorContributions > 0 && (
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-on-surface-variant">Sponsor Contributions</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">+₹{sponsorContributions.toLocaleString('en-IN')}</span>
          </div>
        )}

        <div className="border-t border-blue-200/50 dark:border-blue-500/20 pt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-on-background">Total Prize Pool</span>
          <span className="text-base font-bold text-primary">₹{totalPrizePool.toLocaleString('en-IN')}</span>
        </div>
      </div>

      {platformFeeAmount > 0 && (
        <div className="flex items-center justify-between py-1.5 border-t border-outline-variant/10">
          <span className="text-sm text-on-surface-variant">Platform Fee ({platformFeePct}%)</span>
          <span className="text-sm font-semibold text-error">−₹{platformFeeAmount.toLocaleString('en-IN')}</span>
        </div>
      )}

      {mvpAmount > 0 && (
        <div className="flex items-center justify-between py-1.5 border-t border-outline-variant/10">
          <span className="text-sm text-on-surface-variant">MVP Reward</span>
          <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">−₹{mvpAmount.toLocaleString('en-IN')}</span>
        </div>
      )}

      {killRewardBudget > 0 && (
        <div className="flex items-center justify-between py-1.5">
          <div>
            <span className="text-sm text-on-surface-variant">Kill Reward Budget</span>
            <p className="text-[10px] text-on-surface-variant/70">
              {teams} teams × ₹{killRewardPerKill} per kill
            </p>
          </div>
          <span className="text-sm font-semibold text-rose-500">−₹{killRewardBudget.toLocaleString('en-IN')}</span>
        </div>
      )}

      {(platformFeeAmount > 0 || mvpAmount > 0 || killRewardBudget > 0) && (
        <div className="border-t border-emerald-200/50 dark:border-emerald-500/20 pt-2 flex items-center justify-between">
          <span className="text-sm font-bold text-on-background">Available for Placement</span>
          <span className={`text-base font-bold ${availablePlacementPool >= 0 ? 'text-emerald-500' : 'text-error'}`}>
            ₹{availablePlacementPool.toLocaleString('en-IN')}
          </span>
        </div>
      )}

      {totalPrizePool > 0 && totalAllocatedAmount > 0 && (
        <div className="border-t border-outline-variant/10 pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-on-surface-variant/70">Placement Distribution</span>
            <span className={`text-[10px] font-medium ${isFullyAllocated ? 'text-tertiary' : !isValid ? 'text-error' : 'text-on-surface-variant'}`}>
              {totalAllocatedPercentage}% allocated
            </span>
          </div>
          {positions.map((pos) => {
            const pct = parseInt(pos.percentage) || 0
            const amt = Math.round((pct / 100) * availablePlacementPool)
            return (
              <div key={pos.id} className="flex items-center justify-between text-xs">
                <span className="text-on-surface-variant">{pos.name || 'Unnamed'}</span>
                <span className="text-on-background">
                  {pct}% — ₹{amt.toLocaleString('en-IN')}
                </span>
              </div>
            )
          })}
          {remainingAmount > 0 && (
            <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/10">
              <span className="text-on-surface-variant italic">Unallocated</span>
              <span className="text-on-surface-variant">₹{remainingAmount.toLocaleString('en-IN')}</span>
            </div>
          )}
        </div>
      )}

      {totalPrizePool > 0 && !isFullyAllocated && totalAllocatedPercentage > 0 && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg px-3 py-2">
          <p className="text-xs text-warning font-medium">
            {!isValid
              ? 'Placement allocation exceeds 100%. Reduce some percentages.'
              : `Placement pool not fully allocated (${totalAllocatedPercentage}%). Remaining ₹${remainingAmount.toLocaleString('en-IN')} will not be distributed.`}
          </p>
        </div>
      )}

      {totalPrizePool > 0 && (mvpAmount + killRewardBudget) > totalPrizePool && (
        <div className="bg-error/10 border border-error/20 rounded-lg px-3 py-2">
          <p className="text-xs text-error font-medium">
            MVP + Kill Reward budget exceeds total prize pool. Reduce values.
          </p>
        </div>
      )}
    </div>
  )
}
