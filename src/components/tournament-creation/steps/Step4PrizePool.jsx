import { useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import SponsorManager from '../SponsorManager'
import PrizeDistributionEditor from '../PrizeDistributionEditor'
import PrizeAllocationEngine from '../PrizeAllocationEngine'

function Toggle({ enabled, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <span className="text-sm font-semibold text-on-background">{label}</span>
        {description && <p className="text-xs text-on-surface-variant mt-0.5">{description}</p>}
      </div>
      <label className="toggle-wrapper">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="toggle-track" />
        <div className="toggle-thumb" />
      </label>
    </div>
  )
}

export default function Step4PrizePool({ data, onChange, errors, userTier }) {
  const handleSponsorsChange = useCallback((sponsors) => {
    onChange({ ...data, sponsors })
  }, [data, onChange])

  const handlePositionsChange = useCallback((positions) => {
    onChange({ ...data, prize_positions: positions })
  }, [data, onChange])

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
  const killRewardPerKill = parseInt(data.kill_reward_per_kill) || 0
  const killRewardBudget = data.kill_reward_enabled ? (teams * killRewardPerKill) : 0
  const availablePlacementPool = Math.max(0, totalPrizePool - mvpAmount - killRewardBudget)

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
      </div>

      <PrizeAllocationEngine data={data} />

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
              <div className="relative flex-1 max-w-[200px]">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">₹</span>
                <input
                  type="number"
                  min="0"
                  value={data.mvp_amount || ''}
                  onChange={(e) => onChange({ ...data, mvp_amount: e.target.value })}
                  placeholder="0"
                  className="w-full pl-8 pr-4 py-2 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
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
                <div className="relative flex-1 max-w-[200px]">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={data.kill_reward_per_kill || ''}
                    onChange={(e) => onChange({ ...data, kill_reward_per_kill: e.target.value })}
                    placeholder="0"
                    className="w-full pl-8 pr-4 py-2 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
                  />
                </div>
                <span className="text-xs text-on-surface-variant">per kill</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                <span className="px-2 py-0.5 rounded bg-surface-container-highest font-medium text-rose-500">
                  Max budget: ₹{(teams * killRewardPerKill).toLocaleString('en-IN')}
                </span>
                <span>({teams} teams × ₹{killRewardPerKill})</span>
              </div>
            </div>
          )}
        </div>

        {/* Sponsor Contributions Toggle */}
        <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl space-y-3">
          <Toggle
            enabled={data.sponsors_enabled || false}
            onChange={(v) => onChange({ ...data, sponsors_enabled: v, sponsors: v ? (data.sponsors || []) : [] })}
            label="Enable Sponsor Contributions"
            description="Allow sponsors to contribute additional funds to the prize pool"
          />
          {data.sponsors_enabled && (
            <SponsorManager
              sponsors={data.sponsors || []}
              onChange={handleSponsorsChange}
              userTier={userTier}
            />
          )}
          {!data.sponsors_enabled && userTier !== 'Free' && (
            <div className="px-3 py-2.5 rounded-lg bg-surface-container-highest/40 border border-outline-variant/20">
              <p className="text-xs text-on-surface-variant">
                Toggle on to add sponsors. Your {userTier} plan supports {userTier === 'Basic' ? 'up to 5 sponsors' : 'unlimited sponsors'}.
              </p>
            </div>
          )}
        </div>

        {/* Prize Distribution */}
        <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl">
          <PrizeDistributionEditor
            positions={data.prize_positions || []}
            onChange={handlePositionsChange}
            availablePlacementPool={availablePlacementPool}
          />
          {errors?.prize_split && <p className="text-xs text-error mt-2">{errors.prize_split}</p>}
        </div>
      </div>
    </motion.div>
  )
}
