import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CalendarDays, Map, Layers, LayoutGrid, Clock, Users, Swords, 
  CheckCircle2, AlertCircle, RefreshCw, X, ChevronDown, ChevronRight, ShieldCheck 
} from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";

export default function TournamentRoadmapPreview({
  tournamentId,
  tournamentTitle,
  onClose,
  onApproved
}) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState(null);
  
  const [roadmapStatus, setRoadmapStatus] = useState('pending');
  const [roadmap, setRoadmap] = useState(null);

  // Accordion state
  const [expandedDays, setExpandedDays] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedRooms, setExpandedRooms] = useState({});

  useEffect(() => {
    fetchRoadmap();
  }, [tournamentId]);

  const fetchRoadmap = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to fetch roadmap.');
      }
      setRoadmapStatus(data.roadmap_status);
      
      if (data.roadmap && data.roadmap.days.length > 0) {
        setRoadmap(data.roadmap);
        setExpandedDays(Object.fromEntries(data.roadmap.days.map((day) => [day.id, true])));
        setExpandedGroups(Object.fromEntries((data.roadmap.groups || []).map((group) => [group.id, true])));
        setExpandedRooms(Object.fromEntries((data.roadmap.rooms || []).map((room) => [room.id, true])));
      } else {
        setRoadmap(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (roadmapStatus === 'approved') return;
    setGenerating(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to generate roadmap.');
      }
      setRoadmapStatus('draft');
      setRoadmap(data.roadmap);
      if (data.roadmap.days.length > 0) {
        setExpandedDays(Object.fromEntries(data.roadmap.days.map((day) => [day.id, true])));
        setExpandedGroups(Object.fromEntries((data.roadmap.groups || []).map((group) => [group.id, true])));
        setExpandedRooms(Object.fromEntries((data.roadmap.rooms || []).map((room) => [room.id, true])));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap/approve`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to approve roadmap.');
      }
      setRoadmapStatus('approved');
      if (onApproved) onApproved();
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const toggleDay = (id) => setExpandedDays(p => ({ ...p, [id]: !p[id] }));
  const toggleGroup = (id) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));
  const toggleRoom = (id) => setExpandedRooms(p => ({ ...p, [id]: !p[id] }));

  if (loading) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-[#0A0B10] border border-white/10 rounded-xl p-8 shadow-xl max-w-md w-full flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-gray-300">Loading roadmap...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[#07080C] border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#07080C]/90 backdrop-blur-md border-b border-white/10 p-5 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Map className="w-6 h-6 text-indigo-400" />
              Tournament Roadmap
            </h2>
            <p className="text-sm text-gray-400 mt-1">{tournamentTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-start gap-3 mb-6">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!roadmap ? (
            <div className="text-center py-12">
              <Map className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No Roadmap Exists</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-6">
                A structured roadmap has not been generated for this tournament yet. 
                You must have an approved capacity plan before generating the roadmap.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors flex items-center gap-2 mx-auto disabled:opacity-50"
              >
                {generating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Map className="w-5 h-5" />}
                Generate Roadmap
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${roadmapStatus === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-indigo-500/10 border-indigo-500/20'}`}>
                <div className="flex items-center gap-3">
                  {roadmapStatus === 'approved' ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-indigo-400" />
                  )}
                  <div>
                    <h3 className={`font-semibold ${roadmapStatus === 'approved' ? 'text-emerald-400' : 'text-indigo-400'}`}>
                      {roadmapStatus === 'approved' ? 'Roadmap Approved' : 'Draft Roadmap'}
                    </h3>
                    <p className="text-sm text-gray-400">
                      {roadmapStatus === 'approved' 
                        ? 'This structural roadmap is locked and ready for Phase 4 (Team Allocation).' 
                        : 'Review the generated structure below. You must approve it to proceed.'}
                    </p>
                  </div>
                </div>
                {roadmapStatus === 'draft' && (
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve Roadmap
                  </button>
                )}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <CalendarDays className="w-5 h-5 text-gray-400 mb-2" />
                  <div className="text-2xl font-black text-white">{roadmap.days.length}</div>
                  <div className="text-xs text-gray-500 uppercase font-semibold mt-1">Days</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <Layers className="w-5 h-5 text-gray-400 mb-2" />
                  <div className="text-2xl font-black text-white">{roadmap.groups.length}</div>
                  <div className="text-xs text-gray-500 uppercase font-semibold mt-1">Groups</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <LayoutGrid className="w-5 h-5 text-gray-400 mb-2" />
                  <div className="text-2xl font-black text-white">{roadmap.rooms.length}</div>
                  <div className="text-xs text-gray-500 uppercase font-semibold mt-1">BGMI Rooms</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                  <Swords className="w-5 h-5 text-gray-400 mb-2" />
                  <div className="text-2xl font-black text-white">{roadmap.matches.length}</div>
                  <div className="text-xs text-gray-500 uppercase font-semibold mt-1">Matches</div>
                </div>
              </div>

              {/* Roadmap Hierarchy Tree */}
              <div className="bg-[#0A0B10] border border-white/10 rounded-xl overflow-hidden">
                <div className="p-4 bg-white/5 border-b border-white/10">
                  <h3 className="font-bold text-white">Structural Preview</h3>
                  <p className="text-xs text-gray-400 mt-1">Groups keep the same teams for all matches; each match has its own BGMI room.</p>
                </div>
                
                <div className="p-2 space-y-1 max-h-[500px] overflow-y-auto">
                  {roadmap.days.map((day) => {
                    const dayGroups = roadmap.groups.filter(g => g.day_id === day.id);
                    const isExpandedDay = expandedDays[day.id];

                    return (
                      <div key={day.id} className="border border-white/5 rounded-lg overflow-hidden">
                        <button 
                          onClick={() => toggleDay(day.id)}
                          className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors bg-[#0D0E15]"
                        >
                          {isExpandedDay ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                          <CalendarDays className="w-5 h-5 text-indigo-400" />
                          <span className="font-bold text-white flex-1">Day {day.display_day_number || day.day_number}</span>
                          <span className="text-sm text-gray-500">{day.date}</span>
                          <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">{dayGroups.length} Groups</span>
                        </button>
                        
                        <AnimatePresence>
                          {isExpandedDay && (
                            <motion.div
                              initial={{ height: 0 }}
                              animate={{ height: "auto" }}
                              exit={{ height: 0 }}
                              className="overflow-hidden bg-[#0A0B10]"
                            >
                              <div className="p-3 pl-9 space-y-2">
                                {dayGroups.map(group => {
                                  const groupRooms = roadmap.rooms.filter(r => r.group_id === group.id);
                                  const isExpandedGroup = expandedGroups[group.id];

                                  return (
                                    <div key={group.id} className="border border-white/5 rounded-lg overflow-hidden">
                                      <button 
                                        onClick={() => toggleGroup(group.id)}
                                        className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-white/5 transition-colors bg-white/[0.02]"
                                      >
                                        {isExpandedGroup ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                        <Layers className="w-4 h-4 text-emerald-400" />
                                        <span className="font-semibold text-gray-200 flex-1">{group.group_name}</span>
                                        <span className="text-xs bg-white/10 px-2 py-0.5 rounded text-gray-400">{groupRooms.length} Matches</span>
                                      </button>

                                      <AnimatePresence>
                                        {isExpandedGroup && (
                                          <motion.div
                                            initial={{ height: 0 }}
                                            animate={{ height: "auto" }}
                                            exit={{ height: 0 }}
                                            className="overflow-hidden"
                                          >
                                            <div className="p-2 pl-9 space-y-2">
                                              {groupRooms.map(room => {
                                                const roomMatches = roadmap.matches.filter(m => m.room_id === room.id).sort((a,b) => a.match_number - b.match_number);
                                                const isExpandedRoom = expandedRooms[room.id];

                                                return (
                                                  <div key={room.id} className="border border-white/5 rounded-lg overflow-hidden">
                                                    <button 
                                                      onClick={() => toggleRoom(room.id)}
                                                      className="w-full flex items-center gap-3 p-2 text-left hover:bg-white/5 transition-colors"
                                                    >
                                                      {isExpandedRoom ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
                                                      <LayoutGrid className="w-4 h-4 text-amber-400" />
                                                      <span className="font-medium text-sm text-gray-300 flex-1">Match {roomMatches[0]?.match_number ?? '—'}</span>
                                                      <span className="text-[10px] uppercase tracking-wide text-amber-300">BGMI Room {room.room_number}</span>
                                                      <span className="flex items-center gap-1 text-xs text-gray-500"><Users className="w-3 h-3" /> {room.capacity} team slots</span>
                                                    </button>
                                                    
                                                    <AnimatePresence>
                                                      {isExpandedRoom && (
                                                        <motion.div
                                                          initial={{ height: 0 }}
                                                          animate={{ height: "auto" }}
                                                          exit={{ height: 0 }}
                                                          className="overflow-hidden"
                                                        >
                                                          <div className="p-2 pl-9 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-black/20 rounded-b-lg">
                                                            {roomMatches.map(match => (
                                                              <div key={match.id} className="bg-white/5 border border-white/10 p-2 rounded flex items-center justify-between">
                                                                <span className="text-xs font-semibold text-gray-300">Match {match.match_number}</span>
                                                                <span className="flex items-center gap-1 text-xs text-gray-400 bg-black/30 px-2 py-0.5 rounded">
                                                                  <Clock className="w-3 h-3" />
                                                                  {match.start_time} - {match.end_time}
                                                                </span>
                                                              </div>
                                                            ))}
                                                          </div>
                                                        </motion.div>
                                                      )}
                                                    </AnimatePresence>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        {roadmap && roadmapStatus === 'draft' && (
          <div className="bg-white/5 border-t border-white/10 p-4 shrink-0 flex items-center justify-between">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              Regenerate Roadmap
            </button>
            <p className="text-xs text-amber-500/80 font-medium max-w-sm text-right">
              No rooms contain any teams yet. Approval is required before slot allocation.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
