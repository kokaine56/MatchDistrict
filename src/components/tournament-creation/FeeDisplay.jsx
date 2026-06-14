export default function FeeDisplay({ fee }) {
  const amount = parseInt(fee) || 0

  return (
    <div className="bg-surface-container border border-slate-200 dark:border-outline-variant/20 p-4 rounded-xl">
      <h3 className="text-sm font-semibold text-on-background mb-2">Entry Fee</h3>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-on-background">₹{amount.toLocaleString('en-IN')}</span>
      </div>
      <p className="text-xs text-on-surface-variant mt-1">
        {amount === 0 ? 'Free entry' : `Per Slots`}
      </p>
    </div>
  )
}
