import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CalendarDays, Layers, LayoutGrid, Clock, Users, ChevronDown, ChevronRight 
} from "lucide-react";
import { getAuthToken } from "../utils/getAuthToken";

export default function Phase3RoadmapViewer({ tournamentId }) {
  const [loading, setLoading] = useState(true);
  const [roadmap, setRoadmap] = useState(null);
  const [error, setError] = useState(null);

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

  return (
    <div className="bg-[#0A0B10] border border-white/10 rounded-xl overflow-hidden w-full max-w-4xl mx-auto">
      <div className="p-4 bg-white/5 border-b border-white/10">
        <h3 className="font-bold text-white flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-indigo-400" />
          Tournament Allocation Roadmap
        </h3>
        <p className="text-xs text-gray-400 mt-1">Expand days and groups to view assigned rooms and matches.</p>
      </div>
      
      <div className="p-4 space-y-2">
        {roadmap.days.map((day) => {
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
  );
}
