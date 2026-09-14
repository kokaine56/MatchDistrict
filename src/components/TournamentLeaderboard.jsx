import { useState, useEffect } from 'react';
import { fetchJsonWithRetry } from '../utils/api.js';

const PAGE_SIZE = 20;
const MOBILE_COLS = 'grid-cols-[8%_minmax(0,1fr)_11%_19%_12%_14%]';

function num(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

// Display-only team name: the column is already titled "TEAM", so strip a
// redundant leading "Team" word (e.g. "Team Genocide" → "Genocide") without
// ever touching the stored registration data. Teams whose whole name is just
// "Team" fall back to their original value.
function displayTeamName(name) {
  const raw = String(name || '').trim();
  const stripped = raw.replace(/^team\s+/i, '').trim();
  return stripped || raw;
}

function TrophyIcon({ isGoldTheme }) {
  return (
    <svg
      className={`w-8 h-8 mx-auto ${isGoldTheme ? 'text-[#D4A017]/50' : 'text-slate-200'}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 2h12v2h-2v1.5A7 7 0 0113 12.9V15h-2v-2.1A7 7 0 018 5.5V4H6V2zm-3 7a3 3 0 003 3h1.08A7.02 7.02 0 015 7V5H2v4zm15 3a3 3 0 003-3V5h-3v2a7.02 7.02 0 01-2.08 5.08H17a3 3 0 000-.08M13 17h-2v3H8v2h8v-2h-3v-3z" />
    </svg>
  );
}

export default function TournamentLeaderboard({ tournamentId, isGoldTheme, cardContainerClass }) {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!tournamentId) return;
    fetchJsonWithRetry(`/api/tournaments/${tournamentId}/leaderboard`)
      .then(({ ok, data }) => {
        setLoading(false);
        setPage(1);
        if (ok && data?.success) {
          setStandings(data.standings || []);
        } else {
          setError(data?.message || 'Leaderboard will appear once match results are added.');
        }
      })
      .catch(() => {
        setLoading(false);
        setPage(1);
        setError('Unable to load the leaderboard right now.');
      });
  }, [tournamentId]);

  if (loading) {
    return (
      <div className={`${cardContainerClass} w-full`}>
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-8 rounded-lg animate-pulse ${isGoldTheme ? 'bg-[#EDE5D0]/60' : 'bg-slate-100'}`} />
          ))}
        </div>
      </div>
    );
  }

  if (standings.length === 0) {
    return (
      <div className={`${cardContainerClass} pt-2 sm:pt-3 w-full text-center`}>
        <div className="flex flex-col items-center justify-center gap-2.5 py-4">
          <TrophyIcon isGoldTheme={isGoldTheme} />
          <p className={`text-[13px] sm:text-sm font-medium ${isGoldTheme ? 'text-[#6B4D00]' : 'text-slate-500'}`}>
            {error || 'Leaderboard will appear once match results are added.'}
          </p>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(standings.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = standings.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const headerClass = `text-[10px] font-black uppercase tracking-widest ${
    isGoldTheme ? 'text-[#8A6A14]' : 'text-slate-400'
  }`;
  const headerClassMobile = `text-[9px] font-bold uppercase whitespace-nowrap ${
    isGoldTheme ? 'text-[#8A6A14]' : 'text-slate-400'
  }`;
  const teamNameClass = `block min-w-0 w-full truncate text-[13px] font-bold ${
    isGoldTheme ? 'text-[#1F2937]' : 'text-slate-900'
  }`;
  const rankNumClass = `text-[13px] font-bold tabular-nums ${
    isGoldTheme ? 'text-[#4B5563]' : 'text-slate-700'
  }`;
  const rankTopClass = isGoldTheme ? 'text-[#B8860B]' : 'text-amber-600';
  const rankTextClass = `text-[11px] font-bold tabular-nums ${
    isGoldTheme ? 'text-[#4B5563]' : 'text-slate-700'
  }`;
  const statClass = `text-xs font-semibold tabular-nums whitespace-nowrap ${
    isGoldTheme ? 'text-[#4B5563]' : 'text-slate-600'
  }`;
  const statClassMobile = `text-[12px] font-semibold tabular-nums whitespace-nowrap ${
    isGoldTheme ? 'text-[#4B5563]' : 'text-slate-600'
  }`;
  const totalClass = isGoldTheme ? 'text-[#B8860B]' : 'text-amber-600';
  const rowBorder = isGoldTheme ? 'border-[#D4A017]/15' : 'border-slate-100';
  const pageBtn =
    `h-10 min-w-[84px] px-3 rounded-lg border text-xs font-bold transition-colors disabled:cursor-not-allowed ` +
    (isGoldTheme
      ? 'border-[#D4A017]/30 bg-[#FAF7F0] text-[#6B4D00] hover:bg-[#F5F0E1] disabled:text-[#D4A017]/40 disabled:hover:bg-[#FAF7F0]'
      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-white');

  return (
    <div className={`${cardContainerClass} pt-2 sm:pt-3 w-full`}>

      {/* Desktop / tablet: full-width single-line rank table */}
      <div className="hidden md:block overflow-hidden">
        <table className="w-full table-fixed">
          <thead>
            <tr className={`border-b ${isGoldTheme ? 'border-[#D4A017]/25 bg-[#F5F0E1]' : 'border-slate-200 bg-slate-50'}`}>
              <th className={`${headerClass} text-center py-2 px-1 whitespace-nowrap w-[8%]`}>#</th>
              <th className={`${headerClass} text-left py-2 px-3 w-[43%]`}>Team</th>
              <th className={`${headerClass} text-center py-2 px-2 whitespace-nowrap w-[11%]`}>WWCD</th>
              <th className={`${headerClass} text-center py-2 px-2 whitespace-nowrap w-[14%]`}>Position</th>
              <th className={`${headerClass} text-center py-2 px-2 whitespace-nowrap w-[11%]`}>Kills</th>
              <th className={`${headerClass} text-right py-2 px-2 whitespace-nowrap w-[13%]`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(row => (
              <tr
                key={row.team_id}
                className={`border-b last:border-b-0 transition-colors ${rowBorder} ${
                  isGoldTheme ? 'hover:bg-[#F5F0E1]' : 'hover:bg-slate-50'
                }`}
              >
                <td className="py-2 px-1 text-center overflow-hidden">
                  <span className={`${rankNumClass} ${row.rank === 1 ? rankTopClass : ''}`}>{row.rank}</span>
                </td>
                <td className="py-2 px-3 overflow-hidden">
                  <span className={teamNameClass}>{displayTeamName(row.team_name)}</span>
                </td>
                <td className={`${statClass} py-2 px-2 text-center overflow-hidden`}>{num(row.wwcd)}</td>
                <td className={`${statClass} py-2 px-2 text-center overflow-hidden`}>{num(row.placement_points)}</td>
                <td className={`${statClass} py-2 px-2 text-center overflow-hidden`}>{num(row.kills)}</td>
                <td className="py-2 px-2 text-right whitespace-nowrap overflow-hidden">
                  <span className={`text-sm font-black tabular-nums ${totalClass}`}>{num(row.total_points)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: balanced full-width grid — # | TEAM | WWCD | POSITION | KILLS | TOTAL */}
      <div className="md:hidden">
        <div className={`grid ${MOBILE_COLS} items-center border-b ${isGoldTheme ? 'border-[#D4A017]/25 bg-[#F5F0E1]' : 'border-slate-200 bg-slate-50'} py-1.5`}>
          <span className={`${headerClassMobile} text-center justify-self-stretch`}>#</span>
          <span className={`${headerClassMobile} text-left truncate`}>Team</span>
          <span className={`${headerClassMobile} text-center`}>WWCD</span>
          <span className={`${headerClassMobile} text-center`}>Position</span>
          <span className={`${headerClassMobile} text-center`}>Kills</span>
          <span className={`${headerClassMobile} text-right pr-0.5`}>Total</span>
        </div>
        {pageRows.map(row => (
          <div
            key={row.team_id}
            className={`grid ${MOBILE_COLS} items-center py-[7px] border-b last:border-b-0 ${rowBorder}`}
          >
            <span className={`text-center ${rankTextClass} ${row.rank === 1 ? rankTopClass : ''}`}>{row.rank}</span>
            <span className={teamNameClass}>{displayTeamName(row.team_name)}</span>
            <span className={`${statClassMobile} text-center`}>{num(row.wwcd)}</span>
            <span className={`${statClassMobile} text-center`}>{num(row.placement_points)}</span>
            <span className={`${statClassMobile} text-center`}>{num(row.kills)}</span>
            <span className={`${statClassMobile} font-black text-right pr-0.5 ${totalClass}`}>{num(row.total_points)}</span>
          </div>
        ))}
      </div>

      {/* Pagination — client-side, 20 per page, no reload */}
      {totalPages > 1 && (
        <nav
          aria-label="Leaderboard pagination"
          className="mt-3 flex items-center justify-center gap-2.5"
        >
          {currentPage > 1 && (
            <button
              type="button"
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
              className={pageBtn}
            >
              ← Previous
            </button>
          )}
          <span className={`text-[11px] font-semibold tabular-nums ${isGoldTheme ? 'text-[#8A6A14]' : 'text-slate-500'}`}>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && (
            <button
              type="button"
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
              className={pageBtn}
            >
              Next →
            </button>
          )}
        </nav>
      )}
    </div>
  );
}