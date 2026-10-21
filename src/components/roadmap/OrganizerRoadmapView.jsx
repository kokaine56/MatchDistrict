import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save,
  Send,
  Eye,
  EyeOff,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  X,
  Layers,
  Settings,
  Trash2,
  Calendar,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Plus,
  Clock,
  MapPin,
  Lock,
  ArrowRight,
  HelpCircle,
  Trophy,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import RoadmapSetupModal from './RoadmapSetupModal';
import RoadmapDistrictSettingsModal from './RoadmapDistrictSettingsModal';
import RoadmapDatePicker from './RoadmapDatePicker';
import { formatDateWithWeekdayIST } from '../../utils/roadmapDateUtils';
import { formatTime12hIST } from '../../utils/timeFormat';
import { getCompactPlanOverview } from './ParticipantRoadmapView';
import { syncAutoDistrictsForLaterRounds } from '../../utils/roadmapAutoDistricts.js';
import { getPrizePositions } from '../../utils/prizePool.js';
import {
  getRoundDistricts,
  getDefaultDistrictForNewMatch,
  getUnscheduledDistrictsForRound,
  getDistrictDisplayName,
  resolveDistrictDisplayName,
  extractDistrictNumber,
} from '../../utils/roadmapDistricts.js';
import {
  getContinuousDayNumber,
  checkRoundDateOverlaps,
  getNextDefaultDayDate,
  addCalendarDays,
  shiftLaterRoundsToFollow,
  calendarDayDiff,
  getRoundDateBoundaries,
  formatToDDMMYYYY,
} from '../../utils/roadmapDays.js';

const GAME_MAPS = {
  bgmi: ['Erangel', 'Miramar', 'Rondo', 'Sanhok', 'Vikendi', 'Livik'],
  freefire: ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NexTerra'],
  codm: ['Crash', 'Standoff', 'Raid', 'Crossfire', 'Summit'],
  valorant: ['Ascent', 'Haven', 'Bind', 'Split', 'Sunset'],
};

