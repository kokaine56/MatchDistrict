import { useState, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Users, Home, Swords, Clock, CalendarDays,
  Info, CheckCircle2, AlertCircle, ChevronDown, ChevronUp
} from "lucide-react"

function validatePlanningConfig(d) {
  const errs = {}
  const posInt = (v, label, allowZero = false) => {
    const n = Number(v)
    if (v === "" || v === null || v === undefined) return `${label} is required.`
    if (!Number.isFinite(n) || Math.floor(n) !== n) return `${label} must be a whole number.`
    if (!allowZero && n <= 0) return `${label} must be greater than 0.`
    if (allowZero && n < 0) return `${label} must be 0 or greater.`
    return null
  }
  const numFields = [
    ["expected_teams", d.expected_teams, "Expected teams", false],
    ["maximum_teams", d.maximum_teams, "Maximum teams", false],
    ["players_per_team", d.players_per_team, "Players per team", false],
    ["teams_per_room", d.teams_per_room, "Teams per room", false],
    ["max_simultaneous_rooms", d.max_simultaneous_rooms, "Maximum simultaneous rooms", false],
    ["matches_per_team", d.matches_per_team, "Matches per team", false],
    ["match_duration_minutes", d.match_duration_minutes, "Match duration", false],
    ["break_between_matches_minutes", d.break_between_matches_minutes, "Break between matches", true],
  ]
  for (const [k, v, label, allowZero] of numFields) {
    const e = posInt(v, label, allowZero)
    if (e) errs[k] = e
  }
  if (!errs.expected_teams && !errs.maximum_teams) {
    if (Number(d.maximum_teams) < Number(d.expected_teams)) {
      errs.maximum_teams = "Maximum teams cannot be lower than expected teams."
    }
  }
  const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!d.daily_start_time || !timeRe.test(d.daily_start_time)) errs.daily_start_time = "Valid start time required (HH:MM)."
  if (!d.daily_end_time || !timeRe.test(d.daily_end_time)) errs.daily_end_time = "Valid end time required (HH:MM)."
  if (!errs.daily_start_time && !errs.daily_end_time) {
    const toMins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m }
    if (toMins(d.daily_end_time) <= toMins(d.daily_start_time)) errs.daily_end_time = "Daily end time must be later than the start time."
  }
  if (d.max_matches_per_day !== "" && d.max_matches_per_day !== null && d.max_matches_per_day !== undefined) {
    const n = Number(d.max_matches_per_day)
    if (!Number.isFinite(n) || Math.floor(n) !== n || n <= 0) errs.max_matches_per_day = "Max matches per day must be a positive integer if provided."
  }
  return errs
}

function SectionHeader({ icon: Icon, title, subtitle, open, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 text-left group">
      <span className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="w-4 h-4" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-on-background leading-tight">{title}</span>
        <span className="block text-xs text-on-surface-variant mt-0.5 leading-snug">{subtitle}</span>
      </span>
      <span className="flex-shrink-0 text-on-surface-variant group-hover:text-primary transition-colors">
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </span>
    </button>
  )
}

function Field({ label, hint, error, children, fullWidth = false }) {
  return (
    <div className={fullWidth ? "col-span-1 sm:col-span-2" : ""}>
      <label className="block text-sm font-medium text-on-surface-variant mb-1">{label}</label>
      {children}
      {hint && !error && (
        <p className="mt-1 text-xs text-on-surface-variant/70 flex items-start gap-1">
          <Info className="w-3 h-3 flex-shrink-0 mt-0.5" />{hint}
        </p>
      )}
      {error && (
        <p className="mt-1 text-xs text-error flex items-start gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />{error}
        </p>
      )}
    </div>
  )
}

