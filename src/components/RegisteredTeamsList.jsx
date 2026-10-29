import { useState, useEffect } from 'react';
import { useCurrentUser } from '../hooks/useCurrentUser.js';

function DiscordIcon({ className = 'w-4 h-4' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

/**
 * RegisteredTeamsList component
 * Displays a clean, two-column list of registered teams (Team Name & Team Leader)
 * without exposing other users' Discord details.
 * Provides a viewer-specific Discord connection/status action at the top.
 */
export default function RegisteredTeamsList({
  tournamentId,
  slotsData,
  isGoldTheme = false,
  refreshTrigger = 0,
}) {
  const [currentUser] = useCurrentUser();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerDiscord, setViewerDiscord] = useState(null);
  const [isLinking, setIsLinking] = useState(false);

  // Fetch viewer's own Discord status
  useEffect(() => {
    if (!currentUser) {
      setViewerDiscord(null);
      return;
    }

    let isMounted = true;
    fetch('/api/auth/discord/status', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success) {
          setViewerDiscord({
            connected: Boolean(data.connected),
            username: data.username || data.displayName || null,
          });
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [currentUser, refreshTrigger]);

  // Fetch registered teams for this tournament
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

        // Fallback from slotsData if provided (only teamName and teamLeader)
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
  }, [tournamentId, slotsData, refreshTrigger]);

  const handleConnectDiscord = () => {
    if (isLinking) return;
    setIsLinking(true);
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/auth/discord/connect?redirect=${encodeURIComponent(returnTo)}`;
  };

  const isViewerDiscordLinked = Boolean(
    viewerDiscord?.connected ||
    currentUser?.discord?.connected ||
    currentUser?.discord_id
  );

  const viewerDiscordUsername =
    viewerDiscord?.username ||
    currentUser?.discord?.username ||
    currentUser?.discordTag ||
    null;

  if (loading) {
    return (
      <div
        className={`rounded-2xl p-6 sm:p-8 shadow-sm border w-full text-center ${
          isGoldTheme
            ? 'bg-[#FAF7F0] border-[#D4A017]/35 text-[#8A6D3B]'
            : 'bg-white border-slate-200 text-slate-500'
        }`}
      >
        <p className="text-sm font-medium">Loading registered teams...</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl p-5 sm:p-7 shadow-sm border w-full ${
        isGoldTheme ? 'bg-[#FAF7F0] border-[#D4A017]/35' : 'bg-white border-slate-200'
      }`}
    >
      {/* Header with Title and Count */}
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b ${
          isGoldTheme ? 'border-[#D4A017]/25' : 'border-slate-200'
        }`}
      >
        <div>
          <h3
            className={`text-base sm:text-lg font-black uppercase tracking-wider ${
              isGoldTheme ? 'text-[#1F2937]' : 'text-slate-800'
            }`}
          >
            Registered Teams
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Teams competing in this tournament
          </p>
        </div>

        <span
          className={`self-start sm:self-auto text-xs font-bold px-3 py-1 rounded-full ${
            isGoldTheme
              ? 'bg-[#D4A017]/20 text-[#8A5C00] border border-[#D4A017]/30'
              : 'bg-blue-50 text-blue-600 border border-blue-200/60'
          }`}
        >
          {teams.length} {teams.length === 1 ? 'Team' : 'Teams'}
        </span>
      </div>

      {/* Viewer's Own Discord Status / Action (Only for logged-in users) */}
      {currentUser && (
        <div
          className={`flex items-center justify-between gap-3 p-3.5 mb-5 rounded-xl border ${
            isGoldTheme
              ? 'bg-[#F5F0E1]/80 border-[#D4A017]/30'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/20 flex items-center justify-center shrink-0 text-[#5865F2]">
              <DiscordIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Your Discord
              </span>
              {isViewerDiscordLinked ? (
                <span className="text-xs sm:text-sm font-bold text-[#5865F2] truncate block">
                  @{viewerDiscordUsername || 'Connected'}
                </span>
              ) : (
                <span className="text-xs text-slate-500 block">
                  Not connected
                </span>
              )}
            </div>
          </div>

          {!isViewerDiscordLinked && (
            <button
              type="button"
              onClick={handleConnectDiscord}
              disabled={isLinking}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold shadow-sm transition-all shrink-0 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              <DiscordIcon className="w-3.5 h-3.5" />
              <span>{isLinking ? 'Connecting...' : 'Connect Discord'}</span>
            </button>
          )}
        </div>
      )}

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
          <p className="text-xs text-slate-400 mt-1">
            Be the first squad to register and join the tournament!
          </p>
        </div>
      ) : (
        /* Unified List / Table: Exactly Two Columns (Team Name & Team Leader) */
        <div className="w-full overflow-hidden rounded-xl border border-slate-100">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr
                className={`${
                  isGoldTheme
                    ? 'bg-[#F5F0E1] text-[#6B5B3E] border-b border-[#D4A017]/25'
                    : 'bg-slate-50 text-slate-600 border-b border-slate-200'
                }`}
              >
                <th className="py-3 px-4 font-bold uppercase tracking-wider w-1/2 sm:w-3/5">
                  Team Name
                </th>
                <th className="py-3 px-4 font-bold uppercase tracking-wider w-1/2 sm:w-2/5">
                  Team Leader
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isGoldTheme ? 'divide-[#D4A017]/15' : 'divide-slate-100'
              }`}
            >
              {teams.map((team, idx) => (
                <tr
                  key={`${team.teamName}-${idx}`}
                  className={`transition-colors ${
                    isGoldTheme ? 'hover:bg-[#D4A017]/5' : 'hover:bg-slate-50/80'
                  }`}
                >
                  <td
                    className={`py-3.5 px-4 font-bold break-words align-middle ${
                      isGoldTheme ? 'text-[#1F2937]' : 'text-slate-800'
                    }`}
                  >
                    {team.teamName}
                  </td>
                  <td
                    className={`py-3.5 px-4 font-medium align-middle ${
                      isGoldTheme ? 'text-[#4B5563]' : 'text-slate-600'
                    }`}
                  >
                    <span
                      className="truncate max-w-[200px] block"
                      title={team.teamLeader}
                    >
                      {team.teamLeader}
                    </span>
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
