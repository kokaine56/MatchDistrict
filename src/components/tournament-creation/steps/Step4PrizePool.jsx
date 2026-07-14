import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import PrizeDistributionEditor from '../PrizeDistributionEditor'
import PrizeAllocationEngine from '../PrizeAllocationEngine'
import { OptimizedInput } from '../../OptimizedInput'

export default function Step4PrizePool({ data, onChange, errors, userTier, orgName, onNavigateToSubscription }) {
  const [platformFeePct, setPlatformFeePct] = useState(0)
  const [orgFeePct, setOrgFeePct] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/settings/platform-fee').then((r) => r.json()),
      fetch('/api/settings/organizer-fee').then((r) => r.json()),
    ])
      .then(([platRes, orgRes]) => {
        if (!cancelled) {
          if (platRes.success) setPlatformFeePct(platRes.percentage)
          if (orgRes.success) setOrgFeePct(orgRes.percentage)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const organizerName = orgName || 'Organizer'

  const handlePositionsChange = useCallback((positions) => {
    onChange({ ...data, prize_positions: positions })
  }, [data, onChange])

  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0
  const orgPct = Math.min(parseInt(data.organizer_fee_pct) || 0, 5)

  const basePrizePool = entryFee * totalSlots
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
    if (!orgPct || basePrizePool <= 0) return 0
    return Math.round(basePrizePool * (orgPct / 100))
  }, [orgPct, basePrizePool])
  const availablePlacementPool = Math.max(0, basePrizePool - mvpAmount - killRewardBudget - organizerFeeAmount - platformFeeAmount)

  // Sync the net placement pool into formData
  const prevPool = useRef(null)
  useEffect(() => {
    const pool = availablePlacementPool > 0 ? availablePlacementPool : ''
    if (prevPool.current !== pool) {
      prevPool.current = pool
      if (data.availablePlacementPool !== pool) {
        onChange({ ...data, availablePlacementPool: pool })
      }
    }
  }, [availablePlacementPool])

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
            <OptimizedInput
              type="number"
              min="0"
              value={data.entry_fee_amount || ''}
              onChange={(v) => onChange({ ...data, entry_fee_amount: v })}
              placeholder="Enter Entry Fee"
              className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
            />
          </div>
          <span className="text-xs text-on-surface-variant">{totalSlots} total slots</span>
        </div>
        {errors?.entry_fee_amount && <p className="text-xs text-error mt-2">{errors.entry_fee_amount}</p>}
      </div>

      <PrizeAllocationEngine
        data={data}
        platformFeePct={platformFeePct}
        organizerFeePct={orgPct}
        organizerName={organizerName}
        onOrganizerFeeChange={(v) => onChange({ ...data, organizer_fee_pct: v })}
      />

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
                <OptimizedInput
                  type="number"
                  min="0"
                  value={data.mvp_amount || ''}
                  onChange={(v) => onChange({ ...data, mvp_amount: v })}
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
                  <OptimizedInput
                    type="number"
                    min="0"
                    value={data.kill_reward_per_kill || ''}
                    onChange={(v) => onChange({ ...data, kill_reward_per_kill: v })}
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
        <div className={`bg-surface-container/50 border border-slate-200 dark:border-outline-variant/20 p-5 rounded-xl space-y-3 ${userTier === 'Free' ? 'opacity-50' : ''}`}>
          <Toggle
            enabled={userTier !== 'Free' ? (data.sponsors_enabled !== false) : false}
            onChange={(v) => onChange({ ...data, sponsors_enabled: v })}
            label="Sponsor Contributions"
            description="Allow sponsors to contribute additional funds to the prize pool."
            disabled={userTier === 'Free'}
          />
          {userTier === 'Free' && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-on-surface-variant">Available on Basic and Pro plans.</p>
              <button
                type="button"
                onClick={() => onNavigateToSubscription && onNavigateToSubscription()}
                className="text-xs font-bold text-primary hover:underline"
              >
                Upgrade
              </button>
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
