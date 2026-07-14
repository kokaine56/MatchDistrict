import { useMemo, useCallback } from 'react'
import { OptimizedInput } from '../OptimizedInput'

function generateOrdinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function generateSmartPercentages(count) {
  if (count <= 0) return []
  if (count === 1) return [100]
  if (count === 2) return [70, 30]
  if (count === 3) return [50, 30, 20]
  if (count === 4) return [45, 25, 18, 12]
  if (count === 5) return [40, 25, 15, 10, 10]
  if (count === 6) return [35, 22, 15, 12, 9, 7]
  if (count === 7) return [30, 20, 15, 12, 10, 7, 6]
  if (count === 8) return [28, 18, 14, 12, 10, 8, 5, 5]
  if (count === 9) return [25, 17, 13, 11, 9, 8, 7, 5, 5]
  const result = []
  const lastFew = 4
  const tailTotal = lastFew * 3
  let allocated = 0
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      result.push(25)
      allocated = 25
    } else if (i >= count - lastFew) {
      result.push(3)
      allocated += 3
    } else {
      const remainingCount = count - i - lastFew
      const pool = 100 - allocated - tailTotal
      const share = Math.floor((pool / remainingCount) * 10) / 10
      result.push(share)
      allocated += share
    }
  }
  const sum = Math.round(result.reduce((a, b) => a + b, 0))
  if (sum !== 100 && result.length > 0) {
    result[0] += (100 - sum)
  }
  return result
}

export default function PrizeDistributionEditor({ positions = [], onChange, availablePlacementPool = 0 }) {
  const totalPercentage = useMemo(() => {
    const raw = positions.reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0)
    return Number(raw.toFixed(2))
  }, [positions])

  const isValid = totalPercentage <= 100
  const isExact = Math.abs(totalPercentage - 100) < 0.01
  const remaining = Math.max(0, Number((100 - totalPercentage).toFixed(2)))

  const addPosition = useCallback(() => {
    const count = positions.length + 1
    const pcts = generateSmartPercentages(count)
    const newPositions = positions.map((p, i) => ({
      ...p,
      name: generateOrdinal(i + 1),
      percentage: String(Math.round(pcts[i] * 10) / 10),
    }))
    newPositions.push({
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: generateOrdinal(count),
      percentage: String(Math.round(pcts[count - 1] * 10) / 10),
    })
    onChange(newPositions)
  }, [positions, onChange])

  const removePosition = useCallback((id) => {
    const filtered = positions.filter((p) => p.id !== id)
    const pcts = generateSmartPercentages(filtered.length)
    const renamed = filtered.map((p, i) => ({
      ...p,
      name: generateOrdinal(i + 1),
      percentage: String(Math.round(pcts[i] * 10) / 10),
    }))
    onChange(renamed)
  }, [positions, onChange])

  const handleSmartRoundup = useCallback(() => {
    if (positions.length < 2 || availablePlacementPool <= 0) return
    const totalAvailable = availablePlacementPool
    let remaining = totalAvailable
    let percentageSumOthers = 0
    const updated = positions.map((p, i) => ({ ...p, amount: 0, percentage: 0 }))
    for (let i = updated.length - 1; i > 0; i--) {
      const exact = (parseFloat(positions[i].percentage || 0) / 100) * totalAvailable
      const rounded = Math.round(exact / 10) * 10
      const newPct = Number(((rounded / totalAvailable) * 100).toFixed(2))
      updated[i].amount = rounded
      updated[i].percentage = newPct
      percentageSumOthers += newPct
      remaining -= rounded
    }
    if (updated.length > 0) {
      updated[0].amount = remaining
      updated[0].percentage = Number((100 - percentageSumOthers).toFixed(2))
    }
    onChange(updated.map(p => ({ ...p, percentage: String(p.percentage) })))
  }, [positions, onChange, availablePlacementPool])

  const updatePercentage = useCallback((id, value) => {
    const parsedValue = parseFloat(value) || 0
    const otherSum = positions
      .filter(p => p.id !== id)
      .reduce((sum, p) => sum + (parseFloat(p.percentage) || 0), 0)
    const maxAvailable = Math.max(0, 100 - otherSum)
    const clampedValue = Math.min(parsedValue, maxAvailable)
    onChange(positions.map((p) => (p.id === id ? { ...p, percentage: String(clampedValue) } : p)))
  }, [positions, onChange])

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h3 className="text-sm font-semibold text-on-background">Prize Distribution</h3>
        <div className="flex items-center gap-2">
          {positions.length > 1 && (
            <button
              type="button"
              onClick={handleSmartRoundup}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition-colors"
            >
              Roundup
            </button>
          )}
          <button
            type="button"
            onClick={addPosition}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors"
          >
            + Add Position
          </button>
        </div>
      </div>
      <p className="text-xs text-on-surface-variant">
        Positions auto-name and auto-allocate. Edit percentages manually anytime.
      </p>

      {positions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
          <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m0 0V6c0-.621-.504-1.125-1.125-1.125H3.75M6 6h.008v.008H6V6z" />
          </svg>
          <p className="text-xs">No positions yet. Click "+ Add Position" to start.</p>
        </div>
      )}

      {positions.map((pos) => {
        const percentage = parseFloat(pos.percentage) || 0
        const amount = Math.round((percentage / 100) * availablePlacementPool)

        return (
          <div key={pos.id} className="flex flex-wrap items-center gap-2 w-full">
            {/* 1. Placement Label */}
            <span className="w-6 text-sm font-medium text-on-background shrink-0">{pos.name}</span>

            {/* 2. Progress Bar — hidden on mobile */}
            <div className="hidden sm:flex flex-1 h-2 bg-surface-container-highest rounded-full overflow-hidden max-w-[160px]">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, percentage)}%` }}
              />
            </div>

            {/* 3. Percentage Input */}
            <div className="relative flex items-center flex-1 sm:flex-none min-w-0 max-w-[100px]">
              <OptimizedInput
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={pos.percentage}
                onChange={(v) => updatePercentage(pos.id, v)}
                className="w-full sm:w-20 px-2 py-1.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background text-center focus:outline-none focus:border-primary/40"
              />
              <span className="absolute text-xs text-on-surface-variant right-2 pointer-events-none">%</span>
            </div>

            {/* 4. Currency Amount & Remove */}
            <div className="flex items-center justify-end gap-1.5 ml-auto sm:ml-0">
              <span className="text-xs sm:text-sm font-medium text-on-surface-variant whitespace-nowrap">₹{amount.toLocaleString('en-IN')}</span>
              <button
                type="button"
                onClick={() => removePosition(pos.id)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        )
      })}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-sm font-medium">Total:</span>
        <span className={`text-sm font-bold ${isExact ? 'text-tertiary' : totalPercentage > 100 ? 'text-error' : 'text-on-surface-variant'}`}>
          {totalPercentage}%
        </span>
        {isExact && <span className="text-xs text-tertiary">✓ Fully Allocated</span>}
        {totalPercentage > 100 && <span className="text-xs text-error">Exceeds 100%</span>}
      </div>

      {positions.length > 0 && (
        <div className="text-xs">
          {isExact ? (
            <span className="text-tertiary font-medium">Ready to proceed</span>
          ) : totalPercentage > 100 ? (
            <span className="text-error font-medium">Reduce total to 100%</span>
          ) : (
            <span className="text-on-surface-variant">Remaining to allocate: <strong>{remaining}%</strong></span>
          )}
        </div>
      )}
    </div>
  )
}
