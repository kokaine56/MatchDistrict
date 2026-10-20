// src/components/qualification/QualifyConfirmModal.jsx
import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowRight,
  Loader2,
  X,
  Users,
} from 'lucide-react';

export default function QualifyConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  targetRoundName = 'Next Round',
  qualifyingTeams = [],
  eliminatedTeams = [],
  plannedCount = 0,
  selectedCount = 0,
  resultsComplete = true,
  unverifiedCount = 0,
  isReRun = false,
  submitting = false,
  error = null,
}) {
  const [allowUnverified, setAllowUnverified] = useState(false);

  if (!isOpen) return null;

  const countMismatch = selectedCount !== plannedCount;
  const canSubmit = resultsComplete || allowUnverified;

  const handleConfirm = () => {
    if (!canSubmit || submitting) return;
    onConfirm({ allowUnverified });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0E1117] border border-white/10 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {isReRun ? 'Update Qualification' : 'Confirm Stage Qualification'}
              </h3>
              <p className="text-xs text-slate-400">
                Advancing teams to <span className="text-indigo-400 font-semibold">{targetRoundName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          
          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Advancement Refused</div>
                <div className="text-xs text-red-300 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Re-run Notice */}
          {isReRun && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <span>
                <strong>Re-run Warning:</strong> Re-advancing will overwrite earlier advancement assignments in {targetRoundName}. Earlier teams will be cleanly re-seeded.
              </span>
            </div>
          )}

          {/* Planned vs Selected Count Divergence */}
          {countMismatch && (
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" />
              <span>
                <strong>Plan Note:</strong> You have selected <strong>{selectedCount}</strong> team(s), whereas the roadmap plan configured <strong>{plannedCount}</strong>. Advancement will proceed with your custom selection of {selectedCount} team(s).
              </span>
            </div>
          )}

          {/* Unverified Matches Warning & Override Checkbox */}
          {!resultsComplete && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-rose-300">
                    Unverified Match Results Detected
                  </h4>
                  <p className="text-xs text-rose-400/90 mt-1">
                    {unverifiedCount > 0 ? `${unverifiedCount} match(es)` : 'Some matches'} in this round do not yet have verified scores. Advancing now without complete verified results may produce inaccurate seeds.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-3 p-2.5 rounded-lg bg-black/40 border border-rose-500/20 cursor-pointer hover:bg-black/60 transition-colors">
                <input
                  type="checkbox"
                  checked={allowUnverified}
                  onChange={(e) => setAllowUnverified(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-500 focus:ring-rose-500 border-white/20 bg-black/50"
                />
                <span className="text-xs font-semibold text-rose-200">
                  Advance anyway with unverified results (explicit override)
                </span>
              </label>
            </div>
          )}

          {/* Qualifying Teams List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Qualifying Teams ({qualifyingTeams.length})
              </h4>
              <span className="text-[11px] text-slate-400 font-medium">Destination</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto p-1 bg-black/30 rounded-xl border border-white/5">
              {qualifyingTeams.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">No teams selected to qualify.</div>
              ) : (
                qualifyingTeams.map((team, idx) => (
                  <div
                    key={team.team_id || idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-500/[0.04] border border-emerald-500/10 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-400 w-5 text-right">{idx + 1}.</span>
                      <span className="font-bold text-white">{team.team_name}</span>
                      {team.total_points != null && (
                        <span className="text-slate-400 text-[11px]">({team.total_points} pts)</span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
                      {team.districtName || 'Target Stage'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Eliminated Teams List */}
          {eliminatedTeams.length > 0 && (
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5 mb-2">
                <XCircle className="w-4 h-4" />
                Eliminated Teams ({eliminatedTeams.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto p-1 bg-black/30 rounded-xl border border-white/5">
                {eliminatedTeams.map((team, idx) => (
                  <div
                    key={team.team_id || idx}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-rose-500/[0.03] border border-rose-500/10 text-xs text-slate-400"
                  >
                    <span className="font-medium text-slate-300">{team.team_name}</span>
                    <span className="text-[11px] text-rose-400/80">Eliminated</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-white/[0.02]">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit || submitting || qualifyingTeams.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-lg shadow-indigo-600/30"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Advancing...
              </>
            ) : (
              <>
                <span>{isReRun ? 'Update Qualification' : 'Advance Teams'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
