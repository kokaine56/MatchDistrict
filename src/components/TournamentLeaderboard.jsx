import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Trophy,
  Target,
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
  RefreshCw,
  X,
} from 'lucide-react';
import { formatDateIST12h } from '../utils/timeFormat.js';
import RoundQualifyPanel from './qualification/RoundQualifyPanel.jsx';
import TeamDisqualifyModal from './qualification/TeamDisqualifyModal.jsx';
import QualifyTeamsModal from './leaderboard/QualifyTeamsModal.jsx';
import RoadmapQualifyModal from './leaderboard/RoadmapQualifyModal.jsx';

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
  const [roundsError, setRoundsError] = useState(false);
  const [roundsRefreshTrigger, setRoundsRefreshTrigger] = useState(0);
  // Currently viewed round: 'overall' | roundId
  const [selectedViewRound, setSelectedViewRound] = useState('overall');
  // Currently selected district filter in standings view: 'all' | districtId
  const [selectedDistrictId, setSelectedDistrictId] = useState('all');
  const [roundDistricts, setRoundDistricts] = useState([]);
  const [hasRoundDistricts, setHasRoundDistricts] = useState(false);

  // Publication state
  const [isPublished, setIsPublished] = useState(false);
  const [publicationState, setPublicationState] = useState('draft'); // 'draft' | 'published' | 'updated_after_publication'
  const [publishedVersion, setPublishedVersion] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [savingDistrict, setSavingDistrict] = useState(false);
  const [districtSaveError, setDistrictSaveError] = useState(null);

  // Score Editing Mode & Match Selection (Specs B2, B3)
  const [isEditingScores, setIsEditingScores] = useState(false);
  const [selectedMatchId, setSelectedMatchId] = useState(null);
  const [matchDraftScores, setMatchDraftScores] = useState({});
  const [matchScoreEntryData, setMatchScoreEntryData] = useState({});
  const [matchScoreEntryReload, setMatchScoreEntryReload] = useState(0);
  // District to re-select after a save/add-match refresh (the standings reload otherwise resets the filter to 'all')
  const pendingRestoreDistrictRef = useRef(null);

  // Organizer mode: 'standings' | 'qualify'
  const [organizerTab, setOrganizerTab] = useState('standings');
  // Selected round for qualification
  const [selectedQualifyRoundId, setSelectedQualifyRoundId] = useState(null);
  const [disqualifyModalTeam, setDisqualifyModalTeam] = useState(null);

  // Team selection for Manual Qualification
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [qualifyModalOpen, setQualifyModalOpen] = useState(false);
  const [roadmapQualifyOpen, setRoadmapQualifyOpen] = useState(false);

  const isOverallView = selectedViewRound === 'overall';

  // Fetch rounds for the tournament
  useEffect(() => {
    let ignore = false;
    const loadRounds = async () => {
      try {
        const token = localStorage.getItem('token') || '';
        const res = await fetch(`/api/tournaments/${tournamentId}/rounds`, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.rounds)) {
          throw new Error('Could not load roadmap stages');
        }
        if (!ignore) {
          setAvailableRounds(data.rounds);
          if (data.rounds.length > 0) {
            setSelectedQualifyRoundId((curr) => curr || data.rounds[0].id);
          }
          setRoundsError(false);
        }
      } catch {
        if (!ignore) setRoundsError(true);
      }
    };
    loadRounds();
    return () => {
      ignore = true;
    };
  }, [tournamentId, refreshTrigger, roundsRefreshTrigger]);

  // Fetch standings for selected view round (keeps previous data to prevent flicker)
  useEffect(() => {
    let ignore = false;
    const loadStandings = async () => {
      setLoading(true);
      setError(null);
      setDistrictSaveError(null);
      try {
        let url = `/api/tournaments/${tournamentId}/leaderboard`;
        if (selectedViewRound && selectedViewRound !== 'overall') {
          url += `?roundId=${selectedViewRound}`;
        }
        const token = localStorage.getItem('token') || '';
        const res = await fetch(url, {
          cache: 'no-store',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!ignore) {
          if (!res.ok) {
            throw new Error(data?.message || data?.error || 'Failed to load leaderboard');
          }
          if (!data || typeof data !== 'object' || !data.success || !Array.isArray(data.standings)) {
            throw new Error(data?.message || data?.error || 'The leaderboard response was incomplete. Retry to reload it.');
          }
          if (selectedViewRound !== 'overall' && !Array.isArray(data.districts)) {
            throw new Error('The round response did not include district and match allocation data. Retry to reload it.');
          }
          setStandings(data.standings || []);
          setRoundDistricts(data.districts || []);
          setHasRoundDistricts(Boolean(data.has_districts && data.districts && data.districts.length > 0));
          setIsPublished(Boolean(data.is_published));
          setPublicationState(data.publication_state || (data.is_published ? 'published' : 'draft'));
          setPublishedVersion(data.version || data.published_version || null);
          setPublishedAt(data.published_at || null);
          setSelectedDistrictId(pendingRestoreDistrictRef.current || 'all');
          pendingRestoreDistrictRef.current = null;
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

  // Reset editing mode when switching round or district view
  useEffect(() => {
    setIsEditingScores(false);
    setSelectedMatchId(null);
  }, [selectedDistrictId, selectedViewRound]);

  // Filter standings: In overall view, NEVER filter by district. In round views, filter strictly to the authoritative district.
  const displayedStandings = useMemo(() => {
    if (!standings) return [];
    if (isOverallView || selectedDistrictId === 'all') return standings;
    const currentDist = roundDistricts.find(
      (d) => d.id === selectedDistrictId || d.district_id === selectedDistrictId
    );
    if (!currentDist) return [];

    // The backend provides authoritative district-scoped teams in currentDist.teams
    if (Array.isArray(currentDist.teams) && currentDist.teams.length > 0) {
      return currentDist.teams;
    }

    // Fallback: strictly match canonical district_id or group_id
    return standings.filter((t) => {
      if (t.group_id === currentDist.id || t.district_id === currentDist.id) return true;
      if (currentDist.district_id && (t.group_id === currentDist.district_id || t.district_id === currentDist.district_id)) return true;
      return false;
    });
  }, [standings, selectedDistrictId, isOverallView, roundDistricts]);

  // Current active district object
  const currentActiveDistrict = useMemo(() => {
    if (selectedDistrictId === 'all') return null;
    return roundDistricts.find((d) => d.id === selectedDistrictId || d.district_id === selectedDistrictId) || null;
  }, [roundDistricts, selectedDistrictId]);

  // District matches for Match Selector (Spec B3)
  const districtMatches = useMemo(() => {
    if (!currentActiveDistrict) return [];
    return Array.isArray(currentActiveDistrict.matches) ? currentActiveDistrict.matches : [];
  }, [currentActiveDistrict]);

  // Currently active match in match selector
  const activeMatch = useMemo(() => {
    if (!districtMatches || districtMatches.length === 0) return null;
    if (selectedMatchId) {
      const found = districtMatches.find((m) => m.id === selectedMatchId || m.match_id === selectedMatchId);
      if (found) return found;
    }
    return districtMatches[0];
  }, [districtMatches, selectedMatchId]);

  const effectiveSelectedMatchId = activeMatch?.id || null;
  const activeMatchScoreEntry = effectiveSelectedMatchId
    ? matchScoreEntryData[effectiveSelectedMatchId] || null
    : null;

  useEffect(() => {
    if (!isEditingScores || isOverallView || !currentActiveDistrict || !effectiveSelectedMatchId) return undefined;

    let ignore = false;
    const matchId = effectiveSelectedMatchId;
    const districtId = currentActiveDistrict.id;
    const loadMatchScoreEntry = async () => {
      setMatchScoreEntryData((previous) => ({ ...previous, [matchId]: { status: 'loading' } }));
      try {
        const token = localStorage.getItem('token') || '';
        const url = `/api/tournaments/${encodeURIComponent(tournamentId)}/rounds/${encodeURIComponent(selectedViewRound)}/districts/${encodeURIComponent(districtId)}/matches/${encodeURIComponent(matchId)}/score-entry`;
        const res = await fetch(url, {
          cache: 'no-store',
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
          const loadError = new Error(data?.message || 'Could not load this match’s team allocations.');
          loadError.code = data?.error || (res.status === 404 ? 'NOT_FOUND' : 'LOAD_FAILED');
          throw loadError;
        }
        if (
          data.match?.id !== matchId
          || !Array.isArray(data.assigned_teams)
          || !data.results
          || typeof data.results !== 'object'
          || Array.isArray(data.results)
        ) {
          const responseError = new Error('The match allocation response was incomplete. Retry to reload it.');
          responseError.code = 'INVALID_RESPONSE';
          throw responseError;
        }
        if (!ignore) {
          setMatchScoreEntryData((previous) => ({ ...previous, [matchId]: { status: 'loaded', ...data } }));
        }
      } catch (loadError) {
        if (!ignore) {
          setMatchScoreEntryData((previous) => ({
            ...previous,
            [matchId]: {
              status: loadError.code === 'NOT_FOUND'
                ? 'invalid_match'
                : loadError.code === 'INVALID_RESPONSE'
                  ? 'invalid_response'
                  : 'error',
              error: loadError.message,
            },
          }));
        }
      }
    };

    loadMatchScoreEntry();
    return () => { ignore = true; };
  }, [
    isEditingScores,
    isOverallView,
    tournamentId,
    selectedViewRound,
    currentActiveDistrict?.id,
    effectiveSelectedMatchId,
    matchScoreEntryReload,
  ]);

  const retryMatchScoreEntry = () => setMatchScoreEntryReload((current) => current + 1);

  const activeMatchAllocationState = useMemo(() => {
    if (!currentActiveDistrict || !Array.isArray(currentActiveDistrict.matches)) return 'invalid_configuration';
    if (districtMatches.length === 0) return 'no_matches';
    if (!activeMatch) return 'invalid_match';
    if (!activeMatchScoreEntry) return 'loading';
    if (activeMatchScoreEntry.status === 'loading') return 'loading';
    if (activeMatchScoreEntry.status === 'invalid_match') return 'invalid_match';
    if (activeMatchScoreEntry.status === 'error') return 'error';
    if (activeMatchScoreEntry.status === 'invalid_response') return 'invalid_allocation_response';
    if (activeMatchScoreEntry.status !== 'loaded' || !Array.isArray(activeMatchScoreEntry.assigned_teams)) return 'invalid_allocation_response';
    return activeMatchScoreEntry.assigned_teams.length === 0 ? 'empty' : 'loaded';
  }, [currentActiveDistrict, districtMatches, activeMatch, activeMatchScoreEntry]);

  // Slot-ordered teams for Editing Mode (Spec B2: strictly original assigned slot order)
  const slotOrderedTeams = useMemo(() => {
    const assignedTeams = activeMatchScoreEntry?.status === 'loaded'
      ? activeMatchScoreEntry.assigned_teams
      : null;
    if (!Array.isArray(assignedTeams)) return [];
    return [...assignedTeams].sort((a, b) => {
      const aSlot = a.slot_number != null ? Number(a.slot_number) : Number.MAX_SAFE_INTEGER;
      const bSlot = b.slot_number != null ? Number(b.slot_number) : Number.MAX_SAFE_INTEGER;
      if (aSlot !== bSlot) return aSlot - bSlot;
      return String(a.assignment_id || '').localeCompare(String(b.assignment_id || ''));
    });
  }, [activeMatchScoreEntry]);

  // Resolve match score for a team in the active match
  const getMatchScoreForTeam = (teamId) => {
    const matchId = effectiveSelectedMatchId;
    const draft = matchId ? matchDraftScores[matchId]?.[teamId] : null;
    const saved = matchId && activeMatchScoreEntry?.results ? activeMatchScoreEntry.results[teamId] : null;

    let placement = '';
    let kills = '';

    if (draft && draft.placement !== undefined) {
      placement = draft.placement;
    } else if (saved && saved.placement != null) {
      placement = saved.placement;
    }

    if (draft && draft.kills !== undefined) {
      kills = draft.kills;
    } else if (saved && saved.kills != null) {
      kills = saved.kills;
    }

    return {
      placement,
      kills,
      pNum: placement !== '' && placement != null ? Number(placement) : null,
    };
  };

  const updateMatchScore = (teamId, field, value) => {
    const matchId = effectiveSelectedMatchId;
    if (!matchId) return;
    setMatchDraftScores((prev) => {
      const matchDrafts = prev[matchId] || {};
      const existing = matchDrafts[teamId] || {};
      const currentSaved = activeMatchScoreEntry?.results?.[teamId] || {};

      const basePlacement = existing.placement !== undefined ? existing.placement : (currentSaved.placement ?? '');
      const baseKills = existing.kills !== undefined ? existing.kills : (currentSaved.kills ?? '');

      return {
        ...prev,
        [matchId]: {
          ...matchDrafts,
          [teamId]: {
            placement: field === 'placement' ? value : basePlacement,
            kills: field === 'kills' ? value : baseKills,
          },
        },
      };
    });
  };

  // Real-time client validation in Editing Mode (Spec B4)
  const editingValidation = useMemo(() => {
    if (!isEditingScores || !effectiveSelectedMatchId || !currentActiveDistrict) {
      return { isValid: true, errors: [], duplicatePlacements: new Set(), invalidPlacements: new Set(), invalidKills: new Set() };
    }
    const capacity = Number(activeMatchScoreEntry?.match?.capacity) || Number(activeMatch?.capacity) || Number(currentActiveDistrict.capacity) || slotOrderedTeams.length;
    const errors = [];
    const placementCounts = new Map();
    const duplicatePlacements = new Set();
    const invalidPlacements = new Set();
    const invalidKills = new Set();
    const invalidSlots = new Set();
    const seenSlots = new Set();

    for (const team of slotOrderedTeams) {
      const slot = Number(team.slot_number);
      if (!Number.isInteger(slot) || slot < 1 || seenSlots.has(slot)) {
        invalidSlots.add(team.team_id);
        errors.push(`Team "${team.team_name}": this match is missing a valid unique allocated slot.`);
      } else {
        seenSlots.add(slot);
      }
      const score = getMatchScoreForTeam(team.team_id);
      if (score.placement !== '' && score.placement != null) {
        const p = Number(score.placement);
        if (!Number.isInteger(p) || p < 1 || p > capacity) {
          invalidPlacements.add(team.team_id);
          errors.push(`Team "${team.team_name}": Finish position ${score.placement} must be a whole number between 1 and ${capacity}.`);
        } else {
          const count = (placementCounts.get(p) || 0) + 1;
          placementCounts.set(p, count);
          if (count > 1) {
            duplicatePlacements.add(p);
          }
        }
      }

      if (score.kills !== '' && score.kills != null) {
        const k = Number(score.kills);
        if (!Number.isInteger(k) || k < 0) {
          invalidKills.add(team.team_id);
          errors.push(`Team "${team.team_name}": Kills cannot be negative.`);
        }
      }
    }

    if (duplicatePlacements.size > 0) {
      const dupList = Array.from(duplicatePlacements).sort((a, b) => a - b).join(', ');
      errors.push(`Duplicate finish position(s) detected: Position #${dupList} is assigned to more than one team.`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      duplicatePlacements,
      invalidPlacements,
      invalidKills,
      invalidSlots,
    };
  }, [isEditingScores, effectiveSelectedMatchId, currentActiveDistrict, slotOrderedTeams, matchDraftScores, activeMatch, activeMatchScoreEntry]);

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

  // Unsaved edits (kept distinct from persisted scores): any draft entry in any match of the active district
  const districtHasDraft = useMemo(() => {
    if (!isEditingScores || !districtMatches || districtMatches.length === 0) return false;
    return districtMatches.some((m) => {
      const drafts = matchDraftScores[m.id];
      return drafts && Object.keys(drafts).length > 0;
    });
  }, [isEditingScores, districtMatches, matchDraftScores]);

  // District Save Status: 'saved' | 'modified' | 'error' | 'unsaved'
  const districtSaveStatus = useMemo(() => {
    if (districtSaveError) return 'error';
    if (districtHasDraft) return 'modified';
    if (currentActiveDistrict?.scores_status === 'incomplete') return 'incomplete';
    if (currentActiveDistrict?.scores_saved || currentActiveDistrict?.scores_status === 'saved') return 'saved';
    return 'unsaved';
  }, [districtSaveError, districtHasDraft, currentActiveDistrict]);

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
  const handleTogglePublish = async (targetPublishState) => {
    setPublishing(true);
    try {
      const token = localStorage.getItem('token') || '';
      let url = `/api/tournaments/${tournamentId}/leaderboard/publish`;
      if (!isOverallView && selectedViewRound) {
        url = `/api/tournaments/${tournamentId}/rounds/${selectedViewRound}/publish`;
      }
      const shouldPublish = typeof targetPublishState === 'boolean' ? targetPublishState : !isPublished;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ published: shouldPublish }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'Failed to update publication status');
      setIsPublished(data.published);
      setPublicationState(data.publication_state || (data.published ? 'published' : 'draft'));
      if (data.version) setPublishedVersion(data.version);
      showToastMessage(
        data.published
          ? `Leaderboard snapshot v${data.version || 1} published! Standings are now visible to participants.`
          : 'Leaderboard unpublished (returned to draft).'
      );
      triggerRefresh();
    } catch (err) {
      showToastMessage(`Error: ${err.message}`);
    } finally {
      setPublishing(false);
    }
  };

  // Organizer: Save the active match's kills + finish positions for the district (Spec B4).
  // Only rows with a finish position are sent; empty inputs are never treated as 0 or a valid position.
  const handleSaveMatchScores = async () => {
    if (!currentActiveDistrict || !effectiveSelectedMatchId || savingDistrict) return;
    if (!editingValidation.isValid) return;
    setSavingDistrict(true);
    setDistrictSaveError(null);
    try {
      const token = localStorage.getItem('token') || '';
      const teamScores = [];
      for (const t of slotOrderedTeams) {
        const score = getMatchScoreForTeam(t.team_id);
        const hasPlacement = score.placement !== '' && score.placement != null;
        const hasKills = score.kills !== '' && score.kills != null;
        if (hasPlacement !== hasKills) {
          throw new Error(`Team "${t.team_name}": enter both kills and finish position, or leave both blank.`);
        }
        if (!hasPlacement) {
          if (activeMatchScoreEntry?.results?.[t.team_id]) {
            throw new Error(`Team "${t.team_name}" already has a saved result. Enter corrected kills and finish position; saved match results cannot be cleared.`);
          }
          continue;
        }
        teamScores.push({
          team_id: t.team_id,
          team_name: t.team_name,
          placement: Number(score.placement),
          kills: Number(score.kills),
        });
      }
      if (teamScores.length === 0) {
        throw new Error('Enter at least one finish position before saving.');
      }

      const res = await fetch(
        `/api/tournaments/${tournamentId}/rounds/${selectedViewRound}/districts/${currentActiveDistrict.id}/save-scores`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            match_id: effectiveSelectedMatchId,
            expected_version: currentActiveDistrict.version ?? currentActiveDistrict.scores_version ?? null,
            team_scores: teamScores,
          }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'Failed to save match scores');
      }
      const savedMatchNumber = activeMatch?.match_number || 1;
      const savedDistrictId = currentActiveDistrict.id;
      const savedMatchId = effectiveSelectedMatchId;
      showToastMessage(`Match ${savedMatchNumber} scores for ${currentActiveDistrict.name} saved!`);

      // Clear only this match's unsaved drafts; other matches keep their own drafts.
      setMatchDraftScores((prev) => {
        const next = { ...prev };
        delete next[savedMatchId];
        return next;
      });

      pendingRestoreDistrictRef.current = savedDistrictId;
      retryMatchScoreEntry();
      triggerRefresh();
    } catch (err) {
      setDistrictSaveError(err.message);
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
      <div className="p-8 text-center text-error bg-error/10 rounded-2xl border border-error/20 space-y-4">
        <AlertCircle className="w-10 h-10 mx-auto" />
        <p className="font-bold text-sm">{error}</p>
        <button
          type="button"
          onClick={triggerRefresh}
          className="px-5 py-2 rounded-full text-xs font-bold bg-error text-white hover:bg-error/90 transition shadow-sm cursor-pointer inline-flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${cardContainerClass}`}>
      
      {/* ── Non-blocking Error Banner (if refetch fails while previous data is kept) ── */}
      {error && standings.length > 0 && (
        <div className="p-3 bg-error/10 border border-error/30 rounded-2xl text-error text-xs font-bold flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Could not refresh standings: {error}</span>
          </div>
          <button
            type="button"
            onClick={triggerRefresh}
            className="px-3 py-1 rounded-full text-xs font-bold bg-error text-white hover:bg-error/90 transition cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Organizer Navigation & Publication Controls ── */}
      {isOrganizer && (
        <div className="bg-surface-container-low border border-primary/20 rounded-2xl p-2.5 sm:p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setOrganizerTab('standings')}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer w-auto ${
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
              className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer w-auto ${
                organizerTab === 'qualify'
                  ? 'bg-primary text-on-primary shadow-md'
                  : 'text-primary hover:bg-primary/10'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Seeding & District Buckets</span>
            </button>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 px-2 sm:px-0 flex-wrap">
            {/* Roadmap Qualification Action Button with explicit scope */}
            {nextTargetRound && (
              <button
                type="button"
                onClick={() => setRoadmapQualifyOpen(true)}
                className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 transition flex items-center gap-1.5 cursor-pointer shadow-sm w-auto"
                title="Roadmap-based automatic qualification to next stage"
              >
                <Trophy className="w-3.5 h-3.5 text-amber-300" />
                <span>
                  Qualify to Next Round ({isOverallView || selectedDistrictId === 'all'
                    ? `${currentSourceRound?.name || `Round ${currentSourceRound?.round_number || 1}`}, all districts`
                    : `${currentSourceRound?.name || `Round ${currentSourceRound?.round_number || 1}`}, ${currentActiveDistrict?.name || 'District'}`})
                </span>
              </button>
            )}

            {/* Publication Status Pill and Action Buttons (Decision 6) */}
            <div className="flex items-center gap-2 flex-wrap">
              {publicationState === 'updated_after_publication' ? (
                <>
                  <span
                    className="px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                    title={publishedAt ? `Last published snapshot v${publishedVersion || 1} on ${formatDateIST12h(publishedAt)} (IST)` : undefined}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Updated after publication {publishedVersion ? `(v${publishedVersion})` : ''}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleTogglePublish(true)}
                    disabled={publishing}
                    className="px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-sm w-auto bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
                    title="Publish updated snapshot for participants"
                  >
                    {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    <span>Publish Update</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTogglePublish(false)}
                    disabled={publishing}
                    className="px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer w-auto bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30 hover:bg-surface-container-high disabled:opacity-50"
                    title="Revert to draft unpublished state"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Unpublish</span>
                  </button>
                </>
              ) : publicationState === 'published' ? (
                <>
                  <span
                    className="px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                    title={publishedAt ? `Published on ${formatDateIST12h(publishedAt)} (IST)` : undefined}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Published {publishedVersion ? `(v${publishedVersion})` : ''}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleTogglePublish(false)}
                    disabled={publishing}
                    className="px-3.5 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs w-auto bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/30 hover:bg-surface-container-high disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>Unpublish</span>
                  </button>
                </>
              ) : (
                <>
                  <span className="px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 border bg-surface-container-highest text-on-surface-variant border-outline-variant/30">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Draft (Unpublished)</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => handleTogglePublish(true)}
                    disabled={publishing}
                    className="px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-sm w-auto bg-primary text-on-primary hover:bg-primary/90 disabled:opacity-50"
                  >
                    {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                    <span>Publish Leaderboard</span>
                  </button>
                </>
              )}
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
            className="p-1 hover:bg-emerald-500/20 rounded-full cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {roundsError && (
        <div role="alert" className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-700 dark:text-amber-300 text-xs font-bold flex flex-wrap items-center justify-between gap-3">
          <span>Roadmap stages could not be loaded. Round standings and qualification controls may be unavailable.</span>
          <button
            type="button"
            onClick={() => setRoundsRefreshTrigger((current) => current + 1)}
            className="px-3 py-1.5 rounded-full border border-amber-500/40 hover:bg-amber-500/10 transition-colors"
          >
            Retry stages
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
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide touch-pan-x">
                <button
                  type="button"
                  onClick={() => setSelectedViewRound('overall')}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap w-auto ${
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
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap w-auto ${
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
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer w-auto ${
                      selectedDistrictId === 'all'
                        ? 'bg-surface-container-highest text-on-surface border border-outline-variant/40 shadow-sm'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                    }`}
                  >
                    All Districts ({standings.length})
                  </button>

                  {roundDistricts.map((dist) => {
                    const isDistActive = selectedDistrictId === dist.id || selectedDistrictId === dist.district_id;
                    const distTeams = (Array.isArray(dist.teams) && dist.teams.length > 0)
                      ? dist.teams
                      : standings.filter((t) => t.group_id === dist.id || t.district_id === dist.id || (dist.district_id && (t.group_id === dist.district_id || t.district_id === dist.district_id)));
                    const count = distTeams.length;
                    const isSaved = dist.scores_saved || dist.scores_status === 'saved';
                    return (
                      <button
                        key={dist.id}
                        type="button"
                        onClick={() => setSelectedDistrictId(dist.id)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 w-auto ${
                          isDistActive
                            ? 'bg-surface-container-highest text-on-surface border border-outline-variant/40 shadow-sm'
                            : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-outline-variant/20'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isSaved ? 'bg-emerald-500' : 'bg-amber-400'}`} title={dist.scores_status || (isSaved ? 'saved' : 'unsaved')} />
                        <span>{dist.name}</span>
                        <span className="text-[10px] opacity-70 font-black">({count}{dist.capacity ? `/${dist.capacity}` : ''})</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── District Scoring & Independent Save Bar (spec 3.2: Unsaved / Saved / Modified / Error) ── */}
          {isOrganizer && !isOverallView && selectedDistrictId !== 'all' && currentActiveDistrict && (
            isEditingScores ? (
              /* ── Score Editing Mode District Header (Specs B2, B3) ── */
              <div className="p-4 bg-surface-container-low border-2 border-primary/40 rounded-2xl flex flex-col gap-3 shadow-md animate-in fade-in duration-150">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 rounded-full text-xs font-black bg-primary text-on-primary uppercase tracking-wider flex items-center gap-1.5 shadow-xs">
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Score Editing Mode</span>
                    </span>
                    <span className="text-sm font-black text-on-surface">
                      {currentActiveDistrict.name}
                    </span>
                    <span className="text-xs text-on-surface-variant font-medium">
                      &bull; Assigned Slot Order &bull; Capacity: {activeMatchScoreEntry?.match?.capacity || activeMatch?.capacity || currentActiveDistrict.capacity || slotOrderedTeams.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setIsEditingScores(false)}
                      className="px-3.5 py-1.5 rounded-full text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 transition-all flex items-center gap-1.5 cursor-pointer w-auto"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Cancel / Exit</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveMatchScores}
                      disabled={savingDistrict || !editingValidation.isValid || activeMatchAllocationState !== 'loaded'}
                      className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 transition-all shadow-md flex items-center gap-1.5 cursor-pointer w-auto"
                    >
                      {savingDistrict ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save Scores</span>
                    </button>
                  </div>
                </div>

                {/* Match Selector (Spec B3) */}
                <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/15 flex-wrap">
                  <span className="text-xs font-bold text-on-surface-variant mr-1">Match:</span>
                  {districtMatches.map((m) => {
                    const isMatchActive = m.id === effectiveSelectedMatchId || m.match_id === effectiveSelectedMatchId;
                    const matchNum = m.match_number || 1;
                    const entryData = matchScoreEntryData[m.id];
                    const resultCount = entryData?.status === 'loaded' ? Number(entryData.result_count) || 0 : Number(m.result_count) || 0;
                    const assignmentCount = entryData?.status === 'loaded' ? Number(entryData.assignment_count) || 0 : Number(m.assignment_count) || 0;
                    const hasDraft = Boolean(matchDraftScores[m.id] && Object.keys(matchDraftScores[m.id]).length > 0);
                    const matchStatus = hasDraft
                      ? 'Modified'
                      : entryData?.status === 'loading'
                        ? 'Loading'
                      : entryData?.status === 'error' || entryData?.status === 'invalid_match' || entryData?.status === 'invalid_response'
                          ? 'Error'
                          : resultCount === 0
                      ? 'Unsaved'
                      : assignmentCount > 0 && resultCount >= assignmentCount
                        ? 'Saved'
                        : 'Incomplete';
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSelectedMatchId(m.id)}
                        className={`px-3 py-1 rounded-full text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 w-auto ${
                          isMatchActive
                            ? 'bg-primary text-on-primary shadow-xs'
                            : 'bg-surface-container text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border border-outline-variant/20'
                        }`}
                      >
                        <span>Match {matchNum}</span>
                        <span className={`text-[10px] font-bold ${isMatchActive ? 'text-on-primary/80' : matchStatus === 'Saved' ? 'text-emerald-600 dark:text-emerald-400' : matchStatus === 'Modified' ? 'text-primary' : matchStatus === 'Error' ? 'text-error' : 'text-amber-600 dark:text-amber-400'}`}>
                          {matchStatus}
                        </span>
                      </button>
                    );
                  })}

                  {districtMatches.length === 0 && (
                    <span role="status" className="text-xs text-amber-600 dark:text-amber-400">
                      No configured matches are available for this district.
                    </span>
                  )}
                </div>

                {/* Validation Warnings Banner (Spec B4) */}
                {!editingValidation.isValid && (
                  <div className="p-2.5 rounded-xl bg-error/15 border border-error/30 text-error text-xs font-bold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{editingValidation.errors[0]}</span>
                  </div>
                )}
              </div>
            ) : (
              /* ── Normal Mode District Header ── */
              <div className="p-3.5 bg-surface-container-low border border-primary/25 rounded-2xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-sm animate-in fade-in duration-150">
                <div className="flex items-center gap-2 flex-wrap">
                  <Compass className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-xs font-black text-on-surface">
                    {currentActiveDistrict.name}:
                  </span>

                  {/* State Pill: Saved / Modified / Error / Unsaved */}
                  {districtSaveStatus === 'saved' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Saved {currentActiveDistrict.scores_saved_at ? formatDateIST12h(currentActiveDistrict.scores_saved_at) : ''} (v{currentActiveDistrict.scores_version || 1})</span>
                    </span>
                  ) : districtSaveStatus === 'modified' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Modified - unsaved changes</span>
                    </span>
                  ) : districtSaveStatus === 'error' ? (
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error border border-error/30 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Save Failed</span>
                      </span>
                    </div>
                  ) : districtSaveStatus === 'incomplete' ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>Incomplete results</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-highest text-on-surface-variant border border-outline-variant/30">
                      Unsaved
                    </span>
                  )}

                  <span className="text-[11px] font-bold text-on-surface-variant">
                    ({displayedStandings.length} / {currentActiveDistrict.capacity || displayedStandings.length} district teams)
                  </span>
                  {currentActiveDistrict.capacity != null && displayedStandings.length < Number(currentActiveDistrict.capacity) && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      {Number(currentActiveDistrict.capacity) - displayedStandings.length} slot(s) unfilled
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {!Array.isArray(currentActiveDistrict.matches) ? (
                    <span role="status" className="text-xs text-error inline-flex items-center gap-2">
                      Match configuration is unavailable.
                      <button type="button" onClick={triggerRefresh} className="underline font-bold">Retry</button>
                    </span>
                  ) : currentActiveDistrict.matches.length === 0 ? (
                    <span role="status" className="text-xs text-amber-700 dark:text-amber-300">
                      No roadmap matches are configured for this district.
                    </span>
                  ) : null}
                  {/* Edit Scores Button for Organizers (Spec B2) */}
                  {isOrganizer && (
                    <button
                      type="button"
                      onClick={() => setIsEditingScores(true)}
                      disabled={districtMatches.length === 0}
                      className="w-auto px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Switch to slot-ordered match score editing view"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit Scores</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (!nextTargetRound) {
                        showToastMessage('Championship Stage: Grand Finals is the terminal round; no subsequent round exists.');
                        return;
                      }
                      setRoadmapQualifyOpen(true);
                    }}
                    className="w-auto px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-on-primary bg-emerald-600 hover:bg-emerald-500 transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Roadmap-based qualification to next stage"
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-300" />
                    <span>
                      Qualify to Next Round ({`${currentSourceRound?.name || `Round ${currentSourceRound?.round_number || 1}`}, ${currentActiveDistrict?.name || 'District'}`})
                    </span>
                  </button>
                </div>
              </div>
            )
          )}

          {/* ── Active Qualification Action Bar (When organizer selects teams) ── */}
          {isOrganizer && selectedTeamIds.length > 0 && (
            <div className="bg-surface-container-high border-2 border-primary/40 rounded-2xl p-3.5 sm:p-4 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex flex-wrap items-center gap-3">
                {/* Note: Uses Users icon, NOT CheckCircle2, adhering strictly to spec 18.8 */}
                <div className="px-3.5 py-1.5 rounded-full bg-primary text-on-primary font-black text-xs flex items-center gap-1.5 shadow-xs">
                  <Users className="w-4 h-4" />
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
                  <span className="text-xs text-error font-bold flex items-center gap-1 bg-error/10 px-2 py-0.5 rounded-full border border-error/20">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Exceeds capacity limit ({targetCapacity})
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedTeamIds([])}
                  className="px-3.5 py-1.5 rounded-full text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-highest border border-outline-variant/30 transition-colors cursor-pointer w-auto"
                >
                  Clear Selection
                </button>
                <button
                  type="button"
                  disabled={!nextTargetRound || isOverCapacity}
                  onClick={() => setQualifyModalOpen(true)}
                  className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md flex items-center gap-1.5 cursor-pointer w-auto"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Qualify Selected Teams ({selectedTeamIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Error State with Retry (Spec A3: failed request shows error with Retry, never empty state) ── */}
          {error ? (
            <div className="p-8 text-center border border-red-500/30 rounded-2xl bg-red-500/10 space-y-3">
              <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-red-500">Failed to Load Standings</h3>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto">{error}</p>
              <button
                type="button"
                onClick={() => setRefreshTrigger((c) => c + 1)}
                className="px-4 py-2 rounded-full text-xs font-bold bg-primary text-on-primary hover:opacity-90 transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm w-auto"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            </div>
          ) : !isOrganizer && !isPublished ? (
            <div className="p-12 text-center border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto text-primary">
                <Trophy className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-on-surface">Results not published yet</h3>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                Tournament organizers are currently verifying and saving match scores. The official leaderboard snapshot will appear here as soon as it is published.
              </p>
            </div>
          ) : displayedStandings.length === 0 ? (
            <div className="p-12 text-center border border-dashed border-outline-variant/30 rounded-2xl bg-surface-container-low space-y-3">
              <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center mx-auto text-on-surface-variant/40">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-on-surface">
                {!isOverallView && currentActiveDistrict
                  ? `No Teams Assigned to ${currentActiveDistrict.name}`
                  : 'No Standings Available'}
              </h3>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                {!isOverallView && currentActiveDistrict
                  ? standings.some((t) => t.is_unassigned)
                    ? 'Registered teams exist for this round but have not yet been assigned to this district.'
                    : 'No eligible teams are currently allocated to this district.'
                  : 'Standings will update automatically once match results or scoring entries are verified by the organizers.'}
              </p>
            </div>
          ) : (
            <>
              {/* ── Leaderboard Table (Specs B1, B2) ── */}
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-2xl overflow-hidden shadow-lg">
                <div className="overflow-x-auto">
                  {isEditingScores && isOrganizer && !isOverallView && selectedDistrictId !== 'all' ? (
                    /* ══════════════════════════════════════════════════════════
                       EDITING MODE: Assigned Slot Order (Spec B2)
                       Organizer enters only Finish Position and Kills.
                       ══════════════════════════════════════════════════════════ */
                    <table className="w-full text-left border-collapse whitespace-nowrap text-sm">
                      <thead>
                        <tr className="bg-surface-container-highest/60 text-on-surface-variant text-xs uppercase tracking-wider border-b border-outline-variant/15">
                          <th className="px-5 py-3.5 font-bold text-center w-24">Slot</th>
                          <th className="px-5 py-3.5 font-bold">Team Name</th>
                          <th className="px-5 py-3.5 font-bold text-center w-32">Finish Position</th>
                          <th className="px-5 py-3.5 font-bold text-center w-28">Kills</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 font-medium">
                        {activeMatchAllocationState === 'loading' ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-sm text-on-surface-variant">
                              <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Loading match allocations…</span>
                            </td>
                          </tr>
                        ) : activeMatchAllocationState === 'invalid_configuration'
                          || activeMatchAllocationState === 'invalid_match'
                          || activeMatchAllocationState === 'invalid_allocation_response'
                          || activeMatchAllocationState === 'error' ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-sm text-error">
                              <div className="flex flex-col items-center gap-3">
                                <span>{activeMatchScoreEntry?.error || 'Match allocation data could not be loaded in the expected format. No scores can be entered until it is reloaded.'}</span>
                                <button type="button" onClick={retryMatchScoreEntry} className="px-3 py-1 rounded-full text-xs font-bold bg-primary text-on-primary inline-flex items-center gap-1.5">
                                  <RefreshCw className="w-3.5 h-3.5" />Retry
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : activeMatchAllocationState === 'no_matches' ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-sm text-amber-700 dark:text-amber-300">
                              No configured matches are available for this district. Score entry is unavailable.
                            </td>
                          </tr>
                        ) : activeMatchAllocationState === 'empty' ? (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-sm text-amber-700 dark:text-amber-300">
                              This match has no allocated teams. Score entry is unavailable until the roadmap allocation is corrected.
                            </td>
                          </tr>
                        ) : slotOrderedTeams.map((team) => {
                          const slotNum = team.slot_number != null ? team.slot_number : null;
                          const isDisqualified = team.status === 'disqualified' || team.is_disqualified;
                          const score = getMatchScoreForTeam(team.team_id);
                          const hasDup = score.pNum != null && editingValidation.duplicatePlacements.has(score.pNum);
                          const hasInvalidP = editingValidation.invalidPlacements.has(team.team_id);
                          const hasInvalidK = editingValidation.invalidKills.has(team.team_id);

                          return (
                            <tr
                              key={team.team_id}
                              className="hover:bg-surface-container-high/40 transition-colors"
                            >
                              {/* Slot Number */}
                              <td className="px-5 py-3.5 text-center font-bold text-primary font-mono">
                                {slotNum != null ? `Slot ${slotNum}` : 'Slot unavailable'}
                              </td>

                              {/* Team Name */}
                              <td className="px-5 py-3.5">
                                <div className={`font-black text-on-surface ${isDisqualified ? 'line-through opacity-60' : ''}`}>
                                  {team.team_name}
                                </div>
                                <div className="text-[11px] text-on-surface-variant mt-0.5">
                                  Captain: {team.leader_name || team.captain_name || 'Captain'}
                                </div>
                              </td>

                              {/* Finish Position Input */}
                              <td className="px-5 py-3.5 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  max={activeMatchScoreEntry?.match?.capacity || activeMatch?.capacity || currentActiveDistrict.capacity || slotOrderedTeams.length}
                                  value={score.placement}
                                  onChange={(e) => updateMatchScore(team.team_id, 'placement', e.target.value)}
                                  placeholder="Pos"
                                  disabled={isDisqualified}
                                  className={`w-20 px-2 py-1 text-center font-bold bg-surface-container rounded-lg text-on-surface focus:outline-none text-xs ${
                                    hasDup || hasInvalidP
                                      ? 'border-2 border-red-500 bg-red-500/10 focus:border-red-500 text-red-500'
                                      : 'border border-outline-variant/40 focus:border-primary'
                                  }`}
                                  title={`Finish position (1 to ${activeMatchScoreEntry?.match?.capacity || activeMatch?.capacity || currentActiveDistrict.capacity || slotOrderedTeams.length})`}
                                />
                              </td>

                              {/* Kills Input */}
                              <td className="px-5 py-3.5 text-center">
                                <input
                                  type="number"
                                  min="0"
                                  value={score.kills}
                                  onChange={(e) => updateMatchScore(team.team_id, 'kills', e.target.value)}
                                  placeholder="0"
                                  disabled={isDisqualified}
                                  className={`w-16 px-2 py-1 text-center font-bold bg-surface-container rounded-lg focus:outline-none text-xs ${
                                    hasInvalidK
                                      ? 'border-2 border-red-500 bg-red-500/10 text-red-500'
                                      : 'border border-outline-variant/40 text-rose-500 focus:border-rose-500'
                                  }`}
                                  title="Total kills in this match"
                                />
                              </td>

                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    /* ══════════════════════════════════════════════════════════
                       NORMAL MODE: Ranking Order (Spec B1)
                       Columns in exact order:
                       1. Rank
                       2. Team Name
                       3. Kill Points
                       4. Placement Points
                       5. WWCDs
                       6. Total Points
                       ══════════════════════════════════════════════════════════ */
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
                          <th className="px-5 py-3.5 font-bold">Team Name</th>
                          <th className="px-5 py-3.5 font-bold text-center">Kill Points</th>
                          <th className="px-5 py-3.5 font-bold text-center">Placement Points</th>
                          <th className="px-5 py-3.5 font-bold text-center">WWCDs</th>
                          <th className="px-5 py-3.5 font-black text-right text-on-surface">Total Points</th>
                          {isOrganizer && <th className="px-5 py-3.5 font-bold text-center">Status / Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/10 font-medium">
                        {displayedStandings.map((team, idx) => {
                          const rankNumber = isOverallView ? (team.rank ?? idx + 1) : (team.district_rank ?? team.rank ?? idx + 1);
                          const isSelected = selectedTeamIds.includes(team.team_id);
                          const isDisqualified = team.status === 'disqualified' || team.is_disqualified;
                          const isUnscored = Boolean(team.no_scores_yet || (team.total_points == null && team.matches_played === 0));

                          const killPoints = team.total_kill_points != null
                            ? Number(team.total_kill_points)
                            : (team.total_kills != null ? Number(team.total_kills) * 1 : 0);
                          const placementPoints = team.total_placement_points != null
                            ? Number(team.total_placement_points)
                            : 0;
                          const wwcdCount = team.wwcd_count != null
                            ? Number(team.wwcd_count)
                            : 0;
                          const totalPoints = team.total_points != null
                            ? Number(team.total_points)
                            : (killPoints + placementPoints);

                          return (
                            <tr
                              key={team.team_id || idx}
                              className={`transition-colors ${isSelected ? 'bg-primary/[0.08] border-l-4 border-l-primary' : 'hover:bg-surface-container-high/40'}`}
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

                              {/* 1. Rank */}
                              <td className="px-5 py-3.5 text-center">
                                {isUnscored ? (
                                  <span className="text-on-surface-variant/50 font-bold">-</span>
                                ) : (
                                  <span className="text-on-surface-variant font-bold">#{rankNumber}</span>
                                )}
                              </td>

                              {/* 2. Team Name */}
                              <td className="px-5 py-3.5">
                                <div className="flex items-center gap-2">
                                  <div className={`font-black text-on-surface ${isDisqualified ? 'line-through opacity-60' : ''}`}>
                                    {team.team_name}
                                  </div>
                                  {isDisqualified && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-error/15 text-error border border-error/30">
                                      DQ
                                    </span>
                                  )}
                                  {(team.tie_broken || team.district_tie_broken || (displayedStandings.filter((s) => Number(s.total_points) === Number(team.total_points)).length > 1 && !isUnscored)) && (
                                    <span
                                      className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                      title="Rank resolved by authoritative tie-break rules"
                                    >
                                      Tie-break
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-on-surface-variant mt-0.5 flex items-center gap-2 flex-wrap">
                                  <span>Captain: {team.leader_name || team.captain_name || 'Captain'}</span>
                                  {!isOverallView && selectedDistrictId === 'all' && (
                                    <span className="px-1.5 py-0.2 rounded bg-surface-container-high text-on-surface-variant font-medium">
                                      {team.assigned_group_name || team.district_name || 'District'}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 3. Kill Points */}
                              <td className="px-5 py-3.5 text-center">
                                {isUnscored ? (
                                  <span className="text-on-surface-variant/50">-</span>
                                ) : (
                                  <div className="flex items-center justify-center gap-1 text-rose-500 font-bold">
                                    <Target className="w-3.5 h-3.5" />
                                    <span>{killPoints}</span>
                                  </div>
                                )}
                              </td>

                              {/* 4. Placement Points */}
                              <td className="px-5 py-3.5 text-center font-bold text-on-surface-variant">
                                {isUnscored ? '-' : placementPoints}
                              </td>

                              {/* 5. WWCDs (Integer count, never Yes/No - Spec A4) */}
                              <td className="px-5 py-3.5 text-center">
                                {isUnscored ? (
                                  <span className="text-on-surface-variant/50">-</span>
                                ) : wwcdCount > 0 ? (
                                  <span className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 px-2.5 py-0.5 rounded-full font-bold text-xs inline-flex items-center gap-1">
                                    🏆 {wwcdCount}
                                  </span>
                                ) : (
                                  <span className="text-on-surface-variant/60 font-medium text-xs">0</span>
                                )}
                              </td>

                              {/* 6. Total Points */}
                              <td className="px-5 py-3.5 text-right font-mono font-black text-base text-primary">
                                {isUnscored ? (
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-highest text-on-surface-variant border border-outline-variant/30">
                                    No scores yet
                                  </span>
                                ) : (
                                  totalPoints
                                )}
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
                                          className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 transition-all flex items-center gap-1 cursor-pointer w-auto"
                                        >
                                          <RotateCcw className="w-3 h-3" />
                                          <span>Reinstate</span>
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        {/* Status Pill */}
                                        {team.is_advanced || team.advanced ? (
                                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                            <CheckCircle2 className="w-3 h-3" />
                                            <span>Qualified</span>
                                          </span>
                                        ) : isSelected ? (
                                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                                            Selected
                                          </span>
                                        ) : (
                                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-surface-container-high text-on-surface-variant border border-outline-variant/30">
                                            Active
                                          </span>
                                        )}

                                        {/* Disqualify Button */}
                                        <button
                                          type="button"
                                          onClick={() => setDisqualifyModalTeam(team)}
                                          title="Disqualify team"
                                          className="px-3 py-1 rounded-full text-[11px] font-bold bg-error/10 text-error hover:bg-error/20 border border-error/30 transition-all flex items-center gap-1 cursor-pointer w-auto"
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
                  )}
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

      {/* ── Roadmap-Based Automatic Qualification Modal ── */}
      <RoadmapQualifyModal
        isOpen={roadmapQualifyOpen}
        tournamentId={tournamentId}
        sourceRound={currentSourceRound}
        targetRound={nextTargetRound}
        districts={roundDistricts}
        currentDistrict={currentActiveDistrict}
        standings={standings}
        onClose={() => setRoadmapQualifyOpen(false)}
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
