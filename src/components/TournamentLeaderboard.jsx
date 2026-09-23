import React, { useState, useEffect } from 'react';
import { Trophy, Medal, Target, Crown, AlertCircle } from 'lucide-react';

export default function TournamentLeaderboard({ tournamentId }) {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLeaderboard();
  }, [tournamentId]);

  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/leaderboard`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load leaderboard');
      setStandings(data.standings || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20 text-indigo-400 font-bold animate-pulse">
        <Trophy className="w-8 h-8 mr-3 opacity-50" />
        Calculating Standings...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-400 bg-red-500/10 rounded-2xl border border-red-500/20">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p className="font-bold">{error}</p>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className="p-12 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.02]">
        <Trophy className="w-16 h-16 mx-auto mb-4 text-white/10" />
        <h3 className="text-xl font-black text-gray-300 mb-2">No Results Yet</h3>
        <p className="text-gray-500 text-sm max-w-sm mx-auto">
          The leaderboard will update automatically once match results are verified by the organizers.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      
      {/* Top 3 Podium (Desktop) */}
      <div className="hidden md:flex justify-center items-end gap-6 h-64 mb-10 mt-12">
        {/* Rank 2 */}
        {standings[1] && (
          <div className="w-48 bg-gradient-to-t from-gray-300/20 to-gray-300/5 rounded-t-xl border border-b-0 border-gray-300/30 flex flex-col items-center justify-start p-4 relative" style={{ height: '80%' }}>
            <div className="absolute -top-12 bg-[#0A0C10] p-2 rounded-full border border-gray-300/30 shadow-[0_0_20px_rgba(209,213,219,0.1)]">
              <Medal className="w-10 h-10 text-gray-300" />
            </div>
            <div className="mt-8 text-center">
              <div className="font-black text-gray-100 text-lg truncate w-40">{standings[1].team_name}</div>
              <div className="text-sm font-bold text-gray-400">{standings[1].total_points} PTS</div>
            </div>
          </div>
        )}
        
        {/* Rank 1 */}
        {standings[0] && (
          <div className="w-56 bg-gradient-to-t from-yellow-400/20 to-yellow-400/5 rounded-t-xl border border-b-0 border-yellow-400/40 flex flex-col items-center justify-start p-4 relative shadow-[0_-10px_30px_rgba(250,204,21,0.1)]" style={{ height: '100%' }}>
            <div className="absolute -top-14 bg-[#0A0C10] p-3 rounded-full border border-yellow-400/50 shadow-[0_0_30px_rgba(250,204,21,0.3)]">
              <Crown className="w-12 h-12 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]" />
            </div>
            <div className="mt-10 text-center">
              <div className="font-black text-yellow-400 text-xl truncate w-48">{standings[0].team_name}</div>
              <div className="text-md font-black text-yellow-500 mt-1">{standings[0].total_points} PTS</div>
              <div className="text-xs text-yellow-400/60 font-bold mt-2 uppercase tracking-widest">{standings[0].total_kills} Kills &bull; {standings[0].wwcd_count} WWCD</div>
            </div>
          </div>
        )}
        
        {/* Rank 3 */}
        {standings[2] && (
          <div className="w-48 bg-gradient-to-t from-amber-600/20 to-amber-600/5 rounded-t-xl border border-b-0 border-amber-600/30 flex flex-col items-center justify-start p-4 relative" style={{ height: '70%' }}>
            <div className="absolute -top-12 bg-[#0A0C10] p-2 rounded-full border border-amber-600/30 shadow-[0_0_20px_rgba(217,119,6,0.1)]">
              <Medal className="w-10 h-10 text-amber-600" />
            </div>
            <div className="mt-8 text-center">
              <div className="font-black text-gray-100 text-lg truncate w-40">{standings[2].team_name}</div>
              <div className="text-sm font-bold text-gray-400">{standings[2].total_points} PTS</div>
            </div>
          </div>
        )}
      </div>

      {/* Leaderboard Table */}
      <div className="bg-[#0A0C10] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-black/40 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold text-center w-16">Rank</th>
                <th className="px-6 py-4 font-bold">Team</th>
                <th className="px-6 py-4 font-bold text-center">Played</th>
                <th className="px-6 py-4 font-bold text-center">Place Pts</th>
                <th className="px-6 py-4 font-bold text-center">Kill Pts</th>
                <th className="px-6 py-4 font-bold text-center">Total Kills</th>
                <th className="px-6 py-4 font-bold text-center">WWCD</th>
                <th className="px-6 py-4 font-black text-right text-white">Total Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-sm font-medium">
              {standings.map((team, idx) => (
                <tr 
                  key={team.team_id} 
                  className={`hover:bg-white/[0.02] transition-colors ${
                    idx === 0 ? 'bg-yellow-400/[0.02] border-l-2 border-l-yellow-400' : 
                    idx === 1 ? 'bg-gray-300/[0.02] border-l-2 border-l-gray-300' :
                    idx === 2 ? 'bg-amber-600/[0.02] border-l-2 border-l-amber-600' : ''
                  }`}
                >
                  <td className="px-6 py-4 text-center">
                    {idx === 0 ? <Crown className="w-5 h-5 text-yellow-400 mx-auto" /> :
                     idx === 1 ? <Medal className="w-5 h-5 text-gray-300 mx-auto" /> :
                     idx === 2 ? <Medal className="w-5 h-5 text-amber-600 mx-auto" /> :
                     <span className="text-gray-500 font-bold">#{team.rank}</span>}
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-black text-white">{team.team_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">LDR: {team.leader_name}</div>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-400">{team.matches_played}</td>
                  <td className="px-6 py-4 text-center text-gray-400">{team.total_placement_points}</td>
                  <td className="px-6 py-4 text-center text-gray-400">{team.total_kill_points}</td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-1 text-red-400/80">
                      <Target className="w-3.5 h-3.5" />
                      {team.total_kills}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {team.wwcd_count > 0 ? (
                      <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-2 py-0.5 rounded font-bold text-xs">
                        {team.wwcd_count}
                      </span>
                    ) : (
                      <span className="text-gray-600">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-lg font-black text-indigo-400">{team.total_points}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}