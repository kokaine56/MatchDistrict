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
  Trash2,
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
  onDeleteRoadmap,
  deleting = false,
}) {
  const theme = getRoadmapTheme(cardColor);

  // Local working copy of rounds
  const [workingRounds, setWorkingRounds] = useState(rounds);
  const [selectedRoundIdx, setSelectedRoundIdx] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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
        setSuccessBanner('Roadmap published successfully! Participants can now view the match schedule.');
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
    <div className="w-full max-w-5xl mx-auto space-y-4 sm:space-y-5 px-1 sm:px-0">
      {/* Top Action Header Bar */}
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
                  Unsaved Changes
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

          {/* Action Buttons: Responsive Grid on Mobile, Flex on Desktop */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowSetupModal(true)}
              className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.secondaryBtn}`}
              title="Open Setup Formula & Generator"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Setup / Generate</span>
            </button>

            {onTogglePreview && (
              <button
                type="button"
                onClick={onTogglePreview}
                className={`px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.secondaryBtn}`}
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
              className={`px-4 py-2 sm:py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.secondaryBtn} disabled:opacity-50`}
            >
              <Save className="w-3.5 h-3.5 shrink-0" />
              <span>{saving ? 'Saving...' : 'Save Draft'}</span>
            </button>

            {isPublished ? (
              <button
                type="button"
                onClick={onUnpublish}
                disabled={publishing || saving}
                className="px-3.5 py-2 sm:py-1.5 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 min-h-[38px] transition shadow-xs"
                title="Revert roadmap to draft (hidden from participants)"
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                <span>Unpublish</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePublish}
                disabled={publishing || saving}
                className={`col-span-2 sm:col-span-1 px-4 sm:px-5 py-2 sm:py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 min-h-[38px] ${theme.primaryBtn} disabled:opacity-50`}
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
                className="col-span-2 sm:col-span-1 px-3 py-2 sm:py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5 min-h-[38px] transition shadow-xs"
                title="Delete entire roadmap and reset"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>Delete Roadmap</span>
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={handleAttemptClose}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer ml-auto sm:ml-0 hidden sm:inline-flex"
                title="Close Roadmap"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

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
              <button onClick={() => setSuccessBanner(null)} className="text-emerald-700 hover:text-emerald-900 p-1">
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

      {/* Plan Summary Card */}
      <RoadmapPlanSummary
        rounds={workingRounds}
        meta={meta}
        cardColor={cardColor}
      />

      {/* Section 1: Rounds Management & Qualification Rules */}
      {workingRounds.length > 0 && (
        <div className={`p-4 sm:p-6 rounded-2xl ${theme.cardBg} space-y-4`}>
          <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200">
            <Layers className={`w-4 h-4 ${theme.accentText}`} />
            <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
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
          <div className="flex items-start sm:items-center justify-between pb-2.5 border-b border-slate-200 flex-col sm:flex-row gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2">
              <Settings className={`w-4 h-4 ${theme.accentText}`} />
              <h2 className={`text-sm sm:text-base font-extrabold ${theme.headingText}`}>
                {currentRound.name || `Round ${currentRound.round_number}`} — Match Days & Districts
              </h2>
            </div>
            <span className={`text-[11px] sm:text-xs ${theme.mutedText}`}>
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
