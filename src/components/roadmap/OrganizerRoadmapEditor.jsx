import React, { useState, useEffect } from 'react';
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
  HelpCircle,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import RoadmapPlanSummary from './RoadmapPlanSummary';
import RoadmapSetupModal from './RoadmapSetupModal';
import RoadmapRoundsManager from './RoadmapRoundsManager';
import RoadmapDaysDistricts from './RoadmapDaysDistricts';

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
}) {
  const theme = getRoadmapTheme(cardColor);

  // Local working copy of rounds
  const [workingRounds, setWorkingRounds] = useState(rounds);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [serverValidation, setServerValidation] = useState({ errors: [], warnings: [] });
  const [successBanner, setSuccessBanner] = useState(null);

  // Synchronize when server rounds change
  useEffect(() => {
    setWorkingRounds(rounds);
    setHasUnsavedChanges(false);
  }, [rounds]);

  // Track edits
  const handleUpdateRounds = (newRounds) => {
    setWorkingRounds(newRounds);
    setHasUnsavedChanges(true);
  };

  const handleUpdateDays = (newDays) => {
    const updated = workingRounds.map((r, i) =>
      i === selectedRoundIdx ? { ...r, days: newDays } : r
    );
    setWorkingRounds(updated);
    setHasUnsavedChanges(true);
  };

  // Safe Close
  const handleAttemptClose = () => {
    if (hasUnsavedChanges) {
      setShowLeaveWarning(true);
    } else if (onClose) {
      onClose();
    }
  };

  // Save Draft
  const handleSaveDraft = async () => {
    setServerValidation({ errors: [], warnings: [] });
    try {
      const res = await onSaveDraft({ rounds: workingRounds });
      if (res && res.success) {
        setHasUnsavedChanges(false);
        setSuccessBanner('Draft saved successfully.');
        setTimeout(() => setSuccessBanner(null), 4000);
      } else if (res && res.errors) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      }
    } catch (err) {
      setServerValidation({ errors: [err.message || 'Failed to save draft.'], warnings: [] });
    }
  };

  // Publish
  const handlePublish = async () => {
    setServerValidation({ errors: [], warnings: [] });
    try {
      const res = await onPublish({ rounds: workingRounds });
      if (res && res.success) {
        setHasUnsavedChanges(false);
        setSuccessBanner('Roadmap published successfully! Participants can now view the live schedule.');
        setTimeout(() => setSuccessBanner(null), 5000);
      } else if (res && res.errors) {
        setServerValidation({ errors: res.errors || [], warnings: res.warnings || [] });
      }
    } catch (err) {
      setServerValidation({ errors: [err.message || 'Failed to publish roadmap.'], warnings: [] });
    }
  };

  const currentRound = workingRounds[selectedRoundIdx] || workingRounds[0] || null;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5">
      {/* Top Action Header Bar */}
      <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} transition-all`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  isPublished ? theme.badgeSuccess : theme.badgeWarning
                }`}
              >
                {isPublished ? 'Live & Published' : 'Draft Mode'}
              </span>

              {hasUnsavedChanges && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                  Unsaved Changes
                </span>
              )}

              <span className={`text-xs font-mono uppercase px-2 py-0.5 rounded ${theme.badgeNeutral}`}>
                Game: {game}
              </span>
            </div>
            <h1 className={`text-xl sm:text-2xl font-black ${theme.headingText} tracking-tight`}>
              {tournamentTitle}
            </h1>
            <p className={`text-xs ${theme.mutedText} mt-0.5`}>
              Configure rounds, days, districts, and qualification rules before tournament start.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${theme.secondaryBtn}`}
              title="Open Setup Formula & Generator"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Setup / Generate
            </button>

            {onTogglePreview && (
              <button
                type="button"
                onClick={onTogglePreview}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${theme.secondaryBtn}`}
                title="Preview how participants see the schedule"
              >
                {previewMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {previewMode ? 'Exit Preview' : 'Participant Preview'}
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || publishing}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 ${theme.secondaryBtn} disabled:opacity-50`}
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>

            {isPublished ? (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={publishing || saving}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                title="Revert roadmap to draft (hidden from participants)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || saving}
                className={`px-5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 ${theme.primaryBtn} disabled:opacity-50`}
              >
                <Send className="w-3.5 h-3.5" />
                {publishing ? 'Publishing...' : 'Publish Roadmap'}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={handleAttemptClose}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer ml-auto sm:ml-0"
                title="Close Roadmap"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Capacity Warning Banner if slotsTotal changed */}
        {meta.capacity_mismatch && (
          <div className="mt-4 p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Roadmap was built for <strong>{meta.capacity_mismatch.planned}</strong> teams, but tournament capacity is now <strong>{meta.capacity_mismatch.current}</strong> teams.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSetupModal(true)}
                className={`px-3 py-1 rounded-lg text-xs font-bold ${theme.primaryBtn}`}
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
              className="mt-4 p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successBanner}</span>
              </div>
              <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {serverValidation.errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-4 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs space-y-1.5"
            >
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>Validation Errors (Preventing Publication):</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-rose-200/90 leading-relaxed">
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
              className="mt-3 p-3.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs space-y-1"
            >
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Advisory Notices:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px] text-amber-200/90 leading-relaxed">
                {serverValidation.warnings.map((warn, i) => (
                  <li key={i}>{warn}</li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Live Plan Summary Component */}
      <RoadmapPlanSummary
        rounds={workingRounds}
        meta={meta}
        cardColor={cardColor}
      />

      {/* Empty State when no rounds configured */}
      {workingRounds.length === 0 && (
        <div className={`p-8 sm:p-12 rounded-2xl ${theme.cardBg} text-center space-y-4`}>
          <div className={`w-16 h-16 rounded-2xl ${theme.accentBg} flex items-center justify-center mx-auto mb-2`}>
            <Sparkles className={`w-8 h-8 ${theme.accentText}`} />
          </div>
          <h3 className={`text-xl font-bold ${theme.headingText}`}>
            No Roadmap Generated Yet
          </h3>
          <p className={`text-xs sm:text-sm ${theme.mutedText} max-w-md mx-auto leading-relaxed`}>
            This tournament does not have any rounds planned yet. You can automatically generate a tournament schedule from your registered districts, or start manually by adding your first round.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className={`px-6 py-3 rounded-xl text-xs font-black flex items-center gap-2 ${theme.primaryBtn}`}
            >
              <Sparkles className="w-4 h-4" />
              Open Setup Formula & Generator
            </button>
            <button
              type="button"
              onClick={() => {
                const newRound = {
                  id: `RND-${Date.now()}`,
                  round_number: 1,
                  name: 'Round 1',
                  round_type: 'qualifier',
                  teams_in: 16,
                  advancement_type: 'per_district',
                  teams_advancing_per_district: 2,
                  teams_advancing: 16,
                  days: [{ id: `DAY-${Date.now()}`, day_number: 1, date: '', allocations: [] }],
                };
                handleUpdateRounds([newRound]);
                setSelectedRoundIdx(0);
              }}
              className={`px-5 py-3 rounded-xl text-xs font-bold flex items-center gap-2 ${theme.secondaryBtn}`}
            >
              <Layers className="w-4 h-4" />
              Start Manually (Add Round 1)
            </button>
          </div>
        </div>
      )}

      {/* Section 1: Rounds Management & Qualification Rules */}
      {workingRounds.length > 0 && (
        <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
          <div className="flex items-center gap-2 pb-2 border-b border-slate-700/40">
            <Layers className={`w-4 h-4 ${theme.accentText}`} />
            <h2 className={`text-base font-extrabold ${theme.headingText}`}>
              Tournament Rounds & Progression Rules
            </h2>
          </div>

          <RoadmapRoundsManager
            rounds={workingRounds}
            selectedRoundIdx={selectedRoundIdx}
            onSelectRound={setSelectedRoundIdx}
            onUpdateRounds={handleUpdateRounds}
            cardColor={cardColor}
          />
        </div>
      )}

      {/* Section 2: Days, Dates & District Allocations within Current Round */}
      {currentRound && (
        <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/40 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Settings className={`w-4 h-4 ${theme.accentText}`} />
              <h2 className={`text-base font-extrabold ${theme.headingText}`}>
                {currentRound.name || `Round ${currentRound.round_number}`} — Match Days & Districts
              </h2>
            </div>
            <span className={`text-xs ${theme.mutedText}`}>
              Assign which districts play on which day, adjust start times and select maps.
            </span>
          </div>

          <RoadmapDaysDistricts
            round={currentRound}
            roundIdx={selectedRoundIdx}
            allDistricts={districts}
            minSelectableDate={minSelectableDate}
            game={game}
            onUpdateDays={handleUpdateDays}
            cardColor={cardColor}
          />
        </div>
      )}

      {/* Setup / Generator Modal */}
      <RoadmapSetupModal
        isOpen={showSetupModal}
        onClose={() => setShowSetupModal(false)}
        meta={meta}
        hasExistingRoadmap={workingRounds.length > 0}
        onGenerate={() => {
          setShowSetupModal(false);
          onGenerate();
        }}
        generating={generating}
        cardColor={cardColor}
      />

      {/* Unsaved Changes Confirmation Dialog */}
      {showLeaveWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`w-full max-w-md p-6 rounded-2xl ${theme.modalBg} border shadow-2xl space-y-4`}
          >
            <div className="flex items-center gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className={`font-bold text-base ${theme.headingText}`}>
                Discard Unsaved Changes?
              </h3>
            </div>
            <p className={`text-xs ${theme.bodyText} leading-relaxed`}>
              You have unsaved edits in your roadmap. If you close now without saving draft or publishing, your modifications will be lost.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
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
                  if (onClose) onClose();
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white cursor-pointer"
              >
                Discard & Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
