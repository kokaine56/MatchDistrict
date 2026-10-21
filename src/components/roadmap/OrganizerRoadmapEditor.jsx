import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  ArrowRight,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import RoadmapPlanSummary from './RoadmapPlanSummary';
import RoadmapSetupModal from './RoadmapSetupModal';
import RoadmapRoundsManager from './RoadmapRoundsManager';
import RoadmapDaysDistricts from './RoadmapDaysDistricts';
import { syncAutoDistrictsForLaterRounds } from '../../utils/roadmapAutoDistricts.js';

export default function OrganizerRoadmapEditor({
  tournamentId,
  tournamentTitle,
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

  // Storage key for sessionStorage safety net
  const storageKey = tournamentId ? `matchdistrict_roadmap_draft_${tournamentId}` : 'matchdistrict_roadmap_draft_default';

  // Local working copy of rounds — SINGLE draft state
  const [workingRounds, setWorkingRounds] = useState(rounds || []);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [pendingStoredDraft, setPendingStoredDraft] = useState(null);

  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [serverValidation, setServerValidation] = useState({ errors: [], warnings: [] });
  const [serverErrorBanner, setServerErrorBanner] = useState(null);
  const [successBanner, setSuccessBanner] = useState(null);

  const teamsPerGroup = Number(meta.teams_per_group || meta.teams_per_district || 16);
  const slotsTotal = Number(meta.total_slots || meta.slotsTotal || (rounds[0]?.teams_in) || 64);

  const isInitializedRef = useRef(false);
  const currentTourneyIdRef = useRef(tournamentId);

  // Helper: Persist working draft to sessionStorage
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
    } catch (err) {
      console.warn('Could not persist draft to sessionStorage:', err);
    }
  };

  // Helper: Clear sessionStorage draft
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

  // Check sessionStorage for previous unsaved draft on mount or storageKey change
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
      console.warn('Failed to parse sessionStorage roadmap draft:', e);
    }
  }, [storageKey, rounds]);

  // Synchronize initial server rounds: only initialize once or if workingRounds is empty
  useEffect(() => {
    if (!isInitializedRef.current && Array.isArray(rounds) && rounds.length > 0) {
      const copy = JSON.parse(JSON.stringify(rounds));
      const syncRes = syncAutoDistrictsForLaterRounds({ rounds: copy }, { teams_per_group: teamsPerGroup, slotsTotal });
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

  // Restore unsaved draft from sessionStorage
  const handleRestoreStoredDraft = () => {
    if (pendingStoredDraft?.rounds) {
      const copy = JSON.parse(JSON.stringify(pendingStoredDraft.rounds));
      const syncRes = syncAutoDistrictsForLaterRounds({ rounds: copy }, { teams_per_group: teamsPerGroup, slotsTotal });
      setWorkingRounds(copy);
      setHasUnsavedChanges(true);
      setPendingStoredDraft(null);
      setSuccessBanner('Restored unsaved draft changes from previous session.');
      setTimeout(() => setSuccessBanner(null), 4000);
    }
  };

  // Discard stored draft from sessionStorage
  const handleDiscardStoredDraft = () => {
    clearSessionDraft();
  };

  // Track edits — purely in local draft state
  const handleUpdateRounds = (newRounds) => {
    const copy = JSON.parse(JSON.stringify(newRounds || []));
    const syncRes = syncAutoDistrictsForLaterRounds({ rounds: copy }, { teams_per_group: teamsPerGroup, slotsTotal });
    setWorkingRounds(copy);
    setHasUnsavedChanges(true);
    persistToSession(copy);
    if (syncRes?.warnings?.length > 0) {
      setServerValidation((prev) => ({
        ...prev,
        warnings: [...new Set([...prev.warnings, ...syncRes.warnings])],
      }));
    }
  };

  const handleUpdateDays = (newDays) => {
    const updated = workingRounds.map((r, i) =>
      i === selectedRoundIdx ? { ...r, days: newDays } : r
    );
    const copy = JSON.parse(JSON.stringify(updated));
    const syncRes = syncAutoDistrictsForLaterRounds({ rounds: copy }, { teams_per_group: teamsPerGroup });
    setWorkingRounds(copy);
    setHasUnsavedChanges(true);
    persistToSession(copy);
  };

  // Safe Close
  const handleAttemptClose = () => {
    if (hasUnsavedChanges) {
      setShowLeaveWarning(true);
    } else if (onClose) {
      onClose();
    }
  };

  // Save Draft — merges response without resetting scroll position or selected round
  const handleSaveDraft = async () => {
    setServerValidation({ errors: [], warnings: [] });
    setServerErrorBanner(null);
    try {
      const res = await onSaveDraft({ rounds: workingRounds });
      if (res && res.success) {
        setHasUnsavedChanges(false);
        clearSessionDraft();
        setSuccessBanner('Draft saved successfully to database.');
        setTimeout(() => setSuccessBanner(null), 4000);
      } else if (res && res.serverError) {
        setServerErrorBanner(res.serverError);
      } else if (res && res.errors && res.errors.length > 0) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      } else if (res && !res.success) {
        setServerErrorBanner(res.message || 'Failed to save draft.');
      }
    } catch (err) {
      setServerErrorBanner(err.message || 'Failed to save draft.');
    }
  };

  // Publish — merges response without resetting user's position
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
      } else if (res && res.serverError) {
        setServerErrorBanner(res.serverError);
      } else if (res && res.errors && res.errors.length > 0) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      } else if (res && !res.success) {
        setServerErrorBanner(res.message || 'Failed to publish roadmap.');
      }
    } catch (err) {
      setServerErrorBanner(err.message || 'Failed to publish roadmap.');
    }
  };

  const currentRound = workingRounds[selectedRoundIdx] || workingRounds[0] || null;

  // Publication Metrics & Validation for Review Section
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

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-28 px-1 sm:px-0">
      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 1: SETUP & OVERVIEW                                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} transition-all`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5 sm:gap-4">
          <div className="w-full sm:w-auto">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                  isPublished ? theme.badgeSuccess : theme.badgeWarning
                }`}
              >
                {isPublished ? 'Live & Published' : 'Draft Mode'}
              </span>

              {hasUnsavedChanges && (
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse">
                  ● Unsaved Changes
                </span>
              )}

              <span className={`text-[11px] font-mono uppercase px-2 py-0.5 rounded ${theme.badgeNeutral}`}>
                Game: {game}
              </span>
            </div>
            <h1 className={`text-lg sm:text-2xl font-black ${theme.headingText} tracking-tight leading-snug`}>
              {tournamentTitle}
            </h1>
            <p className={`text-xs ${theme.mutedText} mt-0.5`}>
              Configure rounds, days, districts, and qualification rules before tournament start.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[36px] ${theme.secondaryBtn}`}
              title="Open Setup Formula & Generator"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Setup / Generate</span>
            </button>

            {onClose && (
              <button
                type="button"
                onClick={handleAttemptClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                title="Close Roadmap"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Safety Net Banner: Prompt to Restore Unsaved SessionStorage Draft */}
        <AnimatePresence>
          {pendingStoredDraft && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
            >
              <div className="flex items-start sm:items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <span className="font-bold block sm:inline">Unsaved Draft Detected: </span>
                  <span>
                    You have an unsaved roadmap draft from a previous session (
                    {new Date(pendingStoredDraft.timestamp).toLocaleTimeString()}).
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                <button
                  type="button"
                  onClick={handleRestoreStoredDraft}
                  className="px-3 py-1.5 rounded-lg font-bold bg-amber-600 hover:bg-amber-700 text-white transition-colors cursor-pointer text-xs"
                >
                  Restore Unsaved Changes
                </button>
                <button
                  type="button"
                  onClick={handleDiscardStoredDraft}
                  className="px-3 py-1.5 rounded-lg font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer text-xs"
                >
                  Discard
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Capacity Warning Banner if slotsTotal changed */}
        {meta.capacity_mismatch && (
          <div className="mt-3 sm:mt-4 p-3 sm:p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Roadmap was built for <strong>{meta.capacity_mismatch.planned}</strong> teams, but tournament capacity is now <strong>{meta.capacity_mismatch.current}</strong> teams.
              </span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className={`w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs font-bold ${theme.primaryBtn}`}
              >
                Rebuild for {meta.capacity_mismatch.current} Teams
              </button>
            </div>
          </div>
        )}

        {/* Server Validation Errors & Warnings Banners */}
        <AnimatePresence>
          {successBanner && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 sm:mt-4 p-3 sm:p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-semibold">{successBanner}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessBanner(null)}
                className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {serverErrorBanner && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 sm:mt-4 p-3.5 sm:p-4 rounded-xl bg-red-50 border border-red-300 text-red-900 text-xs flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                <div>
                  <span className="font-bold block text-red-800">Server Error:</span>
                  <span className="text-[11px] text-red-700">{serverErrorBanner}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setServerErrorBanner(null)}
                className="text-red-700 hover:text-red-900 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {serverValidation.errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 sm:mt-4 p-3.5 sm:p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1.5"
            >
              <div className="flex items-center gap-2 font-bold text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Action Blocked / Validation Errors:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-rose-800 leading-relaxed">
                {serverValidation.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </motion.div>
          )}

          {serverValidation.warnings.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 sm:mt-4 p-3.5 sm:p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1.5"
            >
              <div className="flex items-center gap-2 font-bold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Schedule Warnings (Advisory):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-amber-800 leading-relaxed">
                {serverValidation.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Setup Step: Formula & Plan Summary Card */}
      <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Sparkles className={`w-4 h-4 ${theme.accentText}`} />
            <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
              1. Tournament Structure & Setup Formula
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowSetupModal(true)}
            className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            <span>Configure Formula</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <RoadmapPlanSummary
          rounds={workingRounds}
          meta={meta}
          cardColor={cardColor}
        />
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 2: ROUNDS MANAGEMENT & ADVANCEMENT RULES             */}
      {/* ───────────────────────────────────────────────────────────── */}
      {workingRounds.length > 0 && (
        <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
            <Layers className={`w-4 h-4 ${theme.accentText}`} />
            <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
              2. Tournament Rounds & Progression Rules
            </h2>
          </div>

          <RoadmapRoundsManager
            rounds={workingRounds}
            selectedRoundIdx={selectedRoundIdx}
            onSelectRound={setSelectedRoundIdx}
            onUpdateRounds={handleUpdateRounds}
            cardColor={cardColor}
            meta={meta}
            slotsTotal={slotsTotal}
          />
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 3: DAYS, DATES & DISTRICT ALLOCATIONS                 */}
      {/* ───────────────────────────────────────────────────────────── */}
      {currentRound && (
        <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
          <div className="flex items-start sm:items-center justify-between pb-2.5 border-b border-slate-200 flex-col sm:flex-row gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${theme.accentText}`} />
              <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
                3. Match Days, Dates & Districts — {currentRound.name || `Round ${currentRound.round_number}`}
              </h2>
            </div>
            <span className={`text-[11px] sm:text-xs ${theme.mutedText}`}>
              Assign districts, adjust start times and select maps.
            </span>
          </div>

          <RoadmapDaysDistricts
            round={currentRound}
            roundIdx={selectedRoundIdx}
            prevRound={selectedRoundIdx > 0 ? workingRounds[selectedRoundIdx - 1] : null}
            rounds={workingRounds}
            allDistricts={districts}
            minSelectableDate={minSelectableDate}
            game={game}
            onUpdateDays={handleUpdateDays}
            cardColor={cardColor}
            meta={meta}
          />
        </div>
      )}

      {/* ───────────────────────────────────────────────────────────── */}
      {/* SECTION 4: REVIEW & PUBLICATION READINESS                     */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
        <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
          <ShieldCheck className={`w-4 h-4 text-emerald-600`} />
          <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
            4. Review & Publication Readiness
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-center">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.mutedText} block mb-1`}>
              Stages Configured
            </span>
            <span className={`text-lg sm:text-xl font-black ${theme.headingText}`}>
              {totalRoundsCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-center">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.mutedText} block mb-1`}>
              Match Days
            </span>
            <span className={`text-lg sm:text-xl font-black ${theme.headingText}`}>
              {totalMatchDaysCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-center">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.mutedText} block mb-1`}>
              Total Matches
            </span>
            <span className={`text-lg sm:text-xl font-black ${theme.headingText}`}>
              {totalMatchesCount}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 text-center">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${theme.mutedText} block mb-1`}>
              Grand Finals
            </span>
            <span className={`text-lg sm:text-xl font-black ${gfDaysCount > 0 ? 'text-amber-600' : theme.headingText}`}>
              {gfDaysCount > 0 ? `${gfDaysCount}d (${gfMatchesCount}m)` : 'None'}
            </span>
          </div>
        </div>

        {/* Action Callout inside Review Section */}
        <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60">
          <div>
            <h4 className={`text-xs font-bold ${theme.headingText}`}>
              {isPublished ? 'Roadmap is Currently Live' : 'Ready to Publish to Participants?'}
            </h4>
            <p className={`text-[11px] ${theme.mutedText}`}>
              {isPublished
                ? 'Participants can see the schedule and their personalized district assignments.'
                : 'Publishing will make match dates, maps, and timings visible to all registered participants.'}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {isPublished ? (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={publishing || saving}
                className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 transition shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Unpublish</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || saving}
                className={`w-full sm:w-auto px-5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${theme.primaryBtn} disabled:opacity-50 shadow-md`}
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>{publishing ? 'Publishing...' : 'Publish Roadmap'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* STICKY BOTTOM SAVE BAR                                        */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] py-3 px-4 sm:px-8">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Status & Round Indicator */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-start">
            {hasUnsavedChanges ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300 animate-pulse flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Unsaved Changes
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                All changes saved
              </span>
            )}

            {currentRound && (
              <span className={`text-xs ${theme.mutedText} font-medium hidden sm:inline`}>
                Viewing {currentRound.name || `Round ${currentRound.round_number}`} ({selectedRoundIdx + 1} of {workingRounds.length})
              </span>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onTogglePreview && (
              <button
                type="button"
                onClick={onTogglePreview}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.secondaryBtn}`}
                title="Preview how participants see the schedule"
              >
                {previewMode ? <EyeOff className="w-3.5 h-3.5 shrink-0" /> : <Eye className="w-3.5 h-3.5 shrink-0" />}
                <span>{previewMode ? 'Exit Preview' : 'Preview'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || publishing}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.secondaryBtn} disabled:opacity-50`}
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{saving ? 'Saving...' : 'Save Draft'}</span>
            </button>

            {isPublished ? (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={publishing || saving}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 min-h-[38px] transition shadow-xs"
                title="Revert roadmap to draft"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Unpublish</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || saving}
                className={`px-4 sm:px-5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.primaryBtn} disabled:opacity-50`}
              >
                <Send className="w-3.5 h-3.5 shrink-0" />
                <span>{publishing ? 'Publishing...' : 'Publish Roadmap'}</span>
              </button>
            )}

            {onDeleteRoadmap && workingRounds.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={publishing || saving || deleting}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1 min-h-[38px] transition"
                title="Delete entire roadmap and reset"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Setup / Generator Modal */}
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

      {/* Unsaved Changes Confirmation Dialog */}
      {showLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-full max-w-md p-5 sm:p-6 rounded-2xl ${theme.modalBg} border shadow-2xl space-y-4`}
          >
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className={`font-bold text-base ${theme.headingText}`}>
                Discard Unsaved Changes?
              </h3>
            </div>
            <p className={`text-xs ${theme.bodyText} leading-relaxed`}>
              You have unsaved edits in your roadmap. If you close now without saving draft or publishing, your modifications will be lost.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowLeaveWarning(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${theme.secondaryBtn}`}
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLeaveWarning(false);
                  clearSessionDraft();
                  if (onClose) onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
              >
                Discard & Close
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Entire Roadmap Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-full max-w-md p-5 sm:p-6 rounded-2xl ${theme.modalBg} border border-rose-200 space-y-4 shadow-2xl`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`font-bold text-base ${theme.headingText}`}>
                  Delete Entire Roadmap?
                </h3>
                <p className={`text-xs ${theme.mutedText}`}>Destructive tournament reset</p>
              </div>
            </div>
            <p className={`text-xs ${theme.bodyText} leading-relaxed`}>
              This will completely remove all configured rounds, match days, district allocations, and roadmap configuration for this tournament. Ordinary participants will see &ldquo;Roadmap will be published soon&rdquo;. This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setShowDeleteModal(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${theme.secondaryBtn}`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  clearSessionDraft();
                  if (onDeleteRoadmap) await onDeleteRoadmap();
                  setShowDeleteModal(false);
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Delete Entire Roadmap'}</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
