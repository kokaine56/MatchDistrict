import { useState, useEffect, useMemo } from 'react';
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
  Edit2,
  AlertTriangle,
  ArrowRight,
  Save,
  Globe,
  EyeOff,
  Loader2,
} from 'lucide-react';
import RoundQualifyPanel from './qualification/RoundQualifyPanel.jsx';
import TeamDisqualifyModal from './qualification/TeamDisqualifyModal.jsx';
import TeamScoreEditModal from './leaderboard/TeamScoreEditModal.jsx';
import QualifyTeamsModal from './leaderboard/QualifyTeamsModal.jsx';

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
  const [successToast, setSuccessToast] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Roadmap Rounds list
  const [availableRounds, setAvailableRounds] = useState([]);
  // Currently viewed round: 'overall' | roundId
  const [selectedViewRound, setSelectedViewRound] = useState('overall');
  // Currently selected district filter in standings view: 'all' | districtId
  const [selectedDistrictId, setSelectedDistrictId] = useState('all');
  const [roundDistricts, setRoundDistricts] = useState([]);
  const [hasRoundDistricts, setHasRoundDistricts] = useState(false);

  // Publication state
  const [isPublished, setIsPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savingDistrict, setSavingDistrict] = useState(false);

  // Organizer mode: 'standings' | 'qualify'
  const [organizerTab, setOrganizerTab] = useState('standings');
  // Selected round for qualification
  const [selectedQualifyRoundId, setSelectedQualifyRoundId] = useState(null);
  const [disqualifyModalTeam, setDisqualifyModalTeam] = useState(null);

  // Point editing modal state
  const [editingScoreTeam, setEditingScoreTeam] = useState(null);

  // Team selection for Manual Qualification
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [qualifyModalOpen, setQualifyModalOpen] = useState(false);

  const isOverallView = selectedViewRound === 'overall';

  // Fetch rounds for the tournament
  useEffect(() => {
    let ignore = false;
    const loadRounds = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!ignore && data.success && Array.isArray(data.rounds) && data.rounds.length > 0) {
          setAvailableRounds(data.rounds);
          setSelectedQualifyRoundId((curr) => curr || data.rounds[0].id);
        }
      } catch {
        // Non-blocking fallback
      }
    };
    loadRounds();
    return () => {
      ignore = true;
    };
  }, [tournamentId, refreshTrigger]);

  // Fetch standings for selected view round
  useEffect(() => {
    let ignore = false;
    const loadStandings = async () => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/tournaments/${tournamentId}/leaderboard`;
        if (selectedViewRound && selectedViewRound !== 'overall') {
          url += `?roundId=${selectedViewRound}`;
        }
        const token = localStorage.getItem('token') || '';
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!ignore) {
          if (!data.success) throw new Error(data.error || 'Failed to load leaderboard');
          setStandings(data.standings || []);
          setRoundDistricts(data.districts || []);
          setHasRoundDistricts(Boolean(data.has_districts && data.districts && data.districts.length > 0));
          setIsPublished(Boolean(data.is_published));
          setSelectedDistrictId('all');
          setSelectedTeamIds([]);
        }
      } catch (err) {
        if (!ignore) setError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    loadStandings();
    return () => {
      ignore = true;
    };
  }, [tournamentId, selectedViewRound, refreshTrigger]);

  // Filter standings: In overall view, NEVER filter by district. In round views, filter if a district tab is active.
  const displayedStandings = useMemo(() => {
    if (!standings) return [];
    if (isOverallView || selectedDistrictId === 'all') return standings;
    return standings.filter(
      (t) => t.group_id === selectedDistrictId || t.district_id === selectedDistrictId
    );
  }, [standings, selectedDistrictId, isOverallView]);

  // Derive source and target round from the tournament roadmap
  const { currentSourceRound, nextTargetRound } = useMemo(() => {
    if (availableRounds.length === 0) return { currentSourceRound: null, nextTargetRound: null };

    if (!isOverallView) {
      const idx = availableRounds.findIndex((r) => r.id === selectedViewRound);
      const src = idx !== -1 ? availableRounds[idx] : availableRounds[0];
      const target = idx !== -1 && idx + 1 < availableRounds.length ? availableRounds[idx + 1] : null;
      return { currentSourceRound: src, nextTargetRound: target };
    }

    return {
      currentSourceRound: availableRounds[0] || null,
      nextTargetRound: availableRounds.length > 1 ? availableRounds[1] : null,
    };
  }, [availableRounds, isOverallView, selectedViewRound]);

  const targetCapacity = nextTargetRound?.teams_advancing || currentSourceRound?.teams_advancing || null;
  const isOverCapacity = targetCapacity != null && selectedTeamIds.length > targetCapacity;

  const currentActiveDistrict = useMemo(() => {
    if (selectedDistrictId === 'all') return null;
    return roundDistricts.find((d) => d.id === selectedDistrictId) || null;
  }, [roundDistricts, selectedDistrictId]);

  // Toggle selection for an individual team
  const toggleSelectTeam = (teamId) => {
    setSelectedTeamIds((prev) => {
      if (prev.includes(teamId)) {
        return prev.filter((id) => id !== teamId);
      }
      return [...prev, teamId];
    });
  };

  // Select / Deselect all eligible teams in the current view
  const selectableTeams = useMemo(() => {
    return displayedStandings.filter((t) => t.status !== 'disqualified' && !t.is_disqualified);
  }, [displayedStandings]);

  const isAllSelected = selectableTeams.length > 0 && selectableTeams.every((t) => selectedTeamIds.includes(t.team_id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedTeamIds([]);
    } else {
      setSelectedTeamIds(selectableTeams.map((t) => t.team_id));
    }
  };

  const showToastMessage = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  const triggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  // Organizer: Toggle publication of current round / overall leaderboard
  const handleTogglePublish = async () => {
    setPublishing(true);
    try {
      const token = localStorage.getItem('token') || '';
      let url = `/api/tournaments/${tournamentId}/leaderboard/publish`;
      if (!isOverallView && selectedViewRound) {
        url = `/api/tournaments/${tournamentId}/rounds/${selectedViewRound}/publish`;
      }
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ published: !isPublished }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to update publication status');
      setIsPublished(data.published);
      showToastMessage(
        data.published
          ? 'Leaderboard published! Standings are now visible to participants.'
          : 'Leaderboard unpublished (returned to draft).'
      );
      triggerRefresh();
    } catch (err) {
      showToastMessage(`Error: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // Organizer: Save all scores in currently viewed district
  const handleSaveDistrictScores = async () => {
    if (!currentActiveDistrict || savingDistrict) return;
    setSavingDistrict(true);
    try {
      const token = localStorage.getItem('token') || '';
      const teamScores = displayedStandings.map((t) => ({
        team_id: t.team_id,
        placement_points: Number(t.total_placement_points) || 0,
        kill_points: Number(t.total_kills) || 0,
        total_kills: Number(t.total_kills) || 0,
        wwcd_count: Number(t.wwcd_count) || 0,
        matches_played: Number(t.matches_played) || 1,
      }));

      const res = await fetch(
        `/api/tournaments/${tournamentId}/rounds/${selectedViewRound}/districts/${currentActiveDistrict.id}/save-scores`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ team_scores: teamScores }),
        }
      );
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to save district scores');
      showToastMessage(`Scores for ${currentActiveDistrict.name} successfully saved!`);
      triggerRefresh();
    } catch (err) {
      showToastMessage(`Error: ${err.message}`);
    } finally {
      setSavingDistrict(false);
    }
  };

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
      
      {/* ── Organizer Navigation & Publication Controls ── */}
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
              <span>Standings & Management</span>
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
              <span>Seeding & District Buckets</span>
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 px-2 sm:px-0">
            {/* Publication Status Pill and Action Button */}
            <div className="flex items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1.5 border ${
                  isPublished
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                }`}
              >
                {isPublished ? <CheckCircle2 className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>{isPublished ? 'Published' : 'Draft (Unpublished)'}</span>
              </span>

              <button
                type="button"
                onClick={handleTogglePublish}
                disabled={publishing}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                  isPublished
                    ? 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30 hover:bg-surface-container-high'
                    : 'bg-primary text-on-primary hover:bg-primary/90 shadow-sm font-black'
                }`}
              >
                {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                <span>{isPublished ? 'Unpublish' : 'Publish Leaderboard'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Success Toast ── */}
      {successToast && (
        <div className="p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="p-1 hover:bg-emerald-500/20 rounded cursor-pointer"
          >
            &times;
          </button>
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
            triggerRefresh();
            showToastMessage('Stage qualification updated successfully.');
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

              {/* District Filter Tabs: Strictly hidden on Overall Leaderboard; only rendered when viewing a round that has districts */}
              {!isOverallView && hasRoundDistricts && roundDistricts.length > 0 && (
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
                    const isSaved = dist.scores_saved || dist.scores_status === 'saved';
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
                        <span className={`w-1.5 h-1.5 rounded-full ${isSaved ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                        <span>{dist.name}</span>
                        <span className="text-[10px] opacity-70 font-black">({count})</span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-black uppercase tracking-tight ${
                          isSaved ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-surface-container-highest text-on-surface-variant'
                        }`}>
                          {isSaved ? 'Saved' : 'Unsaved'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── District Scoring & Independent Save Bar ── */}
          {isOrganizer && !isOverallView && selectedDistrictId !== 'all' && currentActiveDistrict && (
            <div className="p-3.5 bg-surface-container-low border border-primary/25 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm animate-in fade-in duration-150">
              <div className="flex items-center gap-2 flex-wrap">
                <Compass className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs font-black text-on-surface">
                  {currentActiveDistrict.name} Scoring:
                </span>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  currentActiveDistrict.scores_saved || currentActiveDistrict.scores_status === 'saved'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                }`}>
                  {currentActiveDistrict.scores_saved || currentActiveDistrict.scores_status === 'saved' ? 'Scores Saved' : 'Scores Unsaved'}
                </span>
                <span className="text-[11px] text-on-surface-variant">
                  ({displayedStandings.length} assigned teams)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveDistrictScores}
                  disabled={savingDistrict || displayedStandings.length === 0}
                  className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {savingDistrict ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save District Scores</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Overall View Organizer Stage Qualification Helper Banner ── */}
          {isOrganizer && isOverallView && availableRounds.length > 0 && (
            <div className="p-3.5 bg-surface-container-low border border-primary/20 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
              <div className="flex items-center gap-2 text-on-surface">
                <Compass className="w-4 h-4 text-primary shrink-0" />
                <span>
                  <strong>Global Standings:</strong> Teams are ranked globally by overall points. To advance teams to subsequent rounds, choose a stage:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {availableRounds.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedViewRound(r.id)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant/30 transition cursor-pointer flex items-center gap-1"
                  >
                    <span>{r.name || `Round ${r.round_number}`}</span>
                    <ArrowRight className="w-3 h-3 text-primary" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Active Qualification Action Bar (When organizer selects teams) ── */}
          {isOrganizer && selectedTeamIds.length > 0 && (
            <div className="bg-surface-container-high border-2 border-primary/40 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-1.5 rounded-xl bg-primary text-on-primary font-black text-xs flex items-center gap-1.5 shadow-xs">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{selectedTeamIds.length} Teams Selected</span>
                </div>
                <div className="text-xs text-on-surface flex items-center gap-1.5 flex-wrap">
                  <span className="text-on-surface-variant">Advancing to:</span>
                  <span className="font-black text-primary">
                    {nextTargetRound ? (nextTargetRound.name || `Round ${nextTargetRound.round_number}`) : 'Next Stage (Grand Final)'}
                  </span>
                  {targetCapacity != null && (
                    <span className="text-on-surface-variant font-mono text-[11px] ml-1">
                      ({selectedTeamIds.length} / {targetCapacity} capacity)
                    </span>
                  )}
                </div>
                {isOverCapacity && (
                  <span className="text-xs text-error font-bold flex items-center gap-1 bg-error/10 px-2 py-0.5 rounded-md border border-error/20">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Exceeds capacity limit ({targetCapacity})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTeamIds([])}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 transition-colors cursor-pointer"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  disabled={!nextTargetRound || isOverCapacity}
                  onClick={() => setQualifyModalOpen(true)}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Qualify Selected Teams ({selectedTeamIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Participant Draft / Unpublished Notice ── */}
          {!isOrganizer && !isPublished ? (
            <div className="p-12 text-center border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-on-surface">Standings Pending Publication</h3>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                Tournament organizers are currently verifying and saving match scores. Standings will be published here shortly once finalized.
              </p>
            </div>
          ) : displayedStandings.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low">
              <Trophy className="w-16 h-16 mx-auto mb-4 text-on-surface-variant/30" />
              <h3 className="text-lg font-black text-on-surface mb-2">No Results Yet</h3>
              <p className="text-on-surface-variant text-xs max-w-sm mx-auto">
                {isOverallView
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
                        {/* Checkbox Header for Organizer Selection */}
                        {isOrganizer && (
                          <th className="px-4 py-3.5 text-center w-10">
                            <input
                              type="checkbox"
                              checked={isAllSelected}
                              onChange={toggleSelectAll}
                              title="Select all eligible teams"
                              className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant bg-surface-container cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="px-5 py-3.5 font-bold text-center w-16">Rank</th>
                        <th className="px-5 py-3.5 font-bold">Team</th>
                        {/* District Column: ONLY rendered when NOT overall view and round has districts */}
                        {!isOverallView && hasRoundDistricts && (
                          <th className="px-5 py-3.5 font-bold text-center">District</th>
                        )}
                        <th className="px-5 py-3.5 font-bold text-center">Played</th>
                        <th className="px-5 py-3.5 font-bold text-center">Place Pts</th>
                        <th className="px-5 py-3.5 font-bold text-center">Total Kills</th>
                        <th className="px-5 py-3.5 font-bold text-center">WWCD</th>
                        <th className="px-5 py-3.5 font-black text-right text-on-surface">Total Pts</th>
                        {isOrganizer && <th className="px-5 py-3.5 font-bold text-center">Status / Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/10 font-medium">
                      {displayedStandings.map((team, idx) => {
                        // In Overall View: Rank strictly by overall points (team.rank ?? idx + 1)
                        // In Round View: Use district_rank if in district tab, or rank
                        const rankNumber = isOverallView ? (team.rank ?? idx + 1) : (team.district_rank ?? team.rank ?? idx + 1);
                        const isTop1 = rankNumber === 1;
                        const isTop2 = rankNumber === 2;
                        const isTop3 = rankNumber === 3;
                        const isSelected = selectedTeamIds.includes(team.team_id);
                        const isDisqualified = team.status === 'disqualified' || team.is_disqualified;

                        return (
                          <tr
                            key={team.team_id || idx}
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-primary/[0.08] border-l-4 border-l-primary'
                                : isTop1
                                ? 'bg-yellow-500/[0.04] border-l-2 border-l-yellow-500 hover:bg-surface-container-high/40'
                                : isTop2
                                ? 'bg-slate-400/[0.04] border-l-2 border-l-slate-400 hover:bg-surface-container-high/40'
                                : isTop3
                                ? 'bg-amber-600/[0.04] border-l-2 border-l-amber-600 hover:bg-surface-container-high/40'
                                : 'hover:bg-surface-container-high/40'
                            }`}
                          >
                            {/* Checkbox Cell for Organizer Selection */}
                            {isOrganizer && (
                              <td className="px-4 py-3.5 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleSelectTeam(team.team_id)}
                                  disabled={isDisqualified}
                                  className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant bg-surface-container cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                />
                              </td>
                            )}

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
                                    title="Rank resolved by authoritative tie-break rules"
                                  >
                                    Tie-break
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-on-surface-variant mt-0.5">
                                Captain: {team.leader_name || 'Captain'}
                              </div>
                            </td>

                            {/* District: ONLY shown in round-specific views with districts */}
                            {!isOverallView && hasRoundDistricts && (
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

                            {/* Total Kills */}
                            <td className="px-5 py-3.5 text-center">
                              <div className="flex items-center justify-center gap-1 text-rose-500 font-bold">
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
                              <span className="text-base font-black text-primary font-mono">
                                {team.total_points || 0}
                              </span>
                            </td>

                            {/* Organizer Actions */}
                            {isOrganizer && (
                              <td className="px-5 py-3.5 text-center">
                                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                                  {isDisqualified ? (
                                    <>
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error border border-error/30">
                                        Disqualified
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => setDisqualifyModalTeam(team)}
                                        title="Reinstate team"
                                        className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        Reinstate
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {/* Qualification Status Badge */}
                                      {team.is_advanced || team.advanced ? (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Qualified
                                        </span>
                                      ) : (
                                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                                          Active
                                        </span>
                                      )}

                                      {/* Edit Points Action Button */}
                                      <button
                                        type="button"
                                        onClick={() => setEditingScoreTeam(team)}
                                        title="Edit team leaderboard points"
                                        className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-primary/10 text-primary hover:bg-primary/20 border border-primary/25 transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                                      >
                                        <Edit2 className="w-3 h-3" />
                                        <span>Edit Score</span>
                                      </button>

                                      {/* Disqualify Button */}
                                      <button
                                        type="button"
                                        onClick={() => setDisqualifyModalTeam(team)}
                                        title="Disqualify team"
                                        className="px-2 py-1 rounded-lg text-[11px] font-bold bg-error/10 text-error hover:bg-error/20 border border-error/30 transition-all flex items-center gap-1 cursor-pointer"
                                      >
                                        <Ban className="w-3 h-3" />
                                        <span>DQ</span>
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
                    * Tie-break label indicates teams resolved by authoritative tie-breaker rules
                  </span>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Organizer Score Editing Modal ── */}
      <TeamScoreEditModal
        isOpen={Boolean(editingScoreTeam)}
        team={editingScoreTeam}
        tournamentId={tournamentId}
        roundId={isOverallView ? null : selectedViewRound}
        onClose={() => setEditingScoreTeam(null)}
        onSuccess={() => {
          triggerRefresh();
          showToastMessage('Team points successfully updated.');
        }}
      />

      {/* ── Manual Qualification to Next Round Modal ── */}
      <QualifyTeamsModal
        isOpen={qualifyModalOpen}
        tournamentId={tournamentId}
        sourceRound={currentSourceRound}
        targetRound={nextTargetRound}
        districts={roundDistricts}
        selectedTeams={displayedStandings.filter((t) => selectedTeamIds.includes(t.team_id))}
        onClose={() => setQualifyModalOpen(false)}
        onSuccess={() => {
          triggerRefresh();
          setSelectedTeamIds([]);
          showToastMessage(`Successfully qualified teams to ${nextTargetRound?.name || 'the next stage'}!`);
        }}
      />

      {/* ── Team Disqualify / Reinstate Modal ── */}
      <TeamDisqualifyModal
        isOpen={Boolean(disqualifyModalTeam)}
        team={disqualifyModalTeam}
        tournamentId={tournamentId}
        onClose={() => setDisqualifyModalTeam(null)}
        onSuccess={() => {
          triggerRefresh();
          showToastMessage('Team status updated.');
        }}
      />
    </div>
  );
}