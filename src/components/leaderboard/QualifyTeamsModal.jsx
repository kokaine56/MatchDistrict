import { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  X,
  AlertTriangle,
  ArrowRight,
  Loader2,
  ShieldAlert,
  HelpCircle,
  Layers,
  Compass,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';
import { detectCutoffTies } from '../qualification/qualificationLogic.js';

export default function QualifyTeamsModal({
  isOpen,
  tournamentId,
  sourceRound,
  targetRound,
  districts = [],
  selectedTeams = [],
  onClose,
  onSuccess,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [allowUnverified, setAllowUnverified] = useState(false);
  // Manual tie resolution selection: Map of { [cutoffSlot]: teamId }
  const [resolvedTieTeamIds, setResolvedTieTeamIds] = useState([]);

  const targetCapacity = targetRound?.teams_advancing || sourceRound?.teams_advancing || null;
  const isOverCapacity = targetCapacity != null && selectedTeams.length > targetCapacity;
  const targetRoundName = targetRound?.name || (targetRound?.round_number ? `Round ${targetRound.round_number}` : 'Next Round');
  const sourceRoundName = sourceRound?.name || (sourceRound?.round_number ? `Round ${sourceRound.round_number}` : 'Current Stage');

  // Detect ties at the qualification cutoff
  const tieCheck = useMemo(() => {
    if (!targetCapacity || selectedTeams.length <= targetCapacity) {
      return { hasTie: false, tiedTeams: [] };
    }
    return detectCutoffTies(selectedTeams, targetCapacity);
  }, [selectedTeams, targetCapacity]);

  // Scope: calculate saved vs unsaved districts
  const { savedDistricts, unsavedDistricts, hasPartialDistricts } = useMemo(() => {
    if (!Array.isArray(districts) || districts.length === 0) {
      return { savedDistricts: [], unsavedDistricts: [], hasPartialDistricts: false };
    }
    const saved = districts.filter((d) => d.scores_saved || d.scores_status === 'saved');
    const unsaved = districts.filter((d) => !d.scores_saved && d.scores_status !== 'saved');
    return {
      savedDistricts: saved,
      unsavedDistricts: unsaved,
      hasPartialDistricts: unsaved.length > 0 && saved.length > 0,
    };
  }, [districts]);

  // Determine final advancing team IDs taking tie resolution into account
  const effectiveAdvancingTeams = useMemo(() => {
    if (!targetCapacity || selectedTeams.length <= targetCapacity) {
      return selectedTeams;
    }
    if (tieCheck.hasTie && resolvedTieTeamIds.length > 0) {
      const nonTiedInside = selectedTeams.slice(0, targetCapacity - resolvedTieTeamIds.length);
      const chosenTied = selectedTeams.filter((t) => resolvedTieTeamIds.includes(t.team_id || t.id));
      return [...nonTiedInside, ...chosenTied];
    }
    return selectedTeams.slice(0, targetCapacity);
  }, [selectedTeams, targetCapacity, tieCheck, resolvedTieTeamIds]);

  if (!isOpen) return null;

  const handleToggleTieTeam = (teamId) => {
    setResolvedTieTeamIds((prev) => {
      if (prev.includes(teamId)) return prev.filter((id) => id !== teamId);
      // Only allow selecting up to needed tie slots
      const neededSlots = targetCapacity ? Math.max(1, targetCapacity - (selectedTeams.length - tieCheck.tiedTeams.length)) : 1;
      if (prev.length >= neededSlots) {
        return [...prev.slice(1), teamId];
      }
      return [...prev, teamId];
    });
  };

  const handleConfirm = async () => {
    if (effectiveAdvancingTeams.length === 0 || submitting) return;

    if (tieCheck.hasTie && resolvedTieTeamIds.length === 0) {
      setError('Please manually resolve the cutoff tie by selecting which tied team advances.');
      return;
    }

    if (isOverCapacity && !allowUnverified && resolvedTieTeamIds.length === 0) {
      setError(`Selected teams (${selectedTeams.length}) exceed target round capacity (${targetCapacity}). Please resolve the cutoff tie or reduce your selection.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const teamIds = effectiveAdvancingTeams.map((t) => t.team_id || t.id);

      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_round_id: sourceRound?.id,
          target_round_id: targetRound?.id,
          team_ids: teamIds,
          allow_unverified: allowUnverified,
          tie_resolutions: resolvedTieTeamIds,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to qualify teams.');
      }

      if (onSuccess) {
        onSuccess(data);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to qualify selected teams.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-highest/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-on-surface">
                Qualify Teams to Next Round
              </h3>
              <p className="text-xs text-on-surface-variant flex items-center gap-1.5 flex-wrap">
                <span>From <strong className="text-on-surface">{sourceRoundName}</strong></span>
                <ArrowRight className="w-3 h-3 text-primary" />
                <span>Advancing to <strong className="text-primary">{targetRoundName}</strong></span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          
          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-error/10 border border-error/30 text-error text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Advancement Notice</div>
                <div className="mt-0.5">{error}</div>
              </div>
            </div>
          )}

          {/* Roadmap Advancement Scope Info Card */}
          <div className="p-4 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Target Roadmap Stage
              </div>
              <div className="text-sm font-black text-on-surface flex items-center gap-2">
                <span>{targetRoundName}</span>
                {targetRound?.round_type && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {targetRound.round_type.replace('_', ' ')}
                  </span>
                )}
              </div>
            </div>
            <div className="text-left sm:text-right sm:border-l sm:border-outline-variant/20 sm:pl-4">
              <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                Advancement Scope
              </div>
              <div className="text-sm font-black text-primary font-mono mt-0.5">
                {effectiveAdvancingTeams.length} / {targetCapacity || '∞'} Teams
              </div>
            </div>
          </div>

          {/* Partial-Save Scope Warning */}
          {hasPartialDistricts && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2.5">
              <Compass className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <div className="font-bold flex items-center gap-1.5">
                  <span>Partial Qualification Scope</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black">
                    {savedDistricts.length}/{districts.length} Saved
                  </span>
                </div>
                <div className="mt-1 leading-relaxed">
                  Standings for {unsavedDistricts.length} district(s) (<strong>{unsavedDistricts.map((d) => d.name).join(', ')}</strong>) remain unsaved. Qualification will proceed with teams from the saved districts only and does not cover unsaved districts.
                </div>
              </div>
            </div>
          )}

          {/* Cutoff Tie Resolution Banner */}
          {tieCheck.hasTie && (
            <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-xs space-y-3">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-black text-on-surface">
                    Qualification Cutoff Tie Detected
                  </div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    Teams share identical scores across all 4 authoritative tie-break criteria. Select which team(s) you wish to qualify to fill the remaining cutoff slot:
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {tieCheck.tiedTeams.map((team) => {
                  const isChosen = resolvedTieTeamIds.includes(team.team_id || team.id);
                  return (
                    <button
                      key={team.team_id || team.id}
                      type="button"
                      onClick={() => handleToggleTieTeam(team.team_id || team.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                        isChosen
                          ? 'bg-primary/15 border-primary text-on-surface font-black shadow-sm'
                          : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                      }`}
                    >
                      <div>
                        <div className="font-black text-on-surface text-xs">{team.team_name}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">
                          {team.total_points ?? 0} PTS &bull; {team.total_kills ?? 0} Kills &bull; {team.wwcd_count ?? 0} WWCD
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                        isChosen
                          ? 'bg-primary border-primary text-on-primary'
                          : 'border-outline-variant/50 text-transparent'
                      }`}>
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Teams List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                Advancing Teams ({effectiveAdvancingTeams.length})
              </span>
              <span className="text-[11px] text-on-surface-variant">
                Total Points
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto p-1.5 bg-surface-container rounded-xl border border-outline-variant/15">
              {effectiveAdvancingTeams.map((team, idx) => (
                <div
                  key={team.team_id || team.id || idx}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low border border-outline-variant/15 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-on-surface-variant text-[11px] w-5">
                      #{team.rank ?? idx + 1}
                    </span>
                    <span className="font-black text-on-surface">
                      {team.team_name}
                    </span>
                    {team.district_name && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant font-bold">
                        {team.district_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-black text-primary font-mono text-xs">
                      {team.total_points ?? 0} PTS
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unverified Matches Override */}
          <label className="flex items-center gap-2.5 p-3 rounded-xl bg-surface-container border border-outline-variant/20 text-xs text-on-surface cursor-pointer hover:bg-surface-container-high transition">
            <input
              type="checkbox"
              checked={allowUnverified}
              onChange={(e) => setAllowUnverified(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant bg-surface-container cursor-pointer"
            />
            <span className="text-on-surface-variant">
              Allow qualification if some source matches have pending scores (override)
            </span>
          </label>

          <div className="p-3 bg-surface-container-highest/20 rounded-xl border border-outline-variant/15 text-[11px] text-on-surface-variant flex items-center gap-2">
            <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              Qualifying teams persists next-round allocations. Leaderboard publication remains a separate action.
            </span>
          </div>
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
            disabled={
              submitting ||
              effectiveAdvancingTeams.length === 0 ||
              (tieCheck.hasTie && resolvedTieTeamIds.length === 0) ||
              (isOverCapacity && !allowUnverified && resolvedTieTeamIds.length === 0)
            }
            className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Qualifying...</span>
              </>
            ) : (
              <>
                <span>Confirm Qualification ({effectiveAdvancingTeams.length})</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
