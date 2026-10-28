import { useCallback } from 'react'
import { OptimizedInput } from '../OptimizedInput'

function generateOrdinal(n) {
  const suffix = ['th', 'st', 'nd', 'rd']
  const value = n % 100
  return `${n}${suffix[(value - 20) % 10] || suffix[value] || suffix[0]}`
}

export default function PrizeDistributionEditor({ positions = [], onChange }) {
  const addPosition = useCallback(() => {
    const count = positions.length + 1
    onChange([...positions, {
      id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: generateOrdinal(count),
      amount: '',
    }])
  }, [positions, onChange])

  const removePosition = useCallback((id) => {
    onChange(positions.filter((position) => position.id !== id))
  }, [positions, onChange])

  const updatePosition = useCallback((id, key, value) => {
    onChange(positions.map((position) => position.id === id ? { ...position, [key]: value } : position))
  }, [positions, onChange])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-on-background">Prize Distribution</h3>
        <button type="button" onClick={addPosition} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors">
          + Add Position
        </button>
      </div>
      <p className="text-xs text-on-surface-variant">Enter the prize amount for each position in INR.</p>

      {positions.length === 0 ? (
        <p className="py-5 text-center text-xs text-on-surface-variant">No positions yet. Click “+ Add Position” to start.</p>
      ) : positions.map((position, index) => (
        <div key={position.id} className="flex items-center gap-2">
          <OptimizedInput
            value={position.name || ''}
            onChange={(value) => updatePosition(position.id, 'name', value)}
            aria-label={`Position ${index + 1} name`}
            placeholder={`${generateOrdinal(index + 1)} place`}
            className="w-28 px-2 py-1.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
          />
          <div className="relative flex-1 max-w-52">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-sm">₹</span>
            <OptimizedInput
              type="number"
              min="0"
              step="1"
              value={position.amount ?? ''}
              onChange={(value) => updatePosition(position.id, 'amount', value)}
              aria-label={`${position.name || generateOrdinal(index + 1)} prize amount`}
              placeholder="Amount"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-sm text-on-background focus:outline-none focus:border-primary/40"
            />
          </div>
          <button type="button" onClick={() => removePosition(position.id)} aria-label={`Remove ${position.name || 'position'}`} className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      ))}
    </div>
  )
}
