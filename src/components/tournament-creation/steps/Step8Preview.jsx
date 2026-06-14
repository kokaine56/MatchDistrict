import { useMemo } from 'react'
import { motion } from 'framer-motion'
import TournamentCard from '../../../components/TournamentCard'

function DetailRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-outline-variant/10 last:border-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      {typeof value === 'string' || typeof value === 'number' ? (
        <span className="text-sm font-medium text-on-background">{value || '—'}</span>
      ) : (
        value
      )}
    </div>
  )
}

export default function Step8Preview({ data, orgName, orgTier }) {
  const totalSlots = parseInt(data.slotsTotal) || 0
  const entryFee = parseInt(data.entry_fee_amount) || 0
  const teams = data.match_type === 'solo' ? totalSlots
    : data.match_type === 'duo' ? Math.floor(totalSlots / 2)
    : Math.floor(totalSlots / 4)

  const basePrizePool = entryFee * totalSlots

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

  const positions = data.prize_positions || []
  const totalAllocatedPct = positions.reduce((s, p) => s + (parseInt(p.percentage) || 0), 0)
  const isFullyAllocated = totalAllocatedPct === 100 && availablePlacementPool >= 0

  const availableSlots = Math.max(0, totalSlots - (parseInt(data.reserved_slots) || 0))
  const rounds = data.roadmap || []

  const matchLabel = data.match_type === 'solo' ? 'Solo'
    : data.match_type === 'duo' ? 'Duo' : 'Squad'
  const perspLabel = data.perspective === 'tpp' ? 'TPP' : 'FPP'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Preview</h2>
        <p className="text-sm text-on-surface-variant mt-1">Review your tournament before publishing.</p>
      </div>

      <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/25 rounded-2xl overflow-hidden">
        {data.cover_image_url && (
          <div className="h-40 overflow-hidden">
            <img src={data.cover_image_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-on-background">{data.title || 'Untitled Tournament'}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-primary/20 text-primary">
                  {data.game || 'Game TBD'}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-surface-container-highest text-on-surface-variant">
                  {matchLabel} • {perspLabel}
                </span>
              </div>
            </div>
          </div>

          <DetailRow label="Total Slots" value={data.slotsTotal} />
          <DetailRow label="Reserved Slots" value={data.reserved_slots || '0'} />
          <DetailRow label="Available Public Slots" value={String(availableSlots)} />
          <DetailRow label="Entry Fee" value={entryFee ? `₹${entryFee.toLocaleString('en-IN')}` : 'Free'} />

          {/* Prize Pool Breakdown */}
          <div className="pt-2 border-t border-outline-variant/20">
            <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Prize Pool</h4>
            <DetailRow label="Base Prize Pool" value={`₹${basePrizePool.toLocaleString('en-IN')}`} />
            {sponsorContributions > 0 && (
              <DetailRow label="Sponsor Contributions" value={`+₹${sponsorContributions.toLocaleString('en-IN')}`} />
            )}
            <DetailRow label="Total Prize Pool" value={`₹${totalPrizePool.toLocaleString('en-IN')}`} />
            {mvpAmount > 0 && (
              <DetailRow label="MVP Reward" value={`−₹${mvpAmount.toLocaleString('en-IN')}`} />
            )}
            {killRewardBudget > 0 && (
              <DetailRow label="Kill Reward Budget" value={`−₹${killRewardBudget.toLocaleString('en-IN')} (${teams} teams × ₹${killRewardPerKill})`} />
            )}
            <DetailRow label="Available for Placement" value={
              <span className={`text-sm font-bold ${availablePlacementPool >= 0 ? 'text-emerald-500' : 'text-error'}`}>
                ₹{availablePlacementPool.toLocaleString('en-IN')}
              </span>
            } />

            {positions.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider">Placement Distribution</p>
                {positions.map((pos) => {
                  const pct = parseInt(pos.percentage) || 0
                  const amt = Math.round((pct / 100) * availablePlacementPool)
                  return (
                    <div key={pos.id} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-on-surface-variant">{pos.name || 'Unnamed'}</span>
                      <span className="text-on-background font-medium">{pct}% — ₹{amt.toLocaleString('en-IN')}</span>
                    </div>
                  )
                })}
                {!isFullyAllocated && (
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-outline-variant/10">
                    <span className="text-on-surface-variant italic">Unallocated</span>
                    <span className="text-on-surface-variant">₹{(availablePlacementPool - positions.reduce((s, p) => s + Math.round(((parseInt(p.percentage) || 0) / 100) * availablePlacementPool), 0)).toLocaleString('en-IN')}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {(data.sponsors || []).length > 0 && (
            <div className="pt-2 border-t border-outline-variant/20">
              <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Sponsors ({data.sponsors.length})</h4>
              <div className="space-y-1">
                {data.sponsors.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 text-sm">
                    <span className="text-on-background font-medium">{s.name}</span>
                    <span className={`sponsor-status-badge ${s.status}`}>{s.status}</span>
                    <span className="text-tertiary font-medium ml-auto">₹{s.amount.toLocaleString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-outline-variant/20">
            <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Timeline</h4>
            <DetailRow label="Registration Opens" value={data.registrationOpenDate ? new Date(data.registrationOpenDate).toLocaleString('en-IN') : '—'} />
            <DetailRow label="Registration Closes" value={data.registrationCloseDate ? new Date(data.registrationCloseDate).toLocaleString('en-IN') : '—'} />
            <DetailRow label="Match Starts" value={data.startDate ? new Date(data.startDate).toLocaleString('en-IN') : '—'} />
          </div>

          {rounds.length > 0 && (
            <div className="pt-2 border-t border-outline-variant/20">
              <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Roadmap</h4>
              <div className="space-y-1">
                {rounds.map((r, idx) => (
                  <div key={r.id || idx} className="flex items-center gap-2 text-sm">
                    <span className="w-2 h-2 rounded-full bg-primary/60" />
                    <span className="text-on-background font-medium">{r.name || `Round ${idx + 1}`}</span>
                    {r.date && <span className="text-on-surface-variant text-xs">{r.date}</span>}
                    {r.time && <span className="text-on-surface-variant text-xs">{r.time}</span>}
                    {r.qualified && <span className="text-on-surface-variant text-xs">• {r.qualified} teams</span>}
                    {idx < rounds.length - 1 && <span className="text-on-surface-variant ml-auto">↓</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Preview */}
      <div className="pt-2">
        <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Homepage Card Preview</h4>
        <div className="flex justify-center">
          <TournamentCard
            id="preview"
            title={data.title || 'Untitled Tournament'}
            game={data.game || 'GAME'}
            badgeText="UPCOMING"
            badgeBg="bg-primary"
            badgeTextColor="text-white"
            imgSrc={data.cover_image_url || 'https://images.unsplash.com/photo-1566492031773-4f4e44671857?auto=format&fit=crop&w=500&q=80'}
            imgAlt={data.title || 'Tournament cover'}
            prizePool={totalPrizePool > 0 ? `₹${totalPrizePool.toLocaleString('en-IN')}` : 'TBD'}
            entryFee={entryFee > 0 ? `₹${entryFee.toLocaleString('en-IN')}` : 'Free'}
            matchType={matchLabel}
            perspective={perspLabel}
            orgName={orgName}
            orgTier={orgTier}
            slotsTotal={data.slotsTotal}
            slotsFilled={0}
            entryFeeAmount={entryFee}
            buttonText="JOIN NOW"
            onNavigate={() => {}}
          />
        </div>
      </div>
    </motion.div>
  )
}