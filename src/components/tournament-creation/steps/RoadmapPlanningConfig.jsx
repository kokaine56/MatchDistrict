import { useCallback, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, CheckCircle2, AlertCircle, Users, Home, Clock } from 'lucide-react'
import { buildPlanningConfigPayload, DEFAULT_ROADMAP_PLANNING, deriveTournamentPlanningConfig, requiredRoomCount } from '../planningConfigModel'

function validate(config) {
  const errors = {}
  for (const [key, label, allowZero] of [
    ['teams_per_group', 'Teams per group', false],
    ['max_simultaneous_rooms', 'Simultaneous rooms', false],
    ['matches_per_team', 'Matches per team', false],
    ['match_duration_minutes', 'Match duration', false],
    ['break_between_matches_minutes', 'Break between matches', true],
  ]) {
    const value = Number(config[key])
    if (config[key] === '' || !Number.isInteger(value) || (allowZero ? value < 0 : value < 1)) {
      errors[key] = `${label} must be ${allowZero ? '0 or greater' : 'a positive whole number'}.`
    }
  }
  const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/
  for (const [key, label] of [['daily_start_time', 'Daily start'], ['daily_end_time', 'Daily end']]) {
    if (!timePattern.test(config[key] || '')) errors[key] = `${label} must be a valid time.`
  }
  if (!errors.daily_start_time && !errors.daily_end_time && config.daily_end_time <= config.daily_start_time) {
    errors.daily_end_time = 'Daily end must be later than daily start.'
  }
  if (config.max_matches_per_day !== '' && (!Number.isInteger(Number(config.max_matches_per_day)) || Number(config.max_matches_per_day) < 1)) {
    errors.max_matches_per_day = 'Maximum matches per day must be a positive whole number.'
  }
  return errors
}

function Field({ label, error, children }) {
  return <label className="block text-sm font-medium text-on-surface-variant">{label}{children}{error && <span className="mt-1 block text-xs text-error">{error}</span>}</label>
}

