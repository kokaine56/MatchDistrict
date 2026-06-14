import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import GameDropdown from '../GameDropdown'

export default function Step1BasicDetails({ data, onChange, errors }) {
  const [games, setGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/games')
      .then((r) => r.json())
      .then((res) => { if (!cancelled && res.success) setGames(res.games) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setGamesLoading(false) })
    return () => { cancelled = true }
  }, [])

  const handleChange = useCallback((field, value) => {
    onChange({ ...data, [field]: value })
  }, [data, onChange])

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      <div>
        <h2 className="text-xl font-bold text-on-background">Basic Details</h2>
        <p className="text-sm text-on-surface-variant mt-1">Set the foundation for your tournament.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
          Tournament Title <span className="text-error">*</span>
        </label>
        <input
          type="text"
          value={data.title || ''}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="e.g. BGMI Weekend Scrims"
          maxLength={100}
          className={`w-full px-4 py-3 rounded-xl bg-surface-container border ${
            errors?.title ? 'border-error/60' : 'border-slate-200 dark:border-outline-variant/30'
          } text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors`}
        />
        <div className="flex justify-between mt-1">
          {errors?.title && <span className="text-xs text-error">{errors.title}</span>}
          <span className="text-xs text-on-surface-variant ml-auto">{data.title?.length || 0}/100</span>
        </div>
      </div>

      <GameDropdown
        value={data.game || ''}
        onChange={(v) => handleChange('game', v)}
        games={games}
        loading={gamesLoading}
      />
      {errors?.game && <p className="text-xs text-error -mt-4">{errors.game}</p>}

      <div>
        <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
          Description <span className="text-on-surface-variant/50">(optional)</span>
        </label>
        <textarea
          value={data.description || ''}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Rules, tournament info, notes, special instructions..."
          rows={5}
          className="w-full px-4 py-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors resize-none"
        />
      </div>
    </motion.div>
  )
}
