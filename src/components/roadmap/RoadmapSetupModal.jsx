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
          <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-500/20 text-amber-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${theme.headingText}`}>
                  Roadmap Setup & Generation
                </h3>
                <p className={`text-xs ${theme.mutedText}`}>
                  Configure tournament capacity and automated district plan
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            {/* Capacity Mismatch Warning if any */}
            {capacityMismatch && (
              <div className="p-4 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-amber-300">Tournament Capacity Changed</span>
                    <p className="mt-0.5 leading-relaxed">
                      Roadmap was built for <strong className="text-amber-100 font-bold">{capacityMismatch.planned}</strong> teams, but tournament capacity is now <strong className="text-amber-100 font-bold">{capacityMismatch.current}</strong> teams.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
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
            <div className={`p-5 rounded-xl ${theme.innerCardBg} border text-center space-y-2`}>
              <div className={`text-xs uppercase font-bold tracking-wider ${theme.mutedText}`}>
                Capacity Calculation
              </div>
              <div className={`text-xl sm:text-2xl font-black ${theme.headingText} flex items-center justify-center gap-2 flex-wrap`}>
                <span className="text-emerald-400">{slotsTotal} team slots</span>
                <span className="text-slate-500">/</span>
                <span className="text-blue-400">{teamsPerGroup} per district</span>
                <span className="text-slate-500">=</span>
                <span className={`px-2.5 py-0.5 rounded-lg ${theme.isGold ? 'bg-amber-500/20 text-amber-300' : 'bg-cyan-500/20 text-cyan-300'}`}>
                  {calculatedDistricts} districts
                </span>
              </div>
              <p className={`text-xs ${theme.mutedText} max-w-sm mx-auto pt-1`}>
                The roadmap generates {calculatedDistricts} distinct competitive lobbies (districts), each accommodating {teamsPerGroup} teams.
              </p>
            </div>

            {/* Core Principle Notice */}
            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/20 flex items-start gap-3 text-xs text-blue-200">
              <HelpCircle className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Pre-Tournament Plan:</strong> Generating a roadmap creates the rounds, days, districts, and start times. You can generate and publish even with <strong>0 registrations</strong>.
              </p>
            </div>

            {/* Confirmation Banner if Overwriting */}
            {confirmOverwrite && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-4 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs space-y-2"
              >
                <div className="flex items-center gap-2 font-bold text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Overwrite Confirmation Required
                </div>
                <p className="leading-relaxed">
                  An existing roadmap structure is currently configured. Generating a new roadmap will replace your customized rounds and district allocations. Are you sure you want to proceed?
                </p>
              </motion.div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700/50 bg-black/20">
            <button
              onClick={onClose}
              disabled={generating}
              className={`px-4 py-2.5 rounded-xl font-bold text-sm ${theme.secondaryBtn}`}
            >
              Cancel
            </button>
            <button
              onClick={handleGenerateClick}
              disabled={generating}
              className={`px-5 py-2.5 rounded-xl font-extrabold text-sm flex items-center gap-2 ${
                confirmOverwrite
                  ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/30'
                  : theme.primaryBtn
              }`}
            >
              {generating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : confirmOverwrite ? (
                <>
                  <AlertTriangle className="w-4 h-4" />
                  Confirm & Overwrite
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Roadmap
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
