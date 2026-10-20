import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, AlertTriangle, RefreshCw, CheckCircle, HelpCircle, Layers, Users } from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';

export default function RoadmapSetupModal({
  isOpen,
  onClose,
  meta = {},
  hasExistingRoadmap = false,
  onGenerate,
  generating = false,
  cardColor = 'white',
}) {
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const theme = getRoadmapTheme(cardColor);

  if (!isOpen) return null;

  const slotsTotal = parseInt(meta.total_slots || meta.slotsTotal, 10) || 64;
  const teamsPerGroup = parseInt(meta.teams_per_group || meta.teams_per_district, 10) || 16;
  const calculatedDistricts = Math.ceil(slotsTotal / teamsPerGroup);

  const capacityMismatch = meta.capacity_mismatch || null;

  const handleGenerateClick = () => {
    if (hasExistingRoadmap && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    onGenerate();
  };

  return (
    <AnimatePresence>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.modalOverlay}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={`w-full max-w-lg rounded-2xl ${theme.modalBg} overflow-hidden shadow-2xl`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base sm:text-lg font-bold ${theme.headingText}`}>
                  Roadmap Setup & Generation
                </h3>
                <p className={`text-xs ${theme.mutedText}`}>
                  Configure tournament capacity and automated district plan
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Capacity Mismatch Warning if any */}
            {capacityMismatch && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-800">Tournament Capacity Changed</span>
                    <p className="mt-0.5 leading-relaxed">
                      Roadmap was built for <strong className="text-amber-950 font-bold">{capacityMismatch.planned}</strong> teams, but tournament capacity is now <strong className="text-amber-950 font-bold">{capacityMismatch.current}</strong> teams.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      setConfirmOverwrite(true);
                      onGenerate();
                    }}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs ${theme.primaryBtn}`}
                  >
                    Rebuild for {capacityMismatch.current} Teams
                  </button>
                  <button
                    onClick={onClose}
                    className={`px-3 py-1.5 rounded-lg font-semibold text-xs ${theme.secondaryBtn}`}
                  >
                    Keep Existing Roadmap
                  </button>
                </div>
              </div>
            )}

            {/* Formula Card */}
            <div className={`p-4 sm:p-5 rounded-xl ${theme.innerCardBg} border border-slate-200 text-center space-y-2`}>
              <div className={`text-xs uppercase font-bold tracking-wider ${theme.mutedText}`}>
                Capacity Calculation
              </div>
              <div className={`text-xl sm:text-2xl font-black ${theme.headingText} flex items-center justify-center gap-2 flex-wrap`}>
                <span className="text-emerald-600 font-extrabold">{slotsTotal} team slots</span>
                <span className="text-slate-400">/</span>
                <span className="text-blue-600 font-extrabold">{teamsPerGroup} per district</span>
                <span className="text-slate-400">=</span>
                <span className={`px-2.5 py-0.5 rounded-lg ${theme.isGold ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                  {calculatedDistricts} districts
                </span>
              </div>
              <p className={`text-xs ${theme.mutedText} max-w-sm mx-auto pt-1`}>
                The roadmap generates {calculatedDistricts} distinct competitive lobbies (districts), each accommodating {teamsPerGroup} teams.
              </p>
            </div>

            {/* Core Principle Notice */}
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3 text-xs text-blue-900">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Pre-Tournament Plan:</strong> Generating a roadmap creates the rounds, days, districts, and start times. You can generate and publish even with <strong>0 registrations</strong>.
              </p>
            </div>

            {/* Confirmation Banner if Overwriting */}
            {confirmOverwrite && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2"
              >
                <div className="flex items-center gap-2 font-bold text-rose-700">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  Overwrite Confirmation Required
                </div>
                <p className="leading-relaxed">
                  An existing roadmap structure is currently configured. Generating a new roadmap will replace your customized rounds and district allocations. Are you sure you want to proceed?
                </p>
              </motion.div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 p-4 border-t border-slate-200 bg-slate-50/80">
            <button
              onClick={onClose}
              disabled={generating}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-bold text-sm min-h-[40px] ${theme.secondaryBtn}`}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateClick}
              disabled={generating}
              className={`w-full sm:w-auto px-5 py-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 min-h-[40px] ${
                confirmOverwrite
                  ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20'
                  : theme.primaryBtn
              }`}
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : confirmOverwrite ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  <span>Confirm & Overwrite</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Roadmap</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
