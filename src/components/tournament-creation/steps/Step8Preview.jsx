import { useMemo } from 'react'
import { motion } from 'framer-motion'
import TournamentCard from '../../../components/TournamentCard'
import { formatTime12hIST, formatDateTime } from '../../../utils/timeFormat'

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
  const totalPrizePool = Number(data.prize_pool_amount) || 0
  const positions = data.prize_positions || []

  const availableSlots = Math.max(0, totalSlots - (parseInt(data.reserved_slots) || 0))

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

      {/* Primary Card Preview — the exact tournament card used across the app */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Tournament Card</h4>
        <div className="flex justify-center overflow-hidden sm:overflow-visible bg-surface-container/40 border border-slate-200 dark:border-outline-variant/25 rounded-2xl py-10">
          <div className="origin-center scale-[0.78] sm:scale-100 -my-6 sm:my-0">
            <TournamentCard
              id="preview"
              title={data.title || 'Untitled Tournament'}
              game={data.game || 'GAME'}
              badgeText="UPCOMING"
              badgeBg="bg-primary"
              badgeTextColor="text-white"
              imgSrc={data.cover_image_url || ''}
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
              isPreview={true}
              buttonText="JOIN NOW"
              onNavigate={() => {}}
              cardColor={data.card_color || 'white'}
              registrationOpenDate={data.registrationOpenDate || ''}
              registrationCloseDate={data.registrationCloseDate || ''}
              startDate={data.startDate || ''}
            />
          </div>
        </div>
      </div>

      {/* Tournament details summary */}
      <div className="bg-surface-container/50 border border-slate-200 dark:border-outline-variant/25 rounded-2xl overflow-hidden">
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
            <DetailRow label="Total Prize Pool" value={`₹${totalPrizePool.toLocaleString('en-IN')}`} />
            {positions.length > 0 && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-on-surface-variant/70 uppercase tracking-wider">Placement Distribution</p>
                {positions.map((pos) => {
                  const amount = Number(pos.amount) || 0
                  return (
                    <div key={pos.id} className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-on-surface-variant">{pos.name || 'Unnamed'}</span>
                      <span className="text-on-background font-medium">₹{amount.toLocaleString('en-IN')}</span>
                    </div>
                  )
                })}
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
            <DetailRow label="Registration Opens" value={data.registrationOpenDate ? formatDateTime(data.registrationOpenDate) : '—'} />
            <DetailRow label="Registration Closes" value={data.registrationCloseDate ? formatDateTime(data.registrationCloseDate) : '—'} />
            <DetailRow label="Match Starts" value={data.startDate ? formatDateTime(data.startDate) : '—'} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}
