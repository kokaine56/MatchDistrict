import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Trophy,
  Clock,
  Users,
  Calendar,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import { planRoadmapStages } from '../../utils/roadmapPlanner';

function getLiveProgressionSummary(stages, slotsTotal, grandFinalTeams) {
  if (!stages || stages.length === 0) return `${slotsTotal} teams → Grand Final`;
  if (stages.length === 1 && stages[0].isGrandFinal) {
    return `${slotsTotal} teams → 1 district → Grand Final`;
  }
  const parts = [];
  stages.forEach((stg, i) => {
    if (i === 0) {
      parts.push(`${slotsTotal} teams`);
      parts.push(`${stg.districtCount} ${stg.districtCount === 1 ? 'district' : 'districts'}`);
      if (stg.advancementType === 'per_district' && stg.teamsAdvancingPerDistrict) {
        parts.push(`top ${stg.teamsAdvancingPerDistrict} each`);
      } else if (stg.teamsAdvancing) {
        parts.push(`top ${stg.teamsAdvancing} overall`);
      }
    } else if (!stg.isGrandFinal) {
      parts.push(`${stg.name} (${stg.teamsIn} teams)`);
      if (stg.advancementType === 'per_district' && stg.teamsAdvancingPerDistrict) {
        parts.push(`top ${stg.teamsAdvancingPerDistrict} each`);
      }
    } else {
      parts.push(`${grandFinalTeams} finalists`);
      parts.push('Grand Final');
    }
  });
  return parts.join(' → ');
}

