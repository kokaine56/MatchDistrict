import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Save,
  Send,
  Eye,
  EyeOff,
  RotateCcw,
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
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import RoadmapSetupModal from './RoadmapSetupModal';
import RoadmapDistrictSettingsModal from './RoadmapDistrictSettingsModal';
import RoadmapDatePicker from './RoadmapDatePicker';
import { formatDateWithWeekdayIST } from '../../utils/roadmapDateUtils';
import { formatTime12hIST } from '../../utils/timeFormat';
import { getCompactPlanOverview } from './ParticipantRoadmapView';
import { syncAutoDistrictsForLaterRounds } from '../../utils/roadmapAutoDistricts.js';

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

  // Initialize rounds from prop
  useEffect(() => {
    if (!isInitializedRef.current && Array.isArray(rounds) && rounds.length > 0) {
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
  }, [rounds, teamsPerGroup, slotsTotal]);

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
          day_number: 1,
          date: minSelectableDate || '',
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
    const days = r.days || [];
    const nextDayNum = days.length + 1;
    let nextDate = minSelectableDate || '';
    if (days.length > 0 && days[days.length - 1].date) {
      try {
        const last = new Date(days[days.length - 1].date);
        last.setDate(last.getDate() + 1);
        nextDate = last.toISOString().slice(0, 10);
      } catch {
        nextDate = minSelectableDate || '';
      }
    }

    days.push({
      id: `DAY-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      day_number: nextDayNum,
      date: nextDate,
      allocations: [],
    });
    r.days = days;
    handleUpdateRounds(copy);
  };

  const handleRemoveDay = (dayIdx) => {
    const copy = JSON.parse(JSON.stringify(workingRounds));
    const r = copy[selectedRoundIdx];
    if (!r || !r.days || r.days.length <= 1) return;
    r.days = r.days.filter((_, i) => i !== dayIdx).map((d, i) => ({ ...d, day_number: i + 1 }));
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
      } else if (res && res.serverError) {
        setServerErrorBanner(res.serverError);
      }
    } catch (e) {
      setServerErrorBanner(e.message || 'Failed to save draft.');
    }
  };

  // Publish
  const handlePublish = async () => {
    setServerValidation({ errors: [], warnings: [] });
    setServerErrorBanner(null);
    try {
      const res = await onPublish({ rounds: workingRounds });
      if (res && res.success) {
        setHasUnsavedChanges(false);
        clearSessionDraft();
        setSuccessBanner('Roadmap published successfully! Participants can now view the match schedule.');
        setTimeout(() => setSuccessBanner(null), 5000);
      } else if (res && res.errors?.length > 0) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      } else if (res && res.serverError) {
        setServerErrorBanner(res.serverError);
      }
    } catch (e) {
      setServerErrorBanner(e.message || 'Failed to publish roadmap.');
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

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4 pb-28 px-2 sm:px-0">
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
                      {isGF ? 'Grand Finals' : 'Qualifiers'}
                    </span>
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

                    {/* Qualification Rule Box (Qualifiers only) */}
                    {!isGF && (
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

          {/* Days List */}
          <div className="space-y-3">
            {(!currentRound.days || currentRound.days.length === 0) ? (
              <div className="p-4 text-center text-xs text-slate-400">
                No match days added yet. Click &quot;Add Day&quot; to begin.
              </div>
            ) : (
              currentRound.days.map((day, dIdx) => {
                const dayAllocs = day.allocations || [];
                return (
                  <div
                    key={day.id || dIdx}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 space-y-3"
                  >
                    {/* Day Header with DatePicker showing weekday */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200/50 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Day {day.day_number}
                        </span>
                        {day.date && (
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                            ({formatDateWithWeekdayIST(day.date)})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <RoadmapDatePicker
                          value={day.date || ''}
                          min={minSelectableDate}
                          onChange={(newDate) => handleUpdateDayDate(dIdx, newDate)}
                          className="text-xs"
                        />

                        {currentRound.days.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveDay(dIdx)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Remove Day"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* District Rows */}
                    {dayAllocs.length === 0 ? (
                      <div className="py-2 text-center text-xs text-slate-400 italic">
                        No districts assigned to this day.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dayAllocs.map((alloc, aIdx) => {
                          const distName = alloc.district_name || alloc.name || `District ${aIdx + 1}`;
                          const firstMatch = alloc.matches?.[0] || {
                            start_time: '13:00',
                            map: 'Erangel',
                          };
                          const matchCount = alloc.matches?.length || 1;

                          return (
                            <div
                              key={alloc.id || aIdx}
                              className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                                  {distName}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded">
                                  {matchCount} {matchCount === 1 ? 'match' : 'matches'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Start Time */}
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-400" />
                                  <input
                                    type="time"
                                    value={firstMatch.start_time || '13:00'}
                                    onChange={(e) =>
                                      handleUpdateDistrictField(dIdx, aIdx, 'start_time', e.target.value)
                                    }
                                    className={`px-2 py-1 text-xs font-semibold ${theme.inputBg}`}
                                  />
                                </div>

                                {/* Map */}
                                <div className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  <select
                                    value={firstMatch.map || 'Erangel'}
                                    onChange={(e) =>
                                      handleUpdateDistrictField(dIdx, aIdx, 'map', e.target.value)
                                    }
                                    className={`px-2 py-1 text-xs font-semibold ${theme.inputBg}`}
                                  >
                                    {availableMaps.map((m) => (
                                      <option key={m} value={m}>
                                        {m}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Edit matches action */}
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditingDistrictAlloc({
                                      allocation: alloc,
                                      dayNumber: day.day_number,
                                      dayIdx: dIdx,
                                      allocIdx: aIdx,
                                    })
                                  }
                                  className="px-2.5 py-1 rounded text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 cursor-pointer transition"
                                >
                                  Edit Matches
                                </button>
                              </div>
                            </div>
                          );
                        })}
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

      {/* STICKY BOTTOM SAVE BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-lg py-2.5 px-4 sm:px-8">
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

      {/* SETUP / GENERATOR MODAL */}
      <RoadmapSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        meta={meta}
        hasExistingRoadmap={workingRounds.length > 0}
        onGenerate={(options) => {
          setShowSetupModal(false);
          onGenerate(options);
        }}
        generating={generating}
        cardColor={cardColor}
      />

      {/* PER-MATCH DISTRICT SETTINGS MODAL */}
      {editingDistrictAlloc && (
        <RoadmapDistrictSettingsModal
          isOpen={true}
          allocation={editingDistrictAlloc.allocation}
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
                onClick={() => {
                  setShowDeleteModal(false);
                  onDeleteRoadmap();
                }}
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
