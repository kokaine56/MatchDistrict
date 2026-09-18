import { motion } from 'framer-motion'
import { OptimizedInput } from '../OptimizedInput'
import { useTheme } from '../../ThemeContext'
import { formatRevealLabel } from '../../utils/roomReveal'

const BGMI_MAPS = ['Erangel', 'Miramar', 'Sanhok', 'Vikendi', 'Karakin', 'Nusa', 'Rondo']

export default function RoundEditor({ round, index, onChange, onDelete, onMoveUp, onMoveDown, isFirst, isLast, error, minDate, minTime }) {
  const timeValue = round.time || ''
  const { theme } = useTheme()
  const colorScheme = theme === 'dark' ? 'dark' : 'light'

  const handleTimeChange = (e) => {
    onChange({ ...round, time: e.target.value })
  }

  const handleDateChange = (e) => {
    onChange({ ...round, date: e.target.value })
  }

  const autoPreview = round.date && round.time ? formatRevealLabel(round) : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="relative pl-8 sm:pl-10"
    >
      {/* Timeline connector */}
      <div className="absolute left-2.5 sm:left-3 top-0 bottom-0 w-px bg-primary/15" />
      <div className="absolute left-0 top-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-gradient-to-br from-primary/25 to-primary/10 flex items-center justify-center z-10 shadow-[0_0_12px_rgba(59,130,246,0.2)]">
        <span className="text-[9px] sm:text-[10px] font-bold text-primary">{index + 1}</span>
      </div>

      <div className={`bg-surface-container/40 p-3 sm:p-4 rounded-xl space-y-3 sm:space-y-4 shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)] transition-all ${
        error
          ? error.startsWith('Suggestion:')
            ? 'ring-1 ring-amber-500/30'
            : 'ring-1 ring-error/40'
          : ''
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-primary tracking-wide">Round {index + 1}</span>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onMoveUp} disabled={isFirst}
              className="p-1.5 rounded-lg hover:bg-surface/60 disabled:opacity-25 text-on-surface-variant transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
            </button>
            <button type="button" onClick={onMoveDown} disabled={isLast}
              className="p-1.5 rounded-lg hover:bg-surface/60 disabled:opacity-25 text-on-surface-variant transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            <button type="button" onClick={onDelete}
              className="p-1.5 rounded-lg hover:bg-error/10 text-on-surface-variant hover:text-error transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
            className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner"
          />
        </div>

        {/* Date + Time row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Date
            </label>
            <input
              type="date"
              value={round.date || ''}
              onChange={handleDateChange}
              min={minDate || ''}
              style={{ colorScheme }}
              className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Time <span className="text-[10px] font-normal text-on-surface-variant/50">IST</span>
            </label>
            <input
              type="time"
              value={timeValue}
              onChange={handleTimeChange}
              min={minTime || ''}
              style={{ colorScheme }}
              className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner"
            />
          </div>
        </div>

        {/* Map + Teams row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Map
            </label>
            <select
              value={round.map || ''}
              onChange={(e) => onChange({ ...round, map: e.target.value })}
              className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all cursor-pointer shadow-inner"
            >
              <option value="" disabled>Select map</option>
              {BGMI_MAPS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              <span className="text-error mr-1">*</span>Teams Advancing
            </label>
            <OptimizedInput
              type="number"
              min="0"
              value={round.qualified || ''}
              onChange={(v) => onChange({ ...round, qualified: v })}
              placeholder="e.g. 16"
              className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner"
            />
            <p className="text-[10px] text-on-surface-variant/50 mt-1.5 flex items-center gap-1">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Teams that qualify here move on to the next round
            </p>
          </div>
        </div>

        {/* ID-Pass */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <svg className="w-3.5 h-3.5 text-primary shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs font-semibold text-on-surface-variant">ID-Pass <span className="font-normal text-on-surface-variant/50">(optional)</span></span>
          </div>
          <p className="text-[10px] text-on-surface-variant/60 mb-2.5 flex items-center gap-1">
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Room credentials are revealed automatically 15 minutes before the match.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Room ID</label>
              <OptimizedInput
                value={round.room_id || ''}
                onChange={(v) => onChange({ ...round, room_id: v })}
                placeholder="e.g. 123456789"
                maxLength={80}
                className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">Room Password</label>
              <OptimizedInput
                value={round.room_password || ''}
                onChange={(v) => onChange({ ...round, room_password: v })}
                placeholder="e.g. MD2026"
                maxLength={80}
                className="w-full px-3 py-2.5 rounded-xl bg-surface/80 text-sm text-on-background placeholder-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all shadow-inner"
              />
            </div>
          </div>
          <div className={`flex items-center gap-1.5 mt-2.5 text-[10px] font-medium ${
            autoPreview ? 'text-primary/90' : 'text-on-surface-variant/50'
          }`}>
            <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            </svg>
            {autoPreview
              ? `ID-Pass available at ${autoPreview}`
              : 'Set the match date & time to preview the unlock time'}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className={`flex items-start gap-2 p-2.5 rounded-lg ${
            error.startsWith('Suggestion:')
              ? 'bg-amber-500/10'
              : 'bg-error/10'
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
