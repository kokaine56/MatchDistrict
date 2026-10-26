import { useState, useMemo } from 'react';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';
import { detectCutoffTies } from '../qualification/qualificationLogic.js';
import BottomSheetModal from '../BottomSheetModal.jsx';

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
  if (!isOpen) return null;

  return (
    <QualifyTeamsModalInner
      isOpen={isOpen}
      tournamentId={tournamentId}
      sourceRound={sourceRound}
      targetRound={targetRound}
      districts={districts}
      selectedTeams={selectedTeams}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function QualifyTeamsModalInner({
  isOpen,
  tournamentId,
  sourceRound,
  targetRound,
  selectedTeams = [],
  onClose,
  onSuccess,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [allowUnverified, setAllowUnverified] = useState(false);
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

  const handleToggleTieTeam = (teamId) => {
    setResolvedTieTeamIds((prev) => {
      if (prev.includes(teamId)) return prev.filter((id) => id !== teamId);
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_round_id: sourceRound?.id,
          target_round_id: targetRound?.id,
          team_ids: teamIds,
          allow_unverified: allowUnverified,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to qualify teams.');
      }

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message || 'An error occurred while qualifying teams.');
    } finally {
      setSubmitting(false);
    }
  };

  const modalActions = (
    <div className="flex items-center justify-end gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high rounded-full border border-outline-variant/20 transition-colors disabled:opacity-50 cursor-pointer w-auto"
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
        className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-all shadow-md cursor-pointer w-auto"
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
  );

  return (
    <BottomSheetModal
      isOpen={isOpen}
      onClose={onClose}
      title="Qualify Teams to Next Stage"
      icon={<Users className="w-5 h-5 text-primary" />}
      actions={modalActions}
      maxWidth="max-w-xl"
    >
      <div className="space-y-4 py-2 text-xs">
        <p className="text-on-surface-variant">
          Stage: <strong className="text-on-surface">{sourceRoundName}</strong> &bull; Advancing to: <strong className="text-primary">{targetRoundName}</strong>
        </p>

        {error && (
          <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isOverCapacity && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-600 dark:text-amber-400 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Target Capacity Exceeded</span>
              <p className="text-[11px] text-on-surface-variant mt-0.5">
                Target round capacity is {targetCapacity} teams, but {selectedTeams.length} teams are selected.
              </p>
            </div>
          </div>
        )}

        {/* Cutoff Tie Resolution */}
        {tieCheck.hasTie && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-xs space-y-2.5">
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-black text-on-surface">Qualification Cutoff Tie Detected</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">
                  Teams share equal scores across all tie-break criteria. Select which team(s) advance:
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tieCheck.tiedTeams.map((team) => {
                const isChosen = resolvedTieTeamIds.includes(team.team_id || team.id);
                return (
                  <button
                    key={team.team_id || team.id}
                    type="button"
                    onClick={() => handleToggleTieTeam(team.team_id || team.id)}
                    className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                      isChosen
                        ? 'bg-primary/15 border-primary text-on-surface font-black shadow-sm'
                        : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-on-surface text-xs">{team.team_name}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">
                        {team.total_points ?? 0} PTS &bull; {team.total_kills ?? 0} Kills &bull; {team.wwcd_count ?? 0} WWCD
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 border ${
                      isChosen ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant/50'
                    }`}>
                      {isChosen && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Advancing Teams List */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              Advancing Teams ({effectiveAdvancingTeams.length})
            </span>
            <span className="text-[11px] text-on-surface-variant">Total Points</span>
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto p-1.5 bg-surface-container rounded-xl border border-outline-variant/15">
            {effectiveAdvancingTeams.map((team, idx) => (
              <div
                key={team.team_id || team.id || idx}
                className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/15 text-xs shadow-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-on-surface-variant text-[11px] w-5">
                    #{team.rank ?? idx + 1}
                  </span>
                  <span className="font-bold text-on-surface">
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
        <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-xs text-on-surface cursor-pointer hover:bg-surface-container-high transition">
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

        <div className="p-2.5 bg-surface-container-highest/20 rounded-xl border border-outline-variant/15 text-[11px] text-on-surface-variant flex items-center gap-2">
          <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0" />
          <span>
            Qualifying teams persists next-round allocations. Leaderboard publication remains a separate action.
          </span>
        </div>
      </div>
    </BottomSheetModal>
  );
}
