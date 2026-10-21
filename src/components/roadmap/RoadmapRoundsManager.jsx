import { Plus, Trash2, ChevronUp, ChevronDown, Trophy, Shield, HelpCircle, AlertTriangle, ArrowRight, Lock } from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import { syncAutoDistrictsForLaterRounds } from '../../utils/roadmapAutoDistricts.js';

export default function RoadmapRoundsManager({
  rounds = [],
  selectedRoundIdx = 0,
  onSelectRound,
  onUpdateRounds,
  cardColor = 'white',
  meta = {},
  slotsTotal: propSlotsTotal,
  validationErrors = [],
  validationWarnings = [],
}) {
  const theme = getRoadmapTheme(cardColor);

  const slotsTotal = Number(propSlotsTotal || meta.total_slots || meta.slotsTotal || (rounds[0]?.teams_in) || 64);
  const registeredCount = Number(meta.total_teams ?? meta.registeredCount ?? meta.registered_teams ?? 0);
  const teamsPerGroup = Number(meta.teams_per_group || 16);

  const activeRound = rounds[selectedRoundIdx] || rounds[0] || null;

  const syncAndNotify = (candidateRounds) => {
    const copy = JSON.parse(JSON.stringify(candidateRounds || []));
    syncAutoDistrictsForLaterRounds({ rounds: copy }, { teams_per_group: teamsPerGroup, slotsTotal, forceAutoTeamsIn: true });
    onUpdateRounds(copy);
  };

  // Add Round
  const handleAddRound = () => {
    const nextNum = rounds.length + 1;
    // Any previous round that was grand_final becomes qualifier since Grand Finals must be the terminal round
    const sanitizedPrev = rounds.map((r) => {
      if (r.round_type === 'grand_final') {
        return {
          ...r,
          round_type: 'qualifier',
          advancement_type: r.advancement_type || 'per_district',
          teams_advancing_per_district: r.teams_advancing_per_district || 2,
          teams_advancing: r.teams_advancing || 16,
        };
      }
      return r;
    });

    const newRound = {
      id: `RND-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      round_number: nextNum,
      name: `Round ${nextNum}`,
      round_type: 'qualifier',
      teams_in: 16,
      advancement_type: 'per_district',
      teams_advancing_per_district: 2,
      teams_advancing: 16,
      days: [
        {
          id: `DAY-${Date.now()}`,
          day_number: 1,
          date: '',
          allocations: [],
        },
      ],
    };

    const updated = [...sanitizedPrev, newRound];
    syncAndNotify(updated);
    onSelectRound(updated.length - 1);
  };

  // Remove Round
  const handleRemoveRound = (idx) => {
    if (rounds.length <= 1) return;
    const updated = rounds
      .filter((_, i) => i !== idx)
      .map((r, i, arr) => {
        // If a grand_final was somehow not the last round, make sure only the last can be grand_final
        if (r.round_type === 'grand_final' && i !== arr.length - 1) {
          return {
            ...r,
            round_number: i + 1,
            round_type: 'qualifier',
            advancement_type: r.advancement_type || 'per_district',
            teams_advancing_per_district: r.teams_advancing_per_district || 2,
            teams_advancing: r.teams_advancing || 16,
          };
        }
        return { ...r, round_number: i + 1 };
      });
    syncAndNotify(updated);
    onSelectRound(Math.max(0, idx - 1));
  };

  // Move Round Up/Down
  const handleMoveRound = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= rounds.length) return;

    const copy = [...rounds];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;

    const renumbered = copy.map((r, i, arr) => {
      const isLast = i === arr.length - 1;
      if (r.round_type === 'grand_final' && !isLast) {
        return {
          ...r,
          round_number: i + 1,
          round_type: 'qualifier',
          advancement_type: r.advancement_type || 'per_district',
          teams_advancing_per_district: r.teams_advancing_per_district || 2,
          teams_advancing: r.teams_advancing || 16,
        };
      }
      return { ...r, round_number: i + 1 };
    });
    syncAndNotify(renumbered);
    onSelectRound(targetIdx);
  };

  // Field change on active round
  const handleUpdateActiveField = (field, value) => {
    if (!activeRound) return;
    if (field === 'round_type' && value === 'grand_final' && selectedRoundIdx !== rounds.length - 1) {
      return;
    }
    const updated = rounds.map((r, idx) => {
      if (idx !== selectedRoundIdx) {
        if (field === 'round_type' && value === 'grand_final' && r.round_type === 'grand_final') {
          return {
            ...r,
            round_type: 'qualifier',
            advancement_type: r.advancement_type || 'per_district',
            teams_advancing_per_district: r.teams_advancing_per_district || 2,
            teams_advancing: r.teams_advancing || 16,
          };
        }
        return r;
      }
      const modified = { ...r, [field]: value };

      // If toggled to grand_final, clear advancement rules
      if (field === 'round_type' && value === 'grand_final') {
        modified.advancement_type = null;
        modified.teams_advancing = null;
        modified.teams_advancing_per_district = null;
        modified.advancement_target_round_id = null;
      }
      return modified;
    });
    syncAndNotify(updated);
  };

  return (
    <div className="space-y-4">
      {/* Round Tabs Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar flex-nowrap sm:flex-wrap pb-1 sm:pb-0">
          {rounds.map((round, idx) => {
            const isSelected = idx === selectedRoundIdx;
            const isGF = round.round_type === 'grand_final';
            return (
              <div key={round.id || idx} className="flex items-center shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectRound(idx)}
                  className={`px-3 sm:px-3.5 py-2 sm:py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer min-h-[36px] sm:min-h-0 ${
                    isSelected ? theme.activeTabBg : theme.inactiveTabBg
                  }`}
                >
                  {isGF && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                  <span className="whitespace-nowrap">{round.name || `Round ${round.round_number || idx + 1}`}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${isSelected ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {round.teams_in ? `${round.teams_in}T` : 'Plan'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddRound}
          className={`px-3 py-2 sm:py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 self-start sm:self-auto min-h-[36px] sm:min-h-0 ${theme.secondaryBtn}`}
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Round</span>
        </button>
      </div>

      {/* Selected Round Settings Form */}
      {activeRound && (
        <div className="space-y-4 pt-1">
          {/* Round Header & Reordering */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${theme.mutedText}`}>
                Configuring Round {activeRound.round_number || selectedRoundIdx + 1}
              </span>
            </div>

            <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={selectedRoundIdx === 0}
                  onClick={() => handleMoveRound(selectedRoundIdx, -1)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 shadow-2xs disabled:opacity-30 cursor-pointer flex items-center gap-1 min-h-[32px]"
                  title="Move round earlier"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  Earlier
                </button>
                <button
                  type="button"
                  disabled={selectedRoundIdx === rounds.length - 1}
                  onClick={() => handleMoveRound(selectedRoundIdx, 1)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 shadow-2xs disabled:opacity-30 cursor-pointer flex items-center gap-1 min-h-[32px]"
                  title="Move round later"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                  Later
                </button>
              </div>

              {rounds.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveRound(selectedRoundIdx)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition cursor-pointer flex items-center gap-1 min-h-[32px]"
                  title="Delete this round"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Round
                </button>
              )}
            </div>
          </div>

          {/* Form Inputs Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {/* Round Name */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                Round Name (Rename)
              </label>
              <input
                type="text"
                placeholder="e.g. Qualifiers 1, Semi-Finals, Grand Finals"
                value={activeRound.name || ''}
                onChange={(e) => handleUpdateActiveField('name', e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-bold ${theme.inputBg}`}
              />
            </div>

            {/* Round Type */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                Round Stage Type
              </label>
              <select
                value={activeRound.round_type === 'grand_final' && selectedRoundIdx === rounds.length - 1 ? 'grand_final' : 'qualifier'}
                onChange={(e) => handleUpdateActiveField('round_type', e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold ${theme.inputBg}`}
              >
                <option value="qualifier" className="bg-white text-slate-900">Qualifiers</option>
                <option
                  value="grand_final"
                  disabled={selectedRoundIdx !== rounds.length - 1}
                  className="bg-white text-slate-900"
                >
                  Grand Finals{selectedRoundIdx !== rounds.length - 1 ? ' (Last round only)' : ''}
                </option>
              </select>
            </div>

            {/* Planned Incoming Teams (teams_in) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className={`block text-xs font-bold uppercase tracking-wider ${theme.mutedText}`}>
                  Planned Incoming Teams
                </label>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" /> Read-only
                </span>
              </div>
              {selectedRoundIdx === 0 ? (
                <>
                  <input
                    type="number"
                    readOnly
                    value={slotsTotal}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-bold bg-slate-100/90 text-slate-700 cursor-not-allowed border border-slate-200/90 shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    {slotsTotal} tournament slots • <strong className="text-slate-700 font-semibold">{registeredCount} registered so far</strong>
                  </span>
                </>
              ) : (
                <>
                  <input
                    type="number"
                    readOnly
                    value={activeRound.teams_in != null ? activeRound.teams_in : 16}
                    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-bold bg-slate-100/90 text-slate-700 cursor-not-allowed border border-slate-200/90 shadow-2xs"
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Auto-calculated from {rounds[selectedRoundIdx - 1]?.name || `Round ${selectedRoundIdx}`} qualifiers
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Qualification Rule Box (only for non-Grand Finals) */}
          {activeRound.round_type !== 'grand_final' && (
            <div className="pt-3 border-t border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className={`w-4 h-4 ${theme.accentText}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${theme.mutedText}`}>
                  Qualification & Advancement Rule
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Rule Mode */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-600">
                    Rule Mode
                  </label>
                  <select
                    value={activeRound.advancement_type || 'per_district'}
                    onChange={(e) => handleUpdateActiveField('advancement_type', e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-bold ${theme.inputBg}`}
                  >
                    <option value="per_district" className="bg-white text-slate-900">Top N Per District</option>
                    <option value="overall" className="bg-white text-slate-900">Top N Overall Leaderboard</option>
                    <option value="manual" className="bg-white text-slate-900">Manual Organizer Selection</option>
                  </select>
                </div>

                {/* Advancing Count */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-600">
                    {activeRound.advancement_type === 'per_district'
                      ? 'Top N From Each District'
                      : 'Total Teams Advancing'}
                  </label>
                  {activeRound.advancement_type === 'per_district' ? (
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={activeRound.teams_advancing_per_district || 2}
                      onChange={(e) => handleUpdateActiveField('teams_advancing_per_district', Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold ${theme.inputBg}`}
                    />
                  ) : (
                    <input
                      type="number"
                      min="1"
                      value={activeRound.teams_advancing || 16}
                      onChange={(e) => handleUpdateActiveField('teams_advancing', Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold ${theme.inputBg}`}
                    />
                  )}
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    {activeRound.advancement_type === 'per_district'
                      ? 'e.g. 2 means 1st & 2nd place in each district qualify'
                      : 'e.g. 16 means top 16 highest scoring teams qualify'}
                  </span>
                </div>

                {/* Advancement Target (Plain text info) */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-600">
                    Advancement Target
                  </label>
                  <div className={`w-full px-3 py-2 rounded-xl text-xs font-bold ${theme.inputBg} flex items-center gap-1.5 text-slate-700 border border-slate-200/60 min-h-[38px]`}>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Next: {rounds[selectedRoundIdx + 1]?.name || `Round ${selectedRoundIdx + 2}`}</span>
                  </div>
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Advancing teams qualify automatically to the next round
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
