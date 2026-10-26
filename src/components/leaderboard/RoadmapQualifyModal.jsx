import { useState, useMemo, useEffect } from 'react';
import {
  Trophy,
  Users,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Compass,
  Layers,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';
import BottomSheetModal from '../BottomSheetModal.jsx';

export default function RoadmapQualifyModal({
  isOpen,
  tournamentId,
  sourceRound,
  targetRound,
  districts = [],
  currentDistrict = null,
  standings = [],
  onClose,
  onSuccess,
}) {
  if (!isOpen) return null;

  return (
    <RoadmapQualifyModalInner
      isOpen={isOpen}
      tournamentId={tournamentId}
      sourceRound={sourceRound}
      targetRound={targetRound}
      districts={districts}
      currentDistrict={currentDistrict}
      standings={standings}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function RoadmapQualifyModalInner({
  isOpen,
  tournamentId,
  sourceRound,
  targetRound,
  districts = [],
  currentDistrict = null,
  onClose,
  onSuccess,
}) {
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [previewData, setPreviewData] = useState(null);

  // Method: 'per_district' | 'overall' (comes from roadmap, Decision 4)
  const hasDistricts = Array.isArray(districts) && districts.length > 0;
  const [method, setMethod] = useState(
    sourceRound?.advancement_type || (hasDistricts ? 'per_district' : 'overall')
  );

  // Scope for per_district method: 'all' | 'single'
  const [districtScope, setDistrictScope] = useState('all');

  // Override count: Organizer may change count for this run only (Decision 4)
  const targetCapacity = targetRound?.teams_advancing || sourceRound?.teams_advancing || null;
  const defaultCount = useMemo(() => {
    if (method === 'per_district') {
      return Number(sourceRound?.teams_advancing_per_district) || 2;
    }
    return Number(targetCapacity) || Number(sourceRound?.teams_advancing) || 16;
  }, [method, sourceRound, targetCapacity]);

  const [overrideCount, setOverrideCount] = useState(defaultCount);
  const [resolvedTieTeamIds, setResolvedTieTeamIds] = useState([]);
  const [tieNotes, setTieNotes] = useState('');
  const [isProvisionalConfirmed, setIsProvisionalConfirmed] = useState(false);
  const [allowUnverified, setAllowUnverified] = useState(false);

  // Reset count when method changes
  useEffect(() => {
    setOverrideCount(defaultCount);
    setResolvedTieTeamIds([]);
  }, [defaultCount]);

  // Step 1: Fetch qualification preview (Decision 5: preview with no writes)
  const fetchPreview = async () => {
    if (!targetRound) return;
    setLoadingPreview(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/preview-qualify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_round_id: sourceRound?.id,
          target_round_id: targetRound?.id,
          method,
          override_count: overrideCount,
          district_scope: districtScope,
          district_id: districtScope === 'single' && currentDistrict ? currentDistrict.id : null,
          tie_resolutions: resolvedTieTeamIds,
          allow_unverified: allowUnverified,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to generate qualification preview.');
      }
      setPreviewData(data.preview);
    } catch (err) {
      setError(err.message || 'Error generating qualification preview.');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (isOpen && targetRound) {
      fetchPreview();
    }
  }, [isOpen, method, overrideCount, districtScope, currentDistrict, allowUnverified, resolvedTieTeamIds]);

  const handleToggleTieTeam = (teamId) => {
    setResolvedTieTeamIds((prev) => {
      if (prev.includes(teamId)) return prev.filter((id) => id !== teamId);
      return [...prev, teamId];
    });
  };

  // Step 2: Confirm qualification (Decision 5: confirm endpoint with transactional writes)
  const handleConfirm = async () => {
    if (!previewData) return;
    if (previewData.is_provisional && !isProvisionalConfirmed) {
      setError('Partial overall results are provisional. Please check the confirmation box below to allocate provisional qualifiers into the target round.');
      return;
    }
    if (previewData.has_cutoff_tie && resolvedTieTeamIds.length === 0) {
      setError('A true tie exists across all 4 criteria at the qualification cutoff. Please select which tied team(s) advance.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/confirm-qualify`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_round_id: previewData.source_round.id,
          target_round_id: previewData.target_round.id,
          method: previewData.method,
          override_count: previewData.configured_count,
          district_scope: districtScope,
          district_id: districtScope === 'single' && currentDistrict ? currentDistrict.id : null,
          tie_resolutions: resolvedTieTeamIds,
          is_provisional_confirmed: isProvisionalConfirmed,
          tie_notes: tieNotes || null,
          allow_unverified: allowUnverified,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to confirm qualification.');
      }

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      setError(err.message || 'Error confirming qualification.');
    } finally {
      setSubmitting(false);
    }
  };

  const targetRoundName = targetRound?.name || (targetRound?.round_number ? `Round ${targetRound.round_number}` : 'Next Round');
  const sourceRoundName = sourceRound?.name || (sourceRound?.round_number ? `Round ${sourceRound.round_number}` : 'Current Stage');

  const modalActions = (
    <div className="flex items-center justify-between w-full flex-wrap gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-4 py-2 rounded-full text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high border border-outline-variant/30 transition cursor-pointer disabled:opacity-50 w-auto"
      >
        Cancel
      </button>

      <button
        type="button"
        onClick={handleConfirm}
        disabled={submitting || loadingPreview || !previewData || previewData.qualifying_teams.length === 0 || previewData.is_over_capacity}
        className="px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-md flex items-center gap-2 cursor-pointer w-auto"
      >
        {submitting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Advancing Teams...</span>
          </>
        ) : (
          <>
            <Trophy className="w-3.5 h-3.5 text-amber-300" />
            <span>Confirm & Advance ({previewData?.qualifying_teams?.length || 0})</span>
          </>
        )}
      </button>
    </div>
  );

  return (
    <BottomSheetModal
      isOpen={true}
      onClose={onClose}
      title="Qualify to Next Round"
      icon={<Trophy className="w-5 h-5 text-amber-500" />}
      actions={modalActions}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 py-2 text-xs">
        {/* Source & Target Summary Banner */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/20 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span>Stage: <strong className="text-on-surface">{sourceRoundName}</strong></span>
            <ArrowRight className="w-3.5 h-3.5 text-primary" />
            <span>Advancing to: <strong className="text-primary">{targetRoundName}</strong></span>
            {targetCapacity && (
              <span className="text-[11px] font-mono text-on-surface-variant font-bold">
                ({targetCapacity} capacity)
              </span>
            )}
          </div>
          {previewData?.is_provisional && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              Provisional Results
            </span>
          )}
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-error/10 border border-error/25 text-error text-xs flex items-start gap-2.5 animate-in fade-in">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="font-bold flex-1">{error}</div>
          </div>
        )}

        {/* 1. Method Selection */}
        <div className="space-y-2">
          <div className="text-[11px] font-black uppercase tracking-wider text-on-surface flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-primary" />
            1. Qualification Method
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {hasDistricts && (
              <button
                type="button"
                onClick={() => setMethod('per_district')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer space-y-1.5 ${
                  method === 'per_district'
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
                }`}
              >
                <div className="flex items-center justify-between font-black text-on-surface">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-primary" />
                    Method A: Per District
                  </span>
                  {method === 'per_district' && <span className="w-2 h-2 rounded-full bg-primary" />}
                </div>
                <p className="text-[10px] text-on-surface-variant leading-relaxed">
                  Qualifies top eligible teams independently from each district based on district standings.
                </p>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMethod('overall')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer space-y-1.5 ${
                method === 'overall'
                  ? 'bg-primary/10 border-primary shadow-sm'
                  : 'bg-surface-container hover:bg-surface-container-high border-outline-variant/30 text-on-surface-variant'
              }`}
            >
              <div className="flex items-center justify-between font-black text-on-surface">
                <span className="flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Method B: Overall Standings
                </span>
                {method === 'overall' && <span className="w-2 h-2 rounded-full bg-primary" />}
              </div>
              <p className="text-[10px] text-on-surface-variant leading-relaxed">
                Combines eligible teams across the whole source round and qualifies the highest-ranked globally.
              </p>
            </button>
          </div>
        </div>

        {/* 2. Configured Count */}
        <div className="p-3.5 rounded-xl bg-surface-container border border-outline-variant/25 space-y-3">
          <div className="text-[11px] font-black uppercase tracking-wider text-on-surface flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            2. Configure Advancing Teams Count (Override for this run only)
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <label className="text-xs text-on-surface font-bold">
              {method === 'per_district' ? 'Teams advancing per district:' : 'Total teams advancing overall:'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={targetCapacity || 128}
                value={overrideCount}
                onChange={(e) => setOverrideCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-24 px-3 py-1.5 rounded-lg text-center font-black bg-surface-container-high border border-outline-variant/40 text-on-surface text-sm focus:outline-none focus:border-primary"
              />
              <span className="text-xs text-on-surface-variant font-bold">
                {method === 'per_district' ? 'teams / district' : 'teams overall'}
              </span>
            </div>
          </div>

          {method === 'per_district' && currentDistrict && (
            <div className="pt-2 border-t border-outline-variant/15 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-[11px] text-on-surface-variant font-medium">
                District scope:
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDistrictScope('all')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer w-auto ${
                    districtScope === 'all'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  All Districts ({districts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDistrictScope('single')}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition cursor-pointer w-auto ${
                    districtScope === 'single'
                      ? 'bg-primary text-on-primary shadow-xs'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Only {currentDistrict.name}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* District Readiness Status (Method A) */}
        {hasDistricts && previewData?.districts_summary?.length > 0 && (
          <div className="p-3 rounded-xl bg-surface-container border border-outline-variant/20 space-y-2">
            <div className="text-[11px] font-black uppercase text-on-surface">District Status Summary:</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {previewData.districts_summary.map((d) => (
                <div key={d.id} className="p-2 rounded-lg bg-surface-container-high border border-outline-variant/20 text-[10px]">
                  <div className="font-bold text-on-surface truncate">{d.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${d.is_ready ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                    <span className="capitalize">{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cutoff Tie Resolution */}
        {previewData?.has_cutoff_tie && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 text-xs space-y-3">
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400 font-bold">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-black text-on-surface">Qualification Cutoff Tie Detected</div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">
                  Teams share equal scores across all 4 criteria. Explicitly select which team(s) advance:
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {previewData.tied_teams.map((team) => {
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
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-on-surface mb-1">Tie resolution note (audit log):</label>
              <input
                type="text"
                value={tieNotes}
                onChange={(e) => setTieNotes(e.target.value)}
                placeholder="e.g. Host coin toss resolution or head-to-head match agreement"
                className="w-full px-3 py-1.5 bg-surface-container border border-outline-variant/30 rounded-lg text-on-surface text-xs focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        {/* Provisional Confirmation Checkbox (Decision 5) */}
        {previewData?.is_provisional && (
          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-on-surface cursor-pointer">
            <input
              type="checkbox"
              checked={isProvisionalConfirmed}
              onChange={(e) => setIsProvisionalConfirmed(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant bg-surface-container-high cursor-pointer mt-0.5"
            />
            <div className="space-y-0.5">
              <span className="font-bold text-amber-700 dark:text-amber-300">
                Confirm provisional qualification
              </span>
              <p className="text-[10px] text-on-surface-variant">
                Unsaved districts remain in the source round. Check this box to explicitly allocate these provisional qualifiers into the target round now.
              </p>
            </div>
          </label>
        )}

        {/* Advancing Teams Preview List */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-on-surface flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              3. Advancing Qualifiers Preview ({previewData?.qualifying_teams?.length || 0})
            </span>
            {targetCapacity && (
              <span className={`text-[11px] font-mono font-bold ${
                previewData?.is_over_capacity ? 'text-error' : 'text-on-surface-variant'
              }`}>
                {previewData?.qualifying_teams?.length || 0} / {targetCapacity} capacity
              </span>
            )}
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto p-1.5 bg-surface-container rounded-xl border border-outline-variant/15">
            {loadingPreview ? (
              <div className="py-8 flex items-center justify-center gap-2 text-on-surface-variant text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Computing authoritative qualification preview...</span>
              </div>
            ) : !previewData || previewData.qualifying_teams.length === 0 ? (
              <div className="py-8 text-center text-on-surface-variant text-xs">
                No eligible teams qualified for current parameters.
              </div>
            ) : (
              previewData.qualifying_teams.map((team, idx) => (
                <div
                  key={team.team_id || idx}
                  className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-surface-container-low border border-outline-variant/15 text-xs shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-on-surface-variant text-[11px] w-6">
                      #{team.rank ?? idx + 1}
                    </span>
                    <span className="font-bold text-on-surface truncate max-w-[180px] sm:max-w-xs">
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
              ))
            )}
          </div>
        </div>

        {/* Unverified matches override option */}
        <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 text-xs text-on-surface cursor-pointer hover:bg-surface-container-high transition">
          <input
            type="checkbox"
            checked={allowUnverified}
            onChange={(e) => setAllowUnverified(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary border-outline-variant bg-surface-container-high cursor-pointer"
          />
          <span className="text-[11px] text-on-surface-variant">
            Allow qualification even if some source matches have pending unverified score submissions
          </span>
        </label>
      </div>
    </BottomSheetModal>
  );
}
