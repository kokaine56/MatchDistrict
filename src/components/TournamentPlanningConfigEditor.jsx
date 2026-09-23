import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  CalendarDays, X, Loader2, CheckCircle2, AlertCircle,
  Users, Home, Swords, Clock, Info, ChevronDown, ChevronUp
} from "lucide-react"
import { getAuthToken } from "../utils/getAuthToken"
import TournamentPlanningResultCard from "./TournamentPlanningResultCard"

// ─── Validation ───────────────────────────────────────────────────────────────
function validateConfig(d) {
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
    ["max_simultaneous_rooms", d.max_simultaneous_rooms, "Max simultaneous rooms", false],
    ["matches_per_team", d.matches_per_team, "Matches per team", false],
    ["match_duration_minutes", d.match_duration_minutes, "Match duration", false],
    ["break_between_matches_minutes", d.break_between_matches_minutes, "Break between matches", true],
  ]
  for (const [k, v, label, allowZero] of numFields) {
    const e = posInt(v, label, allowZero)
    if (e) errs[k] = e
  }
  if (!errs.expected_teams && !errs.maximum_teams) {
    if (Number(d.maximum_teams) < Number(d.expected_teams)) errs.maximum_teams = "Maximum teams cannot be lower than expected teams."
  }
  const timeRe = /^([01]\d|2[0-3]):([0-5]\d)$/
  if (!d.daily_start_time || !timeRe.test(d.daily_start_time)) errs.daily_start_time = "Valid start time required (HH:MM)."
  if (!d.daily_end_time || !timeRe.test(d.daily_end_time)) errs.daily_end_time = "Valid end time required (HH:MM)."
  if (!errs.daily_start_time && !errs.daily_end_time) {
    const toMins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m }
    if (toMins(d.daily_end_time) <= toMins(d.daily_start_time)) errs.daily_end_time = "Daily end time must be later than start time."
  }
  if (d.max_matches_per_day !== "" && d.max_matches_per_day !== null && d.max_matches_per_day !== undefined) {
    const n = Number(d.max_matches_per_day)
    if (!Number.isFinite(n) || Math.floor(n) !== n || n <= 0) errs.max_matches_per_day = "Must be a positive integer if provided."
  }
  return errs
}

const EMPTY = {
  expected_teams: "", maximum_teams: "", players_per_team: "4",
  teams_per_room: "25", max_simultaneous_rooms: "", matches_per_team: "3",
  match_duration_minutes: "25", break_between_matches_minutes: "5",
  daily_start_time: "10:00", daily_end_time: "22:00", max_matches_per_day: "",
}

function Field({ label, hint, error, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-on-surface-variant mb-1">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-on-surface-variant/70 flex items-start gap-1"><Info className="w-3 h-3 flex-shrink-0 mt-0.5" />{hint}</p>}
      {error && <p className="mt-1 text-xs text-error flex items-start gap-1"><AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />{error}</p>}
    </div>
  )
}
function NumInput({ value, onChange, error, placeholder, min = "0" }) {
  return <input type="number" min={min} step="1" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
    className={`w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-surface-container border transition-colors ${error ? "border-error/60 focus:border-error" : "border-slate-200 dark:border-outline-variant/30 focus:border-primary/60"} text-on-background placeholder-on-surface-variant/50`} />
}
function TimeInput({ value, onChange, error }) {
  return <input type="time" value={value ?? ""} onChange={(e) => onChange(e.target.value)}
    className={`w-full px-4 py-2.5 rounded-xl text-sm outline-none bg-surface-container border transition-colors ${error ? "border-error/60 focus:border-error" : "border-slate-200 dark:border-outline-variant/30 focus:border-primary/60"} text-on-background`} />
}

