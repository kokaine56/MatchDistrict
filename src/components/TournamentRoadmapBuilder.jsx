import React, { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Save, Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw, Trophy, Swords, Plus } from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";

const MAP_OPTIONS = ["Erangel", "Miramar", "Rondo", "Sanhok", "Vikendi", "Livik", "Karakin", "Nusa"];

function formatTime12h(timeStr) {
  if (!timeStr) return "TBD";
  const parts = timeStr.split(":").map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr;
  const [h, m] = parts;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return "Date TBD";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function computeReleaseFromStart(startTimeStr) {
  if (!startTimeStr) return "";
  const [h, m] = startTimeStr.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "";
  let relMins = h * 60 + m - 15;
  if (relMins < 0) relMins += 1440;
  const rH = Math.floor(relMins / 60) % 24;
  const rM = relMins % 60;
  const period = rH >= 12 ? "PM" : "AM";
  const h12 = rH % 12 === 0 ? 12 : rH % 12;
  return `${String(h12).padStart(2, "0")}:${String(rM).padStart(2, "0")} ${period}`;
}

export default function TournamentRoadmapBuilder({
  tournamentId,
  isOrganizer = false,
  onApproved = null
}) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [roadmapStatus, setRoadmapStatus] = useState("pending");
  const [roadmapData, setRoadmapData] = useState(null);

  const fetchRoadmap = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to load roadmap.");
      setRoadmapStatus(data.roadmap_status || "pending");
      const rm = data.roadmap;
      if (rm && Array.isArray(rm.rounds) && rm.rounds.length > 0) {
        setRoadmapData(rm);
      } else {
        setRoadmapData(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchRoadmap();
  }, [fetchRoadmap]);

  const handleGenerate = async (isRegenerate = false) => {
    if (isRegenerate && roadmapData) {
      const confirmed = window.confirm("Regenerating the roadmap will replace the current generated progression structure. Continue?");
      if (!confirmed) return;
    }
    setGenerating(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to generate roadmap.");
      setRoadmapStatus("draft");
      setRoadmapData(data.roadmap);
      setSuccess("Roadmap generated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!roadmapData) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ roadmap: roadmapData })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || data.error || "Failed to save roadmap.");
      setRoadmapStatus("approved");
      setSuccess("Roadmap is now live.");
      if (onApproved) onApproved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateRoundDate = (roundId, newDate) =>
    setRoadmapData(prev => !prev ? prev : {
      ...prev,
      rounds: prev.rounds.map(r => r.id === roundId ? { ...r, date: newDate } : r)
    });

  const updateMatchField = (matchId, field, value) => {
    setRoadmapData(prev => {
      if (!prev) return prev;
      return {
        ...prev, matches: prev.matches.map(m => {
          if (m.id !== matchId) return m;
          const updated = { ...m, [field]: value };
          if (field === "start_time" && value) updated.id_pwd_release_time = computeReleaseFromStart(value);
          return updated;
        })
      };
    });
  };

  // ----------------------------------------------------------------------------------
  // UI RENDERERS
  // ----------------------------------------------------------------------------------

  if (loading) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
      <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-3" />
      <p className="text-sm font-bold text-slate-600">Loading Tournament Roadmap...</p>
    </div>
  );

  // Organizer empty state
  if (isOrganizer && !roadmapData) return (
    <div className="w-full space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-10 sm:p-14 text-center shadow-sm max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
          <Swords className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Tournament Roadmap</h2>
        <p className="text-sm font-semibold text-slate-600 mb-2">No roadmap has been generated yet.</p>
        <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed mb-8">
          Generate a roadmap from this tournament's existing schedule and qualification settings.
        </p>
        <button type="button" onClick={() => handleGenerate(false)} disabled={generating}
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all disabled:opacity-50">
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
  );

  // Public empty state
  if (!roadmapData || !roadmapData.rounds || roadmapData.rounds.length === 0) return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm max-w-2xl mx-auto">
      <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <h3 className="text-base font-bold text-slate-800 mb-1">Tournament Roadmap</h3>
      <p className="text-sm text-slate-400">The match schedule has not been published yet.</p>
    </div>
  );

  const isViewOnly = !isOrganizer || previewMode;

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-7 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-md">Roadmap</span>
            {isOrganizer && (
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${roadmapStatus === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                {roadmapStatus === "approved" ? "Live" : "Draft"}
              </span>
            )}
            {previewMode && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-md">Preview</span>}
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Tournament Progression</h2>
        </div>
        {isOrganizer && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => handleGenerate(true)} disabled={generating} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${generating ? "animate-spin" : ""}`} />Regenerate
            </button>
            <button type="button" onClick={() => setPreviewMode(!previewMode)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-blue-200 hover:bg-blue-50 text-blue-700 transition-colors">
              {previewMode ? <><EyeOff className="w-3.5 h-3.5" />Editor</> : <><Eye className="w-3.5 h-3.5" />Preview</>}
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition-all">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-semibold flex items-start gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{success}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rounds list */}
      <div className="space-y-6">
        {roadmapData.rounds.map((round) => {
          const roundMatches = roadmapData.matches.filter(m => m.round_id === round.id).sort((a, b) => a.match_number - b.match_number);
          
          if (round.is_grand_final) {
            // GRAND FINAL DISPLAY
            return (
              <div key={round.id} className="bg-white border-2 border-blue-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="px-5 sm:px-7 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Trophy className="w-6 h-6 text-yellow-300" />
                    <h3 className="text-lg font-black uppercase tracking-widest">{round.name}</h3>
                  </div>
                  {!isViewOnly ? (
                    <input type="date" value={round.date || ""} onChange={e => updateRoundDate(round.id, e.target.value)}
                      className="text-xs font-bold bg-white/20 border border-white/30 text-white rounded-lg px-2.5 py-1 focus:outline-none" />
                  ) : (
                    <span className="text-xs font-semibold text-blue-100">{formatDateLabel(round.date)}</span>
                  )}
                </div>
                
                <div className="p-5 sm:p-7 space-y-4">
                  <p className="text-sm font-black text-slate-800 uppercase tracking-wider text-center bg-blue-50 py-2 rounded-xl">
                    Final Participant Pool
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {roundMatches.map(match => (
                      <MatchCard 
                        key={match.id} 
                        match={match} 
                        isViewOnly={isViewOnly} 
                        onUpdateMatchField={onUpdateMatchField}
                        maxCapacity={roadmapData.meta?.max_capacity || 25}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          }

          // NORMAL ROUND DISPLAY
          return (
            <div key={round.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 sm:px-6 py-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">{round.name}</h3>
                {!isViewOnly ? (
                  <input type="date" value={round.date || ""} onChange={e => updateRoundDate(round.id, e.target.value)}
                    className="text-xs font-bold bg-white border border-slate-200 text-slate-800 rounded-lg px-2.5 py-1 focus:outline-none" />
                ) : (
                  <span className="text-xs font-semibold text-slate-600">{formatDateLabel(round.date)}</span>
                )}
              </div>
              
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roundMatches.map(match => (
                    <MatchCard 
                      key={match.id} 
                      match={match} 
                      isViewOnly={isViewOnly} 
                      onUpdateMatchField={onUpdateMatchField}
                      maxCapacity={roadmapData.meta?.max_capacity || 25}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchCard({ match, isViewOnly, onUpdateMatchField, maxCapacity }) {
  const isGF = match.is_grand_final;
  
  return (
    <div className={`border rounded-xl p-4 space-y-3 ${isGF ? 'border-blue-200 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-blue-300 transition-colors'}`}>
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <span className="text-sm font-black text-slate-900 uppercase">Match {match.match_number}</span>
        {isViewOnly ? (
          <span className="text-[11px] font-black uppercase text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">{match.map}</span>
        ) : (
          <select value={match.map || "Erangel"} onChange={e => onUpdateMatchField(match.id, "map", e.target.value)}
            className="text-[11px] font-bold text-slate-800 bg-white border border-slate-200 rounded-md px-1.5 py-0.5">
            {MAP_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
      </div>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-500">Teams:</span>
          <span className="font-black text-slate-800">{match.assignedCount || 0} / {maxCapacity}</span>
        </div>
        
        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-500">Start:</span>
          {isViewOnly ? (
            <span className="font-black text-slate-900">{formatTime12h(match.start_time)}</span>
          ) : (
            <input type="time" value={match.start_time || "13:00"} onChange={e => onUpdateMatchField(match.id, "start_time", e.target.value)}
              className="font-bold text-slate-800 bg-white border border-slate-200 rounded px-1 py-0.5" />
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-500">Release:</span>
          {isViewOnly ? (
            <span className="font-semibold text-slate-700">{match.id_pwd_release_time}</span>
          ) : (
            <input type="text" value={match.id_pwd_release_time || ""} onChange={e => onUpdateMatchField(match.id, "id_pwd_release_time", e.target.value)}
              className="font-semibold text-slate-800 bg-white border border-slate-200 rounded px-1 py-0.5 w-24 text-right" />
          )}
        </div>

        <div className="flex justify-between items-center">
          <span className="font-semibold text-slate-500">Status:</span>
          <span className="font-bold uppercase text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded">{match.status || 'Scheduled'}</span>
        </div>
      </div>

      {/* Qualification logic natively driven by backend */}
      {!isGF && match.teams_advancing != null && (
        <div className="pt-2 border-t border-slate-100">
          <span className="block text-center text-[11px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 py-1 rounded-md">
            Top {match.teams_advancing} Advance
          </span>
        </div>
      )}
    </div>
  );
}
