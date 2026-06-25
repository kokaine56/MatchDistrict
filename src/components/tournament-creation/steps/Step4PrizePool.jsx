import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import PrizeDistributionEditor from '../PrizeDistributionEditor'
import PrizeAllocationEngine from '../PrizeAllocationEngine'

export default function Step4PrizePool({ data, onChange, errors, userTier }) {
  const [platformFeePct, setPlatformFeePct] = useState(0)
  const [organizerFeePct, setOrganizerFeePct] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/settings/platform-fee').then((r) => r.json()),
      fetch('/api/settings/organizer-fee').then((r) => r.json()),
    ])
      .then(([platRes, orgRes]) => {
        if (!cancelled) {
          if (platRes.success) setPlatformFeePct(platRes.percentage)
          if (orgRes.success) setOrganizerFeePct(orgRes.percentage)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handlePositionsChange = useCallback((positions) => {
    onChange({ ...data, prize_positions: positions })
  }, [data, onChange])

  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0

  const basePrizePool = useMemo(() => entryFee * totalSlots, [entryFee, totalSlots])
  const sponsorContributions = useMemo(() => {
    return (Array.isArray(data.sponsors) ? data.sponsors : [])
      .filter((s) => s.status === 'approved')
      .reduce((sum, s) => sum + (s.amount || 0), 0)
  }, [data.sponsors])

  const totalPrizePool = basePrizePool + sponsorContributions
  const mvpAmount = data.mvp_enabled ? (parseInt(data.mvp_amount) || 0) : 0
  const killRewardPerKill = parseInt(data.kill_reward_per_kill) || 0
  const killRewardBudget = data.kill_reward_enabled ? (totalSlots * killRewardPerKill) : 0
  const platformFeeAmount = useMemo(() => {
    if (!platformFeePct || basePrizePool <= 0) return 0
    return Math.round(basePrizePool * (platformFeePct / 100))
  }, [platformFeePct, basePrizePool])
  const organizerFeeAmount = useMemo(() => {
    if (!organizerFeePct || basePrizePool <= 0) return 0
    return Math.round(basePrizePool * (organizerFeePct / 100))
  }, [organizerFeePct, basePrizePool])
  const availablePlacementPool = Math.max(0, basePrizePool - mvpAmount - killRewardBudget - organizerFeeAmount - platformFeeAmount)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Prize Pool & Rewards</h2>
        <p className="text-sm text-on-surface-variant mt-1">Configure entry fee, rewards, and prize distribution.</p>
      </div>

      <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl space-y-4">
        <h3 className="text-sm font-semibold text-on-background">Entry Fee</h3>
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">₹</span>
            <input
              type="number"
              min="0"
              value={data.entry_fee_amount || ''}
              onChange={(e) => onChange({ ...data, entry_fee_amount: e.target.value })}
              placeholder="Enter Entry Fee"
              className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
            />
          </div>
          <span className="text-xs text-on-surface-variant">{totalSlots} total slots</span>
        </div>
        {errors?.entry_fee_amount && <p className="text-xs text-error mt-2">{errors.entry_fee_amount}</p>}
      </div>

      <PrizeAllocationEngine data={data} platformFeePct={platformFeePct} organizerFeePct={organizerFeePct} />

      <div className="space-y-4">
        {/* MVP Reward */}
        <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl space-y-3">
          <Toggle
            enabled={data.mvp_enabled || false}
            onChange={(v) => onChange({ ...data, mvp_enabled: v })}
            label="Enable MVP Reward"
            description="Award a fixed amount to the Most Valuable Player"
          />
          {data.mvp_enabled && (
            <div className="flex items-center gap-3 pl-1">
              <div className="relative min-w-[120px] max-w-[200px]">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">₹</span>
                <input
                  type="number"
                  min="0"
                  value={data.mvp_amount || ''}
                  onChange={(e) => onChange({ ...data, mvp_amount: e.target.value })}
                  placeholder="0"
                  className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
                />
              </div>
              <span className="text-xs text-on-surface-variant">Fixed amount deducted from total prize pool</span>
            </div>
          )}
        </div>

        {/* Kill Reward */}
        <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl space-y-3">
          <Toggle
            enabled={data.kill_reward_enabled || false}
            onChange={(v) => onChange({ ...data, kill_reward_enabled: v })}
            label="Enable Per Kill Reward"
            description="Award a per-kill amount to participating teams"
          />
          {data.kill_reward_enabled && (
            <div className="space-y-2 pl-1">
              <div className="flex items-center gap-3">
                <div className="relative min-w-[120px] max-w-[200px]">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={data.kill_reward_per_kill || ''}
                    onChange={(e) => onChange({ ...data, kill_reward_per_kill: e.target.value })}
                    placeholder="0"
                    className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
                  />
                </div>
                <span className="text-xs text-on-surface-variant">per kill</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="px-2 py-0.5 rounded bg-surface-container-highest font-medium text-rose-500">
                  Max budget: ₹{(totalSlots * killRewardPerKill).toLocaleString('en-IN')}
                </span>
                <span>({totalSlots} Max Kills × ₹{killRewardPerKill})</span>
              </div>
            </div>
          )}
        </div>

        {/* Sponsor Contributions — plan-locked */}
        <div className="flex items-start justify-between bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl">
          <div>
            <h3 className="text-sm font-semibold text-on-background">Sponsor Contributions</h3>
            <p className="text-xs text-on-surface-variant mt-1">Allow sponsors to contribute additional funds to the prize pool.</p>
          </div>
          {userTier !== 'Free' ? (
            <span className="flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20 shrink-0">
              ✓ Enabled by Plan
            </span>
          ) : (
            <span className="flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/40 border border-slate-200 dark:border-white/10 shrink-0">
              Locked (Free Plan)
            </span>
          )}
        </div>

        {/* Prize Distribution */}
        <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl">
          <PrizeDistributionEditor
            positions={data.prize_positions || []}
            onChange={handlePositionsChange}
            availablePlacementPool={availablePlacementPool}
          />
          {errors?.prize_positions && <p className="text-xs text-error mt-2">{errors.prize_positions}</p>}
          {errors?.prize_positions_total && <p className="text-xs text-error mt-2">{errors.prize_positions_total}</p>}
          {errors?.prize_split && <p className="text-xs text-error mt-2">{errors.prize_split}</p>}
        </div>
      </div>
    </motion.div>
  )
}

function Toggle({ enabled, onChange, label, description, disabled }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <span className={`text-sm font-semibold ${disabled ? 'text-on-surface-variant' : 'text-on-background'}`}>{label}</span>
        {description && <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>}
      </div>
      <label className={`toggle-wrapper ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="toggle-track" />
        <div className="toggle-thumb" />
      </label>
    </div>
  )
}