function Section({ icon: Icon, title, open, onToggle, children }) {
  return (
    <div className="border border-slate-200 dark:border-outline-variant/25 rounded-xl overflow-hidden">
      <button type="button" onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left group hover:bg-surface-container/50 transition-colors">
        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="w-4 h-4" /></span>
        <span className="flex-1 text-sm font-semibold text-on-background">{title}</span>
        <span className="flex-shrink-0 text-on-surface-variant">{open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4 pt-1 border-t border-slate-100 dark:border-outline-variant/10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function TournamentPlanningConfigEditor({ tournamentId, tournamentTitle, onClose, onSaved }) {
  const [data, setData] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [showResult, setShowResult] = useState(false)
  const [open, setOpen] = useState({ team: true, room: true, match: true, schedule: true })
  const toggle = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }))

  useEffect(() => {
    async function load() {
      try {
        const token = await getAuthToken()
        const headers = {}
        if (token) headers["Authorization"] = `Bearer ${token}`
        const res = await fetch(`/api/tournaments/${tournamentId}/planning-config`, { headers })
        const json = await res.json()
        if (json.success && json.config) {
          setData({
            expected_teams: String(json.config.expected_teams ?? ""),
            maximum_teams: String(json.config.maximum_teams ?? ""),
            players_per_team: String(json.config.players_per_team ?? "4"),
            teams_per_room: String(json.config.teams_per_room ?? "25"),
            max_simultaneous_rooms: String(json.config.max_simultaneous_rooms ?? ""),
            matches_per_team: String(json.config.matches_per_team ?? "3"),
            match_duration_minutes: String(json.config.match_duration_minutes ?? "25"),
            break_between_matches_minutes: String(json.config.break_between_matches_minutes ?? "5"),
            daily_start_time: json.config.daily_start_time ?? "10:00",
            daily_end_time: json.config.daily_end_time ?? "22:00",
            max_matches_per_day: json.config.max_matches_per_day != null ? String(json.config.max_matches_per_day) : "",
          })
        }
      } catch {}
      setLoading(false)
    }
    load()
  }, [tournamentId])

  const set = useCallback((field) => (value) => {
    setData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
    setSaved(false)
  }, [])

  const handleSave = useCallback(async () => {
    const errs = validateConfig(data)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      if (errs.expected_teams || errs.maximum_teams || errs.players_per_team) setOpen(p => ({ ...p, team: true }))
      if (errs.teams_per_room || errs.max_simultaneous_rooms) setOpen(p => ({ ...p, room: true }))
      if (errs.matches_per_team || errs.match_duration_minutes || errs.break_between_matches_minutes) setOpen(p => ({ ...p, match: true }))
      if (errs.daily_start_time || errs.daily_end_time || errs.max_matches_per_day) setOpen(p => ({ ...p, schedule: true }))
      return
    }
    setSaving(true); setSaveError(null)
    try {
      const token = await getAuthToken()
      const headers = { "Content-Type": "application/json" }
      if (token) headers["Authorization"] = `Bearer ${token}`
      const res = await fetch(`/api/tournaments/${tournamentId}/planning-config`, { method: "POST", headers, body: JSON.stringify(data) })
      const json = await res.json()
      if (!json.success) {
        setSaveError(json.message || json.error || "Failed to save.")
        if (json.errors) setErrors(json.errors)
      } else {
        setSaved(true)
        onSaved?.(json.config)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch { setSaveError("Network error. Please try again.") }
    finally { setSaving(false) }
  }, [data, tournamentId, onSaved])

  const e = (k) => errors[k]

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.97 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container w-full sm:max-w-xl max-h-[92vh] sm:max-h-[90vh] rounded-t-2xl sm:rounded-2xl flex flex-col shadow-2xl border border-outline-variant/20 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-outline-variant/15 flex-shrink-0">
          <span className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CalendarDays className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-on-background leading-tight">Planning Configuration</h2>
            {tournamentTitle && <p className="text-xs text-on-surface-variant truncate mt-0.5">{tournamentTitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex-shrink-0 p-2 rounded-lg text-on-surface-variant hover:text-on-background hover:bg-surface-container-highest/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <p className="text-sm text-on-surface-variant mb-2">
                These values define the operational parameters used by the Phase 2 Roadmap Generator to automatically calculate rooms, groups, days, and match schedules.
              </p>

              {/* Section 1 */}
              <Section icon={Users} title="Team Structure" open={open.team} onToggle={() => toggle("team")}>
                <Field label="Expected Teams" hint="Estimated teams expected to participate." error={e("expected_teams")}>
                  <NumInput value={data.expected_teams} onChange={set("expected_teams")} error={e("expected_teams")} placeholder="e.g. 180" min="1" />
                </Field>
                <Field label="Maximum Teams" hint="Maximum teams this tournament can accept." error={e("maximum_teams")}>
                  <NumInput value={data.maximum_teams} onChange={set("maximum_teams")} error={e("maximum_teams")} placeholder="e.g. 200" min="1" />
                </Field>
                <Field label="Players Per Team" hint="Number of players per team." error={e("players_per_team")}>
                  <NumInput value={data.players_per_team} onChange={set("players_per_team")} error={e("players_per_team")} placeholder="e.g. 4" min="1" />
                </Field>
              </Section>

              {/* Section 2 */}
              <Section icon={Home} title="Room Capacity" open={open.room} onToggle={() => toggle("room")}>
                <Field label="Teams Per Room" hint="Max teams in one room. Phase 2 calculates total rooms needed." error={e("teams_per_room")}>
                  <NumInput value={data.teams_per_room} onChange={set("teams_per_room")} error={e("teams_per_room")} placeholder="e.g. 25" min="1" />
                </Field>
                <Field label="Max Simultaneous Rooms" hint="Max rooms running at the same time (concurrency limit)." error={e("max_simultaneous_rooms")}>
                  <NumInput value={data.max_simultaneous_rooms} onChange={set("max_simultaneous_rooms")} error={e("max_simultaneous_rooms")} placeholder="e.g. 10" min="1" />
                </Field>
              </Section>

              {/* Section 3 */}
              <Section icon={Swords} title="Match Structure" open={open.match} onToggle={() => toggle("match")}>
                <Field label="Matches Per Team" error={e("matches_per_team")}>
                  <NumInput value={data.matches_per_team} onChange={set("matches_per_team")} error={e("matches_per_team")} placeholder="e.g. 3" min="1" />
                </Field>
                <Field label="Match Duration (min)" error={e("match_duration_minutes")}>
                  <NumInput value={data.match_duration_minutes} onChange={set("match_duration_minutes")} error={e("match_duration_minutes")} placeholder="e.g. 25" min="1" />
                </Field>
                <Field label="Break Between Matches (min)" hint="0 for back-to-back." error={e("break_between_matches_minutes")}>
                  <NumInput value={data.break_between_matches_minutes} onChange={set("break_between_matches_minutes")} error={e("break_between_matches_minutes")} placeholder="e.g. 5" min="0" />
                </Field>
              </Section>

              {/* Section 4 */}
              <Section icon={Clock} title="Daily Schedule" open={open.schedule} onToggle={() => toggle("schedule")}>
                <Field label="Daily Start Time" error={e("daily_start_time")}>
                  <TimeInput value={data.daily_start_time} onChange={set("daily_start_time")} error={e("daily_start_time")} />
                </Field>
                <Field label="Daily End Time" error={e("daily_end_time")}>
                  <TimeInput value={data.daily_end_time} onChange={set("daily_end_time")} error={e("daily_end_time")} />
                </Field>
                <Field label="Max Matches Per Day (optional)" hint="Leave blank for no limit." error={e("max_matches_per_day")}>
                  <NumInput value={data.max_matches_per_day} onChange={set("max_matches_per_day")} error={e("max_matches_per_day")} placeholder="No limit" min="1" />
                </Field>
              </Section>

              {/* Phase 1 note */}
              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/30 rounded-xl px-3 py-2.5">
                <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  <strong className="font-semibold">Phase 1 only:</strong> No rooms, groups, or matches are created here. The roadmap will be generated automatically in the next planning phase.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-outline-variant/15 space-y-2">
          {saveError && (
            <div className="flex items-start gap-2 bg-error/8 border border-error/25 rounded-xl px-3 py-2">
              <AlertCircle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
              <p className="text-sm text-error">{saveError}</p>
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 bg-primary/8 border border-primary/25 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
              <p className="text-sm text-primary font-medium">Configuration saved successfully.</p>
            </div>
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant border border-outline-variant/30 hover:bg-surface-container-highest/40 transition-colors">
              {saved ? "Close" : "Cancel"}
            </button>
            <button type="button" onClick={handleSave} disabled={saving || loading}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all ${saving ? "bg-primary/50 text-white/60 cursor-not-allowed" : "bg-primary text-white hover:brightness-110 shadow-[0_0_16px_rgba(99,102,241,0.3)] active:scale-95"}`}>
              {saving ? (<><Loader2 className="w-4 h-4 animate-spin" />Saving...</>) : "Save Configuration"}
            </button>
          </div>
          {!loading && saved && (
            <div className="flex justify-center mt-3 border-t border-outline-variant/15 pt-3">
              <button type="button" onClick={() => setShowResult(true)} className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors">
                <CalendarDays className="w-4 h-4" />
                View / Generate Plan
              </button>
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {showResult && (
          <TournamentPlanningResultCard
            tournamentId={tournamentId}
            tournamentTitle={tournamentTitle}
            onClose={() => setShowResult(false)}
            onRegenerate={() => {}}
            onApproved={(plan) => {
              // Optionally do something when approved
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
