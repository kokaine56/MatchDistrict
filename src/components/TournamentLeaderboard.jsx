import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Trophy,
  Medal,
  Target,
  Crown,
  AlertCircle,
  Users,
  Compass,
  CheckCircle2,
  Ban,
  RotateCcw,
  Layers,
  ChevronRight,
  Filter,
} from 'lucide-react';
import RoundQualifyPanel from './qualification/RoundQualifyPanel.jsx';
import TeamDisqualifyModal from './qualification/TeamDisqualifyModal.jsx';

export default function TournamentLeaderboard({
  tournamentId,
  isOrganizer = false,
  isGoldTheme = false,
  cardContainerClass = '',
  cardTitleClass = '',
}) {
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Roadmap Rounds list
  const [availableRounds, setAvailableRounds] = useState([]);
  // Currently viewed round: 'overall' | roundId
  const [selectedViewRound, setSelectedViewRound] = useState('overall');
  // Currently selected district filter in standings view: 'all' | districtId
  const [selectedDistrictId, setSelectedDistrictId] = useState('all');
  const [roundDistricts, setRoundDistricts] = useState([]);
  const [hasRoundDistricts, setHasRoundDistricts] = useState(false);

  // Organizer mode: 'standings' | 'qualify'
  const [organizerTab, setOrganizerTab] = useState('standings');
  // Selected round for qualification
  const [selectedQualifyRoundId, setSelectedQualifyRoundId] = useState(null);
  const [disqualifyModalTeam, setDisqualifyModalTeam] = useState(null);

  // Fetch rounds for the tournament
  const fetchRounds = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.rounds) && data.rounds.length > 0) {
        setAvailableRounds(data.rounds);
        if (!selectedQualifyRoundId) {
          setSelectedQualifyRoundId(data.rounds[0].id);
        }
      }
    } catch {
      // Non-blocking fallback
    }
  }, [tournamentId, selectedQualifyRoundId]);

  // Fetch standings for selected view round
  const fetchStandings = useCallback(async (roundIdToFetch) => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/tournaments/${tournamentId}/leaderboard`;
      if (roundIdToFetch && roundIdToFetch !== 'overall') {
        url += `?roundId=${roundIdToFetch}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to load leaderboard');
      setStandings(data.standings || []);
      setRoundDistricts(data.districts || []);
      setHasRoundDistricts(Boolean(data.has_districts && data.districts && data.districts.length > 0));
      setSelectedDistrictId('all');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    fetchRounds();
  }, [fetchRounds]);

  useEffect(() => {
    fetchStandings(selectedViewRound);
  }, [selectedViewRound, fetchStandings]);

  // Filter standings based on selected district tab
  const displayedStandings = useMemo(() => {
    if (!standings) return [];
    if (selectedDistrictId === 'all') return standings;
    return standings.filter(
      (t) => t.group_id === selectedDistrictId || t.district_id === selectedDistrictId
    );
  }, [standings, selectedDistrictId]);

  if (loading && standings.length === 0) {
    return (
      <div className="flex justify-center items-center py-20 text-primary font-bold animate-pulse gap-3">
        <Trophy className="w-8 h-8 opacity-50" />
        Calculating Standings...
      </div>
    );
  }

  if (error && standings.length === 0) {
    return (
      <div className="p-8 text-center text-error bg-error/10 rounded-2xl border border-error/20">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p className="font-bold">{error}</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${cardContainerClass}`}>
      
      {/* ── Organizer Navigation Controls (Distinguishable Organizer Toolbar) ── */}
      {isOrganizer && (
        <div className="bg-surface-container-low border border-primary/20 rounded-2xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setOrganizerTab('standings')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                organizerTab === 'standings'
                  ? 'bg-surface-container-highest text-on-surface shadow-sm border border-outline-variant/30'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Standings View</span>
            </button>
            <button
              type="button"
              onClick={() => setOrganizerTab('qualify')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer ${
                organizerTab === 'qualify'
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-primary hover:bg-primary/10'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Qualify & Advance</span>
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 px-2 sm:px-0">
            <span className="text-[11px] font-bold text-on-surface-variant flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Host Authority Active
            </span>
          </div>
        </div>
      )}

      {/* ── Render Organizer Qualify Panel when tab is selected ── */}
      {isOrganizer && organizerTab === 'qualify' ? (
        <RoundQualifyPanel
          tournamentId={tournamentId}
          availableRounds={availableRounds}
          selectedRoundId={selectedQualifyRoundId}
          onSelectRound={(rId) => setSelectedQualifyRoundId(rId)}
          onAdvancementSuccess={() => {
            fetchStandings(selectedViewRound);
            fetchRounds();
          }}
          isGoldTheme={isGoldTheme}
          cardContainerClass={cardContainerClass}
          cardTitleClass={cardTitleClass}
        />
      ) : (
        <>
          {/* ── Roadmap-Driven Round Selector Bar ── */}
          {availableRounds.length > 0 && (
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-3.5 sm:p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-wider text-on-surface">
                    Roadmap Stages & Standings
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant">
                  Select a stage to view round-specific results or overall standings
                </span>
              </div>

              {/* Round Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-hide touch-pan-x">
                <button
                  type="button"
                  onClick={() => setSelectedViewRound('overall')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedViewRound === 'overall'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                  }`}
                >
                  Overall Standings
                </button>

                {availableRounds.map((r) => {
                  const isActive = selectedViewRound === r.id;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedViewRound(r.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                      }`}
                    >
                      {r.name || `Round ${r.round_number}`}
                    </button>
                  );
                })}
              </div>

              {/* District Filter Tabs (Rendered ONLY when the selected round has districts) */}
              {hasRoundDistricts && roundDistricts.length > 0 && (
                <div className="pt-2 border-t border-outline-variant/15 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-on-surface-variant flex items-center gap-1">
                    <Compass className="w-3.5 h-3.5 text-primary" />
                    Districts:
                  </span>

                  <button
                    type="button"
                    onClick={() => setSelectedDistrictId('all')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedDistrictId === 'all'
                        ? 'bg-surface-container-highest text-on-surface border border-outline-variant/40 shadow-sm'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                    }`}
                  >
                    All ({standings.length})
                  </button>

                  {roundDistricts.map((dist) => {
                    const isDistActive = selectedDistrictId === dist.id;
                    const count = dist.teams?.length || 0;
                    return (
                      <button
                        key={dist.id}
                        type="button"
                        onClick={() => setSelectedDistrictId(dist.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isDistActive
                            ? 'bg-surface-container-highest text-on-surface border border-outline-variant/40 shadow-sm'
                            : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                        }`}
                      >
                        <span>{dist.name}</span>
                        <span className="text-[10px] opacity-70 font-black">({count})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Empty State ── */}
          {displayedStandings.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-on-surface-variant/30" />
              <h3 className="text-lg font-black text-on-surface mb-2">No Results Yet</h3>
              <p className="text-on-surface-variant text-xs max-w-sm mx-auto">
                {selectedViewRound === 'overall'
                  ? 'Tournament standings will update automatically once match results are verified by the organizers.'
                  : 'No match results recorded for this stage yet. Results will appear here once verified.'}
              </p>
            </div>
          ) : (
            <>
              {/* ── Top 3 Podium (Desktop) ── */}
              <div className="hidden md:flex justify-center items-end gap-6 h-64 mb-10 mt-12">
                {/* Rank 2 */}
                {displayedStandings[1] && (
                  <div
                    className="w-48 bg-gradient-to-t from-slate-400/20 to-slate-400/5 rounded-t-2xl border border-b-0 border-slate-400/30 flex flex-col items-center justify-start p-4 relative"
                    style={{ height: '80%' }}
                  >
                    <div className="absolute -top-12 bg-surface-container-highest p-2 rounded-full border border-slate-400/40 shadow-md">
                      <Medal className="w-10 h-10 text-slate-300" />
                    </div>
                    <div className="mt-8 text-center">
                      <div className="font-black text-on-surface text-base truncate w-40">
                        {displayedStandings[1].team_name}
                      </div>
                      <div className="text-sm font-black text-on-surface-variant mt-0.5">
                        {displayedStandings[1].total_points} PTS
                      </div>
                    </div>
                  </div>
                )}

                {/* Rank 1 */}
                {displayedStandings[0] && (
                  <div
                    className="w-56 bg-gradient-to-t from-yellow-500/25 to-yellow-500/5 rounded-t-2xl border border-b-0 border-yellow-500/50 flex flex-col items-center justify-start p-4 relative shadow-lg"
                    style={{ height: '100%' }}
                  >
                    <div className="absolute -top-14 bg-surface-container-highest p-3 rounded-full border border-yellow-500/60 shadow-lg">
                      <Crown className="w-12 h-12 text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.4)]" />
                    </div>
                    <div className="mt-10 text-center">
                      <div className="font-black text-yellow-500 text-lg truncate w-48">
                        {displayedStandings[0].team_name}
                      </div>
                      <div className="text-base font-black text-on-surface mt-1">
                        {displayedStandings[0].total_points} PTS
                      </div>
                      <div className="text-[11px] text-yellow-600 dark:text-yellow-400/80 font-bold mt-1.5 uppercase tracking-wider">
                        {displayedStandings[0].total_kills || 0} Kills &bull; {displayedStandings[0].wwcd_count || 0} WWCD
                      </div>
                    </div>
                  </div>
                )}

                {/* Rank 3 */}
                {displayedStandings[2] && (
                  <div
                    className="w-48 bg-gradient-to-t from-amber-600/20 to-amber-600/5 rounded-t-2xl border border-b-0 border-amber-600/30 flex flex-col items-center justify-start p-4 relative"
                    style={{ height: '70%' }}
                  >
                    <div className="absolute -top-12 bg-surface-container-highest p-2 rounded-full border border-amber-600/40 shadow-md">
                      <Medal className="w-10 h-10 text-amber-600" />
                    </div>
                    <div className="mt-8 text-center">
                      <div className="font-black text-on-surface text-base truncate w-40">
                        {displayedStandings[2].team_name}
                      </div>
                      <div className="text-sm font-black text-on-surface-variant mt-0.5">
                        {displayedStandings[2].total_points} PTS
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Leaderboard Table ── */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                    <thead>
                      <tr className="bg-surface-container-highest/60 text-on-surface-variant text-xs uppercase tracking-wider border-b border-outline-variant/15">
                        <th className="px-5 py-3.5 font-bold text-center w-16">Rank</th>
                        <th className="px-5 py-3.5 font-bold">Team</th>
                        {hasRoundDistricts && <th className="px-5 py-3.5 font-bold text-center">District</th>}
                        <th className="px-5 py-3.5 font-bold text-center">Played</th>
                        <th className="px-5 py-3.5 font-bold text-center">Place Pts</th>
                        <th className="px-5 py-3.5 font-bold text-center">Kill Pts</th>
                        <th className="px-5 py-3.5 font-bold text-center">Total Kills</th>
                        <th className="px-5 py-3.5 font-bold text-center">WWCD</th>
                        <th className="px-5 py-3.5 font-black text-right text-on-surface">Total Pts</th>
                        {isOrganizer && <th className="px-5 py-3.5 font-bold text-center">Status / Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-medium">
                      {displayedStandings.map((team, idx) => {
                        const rankNumber = team.district_rank ?? team.rank ?? idx + 1;
                        const isTop1 = rankNumber === 1;
                        const isTop2 = rankNumber === 2;
                        const isTop3 = rankNumber === 3;

                        return (
                          <tr
                            key={team.team_id || idx}
                            className={`hover:bg-surface-container-high/40 transition-colors ${
                              isTop1
                                ? 'bg-yellow-500/[0.04] border-l-2 border-l-yellow-500'
                                : isTop2
                                ? 'bg-slate-400/[0.04] border-l-2 border-l-slate-400'
                                : isTop3
                                ? 'bg-amber-600/[0.04] border-l-2 border-l-amber-600'
                                : ''
                            }`}
                          >
                            {/* Rank */}
                            <td className="px-5 py-3.5 text-center">
                              {isTop1 ? (
                                <Crown className="w-5 h-5 text-yellow-500 mx-auto" />
                              ) : isTop2 ? (
                                <Medal className="w-5 h-5 text-slate-400 mx-auto" />
                              ) : isTop3 ? (
                                <Medal className="w-5 h-5 text-amber-600 mx-auto" />
                              ) : (
                                <span className="text-on-surface-variant font-bold">#{rankNumber}</span>
                              )}
                            </td>

                            {/* Team */}
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="font-black text-on-surface">{team.team_name}</div>
                                {(team.tie_broken || team.district_tie_broken || (displayedStandings.filter((s) => Number(s.total_points) === Number(team.total_points)).length > 1)) && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                    title="Rank resolved by tie-break rules"
                                  >
                                    Tie-break
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-on-surface-variant mt-0.5">
                                Captain: {team.leader_name || 'Captain'}
                              </div>
                            </td>

                            {/* District (Only if round has districts) */}
                            {hasRoundDistricts && (
                              <td className="px-5 py-3.5 text-center text-xs text-on-surface-variant font-medium">
                                {team.assigned_group_name || team.district_name || '-'}
                              </td>
                            )}

                            {/* Played */}
                            <td className="px-5 py-3.5 text-center text-on-surface-variant">
                              {team.matches_played || 0}
                            </td>

                            {/* Place Pts */}
                            <td className="px-5 py-3.5 text-center text-on-surface-variant">
                              {team.total_placement_points || 0}
                            </td>

                            {/* Kill Pts */}
                            <td className="px-5 py-3.5 text-center text-on-surface-variant">
                              {team.total_kill_points || 0}
                            </td>

                            {/* Total Kills */}
                            <td className="px-5 py-3.5 text-center">
                              <div className="flex items-center justify-center gap-1 text-rose-500">
                                <Target className="w-3.5 h-3.5" />
                                <span>{team.total_kills || 0}</span>
                              </div>
                            </td>

                            {/* WWCD */}
                            <td className="px-5 py-3.5 text-center">
                              {team.wwcd_count > 0 ? (
                                <span className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 px-2 py-0.5 rounded font-bold text-xs">
                                  {team.wwcd_count}
                                </span>
                              ) : (
                                <span className="text-on-surface-variant/40">-</span>
                              )}
                            </td>

                            {/* Total Points */}
                            <td className="px-5 py-3.5 text-right">
                              <span className="text-base font-black text-primary">
                                {team.total_points || 0}
                              </span>
                            </td>

                            {/* Organizer Actions */}
                            {isOrganizer && (
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {team.status === 'disqualified' || team.is_disqualified ? (
                                    <>
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error border border-error/30">
                                        Disqualified
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setDisqualifyModalTeam(team)}
                                        title="Reinstate team"
                                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Reinstate
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {team.is_advanced ? (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                          Qualified
                                        </span>
                                      ) : (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                                          Active
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => setDisqualifyModalTeam(team)}
                                        title="Disqualify team"
                                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-error/10 text-error hover:bg-error/20 border border-error/30 transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        <Ban className="w-3 h-3" />
                                        DQ
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-3 border-t border-outline-variant/15 bg-surface-container-highest/30 text-[11px] text-on-surface-variant flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="font-bold text-on-surface">Tie-break hierarchy:</span>
                    <span>1. WWCDs &bull; 2. Placement Pts &bull; 3. Elimination Pts &bull; 4. Latest Match Placement</span>
                  </span>
                  <span className="text-[10px]">
                    * Tie-break label indicates teams resolved by tie-breaker rules
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Team Disqualify / Reinstate Modal ── */}
      <TeamDisqualifyModal
        isOpen={Boolean(disqualifyModalTeam)}
        team={disqualifyModalTeam}
        tournamentId={tournamentId}
        onClose={() => setDisqualifyModalTeam(null)}
        onSuccess={() => {
          fetchStandings(selectedViewRound);
          fetchRounds();
        }}
      />
    </div>
  );
}