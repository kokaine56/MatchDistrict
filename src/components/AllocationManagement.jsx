import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Layers, Users, Activity, CheckCircle, Search, Edit3, XCircle, Trophy } from 'lucide-react';
import { getAuthToken } from '../utils/getAuthToken';
import MatchResultEntry from './MatchResultEntry';

export default function AllocationManagement({ tournamentId, isGoldTheme }) {
  const [data, setData] = useState({ metrics: null, teams: [] });
  const [loading, setLoading] = useState(true);
  const [roadmap, setRoadmap] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeam, setSelectedTeam] = useState(null);
  
  // Modals
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [moveForm, setMoveForm] = useState({ matchId: '', roomId: '', groupId: '', dayId: '', reason: '' });
  const [releaseReason, setReleaseReason] = useState('');
  
  const [healthStatus, setHealthStatus] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState('teams'); // 'teams' or 'matches'
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [credsForm, setCredsForm] = useState({ room_identifier: '', room_password: '' });
  const [showCredsModal, setShowCredsModal] = useState(false);
  const [selectedResultMatch, setSelectedResultMatch] = useState(null);

  useEffect(() => {
    fetchAllocations();
    fetchRoadmap();
  }, [tournamentId]);

  const fetchAllocations = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/allocations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await res.json();
      if (result.success) {
        setData({ metrics: result.metrics, teams: result.teams });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoadmap = async () => {
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/roadmap`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await res.json();
      if (result.success && result.roadmap) {
        setRoadmap(result.roadmap);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const runHealthCheck = async () => {
    setHealthLoading(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/allocations/health`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const result = await res.json();
      if (result.success) {
        setHealthStatus(result);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setHealthLoading(false);
    }
  };

  const handleMove = async (e) => {
    e.preventDefault();
    if (!moveForm.matchId || !moveForm.reason) return setError('Please select a position and provide a reason.');
    
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/allocations/move`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          ...moveForm
        })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || result.message);
      
      setShowMoveModal(false);
      setSelectedTeam(null);
      fetchAllocations();
      fetchRoadmap();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRelease = async (e) => {
    e.preventDefault();
    if (!releaseReason) return setError('Please provide a reason.');
    
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/allocations/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          teamId: selectedTeam.id,
          reason: releaseReason
        })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || result.message);
      
      setShowReleaseModal(false);
      setSelectedTeam(null);
      fetchAllocations();
      fetchRoadmap();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${selectedMatch.id}/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(credsForm)
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || result.message);
      
      setShowCredsModal(false);
      setSelectedMatch(null);
      fetchRoadmap(); // Refresh to show updated status
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTeams = data.teams.filter(t => 
    t.team_name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (t.leader_name && t.leader_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const allMatches = [];
  if (roadmap?.days) {
    roadmap.days.forEach(d => {
      d.groups?.forEach(g => {
        g.rooms?.forEach(r => {
          r.matches?.forEach(m => {
            allMatches.push({
              ...m,
              day_number: d.day_number,
              date: d.date,
              group_name: g.group_name,
              room_number: r.room_number
            });
          });
        });
      });
    });
  }

  const filteredMatches = allMatches.filter(m => 
    m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.group_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#11131A] border border-white/5 p-4 rounded-xl shadow-sm">
          <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2"><Users className="w-3.5 h-3.5" /> Total Teams</div>
          <div className="text-2xl font-black text-white">{data.metrics?.total_teams || 0}</div>
        </div>
        <div className="bg-[#11131A] border border-white/5 p-4 rounded-xl shadow-sm">
          <div className="text-emerald-500/80 text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2"><CheckCircle className="w-3.5 h-3.5" /> Verified</div>
          <div className="text-2xl font-black text-emerald-400">{data.metrics?.verified || 0}</div>
        </div>
        <div className="bg-[#11131A] border border-white/5 p-4 rounded-xl shadow-sm">
          <div className="text-indigo-500/80 text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2"><Layers className="w-3.5 h-3.5" /> Allocated</div>
          <div className="text-2xl font-black text-indigo-400">{data.metrics?.allocated || 0}</div>
        </div>
        <div className="bg-[#11131A] border border-white/5 p-4 rounded-xl shadow-sm">
          <div className="text-amber-500/80 text-xs font-semibold uppercase tracking-wider mb-1 flex items-center gap-2"><Activity className="w-3.5 h-3.5" /> Pending Alloc.</div>
          <div className="text-2xl font-black text-amber-400">{data.metrics?.pending_allocation || 0}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Search teams..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#0A0C10] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
        <button 
          onClick={runHealthCheck}
          disabled={healthLoading}
          className="bg-[#11131A] hover:bg-[#1A1C23] border border-white/10 text-gray-300 text-sm font-semibold py-2 px-4 rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          {healthLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
          Health Check
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 bg-black/40 p-1 rounded-lg w-max border border-white/5">
        <button
          onClick={() => setViewMode('teams')}
          className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'teams' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Teams
        </button>
        <button
          onClick={() => setViewMode('matches')}
          className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'matches' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Matches & Credentials
        </button>
      </div>

      {/* Health Check Status */}
      {healthStatus && (
        <div className={`p-4 rounded-xl border ${healthStatus.healthy ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
          <div className="font-bold flex items-center gap-2 mb-1">
            {healthStatus.healthy ? <CheckCircle className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
            {healthStatus.healthy ? 'Allocation Health: OK' : 'Allocation Health: ISSUES DETECTED'}
          </div>
          {!healthStatus.healthy && (
            <ul className="list-disc list-inside text-sm mt-2 opacity-90">
              {healthStatus.issues.map((issue, i) => <li key={i}>{issue}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Teams Table */}
      {viewMode === 'teams' && (
        <div className="bg-[#11131A] border border-white/5 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center"><RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold">Team</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Allocation</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {filteredTeams.map(team => (
                    <tr key={team.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-100">{team.team_name}</div>
                        <div className="text-xs text-gray-500">{team.leader_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          team.status === 'allocated' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                          team.status === 'allocation_pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                          team.status === 'verified' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                        }`}>
                          {team.status.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {team.status === 'allocated' && team.match_id ? (
                          <div className="text-xs font-medium text-gray-300">
                            Day {team.day_number} &rarr; Group {team.group_name} &rarr; Room {team.room_number} &rarr; Match {team.match_number}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedTeam(team)}
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-bold uppercase tracking-wider transition-colors"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredTeams.length === 0 && (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 text-sm">No teams found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Matches Table */}
      {viewMode === 'matches' && (
        <div className="bg-[#11131A] border border-white/5 rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-12 flex justify-center"><RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/20 text-gray-400 text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 font-semibold">Match</th>
                    <th className="px-4 py-3 font-semibold">Schedule</th>
                    <th className="px-4 py-3 font-semibold">Credentials</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {filteredMatches.map(match => (
                    <tr key={match.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-gray-100">Match {match.match_number}</div>
                        <div className="text-xs text-gray-500">Room {match.room_number}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs font-medium text-gray-300">Day {match.day_number} ({match.date})</div>
                        <div className="text-xs text-gray-500">{match.start_time} - {match.end_time} &bull; {match.group_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          match.credential_status === 'Configured' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {match.credential_status || 'Not Configured'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => {
                              setSelectedResultMatch(match);
                            }}
                            className="bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5"
                          >
                            <Trophy className="w-3.5 h-3.5" />
                            Results
                          </button>
                          <button
                            onClick={() => {
                              setSelectedMatch(match);
                              setCredsForm({ room_identifier: match.room_identifier || '', room_password: match.room_password || '' });
                              setShowCredsModal(true);
                            }}
                            className="bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 px-3 py-1.5 rounded-lg transition-colors text-xs font-bold flex items-center gap-1.5"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Credentials
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredMatches.length === 0 && (
                    <tr><td colSpan="4" className="px-4 py-8 text-center text-gray-500 text-sm">No matches found in roadmap.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Manage Drawer/Modal */}
      {selectedTeam && !showMoveModal && !showReleaseModal && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={() => setSelectedTeam(null)}>
          <div className="w-full max-w-sm bg-[#0A0C10] border-l border-white/10 h-full p-6 overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-white">Manage Allocation</h2>
              <button onClick={() => setSelectedTeam(null)} className="p-1 hover:bg-white/10 rounded-full transition-colors"><XCircle className="w-5 h-5 text-gray-400" /></button>
            </div>
            
            <div className="space-y-4 mb-8">
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Team Name</div>
                <div className="text-white font-bold">{selectedTeam.team_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Verification Status</div>
                <div className="text-emerald-400 font-bold">{selectedTeam.status.replace('_', ' ').toUpperCase()}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase mb-1">Current Assignment</div>
                {selectedTeam.status === 'allocated' ? (
                  <div className="bg-white/5 p-3 rounded-lg border border-white/10 text-sm font-medium text-gray-300">
                    Day {selectedTeam.day_number}<br/>
                    Group {selectedTeam.group_name}<br/>
                    Room {selectedTeam.room_number}<br/>
                    Match {selectedTeam.match_number}
                  </div>
                ) : (
                  <div className="text-amber-400 font-bold text-sm">No current assignment.</div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  setMoveForm({ matchId: '', roomId: '', groupId: '', dayId: '', reason: '' });
                  setShowMoveModal(true);
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Edit3 className="w-4 h-4" /> Move Allocation
              </button>
              {selectedTeam.status === 'allocated' && (
                <button
                  onClick={() => { setReleaseReason(''); setShowReleaseModal(true); }}
                  className="w-full py-3 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-xl font-bold transition-colors"
                >
                  Release Allocation
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Move Modal */}
      {showMoveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0C10] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl p-6">
            <h3 className="text-xl font-black text-white mb-1">Move Allocation</h3>
            <p className="text-sm text-gray-400 mb-6">Select a new position for {selectedTeam.team_name}</p>
            
            {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm font-medium">{error}</div>}
            
            <form onSubmit={handleMove} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Select Destination (Phase 3 Roadmap)</label>
                <select 
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  value={moveForm.matchId}
                  onChange={(e) => {
                    if (!e.target.value) return setMoveForm({ matchId: '', roomId: '', groupId: '', dayId: '', reason: moveForm.reason });
                    const match = JSON.parse(e.target.options[e.target.selectedIndex].dataset.match);
                    setMoveForm({ matchId: match.match_id, roomId: match.room_id, groupId: match.group_id, dayId: match.day_id, reason: moveForm.reason });
                  }}
                  required
                >
                  <option value="">-- Choose Match --</option>
                  {roadmap?.days?.map(day => (
                    <optgroup key={day.id} label={`Day ${day.day_number}`}>
                      {roadmap.matches?.filter(m => roadmap.rooms?.find(r => r.id === m.room_id)?.day_id === day.id).map(match => {
                        const room = roadmap.rooms.find(r => r.id === match.room_id);
                        const group = roadmap.groups.find(g => g.id === room.group_id);
                        const roomAssignments = roadmap.assignments ? [...new Set(roadmap.assignments.filter(a => a.room_id === room.id).map(a => a.tournament_team_id))] : [];
                        const isFull = roomAssignments.length >= room.capacity;
                        
                        return (
                          <option 
                            key={match.id} 
                            value={match.id} 
                            disabled={isFull}
                            data-match={JSON.stringify({ match_id: match.id, room_id: room.id, group_id: group.id, day_id: day.id })}
                          >
                            Group {group.group_name} - Room {room.room_number} - Match {match.match_number} {isFull ? '(FULL)' : `(${roomAssignments.length}/${room.capacity})`}
                          </option>
                        );
                      })}
                    </optgroup>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Reason (Required for Audit)</label>
                <input 
                  type="text"
                  value={moveForm.reason}
                  onChange={e => setMoveForm({ ...moveForm, reason: e.target.value })}
                  placeholder="e.g. Schedule adjustment requested by team"
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setShowMoveModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50">
                  {submitting ? 'Moving...' : 'Confirm Move'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Release Modal */}
      {showReleaseModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0C10] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6">
            <h3 className="text-xl font-black text-red-500 mb-1">Release Allocation</h3>
            <p className="text-sm text-gray-400 mb-6">Are you sure you want to release {selectedTeam.team_name} from their slot? They will be marked as allocation pending.</p>
            
            {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm font-medium">{error}</div>}
            
            <form onSubmit={handleRelease} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Reason (Required for Audit)</label>
                <input 
                  type="text"
                  value={releaseReason}
                  onChange={e => setReleaseReason(e.target.value)}
                  placeholder="e.g. Disqualified or moved to waitlist"
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-red-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setShowReleaseModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50">
                  {submitting ? 'Releasing...' : 'Release Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Match Credentials Modal */}
      {showCredsModal && selectedMatch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#0A0C10] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-black text-white">Edit Credentials</h3>
              <button onClick={() => setShowCredsModal(false)} className="text-gray-500 hover:text-white"><XCircle className="w-5 h-5"/></button>
            </div>
            
            <p className="text-sm text-gray-400 mb-6">
              Match {selectedMatch.match_number} &bull; Room {selectedMatch.room_number} &bull; Day {selectedMatch.day_number}
            </p>
            
            {error && <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-sm font-medium">{error}</div>}
            
            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Room ID / Identifier</label>
                <input 
                  type="text"
                  value={credsForm.room_identifier}
                  onChange={e => setCredsForm({ ...credsForm, room_identifier: e.target.value })}
                  placeholder="e.g. 88392102"
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Room Password</label>
                <input 
                  type="text"
                  value={credsForm.room_password}
                  onChange={e => setCredsForm({ ...credsForm, room_password: e.target.value })}
                  placeholder="e.g. mdx2024"
                  className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mt-4 text-xs text-amber-500/90 font-medium">
                Note: Credentials will automatically become visible to allocated participants exactly at the configured release time before the match starts.
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button type="button" onClick={() => setShowCredsModal(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-gray-400 hover:text-white transition-colors">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </form>
          </div>
        </div>

      )}

      {selectedResultMatch && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-4xl my-auto">
            <MatchResultEntry 
              tournamentId={tournamentId} 
              matchDetails={selectedResultMatch}
              onSaved={() => setSelectedResultMatch(null)}
              onCancel={() => setSelectedResultMatch(null)}
            />
          </div>
        </div>
      )}

    </div>
  );
}
