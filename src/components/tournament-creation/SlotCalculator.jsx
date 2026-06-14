export default function SlotCalculator({ total, reserved }) {
  const totalNum = parseInt(total) || 0
  const reservedNum = parseInt(reserved) || 0
  const available = Math.max(0, totalNum - reservedNum)

  return (
    <div className="bg-surface-container border border-slate-200 dark:border-outline-variant/20 p-4 rounded-xl space-y-3">
      <h3 className="text-sm font-semibold text-on-background">Slot Breakdown</h3>
      <div className="flex items-center justify-between text-sm">
        <span className="text-on-surface-variant">Total Slots</span>
        <span className="text-on-background font-bold">{totalNum}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-on-surface-variant">Reserved Slots</span>
        <span className="text-warning font-medium">{reservedNum}</span>
      </div>
      <div className="border-t border-outline-variant/20 pt-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-on-background">Available Public Slots</span>
        <span className="text-lg font-bold text-tertiary">{available}</span>
      </div>
      <div className="h-2 bg-surface-container-highest rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-300"
          style={{ width: totalNum > 0 ? `${((totalNum - available) / totalNum) * 100}%` : '0%' }}
        />
      </div>
    </div>
  )
}