function NumInput({ value, onChange, error, placeholder, min = "0" }) {
  return (
    <input type="number" min={min} step="1" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full px-4 py-2.5 rounded-xl text-sm transition-colors outline-none bg-surface-container border ${error ? "border-error/60 focus:border-error" : "border-slate-200 dark:border-outline-variant/30 focus:border-primary/60"} text-on-background placeholder-on-surface-variant/50`}
    />
  )
}

function TimeInput({ value, onChange, error }) {
  return (
    <input type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
      className={`w-full px-4 py-2.5 rounded-xl text-sm transition-colors outline-none bg-surface-container border ${error ? "border-error/60 focus:border-error" : "border-slate-200 dark:border-outline-variant/30 focus:border-primary/60"} text-on-background`}
    />
  )
}

function SummaryRow({ label, value, muted = false }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-outline-variant/10 last:border-0">
      <span className="text-sm text-on-surface-variant">{label}</span>
      <span className={`text-sm font-semibold ${muted ? "text-on-surface-variant/60" : "text-on-background"}`}>{value}</span>
    </div>
  )
}

function fmt12(t) {
  if (!t) return "-"
  const [h, m] = t.split(":").map(Number)
  const period = h >= 12 ? "PM" : "AM"
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, "0")} ${period}`
}

const EMPTY_PLAN = {
  expected_teams: "", maximum_teams: "", players_per_team: "4",
  teams_per_room: "25", max_simultaneous_rooms: "", matches_per_team: "3",
  match_duration_minutes: "25", break_between_matches_minutes: "5",
  daily_start_time: "10:00", daily_end_time: "22:00", max_matches_per_day: "",
}

export default function Step10PlanningConfig({ data, onChange, tournamentId, onSavePlanningConfig, planningConfigStatus }) {
  const [localData, setLocalData] = useState(() => ({ ...EMPTY_PLAN, ...(data?.planningConfig || {}) }))
  const [localErrors, setLocalErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [open, setOpen] = useState({ team: true, room: true, match: true, schedule: true, summary: false })
  const toggle = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }))

  useEffect(() => { if (data?.planningConfig) setLocalData((prev) => ({ ...prev, ...data.planningConfig })) }, []) // eslint-disable-line

  const set = useCallback((field) => (value) => {
    setLocalData((prev) => { const next = { ...prev, [field]: value }; onChange({ ...data, planningConfig: next }); return next })
    setLocalErrors((prev) => ({ ...prev, [field]: undefined }))
    setSaved(false)
  }, [data, onChange])

  const handleSave = useCallback(async () => {
    const errs = validatePlanningConfig(localData)
    setLocalErrors(errs)
    if (Object.keys(errs).length > 0) {
      if (errs.expected_teams || errs.maximum_teams || errs.players_per_team) setOpen(p => ({ ...p, team: true }))
      if (errs.teams_per_room || errs.max_simultaneous_rooms) setOpen(p => ({ ...p, room: true }))
      if (errs.matches_per_team || errs.match_duration_minutes || errs.break_between_matches_minutes) setOpen(p => ({ ...p, match: true }))
      if (errs.daily_start_time || errs.daily_end_time || errs.max_matches_per_day) setOpen(p => ({ ...p, schedule: true }))
      return
    }
    setSaving(true); setSaveError(null)
    try {
      const result = await onSavePlanningConfig(localData)
      if (result?.success) { setSaved(true); setOpen(p => ({ ...p, summary: true })); setTimeout(() => setSaved(false), 4000) }
      else { setSaveError(result?.message || "Failed to save configuration."); if (result?.errors) setLocalErrors(result.errors) }
    } catch { setSaveError("Network error. Please try again.") }
    finally { setSaving(false) }
  }, [localData, onSavePlanningConfig])

  const e = (k) => localErrors[k]
  const sectionCls = "bg-surface-container/50 border border-slate-200 dark:border-outline-variant/25 rounded-2xl overflow-hidden"
  const bodyInner = "px-4 pb-4 pt-1 border-t border-slate-100 dark:border-outline-variant/10"
  const gridCls = "grid grid-cols-1 sm:grid-cols-2 gap-4"
  const motionProps = { initial: { height: 0, opacity: 0 }, animate: { height: "auto", opacity: 1 }, exit: { height: 0, opacity: 0 }, transition: { duration: 0.2 }, className: "overflow-hidden" }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-5">
      <div>
        <h2 className="text-xl font-bold text-on-background flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-primary" />
          Tournament Planning Configuration
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">
          Define the operational parameters. The Roadmap Generator will use these values in Phase 2 to automatically calculate rooms, groups, days, and match schedules.
        </p>
      </div>

      {/* Section 1: Team Structure */}
      <div className={sectionCls}>
        <div className="p-4"><SectionHeader icon={Users} title="Team Structure" subtitle="How many teams, and how large are they?" open={open.team} onToggle={() => toggle("team")} /></div>
        <AnimatePresence initial={false}>
          {open.team && (
            <motion.div {...motionProps}>
              <div className={`${bodyInner} space-y-4`}>
                <div className={gridCls}>
                  <Field label="Expected Teams" hint="Estimated number of teams expected to participate." error={e("expected_teams")}>
                    <NumInput value={localData.expected_teams} onChange={set("expected_teams")} error={e("expected_teams")} placeholder="e.g. 180" min="1" />
                  </Field>
                  <Field label="Maximum Teams" hint="Maximum number of teams this tournament can accept." error={e("maximum_teams")}>
                    <NumInput value={localData.maximum_teams} onChange={set("maximum_teams")} error={e("maximum_teams")} placeholder="e.g. 200" min="1" />
                  </Field>
                  <Field label="Players Per Team" hint="Number of players required in each team (e.g. 4 for BGMI squad)." error={e("players_per_team")}>
                    <NumInput value={localData.players_per_team} onChange={set("players_per_team")} error={e("players_per_team")} placeholder="e.g. 4" min="1" />
                  </Field>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Section 2: Room Capacity */}
      <div className={sectionCls}>
        <div className="p-4"><SectionHeader icon={Home} title="Room Capacity" subtitle="How many teams per room, and how many rooms can run at once?" open={open.room} onToggle={() => toggle("room")} /></div>
        <AnimatePresence initial={false}>
          {open.room && (
            <motion.div {...motionProps}>
              <div className={`${bodyInner} space-y-4`}>
                <div className={gridCls}>
                  <Field label="Teams Per Room" hint="Maximum teams that can play in one room. Phase 2 calculates total rooms needed." error={e("teams_per_room")}>
                    <NumInput value={localData.teams_per_room} onChange={set("teams_per_room")} error={e("teams_per_room")} placeholder="e.g. 25" min="1" />
                  </Field>
                  <Field label="Maximum Simultaneous Rooms" hint="Maximum rooms you want running at the same time. This is a concurrency limit, not total rooms." error={e("max_simultaneous_rooms")}>
                    <NumInput value={localData.max_simultaneous_rooms} onChange={set("max_simultaneous_rooms")} error={e("max_simultaneous_rooms")} placeholder="e.g. 10" min="1" />
                  </Field>
                </div>
                <div className="bg-primary/5 border border-primary/15 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-primary/80 leading-relaxed"><strong className="font-semibold">Note:</strong> Total rooms required will be calculated automatically in Phase 2. Max simultaneous rooms is a concurrency control, not the total room count.</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Section 3: Match Structure */}
      <div className={sectionCls}>
        <div className="p-4"><SectionHeader icon={Swords} title="Match Structure" subtitle="Matches per team, duration, and break times." open={open.match} onToggle={() => toggle("match")} /></div>
        <AnimatePresence initial={false}>
          {open.match && (
            <motion.div {...motionProps}>
              <div className={`${bodyInner} space-y-4`}>
                <div className={gridCls}>
                  <Field label="Matches Per Team" hint="Number of matches each team is scheduled to play." error={e("matches_per_team")}>
                    <NumInput value={localData.matches_per_team} onChange={set("matches_per_team")} error={e("matches_per_team")} placeholder="e.g. 3" min="1" />
                  </Field>
                  <Field label="Match Duration (minutes)" hint="Expected duration of one match in minutes." error={e("match_duration_minutes")}>
                    <NumInput value={localData.match_duration_minutes} onChange={set("match_duration_minutes")} error={e("match_duration_minutes")} placeholder="e.g. 25" min="1" />
                  </Field>
                  <Field label="Break Between Matches (min)" hint="Minimum gap before the next match starts in a room. Can be 0." error={e("break_between_matches_minutes")}>
                    <NumInput value={localData.break_between_matches_minutes} onChange={set("break_between_matches_minutes")} error={e("break_between_matches_minutes")} placeholder="e.g. 5" min="0" />
                  </Field>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Section 4: Daily Schedule */}
      <div className={sectionCls}>
        <div className="p-4"><SectionHeader icon={Clock} title="Daily Operating Schedule" subtitle="What hours does the tournament run each day?" open={open.schedule} onToggle={() => toggle("schedule")} /></div>
        <AnimatePresence initial={false}>
          {open.schedule && (
            <motion.div {...motionProps}>
              <div className={`${bodyInner} space-y-4`}>
                <div className={gridCls}>
                  <Field label="Daily Start Time" hint="Time at which tournament operations can begin each day." error={e("daily_start_time")}>
                    <TimeInput value={localData.daily_start_time} onChange={set("daily_start_time")} error={e("daily_start_time")} />
                  </Field>
                  <Field label="Daily End Time" hint="Latest time at which operations can continue each day." error={e("daily_end_time")}>
                    <TimeInput value={localData.daily_end_time} onChange={set("daily_end_time")} error={e("daily_end_time")} />
                  </Field>
                  <Field label="Max Matches Per Day (optional)" hint="Optional cap on daily matches. Leave blank for no limit." error={e("max_matches_per_day")}>
                    <NumInput value={localData.max_matches_per_day} onChange={set("max_matches_per_day")} error={e("max_matches_per_day")} placeholder="Leave blank for no limit" min="1" />
                  </Field>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Section 5: Summary */}
      <div className={sectionCls}>
        <div className="p-4"><SectionHeader icon={CheckCircle2} title="Planning Summary" subtitle="Review your configuration before saving." open={open.summary} onToggle={() => toggle("summary")} /></div>
        <AnimatePresence initial={false}>
          {open.summary && (
            <motion.div {...motionProps}>
              <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-outline-variant/10">
                <div className="space-y-0">
                  <SummaryRow label="Expected teams" value={localData.expected_teams || "-"} />
                  <SummaryRow label="Maximum teams" value={localData.maximum_teams || "-"} />
                  <SummaryRow label="Players per team" value={localData.players_per_team || "-"} />
                  <SummaryRow label="Teams per room" value={localData.teams_per_room || "-"} />
                  <SummaryRow label="Max simultaneous rooms" value={localData.max_simultaneous_rooms || "-"} />
                  <SummaryRow label="Matches per team" value={localData.matches_per_team || "-"} />
                  <SummaryRow label="Match duration" value={localData.match_duration_minutes ? `${localData.match_duration_minutes} min` : "-"} />
                  <SummaryRow label="Break between matches" value={localData.break_between_matches_minutes !== "" ? `${localData.break_between_matches_minutes} min` : "-"} />
                  <SummaryRow label="Daily operating window" value={localData.daily_start_time && localData.daily_end_time ? `${fmt12(localData.daily_start_time)} - ${fmt12(localData.daily_end_time)}` : "-"} />
                  <SummaryRow label="Max matches per day" value={localData.max_matches_per_day ? String(localData.max_matches_per_day) : "Not specified"} muted={!localData.max_matches_per_day} />
                </div>
                <div className="mt-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 rounded-xl px-3 py-2.5">
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                    <strong className="font-semibold">Phase 1 only:</strong> The roadmap — rooms, groups, days, match distribution — will be calculated automatically in the next planning step. No rooms or matches are created at this stage.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Save error */}
      <AnimatePresence>
        {saveError && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="flex items-start gap-2 bg-error/8 border border-error/25 rounded-xl px-3 py-2.5">
            <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
            <p className="text-sm text-error">{saveError}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save button */}
      <div className="flex items-center justify-between gap-3 pt-2">
        <button type="button" onClick={() => setOpen({ team: true, room: true, match: true, schedule: true, summary: true })} className="text-xs text-on-surface-variant hover:text-primary underline-offset-2 hover:underline transition-colors">
          Expand all sections
        </button>
        <button type="button" onClick={handleSave} disabled={saving}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${saving ? "bg-primary/50 text-white/60 cursor-not-allowed" : "bg-primary text-white hover:brightness-110 shadow-[0_0_20px_rgba(99,102,241,0.35)] active:scale-95"}`}>
          {saving ? (<><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Saving...</>) : saved ? (<><CheckCircle2 className="w-4 h-4" />Saved!</>) : "Save Configuration"}
        </button>
      </div>

      {/* Post-save hint */}
      <AnimatePresence>
        {(saved || planningConfigStatus === "configured") && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-primary">Configuration saved successfully.</p>
              <p className="text-xs text-on-surface-variant mt-0.5">Next: Generate Tournament Roadmap — use the Roadmap Generator once your tournament is published to automatically create the room plan, groups, and match schedule.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
