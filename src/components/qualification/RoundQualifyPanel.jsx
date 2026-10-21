// src/components/qualification/RoundQualifyPanel.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Trophy,
  Users,
  ShieldAlert,
  ArrowRight,
  Shuffle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
  Layers,
  ChevronRight,
  RefreshCw,
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

  // Active advancement mode
  const [activeMode, setActiveMode] = useState('per_district'); // 'per_district' | 'overall' | 'manual'
  // Selected team IDs set
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  // Manual district overrides: { [teamId]: districtId }
  const [manualPlacementOverrides, setManualPlacementOverrides] = useState({});

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

      // Default mode to roadmap's planned rule
      const plannedType = data.planned_rule?.advancement_type || 'per_district';
      setActiveMode(plannedType);

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
    if (summary?.disqualified_team_ids?.includes(teamId)) return; // Disqualified teams are locked

    setSelectedTeamIds((prev) => {
      const set = new Set(prev);
      if (set.has(teamId)) {
        set.delete(teamId);
        // Clear manual placement override if deselected
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

  // Tie detection at cutoff boundary
  const plannedCount = useMemo(() => getPlannedCount(summary, activeMode), [summary, activeMode]);
  const tieInfo = useMemo(() => {
    if (!summary?.standings) return { hasTie: false, tiedTeams: [] };
    if (activeMode === 'per_district') {
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
  }, [summary, plannedCount, activeMode]);

  // Placement computation: Snake seeding + Manual Overrides
  const { defaultSnakePlacement, districtBuckets } = useMemo(() => {
    if (!summary || selectedTeamIds.length === 0) {
      return { defaultSnakePlacement: {}, districtBuckets: {} };
    }
    const { placementMap, districtBuckets: buckets } = computeSnakePlacement(
      selectedTeamIds,
      summary.standings,
      targetDistricts
    );

    // Apply manual placement overrides to buckets
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
      {/* Top Header & Round Switcher */}
      <div className="bg-[#0A0C10] border border-white/10 rounded-2xl p-5 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                <Trophy className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  {isGrandFinal ? 'Grand Finals Championship' : 'Qualify to Next Round'}
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-widest">
                    {isGrandFinal ? 'Final Stage' : 'Host Authority'}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  {isGrandFinal
                    ? 'Final standings determine tournament prize pool distribution and championship awards.'
                    : 'Select qualified teams from verified standings to advance to the next tournament stage.'}
                </p>
              </div>
            </div>
          </div>

          {/* Round Selector */}
          {availableRounds.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Source Round:</span>
              <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                {availableRounds.map((r) => {
                  const isActive = r.id === currentRoundId;
                  return (
                    <button
                      key={r.id}
                      onClick={() => onSelectRound && onSelectRound(r.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
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
        <div className="p-12 text-center text-indigo-400 animate-pulse font-bold flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          Loading Round Progression Data...
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-3">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Panel Content */}
      {summary && !loading && (
        <div className="space-y-6">
          
          {/* Controls Bar: Mode Switcher + Planned Rule Info + Selection Counter */}
          {isGrandFinal ? (
            <div className="bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-base font-black text-white flex items-center gap-2">
                    Championship Stage &bull; Grand Finals
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-widest">
                      Prize Distribution
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Grand Finals is the terminal stage. No teams advance beyond this round. Final rankings determine the prize pool distribution.
                  </p>
                </div>
              </div>

              {Array.isArray(summary.prize_positions) && summary.prize_positions.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  {summary.prize_positions.map((p) => (
                    <div key={p.rank} className="p-3 rounded-xl bg-black/40 border border-amber-500/20 text-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 block">
                        {p.name || `Rank ${p.rank}`}
                      </span>
                      <span className="text-sm font-black text-white block mt-0.5">
                        {p.prize_amount != null ? `₹${p.prize_amount.toLocaleString()}` : `${p.percentage}%`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-[#0E1117] border border-white/10 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              {/* Modes */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-400 mr-1 flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" />
                  Mode:
                </span>
                {[
                  { id: 'per_district', label: 'Per District' },
                  { id: 'overall', label: 'Overall Standings' },
                  { id: 'manual', label: 'Manual Selection' },
                ].map((m) => {
                  const isActive = activeMode === m.id;
                  return (
                    <button
                      key={m.id}
                      onClick={() => handleModeChange(m.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        isActive
                          ? 'bg-white/15 text-white border border-white/20 shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {/* Planned Rule & Selection Count */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Planned Rule Indicator */}
                <div className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>
                    Planned Rule:{' '}
                    <strong>
                      {summary.planned_rule?.advancement_type === 'per_district'
                        ? `Top ${summary.planned_rule.teams_advancing_per_district || 2} per District`
                        : `Top ${summary.planned_rule?.teams_advancing || 16} Overall`}
                    </strong>
                  </span>
                </div>

                {/* Selected Count Indicator */}
                <div
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 ${
                    selectedTeamIds.length === plannedCount
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  }`}
                >
                  <span>
                    Selected <strong>{selectedTeamIds.length}</strong> of planned <strong>{plannedCount}</strong>
                  </span>
                </div>

                <button
                  onClick={handleResetToPlanned}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                  title="Reset selection to roadmap plan"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Tie Warning Banner (Qualifiers only) */}
          {!isGrandFinal && tieInfo.hasTie && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3 shadow-lg">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-2 flex-1">
                  <div>
                    <h4 className="text-sm font-black text-amber-300">
                      True Tie Detected at Cutoff Boundary ({tieInfo.cutoffScore} pts)
                    </h4>
                    <p className="text-xs text-amber-200/90 mt-0.5">
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
                              ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/20'
                              : 'bg-white/10 hover:bg-white/20 text-white border border-white/15'
                          }`}
                        >
                          <span>{team.team_name}</span>
                          <span className="text-[10px] opacity-80">
                            (Rank #{team.rank ?? team.district_rank ?? '-'} &bull; {team.wwcd_count || 0} WWCD &bull; {team.total_kills || 0} Kills)
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${isSelected ? 'bg-black/20 text-black' : 'bg-amber-400/20 text-amber-300'}`}>
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

          {/* Target Round Information & Result Locks */}
          {!targetRound ? (
            <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-blue-400" />
              <span>This is the final round of the roadmap. No further stage advancement is required.</span>
            </div>
          ) : targetHasResults ? (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
              <Lock className="w-4 h-4 text-rose-400" />
              <span>
                <strong>Target Round Locked:</strong> {targetRound.name} already has recorded match results. Advancement into this round is locked.
              </span>
            </div>
          ) : isAlreadyAdvanced ? (
            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                <span>
                  Teams were previously advanced to <strong>{targetRound.name}</strong>. Re-advancing will cleanly replace the previous qualification list.
                </span>
              </div>
            </div>
          ) : null}

          {/* Matches Pending Results Box */}
          {(() => {
            const unverifiedMatchesList = (summary.unverified_matches && summary.unverified_matches.length > 0)
              ? summary.unverified_matches
              : (summary.unverified_match_ids || []).map((id, idx) => ({
                  id,
                  match_id: id,
                  match_number: idx + 1,
                  group_name: `District ${idx + 1}`,
                }));

            if (summary.results_complete && unverifiedMatchesList.length === 0) return null;

            return (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 space-y-3 shadow-lg">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <div>
                    <h4 className="text-sm font-black text-amber-300">
                      Matches Pending Results ({unverifiedMatchesList.length})
                    </h4>
                    <p className="text-xs text-amber-200/80">
                      Some source round matches have no recorded results yet. Enter results before qualifying teams to ensure accurate standings.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                  {unverifiedMatchesList.map((m) => (
                    <div
                      key={m.id || m.match_id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-amber-500/20 text-xs"
                    >
                      <div className="truncate pr-2">
                        <span className="font-bold text-white block truncate">
                          Match {m.match_number}
                        </span>
                        <span className="text-[10px] text-amber-400/90 block truncate">
                          {m.group_name || `District ${m.match_number}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedResultMatch(m)}
                        className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-[11px] transition cursor-pointer shrink-0 shadow-sm"
                      >
                        Enter results
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Standings Table with Selection Checkboxes */}
          <div className="bg-[#0A0C10] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                {isGrandFinal ? 'Grand Finals Final Standings' : 'Round Standings & Advancement Selection'}
              </h4>
              <span className="text-xs text-slate-400">
                {isGrandFinal ? 'Official verified tournament results' : 'Click team row or checkbox to toggle qualification'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                <thead>
                  <tr className="bg-black/40 text-gray-400 text-xs uppercase tracking-wider">
                    {!isGrandFinal && <th className="px-4 py-3 text-center w-12">Advance</th>}
                    <th className="px-4 py-3 text-center w-14">Rank</th>
                    <th className="px-4 py-3">Team Name</th>
                    <th className="px-4 py-3 text-center">District</th>
                    <th className="px-4 py-3 text-center">Played</th>
                    <th className="px-4 py-3 text-center">WWCD</th>
                    <th className="px-4 py-3 text-center">Kills</th>
                    <th className="px-4 py-3 text-right">Points</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(summary.standings || []).map((team) => {
                    const isSelected = selectedTeamIds.includes(team.team_id);
                    const isDq = Boolean(team.is_disqualified);

                    return (
                      <tr
                        key={team.team_id}
                        onClick={() => !isGrandFinal && !isDq && handleToggleTeam(team.team_id)}
                        className={`transition-colors ${!isGrandFinal ? 'cursor-pointer' : ''} ${
                          isDq
                            ? 'opacity-40 bg-red-950/10 cursor-not-allowed'
                            : isSelected && !isGrandFinal
                            ? 'bg-indigo-600/[0.08] hover:bg-indigo-600/[0.12]'
                            : 'hover:bg-white/[0.02]'
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
                              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-white/20 bg-black/40 disabled:opacity-30 cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Rank */}
                        <td className="px-4 py-3 text-center font-bold text-slate-400">
                          #{team.rank || '-'}
                        </td>

                        {/* Team Name */}
                        <td className="px-4 py-3">
                          <div className="font-bold text-white flex items-center gap-2">
                            {team.team_name}
                            {isDq && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 uppercase">
                                DQ
                              </span>
                            )}
                            {(team.tie_broken || team.district_tie_broken || (summary.standings?.filter((s) => Number(s.total_points) === Number(team.total_points)).length > 1)) && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30"
                                title="Position determined by tie-break rules"
                              >
                                Tie-break
                              </span>
                            )}
                            {(team.is_true_tie || team.district_is_true_tie) && (
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                title="True tie across all 4 criteria"
                              >
                                Cutoff Tie
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">LDR: {team.leader_name || 'Host'}</div>
                        </td>

                        {/* District */}
                        <td className="px-4 py-3 text-center text-xs text-slate-400">
                          {team.assigned_group_name || team.district_name || '-'}
                        </td>

                        {/* Played */}
                        <td className="px-4 py-3 text-center text-xs text-slate-400">
                          {team.matches_played || 1}
                        </td>

                        {/* WWCD */}
                        <td className="px-4 py-3 text-center text-xs text-slate-400 font-bold">
                          {team.wwcd_count > 0 ? (
                            <span className="px-2 py-0.5 rounded bg-yellow-400/10 text-yellow-400 border border-yellow-400/20">
                              {team.wwcd_count}
                            </span>
                          ) : (
                            '-'
                          )}
                        </td>

                        {/* Kills */}
                        <td className="px-4 py-3 text-center text-xs text-slate-400">
                          {team.total_kills || 0}
                        </td>

                        {/* Total Points */}
                        <td className="px-4 py-3 text-right font-black text-indigo-400">
                          {team.total_points || 0}
                        </td>

                        {/* Badge Status */}
                        <td className="px-4 py-3 text-center">
                          {isDq ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Disqualified
                            </span>
                          ) : isSelected ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                              Qualified
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                              Eliminated
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 bg-black/40 border-t border-white/5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-slate-300">Tie-break order:</span>
                <span>1. Total WWCDs &bull; 2. Total placement points &bull; 3. Total elimination points &bull; 4. Best placement in most recent match</span>
              </span>
              <span className="text-slate-500 text-[10px]">
                * Tie-break note appears on rows where tie-breakers were needed
              </span>
            </div>
          </div>

          {/* Placement Preview (Target Districts) */}
          {targetRound && targetDistricts.length > 0 && selectedTeamIds.length > 0 && (
            <div className="bg-[#0E1117] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                <div>
                  <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Shuffle className="w-4 h-4 text-indigo-400" />
                    Target Placement Preview ({targetRound.name})
                  </h4>
                  <p className="text-xs text-slate-400">
                    Default snake seeding by verified scores. Use dropdowns to manually reassign a team to a different district.
                  </p>
                </div>
              </div>

              {/* District Columns Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {targetDistricts.map((dist) => {
                  const teamsInDistrict = districtBuckets[dist.id] || [];
                  return (
                    <div
                      key={dist.id}
                      className="bg-black/30 border border-white/5 rounded-xl p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between border-b border-white/5 pb-2">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-indigo-500" />
                          {dist.group_name}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-slate-400">
                          {teamsInDistrict.length} team(s)
                        </span>
                      </div>

                      <div className="space-y-1.5 min-h-[60px]">
                        {teamsInDistrict.length === 0 ? (
                          <div className="text-[11px] text-slate-500 italic p-2 text-center">
                            No teams seeded
                          </div>
                        ) : (
                          teamsInDistrict.map((t, idx) => (
                            <div
                              key={t.team_id}
                              className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5 text-xs group hover:border-white/10"
                            >
                              <div className="truncate pr-2">
                                <span className="font-bold text-white block truncate">{t.team_name}</span>
                                <span className="text-[10px] text-slate-500">Seed #{idx + 1} &bull; {t.total_points || 0} pts</span>
                              </div>

                              {/* Manual Reassign Selector */}
                              <select
                                value={dist.id}
                                onChange={(e) => handleMoveTeamDistrict(t.team_id, e.target.value)}
                                className="text-[10px] bg-black/60 border border-white/15 text-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-indigo-500 cursor-pointer"
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

          {/* Action Footer */}
          {targetRound && !isGrandFinal && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-[#0A0C10] border border-white/10">
              <div className="text-xs text-slate-400">
                {targetHasResults ? (
                  <span className="text-rose-400 font-bold">Target round results verified; progression locked.</span>
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
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-600/30"
              >
                <span>{isAlreadyAdvanced ? 'Update Qualification' : 'Qualify Selected Teams'}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
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

      {/* Match Result Entry Modal */}
      {selectedResultMatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#0E1117] border border-white/10 rounded-2xl p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/10">
              <h3 className="text-base font-black text-white">
                Enter Match Results — Match {selectedResultMatch.match_number} ({selectedResultMatch.group_name || 'District'})
              </h3>
              <button
                type="button"
                onClick={() => setSelectedResultMatch(null)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer"
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
