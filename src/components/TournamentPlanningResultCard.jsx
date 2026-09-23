import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, AlertCircle, CalendarDays, Swords, Home, ArrowRight, ShieldCheck, RefreshCw, X } from "lucide-react";

export default function TournamentPlanningResultCard({
  tournamentId,
  tournamentTitle,
  onClose,
  onRegenerate,
  onApproved
}) {
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchResult();
  }, [tournamentId]);

  const fetchResult = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/planning-result`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to fetch planning result.');
      }
      setResult(data.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/planning-result/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      if (!data.success) {
        if (data.messages && Array.isArray(data.messages)) {
          throw new Error(data.messages.join(' '));
        }
        throw new Error(data.message || data.error || 'Failed to generate plan.');
      }
      setResult(data.result);
      if (onRegenerate) onRegenerate(data.result);
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
      const res = await fetch(`/api/tournaments/${tournamentId}/planning-result/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to approve plan.');
      }
      setResult(data.result);
      if (onApproved) onApproved(data.result);
    } catch (err) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="bg-surface border border-surface-light rounded-xl p-8 shadow-xl max-w-md w-full flex flex-col items-center justify-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-4" />
          <p className="text-on-surface">Loading planning result...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[#07080C] border border-white/10 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-[#07080C]/90 backdrop-blur-md border-b border-white/10 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-indigo-400" />
              Tournament Plan
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
        <div className="p-6 space-y-8 flex-1">
          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {!result ? (
            <div className="text-center py-12">
              <CalendarDays className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-2">No Plan Generated</h3>
              <p className="text-gray-400 max-w-md mx-auto mb-6">
                This tournament has a configuration, but a capacity plan has not been generated yet.
              </p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
              >
                {generating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CalendarDays className="w-5 h-5" />}
                Generate Plan
              </button>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              <div className={`p-4 rounded-xl border flex items-center justify-between ${result.plan_status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-indigo-500/10 border-indigo-500/20'}`}>
                <div className="flex items-center gap-3">
                  {result.plan_status === 'approved' ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <Info className="w-6 h-6 text-indigo-400" />
                  )}
                  <div>
                    <h3 className={`font-semibold ${result.plan_status === 'approved' ? 'text-emerald-400' : 'text-indigo-400'}`}>
                      {result.plan_status === 'approved' ? 'Plan Approved' : 'Plan Generated'}
                    </h3>
                    <p className="text-sm text-gray-400">
                      Version {result.plan_version} • Generated on {new Date(result.generated_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {result.plan_status !== 'approved' && (
                  <button
                    onClick={handleApprove}
                    disabled={approving}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {approving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Approve Plan
                  </button>
                )}
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2 text-gray-400">
                    <Home className="w-5 h-5" />
                    <span className="text-sm font-medium">Required Rooms</span>
                  </div>
                  <div className="text-3xl font-black text-white">{result.required_rooms}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    Based on {result.planning_team_count} teams max.
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2 text-gray-400">
                    <Swords className="w-5 h-5" />
                    <span className="text-sm font-medium">Room Sessions</span>
                  </div>
                  <div className="text-3xl font-black text-white">{result.total_room_sessions}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    At {result.matches_per_team} matches per team.
                  </p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-2 text-gray-400">
                    <CalendarDays className="w-5 h-5" />
                    <span className="text-sm font-medium">Required Days</span>
                  </div>
                  <div className="text-3xl font-black text-white">{result.required_days}</div>
                  <p className="text-xs text-gray-500 mt-1">
                    {result.effective_daily_capacity} sessions max per day.
                  </p>
                </div>
              </div>

              {/* Calculation Explanation */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm text-gray-300 leading-relaxed">
                <h4 className="font-bold text-white mb-2">Calculation Explanation:</h4>
                <p className="mb-2">
                  <strong className="text-indigo-400">{result.planning_team_count}</strong> teams require <strong className="text-indigo-400">{result.required_rooms}</strong> rooms at {result.teams_per_room} teams per room.
                  Every team plays {result.matches_per_team} matches, making a total workload of <strong className="text-indigo-400">{result.total_room_sessions}</strong> room-match sessions.
                </p>
                <p>
                  Only <strong className="text-indigo-400">{result.max_simultaneous_rooms}</strong> rooms can operate simultaneously. 
                  Based on a match duration of {result.match_duration_minutes} min and {result.break_between_matches_minutes} min break, 
                  the system calculated an effective daily capacity of <strong className="text-indigo-400">{result.effective_daily_capacity}</strong> sessions.
                  Therefore, the tournament will require <strong className="text-indigo-400">{result.required_days}</strong> days to complete.
                </p>
              </div>

              {/* Daily Plan Table */}
              <div>
                <h3 className="text-lg font-bold text-white mb-4">Daily Schedule Plan</h3>
                <div className="bg-[#0A0B10] border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm text-gray-300">
                    <thead className="bg-white/5 text-gray-400 uppercase text-xs">
                      <tr>
                        <th className="px-4 py-3 font-medium">Day</th>
                        <th className="px-4 py-3 font-medium">Date</th>
                        <th className="px-4 py-3 font-medium">Planned Sessions</th>
                        <th className="px-4 py-3 font-medium">Daily Capacity</th>
                        <th className="px-4 py-3 font-medium">Utilization</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {result.daily_plan && typeof result.daily_plan === 'string' ? JSON.parse(result.daily_plan).map((day, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-medium text-white">Day {day.dayNumber}</td>
                          <td className="px-4 py-3">{day.date}</td>
                          <td className="px-4 py-3 font-bold text-indigo-400">{day.plannedRoomMatchSessions}</td>
                          <td className="px-4 py-3 text-gray-500">{day.availableRoomCapacity}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${day.utilization > 90 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                  style={{ width: `${Math.min(100, day.utilization)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-500">{day.utilization}%</span>
                            </div>
                          </td>
                        </tr>
                      )) : result.daily_plan.map((day, idx) => (
                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-3 font-medium text-white">Day {day.dayNumber}</td>
                          <td className="px-4 py-3">{day.date}</td>
                          <td className="px-4 py-3 font-bold text-indigo-400">{day.plannedRoomMatchSessions}</td>
                          <td className="px-4 py-3 text-gray-500">{day.availableRoomCapacity}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-24 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${day.utilization > 90 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                                  style={{ width: `${Math.min(100, day.utilization)}%` }}
                                ></div>
                              </div>
                              <span className="text-xs text-gray-500">{day.utilization}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {result && result.plan_status !== 'approved' && (
          <div className="bg-white/5 border-t border-white/10 p-5 flex items-center justify-between">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
              Regenerate Plan
            </button>
            <p className="text-xs text-gray-500">
              This is a proposed capacity plan. No final rooms or matches are created until Phase 3.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