export default function OrganizerRoadmapView({
  tournamentId,
  tournamentTitle = 'Tournament Roadmap',
  rounds = [],
  meta = {},
  districts = [],
  minSelectableDate = '',
  game = 'bgmi',
  cardColor = 'white',
  isPublished = false,
  onSaveDraft,
  onPublish,
  onUnpublish,
  onGenerate,
  saving = false,
  publishing = false,
  generating = false,
  onClose,
  previewMode = false,
  onTogglePreview,
  onDeleteRoadmap,
  deleting = false,
}) {
  const theme = getRoadmapTheme(cardColor);

  const storageKey = tournamentId
    ? `matchdistrict_roadmap_draft_${tournamentId}`
    : 'matchdistrict_roadmap_draft_default';

  // Local working copy of rounds
  const [workingRounds, setWorkingRounds] = useState(rounds || []);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingStoredDraft, setPendingStoredDraft] = useState(null);

  // Snapshot for failure rollback on delete
  const deletedSnapshotRef = useRef(null);

  // Modals state
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showUnpublishModal, setShowUnpublishModal] = useState(false);
  const [editingDistrictAlloc, setEditingDistrictAlloc] = useState(null); // for per-match overrides
  const [roundToDeleteIdx, setRoundToDeleteIdx] = useState(null);
  const [showAdvancedRounds, setShowAdvancedRounds] = useState(false);

  // Validation feedback
  const [serverValidation, setServerValidation] = useState({ errors: [], warnings: [] });
  const [serverErrorBanner, setServerErrorBanner] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  const teamsPerGroup = Number(meta.teams_per_group || meta.teams_per_district || 16);
  const slotsTotal = Number(meta.total_slots || meta.slotsTotal || (rounds[0]?.teams_in) || 64);
  const registeredCount = Number(meta.total_teams ?? meta.registeredCount ?? meta.registered_teams ?? 0);
  const configuredPrizePositions = useMemo(() => getPrizePositions(meta), [meta]);

  const isInitializedRef = useRef(false);
  const currentTourneyIdRef = useRef(tournamentId);



  // Sync draft to sessionStorage
  const persistToSession = (newRounds) => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          rounds: newRounds,
          timestamp: Date.now(),
          tournamentId,
        })
      );
    } catch (e) {
      console.warn('SessionStorage persist failed:', e);
    }
  };

  const clearSessionDraft = () => {
    if (!storageKey) return;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {}
    setPendingStoredDraft(null);
  };

  // Reset when tournamentId changes
  useEffect(() => {
    if (currentTourneyIdRef.current !== tournamentId) {
      currentTourneyIdRef.current = tournamentId;
      isInitializedRef.current = false;
      setHasUnsavedChanges(false);
      setSelectedRoundIdx(0);
      setPendingStoredDraft(null);
    }
  }, [tournamentId]);

  // Check sessionStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.rounds) && parsed.rounds.length > 0) {
          const currentStr = JSON.stringify(rounds || []);
          const storedStr = JSON.stringify(parsed.rounds);
          if (currentStr !== storedStr) {
            setPendingStoredDraft(parsed);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to parse sessionStorage draft:', e);
    }
  }, [storageKey, rounds]);

  // Initialize or update rounds from prop
  useEffect(() => {
    if (Array.isArray(rounds) && rounds.length === 0) {
      if (!isInitializedRef.current) {
        setWorkingRounds([]);
        isInitializedRef.current = true;
      }
      return;
    }
    if (Array.isArray(rounds) && rounds.length > 0) {
      if (!isInitializedRef.current || !hasUnsavedChanges) {
        const copy = JSON.parse(JSON.stringify(rounds));
        const syncRes = syncAutoDistrictsForLaterRounds(
          { rounds: copy },
          { teams_per_group: teamsPerGroup, slotsTotal }
        );
        setWorkingRounds(copy);
        isInitializedRef.current = true;
        if (syncRes?.warnings?.length > 0) {
          setServerValidation((prev) => ({
            ...prev,
            warnings: [...new Set([...prev.warnings, ...syncRes.warnings])],
          }));
        }
      }
    }
  }, [rounds, teamsPerGroup, slotsTotal, hasUnsavedChanges]);

  const handleUpdateRounds = (newRounds) => {
    const copy = JSON.parse(JSON.stringify(newRounds));
    syncAutoDistrictsForLaterRounds(
      { rounds: copy },
      { teams_per_group: teamsPerGroup, slotsTotal, forceAutoTeamsIn: true }
    );
    setWorkingRounds(copy);
    setHasUnsavedChanges(true);
    persistToSession(copy);
  };

  const handleUpdateCurrentRound = (key, value) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    if (!copy[selectedRoundIdx]) return;
    copy[selectedRoundIdx][key] = value;

    // If changing to grand_final, adjust defaults
    if (key === 'round_type' && value === 'grand_final') {
      copy[selectedRoundIdx].name = 'Grand Final';
      copy[selectedRoundIdx].advancement_type = null;
      copy[selectedRoundIdx].teams_advancing = null;
      copy[selectedRoundIdx].teams_advancing_per_district = null;
    } else if (key === 'round_type' && value === 'qualifier') {
      copy[selectedRoundIdx].name = `Round ${copy[selectedRoundIdx].round_number || selectedRoundIdx + 1}`;
      copy[selectedRoundIdx].advancement_type = 'per_district';
      copy[selectedRoundIdx].teams_advancing_per_district = 2;
    }

    handleUpdateRounds(copy);
  };

  // Add round
  const handleAddRound = () => {
    const nextNum = workingRounds.length + 1;
    const sanitizedPrev = workingRounds.map((r) => {
      if (r.round_type === 'grand_final') {
        return {
          ...r,
          round_type: 'qualifier',
          advancement_type: r.advancement_type || 'per_district',
          teams_advancing_per_district: r.teams_advancing_per_district || 2,
          teams_advancing: r.teams_advancing || 16,
        };
      }
      return r;
    });

    const nextStartDate = getNextDefaultDayDate(sanitizedPrev, sanitizedPrev.length, minSelectableDate || '');
    const newRound = {
      id: `RND-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      round_number: nextNum,
      name: `Round ${nextNum}`,
      round_type: 'qualifier',
      teams_in: 16,
      advancement_type: 'per_district',
      teams_advancing_per_district: 2,
      teams_advancing: 16,
      days: [
        {
          id: `DAY-${Date.now()}`,
          date: nextStartDate,
          allocations: [],
        },
      ],
    };

    const updated = [...sanitizedPrev, newRound];
    handleUpdateRounds(updated);
    setSelectedRoundIdx(updated.length - 1);
  };

  // Delete round
  const handleConfirmDeleteRound = () => {
    if (roundToDeleteIdx == null || workingRounds.length <= 1) return;
    const updated = workingRounds
      .filter((_, i) => i !== roundToDeleteIdx)
      .map((r, i, arr) => {
        if (r.round_type === 'grand_final' && i !== arr.length - 1) {
          return {
            ...r,
            round_number: i + 1,
            round_type: 'qualifier',
            advancement_type: r.advancement_type || 'per_district',
            teams_advancing_per_district: 2,
          };
        }
        return { ...r, round_number: i + 1 };
      });
    handleUpdateRounds(updated);
    setSelectedRoundIdx(Math.max(0, roundToDeleteIdx - 1));
    setRoundToDeleteIdx(null);
  };

  // Move round earlier / later
  const handleMoveRound = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= workingRounds.length) return;
    const copy = [...workingRounds];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    copy.forEach((r, i) => {
      r.round_number = i + 1;
    });
    handleUpdateRounds(copy);
    setSelectedRoundIdx(targetIdx);
  };

  // Days management for active round
  const currentRound = workingRounds[selectedRoundIdx] || workingRounds[0] || null;

  const currentRoundDistricts = useMemo(() => {
    if (!currentRound) return [];
    return getRoundDistricts(currentRound, selectedRoundIdx, districts, {
      teams_per_group: teamsPerGroup,
      slotsTotal,
      totalRounds: workingRounds.length,
    });
  }, [currentRound, selectedRoundIdx, districts, teamsPerGroup, slotsTotal, workingRounds.length]);

  const unscheduledDistricts = useMemo(() => {
    if (!currentRound || currentRoundDistricts.length === 0) return [];
    return getUnscheduledDistrictsForRound(currentRoundDistricts, currentRound.days);
  }, [currentRound, currentRoundDistricts]);

  const handleUpdateDayDate = (dayIdx, newDate) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    if (!copy[selectedRoundIdx]?.days?.[dayIdx]) return;
    copy[selectedRoundIdx].days[dayIdx].date = newDate;
    handleUpdateRounds(copy);
  };

  const handleAddDay = () => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const r = copy[selectedRoundIdx];
    if (!r) return;
    if (!Array.isArray(r.days)) r.days = [];
    const nextDate = getNextDefaultDayDate(copy, selectedRoundIdx, minSelectableDate || '');

    r.days.push({
      id: `DAY-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      date: nextDate,
      allocations: [],
    });

    // Task 2: If adding a day in an earlier round collides with or reaches the next round's dates,
    // shift all later rounds forward by the needed days, keeping their gaps.
    if (selectedRoundIdx < copy.length - 1) {
      const nextRound = copy[selectedRoundIdx + 1];
      const nextBoundaries = getRoundDateBoundaries(nextRound);
      if (nextBoundaries.startDate && nextBoundaries.startDate <= nextDate) {
        const targetNextStart = addCalendarDays(nextDate, 1);
        const shiftDays = calendarDayDiff(nextBoundaries.startDate, targetNextStart);
        if (shiftDays > 0) {
          for (let laterIdx = selectedRoundIdx + 1; laterIdx < copy.length; laterIdx++) {
            const laterR = copy[laterIdx];
            if (laterR.is_locked) continue;
            for (const d of (laterR.days || [])) {
              if (d.date && !d.is_locked && !d.has_results) {
                d.date = addCalendarDays(d.date, shiftDays);
              }
            }
          }
        }
      }
    }

    handleUpdateRounds(copy);
  };

  const handleShiftLaterRounds = (roundIndex) => {
    const updated = shiftLaterRoundsToFollow(workingRounds, roundIndex);
    handleUpdateRounds(updated);
  };

  const handleRemoveDay = (dayIdx) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const r = copy[selectedRoundIdx];
    if (!r || !r.days || r.days.length <= 1) return;
    r.days = r.days.filter((_, i) => i !== dayIdx);
    handleUpdateRounds(copy);
  };

  const handleUpdateDistrictField = (dayIdx, allocIdx, field, value) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const alloc = copy[selectedRoundIdx]?.days?.[dayIdx]?.allocations?.[allocIdx];
    if (!alloc) return;

    if (field === 'start_time') {
      if (alloc.matches && alloc.matches.length > 0) {
        alloc.matches[0].start_time = value;
      }
    } else if (field === 'map') {
      if (alloc.matches && alloc.matches.length > 0) {
        alloc.matches[0].map = value;
      }
    }
    handleUpdateRounds(copy);
  };

  const handleUpdateMatchField = (dayIdx, allocIdx, matchIdx, field, value) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const alloc = copy[selectedRoundIdx]?.days?.[dayIdx]?.allocations?.[allocIdx];
    if (!alloc || !alloc.matches || !alloc.matches[matchIdx]) return;
    alloc.matches[matchIdx][field] = value;
    handleUpdateRounds(copy);
  };

  // Add match to a day with smart district pre-selection (Task 3)
  const handleAddMatchToDay = (dayIdx, targetDistId = null) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const r = copy[selectedRoundIdx];
    const day = r?.days?.[dayIdx];
    if (!day) return;
    if (!Array.isArray(day.allocations)) day.allocations = [];

    const roundDistricts = getRoundDistricts(r, selectedRoundIdx, districts, {
      teams_per_group: teamsPerGroup,
      slotsTotal,
      totalRounds: copy.length,
    });

    let targetDist = null;
    if (targetDistId) {
      targetDist = roundDistricts.find((d) => d.id === targetDistId);
    }
    if (!targetDist) {
      targetDist = getDefaultDistrictForNewMatch(roundDistricts, r.days) || roundDistricts[0];
    }
    if (!targetDist) return;

    let targetAlloc = day.allocations.find(
      (a) => (a.district_id || a.id) === targetDist.id
    );
    if (!targetAlloc) {
      targetAlloc = {
        id: `ALC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        district_id: targetDist.id,
        district_name: targetDist.name,
        name: targetDist.name,
        match_count: 0,
        matches: [],
      };
      day.allocations.push(targetAlloc);
    }

    if (!Array.isArray(targetAlloc.matches)) targetAlloc.matches = [];
    if (targetAlloc.matches.length >= 12) return;

    const existingMatchesOnDay = day.allocations.flatMap((a) => a.matches || []);
    const lastMatch = existingMatchesOnDay[existingMatchesOnDay.length - 1] || {
      start_time: '13:00',
      map: availableMaps[0] || 'Erangel',
    };

    const lastMapIdx = availableMaps.indexOf(lastMatch.map);
    const nextMap = availableMaps[(lastMapIdx + 1) % availableMaps.length] || availableMaps[0] || 'Erangel';

    let nextTime = '14:00';
    if (lastMatch.start_time) {
      const parts = lastMatch.start_time.split(':').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const totalMins = parts[0] * 60 + parts[1] + 45;
        const nextH = Math.floor(totalMins / 60) % 24;
        const nextM = totalMins % 60;
        nextTime = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
      }
    }

    const nextNum = targetAlloc.matches.length + 1;
    const newMatchId = `MTC-${Date.now()}-${nextNum}`;
    targetAlloc.matches.push({
      id: newMatchId,
      district_id: targetDist.id,
      district_name: targetDist.name,
      district_match_number: nextNum,
      start_time: nextTime,
      map: nextMap,
    });
    targetAlloc.match_count = targetAlloc.matches.length;

    handleUpdateRounds(copy);

    setTimeout(() => {
      const el = document.getElementById(`match-row-${newMatchId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const select = el.querySelector('select');
        if (select) select.focus();
      }
    }, 60);
  };

  // Change a match's district (Task 2)
  const handleChangeMatchDistrict = (dayIdx, allocIdx, matchIdx, newDistrictId) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const r = copy[selectedRoundIdx];
    const day = r?.days?.[dayIdx];
    const alloc = day?.allocations?.[allocIdx];
    if (!alloc || !alloc.matches || !alloc.matches[matchIdx]) return;

    const currentMatch = alloc.matches[matchIdx];
    const currentDistId = currentMatch.district_id || alloc.district_id || alloc.id;
    if (currentDistId === newDistrictId) return;

    const roundDistricts = getRoundDistricts(r, selectedRoundIdx, districts, {
      teams_per_group: teamsPerGroup,
      slotsTotal,
      totalRounds: copy.length,
    });
    const targetDist = roundDistricts.find((d) => d.id === newDistrictId) || {
      id: newDistrictId,
      name: `District ${newDistrictId}`,
    };

    alloc.matches.splice(matchIdx, 1);
    alloc.match_count = alloc.matches.length;
    if (alloc.matches.length === 0) {
      day.allocations.splice(allocIdx, 1);
    } else {
      alloc.matches.forEach((m, idx) => {
        m.district_match_number = idx + 1;
      });
    }

    currentMatch.district_id = targetDist.id;
    currentMatch.district_name = targetDist.name;

    let targetAlloc = day.allocations.find(
      (a) => (a.district_id || a.id) === targetDist.id
    );
    if (!targetAlloc) {
      targetAlloc = {
        id: `ALC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        district_id: targetDist.id,
        district_name: targetDist.name,
        name: targetDist.name,
        match_count: 0,
        matches: [],
      };
      day.allocations.push(targetAlloc);
    }

    if (!Array.isArray(targetAlloc.matches)) targetAlloc.matches = [];
    targetAlloc.matches.push(currentMatch);
    targetAlloc.match_count = targetAlloc.matches.length;
    targetAlloc.matches.forEach((m, idx) => {
      m.district_match_number = idx + 1;
    });

    handleUpdateRounds(copy);
  };

  // Move a match to another day (Task 4)
  const handleMoveMatchToDay = (fromDayIdx, allocIdx, matchIdx, toDayIdx) => {
    if (fromDayIdx === toDayIdx) return;
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const r = copy[selectedRoundIdx];
    const fromDay = r?.days?.[fromDayIdx];
    const toDay = r?.days?.[toDayIdx];
    const alloc = fromDay?.allocations?.[allocIdx];
    if (!alloc || !alloc.matches || !alloc.matches[matchIdx] || !toDay) return;

    const currentMatch = alloc.matches[matchIdx];
    const distId = currentMatch.district_id || alloc.district_id || alloc.id;
    const distName = currentMatch.district_name || alloc.district_name || alloc.name;

    alloc.matches.splice(matchIdx, 1);
    alloc.match_count = alloc.matches.length;
    if (alloc.matches.length === 0) {
      fromDay.allocations.splice(allocIdx, 1);
    } else {
      alloc.matches.forEach((m, idx) => {
        m.district_match_number = idx + 1;
      });
    }

    if (!Array.isArray(toDay.allocations)) toDay.allocations = [];
    let targetAlloc = toDay.allocations.find(
      (a) => (a.district_id || a.id) === distId
    );
    if (!targetAlloc) {
      targetAlloc = {
        id: `ALC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        district_id: distId,
        district_name: distName,
        name: distName,
        match_count: 0,
        matches: [],
      };
      toDay.allocations.push(targetAlloc);
    }

    if (!Array.isArray(targetAlloc.matches)) targetAlloc.matches = [];
    targetAlloc.matches.push(currentMatch);
    targetAlloc.match_count = targetAlloc.matches.length;
    targetAlloc.matches.forEach((m, idx) => {
      m.district_match_number = idx + 1;
    });

    handleUpdateRounds(copy);
  };

  const handleRemoveMatch = (dayIdx, allocIdx, matchIdx) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const day = copy[selectedRoundIdx]?.days?.[dayIdx];
    const alloc = day?.allocations?.[allocIdx];
    if (!alloc || !alloc.matches || !alloc.matches[matchIdx]) return;

    alloc.matches.splice(matchIdx, 1);
    alloc.match_count = alloc.matches.length;
    if (alloc.matches.length === 0) {
      day.allocations.splice(allocIdx, 1);
    } else {
      alloc.matches.forEach((m, idx) => {
        m.district_match_number = idx + 1;
      });
    }
    handleUpdateRounds(copy);
  };

  // Instant optimistic roadmap delete with rollback on failure
  const handleTriggerDelete = async () => {
    setShowDeleteModal(false);
    setShowSetupModal(false);
    const snapshot = JSON.parse(JSON.stringify(workingRounds));
    deletedSnapshotRef.current = snapshot;

    // Immediately clear working state and session draft
    setWorkingRounds([]);
    clearSessionDraft();
    setServerErrorBanner(null);

    try {
      const res = await onDeleteRoadmap?.();
      if (res && res.success === false) {
        // Rollback UI and session draft on failure
        setWorkingRounds(snapshot);
        persistToSession(snapshot);
        setServerErrorBanner(res.error || 'Failed to delete roadmap on server.');
        onDeleteRoadmap?.({ restore: true, snapshot });
      }
    } catch (err) {
      // Rollback UI and session draft on failure
      setWorkingRounds(snapshot);
      persistToSession(snapshot);
      setServerErrorBanner(err.message || 'Failed to delete roadmap on server.');
      onDeleteRoadmap?.({ restore: true, snapshot });
    } finally {
      deletedSnapshotRef.current = null;
    }
  };

  const handleCreateManually = () => {
    const initialRound = {
      id: `RND-${Date.now()}-1`,
      round_number: 1,
      name: 'Round 1',
      round_type: 'qualifier',
      teams_in: slotsTotal || 16,
      advancement_type: 'per_district',
      teams_advancing_per_district: 2,
      teams_advancing: 16,
      days: [
        {
          id: `DAY-${Date.now()}-1`,
          day_number: 1,
          date: minSelectableDate || '',
          allocations: (districts && districts.length > 0 ? districts.slice(0, 1) : []).map((d, i) => ({
            id: `ALC-${Date.now()}-${i + 1}`,
            district_id: d.id || `dist-${i + 1}`,
            district_name: d.name || `District ${i + 1}`,
            match_count: 2,
            matches: [
              { id: `MTC-${Date.now()}-1`, district_match_number: 1, start_time: '13:00', map: availableMaps[0] || 'Erangel' },
              { id: `MTC-${Date.now()}-2`, district_match_number: 2, start_time: '14:00', map: availableMaps[1] || 'Miramar' },
            ],
          })),
        },
      ],
    };
    handleUpdateRounds([initialRound]);
    setSelectedRoundIdx(0);
  };

  // Save Draft
  const handleSaveDraft = async () => {
    setServerValidation({ errors: [], warnings: [] });
    setServerErrorBanner(null);
    try {
      const res = await onSaveDraft({ rounds: workingRounds });
      if (res && res.success) {
        setHasUnsavedChanges(false);
        clearSessionDraft();
        setSuccessBanner('Draft saved successfully.');
        setTimeout(() => setSuccessBanner(null), 4000);
      } else if (res && res.errors?.length > 0) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      } else {
        const rawErr = res?.serverError || res?.error || res?.message;
        const isSql = /column|relation|syntax|SELECT|INSERT|UPDATE|pg_|Postgres|database error|42\d{3}|23\d{3}/i.test(String(rawErr || ''));
        const cleanErr = isSql || !rawErr ? 'Could not save roadmap: server error' : rawErr;
        setServerErrorBanner(cleanErr);
      }
    } catch (e) {
      setServerErrorBanner('Could not save roadmap: server error');
    }
  };

  // Publish
  const handlePublish = async () => {
    setServerValidation({ errors: [], warnings: [] });
    setServerErrorBanner(null);

    // Task 4: Block publishing if any round's first date is not after previous round's last date
    if (roundDateWarnings.length > 0) {
      setServerValidation({
        errors: roundDateWarnings.map(
          (w) => `${w.message}. Each round must take place on dates strictly after the previous round concludes.`
        ),
        warnings: [],
      });
      return;
    }

    try {
      const res = await onPublish({ rounds: workingRounds });
      if (res && res.success) {
        setHasUnsavedChanges(false);
        clearSessionDraft();
        setSuccessBanner('Roadmap published successfully! Participants can now view the match schedule.');
        setTimeout(() => setSuccessBanner(null), 5000);
      } else if (res && res.errors?.length > 0) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      } else {
        const rawErr = res?.serverError || res?.error || res?.message;
        const isSql = /column|relation|syntax|SELECT|INSERT|UPDATE|pg_|Postgres|database error|42\d{3}|23\d{3}/i.test(String(rawErr || ''));
        const cleanErr = isSql || !rawErr ? 'Could not publish roadmap: server error' : rawErr;
        setServerErrorBanner(cleanErr);
        setServerValidation((prev) => ({
          ...prev,
          errors: [cleanErr],
        }));
      }
    } catch (e) {
      setServerErrorBanner('Could not publish roadmap: server error');
      setServerValidation((prev) => ({
        ...prev,
        errors: ['Could not publish roadmap: server error'],
      }));
    }
  };

  // Metrics for Review section
  const totalRoundsCount = workingRounds.length;
  const totalMatchDaysCount = workingRounds.reduce((acc, r) => acc + (r.days || []).length, 0);
  const totalMatchesCount = workingRounds.reduce(
    (acc, r) =>
      acc +
      (r.days || []).reduce(
        (dAcc, d) =>
          dAcc +
          (d.allocations || []).reduce(
            (mAcc, a) => mAcc + (Number(a.match_count) || (a.matches ? a.matches.length : 0)),
            0
          ),
        0
      ),
    0
  );

  const grandFinalsRound = workingRounds.find((r) => r.round_type === 'grand_final');
  const gfDaysCount = grandFinalsRound ? (grandFinalsRound.days || []).length : 0;
  const gfMatchesCount = grandFinalsRound
    ? (grandFinalsRound.days || []).reduce(
        (acc, d) =>
          acc +
          (d.allocations || []).reduce(
            (mAcc, a) => mAcc + (Number(a.match_count) || (a.matches ? a.matches.length : 0)),
            0
          ),
        0
      )
    : 0;

  const availableMaps = GAME_MAPS[(game || 'bgmi').toLowerCase()] || GAME_MAPS.bgmi;
  const planLine = useMemo(() => getCompactPlanOverview(workingRounds, slotsTotal), [workingRounds, slotsTotal]);
  const roundDateWarnings = useMemo(() => checkRoundDateOverlaps(workingRounds), [workingRounds]);

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 pb-28 px-2 sm:px-0">
      {/* Global Server Error Banner (Task 5) */}
      {serverErrorBanner && (
        <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="font-bold">{serverErrorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setServerErrorBanner(null)}
            className="text-xs text-rose-600 dark:text-rose-400 font-bold hover:underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Global Success Banner */}
      {successBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-bold">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-xs text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* SECTION 1: SETUP FORMULA */}
      <div className={`p-4 rounded-xl ${theme.cardBg} space-y-3`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Step 1
            </span>
            <h2 className={`text-sm sm:text-base font-bold ${theme.headingText} flex items-center gap-1.5`}>
              <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Tournament Setup Formula
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${theme.secondaryBtn} flex items-center gap-1`}
          >
            <span>Configure Formula</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Slots</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{slotsTotal} teams</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Lobby Capacity</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{teamsPerGroup} per district</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Grand Final</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{teamsPerGroup} finalists</span>
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Registrations</span>
            <span className="font-bold text-slate-900 dark:text-slate-100">{registeredCount} so far</span>
          </div>
        </div>

        {planLine && (
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/20 border border-slate-200/50 dark:border-slate-800/60 text-xs flex items-center gap-2">
            <span className="font-bold text-slate-500">Progression:</span>
            <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{planLine}</span>
          </div>
        )}
      </div>

      {/* EMPTY STATE WHEN NO ROUNDS EXIST */}
      {workingRounds.length === 0 ? (
        <div className={`p-8 rounded-2xl ${theme.cardBg} border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-4 my-4`}>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex items-center justify-center mx-auto text-xl">
            <Calendar className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              No Tournament Roadmap Configured
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Get started by generating an automated roadmap based on registered teams and lobby capacities, or configure your custom stages manually.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleCreateManually}
              className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold ${theme.secondaryBtn} flex items-center justify-center gap-1.5 cursor-pointer`}
            >
              <Plus className="w-4 h-4" />
              <span>Create manually</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className={`w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold ${theme.primaryBtn} flex items-center justify-center gap-1.5 cursor-pointer`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Auto-generate</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* SECTION 2: ROUNDS & ADVANCEMENT */}
          <div className={`p-4 rounded-xl ${theme.cardBg} space-y-3`}>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                  Step 2
                </span>
                <h2 className={`text-sm sm:text-base font-bold ${theme.headingText} flex items-center gap-1.5`}>
                  <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  Tournament Rounds & Advancement
                </h2>
              </div>
              <span className="text-xs text-slate-400">
                {workingRounds.length} {workingRounds.length === 1 ? 'round' : 'rounds'}
              </span>
            </div>

            {/* Collapsible Rounds (One open at a time) */}
            <div className="space-y-2">
              {workingRounds.map((round, rIdx) => {
                const isSelected = rIdx === selectedRoundIdx;
                const isGF = round.round_type === 'grand_final';

                return (
                  <div
                    key={round.id || rIdx}
                    className={`rounded-xl border transition-all ${
                      isSelected
                        ? 'border-blue-400 dark:border-blue-600 bg-slate-50/30 dark:bg-slate-800/20 shadow-2xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                    }`}
                  >
                    {/* One-line summary when closed / header */}
                    <button
                      type="button"
                      onClick={() => setSelectedRoundIdx(rIdx)}
                      className="w-full p-3 flex items-center justify-between gap-2 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center shrink-0">
                          {rIdx + 1}
                        </span>
                        <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                          {round.name || `Round ${rIdx + 1}`}
                        </span>
                        <span className={`text-[10px] font-semibold uppercase px-2 py-0.2 rounded-full ${isGF ? theme.badgeWarning : theme.badgeNeutral}`}>
                          {isGF ? 'Grand Final' : 'Qualifiers'}
                        </span>
                        {(() => {
                          const w = roundDateWarnings.find((warn) => warn.roundIndex === rIdx);
                          if (!w) return null;
                          return (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1 shrink-0">
                              <AlertTriangle className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                              <span>Date overlap</span>
                            </span>
                          );
                        })()}
                        {!isSelected && (
                          <span className="text-xs text-slate-400 hidden sm:inline truncate">
                            · {round.teams_in || 16} teams in
                            {isGF ? ' · Finals' : ` · Top ${round.teams_advancing_per_district || 2}/district`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isSelected ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </button>

                    {/* Open Essential Round Fields */}
                    {isSelected && (
                      <div className="p-3 pt-0 border-t border-slate-100 dark:border-slate-800 space-y-3">
                        {/* Visible Round Date Overlap Warning with Shift Button (Task 3 & 5) */}
                        {(() => {
                          const roundWarn = roundDateWarnings.find((w) => w.roundIndex === rIdx);
                          if (!roundWarn) return null;
                          return (
                            <div className="mt-3 p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-amber-900 dark:text-amber-200">
                              <div className="flex items-start gap-2 min-w-0">
                                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="font-bold block sm:inline">{roundWarn.message}</span>
                                  <span className="block text-[11px] text-amber-700 dark:text-amber-400">
                                    Each round must take place on dates strictly after the previous round concludes.
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleShiftLaterRounds(rIdx)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
                              >
                                Shift later rounds to follow
                              </button>
                            </div>
                          );
                        })()}

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs">
                          {/* Name */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Round Name
                            </label>
                            <input
                              type="text"
                              value={round.name || ''}
                              onChange={(e) => handleUpdateCurrentRound('name', e.target.value)}
                              className={`w-full px-3 py-2 text-xs font-bold ${theme.inputBg}`}
                            />
                          </div>

                          {/* Stage Type */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Stage Type
                            </label>
                            <select
                              value={round.round_type === 'grand_final' ? 'grand_final' : 'qualifier'}
                              onChange={(e) => handleUpdateCurrentRound('round_type', e.target.value)}
                              className={`w-full px-3 py-2 text-xs font-semibold ${theme.inputBg}`}
                            >
                              <option value="qualifier">Qualifiers</option>
                              <option
                                value="grand_final"
                                disabled={rIdx !== workingRounds.length - 1}
                              >
                                Grand Finals {rIdx !== workingRounds.length - 1 ? '(Last round only)' : ''}
                              </option>
                            </select>
                          </div>

                          {/* Planned Incoming Teams (Read-only) */}
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                              Incoming Teams (Read-only)
                            </label>
                            <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-between border border-slate-200/60 dark:border-slate-700">
                              <span>{rIdx === 0 ? slotsTotal : (round.teams_in || 16)} teams</span>
                              <Lock className="w-3 h-3 text-slate-400" />
                            </div>
                          </div>
                        </div>

                        {/* Note on regrouped lobbies for later rounds */}
                        {rIdx > 0 && (
                          <div className="p-2.5 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800 text-xs flex items-center justify-between text-blue-900 dark:text-blue-200 font-medium">
                            <span>ℹ {round.lobbies_note || `${round.teams_in || 16} teams partitioned into regrouped lobbies`}</span>
                          </div>
                        )}

                        {/* Grand Finals Prize Distribution vs Qualifier Advancement Rule */}
                        {isGF ? (
                          <div className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-2 text-xs">
                            <div className="flex items-center gap-2">
                              <Trophy className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                              <div>
                                <span className="font-bold text-amber-950 dark:text-amber-100 block">
                                  Championship Stage (Grand Finals)
                                </span>
                                <span className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                                  Final standings determine tournament champion and prize pool distribution. No advancement rule is needed.
                                </span>
                              </div>
                            </div>

                            {configuredPrizePositions.length > 0 && (
                              <div className="pt-2 border-t border-amber-200/60 dark:border-amber-800/60">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 block mb-1.5">
                                  Tournament Prize Distribution:
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {configuredPrizePositions.map((p) => (
                                    <div
                                      key={p.rank}
                                      className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-900 text-center"
                                    >
                                      <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200 block truncate">
                                        {p.name}
                                      </span>
                                      <span className="font-black text-xs text-slate-900 dark:text-slate-100 block">
                                        {p.percentage != null ? `${p.percentage}%` : ''}
                                        {p.prize_amount != null ? ` (${p.prize_amount.toLocaleString()})` : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Qualification Rule Box (Qualifiers only) */
                          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-2 text-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <span className="font-bold text-slate-700 dark:text-slate-200">
                                Advancement Rule:
                              </span>
                              <div className="flex items-center gap-2">
                                <select
                                  value={round.advancement_type || 'per_district'}
                                  onChange={(e) => handleUpdateCurrentRound('advancement_type', e.target.value)}
                                  className={`px-2.5 py-1 text-xs font-semibold ${theme.inputBg}`}
                                >
                                  <option value="per_district">Top teams per district</option>
                                  <option value="overall">Top teams overall</option>
                                </select>

                                <input
                                  type="number"
                                  min="1"
                                  max="32"
                                  value={
                                    round.advancement_type === 'overall'
                                      ? round.teams_advancing || 16
                                      : round.teams_advancing_per_district || 2
                                  }
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10) || 1;
                                    if (round.advancement_type === 'overall') {
                                      handleUpdateCurrentRound('teams_advancing', val);
                                    } else {
                                      handleUpdateCurrentRound('teams_advancing_per_district', val);
                                    }
                                  }}
                                  className={`w-16 px-2 py-1 text-xs font-bold text-center ${theme.inputBg}`}
                                />
                                <span className="text-slate-500 font-medium">teams</span>
                              </div>
                            </div>
                          </div>
                        )}

                    {/* Advanced Settings Toggle */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedRounds(!showAdvancedRounds)}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{showAdvancedRounds ? '▼ Hide Advanced' : '► Advanced Settings'}</span>
                      </button>

                      {showAdvancedRounds && (
                        <div className="mt-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={rIdx === 0}
                              onClick={() => handleMoveRound(rIdx, -1)}
                              className="px-2.5 py-1 rounded text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                            >
                              Earlier
                            </button>
                            <button
                              type="button"
                              disabled={rIdx === workingRounds.length - 1}
                              onClick={() => handleMoveRound(rIdx, 1)}
                              className="px-2.5 py-1 rounded text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 disabled:opacity-30 cursor-pointer"
                            >
                              Later
                            </button>
                          </div>

                          {workingRounds.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setRoundToDeleteIdx(rIdx)}
                              className="px-2.5 py-1 rounded text-xs font-bold text-rose-600 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 cursor-pointer"
                            >
                              Delete Round
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddRound}
          className={`w-full py-2 rounded-xl text-xs font-bold ${theme.secondaryBtn} flex items-center justify-center gap-1.5`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Round</span>
        </button>
      </div>

      {/* SECTION 3: DAYS AND MATCHES */}
      {currentRound && (
        <div className={`p-4 rounded-xl ${theme.cardBg} space-y-3`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                Step 3
              </span>
              <h2 className={`text-sm sm:text-base font-bold ${theme.headingText} flex items-center gap-1.5`}>
                <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Days & Matches — {currentRound.name || `Round ${currentRound.round_number}`}
              </h2>
            </div>
            <button
              type="button"
              onClick={handleAddDay}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${theme.secondaryBtn} flex items-center gap-1 self-start sm:self-auto`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Day</span>
            </button>
          </div>

          {/* Schedule Date Overlap Warning Banner (Task 3 & 5) */}
          {roundDateWarnings.length > 0 && (
            <div className="space-y-2">
              {roundDateWarnings.map((w, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="font-bold block sm:inline">{w.message}</span>
                      <span className="block text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                        Each round must take place on dates strictly after the previous round concludes.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleShiftLaterRounds(w.roundIndex)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
                  >
                    Shift later rounds to follow
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Districts Not Scheduled Yet Indicator */}
          {unscheduledDistricts.length > 0 ? (
            <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs min-w-0">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 break-words flex-1">
                  <span className="font-bold text-amber-900 dark:text-amber-200">
                    Districts not scheduled yet ({unscheduledDistricts.length}):
                  </span>{' '}
                  <span className="text-amber-800 dark:text-amber-300 font-medium break-words">
                    {unscheduledDistricts.map((d) => d.name).join(', ')}
                  </span>
                </div>
              </div>
              <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium sm:text-right shrink-0">
                Every district must have at least 1 match before publish
              </span>
            </div>
          ) : (
            <div className="px-3 py-2 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="font-semibold">All {currentRoundDistricts.length} districts in this round have matches scheduled.</span>
            </div>
          )}

          {/* Days List */}
          <div className="space-y-3">
            {(!currentRound.days || currentRound.days.length === 0) ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No match days added yet. Click &quot;Add Day&quot; to begin.
              </div>
            ) : (
              currentRound.days.map((day, dIdx) => {
                const dayAllocs = day.allocations || [];
                const totalDayMatches = dayAllocs.reduce((acc, a) => acc + (a.matches?.length || 0), 0);
                const continuousDayNum = getContinuousDayNumber(workingRounds, selectedRoundIdx, dIdx);

                return (
                  <div
                    key={day.id || dIdx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 space-y-3"
                  >
                    {/* Day Header Row: DAY 1 · Wed, 21/10/2026 · 2 matches on left, compact ~160px date input + delete-day on right */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/50 dark:border-slate-800">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          DAY {continuousDayNum}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                          {day.date ? formatDateWithWeekdayIST(day.date) : 'No date set'}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">·</span>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {totalDayMatches} {totalDayMatches === 1 ? 'match' : 'matches'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
                        <RoadmapDatePicker
                          value={day.date || ''}
                          min={minSelectableDate}
                          onChange={(newDate) => handleUpdateDayDate(dIdx, newDate)}
                          wrapperClassName="w-[160px]"
                          className="text-xs py-1"
                        />

                        {currentRound.days.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDay(dIdx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="Remove Day"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* District Rows */}
                    {dayAllocs.length === 0 ? (
                      <div className="py-6 px-4 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          No matches scheduled on Day {continuousDayNum}.
                        </p>
                        <button
                          type="button"
                          onClick={() => handleAddMatchToDay(dIdx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${theme.primaryBtn} inline-flex items-center gap-1.5 cursor-pointer`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add match</span>
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dayAllocs.map((alloc, aIdx) => {
                          const distName = resolveDistrictDisplayName(currentRound, alloc, aIdx, currentRoundDistricts.length);
                          const matches = alloc.matches && alloc.matches.length > 0
                            ? alloc.matches
                            : [{ district_match_number: 1, start_time: '13:00', map: availableMaps[0] || 'Erangel' }];
                          const matchCount = matches.length;

                          return (
                            <div
                              key={alloc.id || aIdx}
                              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 space-y-2.5 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                    {distName}
                                  </span>
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                    {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingDistrictAlloc({
                                      allocation: alloc,
                                      displayName: distName,
                                      dayNumber: continuousDayNum,
                                      dayIdx: dIdx,
                                      allocIdx: aIdx,
                                    })
                                  }
                                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                                >
                                  Detailed Modal
                                </button>
                              </div>

                              {/* Matches List for this District */}
                              <div className="space-y-1.5">
                                {matches.map((m, mIdx) => (
                                  <div
                                    key={m.id || mIdx}
                                    id={`match-row-${m.id}`}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-800"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                                        Match {m.district_match_number || mIdx + 1}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2 flex-wrap">
                                      {/* District / Lobby Dropdown */}
                                      <div className="flex items-center gap-1">
                                        <select
                                          value={m.district_id || alloc.district_id || alloc.id}
                                          onChange={(e) =>
                                            handleChangeMatchDistrict(dIdx, aIdx, mIdx, e.target.value)
                                          }
                                          className={`pl-2.5 pr-7 py-1 text-xs font-semibold ${theme.inputBg} rounded-md border border-slate-200 dark:border-slate-700 max-w-[170px] sm:max-w-[220px] truncate cursor-pointer`}
                                          title="Choose district for this match"
                                        >
                                          {currentRoundDistricts.map((d) => (
                                            <option key={d.id} value={d.id}>
                                              {d.name}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Start Time */}
                                      <div className="flex items-center gap-1">
                                        <Clock className="w-3 h-3 text-slate-400" />
                                        <input
                                          type="time"
                                          value={m.start_time || '13:00'}
                                          onChange={(e) =>
                                            handleUpdateMatchField(dIdx, aIdx, mIdx, 'start_time', e.target.value)
                                          }
                                          className={`px-2 py-1 text-xs font-semibold ${theme.inputBg}`}
                                        />
                                      </div>

                                      {/* Map */}
                                      <div className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-slate-400" />
                                        <select
                                          value={m.map || availableMaps[0] || 'Erangel'}
                                          onChange={(e) =>
                                            handleUpdateMatchField(dIdx, aIdx, mIdx, 'map', e.target.value)
                                          }
                                          className={`px-2 py-1 text-xs font-semibold ${theme.inputBg}`}
                                        >
                                          {availableMaps.map((mapName) => (
                                            <option key={mapName} value={mapName}>
                                              {mapName}
                                            </option>
                                          ))}
                                        </select>
                                      </div>

                                      {/* Move to another day */}
                                      {currentRound.days.length > 1 && (
                                        <div className="flex items-center gap-1">
                                          <select
                                            value=""
                                            onChange={(e) =>
                                              handleMoveMatchToDay(dIdx, aIdx, mIdx, Number(e.target.value))
                                            }
                                            className={`px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 ${theme.inputBg} rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer`}
                                            title="Move match to another day"
                                          >
                                            <option value="" disabled>Move to day...</option>
                                            {currentRound.days.map((targetD, targetDIdx) => (
                                              targetDIdx !== dIdx ? (
                                                <option key={targetDIdx} value={targetDIdx}>
                                                  Day {getContinuousDayNumber(workingRounds, selectedRoundIdx, targetDIdx)}
                                                </option>
                                              ) : null
                                            ))}
                                          </select>
                                        </div>
                                      )}

                                      {/* Remove match button */}
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMatch(dIdx, aIdx, mIdx)}
                                        title="Remove match"
                                        className="p-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Add Match Controls for this District */}
                              <div className="flex items-center justify-between pt-1">
                                <button
                                  type="button"
                                  disabled={matches.length >= 12}
                                  onClick={() => handleAddMatchToDay(dIdx, alloc.district_id || alloc.id)}
                                  className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add match for this district</span>
                                </button>
                                {matches.length >= 12 && (
                                  <span className="text-[10px] text-amber-600 font-medium">Maximum 12 matches per day allowed</span>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Bottom Day-level Add match button (after last match) */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleAddMatchToDay(dIdx)}
                            className={`w-full py-2 px-3 rounded-lg text-xs font-bold ${theme.secondaryBtn} border border-dashed border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 flex items-center justify-center gap-1.5 transition cursor-pointer`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add match</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: REVIEW & PUBLISH */}
      <div className={`p-4 rounded-xl ${theme.cardBg} space-y-3`}>
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
              Step 4
            </span>
            <h2 className={`text-sm sm:text-base font-bold ${theme.headingText} flex items-center gap-1.5`}>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              Review & Publication Readiness
            </h2>
          </div>
        </div>

        {/* Readiness Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Stages</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">{totalRoundsCount}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Match Days</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">{totalMatchDaysCount}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Total Matches</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">{totalMatchesCount}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Grand Finals</span>
            <span className="text-base font-bold text-slate-900 dark:text-slate-100">
              {gfDaysCount > 0 ? `${gfDaysCount}d (${gfMatchesCount}m)` : 'None'}
            </span>
          </div>
        </div>

        {/* Unified Validation Box */}
        {serverValidation.errors.length > 0 ? (
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-xs space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              Action Blocked / Validation Issues:
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
              {serverValidation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        ) : serverValidation.warnings.length > 0 ? (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              Schedule Warnings (Advisory):
            </span>
            <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-1">
              {serverValidation.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">Schedule is structurally sound and balanced.</span>
          </div>
        )}

        {/* Schedule Date Overlap Warning in Review Section (Task 3 & 5) */}
        {roundDateWarnings.length > 0 && (
          <div className="space-y-2">
            {roundDateWarnings.map((w, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-bold block sm:inline">{w.message}</span>
                    <span className="block text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Publishing is blocked until later rounds are scheduled strictly after earlier rounds conclude.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleShiftLaterRounds(w.roundIndex)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition cursor-pointer shrink-0 self-start sm:self-auto shadow-2xs"
                >
                  Shift later rounds to follow
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Live Status Callout & Actions */}
        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-slate-100">
              {isPublished ? 'Roadmap is Currently Live' : 'Ready to Publish?'}
            </h4>
            <p className="text-[11px] text-slate-500">
              {isPublished
                ? 'Participants can see the schedule and their personalized district assignments.'
                : 'Publishing will make match dates, maps, and timings visible to all participants.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isPublished ? (
              <button
                type="button"
                onClick={() => setShowUnpublishModal(true)}
                disabled={publishing || saving}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${theme.secondaryBtn} disabled:opacity-50`}
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || saving}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold ${theme.primaryBtn} disabled:opacity-50`}
              >
                {publishing ? 'Publishing...' : 'Publish Roadmap'}
              </button>
            )}
          </div>
        </div>

        {/* Destructive Action: Reset Roadmap */}
        {onDeleteRoadmap && workingRounds.length > 0 && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteModal(true)}
              disabled={publishing || saving || deleting}
              className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset & Delete Roadmap</span>
            </button>
          </div>
        )}
      </div>
      </>
      )}

      {/* STICKY BOTTOM SAVE BAR */}
      {workingRounds.length > 0 && (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-lg py-2.5 px-4 sm:px-8">
        {serverErrorBanner && (
          <div className="max-w-4xl mx-auto mb-2 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200 flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
              <span className="font-bold truncate">{serverErrorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setServerErrorBanner(null)}
              className="text-[11px] text-rose-600 dark:text-rose-400 font-bold hover:underline shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2.5">
          {/* Status & Round Indicator */}
          <div className="flex items-center gap-2.5 text-xs w-full sm:w-auto justify-between sm:justify-start">
            {hasUnsavedChanges ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unsaved Changes
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                All changes saved
              </span>
            )}

            {currentRound && (
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                Round {selectedRoundIdx + 1} of {workingRounds.length}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onTogglePreview && (
              <button
                type="button"
                onClick={onTogglePreview}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${theme.secondaryBtn} flex items-center gap-1`}
              >
                {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{previewMode ? 'Exit' : 'Preview'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || publishing}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${theme.secondaryBtn} disabled:opacity-50`}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>

            {isPublished ? (
              <button
                type="button"
                onClick={() => setShowUnpublishModal(true)}
                disabled={publishing || saving}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold ${theme.secondaryBtn} disabled:opacity-50`}
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || saving}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold ${theme.primaryBtn} disabled:opacity-50`}
              >
                {publishing ? 'Publishing...' : 'Publish'}
              </button>
            )}
          </div>
        </div>
      </div>
      )}

      {/* SETUP / GENERATOR MODAL */}
      <RoadmapSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        meta={meta}
        hasExistingRoadmap={workingRounds.length > 0}
        onGenerate={async (options) => {
          try {
            const res = await onGenerate(options);
            if (res && res.success) {
              if (Array.isArray(res.structured_rounds) && res.structured_rounds.length > 0) {
                handleUpdateRounds(res.structured_rounds);
              }
              return { success: true };
            }
            return res || { success: false, error: 'Failed to generate roadmap.' };
          } catch (err) {
            return { success: false, error: err.message || 'Generation failed.' };
          }
        }}
        onDeleteRoadmap={handleTriggerDelete}
        generating={generating}
        cardColor={cardColor}
      />

      {/* PER-MATCH DISTRICT SETTINGS MODAL */}
      {editingDistrictAlloc && (
        <RoadmapDistrictSettingsModal
          isOpen={true}
          allocation={editingDistrictAlloc.allocation}
          displayName={editingDistrictAlloc.displayName}
          dayNumber={editingDistrictAlloc.dayNumber}
          game={game}
          cardColor={cardColor}
          onClose={() => setEditingDistrictAlloc(null)}
          onSave={(updatedMatches) => {
            const copy = JSON.parse(JSON.stringify(workingRounds));
            const alloc =
              copy[selectedRoundIdx]?.days?.[editingDistrictAlloc.dayIdx]?.allocations?.[
                editingDistrictAlloc.allocIdx
              ];
            if (alloc) {
              alloc.matches = updatedMatches;
              alloc.match_count = updatedMatches.length;
              handleUpdateRounds(copy);
            }
            setEditingDistrictAlloc(null);
          }}
        />
      )}

      {/* UNPUBLISH CONFIRMATION MODAL */}
      {showUnpublishModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-sm w-full space-y-3 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Unpublish Roadmap?
            </h3>
            <p className="text-xs text-slate-500">
              Reverting to draft will hide match schedules and room details from participants until published again.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowUnpublishModal(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.secondaryBtn}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowUnpublishModal(false);
                  onUnpublish();
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
              >
                Confirm Unpublish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE ROADMAP CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-rose-200 dark:border-rose-900 rounded-xl p-5 max-w-sm w-full space-y-3 shadow-xl">
            <div className="flex items-center gap-2 text-rose-600">
              <Trash2 className="w-4 h-4" />
              <h3 className="text-sm font-bold">Reset Entire Roadmap?</h3>
            </div>
            <p className="text-xs text-slate-500">
              This will delete all rounds, days, matches, and district schedules. This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.secondaryBtn}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTriggerDelete}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Yes, Reset Everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE SINGLE ROUND CONFIRMATION MODAL */}
      {roundToDeleteIdx != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 max-w-sm w-full space-y-3 shadow-xl">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Delete Round {roundToDeleteIdx + 1}?
            </h3>
            <p className="text-xs text-slate-500">
              All days and scheduled matches within this round will be removed.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRoundToDeleteIdx(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${theme.secondaryBtn}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRound}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Delete Round
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
