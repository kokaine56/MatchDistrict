import React, { useState, useEffect } from 'react';
import { Save, CheckCircle2, ShieldAlert, Users, Trophy } from 'lucide-react';
import { getAuthToken } from '../utils/getAuthToken';

export default function MatchResultEntry({ tournamentId, matchDetails, onSaved, onCancel }) {
  const [results, setResults] = useState([]);
  const [scoringRules, setScoringRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, [tournamentId, matchDetails.match_id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = await getAuthToken();
      // Fetch scoring config
      const scoringRes = await fetch(`/api/tournaments/${tournamentId}/scoring`);
      const scoringData = await scoringRes.json();
      const rules = scoringData.scoringRules || { kill_points_multiplier: 1, placement_points_map: {}, wwcd_bonus: 0 };
      setScoringRules(rules);

      // Fetch allocated teams for this match
      const allocRes = await fetch(`/api/tournaments/${tournamentId}/allocations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const allocData = await allocRes.json();
      
      const allocatedTeams = (allocData.teams || []).filter(t => t.match_id === matchDetails.match_id);

      // Fetch existing results for this match
      const resultsRes = await fetch(`/api/tournaments/${tournamentId}/matches/${matchDetails.match_id}/results`);
      const resultsData = await resultsRes.json();
      const existingResults = resultsData.results || [];

      // Merge
      const merged = allocatedTeams.map(team => {
        const existing = existingResults.find(r => r.team_id === team.id);
        return {
          team_id: team.id,
          team_name: team.team_name,
          placement: existing ? existing.placement : '',
          kills: existing ? existing.kills : 0
        };
      });

      setResults(merged);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResultChange = (teamId, field, value) => {
    setResults(prev => prev.map(r => 
      r.team_id === teamId ? { ...r, [field]: value } : r
    ));
  };

  const calculatePreviewPoints = (placement, kills) => {
    if (!scoringRules || placement === '' || kills === '') return 0;
    const p = parseInt(placement, 10);
    const k = parseInt(kills, 10);
    if (isNaN(p) || isNaN(k)) return 0;

    let pts = k * (scoringRules.kill_points_multiplier || 1);
    if (scoringRules.placement_points_map && scoringRules.placement_points_map[String(p)]) {
      pts += Number(scoringRules.placement_points_map[String(p)]);
    }
    if (p === 1 && scoringRules.wwcd_bonus) {
      pts += scoringRules.wwcd_bonus;
    }
    return pts;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Validate
      const validResults = results.filter(r => r.placement !== '' && r.kills !== '');
      if (validResults.length === 0) throw new Error("No complete results to save.");

      // Check for duplicate placements
      const placements = validResults.map(r => parseInt(r.placement, 10));
      const uniquePlacements = new Set(placements);
      if (placements.length !== uniquePlacements.size) {
        throw new Error("Duplicate placements detected. Each team must have a unique placement.");
      }

      const payload = validResults.map(r => ({
        team_id: r.team_id,
        placement: parseInt(r.placement, 10),
        kills: parseInt(r.kills, 10)
      }));

      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/matches/${matchDetails.match_id}/results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ results: payload })
      });
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error || data.message);

      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400 font-medium">Loading match data...</div>;
  }

  return (
    <div className="bg-[#0A0C10] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-indigo-400" />
            Enter Match Results
          </h3>
          <p className="text-gray-400 text-sm font-medium mt-1">
            Match {matchDetails.match_number} &bull; Room {matchDetails.room_number} &bull; Day {matchDetails.day_number}
          </p>
        </div>
        <button onClick={onCancel} className="text-gray-500 hover:text-white transition-colors px-3 py-1 bg-white/5 rounded-lg text-sm font-bold">
          Close
        </button>
      </div>

      <div className="p-5">
        {error && (
          <div className="mb-6 p-4 rounded-xl border bg-red-500/10 border-red-500/20 text-red-400 flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {results.length === 0 ? (
          <div className="text-center py-10">
            <Users className="w-12 h-12 text-white/10 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">No teams are currently allocated to this match.</p>
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div className="overflow-x-auto rounded-xl border border-white/5">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-black/40 text-gray-500 uppercase tracking-wider text-xs">
                    <th className="px-4 py-3 font-semibold w-1/2">Team</th>
                    <th className="px-4 py-3 font-semibold text-center w-20">Placement</th>
                    <th className="px-4 py-3 font-semibold text-center w-20">Kills</th>
                    <th className="px-4 py-3 font-semibold text-right w-24">Pts Preview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-[#11131A]">
                  {results.map(r => (
                    <tr key={r.team_id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-bold text-gray-200">
                        {r.team_name}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={r.placement}
                          onChange={(e) => handleResultChange(r.team_id, 'placement', e.target.value)}
                          className="w-16 bg-black/60 border border-white/10 rounded-lg p-2 text-center text-white focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="number"
                          min="0"
                          value={r.kills}
                          onChange={(e) => handleResultChange(r.team_id, 'kills', e.target.value)}
                          className="w-16 bg-black/60 border border-white/10 rounded-lg p-2 text-center text-white focus:outline-none focus:border-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-black text-indigo-400">
                        {calculatePreviewPoints(r.placement, r.kills)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <div className="text-xs text-gray-500 mr-auto font-medium">
                Scores will be calculated authoritatively on the server using the active scoring configuration.
              </div>
              <button 
                type="submit" 
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-500/20 disabled:opacity-50"
              >
                {saving ? 'Saving...' : (
                  <>
                    <Save className="w-4 h-4" /> Save Results
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
