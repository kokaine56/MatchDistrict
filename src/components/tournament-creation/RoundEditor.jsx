import { motion } from 'framer-motion'

export default function RoundEditor({ round, index, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="bg-surface-container/60 border border-slate-200 dark:border-outline-variant/30 p-4 rounded-xl space-y-3"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs text-on-surface-variant mb-1">Round Name</label>
          <input
            type="text"
            value={round.name || ''}
            onChange={(e) => onChange({ ...round, name: e.target.value })}
            placeholder="e.g. Qualifier"
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Date</label>
          <input
            type="date"
            value={round.date || ''}
            onChange={(e) => onChange({ ...round, date: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Time</label>
          <input
            type="time"
            value={round.time || ''}
            onChange={(e) => onChange({ ...round, time: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:border-primary/40"
          />
        </div>
        <div>
          <label className="block text-xs text-on-surface-variant mb-1">Qualified Teams</label>
          <input
            type="number"
            min="0"
            value={round.qualified || ''}
            onChange={(e) => onChange({ ...round, qualified: e.target.value })}
            placeholder="e.g. 16"
            className="w-full px-3 py-2 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant focus:outline-none focus:border-primary/40"
          />
        </div>
      </div>
    </motion.div>
  )
}
