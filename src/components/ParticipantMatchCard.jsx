import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Copy, CheckCircle, Clock, Trophy } from 'lucide-react';
import { getAuthToken } from '../utils/getAuthToken';

// B10 ARCHITECTURE NOTE: Both team leaders and invited teammates use ParticipantMatchCard
// to view match credentials and schedules. All members query the authoritative GET /credentials
// endpoint which enforces the two-stage squad gate and waiver checks uniformly.

export default function ParticipantMatchCard({ tournamentId, matchDetails, teamId }) {
  const [credentials, setCredentials] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  const fetchData = async () => {
    try {
      const token = await getAuthToken();
      
      const credsRes = await fetch(`/api/tournaments/${tournamentId}/matches/${matchDetails.match_id}/credentials`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const credsData = await credsRes.json();
      if (credsData.success) {
        setCredentials(credsData);
      }

      if (teamId) {
        const resultRes = await fetch(`/api/tournaments/${tournamentId}/matches/${matchDetails.match_id}/results`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const resultData = await resultRes.json();
        if (resultData.success && resultData.results) {
          const myResult = resultData.results.find(r => r.team_id === teamId);
          if (myResult) setResult(myResult);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [tournamentId, matchDetails.match_id, teamId]);

  useEffect(() => {
    if (!credentials || credentials.status === 'released') return;
    if (!credentials.releaseTime) return;
    
    const interval = setInterval(() => {
      const now = new Date();
      const release = new Date(credentials.releaseTime);
      const diff = release.getTime() - now.getTime();
      
      if (diff <= 0) {
        clearInterval(interval);
        setTimeLeft('Available now. Refreshing...');
        fetchData();
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [credentials]);

  const handleCopy = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'id') {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } else if (type === 'pass') {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    } else {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const isReleased = credentials?.status === 'released';

  return (
    <div className="bg-[#11131A] border border-white/5 rounded-2xl overflow-hidden shadow-lg mt-4 max-w-2xl">
      <div className="p-5 border-b border-white/5 flex items-center justify-between bg-black/20">
        <div>
          <h3 className="text-xl font-black text-white">
            {matchDetails.round_number != null ? `ROUND ${matchDetails.round_number} · MATCH ${matchDetails.match_number}` : `MATCH ${matchDetails.match_number}`}
          </h3>
          <p className="text-gray-400 text-sm font-medium mt-0.5">
            {matchDetails.round_name ? `${matchDetails.round_name} · ` : ''}{matchDetails.group_name ? (matchDetails.group_name.startsWith('District') ? matchDetails.group_name : `District ${matchDetails.group_name.replace(/\D+/g, '')}`) + ' • ' : ''}Day {matchDetails.day_number || 1} &bull; Match {matchDetails.match_number}
          </p>
        </div>
        <div className="text-right">
          <div className="text-emerald-400 font-bold text-sm bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
            Upcoming
          </div>
        </div>
      </div>
      
      <div className="p-5">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date</div>
            <div className="text-gray-200 font-medium">{matchDetails.date || 'TBD'}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Start Time</div>
            <div className="text-gray-200 font-medium">{matchDetails.start_time || 'TBD'}</div>
          </div>
        </div>

        <div className="border border-white/10 rounded-xl overflow-hidden">
          <div className="bg-black/40 p-4 border-b border-white/10 flex items-center justify-between">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              {isReleased ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-amber-400" />}
              BGMI ROOM CREDENTIALS
            </h4>
            {loading ? (
              <span className="text-xs text-gray-500 font-medium flex items-center gap-2"><Clock className="w-3 h-3 animate-spin"/> Loading...</span>
            ) : isReleased ? (
              <span className="text-xs font-bold text-emerald-400">Credentials Released</span>
            ) : (
              <span className="text-xs font-bold text-amber-400">
                {credentials?.releaseTime ? `Available at: ${new Date(credentials.releaseTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Locked'}
              </span>
            )}
          </div>
          
          <div className="p-4 bg-white/[0.02]">
            {!isReleased && !loading && (
              <div className="text-center py-6">
                <Lock className="w-8 h-8 text-white/20 mx-auto mb-3" />
                {credentials?.reason === 'squad_incomplete' ? (
                  <div className="max-w-md mx-auto space-y-2">
                    <p className="text-sm text-amber-400 font-bold">
                      Squad Incomplete ({credentials.joined != null ? credentials.joined : '?'}/{credentials.required != null ? credentials.required : '?'})
                    </p>
                    <p className="text-xs text-gray-400 font-medium">
                      {credentials.message || 'Every roster slot must be claimed by a registered teammate before room credentials can be unlocked.'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Teammates must join via the team invitation link to link their accounts and unlock match credentials.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-gray-400 font-medium">This match’s BGMI room credentials are currently locked.</p>
                    {timeLeft && <p className="text-xs text-amber-500/80 font-bold mt-2 bg-amber-500/10 inline-block px-3 py-1 rounded-full border border-amber-500/20">Available in: {timeLeft}</p>}
                  </>
                )}
              </div>
            )}

            {isReleased && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">BGMI Room ID</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/60 border border-white/10 rounded-lg p-3 text-lg font-mono text-white tracking-widest break-all">
                        {credentials.room_identifier || 'Not Set'}
                      </div>
                      <button 
                        onClick={() => handleCopy(credentials.room_identifier || '', 'id')}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors min-w-[50px] flex justify-center"
                        title="Copy BGMI Room ID"
                      >
                        {copiedId ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-black/60 border border-white/10 rounded-lg p-3 text-lg font-mono text-white tracking-widest break-all">
                        {credentials.room_password || 'Not Set'}
                      </div>
                      <button 
                        onClick={() => handleCopy(credentials.room_password || '', 'pass')}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors min-w-[50px] flex justify-center"
                        title="Copy Password"
                      >
                        {copiedPass ? <CheckCircle className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={() => handleCopy(`Room ID: ${credentials.room_identifier}\nPassword: ${credentials.room_password}`, 'all')}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors mt-2"
                >
                  {copiedAll ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedAll ? 'Details Copied' : 'Copy Room Details'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Results Section */}
        {result && result.status === 'verified' && (
          <div className="mt-6 border border-emerald-500/20 rounded-xl overflow-hidden bg-emerald-500/[0.02]">
            <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 font-bold text-sm uppercase tracking-wider">Official Result</span>
            </div>
            <div className="p-4 flex flex-wrap gap-4 items-center justify-between">
              <div className="flex gap-6 text-center">
                <div>
                  <div className="text-xs text-emerald-400/70 font-semibold uppercase tracking-wider mb-1">Rank</div>
                  <div className="text-xl font-black text-white">#{result.placement}</div>
                </div>
                <div>
                  <div className="text-xs text-emerald-400/70 font-semibold uppercase tracking-wider mb-1">Kills</div>
                  <div className="text-xl font-black text-white">{result.kills}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-emerald-400/70 font-semibold uppercase tracking-wider mb-1">Total Points</div>
                <div className="text-3xl font-black text-emerald-400">{result.total_points}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
