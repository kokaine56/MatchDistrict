// src/components/qualification/RoundQualifyPanel.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy,
  Users,
  ShieldAlert,
  Shuffle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
  Layers,
  ChevronRight,
  RefreshCw,
  Compass,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import {
  derivePlannedSelection,
  getPlannedCount,
  detectCutoffTies,
  computeSnakePlacement,
  reconcileManualPlacement,
  formatAdvancementError,
} from './qualificationLogic.js';
import QualifyConfirmModal from './QualifyConfirmModal.jsx';
import MatchResultEntry from '../MatchResultEntry.jsx';

export default function RoundQualifyPanel({
  tournamentId,
  availableRounds = [],
  selectedRoundId,
  onSelectRound,
  onAdvancementSuccess,
  isGoldTheme = false,
  cardContainerClass = '',
  cardTitleClass = '',
}) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Active advancement mode: 'per_district' | 'overall' | 'manual'
  const [activeMode, setActiveMode] = useState('per_district');
  // Selected team IDs set
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  // Manual district overrides: { [teamId]: districtId }
  const [manualPlacementOverrides, setManualPlacementOverrides] = useState({});
  // Selected district filter tab: 'all' | districtId
  const [selectedDistrictId, setSelectedDistrictId] = useState('all');

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [advancementError, setAdvancementError] = useState(null);

  // Match result entry modal state
  const [selectedResultMatch, setSelectedResultMatch] = useState(null);

  // Active round selection
  const currentRoundId = selectedRoundId || availableRounds[0]?.id;

  const fetchSummary = useCallback(async (roundId) => {
    if (!tournamentId || !roundId) return;
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/advancement-summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to load round advancement summary.');
      }
      setSummary(data);

      // Default mode to roadmap's planned rule; if round has no districts, default to 'overall'
      const hasDistricts = Boolean(data.has_districts && data.districts && data.districts.length > 0);
      let plannedType = data.planned_rule?.advancement_type || (hasDistricts ? 'per_district' : 'overall');
      if (!hasDistricts && plannedType === 'per_district') {
        plannedType = 'overall';
      }
      setActiveMode(plannedType);

      // Reset district filter to 'all' on round switch
      setSelectedDistrictId('all');

      // Pre-fill selection based on planned rule
      const initialSelection = derivePlannedSelection(data, plannedType);
      setSelectedTeamIds(initialSelection);
      setManualPlacementOverrides({});
    } catch (err) {
      setError(formatAdvancementError(err.code || err.message, err.message));
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (currentRoundId) {
      fetchSummary(currentRoundId);
    }
  }, [currentRoundId, fetchSummary]);

  // Mode change handler
  const handleModeChange = (newMode) => {
    setActiveMode(newMode);
    if (summary) {
      const newSelection = derivePlannedSelection(summary, newMode);
      setSelectedTeamIds(newSelection);
      setManualPlacementOverrides({});
    }
  };

  // Toggle individual team selection
  const handleToggleTeam = (teamId) => {
    if (summary?.disqualified_team_ids?.includes(teamId)) return;

    setSelectedTeamIds((prev) => {
      const set = new Set(prev);
      if (set.has(teamId)) {
        set.delete(teamId);
        setManualPlacementOverrides((curr) => {
          const next = { ...curr };
          delete next[teamId];
          return next;
        });
      } else {
        set.add(teamId);
      }
      return Array.from(set);
    });
  };

  // Reset to planned selection
  const handleResetToPlanned = () => {
    if (!summary) return;
    const initialSelection = derivePlannedSelection(summary, activeMode);
    setSelectedTeamIds(initialSelection);
    setManualPlacementOverrides({});
  };

  // Target round and districts
  const targetRound = summary?.target_round || null;
  const isGrandFinal = Boolean(summary?.is_grand_final || summary?.source_round?.round_type === 'grand_final' || !targetRound);
  const targetDistricts = targetRound?.districts || [];
  const targetHasResults = Boolean(summary?.target_has_results || targetRound?.has_results);
  const isAlreadyAdvanced = summary?.source_round?.status === 'completed' || (summary?.standings || []).some((t) => t.is_advanced);
  const hasSourceDistricts = Boolean(summary?.has_districts && summary?.districts && summary.districts.length > 0);

  // Tie detection at cutoff boundary
  const plannedCount = useMemo(() => getPlannedCount(summary, activeMode), [summary, activeMode]);
  const tieInfo = useMemo(() => {
    if (!summary?.standings) return { hasTie: false, tiedTeams: [] };
    if (activeMode === 'per_district' && hasSourceDistricts) {
      const topPerDist = Number(summary.planned_rule?.teams_advancing_per_district) || 2;
      const allTied = [];
      let foundTie = false;
      let score = null;
      for (const dist of (summary.districts || [])) {
        const check = detectCutoffTies(dist.teams || [], topPerDist);
        if (check.hasTie) {
          foundTie = true;
          score = check.cutoffScore;
          allTied.push(...check.tiedTeams.map((t) => ({ ...t, districtName: dist.name || t.district_name })));
        }
      }
      return { hasTie: foundTie, cutoffScore: score, tiedTeams: allTied };
    }
    return detectCutoffTies(summary.standings, plannedCount);
  }, [summary, plannedCount, activeMode, hasSourceDistricts]);

  // Filtered displayed teams based on active district tab
  const displayedTeams = useMemo(() => {
    if (!summary?.standings) return [];
    if (selectedDistrictId === 'all') {
      return summary.standings;
    }
    const matchedDist = summary.districts?.find((d) => d.id === selectedDistrictId);
    if (matchedDist && Array.isArray(matchedDist.teams)) {
      return matchedDist.teams;
    }
    return summary.standings.filter(
      (t) => t.group_id === selectedDistrictId || t.district_id === selectedDistrictId
    );
  }, [summary, selectedDistrictId]);

  // Filtered matches based on active district tab
  const allSourceMatches = useMemo(() => {
    return summary?.matches || [];
  }, [summary]);

  const pendingMatchesList = useMemo(() => {
    const list = (summary?.unverified_matches && summary.unverified_matches.length > 0)
      ? summary.unverified_matches
      : (summary?.unverified_match_ids || []).map((id, idx) => ({
          id,
          match_id: id,
          match_number: idx + 1,
          group_name: `District ${idx + 1}`,
        }));

    if (selectedDistrictId === 'all') return list;

    // Filter to matches belonging to selected district
    return list.filter((m) => {
      const matchObj = allSourceMatches.find((sm) => sm.id === m.id || sm.match_id === m.id);
      return matchObj && (matchObj.group_id === selectedDistrictId || matchObj.district_id === selectedDistrictId);
    });
  }, [summary, selectedDistrictId, allSourceMatches]);

  // Placement computation: Snake seeding + Manual Overrides
  const { defaultSnakePlacement, districtBuckets } = useMemo(() => {
    if (!summary || selectedTeamIds.length === 0 || targetDistricts.length === 0) {
      return { defaultSnakePlacement: {}, districtBuckets: {} };
    }
    const { placementMap } = computeSnakePlacement(
      selectedTeamIds,
      summary.standings,
      targetDistricts
    );

    const finalBuckets = {};
    for (const d of targetDistricts) {
      finalBuckets[d.id] = [];
    }

    const reconciled = reconcileManualPlacement(placementMap, manualPlacementOverrides);
    const standingsMap = new Map((summary.standings || []).map((t) => [t.team_id, t]));

    for (const [tId, dId] of Object.entries(reconciled)) {
      if (dId && finalBuckets[dId]) {
        const teamObj = standingsMap.get(tId) || { team_id: tId, team_name: tId };
        finalBuckets[dId].push(teamObj);
      }
    }

    return { defaultSnakePlacement: reconciled, districtBuckets: finalBuckets };
  }, [selectedTeamIds, summary, targetDistricts, manualPlacementOverrides]);

  // Handle manual district move
  const handleMoveTeamDistrict = (teamId, targetGroupId) => {
    setManualPlacementOverrides((prev) => ({
      ...prev,
      [teamId]: targetGroupId,
    }));
  };

  // Prepare lists for confirmation modal
  const qualifyingTeamsList = useMemo(() => {
    if (!summary?.standings) return [];
    const districtNameMap = new Map(targetDistricts.map((d) => [d.id, d.group_name]));
    const standingsMap = new Map(summary.standings.map((t) => [t.team_id, t]));

    return selectedTeamIds.map((id) => {
      const team = standingsMap.get(id) || { team_id: id, team_name: id };
      const assignedDistId = defaultSnakePlacement[id];
      const distName = assignedDistId ? districtNameMap.get(assignedDistId) : 'Target Round';
      return {
        ...team,
        districtName: distName,
      };
    });
  }, [selectedTeamIds, summary, targetDistricts, defaultSnakePlacement]);

  const eliminatedTeamsList = useMemo(() => {
    if (!summary?.standings) return [];
    const selectedSet = new Set(selectedTeamIds);
    return summary.standings
      .filter((t) => !selectedSet.has(t.team_id) && !t.is_disqualified)
      .map((t) => ({ ...t }));
  }, [selectedTeamIds, summary]);

  // Execute advancement call
  const handleConfirmAdvancement = async ({ allowUnverified }) => {
    if (!summary?.target_round?.id) return;
    setAdvancing(true);
    setAdvancementError(null);

    try {
      const token = localStorage.getItem('token') || '';
      const payload = {
        target_round_id: summary.target_round.id,
        team_ids: selectedTeamIds,
        manual_placement: Object.keys(manualPlacementOverrides).length > 0 ? manualPlacementOverrides : null,
        allow_unverified: allowUnverified,
      };

      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${currentRoundId}/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Failed to qualify teams.');
      }

      setShowConfirmModal(false);
      await fetchSummary(currentRoundId);
      if (typeof onAdvancementSuccess === 'function') {
        onAdvancementSuccess(data);
      }
    } catch (err) {
      setAdvancementError(formatAdvancementError(err.code || err.message, err.message));
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className={`space-y-6 ${cardContainerClass}`}>
      
      {/* ── Top Header & Roadmap-Driven Round Selector ── */}
      <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 sm:p-5 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-on-surface tracking-tight">
                  {isGrandFinal ? 'Grand Finals Championship' : 'Round Qualification & Advancement'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary border border-primary/30 uppercase tracking-widest">
                  {isGrandFinal ? 'Final Stage' : 'Organizer Authority'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {isGrandFinal
                  ? 'Final verified standings determine prize pool distribution and championship awards.'
                  : 'Select qualified teams from verified standings to advance to the configured next round.'}
              </p>
            </div>
          </div>

          {/* Dynamic Roadmap Round Selector */}
          {availableRounds.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 self-start lg:self-center">
              <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Select Round:
              </span>
              <div className="flex flex-wrap bg-surface-container p-1 rounded-xl border border-outline-variant/20 gap-1">
                {availableRounds.map((r) => {
                  const isActive = r.id === currentRoundId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onSelectRound && onSelectRound(r.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        isActive
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {r.name || `Round ${r.round_number}`}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="p-12 text-center text-primary animate-pulse font-bold flex items-center justify-center gap-2.5 bg-surface-container-low rounded-2xl border border-outline-variant/20">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading Round Progression Data...
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-xl bg-error/10 border border-error/30 text-error text-xs flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Panel Content */}
      {summary && !loading && (
        <div className="space-y-6">

          {/* ── District Tabs (Rendered ONLY when this round is configured to have districts) ── */}
          {hasSourceDistricts && (
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-3 sm:p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-outline-variant/15 mb-3">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black uppercase tracking-wider text-on-surface">
                    Configured Districts for {summary.source_round?.name || 'This Round'}
                  </span>
                </div>
                <span className="text-[11px] text-on-surface-variant">
                  Select a district to view registered teams and enter match results
                </span>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide touch-pan-x">
                <button
                  type="button"
                  onClick={() => setSelectedDistrictId('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    selectedDistrictId === 'all'
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                  }`}
                >
                  <span>All Districts</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-black">
                    {summary.total_teams || 0}
                  </span>
                </button>

                {summary.districts.map((dist) => {
                  const isDistActive = selectedDistrictId === dist.id;
                  const distTeamCount = dist.teams?.length || 0;
                  return (
                    <button
                      key={dist.id}
                      type="button"
                      onClick={() => setSelectedDistrictId(dist.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                        isDistActive
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                      }`}
                    >
                      <span>{dist.name}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-black">
                        {distTeamCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Controls Bar: Mode Switcher + Planned Rule Info + Selection Counter ── */}
          {isGrandFinal ? (
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-black text-on-surface flex items-center gap-2">
                    Championship Stage &bull; Grand Finals
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30 uppercase tracking-widest">
                      Prize Distribution
                    </span>
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-0.5">
                    Grand Finals is the terminal stage. No teams advance beyond this round. Final rankings determine the prize pool distribution.
                  </p>
                </div>
              </div>

              {Array.isArray(summary.prize_positions) && summary.prize_positions.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {summary.prize_positions.map((p) => (
                    <div key={p.rank} className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 block">
                        {p.name || `Rank ${p.rank}`}
                      </span>
                      <span className="text-sm font-black text-on-surface block mt-0.5">
                        {p.prize_amount != null ? `₹${p.prize_amount.toLocaleString()}` : `${p.percentage}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
              {/* Advancement Modes */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-on-surface-variant mr-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Advancement Mode:
                </span>
                {[
                  ...(hasSourceDistricts ? [{ id: 'per_district', label: 'Per District' }] : []),
                  { id: 'overall', label: 'Overall Standings' },
                  { id: 'manual', label: 'Manual Selection' },
                ].map((m) => {
                  const isActive = activeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleModeChange(m.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-primary text-on-primary shadow-sm'
                          : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {/* Planned Rule & Selection Count */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Planned Rule Indicator */}
                <div className="px-3 py-1.5 rounded-xl bg-surface-container border border-outline-variant/20 text-xs text-on-surface flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>
                    Planned Rule:{' '}
                    <strong>
                      {activeMode === 'per_district' && hasSourceDistricts
                        ? `Top ${summary.planned_rule?.teams_advancing_per_district || 2} per District`
                        : `Top ${summary.planned_rule?.teams_advancing || 16} Overall`}
                    </strong>
                  </span>
                </div>

                {/* Selected Count Indicator */}
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                    selectedTeamIds.length === plannedCount
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  <span>
                    Selected <strong>{selectedTeamIds.length}</strong> of planned <strong>{plannedCount}</strong>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleResetToPlanned}
                  className="p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high border border-outline-variant/20 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
                  title="Reset selection to roadmap plan"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ── True Tie Warning Banner (Qualifiers only) ── */}
          {!isGrandFinal && tieInfo.hasTie && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 space-y-3 shadow-md">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <div>
                    <h4 className="text-sm font-black text-amber-900 dark:text-amber-300">
                      True Tie Detected at Cutoff Boundary ({tieInfo.cutoffScore} pts)
                    </h4>
                    <p className="text-xs text-amber-800/90 dark:text-amber-200/90 mt-0.5">
                      The teams below are tied across <strong>all four</strong> tie-break criteria (Total Points, WWCDs, Placement Points, Elimination Points, and Recent Match Placement). The system will not decide silently. Please review and manually choose which team(s) advance:
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tieInfo.tiedTeams.map((team) => {
                      const isSelected = selectedTeamIds.includes(team.team_id);
                      return (
                        <button
                          key={team.team_id}
                          type="button"
                          onClick={() => handleToggleTeam(team.team_id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-md'
                              : 'bg-surface-container border border-outline-variant/30 text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          <span>{team.team_name}</span>
                          <span className="text-[10px] opacity-80">
                            (Rank #{team.rank ?? team.district_rank ?? '-'} &bull; {team.wwcd_count || 0} WWCD &bull; {team.total_kills || 0} Kills)
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${isSelected ? 'bg-black/20 text-white' : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'}`}>
                            {isSelected ? 'Selected' : 'Select'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Target Round State Notice ── */}
          {!targetRound ? (
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>This is the final round of the roadmap. No further stage advancement is required.</span>
            </div>
          ) : targetHasResults ? (
            <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center gap-2.5">
              <Lock className="w-4 h-4 shrink-0" />
              <span>
                <strong>Target Round Locked:</strong> {targetRound.name} already has recorded match results. Advancement into this round is locked.
              </span>
            </div>
          ) : isAlreadyAdvanced ? (
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Teams were previously advanced to <strong>{targetRound.name}</strong>. Re-advancing will cleanly replace previous qualification assignments.
              </span>
            </div>
          ) : null}

          {/* ── Matches Pending Results Section ── */}
          {pendingMatchesList.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 space-y-3 shadow-md">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <h4 className="text-sm font-black text-amber-900 dark:text-amber-300">
                    Matches Pending Results ({pendingMatchesList.length})
                    {selectedDistrictId !== 'all' && ' in Selected District'}
                  </h4>
                  <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                    Some source round matches have no recorded results yet. Enter results before qualifying teams to ensure accurate standings.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {pendingMatchesList.map((m) => (
                  <div
                    key={m.id || m.match_id}
                    className="flex items-center justify-between p-3 rounded-xl bg-surface-container border border-outline-variant/20 text-xs shadow-sm"
                  >
                    <div className="truncate pr-2">
                      <span className="font-bold text-on-surface block truncate">
                        Match {m.match_number}
                      </span>
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold block truncate">
                        {m.group_name || `District ${m.match_number}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedResultMatch(m)}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-black text-xs transition cursor-pointer shrink-0 shadow-sm"
                    >
                      Enter results
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Standings Table with Selection Checkboxes ── */}
          <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h4 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                {isGrandFinal ? 'Grand Finals Standings' : 'Round Standings & Advancement Selection'}
                {selectedDistrictId !== 'all' && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 normal-case">
                    Filtered by District
                  </span>
                )}
              </h4>
              <span className="text-xs text-on-surface-variant">
                {isGrandFinal ? 'Official verified tournament results' : 'Click team row or checkbox to toggle qualification'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                <thead>
                  <tr className="bg-surface-container-highest/60 text-on-surface-variant text-xs uppercase tracking-wider border-b border-outline-variant/15">
                    {!isGrandFinal && <th className="px-4 py-3 text-center w-12">Advance</th>}
                    <th className="px-4 py-3 text-center w-14">Rank</th>
                    <th className="px-4 py-3">Team Name</th>
                    {hasSourceDistricts && <th className="px-4 py-3 text-center">District</th>}
                    <th className="px-4 py-3 text-center">Played</th>
                    <th className="px-4 py-3 text-center">WWCD</th>
                    <th className="px-4 py-3 text-center">Kills</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {displayedTeams.length === 0 ? (
                    <tr>
                      <td colSpan={hasSourceDistricts ? 9 : 8} className="p-8 text-center text-on-surface-variant text-xs">
                        No teams available for this round/district yet.
                      </td>
                    </tr>
                  ) : (
                    displayedTeams.map((team) => {
                      const isSelected = selectedTeamIds.includes(team.team_id);
                      const isDq = Boolean(team.is_disqualified);

                      return (
                        <tr
                          key={team.team_id}
                          onClick={() => !isGrandFinal && !isDq && handleToggleTeam(team.team_id)}
                          className={`transition-colors ${!isGrandFinal ? 'cursor-pointer' : ''} ${
                            isDq
                              ? 'opacity-40 bg-error/5 cursor-not-allowed'
                              : isSelected && !isGrandFinal
                              ? 'bg-primary/10 hover:bg-primary/15'
                              : 'hover:bg-surface-container-high/40'
                          }`}
                        >
                          {/* Checkbox (Qualifiers only) */}
                          {!isGrandFinal && (
                            <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isDq}
                                onChange={() => handleToggleTeam(team.team_id)}
                                className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant bg-surface-container disabled:opacity-30 cursor-pointer"
                              />
                            </td>
                          )}

                          {/* Rank */}
                          <td className="px-4 py-3 text-center font-bold text-on-surface-variant">
                            #{team.district_rank ?? team.rank ?? '-'}
                          </td>

                          {/* Team Name */}
                          <td className="px-4 py-3">
                            <div className="font-bold text-on-surface flex items-center gap-2">
                              {team.team_name}
                              {isDq && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-error/20 text-error border border-error/30 uppercase">
                                  DQ
                                </span>
                              )}
                              {(team.tie_broken || team.district_tie_broken || (summary.standings?.filter((s) => Number(s.total_points) === Number(team.total_points)).length > 1)) && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                  title="Position determined by tie-break rules"
                                >
                                  Tie-break
                                </span>
                              )}
                              {(team.is_true_tie || team.district_is_true_tie) && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-500 border border-rose-500/30"
                                  title="True tie across all 4 criteria"
                                >
                                  Cutoff Tie
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-on-surface-variant">
                              Captain: {team.leader_name || 'Captain'}
                            </div>
                          </td>

                          {/* District (Only if round has districts) */}
                          {hasSourceDistricts && (
                            <td className="px-4 py-3 text-center text-xs text-on-surface-variant font-medium">
                              {team.assigned_group_name || team.district_name || '-'}
                            </td>
                          )}

                          {/* Played */}
                          <td className="px-4 py-3 text-center text-xs text-on-surface-variant">
                            {team.matches_played || 0}
                          </td>

                          {/* WWCD */}
                          <td className="px-4 py-3 text-center text-xs text-on-surface-variant font-bold">
                            {team.wwcd_count > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
                                {team.wwcd_count}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>

                          {/* Kills */}
                          <td className="px-4 py-3 text-center text-xs text-on-surface-variant">
                            {team.total_kills || 0}
                          </td>

                          {/* Total Points */}
                          <td className="px-4 py-3 text-right font-black text-primary text-base">
                            {team.total_points || 0}
                          </td>

                          {/* Badge Status */}
                          <td className="px-4 py-3 text-center">
                            {isDq ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/10 text-error border border-error/20">
                                Disqualified
                              </span>
                            ) : isSelected ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                Qualified
                              </span>
                            ) : team.is_advanced ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                Allocated
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                                Eliminated
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 bg-surface-container-highest/40 border-t border-outline-variant/15 text-[11px] text-on-surface-variant flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-on-surface">Tie-break hierarchy:</span>
                <span>1. WWCDs &bull; 2. Placement Pts &bull; 3. Elimination Pts &bull; 4. Latest Match Placement</span>
              </span>
              <span className="text-[10px]">
                * Tie-break label indicates teams resolved by tie-breaker rules
              </span>
            </div>
          </div>

          {/* ── Placement Preview (Target Districts) ── */}
          {targetRound && targetDistricts.length > 0 && selectedTeamIds.length > 0 && (
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 sm:p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-outline-variant/15 pb-3">
                <div>
                  <h4 className="text-sm font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
                    <Shuffle className="w-4 h-4 text-primary" />
                    Target Placement Preview ({targetRound.name})
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    Snake seeding by verified scores. Use dropdowns to manually reassign a team to a different district.
                  </p>
                </div>
              </div>

              {/* District Columns Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {targetDistricts.map((dist) => {
                  const teamsInDistrict = districtBuckets[dist.id] || [];
                  return (
                    <div
                      key={dist.id}
                      className="bg-surface-container border border-outline-variant/20 rounded-xl p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-outline-variant/15 pb-2">
                        <span className="text-xs font-bold text-on-surface flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-primary" />
                          {dist.group_name}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                          {teamsInDistrict.length} team(s)
                        </span>
                      </div>

                      <div className="space-y-1.5 min-h-[60px]">
                        {teamsInDistrict.length === 0 ? (
                          <div className="text-[11px] text-on-surface-variant italic p-2 text-center">
                            No teams seeded
                          </div>
                        ) : (
                          teamsInDistrict.map((t, idx) => (
                            <div
                              key={t.team_id}
                              className="flex items-center justify-between p-2 rounded-lg bg-surface-container-high/60 border border-outline-variant/15 text-xs hover:border-outline-variant/30"
                            >
                              <div className="truncate pr-2">
                                <span className="font-bold text-on-surface block truncate">{t.team_name}</span>
                                <span className="text-[10px] text-on-surface-variant">Seed #{idx + 1} &bull; {t.total_points || 0} pts</span>
                              </div>

                              {/* Manual Reassign Selector */}
                              <select
                                value={dist.id}
                                onChange={(e) => handleMoveTeamDistrict(t.team_id, e.target.value)}
                                className="text-[10px] bg-surface-container border border-outline-variant/30 text-on-surface rounded px-1.5 py-0.5 outline-none focus:border-primary cursor-pointer"
                              >
                                {targetDistricts.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.group_name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Action Footer ── */}
          {targetRound && !isGrandFinal && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-surface-container-low border border-outline-variant/30 shadow-md">
              <div className="text-xs text-on-surface-variant">
                {targetHasResults ? (
                  <span className="text-error font-bold">Target round results verified; progression locked.</span>
                ) : (
                  <span>
                    Ready to advance <strong>{selectedTeamIds.length}</strong> team(s) to <strong>{targetRound.name}</strong>.
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={targetHasResults || selectedTeamIds.length === 0 || advancing}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer"
              >
                <span>{isAlreadyAdvanced ? 'Update Qualification' : 'Qualify Selected Teams'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Confirmation Modal ── */}
      <QualifyConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmAdvancement}
        targetRoundName={targetRound?.name || 'Next Stage'}
        qualifyingTeams={qualifyingTeamsList}
        eliminatedTeams={eliminatedTeamsList}
        plannedCount={plannedCount}
        selectedCount={selectedTeamIds.length}
        resultsComplete={Boolean(summary?.results_complete)}
        unverifiedCount={summary?.unverified_match_ids?.length || 0}
        isReRun={isAlreadyAdvanced}
        submitting={advancing}
        error={advancementError}
      />

      {/* ── Match Result Entry Modal ── */}
      {selectedResultMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-surface-container-low border border-outline-variant/30 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-outline-variant/20">
              <h3 className="text-base font-black text-on-surface">
                Enter Match Results — Match {selectedResultMatch.match_number} ({selectedResultMatch.group_name || 'District'})
              </h3>
              <button
                type="button"
                onClick={() => setSelectedResultMatch(null)}
                className="text-on-surface-variant hover:text-on-surface text-xs font-bold px-2.5 py-1 rounded-lg bg-surface-container hover:bg-surface-container-high transition cursor-pointer"
              >
                Close
              </button>
            </div>
            <MatchResultEntry
              tournamentId={tournamentId}
              matchDetails={{
                match_id: selectedResultMatch.id || selectedResultMatch.match_id,
                match_number: selectedResultMatch.match_number,
              }}
              onSaved={() => {
                setSelectedResultMatch(null);
                fetchSummary(currentRoundId);
              }}
              onCancel={() => setSelectedResultMatch(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
