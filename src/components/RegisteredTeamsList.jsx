import { useState, useEffect } from 'react';

/**
 * RegisteredTeamsList component
 * Displays a clean, unified list of registered teams for a tournament.
 * Shows strictly two public fields: Team Name and Team Leader.
 * Removes all legacy district groupings, tabs, slot boxes, and occupancy maps.
 */
export default function RegisteredTeamsList({ tournamentId, slotsData, isGoldTheme = false }) {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadTeams() {
      if (!tournamentId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Fetch from the authoritative public registered-teams endpoint
        const res = await fetch(`/api/tournaments/${tournamentId}/registered-teams`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.teams)) {
            if (isMounted) {
              setTeams(data.teams);
              setLoading(false);
              return;
            }
          }
        }

        // Defensive fallback: Extract eligible teams from slotsData if provided
        if (slotsData?.slots && Array.isArray(slotsData.slots)) {
          const seen = new Set();
          const fallbackTeams = [];
          for (const s of slotsData.slots) {
            const name = (s.teamName || '').trim();
            if (name && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase());
              fallbackTeams.push({
                teamName: name,
                teamLeader: (s.captain || 'Anonymous').trim(),
              });
            }
          }
          if (isMounted) {
            setTeams(fallbackTeams);
            setLoading(false);
            return;
          }
        }

        if (isMounted) {
          setTeams([]);
          setLoading(false);
        }
      } catch (err) {
        console.warn('Failed to load registered teams:', err.message);
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadTeams();

    return () => {
      isMounted = false;
    };
  }, [tournamentId, slotsData]);

  if (loading) {
    return (
      <div className={`rounded-2xl p-6 sm:p-8 shadow-sm border w-full text-center ${
        isGoldTheme ? 'bg-[#FAF7F0] border-[#D4A017]/35 text-[#8A6D3B]' : 'bg-white border-slate-200 text-slate-500'
      }`}>
        <p className="text-sm font-medium">Loading registered teams...</p>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-5 sm:p-7 shadow-sm border w-full ${
      isGoldTheme ? 'bg-[#FAF7F0] border-[#D4A017]/35' : 'bg-white border-slate-200'
    }`}>
      {/* Header with Title and Count */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b ${
        isGoldTheme ? 'border-[#D4A017]/25' : 'border-slate-200'
      }`}>
        <div>
          <h3 className={`text-base sm:text-lg font-black uppercase tracking-wider ${
            isGoldTheme ? 'text-[#1F2937]' : 'text-slate-800'
          }`}>
            Registered Teams
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Teams competing in this tournament
          </p>
        </div>

        <span className={`self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-full ${
          isGoldTheme
            ? 'bg-[#D4A017]/20 text-[#8A5C00] border border-[#D4A017]/30'
            : 'bg-blue-50 text-blue-600 border border-blue-200/60'
        }`}>
          {teams.length} {teams.length === 1 ? 'Team' : 'Teams'}
        </span>
      </div>

      {/* Empty State */}
      {teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
          <svg
            className="w-10 h-10 mb-3 text-slate-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <p className="text-sm font-semibold text-slate-600">No teams registered yet</p>
          <p className="text-xs text-slate-400 mt-1">Be the first squad to register and join the tournament!</p>
        </div>
      ) : (
        /* Unified List / Table */
        <div className="w-full overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className={`${
                isGoldTheme
                  ? 'bg-[#F5F0E1] text-[#6B5B3E] border-b border-[#D4A017]/25'
                  : 'bg-slate-50 text-slate-600 border-b border-slate-200'
              }`}>
                <th className="py-3 px-4 font-bold uppercase tracking-wider w-3/5">
                  Team Name
                </th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider w-2/5">
                  Team Leader
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isGoldTheme ? 'divide-[#D4A017]/15' : 'divide-slate-100'}`}>
              {teams.map((team, idx) => (
                <tr
                  key={`${team.teamName}-${idx}`}
                  className={`transition-colors ${
                    isGoldTheme ? 'hover:bg-[#D4A017]/5' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td className={`py-3.5 px-4 font-bold break-words align-middle ${
                    isGoldTheme ? 'text-[#1F2937]' : 'text-slate-800'
                  }`}>
                    {team.teamName}
                  </td>
                  <td className={`py-3.5 px-4 font-medium break-words align-middle ${
                    isGoldTheme ? 'text-[#4B5563]' : 'text-slate-600'
                  }`}>
                    {team.teamLeader}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
