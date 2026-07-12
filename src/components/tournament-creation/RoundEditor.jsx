import { motion } from 'framer-motion'
import { OptimizedInput } from '../OptimizedInput'
import { splitTime24, parseTime12h } from '../../utils/timeFormat'

const BGMI_MAPS = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Karakin', 'Nusa', 'Rondo']

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

export default function RoundEditor({ round, index, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast, error, minDate, minTime }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative pl-8"
    >
      {/* Timeline connector */}
      <div className="absolute left-2.5 top-0 bottom-0 w-px bg-outline-variant/20" />
      <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center z-10">
        <span className="text-[10px] font-bold text-primary">{index + 1}</span>
      </div>

      <div className={`bg-surface-container/40 border p-4 rounded-xl space-y-4 transition-colors ${
        error
          ? error.startsWith('Suggestion:')
            ? 'border-amber-500/30'
            : 'border-error/40'
          : 'border-outline-variant/20'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-primary uppercase tracking-wider">Round {index + 1}</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onMoveUp} disabled={isFirst}
              className="p-1.5 rounded-lg hover:bg-surface/50 disabled:opacity-30 text-on-surface-variant transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button type="button" onClick={onMoveDown} disabled={isLast}
              className="p-1.5 rounded-lg hover:bg-surface/50 disabled:opacity-30 text-on-surface-variant transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button type="button" onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
          </div>
        </div>

        {/* Round Name */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
            <span className="text-error mr-1">*</span>Round Name
          </label>
          <OptimizedInput
            value={round.name || ''}
            onChange={(v) => onChange({ ...round, name: v })}
            placeholder="e.g. Qualifier"
            className="w-full p-3 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
        </div>

        {/* Date, Time, Map — stack on mobile, grid on md+ */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Date
            </label>
            <OptimizedInput
              type="date"
              value={round.date || ''}
              onChange={(v) => onChange({ ...round, date: v })}
              min={minDate || ''}
              className="w-full p-3 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Time <span className="text-[10px] font-normal text-on-surface-variant/50">IST</span>
            </label>
            <div className="flex gap-1.5 items-center">
              <select
                value={String(splitTime24(round.time || '').h12)}
                onChange={(e) => {
                  const s = splitTime24(round.time || '')
                  const time24 = parseTime12h(e.target.value, s.m, s.period)
                  onChange({ ...round, time: time24 })
                }}
                className="w-[72px] p-3 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all appearance-none cursor-pointer text-center"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
              <span className="text-on-surface-variant font-bold text-lg">:</span>
              <select
                value={splitTime24(round.time || '').m}
                onChange={(e) => {
                  const s = splitTime24(round.time || '')
                  const time24 = parseTime12h(s.h12, e.target.value, s.period)
                  onChange({ ...round, time: time24 })
                }}
                className="w-[72px] p-3 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all appearance-none cursor-pointer text-center"
              >
                {MINUTES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const s = splitTime24(round.time || '')
                  const newPeriod = s.period === 'AM' ? 'PM' : 'AM'
                  const time24 = parseTime12h(s.h12, s.m, newPeriod)
                  onChange({ ...round, time: time24 })
                }}
                className={`px-3 py-3 rounded-lg text-sm font-bold border transition-all min-w-[56px] ${
                  splitTime24(round.time || '').period === 'AM'
                    ? 'bg-primary/15 border-primary/30 text-primary'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                }`}
              >
                {splitTime24(round.time || '').period}
              </button>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Map
            </label>
            <select
              value={round.map || ''}
              onChange={(e) => onChange({ ...round, map: e.target.value })}
              className="w-full p-3 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all appearance-none cursor-pointer"
            >
              <option value="" disabled>Select map</option>
              {BGMI_MAPS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Teams Advancing */}
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
            <span className="text-error mr-1">*</span>Teams Advancing to Next Round
          </label>
          <OptimizedInput
            type="number"
            min="0"
            value={round.qualified || ''}
            onChange={(v) => onChange({ ...round, qualified: v })}
            placeholder="e.g. 16"
            className="w-full p-3 rounded-lg bg-surface/50 border border-outline-variant/20 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          />
          <p className="text-[11px] text-on-surface-variant/60 mt-1.5 leading-snug">
            Number of top-performing teams advancing into the subsequent round.
          </p>
        </div>

        {/* Error */}
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
      </div>
    </motion.div>
  )
}
