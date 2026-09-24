import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CalendarDays, Layers, LayoutGrid, Clock, Users, ChevronDown, ChevronRight 
} from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";

// Group participant days under their round, preserving the server's round-major
// order (days arrive sorted round → day_number). Days without a round_id are
// folded into a synthesized section so nothing disappears.
function groupDaysByRound(days, rounds) {
  const byId = new Map((rounds || []).map((r) => [r.id, r]));
  const sections = [];
  const seen = new Map();
  for (const day of days || []) {
    const rid = day.round_id;
    let section = seen.get(rid);
    if (!section) {
      const round = byId.get(rid) || { id: rid, round_number: day.round_number ?? null, name: '', status: null };
      section = { round, days: [] };
      seen.set(rid, section);
      sections.push(section);
    }
    section.days.push(day);
  }
  return sections;
}

export default function Phase3RoadmapViewer({ tournamentId }) {
  const [loading, setLoading] = useState(true);
  const [roadmap, setRoadmap] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null);

  const [expandedDays, setExpandedDays] = useState({});
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedRooms, setExpandedRooms] = useState({});

  useEffect(() => {
    fetchRoadmap();
  }, [tournamentId]);

  const fetchRoadmap = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (data.success && data.roadmap && data.roadmap.days?.length > 0) {
        setRoadmap(data.roadmap);
        setExpandedDays({ [data.roadmap.days[0].id]: true });
      }
      setMode(data.mode || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (id) => setExpandedDays(p => ({ ...p, [id]: !p[id] }));
  const toggleGroup = (id) => setExpandedGroups(p => ({ ...p, [id]: !p[id] }));
  const toggleRoom = (id) => setExpandedRooms(p => ({ ...p, [id]: !p[id] }));

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading roadmap...</div>;
  }
  if (error || !roadmap) {
    return <div className="p-8 text-center text-gray-400">Roadmap not available yet.</div>;
  }
  if (roadmap.days?.length === 0 && mode !== 'organizer') {
    // Participant mode with nothing to show (no team, not allocated, or the
    // roadmap simply has no placement rows yet).
    const noTeam = mode === 'no-team';
    return (
      <div className="bg-[#0A0B10] border border-white/10 rounded-xl overflow-hidden w-full max-w-4xl mx-auto">
        <div className="p-4 bg-white/5 border-b border-white/10">
          <h3 className="font-bold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-indigo-400" />
            Tournament Allocation Roadmap
          </h3>
        </div>
        <div className="p-8 text-center">
          <Users className="w-10 h-10 text-white/20 mx-auto mb-3" />
          <p className="text-sm text-gray-400 font-medium">
            {noTeam
              ? 'Join or register a team for this tournament to see your match schedule here.'
              : 'Your team’s match schedule will appear here once the organizer publishes and approves the roadmap.'}
          </p>
        </div>
      </div>
    );
  }

  const isParticipant = mode === 'participant';
  const renderDay = (day) => {
    const dayGroups = roadmap.groups.filter(g => g.day_id === day.id);
    const isExpandedDay = expandedDays[day.id];

    return (
    <div key={day.id} className="border border-white/5 rounded-lg overflow-hidden bg-[#0D0E15]">
              <button 
                onClick={() => toggleDay(day.id)}
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
              >
                {isExpandedDay ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
                <CalendarDays className="w-6 h-6 text-indigo-400" />
                <span className="font-bold text-white flex-1 text-lg">Day {day.day_number}</span>
                <span className="text-sm text-gray-500">{day.date}</span>
                <span className="text-xs bg-white/10 px-3 py-1.5 rounded text-gray-300">{dayGroups.length} Groups</span>
              </button>
              
              <AnimatePresence>
                {isExpandedDay && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: "auto" }}
                    exit={{ height: 0 }}
                    className="overflow-hidden bg-[#0A0B10]"
                  >
                    <div className="p-4 pl-12 space-y-3">
                      {dayGroups.map(group => {
                        const groupRooms = roadmap.rooms.filter(r => r.group_id === group.id);
                        const isExpandedGroup = expandedGroups[group.id];

                        return (
                          <div key={group.id} className="border border-white/5 rounded-lg overflow-hidden bg-white/[0.02]">
                            <button 
                              onClick={() => toggleGroup(group.id)}
                              className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
                            >
                              {isExpandedGroup ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                              <Layers className="w-5 h-5 text-emerald-400" />
                              <span className="font-semibold text-gray-200 flex-1">{group.group_name}</span>
                              <span className="text-xs bg-white/10 px-2.5 py-1 rounded text-gray-400">{groupRooms.length} Rooms</span>
                            </button>

                            <AnimatePresence>
                              {isExpandedGroup && (
                                <motion.div
                                  initial={{ height: 0 }}
                                  animate={{ height: "auto" }}
                                  exit={{ height: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-3 pl-10 space-y-2">
                                    {groupRooms.map(room => {
                                      const roomMatches = roadmap.matches.filter(m => m.room_id === room.id).sort((a,b) => a.match_number - b.match_number);
                                      const isExpandedRoom = expandedRooms[room.id];
                                      
                                      const roomAssignments = roadmap.assignments ? [...new Set(roadmap.assignments.filter(a => a.room_id === room.id).map(a => a.tournament_team_id))] : [];
                                      const isFull = roomAssignments.length >= room.capacity;

                                      return (
                                        <div key={room.id} className="border border-white/5 rounded-lg overflow-hidden">
                                          <button 
                                            onClick={() => toggleRoom(room.id)}
                                            className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
                                          >
                                            {isExpandedRoom ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                                            <LayoutGrid className="w-4 h-4 text-amber-400" />
                                            <span className="font-medium text-sm text-gray-300 flex-1">Room {room.room_number}</span>
                                            
                                            {/* Phase 7: Verification+Allocation Status */}
                                            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded font-bold ${isFull ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                              <Users className="w-3.5 h-3.5" /> 
                                              {roomAssignments.length} / {room.capacity} Allocated
                                            </span>
                                          </button>
                                          
                                          <AnimatePresence>
                                            {isExpandedRoom && (
                                              <motion.div
                                                initial={{ height: 0 }}
                                                animate={{ height: "auto" }}
                                                exit={{ height: 0 }}
                                                className="overflow-hidden"
                                              >
                                                <div className="p-3 pl-10 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-black/30 rounded-b-lg border-t border-white/5">
                                                  {roomMatches.map(match => (
                                                    <div key={match.id} className="bg-white/5 border border-white/10 p-3 rounded-lg flex items-center justify-between">
                                                      <span className="text-sm font-semibold text-gray-300">Match {match.match_number}</span>
                                                      <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-black/40 px-2.5 py-1 rounded font-medium">
                                                        <Clock className="w-3.5 h-3.5" />
                                                        {match.start_time} - {match.end_time}
                                                      </span>
                                                      {mode === 'participant' && (
                                                        <span className={`ml-2 flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded ${match.credentials_available ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : 'text-amber-400/90 bg-amber-500/10 border border-amber-500/20'}`}>
                                                          {match.credentials_available ? 'Credentials available' : 'Locked'}
                                                        </span>
                                                      )}
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
  };

  return (
    <div className="bg-[#0A0B10] border border-white/10 rounded-xl overflow-hidden w-full max-w-4xl mx-auto">
      <div className="p-4 bg-white/5 border-b border-white/10">
        <h3 className="font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          Tournament Allocation Roadmap
        </h3>
        <p className="text-xs text-gray-400 mt-1">
          {isParticipant
            ? 'Your team’s schedule, organized by round.'
            : 'Expand days and groups to view assigned rooms and matches.'}
        </p>
      </div>

      <div className="p-4 space-y-2">
        {isParticipant
          ? groupDaysByRound(roadmap.days, roadmap.rounds).map((section) => (
              <div key={section.round.id ?? 'round'} className="space-y-2">
                <div className="flex items-center gap-2 px-1 pt-0.5 pb-1">
                  <span className="font-bold text-white">
                    {section.round.round_number != null ? `Round ${section.round.round_number}` : 'Round'}
                    {section.round.name && section.round.name !== `Round ${section.round.round_number}` ? ` · ${section.round.name}` : ''}
                  </span>
                  {section.round.status === 'live' && (
                    <span className="flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                      Live
                    </span>
                  )}
                  {section.round.status === 'completed' && (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-white/5 text-gray-400 border border-white/10">
                      Completed
                    </span>
                  )}
                  {section.round.status === 'configured' && (
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                      Upcoming
                    </span>
                  )}
                </div>
                {section.days.map(renderDay)}
              </div>
            ))
          : roadmap.days.map(renderDay)}
      </div>
    </div>
  );
}
