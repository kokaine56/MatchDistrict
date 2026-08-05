import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import GameDropdown from '../GameDropdown'
import { OptimizedInput, OptimizedTextarea } from '../../OptimizedInput'

export default function Step1BasicDetails({ data, onChange, errors, orgName }) {
  const [games, setGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

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
    if (field === 'description' && value.length > 100) {
      value = value.slice(0, 100)
    }
    onChange({ ...data, [field]: value })
  }, [data, onChange])

  const canGenerate = data.title?.trim().length > 0 && data.game?.trim().length > 0

  const handleGenerateDescription = () => {
    if (!canGenerate || isGenerating) return
    setIsGenerating(true)

    const organizer = orgName || 'Match District Host'
    const t = data.title.trim()
    const g = data.game

    const presets = [
      `Welcome to ${t}! Intense ${g} action by ${organizer}. Prove your skills and claim victory.`,
      `${t} is here! ${organizer} brings you premium ${g} competition. Rally your squad and compete!`,
      `${t} — ${g} tournament by ${organizer}. Fight for the top spot. Limited slots, register now!`,
      `The battleground awaits in ${t}. ${organizer} invites all ${g} players to compete.`,
      `${t} — a competitive ${g} tournament with fair play and stacked lobbies. Don't miss out!`,
      `${organizer} presents ${t} — a ${g} showdown. Bring your A-game. Slots fill fast!`
    ]

    const picked = presets[Math.floor(Math.random() * presets.length)]

    setTimeout(() => {
      onChange({ ...data, description: picked })
      setIsGenerating(false)
    }, 400)
  }

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
        <OptimizedInput
          value={data.title || ''}
          onChange={(v) => handleChange('title', v)}
          placeholder="e.g. BGMI Weekend Scrims"
          maxLength={20}
          className={`w-full px-4 py-3 rounded-xl bg-surface-container border ${
            errors?.title ? 'border-error/60' : 'border-slate-200 dark:border-outline-variant/30'
          } text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors`}
        />
        <div className="flex justify-between mt-1">
          {errors?.title && <span className="text-xs text-error">{errors.title}</span>}
          <span className="text-xs text-on-surface-variant ml-auto">{data.title?.length || 0}/20</span>
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
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-sm font-medium text-on-surface-variant">
            Description <span className="text-on-surface-variant/50">(optional, max 100 chars)</span>
          </label>
          <button
            type="button"
            onClick={handleGenerateDescription}
            disabled={!canGenerate || isGenerating}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
              canGenerate && !isGenerating
                ? 'bg-primary text-white shadow-[0_0_12px_rgba(59,130,246,0.4)] hover:brightness-110 cursor-pointer'
                : 'bg-surface-container text-on-surface-variant/30 cursor-not-allowed'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            {isGenerating ? 'Generating...' : 'Auto-Generate'}
          </button>
        </div>
        <OptimizedTextarea
          value={data.description || ''}
          onChange={(v) => handleChange('description', v)}
          placeholder="Rules, tournament info, notes, special instructions..."
          maxLength={100}
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-surface-container border border-slate-200 dark:border-outline-variant/30 text-on-background text-sm placeholder-on-surface-variant focus:outline-none focus:border-primary/40 transition-colors resize-none"
        />
        <div className="flex justify-between mt-1">
          {errors?.description && <span className="text-xs text-error">{errors.description}</span>}
          <span className="text-xs text-on-surface-variant ml-auto">{data.description?.length || 0}/100</span>
        </div>
      </div>
    </motion.div>
  )
}
