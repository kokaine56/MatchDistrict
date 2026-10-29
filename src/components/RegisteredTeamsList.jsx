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
    if (!currentUser) {
      window.location.href = `/login?redirect=${encodeURIComponent(returnTo)}`;
      return;
    }
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
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="space-y-1">
        <h3 className={`text-base sm:text-lg font-bold tracking-tight ${isGoldTheme ? 'text-[#1F2937] dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'}`}>
          Registered Teams
        </h3>
        <p className="text-sm leading-5 text-slate-500 dark:text-slate-400">
          Teams competing in this tournament
        </p>
      </div>

      {/* Mandatory Discord Linking Notice */}
      <div
        className={`flex w-full items-start gap-3 rounded-xl border p-3 sm:p-4 text-sm leading-5 ${
          isGoldTheme
            ? 'bg-amber-500/10 border-[#D4A017]/25 text-[#8A650D] dark:text-amber-200'
            : 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/25 dark:text-amber-200'
        }`}
      >
        <svg className="mt-0.5 h-5 w-5 shrink-0 opacity-80" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        <span className="min-w-0 whitespace-normal break-words">Linking your Discord account is compulsory to participate.</span>
      </div>

      {/* Viewer's Discord Status / Action */}
      <div
        className={`flex w-full flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          isGoldTheme
            ? 'bg-[#F5F0E1]/80 dark:bg-[#1A1812]/80 border-[#D4A017]/30 text-slate-800 dark:text-slate-100'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100'
        }`}
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#5865F2]/20 bg-[#5865F2]/10 text-[#5865F2]">
            <DiscordIcon className="h-6 w-6" />
          </div>
          <div className="flex min-w-0 flex-col items-start gap-1.5">
            <span className={`text-sm font-semibold leading-5 ${isGoldTheme ? 'text-[#1F2937] dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'}`}>
              Your Discord
            </span>
            {isViewerDiscordLinked ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Not connected
              </span>
            )}
          </div>
        </div>

        {!isViewerDiscordLinked ? (
          <button
            type="button"
            onClick={handleConnectDiscord}
            disabled={isLinking}
            className="inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#4752C4] active:scale-[0.98] active:bg-[#3C46B5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-75 sm:w-auto sm:min-w-48"
          >
            <DiscordIcon className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap">{isLinking ? 'Connecting...' : 'Connect Discord'}</span>
            {isLinking && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
          </button>
        ) : (
          <span className="min-w-0 truncate text-sm font-medium text-slate-600 dark:text-slate-300 sm:max-w-[45%] sm:text-right" title={viewerDiscordUsername || undefined}>
            {viewerDiscordUsername ? `@${viewerDiscordUsername}` : 'Discord account connected'}
          </span>
        )}
      </div>

      {/* Empty State */}
      {teams.length === 0 ? (
        <div className={`flex min-h-40 flex-col items-center justify-center rounded-xl border py-10 text-center ${isGoldTheme ? 'border-[#D4A017]/25 bg-[#FAF7F0] text-slate-500 dark:bg-[#1A1812] dark:text-slate-400' : 'border-slate-200 bg-white text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400'}`}>
          <svg
            className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600"
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
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No teams registered yet</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Be the first squad to register and join the tournament!
          </p>
        </div>
      ) : (
        /* Unified List / Table: Exactly Two Columns (Team Name & Team Leader) */
        <div className={`w-full overflow-hidden rounded-xl border ${isGoldTheme ? 'border-[#D4A017]/25 bg-[#FAF7F0] dark:bg-[#1A1812]' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
          <table className="w-full table-fixed text-left text-sm">
            <colgroup>
              <col className="w-3/5" />
              <col className="w-2/5" />
            </colgroup>
            <thead>
              <tr
                className={`${
                  isGoldTheme
                    ? 'bg-[#F5F0E1] text-[#6B5B3E] border-b border-[#D4A017]/25 dark:bg-[#242116] dark:text-slate-300 dark:border-[#D4A017]/20'
                    : 'bg-slate-50 text-slate-500 border-b border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                <th className="h-11 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Team Name
                </th>
                <th className="h-11 px-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  Team Leader
                </th>
              </tr>
            </thead>
            <tbody
              className={`divide-y ${
                isGoldTheme ? 'divide-[#D4A017]/15 dark:divide-[#D4A017]/15' : 'divide-slate-100 dark:divide-slate-800'
              }`}
            >
              {teams.map((team, idx) => (
                <tr
                  key={`${team.teamName}-${idx}`}
                  className={`h-14 transition-colors ${
                    isGoldTheme ? 'hover:bg-[#D4A017]/5 dark:hover:bg-white/[0.03]' : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <td
                    className={`h-14 px-4 align-middle text-sm font-semibold ${
                      isGoldTheme ? 'text-[#1F2937] dark:text-slate-100' : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    <span className="line-clamp-2 break-words leading-5" title={team.teamName}>{team.teamName}</span>
                  </td>
                  <td
                    className={`h-14 px-4 align-middle text-sm font-normal ${
                      isGoldTheme ? 'text-[#6B7280] dark:text-slate-400' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <span
                      className="block truncate"
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
