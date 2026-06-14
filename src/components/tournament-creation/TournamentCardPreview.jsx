import { motion } from 'framer-motion'

export default function TournamentCardPreview({ data }) {
  const {
    title = 'Tournament Title',
    game = 'Select Game',
    slotsTotal = 0,
    entry_fee_amount = 0,
    prize_pool_amount = 0,
    prize_pool_type = 'fixed',
    cover_image_url = '',
    match_type = 'squad',
  } = data

  const matchLabel = match_type === 'solo' ? 'Solo' : match_type === 'duo' ? 'Duo' : 'Squad'

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-on-background">Card Preview</h3>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-surface-container/60 border border-slate-200 dark:border-outline-variant/30 rounded-2xl overflow-hidden max-w-sm"
      >
        <div className="relative h-32 bg-gradient-to-br from-primary/20 to-surface-container-highest overflow-hidden">
          {cover_image_url ? (
            <img
              src={cover_image_url}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg className="w-10 h-10 text-on-surface-variant/30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-primary/90 text-white text-[10px] font-semibold uppercase tracking-wider">
            {game}
          </div>
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-surface-container/80 backdrop-blur-sm text-on-background text-[10px] font-medium">
            {matchLabel}
          </div>
        </div>
        <div className="p-4 space-y-2">
          <h4 className="text-sm font-bold text-on-background truncate">{title}</h4>
          <div className="flex items-center gap-3 text-xs text-on-surface-variant">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              {slotsTotal} Slots
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              ₹{entry_fee_amount.toLocaleString('en-IN')}
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" /></svg>
              ₹{prize_pool_amount.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      </motion.div>
      <p className="text-[10px] text-on-surface-variant">This is how your tournament will appear on the homepage &amp; discover page.</p>
    </div>
  )
}