export default function RoadmapSetupModal({
  isOpen,
  onClose,
  meta = {},
  hasExistingRoadmap = false,
  onGenerate,
  onDeleteRoadmap,
  generating = false,
  cardColor = 'white',
}) {
  const theme = getRoadmapTheme(cardColor);

  const initialSlots = parseInt(meta.total_slots || meta.slotsTotal || 64, 10) || 64;
  const initialTpg = parseInt(meta.teams_per_group || meta.teams_per_district || 16, 10) || 16;
  const initialGf = parseInt(meta.grand_final_teams || meta.grandFinalTeams || initialTpg, 10) || initialTpg;
  const initialDays = parseInt(meta.number_of_days || meta.days_count || 2, 10) || 2;
  const initialMpd = parseInt(meta.matches_per_day || 2, 10) || 2;
  const initialFirstTime = meta.first_match_time || meta.firstMatchTime || '13:00';
  const initialGap = parseInt(meta.match_gap_minutes || meta.matchGapMinutes || 60, 10) || 60;
  const initialDur = parseInt(meta.match_duration_minutes || meta.matchDurationMinutes || 30, 10) || 30;

  // Form states
  const [slotsTotal, setSlotsTotal] = useState(initialSlots);
  const [teamsPerDistrict, setTeamsPerDistrict] = useState(initialTpg);
  const [grandFinalTeams, setGrandFinalTeams] = useState(initialGf);
  const [numberOfDays, setNumberOfDays] = useState(initialDays);

  // Advanced states
  const [matchesPerDay, setMatchesPerDay] = useState(initialMpd);
  const [firstMatchTime, setFirstMatchTime] = useState(initialFirstTime);
  const [matchGapMinutes, setMatchGapMinutes] = useState(initialGap);
  const [matchDurationMinutes, setMatchDurationMinutes] = useState(initialDur);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  // Accessibility & Focus Management
  const modalRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      setSlotsTotal(initialSlots);
      setTeamsPerDistrict(initialTpg);
      setGrandFinalTeams(initialGf);
      setNumberOfDays(initialDays);
      setMatchesPerDay(initialMpd);
      setFirstMatchTime(initialFirstTime);
      setMatchGapMinutes(initialGap);
      setMatchDurationMinutes(initialDur);
      setErrorMsg('');
      setConfirmOverwrite(false);
      setConfirmDelete(false);
      setShowUnsavedWarning(false);
      setIsSubmitting(false);

      // Focus first input or modal container
      setTimeout(() => {
        const input = modalRef.current?.querySelector('input');
        if (input) input.focus();
        else modalRef.current?.focus();
      }, 50);
    } else if (triggerRef.current) {
      triggerRef.current.focus?.();
    }
  }, [isOpen]);

  const hasDirtyFields =
    slotsTotal !== initialSlots ||
    teamsPerDistrict !== initialTpg ||
    grandFinalTeams !== initialGf ||
    numberOfDays !== initialDays ||
    matchesPerDay !== initialMpd;

  const handleRequestClose = () => {
    if (hasDirtyFields && !showUnsavedWarning) {
      setShowUnsavedWarning(true);
      return;
    }
    onClose();
  };

  // Keyboard Escape & Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleRequestClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, hasDirtyFields, showUnsavedWarning]);

  if (!isOpen) return null;

  const parsedSlots = parseInt(slotsTotal, 10) || 0;
  const parsedTpg = parseInt(teamsPerDistrict, 10) || 0;
  const parsedGf = parseInt(grandFinalTeams, 10) || 0;

  // Derive pure live preview plan matching generator logic
  const previewStages = planRoadmapStages({
    slotsTotal: parsedSlots,
    teamsPerDistrict: parsedTpg,
    grandFinalTeams: parsedGf,
  });

  const liveSummary = getLiveProgressionSummary(previewStages, parsedSlots, parsedGf);
  const capacityMismatch = meta.capacity_mismatch || null;

  const handleGenerateClick = async () => {
    if (isSubmitting || generating) return;
    setErrorMsg('');

    // Pre-flight validation
    if (!parsedSlots || parsedSlots < 2) {
      setErrorMsg('Set total slots first (min 2)');
      return;
    }
    if (!parsedTpg || parsedTpg < 2) {
      setErrorMsg('Teams per district must be at least 2');
      return;
    }
    if (!parsedGf || parsedGf < 2) {
      setErrorMsg('Grand Final size must be at least 2');
      return;
    }
    if (parsedGf > parsedTpg) {
      setErrorMsg(`Grand Final size cannot exceed district capacity (${parsedTpg})`);
      return;
    }

    if (hasExistingRoadmap && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onGenerate({
        mode: 'regenerate_all',
        draft_only: true,
        slotsTotal: parsedSlots,
        teams_per_group: parsedTpg,
        grand_final_teams: parsedGf,
        grandFinalTeams: parsedGf,
        number_of_days: parseInt(numberOfDays, 10) || 2,
        matches_per_day: parseInt(matchesPerDay, 10) || 2,
        first_match_time: firstMatchTime,
        match_gap_minutes: parseInt(matchGapMinutes, 10) || 60,
        match_duration_minutes: parseInt(matchDurationMinutes, 10) || 30,
      });

      if (res && res.success) {
        onClose();
      } else {
        const msg = res?.error || 'Failed to generate roadmap';
        setErrorMsg(msg);
        if (import.meta.env?.DEV) {
          console.warn('[Roadmap Generation Error] Modal step: onGenerate returned error', msg);
        }
      }
    } catch (err) {
      const msg = err.message || 'Server error occurred during generation';
      setErrorMsg(msg);
      if (import.meta.env?.DEV) {
        console.warn('[Roadmap Generation Error] Modal step: onGenerate threw exception', msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 ${theme.modalOverlay}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleRequestClose();
        }}
      >
        <motion.div
          ref={modalRef}
          tabIndex="-1"
          role="dialog"
          aria-modal="true"
          aria-labelledby="roadmap-setup-title"
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className={`w-full max-w-lg max-h-[88vh] sm:max-h-[85vh] flex flex-col rounded-2xl ${theme.modalBg} overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800`}
        >
          {/* FIXED HEADER */}
          <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-lg ${
                  theme.isGold ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                }`}
              >
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 id="roadmap-setup-title" className={`text-sm sm:text-base font-bold ${theme.headingText}`}>
                  Roadmap Setup & Generation
                </h3>
                <p className={`text-[11px] ${theme.mutedText}`}>
                  Set capacity rules to build automated stages and schedule
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRequestClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* UNSAVED CHANGES WARNING BANNER */}
          {showUnsavedWarning && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
              <span>You have unsaved changes. Discard and close?</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-2 py-0.5 rounded font-bold text-[11px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 hover:opacity-90"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnsavedWarning(false)}
                  className="px-2 py-0.5 rounded font-medium text-[11px] text-amber-800 dark:text-amber-300 hover:underline"
                >
                  Keep editing
                </button>
              </div>
            </div>
          )}

          {/* SCROLLABLE BODY */}
          <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4 space-y-3.5">
            {/* Capacity Mismatch Notification if any */}
            {capacityMismatch && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="leading-snug">
                  Tournament capacity is <strong>{capacityMismatch.current} teams</strong> (planned for {capacityMismatch.planned}). Generating will update stage sizing accordingly.
                </div>
              </div>
            )}

            {/* MINIMAL ESSENTIAL FIELDS: 2x2 GRID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Field 1: Total Teams (Slots) */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-blue-600" />
                  Total Teams (Slots)
                </label>
                <input
                  type="number"
                  min="2"
                  max="1024"
                  value={slotsTotal}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                    setSlotsTotal(val);
                    setErrorMsg('');
                  }}
                  className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 ${theme.inputBg}`}
                  placeholder="e.g. 128"
                />
              </div>

              {/* Field 2: Teams per District */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                  Teams Per District
                </label>
                <input
                  type="number"
                  min="2"
                  max="64"
                  value={teamsPerDistrict}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                    setTeamsPerDistrict(val);
                    setErrorMsg('');
                  }}
                  className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 ${theme.inputBg}`}
                  placeholder="e.g. 16"
                />
              </div>

              {/* Field 3: Grand Final Size */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-600" />
                  Grand Final Size
                </label>
                <input
                  type="number"
                  min="2"
                  max={parsedTpg || 64}
                  value={grandFinalTeams}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                    setGrandFinalTeams(val);
                    setErrorMsg('');
                  }}
                  className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 ${theme.inputBg}`}
                  placeholder="e.g. 16"
                />
              </div>

              {/* Field 4: Number of Days */}
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-purple-600" />
                  Number of Days
                </label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={numberOfDays}
                  onChange={(e) => {
                    const val = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                    setNumberOfDays(val);
                    setErrorMsg('');
                  }}
                  className={`w-full px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 ${theme.inputBg}`}
                  placeholder="e.g. 2"
                />
              </div>
            </div>

            {/* LIVE SUMMARY PROGRESSION LINE */}
            <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 block mb-1">
                Progression Preview
              </span>
              <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 flex-wrap">
                {liveSummary}
              </div>
            </div>

            {/* COLLAPSIBLE ADVANCED SECTION */}
            <details className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 transition-all">
              <summary className="px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer flex items-center justify-between select-none hover:text-slate-900 dark:hover:text-white">
                <span>Advanced Schedule Options</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-open:rotate-180 transition-transform" />
              </summary>
              <div className="p-3 pt-1 border-t border-slate-200/60 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block">Matches/Day</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={matchesPerDay}
                    onChange={(e) => setMatchesPerDay(parseInt(e.target.value, 10) || 2)}
                    className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block">Start Time</label>
                  <input
                    type="text"
                    value={firstMatchTime}
                    onChange={(e) => setFirstMatchTime(e.target.value)}
                    placeholder="13:00"
                    className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block">Match Gap</label>
                  <input
                    type="number"
                    min="15"
                    max="240"
                    value={matchGapMinutes}
                    onChange={(e) => setMatchGapMinutes(parseInt(e.target.value, 10) || 60)}
                    className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase block">Duration</label>
                  <input
                    type="number"
                    min="10"
                    max="180"
                    value={matchDurationMinutes}
                    onChange={(e) => setMatchDurationMinutes(parseInt(e.target.value, 10) || 30)}
                    className="w-full px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold bg-white dark:bg-slate-900"
                  />
                </div>
              </div>
            </details>

            {/* CONFIRMATION WARNING WHEN OVERWRITING */}
            {confirmOverwrite && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Existing Roadmap Will Be Replaced
                </div>
                <p className="text-[11px] leading-relaxed">
                  Generating now will replace your current rounds and matches with this fresh draft plan. Click Generate again to confirm.
                </p>
              </div>
            )}

            {/* DANGER ZONE (BOTTOM ROW, SMALL & OUTLINED) */}
            {hasExistingRoadmap && onDeleteRoadmap && (
              <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <span className="text-xs font-bold text-rose-700 dark:text-rose-400 block">Danger zone</span>
                  <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80">
                    Delete this entire roadmap and reset rounds to empty.
                  </span>
                </div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDelete(false);
                        onDeleteRoadmap();
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition cursor-pointer"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-100/60 dark:hover:bg-rose-900/30 border border-rose-300 dark:border-rose-800 transition shrink-0 cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Roadmap</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* FIXED FOOTER WITH EXACTLY 1 PRIMARY AND 1 SECONDARY BUTTON */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/90 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="min-h-[20px] flex items-center">
              {errorMsg ? (
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </span>
              ) : (
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Draft only • Does not mutate until saved
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRequestClose}
                disabled={isSubmitting || generating}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold min-h-[38px] ${theme.secondaryBtn} cursor-pointer disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateClick}
                disabled={isSubmitting || generating}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 min-h-[38px] cursor-pointer disabled:opacity-50 shadow-sm ${
                  confirmOverwrite
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : theme.primaryBtn
                }`}
              >
                {isSubmitting || generating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : confirmOverwrite ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Confirm & Overwrite</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Generate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
