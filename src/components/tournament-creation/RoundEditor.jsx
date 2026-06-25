import { motion } from 'framer-motion'
import { OptimizedInput } from '../OptimizedInput'

const BGMI_MAPS = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Karakin', 'Nusa', 'Rondo']

export default function RoundEditor({ round, index, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast, error }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`bg-surface-container/60 border p-4 rounded-xl space-y-3 transition-colors ${
        error
          ? error.startsWith('Suggestion:')
            ? 'border-amber-500/30 dark:border-amber-500/20'
            : 'border-error/40 dark:border-error/30'
          : 'border-slate-200 dark:border-outline-variant/30'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-primary uppercase tracking-wider">Round {index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 rounded-lg hover:bg-surface/50 disabled:opacity-30 text-on-surface-variant transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 rounded-lg hover:bg-surface/50 disabled:opacity-30 text-on-surface-variant transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs text-on-surface-variant mb-1">
          <span className="text-error mr-1">*</span>Round Name
        </label>
        <OptimizedInput
          value={round.name || ''}
          onChange={(v) => onChange({ ...round, name: v })}
          placeholder="e.g. Qualifier"
          className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">
            <span className="text-error mr-1">*</span>Date
          </label>
          <OptimizedInput
            type="date"
            value={round.date || ''}
            onChange={(v) => onChange({ ...round, date: v })}
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">
            <span className="text-error mr-1">*</span>Time
          </label>
          <OptimizedInput
            type="time"
            value={round.time || ''}
            onChange={(v) => onChange({ ...round, time: v })}
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">
            <span className="text-error mr-1">*</span>Select Map
          </label>
          <select
            value={round.map || ''}
            onChange={(e) => onChange({ ...round, map: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/40 appearance-none cursor-pointer"
          >
            <option value="" disabled>Select map</option>
            {BGMI_MAPS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs text-on-surface-variant mb-1">
          <span className="text-error mr-1">*</span>Teams Advancing to Next Round
        </label>
        <OptimizedInput
          type="number"
          min="0"
          value={round.qualified || ''}
          onChange={(v) => onChange({ ...round, qualified: v })}
          placeholder="e.g. 16"
          className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40"
        />
        <p className="text-[11px] text-on-surface-variant/60 leading-snug mt-1">
          The number of top-performing teams from this round's overall match standings that will advance into the subsequent round.
        </p>
      </div>

      {error && (
        <div className={`flex items-start gap-2 p-2.5 rounded-lg border ${
          error.startsWith('Suggestion:')
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-error/10 border-error/20'
        }`}>
          {error.startsWith('Suggestion:') ? (
            <svg className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          ) : (
            <svg className="w-4 h-4 text-error shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          )}
          <p className={`text-[11px] font-medium leading-snug ${
            error.startsWith('Suggestion:') ? 'text-amber-300' : 'text-error'
          }`}>{error}</p>
        </div>
      )}
    </motion.div>
  )
}
