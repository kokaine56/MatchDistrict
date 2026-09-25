import React, { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Calendar, Plus, Trash2, Save, Eye, EyeOff,
  CheckCircle, AlertCircle, RefreshCw, Trophy,
  ChevronDown, ArrowDown, Swords
} from "lucide-react"
import { getAuthToken } from "../utils/getAuthToken"

const MAP_OPTIONS = ["Erangel","Miramar","Rondo","Sanhok","Vikendi","Livik","Karakin","Nusa"]

function formatTime12h(timeStr) {
  if (!timeStr) return "TBD"
  const parts = timeStr.split(":").map(Number)
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr
  const [h, m] = parts
  const period = h >= 12 ? "PM" : "AM"
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "Date TBD"
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric" })
  } catch { return dateStr }
}

function computeReleaseFromStart(startTimeStr) {
  if (!startTimeStr) return ""
  const [h, m] = startTimeStr.split(":").map(Number)
  if (isNaN(h) || isNaN(m)) return ""
  let relMins = h * 60 + m - 15
  if (relMins < 0) relMins += 1440
  const rH = Math.floor(relMins / 60) % 24
  const rM = relMins % 60
  const period = rH >= 12 ? "PM" : "AM"
  const h12 = rH % 12 === 0 ? 12 : rH % 12
  return `${String(h12).padStart(2, "0")}:${String(rM).padStart(2, "0")} ${period}`
}

