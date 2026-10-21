import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  Trophy,
  Shield,
  ArrowRight,
  ArrowDown,
  HelpCircle,
  Layers,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import { planRoadmapStages } from '../../utils/roadmapPlanner';

export default function RoadmapSetupModal({
  isOpen,
  onClose,
  meta = {},
  hasExistingRoadmap = false,
  onGenerate,
  generating = false,
  cardColor = 'white',
}) {
  const slotsTotal = parseInt(meta.total_slots || meta.slotsTotal, 10) || 64;
  const teamsPerGroup = parseInt(meta.teams_per_group || meta.teams_per_district, 10) || 16;
  const initialGf = parseInt(meta.grand_final_teams || meta.grandFinalTeams, 10) || teamsPerGroup;

  const [grandFinalTeams, setGrandFinalTeams] = useState(initialGf);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const theme = getRoadmapTheme(cardColor);

  if (!isOpen) return null;

  const calculatedDistricts = Math.ceil(slotsTotal / teamsPerGroup);
  const capacityMismatch = meta.capacity_mismatch || null;

  // Derive pure live preview plan matching generator logic
  const previewStages = planRoadmapStages({
    slotsTotal,
    teamsPerDistrict: teamsPerGroup,
    grandFinalTeams,
  });

  const handleGenerateClick = () => {
    if (hasExistingRoadmap && !confirmOverwrite) {
      setConfirmOverwrite(true);
      return;
    }
    onGenerate({
      mode: 'regenerate_all',
      grandFinalTeams,
      grand_final_teams: grandFinalTeams,
    });
  };

  const handleGrandFinalChange = (val) => {
    const parsed = parseInt(val, 10);
    if (isNaN(parsed)) {
      setGrandFinalTeams(teamsPerGroup);
    } else {
      // Clamp between 2 and lobby capacity teamsPerGroup
      setGrandFinalTeams(Math.min(teamsPerGroup, Math.max(2, parsed)));
    }
  };

  return (
    <AnimatePresence>
      <div className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 ${theme.modalOverlay}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-2xl ${theme.modalBg} overflow-hidden shadow-2xl`}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl ${theme.isGold ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className={`text-base sm:text-lg font-bold ${theme.headingText}`}>
                  Roadmap Setup & Generation
                </h3>
                <p className={`text-xs ${theme.mutedText}`}>
                  Configure tournament capacity and automated progression plan
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

          {/* Scrollable Content Body */}
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
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
                      onGenerate({
                        mode: 'regenerate_all',
                        grandFinalTeams,
                        grand_final_teams: grandFinalTeams,
                      });
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
                  {calculatedDistricts} {calculatedDistricts === 1 ? 'district' : 'districts'}
                </span>
              </div>
              <p className={`text-xs ${theme.mutedText} max-w-sm mx-auto pt-1`}>
                The roadmap generates {calculatedDistricts} distinct competitive {calculatedDistricts === 1 ? 'lobby (district)' : 'lobbies (districts)'}, each accommodating up to {teamsPerGroup} teams.
              </p>
            </div>

            {/* Editable Teams in Grand Final Field */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                  <Trophy className="w-4 h-4 text-amber-600" />
                  Teams in Grand Final (F)
                </label>
                <span className="text-[11px] font-semibold text-slate-500">
                  Lobby Limit: <strong className="text-slate-700">{teamsPerGroup} teams</strong>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="2"
                  max={teamsPerGroup}
                  value={grandFinalTeams}
                  onChange={(e) => handleGrandFinalChange(e.target.value)}
                  className={`w-32 px-3.5 py-2 rounded-xl text-sm font-extrabold ${theme.inputBg}`}
                />
                <button
                  type="button"
                  onClick={() => setGrandFinalTeams(teamsPerGroup)}
                  disabled={grandFinalTeams === teamsPerGroup}
                  className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Reset to default ({teamsPerGroup})
                </button>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Rounds automatically calculate qualifiers so incoming teams smoothly funnel into this Grand Final lobby size without intermediate dead-ends.
              </p>
            </div>

            {/* Live Generated Plan Preview */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Live Plan Preview ({previewStages.length} {previewStages.length === 1 ? 'stage' : 'stages'})
                </span>
                <span className="text-[11px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  100% Qualifier Matched
                </span>
              </div>

              <div className="space-y-2">
                {previewStages.map((stg, sIdx) => {
                  const isGF = stg.isGrandFinal;
                  const distText = `${stg.districtCount} ${stg.districtCount === 1 ? 'district' : 'districts'}`;

                  return (
                    <React.Fragment key={stg.roundNumber}>
                      <div
                        className={`p-3 sm:p-3.5 rounded-xl border transition-all ${
                          isGF
                            ? 'bg-amber-50/70 border-amber-200 shadow-2xs'
                            : 'bg-white border-slate-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-6 h-6 rounded-lg text-xs font-black flex items-center justify-center ${
                                isGF ? 'bg-amber-600 text-white' : 'bg-slate-800 text-white'
                              }`}
                            >
                              {stg.roundNumber}
                            </span>
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 leading-tight">
                                {stg.name}
                              </h4>
                              <span className="text-[11px] text-slate-500 font-medium">
                                {stg.teamsIn} incoming teams • {distText}
                              </span>
                            </div>
                          </div>

                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase font-extrabold tracking-wider ${
                              isGF
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {isGF ? 'Grand Finals' : 'Qualifiers'}
                          </span>
                        </div>

                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs gap-1.5">
                          <div className="text-slate-600 font-medium">
                            {isGF ? (
                              <span className="text-amber-800 font-bold flex items-center gap-1">
                                <Trophy className="w-3.5 h-3.5" />
                                Championship Finale
                              </span>
                            ) : stg.advancementType === 'per_district' ? (
                              <span>
                                Top <strong className="text-slate-900 font-bold">{stg.teamsAdvancingPerDistrict}</strong> per district advance (<strong>{stg.teamsAdvancing} teams</strong>)
                              </span>
                            ) : (
                              <span>
                                Top <strong className="text-slate-900 font-bold">{stg.teamsAdvancing}</strong> overall leaderboard advance
                              </span>
                            )}
                          </div>
                          {!isGF && (
                            <span className="text-slate-400 text-[11px]">
                              {Math.max(0, stg.teamsIn - stg.teamsAdvancing)} eliminated
                            </span>
                          )}
                        </div>
                      </div>

                      {sIdx < previewStages.length - 1 && (
                        <div className="flex items-center justify-center py-0.5 text-slate-400">
                          <ArrowDown className="w-4 h-4 animate-bounce" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Core Principle Notice */}
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3 text-xs text-blue-900">
              <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                <strong>Pre-Tournament Plan:</strong> Generating a roadmap creates all rounds, days, districts, and start times immediately. You can generate and publish even with <strong>0 registrations</strong>.
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
                  An existing roadmap structure is currently configured. Generating a new roadmap will replace your customized rounds and district allocations with this {previewStages.length}-stage plan. Are you sure you want to proceed?
                </p>
              </motion.div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 p-4 border-t border-slate-200 bg-slate-50/80 shrink-0">
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
