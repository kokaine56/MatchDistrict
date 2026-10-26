import { useState } from 'react';
import { X, Save, AlertCircle, CheckCircle2, Trophy, Target, Loader2 } from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

export default function TeamScoreEditModal({
  isOpen,
  team,
  tournamentId,
  roundId = null,
  onClose,
  onSuccess,
}) {
  if (!isOpen || !team) return null;

  return (
    <TeamScoreEditModalInner
      key={team.team_id || team.id}
      team={team}
      tournamentId={tournamentId}
      roundId={roundId}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}

function TeamScoreEditModalInner({
  team,
  tournamentId,
  roundId,
  onClose,
  onSuccess,
}) {
  const [placementPoints, setPlacementPoints] = useState(
    team.total_placement_points != null ? String(team.total_placement_points) : '0'
  );
  const [killPoints, setKillPoints] = useState(
    team.total_kill_points != null ? String(team.total_kill_points) : '0'
  );
  const [totalKills, setTotalKills] = useState(
    team.total_kills != null ? String(team.total_kills) : '0'
  );
  const [matchesPlayed, setMatchesPlayed] = useState(
    team.matches_played != null ? String(team.matches_played) : '1'
  );
  const [wwcdCount, setWwcdCount] = useState(
    team.wwcd_count != null ? String(team.wwcd_count) : '0'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Auto-derived total points: placement_points + kill_points
  const pNum = parseInt(placementPoints, 10);
  const kNum = parseInt(killPoints, 10);
  const calculatedTotal = (isNaN(pNum) ? 0 : pNum) + (isNaN(kNum) ? 0 : kNum);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validate inputs
    const pVal = Number(placementPoints);
    if (!Number.isInteger(pVal) || pVal < 0 || pVal > 1000000) {
      setError('Placement points must be a whole number between 0 and 1,000,000.');
      return;
    }

    const kVal = Number(killPoints);
    if (!Number.isInteger(kVal) || kVal < 0 || kVal > 1000000) {
      setError('Kill points must be a whole number between 0 and 1,000,000.');
      return;
    }

    const killsVal = totalKills === '' ? kVal : Number(totalKills);
    if (!Number.isInteger(killsVal) || killsVal < 0 || killsVal > 1000000) {
      setError('Total kills must be a whole number between 0 and 1,000,000.');
      return;
    }

    const mpVal = matchesPlayed === '' ? 1 : Number(matchesPlayed);
    if (!Number.isInteger(mpVal) || mpVal < 0 || mpVal > 1000000) {
      setError('Matches played must be a whole number between 0 and 1,000,000.');
      return;
    }

    const wwcdVal = wwcdCount === '' ? 0 : Number(wwcdCount);
    if (!Number.isInteger(wwcdVal) || wwcdVal < 0 || wwcdVal > 1000000) {
      setError('WWCD count must be a whole number between 0 and 1,000,000.');
      return;
    }

    setSaving(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/teams/${team.team_id || team.id}/points`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          placement_points: pVal,
          kill_points: kVal,
          total_kills: killsVal,
          matches_played: mpVal,
          wwcd_count: wwcdVal,
          round_id: roundId || undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to update team points.');
      }

      setSuccessMsg('Points saved and standings recalculated.');
      setTimeout(() => {
        if (onSuccess) onSuccess(data);
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'An error occurred while saving points.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-lg bg-surface-container-low border border-outline-variant/30 rounded-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/20 bg-surface-container-highest/20">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-on-surface">
                Edit Team Score
              </h3>
              <p className="text-xs text-on-surface-variant">
                Team: <span className="font-bold text-on-surface">{team.team_name}</span> &bull; Captain: {team.leader_name || 'Captain'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Error Banner */}
          {error && (
            <div className="p-3.5 rounded-xl bg-error/10 border border-error/30 text-error text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Banner */}
          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Derived Total Points Banner */}
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-primary">
                Authoritative Total Points
              </div>
              <div className="text-[11px] text-on-surface-variant mt-0.5">
                Automatically calculated: Placement Pts + Kill Pts
              </div>
            </div>
            <div className="text-2xl font-black text-primary font-mono">
              {calculatedTotal} PTS
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            
            {/* Placement Points */}
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1">
                Placement Points <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="1000000"
                value={placementPoints}
                onChange={(e) => setPlacementPoints(e.target.value)}
                required
                disabled={saving}
                placeholder="e.g. 15"
                className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-on-surface text-sm font-bold focus:outline-none focus:border-primary transition"
              />
            </div>

            {/* Kill Points */}
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1">
                Kill Points <span className="text-error">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="1000000"
                value={killPoints}
                onChange={(e) => setKillPoints(e.target.value)}
                required
                disabled={saving}
                placeholder="e.g. 8"
                className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-on-surface text-sm font-bold focus:outline-none focus:border-primary transition"
              />
            </div>

            {/* Total Kills */}
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1 flex items-center gap-1">
                <Target className="w-3.5 h-3.5 text-rose-500" />
                <span>Total Kills</span>
              </label>
              <input
                type="number"
                min="0"
                max="1000000"
                value={totalKills}
                onChange={(e) => setTotalKills(e.target.value)}
                disabled={saving}
                placeholder="e.g. 8"
                className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-on-surface text-sm font-bold focus:outline-none focus:border-primary transition"
              />
            </div>

            {/* WWCD Count */}
            <div>
              <label className="block text-xs font-bold text-on-surface mb-1 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                <span>WWCD Wins</span>
              </label>
              <input
                type="number"
                min="0"
                max="1000000"
                value={wwcdCount}
                onChange={(e) => setWwcdCount(e.target.value)}
                disabled={saving}
                placeholder="0 or 1+"
                className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-on-surface text-sm font-bold focus:outline-none focus:border-primary transition"
              />
            </div>

            {/* Matches Played */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-on-surface mb-1">
                Matches Played
              </label>
              <input
                type="number"
                min="0"
                max="1000000"
                value={matchesPlayed}
                onChange={(e) => setMatchesPlayed(e.target.value)}
                disabled={saving}
                placeholder="1"
                className="w-full px-3 py-2 bg-surface-container border border-outline-variant/30 rounded-xl text-on-surface text-sm font-bold focus:outline-none focus:border-primary transition"
              />
              <p className="text-[10px] text-on-surface-variant mt-1">
                * Leaderboard rankings will automatically recalculate upon saving according to tournament tie-break rules.
              </p>
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-on-surface-variant hover:text-on-surface bg-surface-container hover:bg-surface-container-high rounded-xl border border-outline-variant/20 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 text-xs font-black uppercase tracking-wider text-on-primary bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all shadow-md cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving Points...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Points
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