function isGrandFinalGroup(group) {
  return /grand.?final/i.test(group?.group_name || "")
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TournamentRoadmapBuilder({
  tournamentId, tournamentTitle, isOrganizer = false, onClose = null, onApproved = null
}) {
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [roadmapStatus, setRoadmapStatus] = useState("pending")
  const [roadmapData, setRoadmapData] = useState(null)
  const [roadmapMeta, setRoadmapMeta] = useState(null)

  const fetchRoadmap = useCallback(async () => {
    if (!tournamentId) return
    setLoading(true); setError(null)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error || "Failed to load roadmap.")
      setRoadmapStatus(data.roadmap_status || "pending")
      const rm = data.roadmap
      if (rm && Array.isArray(rm.days) && rm.days.length > 0) {
        setRoadmapData(rm); setRoadmapMeta(rm.meta || null)
      } else {
        setRoadmapData(null); setRoadmapMeta(null)
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }, [tournamentId])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) fetchRoadmap() })
    return () => { cancelled = true }
  }, [fetchRoadmap])

  const handleGenerate = async (isRegenerate = false) => {
    if (isRegenerate && roadmapData) {
      const confirmed = window.confirm("Regenerating will replace the current roadmap schedule. Continue?")
      if (!confirmed) return
    }
    setGenerating(true); setError(null); setSuccess(null)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error || "Failed to generate roadmap.")
      setRoadmapStatus("draft"); setRoadmapData(data.roadmap); setRoadmapMeta(data.roadmap?.meta || null)
      setSuccess("Roadmap generated successfully from tournament groups and schedule.")
    } catch (err) { setError(err.message) }
    finally { setGenerating(false) }
  }

  const handleSave = async () => {
    if (!roadmapData) return
    setSaving(true); setError(null); setSuccess(null)
    try {
      const token = await getAuthToken()
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roadmap: roadmapData })
      })
      const data = await res.json()
      if (!data.success) throw new Error(data.message || data.error || "Failed to save roadmap.")
      setRoadmapStatus("approved"); setSuccess("Roadmap is now live on the public tournament page.")
      if (onApproved) onApproved()
    } catch (err) { setError(err.message) }
    finally { setSaving(false) }
  }

  const updateDayDate = (dayId, newDate) =>
    setRoadmapData(prev => !prev ? prev : { ...prev, days: prev.days.map(d => d.id === dayId ? { ...d, date: newDate } : d) })

  const updateMatchField = (matchId, field, value) => {
    setRoadmapData(prev => {
      if (!prev) return prev
      return {
        ...prev, matches: prev.matches.map(m => {
          if (m.id !== matchId) return m
          const updated = { ...m, [field]: value }
          if (field === "start_time" && value) updated.id_pwd_release_time = computeReleaseFromStart(value)
          return updated
        })
      }
    })
  }

  const handleAddMatch = (dayId, groupId, roomId) => {
    setRoadmapData(prev => {
      if (!prev) return prev
      const groupMatches = prev.matches.filter(m => m.group_id === groupId)
      const nextNum = groupMatches.length + 1
      let startTime = "13:00"
      if (groupMatches.length > 0) {
        const last = groupMatches[groupMatches.length - 1]
        if (last.start_time) {
          const [h, min] = last.start_time.split(":").map(Number)
          if (!isNaN(h) && !isNaN(min)) {
            const nextMins = (h * 60 + min + 60) % 1440
            startTime = `${String(Math.floor(nextMins / 60)).padStart(2, "0")}:${String(nextMins % 60).padStart(2, "0")}`
          }
        }
      }
      const newMatch = {
        id: `MAT-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
        tournament_id: tournamentId, day_id: dayId, group_id: groupId,
        room_id: roomId || `RM-${Date.now()}`, match_number: nextNum,
        map: MAP_OPTIONS[(nextNum - 1) % MAP_OPTIONS.length], start_time: startTime,
        end_time: "", id_pwd_release_time: computeReleaseFromStart(startTime), status: "PENDING"
      }
      return { ...prev, matches: [...prev.matches, newMatch] }
    })
  }

  const handleDeleteMatch = (matchId) =>
    setRoadmapData(prev => !prev ? prev : { ...prev, matches: prev.matches.filter(m => m.id !== matchId) })

  const structure = useMemo(() => {
    if (!roadmapData?.days) return []
    return roadmapData.days.map((day, dIdx) => {
      const dayGroups = (roadmapData.groups || [])
        .filter(g => g.day_id === day.id)
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      return {
        ...day,
        displayDay: `DAY ${day.day_number || dIdx + 1}`,
        groups: dayGroups.map(group => {
          const room = (roadmapData.rooms || []).find(r => r.group_id === group.id)
          const groupMatches = (roadmapData.matches || [])
            .filter(m => m.group_id === group.id)
            .sort((a, b) => (Number(a.match_number) || 0) - (Number(b.match_number) || 0))
          return { ...group, room_id: room?.id, capacity: group.capacity || room?.capacity || 16, matches: groupMatches, isGrandFinal: isGrandFinalGroup(group) }
        })
      }
    })
  }, [roadmapData])

  const qualInfo = useMemo(() => {
    if (!structure.length) return null
    const stageGroups = structure.flatMap(d => d.groups).filter(g => !g.isGrandFinal)
    if (stageGroups.length === 0) return null
    const topPerGroup = roadmapMeta?.top_per_group || Math.max(1, Math.ceil((roadmapMeta?.teams_per_group || 16) / 4))
    return { stageGroups, topPerGroup, qualified: stageGroups.length * topPerGroup }
  }, [structure, roadmapMeta])

  const numGroups = roadmapMeta?.num_groups || structure.flatMap(d => d.groups).filter(g => !g.isGrandFinal).length
  const headerMeta = [
    roadmapMeta?.total_slots && `${roadmapMeta.total_slots} Slots`,
    numGroups && `${numGroups} Groups`,
    roadmapMeta?.teams_per_group && `${roadmapMeta.teams_per_group} Teams Per Group`
  ].filter(Boolean).join(" \u2022 ")

  // Loading
  if (loading) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-3" />
      <p className="text-sm font-bold text-slate-600">Loading Tournament Roadmap...</p>
    </div>
  )

  // Organizer empty state - SINGLE generate button
  if (isOrganizer && !roadmapData) return (
    <div className="w-full space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-10 sm:p-14 text-center shadow-sm max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
          <Swords className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Tournament Roadmap</h2>
        <p className="text-sm font-semibold text-slate-600 mb-2">No roadmap has been generated yet.</p>
        <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed mb-8">
          Generate a roadmap from this tournament's existing groups, schedule and qualification settings.
        </p>
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
          {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {generating ? "Generating..." : "+ Generate Roadmap"}
        </button>
      </div>
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-start gap-2 max-w-2xl mx-auto">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" /><span>{error}</span>
        </div>
      )}
    </div>
  )

  // Public empty state
  if (!roadmapData || structure.length === 0) return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm max-w-2xl mx-auto">
      <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <h3 className="text-base font-bold text-slate-800 mb-1">Tournament Roadmap</h3>
      <p className="text-sm text-slate-400">The match schedule has not been published yet.</p>
    </div>
  )

  // PUBLIC / PREVIEW VIEW
  if (!isOrganizer || previewMode) return (
    <div className="w-full space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">Official Schedule</span>
              {previewMode && <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-md">Organizer Preview</span>}
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none mb-1">Tournament Roadmap</h2>
            {headerMeta && <p className="text-xs font-semibold text-slate-500">{headerMeta}</p>}
          </div>
          {previewMode && (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPreviewMode(false)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors">
                <EyeOff className="w-3.5 h-3.5" />Back to Editor
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:opacity-50">
                {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Saving..." : "Save & Publish"}
              </button>
            </div>
          )}
        </div>
      </div>
      {structure.map((day, dayIdx) => (
        <React.Fragment key={day.id}>
          <RoadmapDayCard day={day} qualInfo={dayIdx === structure.length - 2 ? qualInfo : null} />
          {dayIdx < structure.length - 1 && (
            <div className="flex items-center justify-center py-1"><ArrowDown className="w-5 h-5 text-slate-300" /></div>
          )}
        </React.Fragment>
      ))}
      {qualInfo && <GrandFinalSummary qualInfo={qualInfo} roadmapMeta={roadmapMeta} structure={structure} />}
    </div>
  )

  // ORGANIZER EDITOR VIEW
  return (
    <div className="w-full space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">Roadmap Generator</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${roadmapStatus === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                {roadmapStatus === "approved" ? "Live on Public Page" : "Draft - Unpublished"}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Tournament Roadmap</h2>
            {headerMeta && <p className="text-xs font-semibold text-slate-400 mt-0.5">{headerMeta}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => handleGenerate(true)} disabled={generating} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />Regenerate
            </button>
            <button type="button" onClick={() => setPreviewMode(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-blue-200 hover:bg-blue-50 text-blue-700 transition-colors">
              <Eye className="w-3.5 h-3.5" />Preview
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving..." : "Save Roadmap"}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" /><span>{error}</span>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" /><span>{success}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {structure.map((day, dayIdx) => (
        <React.Fragment key={day.id}>
          <OrganizerDayCard day={day} onUpdateDate={updateDayDate} onUpdateMatchField={updateMatchField}
            onAddMatch={handleAddMatch} onDeleteMatch={handleDeleteMatch}
            qualInfo={dayIdx === structure.length - 2 ? qualInfo : null} />
          {dayIdx < structure.length - 1 && (
            <div className="flex items-center justify-center py-1"><ArrowDown className="w-5 h-5 text-slate-300" /></div>
          )}
        </React.Fragment>
      ))}
      {qualInfo && <GrandFinalSummary qualInfo={qualInfo} roadmapMeta={roadmapMeta} structure={structure} />}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Total <strong className="text-slate-800">{roadmapData?.matches?.length || 0} matches</strong> across <strong className="text-slate-800">{roadmapData?.days?.length || 0} days</strong>
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPreviewMode(true)} className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors">Preview</button>
          <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-50">
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? "Saving..." : "Save Roadmap"}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Public Day Card ──────────────────────────────────────────────────────────
function RoadmapDayCard({ day, qualInfo }) {
  const isFinalDay = day.groups.every(g => g.isGrandFinal)
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className={`px-5 sm:px-7 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 ${isFinalDay ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-slate-50"}`}>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-lg border shadow-sm ${isFinalDay ? "bg-white/20 text-white border-white/30" : "bg-blue-600 text-white border-blue-700"}`}>{day.displayDay}</span>
          {day.date && <span className={`text-xs font-semibold ${isFinalDay ? "text-blue-100" : "text-slate-600"}`}>{formatDateLabel(day.date)}</span>}
        </div>
        {isFinalDay
          ? <span className="flex items-center gap-1 text-xs font-black text-white uppercase tracking-wider"><Trophy className="w-4 h-4" />Grand Final</span>
          : <span className="text-xs font-semibold text-slate-500">Group Stage — {day.groups.map(g => g.group_name).join(" + ")}</span>}
      </div>
      <div className="divide-y divide-slate-100">
        {day.groups.map((group, gIdx) => <ReadOnlyGroupSection key={group.id} group={group} groupIndex={gIdx} />)}
      </div>
      {qualInfo && !isFinalDay && <div className="mx-4 mb-4 mt-2"><QualificationBanner qualInfo={qualInfo} /></div>}
    </div>
  )
}

function ReadOnlyGroupSection({ group, groupIndex }) {
  const isGF = group.isGrandFinal
  return (
    <div className={`${groupIndex > 0 ? "pt-4" : "pt-5"} pb-5 px-5 sm:px-7 space-y-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${isGF ? "bg-amber-500" : "bg-blue-500"}`} />
          <h3 className={`font-black uppercase tracking-wider text-sm ${isGF ? "text-amber-700" : "text-slate-900"}`}>{group.group_name}</h3>
          {group.capacity > 0 && <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{group.capacity} Teams</span>}
        </div>
        <span className="text-[11px] font-semibold text-slate-400">{group.matches.length} Match{group.matches.length !== 1 ? "es" : ""}</span>
      </div>
      <div className="hidden sm:block rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <th className="py-2.5 px-4">Match</th><th className="py-2.5 px-4">Group</th><th className="py-2.5 px-4">Map</th><th className="py-2.5 px-4">ID/PWD Release</th><th className="py-2.5 px-4 text-right">Start Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {group.matches.map(match => (
              <tr key={match.id} className="hover:bg-blue-50/40 transition-colors text-xs">
                <td className="py-3 px-4 font-black text-slate-900">Match {match.match_number}</td>
                <td className="py-3 px-4 font-bold text-slate-600 uppercase text-[11px]">{group.group_name}</td>
                <td className="py-3 px-4"><span className="font-black text-blue-600 uppercase tracking-wide text-[11px]">{match.map || "Erangel"}</span></td>
                <td className="py-3 px-4 text-slate-500 font-semibold text-[11px]">{match.id_pwd_release_time || "15m prior"}</td>
                <td className="py-3 px-4 font-black text-slate-900 text-right">{formatTime12h(match.start_time)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sm:hidden grid grid-cols-1 gap-2.5">
        {group.matches.map(match => (
          <div key={match.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 uppercase">Match {match.match_number}</span>
              <span className="text-[11px] font-black uppercase text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">{match.map || "Erangel"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 text-[11px]">
              <div><span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">ID/PWD Release</span><span className="font-semibold text-slate-700">{match.id_pwd_release_time || "15m prior"}</span></div>
              <div className="text-right"><span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Start Time</span><span className="font-black text-slate-900">{formatTime12h(match.start_time)}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Organizer Day Card ───────────────────────────────────────────────────────
function OrganizerDayCard({ day, onUpdateDate, onUpdateMatchField, onAddMatch, onDeleteMatch, qualInfo }) {
  const isFinalDay = day.groups.every(g => g.isGrandFinal)
  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className={`px-5 sm:px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 ${isFinalDay ? "bg-gradient-to-r from-blue-600 to-blue-700" : "bg-slate-50"}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs font-black uppercase tracking-widest px-3 py-1 rounded-lg border shadow-sm ${isFinalDay ? "bg-white/20 text-white border-white/30" : "bg-blue-600 text-white border-blue-700"}`}>{day.displayDay}</span>
          {isFinalDay && <span className="flex items-center gap-1 text-xs font-black text-white uppercase tracking-wider"><Trophy className="w-4 h-4" />Grand Final</span>}
          {!isFinalDay && <span className="text-xs font-semibold text-slate-500">{day.groups.map(g => g.group_name).join(" + ")}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Calendar className={`w-3.5 h-3.5 ${isFinalDay ? "text-blue-200" : "text-slate-400"}`} />
          <input type="date" value={day.date || ""} onChange={e => onUpdateDate(day.id, e.target.value)}
            className={`text-xs font-bold rounded-lg border px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isFinalDay ? "bg-white/15 text-white border-white/20" : "bg-white border-slate-200 text-slate-800"}`} />
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-5">
        {day.groups.map((group, gIdx) => (
          <React.Fragment key={group.id}>
            {gIdx > 0 && <div className="flex items-center gap-3 py-1"><div className="flex-1 h-px bg-slate-100" /><ArrowDown className="w-4 h-4 text-slate-300 shrink-0" /><div className="flex-1 h-px bg-slate-100" /></div>}
            <OrganizerGroupSection group={group} onUpdateMatchField={onUpdateMatchField} onAddMatch={onAddMatch} onDeleteMatch={onDeleteMatch} />
          </React.Fragment>
        ))}
      </div>
      {qualInfo && !isFinalDay && <div className="px-5 pb-5"><QualificationBanner qualInfo={qualInfo} /></div>}
    </div>
  )
}

function OrganizerGroupSection({ group, onUpdateMatchField, onAddMatch, onDeleteMatch }) {
  const isGF = group.isGrandFinal
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${isGF ? "bg-amber-500" : "bg-blue-500"}`} />
          <h3 className={`font-black uppercase tracking-wider text-sm ${isGF ? "text-amber-700" : "text-slate-900"}`}>{group.group_name}</h3>
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">{group.capacity} Teams</span>
        </div>
        <button type="button" onClick={() => onAddMatch(group.day_id, group.id, group.room_id)}
          className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 px-3 py-1.5 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" />Add Match
        </button>
      </div>
      <div className="space-y-2.5">
        {group.matches.map(match => (
          <motion.div key={match.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end hover:border-blue-300 hover:shadow-sm transition-all">
            <div className="sm:col-span-2 flex items-center">
              <span className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-800 font-black text-xs rounded-lg shadow-sm shrink-0">Match {match.match_number}</span>
            </div>
            <div className="sm:col-span-3">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Map</label>
              <div className="relative">
                <select value={match.map || "Erangel"} onChange={e => onUpdateMatchField(match.id, "map", e.target.value)}
                  className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 pr-7 appearance-none focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                  {MAP_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">ID/PWD Release</label>
              <input type="text" placeholder="e.g. 12:45 PM" value={match.id_pwd_release_time || ""} onChange={e => onUpdateMatchField(match.id, "id_pwd_release_time", e.target.value)}
                className="w-full text-xs font-semibold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-3">
              <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Start Time</label>
              <input type="time" value={match.start_time || "13:00"} onChange={e => onUpdateMatchField(match.id, "start_time", e.target.value)}
                className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-1 flex sm:justify-end">
              <button type="button" onClick={() => onDeleteMatch(match.id)} className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors" title="Delete match">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        ))}
        {group.matches.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">No matches yet. Click <strong>Add Match</strong> to add one.</div>
        )}
      </div>
    </div>
  )
}

// ─── Qualification Banner ─────────────────────────────────────────────────────
function QualificationBanner({ qualInfo }) {
  const { stageGroups, topPerGroup, qualified } = qualInfo
  const formula = stageGroups.map(g => `Top ${topPerGroup} from ${g.group_name}`).join(" + ")
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <Trophy className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-[11px] font-black uppercase tracking-widest text-blue-700">Qualification</span>
      </div>
      <p className="text-xs sm:text-sm font-extrabold text-blue-900 leading-snug">{formula}</p>
      <p className="text-[11px] text-blue-700 font-semibold">{`\u2192 ${qualified} teams advance to the Grand Final`}</p>
    </div>
  )
}

// ─── Grand Final Summary ──────────────────────────────────────────────────────
function GrandFinalSummary({ qualInfo, roadmapMeta, structure }) {
  const grandFinalDay = structure[structure.length - 1]
  const grandFinalGroup = grandFinalDay?.groups?.find(g => g.isGrandFinal)
  const gfMatches = grandFinalGroup?.matches || []
  const maps = [...new Set(gfMatches.map(m => m.map || "Erangel"))]
  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 sm:p-7 shadow-md text-white space-y-4">
      <div className="flex items-center gap-3">
        <Trophy className="w-6 h-6 text-yellow-300" />
        <h3 className="text-lg font-black uppercase tracking-wider">Grand Final</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[["Qualified Teams", qualInfo.qualified], ["Final Matches", gfMatches.length], ["Groups", qualInfo.stageGroups.length], ["Top Per Group", qualInfo.topPerGroup]].map(([label, value]) => (
          <div key={label} className="bg-white/10 border border-white/20 rounded-xl p-3 text-center">
            <p className="text-xl font-black text-white leading-none">{value}</p>
            <p className="text-[10px] font-semibold text-blue-200 uppercase tracking-wider mt-1">{label}</p>
          </div>
        ))}
      </div>
      {maps.length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-200 mb-2">Maps</p>
          <div className="flex flex-wrap gap-2">
            {maps.map(map => <span key={map} className="text-xs font-black uppercase tracking-wider bg-white/15 border border-white/20 px-3 py-1 rounded-lg">{map}</span>)}
          </div>
        </div>
      )}
      <div className="pt-2 border-t border-white/20">
        <p className="text-sm font-black uppercase tracking-widest text-yellow-300 text-center">Highest Total Points = Champion</p>
      </div>
    </div>
  )
}
