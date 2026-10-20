// src/components/qualification/TeamDisqualifyModal.jsx
// Confirmation modal for tournament organizers/admins to disqualify or reinstate a team.
// Explains that existing results and points stay untouched; only cutoff eligibility changes.

import React, { useState } from 'react';
import { Ban, RotateCcw, AlertTriangle, X, CheckCircle2, Lock } from 'lucide-react';

export default function TeamDisqualifyModal({
  isOpen,
  onClose,
  team,
  tournamentId,
  onSuccess,
}) {
  if (!isOpen || !team) return null;

  const isCurrentlyDq = team.status === 'disqualified' || team.is_disqualified;
  const targetAction = isCurrentlyDq ? 'reinstate' : 'disqualify';
  const targetStatus = isCurrentlyDq ? 'verified' : 'disqualified';

  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [serverWarning, setServerWarning] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setServerWarning(null);

    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${team.team_id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: targetStatus,
          reason: reason.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || `Failed to ${targetAction} team.`);
      }

      if (data.warning) {
        setServerWarning(data.warning);
        setTimeout(() => {
          onSuccess(data);
          onClose();
        }, 2500);
      } else {
        onSuccess(data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0E121A] border border-white/10 rounded-3xl shadow-2xl overflow-hidden p-6 text-white space-y-6">
        
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isCurrentlyDq ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
              {isCurrentlyDq ? <RotateCcw className="w-6 h-6" /> : <Ban className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-lg font-black tracking-wide">
                {isCurrentlyDq ? 'Reinstate Team' : 'Disqualify Team'}
              </h3>
              <p className="text-xs text-slate-400">
                {team.team_name} {team.leader_name ? `• Leader: ${team.leader_name}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational callout */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 text-xs space-y-2">
          {isCurrentlyDq ? (
            <p className="text-slate-300 leading-relaxed">
              Reinstating <strong className="text-white">{team.team_name}</strong> will restore their eligibility to qualify for upcoming tournament rounds.
            </p>
          ) : (
            <>
              <p className="text-slate-300 leading-relaxed">
                Disqualifying <strong className="text-white">{team.team_name}</strong> excludes them from qualifying to future rounds.
              </p>
              <p className="text-amber-400/90 font-medium">
                Note: Existing match results, kills, and points remain recorded on the public leaderboard. Only qualification and advancement eligibility are revoked.
              </p>
            </>
          )}

          {/* Warning for already-advanced teams */}
          {!isCurrentlyDq && team.is_advanced && (
            <div className="mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
              <div className="text-[11px] leading-relaxed">
                <strong>Attention:</strong> This team was already advanced into a target round. Disqualifying them does not automatically delete match assignments. Please re-run round qualification from the Qualify panel to replace them.
              </div>
            </div>
          )}
        </div>

        {/* Server warning notice */}
        {serverWarning && (
          <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
            <p className="leading-relaxed font-medium">{serverWarning}</p>
          </div>
        )}

        {/* Error notice */}
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider">
              Reason (Optional, logged to audit trail)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isCurrentlyDq ? 'e.g. Penalty cleared, appeal approved' : 'e.g. Rule violation, no show, roster tampering'}
              className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || Boolean(serverWarning)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                isCurrentlyDq
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <span>Processing...</span>
              ) : isCurrentlyDq ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm Reinstatement
                </>
              ) : (
                <>
                  <Ban className="w-4 h-4" />
                  Confirm Disqualification
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