function NumberField({ label, value, onChange, error, min = 1 }) {
  return <Field label={label} error={error}><input type="number" min={min} step="1" value={value ?? ''} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full rounded-xl border bg-surface-container px-3 py-2.5 text-sm text-on-background outline-none focus:border-primary ${error ? 'border-error' : 'border-outline-variant/30'}`} /></Field>
}

function TimeField({ label, value, onChange, error }) {
  return <Field label={label} error={error}><input type="time" value={value || ''} onChange={(event) => onChange(event.target.value)} className={`mt-1 w-full rounded-xl border bg-surface-container px-3 py-2.5 text-sm text-on-background outline-none focus:border-primary ${error ? 'border-error' : 'border-outline-variant/30'}`} /></Field>
}

export default function RoadmapPlanningConfig({ data, onChange, onSavePlanningConfig, planningConfigStatus }) {
  const savedConfig = data?.planningConfig
  const [overrides, setOverrides] = useState({})
  const config = useMemo(() => ({
    ...DEFAULT_ROADMAP_PLANNING,
    ...savedConfig,
    teams_per_group: savedConfig?.teams_per_group ?? savedConfig?.teams_per_room ?? DEFAULT_ROADMAP_PLANNING.teams_per_group,
    ...overrides,
  }), [savedConfig, overrides])
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saveError, setSaveError] = useState('')

  const capacity = Number.parseInt(data?.slotsTotal, 10)
  const players = deriveTournamentPlanningConfig(data).players_per_team
  const teamsPerGroup = config.teams_per_group
  const groups = useMemo(() => requiredRoomCount(capacity, teamsPerGroup), [capacity, teamsPerGroup])
  const windows = groups ? Math.ceil(groups / (Number(config.max_simultaneous_rooms) || 1)) : null
  const format = `${(data?.match_type || 'squad').toUpperCase()} · ${(data?.perspective || 'tpp').toUpperCase()}`

  const set = useCallback((key) => (value) => {
    const next = { ...config, [key]: value }
    setOverrides(next)
    onChange?.({ ...data, planningConfig: next })
    setErrors((previous) => ({ ...previous, [key]: undefined }))
    setSaved(false)
    setDirty(true)
  }, [config, data, onChange])

  const save = useCallback(async () => {
    const nextConfig = buildPlanningConfigPayload(data, config)
    const nextErrors = validate(nextConfig)
    if (!capacity) nextErrors.teams_per_group = 'Set tournament capacity in Slots & Entry first.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return
    setSaving(true)
    setSaveError('')
    try {
      const result = await onSavePlanningConfig(nextConfig)
      if (!result?.success) {
        setSaveError(result?.message || 'Could not save roadmap planning settings.')
        if (result?.errors) setErrors((previous) => ({ ...previous, ...result.errors }))
        return
      }
      setSaved(true)
      setDirty(false)
      onChange?.({ ...data, planningConfig: result.config || nextConfig })
    } catch {
      setSaveError('Network error. Try saving the roadmap plan again.')
    } finally {
      setSaving(false)
    }
  }, [capacity, config, data, onChange, onSavePlanningConfig])

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 rounded-2xl border border-outline-variant/25 bg-surface-container/45 p-4 sm:p-6">
      <header className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></span>
        <div><h3 className="text-base font-bold text-on-background">Roadmap planning</h3><p className="mt-1 text-sm text-on-surface-variant">Set the competitive group size and operating window used to generate the tournament schedule.</p></div>
      </header>

      <div className="grid grid-cols-1 gap-2 rounded-xl border border-outline-variant/20 bg-surface/50 p-3 sm:grid-cols-3">
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><span className="text-xs text-on-surface-variant">Capacity</span><strong className="ml-auto text-sm text-on-background">{capacity > 0 ? `${capacity} teams` : 'Set in Slots & Entry'}</strong></div>
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><span className="text-xs text-on-surface-variant">Format</span><strong className="ml-auto text-sm text-on-background">{format}</strong></div>
        <div className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /><span className="text-xs text-on-surface-variant">Players / team</span><strong className="ml-auto text-sm text-on-background">{players}</strong></div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-outline-variant/20 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-background"><Home className="h-4 w-4 text-primary" />Groups & matches</div>
          <NumberField label="Teams per group" value={teamsPerGroup} onChange={set('teams_per_group')} error={errors.teams_per_group} />
          <NumberField label="Groups running simultaneously" value={config.max_simultaneous_rooms} onChange={set('max_simultaneous_rooms')} error={errors.max_simultaneous_rooms} />
          <NumberField label="Matches per group" value={config.matches_per_team} onChange={set('matches_per_team')} error={errors.matches_per_team} />
          <NumberField label="Match duration (minutes)" value={config.match_duration_minutes} onChange={set('match_duration_minutes')} error={errors.match_duration_minutes} />
          <NumberField label="Break between matches (minutes)" value={config.break_between_matches_minutes} onChange={set('break_between_matches_minutes')} min={0} error={errors.break_between_matches_minutes} />
        </div>
        <div className="space-y-4 rounded-xl border border-outline-variant/20 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-on-background"><Clock className="h-4 w-4 text-primary" />Daily operating window</div>
          <TimeField label="Daily start" value={config.daily_start_time} onChange={set('daily_start_time')} error={errors.daily_start_time} />
          <TimeField label="Daily end" value={config.daily_end_time} onChange={set('daily_end_time')} error={errors.daily_end_time} />
          <NumberField label="Maximum matches per day (optional)" value={config.max_matches_per_day} onChange={set('max_matches_per_day')} min={1} error={errors.max_matches_per_day} />
          <div className="rounded-xl bg-primary/5 p-3 text-sm text-on-surface-variant">
            {groups ? <><strong className="text-on-background">{groups} competitive groups</strong> across <strong className="text-on-background">{windows} scheduling window{windows === 1 ? '' : 's'}</strong> at the current capacity. Each match receives its own BGMI room.</> : 'Group count is calculated from tournament capacity and teams per group.'}
          </div>
        </div>
      </div>

      {saveError && <div role="alert" className="flex items-start gap-2 rounded-lg bg-error/10 px-3 py-2 text-sm text-error"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{saveError}</div>}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/15 pt-4">
        <span className="text-xs text-on-surface-variant">{saved || (!dirty && planningConfigStatus === 'configured') ? 'Roadmap planning saved.' : 'Save these settings so the roadmap generator can use them.'}</span>
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50">
          {saving ? 'Saving…' : saved || (!dirty && planningConfigStatus === 'configured') ? <><CheckCircle2 className="h-4 w-4" />Save roadmap plan</> : 'Save roadmap plan'}
        </button>
      </footer>
    </motion.section>
  )
}
