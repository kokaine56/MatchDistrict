import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Save, Eye, EyeOff, CheckCircle, AlertCircle, RefreshCw, Trophy, Swords, Plus, Users, LayoutGrid, Clock, Lock } from "lucide-react";
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
    return d.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function getDayOfWeek(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-IN", { weekday: "long" });
  } catch {
    return "";
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

  const updateDayDate = (dayId, newDate) => {
    setRoadmapData(prev => {
      if (!prev) return prev;
      // Also update the round's date if they align
      const day = prev.days.find(d => d.id === dayId);
      let newRounds = prev.rounds;
      if (day && day.round_id) {
        newRounds = prev.rounds.map(r => r.id === day.round_id ? { ...r, date: newDate } : r);
      }
      return {
        ...prev,
        days: prev.days.map(d => d.id === dayId ? { ...d, date: newDate } : d),
        rounds: newRounds
      };
    });
  };

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

  if (isOrganizer && !roadmapData) return (
    <div className="w-full space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-10 sm:p-14 text-center shadow-sm max-w-2xl mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
          <Swords className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Tournament Roadmap</h2>
        <p className="text-sm font-semibold text-slate-600 mb-2">No roadmap has been generated yet.</p>
        <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed mb-8">
          Generate the tournament roadmap from the saved tournament schedule and match settings.
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

  if (!roadmapData || !roadmapData.days || roadmapData.days.length === 0) return (
    <div className="w-full bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm max-w-2xl mx-auto">
      <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
      <h3 className="text-base font-bold text-slate-800 mb-1">Tournament Roadmap</h3>
      <p className="text-sm text-slate-400">The match schedule has not been published yet.</p>
    </div>
  );

  const isViewOnly = !isOrganizer || previewMode;
  const meta = roadmapData.meta || {};
  const slotsTotal = meta.total_slots || 64;
  const numDistricts = meta.num_groups || 4;
  const teamsPerDistrict = meta.teams_per_group || 16;
  const advanceCount = meta.top_per_group || 4;

  const sortedDays = [...roadmapData.days].sort((a, b) => a.day_number - b.day_number);

  return (
    <div className="w-full space-y-6">
      {/* Action Bar (Organizer Only) */}
      {isOrganizer && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${roadmapStatus === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
              {roadmapStatus === "approved" ? "Live" : "Draft"}
            </span>
            {previewMode && <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200 px-2.5 py-0.5 rounded-md">Preview</span>}
          </div>
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
        </div>
      )}

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

      {/* Main Roadmap Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none mb-6">
          TOURNAMENT ROADMAP
        </h2>
        
        <div className="flex flex-wrap items-center gap-4 sm:gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Slots</p>
              <p className="text-lg font-black text-slate-900">{slotsTotal}</p>
            </div>
          </div>
          
          <div className="hidden sm:block w-px h-10 bg-slate-200"></div>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <LayoutGrid className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Districts</p>
              <p className="text-lg font-black text-slate-900">{numDistricts}</p>
            </div>
          </div>
          
          <div className="hidden sm:block w-px h-10 bg-slate-200"></div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <Swords className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Teams Per District</p>
              <p className="text-lg font-black text-slate-900">{teamsPerDistrict}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Day Sections */}
      <div className="space-y-6">
        {sortedDays.map((day) => {
          // Find matches for this day
          const dayMatches = roadmapData.matches.filter(m => m.day_id === day.id);
          if (dayMatches.length === 0) return null;

          // Group by Group/District
          const groupsForDay = {};
          dayMatches.forEach(m => {
            const isGF = m.is_grand_final || roadmapData.rounds.find(r => r.id === m.round_id)?.is_grand_final;
            const gk = isGF ? 'GRAND_FINAL' : (m.group_id || m.group_name || 'UNKNOWN');
            if (!groupsForDay[gk]) groupsForDay[gk] = { isGF, matches: [] };
            groupsForDay[gk].matches.push(m);
          });

          return (
            <div key={day.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row">
              
              {/* Day Sidebar */}
              <div className="w-full md:w-48 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 p-6 flex flex-col justify-start">
                <h3 className="text-xl font-black text-blue-600 uppercase tracking-widest mb-4">DAY {day.day_number}</h3>
                
                {!isViewOnly ? (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Edit Date</label>
                    <input type="date" value={day.date || ""} onChange={e => updateDayDate(day.id, e.target.value)}
                      className="w-full text-xs font-bold bg-white border border-slate-300 text-slate-800 rounded-lg px-2.5 py-2 focus:outline-none focus:border-blue-500" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-slate-800 mb-1">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <span className="font-bold">{formatDateLabel(day.date)}</span>
                    </div>
                    {getDayOfWeek(day.date) && (
                      <span className="text-sm font-semibold text-slate-500 pl-6">{getDayOfWeek(day.date)}</span>
                    )}
                  </>
                )}
              </div>

              {/* Day Content */}
              <div className="flex-1 p-6 space-y-8">
                {Object.keys(groupsForDay).map((gk, idx) => {
                  const { isGF, matches: groupMatches } = groupsForDay[gk];
                  const sortedMatches = [...groupMatches].sort((a, b) => a.match_number - b.match_number);
                  
                  if (isGF) {
                    const totalTeams = advanceCount * numDistricts;
                    return (
                      <div key={gk} className={idx > 0 ? "pt-8 border-t border-slate-100" : ""}>
                        <div className="mb-4">
                          <h4 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                            <Trophy className="w-6 h-6 text-yellow-500" /> Grand Final
                          </h4>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
                              {totalTeams} Qualified Teams
                            </span>
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider">
                              {sortedMatches.length} Matches Total
                            </span>
                          </div>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-center">
                          <p className="text-sm font-black text-yellow-800 uppercase tracking-widest">Highest Total Points = Champion</p>
                        </div>

                        <MatchTable 
                          matches={sortedMatches} 
                          isViewOnly={isViewOnly} 
                          onUpdateMatchField={updateMatchField} 
                        />
                      </div>
                    );
                  }

                  // Normal District
                  let districtName = sortedMatches[0]?.group_name || `District ${idx + 1}`;
                  if (districtName.toLowerCase().includes('group')) {
                    districtName = districtName.replace(/Group/i, 'District');
                  }
                  const tAdv = sortedMatches[0]?.teams_advancing || advanceCount;

                  return (
                    <div key={gk} className={idx > 0 ? "pt-8 border-t border-slate-100" : ""}>
                      <div className="mb-4">
                        <h4 className="text-xl font-black text-slate-900 tracking-tight">{districtName}</h4>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold uppercase tracking-wider">
                            {teamsPerDistrict} Teams
                          </span>
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider">
                            {sortedMatches.length} Matches Total
                          </span>
                        </div>
                      </div>

                      {tAdv != null && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
                          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Qualification</p>
                          <p className="text-sm font-bold text-slate-800">
                            Top {tAdv} teams from {districtName} advance to Grand Final
                          </p>
                        </div>
                      )}

                      <MatchTable 
                        matches={sortedMatches} 
                        isViewOnly={isViewOnly} 
                        onUpdateMatchField={updateMatchField} 
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MatchTable({ matches, isViewOnly, onUpdateMatchField }) {
  return (
    <div className="w-full">
      {/* Desktop Table Header */}
      <div className="hidden md:grid grid-cols-12 gap-4 pb-3 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
        <div className="col-span-2">Match</div>
        <div className="col-span-3">ID / PWD Release</div>
        <div className="col-span-3">Start Time</div>
        <div className="col-span-2">Map</div>
        <div className="col-span-2">Status</div>
      </div>

      <div className="flex flex-col gap-4 mt-4 md:mt-0 md:gap-0">
        {matches.map((m, i) => (
          <div key={m.id} className="flex flex-col md:grid md:grid-cols-12 md:gap-4 md:items-center py-4 border border-slate-200 md:border-0 md:border-b md:border-slate-100 rounded-xl md:rounded-none p-4 md:p-0 bg-white shadow-sm md:shadow-none hover:bg-slate-50 transition-colors">
            
            {/* Match Name */}
            <div className="col-span-2 font-black text-sm text-slate-900 mb-3 md:mb-0">
              Match {m.match_number || i + 1}
            </div>

            {/* ID / PWD Release */}
            <div className="col-span-3 flex md:flex-row flex-col justify-between md:justify-start items-start md:items-center text-sm font-semibold text-slate-600 mb-2 md:mb-0">
              <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ID/PWD Release</span>
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400 hidden md:block" />
                {isViewOnly ? (
                  <span>{m.id_pwd_release_time || "TBD"}</span>
                ) : (
                  <input type="text" value={m.id_pwd_release_time || ""} onChange={e => onUpdateMatchField(m.id, "id_pwd_release_time", e.target.value)}
                    className="w-24 px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500" placeholder="HH:MM" />
                )}
              </div>
            </div>

            {/* Start Time */}
            <div className="col-span-3 flex md:flex-row flex-col justify-between md:justify-start items-start md:items-center text-sm mb-3 md:mb-0">
              <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Start Time</span>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-500 hidden md:block" />
                {isViewOnly ? (
                  <span className="font-black text-slate-900">{formatTime12h(m.start_time)}</span>
                ) : (
                  <input type="time" value={m.start_time || ""} onChange={e => onUpdateMatchField(m.id, "start_time", e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500" />
                )}
              </div>
            </div>

            {/* Map */}
            <div className="col-span-2 flex md:flex-row flex-col justify-between md:justify-start items-start md:items-center mb-3 md:mb-0">
              <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Map</span>
              {isViewOnly ? (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-black uppercase tracking-wider border border-blue-100">
                  {m.map || "Erangel"}
                </span>
              ) : (
                <select value={m.map || "Erangel"} onChange={e => onUpdateMatchField(m.id, "map", e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500">
                  {MAP_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
            </div>

            {/* Status */}
            <div className="col-span-2 flex md:flex-row flex-col justify-between md:justify-start items-start md:items-center">
              <span className="md:hidden text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</span>
              <span className="inline-flex items-center px-2 py-1 rounded bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
                {m.status || "Upcoming"}
              </span>
            </div>
            
          </div>
        ))}
      </div>
    </div>
  );
}
