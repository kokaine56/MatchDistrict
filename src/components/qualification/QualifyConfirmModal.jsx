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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-highest/20">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-on-surface">
                {isReRun ? 'Update Stage Qualification' : 'Confirm Stage Qualification'}
              </h3>
              <p className="text-xs text-on-surface-variant">
                Advancing teams to <span className="text-primary font-bold">{targetRoundName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          
          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/30 text-error text-sm flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Advancement Refused</div>
                <div className="text-xs text-error/90 mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Re-run Notice */}
          {isReRun && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <span>
                <strong>Re-run Warning:</strong> Re-advancing will overwrite earlier advancement assignments in {targetRoundName}. Earlier teams will be cleanly re-seeded.
              </span>
            </div>
          )}

          {/* Planned vs Selected Count Divergence */}
          {countMismatch && (
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
              <span>
                <strong>Plan Note:</strong> You have selected <strong>{selectedCount}</strong> team(s), whereas the roadmap plan configured <strong>{plannedCount}</strong>. Advancement will proceed with your custom selection of {selectedCount} team(s).
              </span>
            </div>
          )}

          {/* Unverified Matches Warning & Override Checkbox */}
          {!resultsComplete && (
            <div className="p-4 rounded-xl bg-error/10 border border-error/30 space-y-3">
              <div className="flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-error">
                    Unverified Match Results Detected
                  </h4>
                  <p className="text-xs text-error/90 mt-1">
                    {unverifiedCount > 0 ? `${unverifiedCount} match(es)` : 'Some matches'} in this round do not yet have verified scores. Advancing now without complete verified results may produce inaccurate seeds.
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-container border border-error/20 cursor-pointer hover:bg-surface-container-high transition-colors">
                <input
                  type="checkbox"
                  checked={allowUnverified}
                  onChange={(e) => setAllowUnverified(e.target.checked)}
                  className="w-4 h-4 rounded text-error focus:ring-error border-outline-variant bg-surface-container-lowest"
                />
                <span className="text-xs font-semibold text-error">
                  Advance anyway with unverified results (explicit override)
                </span>
              </label>
            </div>
          )}

          {/* Qualifying Teams List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Qualifying Teams ({qualifyingTeams.length})
              </h4>
              <span className="text-[11px] text-on-surface-variant font-medium">Destination</span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto p-1.5 bg-surface-container rounded-xl border border-outline-variant/15">
              {qualifyingTeams.length === 0 ? (
                <div className="p-4 text-center text-xs text-on-surface-variant">No teams selected to qualify.</div>
              ) : (
                qualifyingTeams.map((team, idx) => (
                  <div
                    key={team.team_id || idx}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/15 text-xs shadow-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-on-surface-variant w-5 text-right">{idx + 1}.</span>
                      <span className="font-bold text-on-surface">{team.team_name}</span>
                      {team.total_points != null && (
                        <span className="text-on-surface-variant text-[11px]">({team.total_points} pts)</span>
                      )}
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/15 border border-primary/25 text-primary">
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
              <h4 className="text-xs font-black uppercase tracking-wider text-error flex items-center gap-1.5 mb-2">
                <XCircle className="w-4 h-4" />
                Eliminated Teams ({eliminatedTeams.length})
              </h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto p-1.5 bg-surface-container rounded-xl border border-outline-variant/15">
                {eliminatedTeams.map((team, idx) => (
                  <div
                    key={team.team_id || idx}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/10 text-xs text-on-surface-variant"
                  >
                    <span className="font-medium text-on-surface">{team.team_name}</span>
                    <span className="text-[11px] text-error font-medium">Eliminated</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-outline-variant/20 bg-surface-container-highest/20">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high rounded-xl border border-outline-variant/20 transition-colors disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit || submitting || qualifyingTeams.length === 0}
            className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md cursor-pointer"
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
