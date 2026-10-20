import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Trophy, Shield, HelpCircle, AlertTriangle } from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';

export default function RoadmapRoundsManager({
  rounds = [],
  selectedRoundIdx = 0,
  onSelectRound,
  onUpdateRounds,
  cardColor = 'white',
  validationErrors = [],
  validationWarnings = [],
}) {
  const theme = getRoadmapTheme(cardColor);

  const activeRound = rounds[selectedRoundIdx] || rounds[0] || null;

  // Add Round
  const handleAddRound = () => {
    const nextNum = rounds.length + 1;
    const isNextGF = rounds.length >= 1; // if 2nd round, suggest grand finals or qualifier
    const newRound = {
      id: `RND-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      round_number: nextNum,
      name: isNextGF ? `Round ${nextNum}` : 'Qualifiers',
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

    const updated = [...rounds, newRound];
    onUpdateRounds(updated);
    onSelectRound(updated.length - 1);
  };

  // Remove Round
  const handleRemoveRound = (idx) => {
    if (rounds.length <= 1) return;
    const updated = rounds
      .filter((_, i) => i !== idx)
      .map((r, i) => ({ ...r, round_number: i + 1 }));
    onUpdateRounds(updated);
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

    const renumbered = copy.map((r, i) => ({ ...r, round_number: i + 1 }));
    onUpdateRounds(renumbered);
    onSelectRound(targetIdx);
  };

  // Field change on active round
  const handleUpdateActiveField = (field, value) => {
    if (!activeRound) return;
    const updated = rounds.map((r, idx) => {
      if (idx !== selectedRoundIdx) return r;
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
    onUpdateRounds(updated);
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
        <div className={`p-4 sm:p-5 rounded-2xl ${theme.innerCardBg} space-y-4`}>
          {/* Round Header & Reordering */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200">
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
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs disabled:opacity-30 cursor-pointer flex items-center gap-1 min-h-[32px]"
                  title="Move round earlier"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                  Earlier
                </button>
                <button
                  type="button"
                  disabled={selectedRoundIdx === rounds.length - 1}
                  onClick={() => handleMoveRound(selectedRoundIdx, 1)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs disabled:opacity-30 cursor-pointer flex items-center gap-1 min-h-[32px]"
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
                value={activeRound.round_type || 'qualifier'}
                onChange={(e) => handleUpdateActiveField('round_type', e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-semibold ${theme.inputBg}`}
              >
                <option value="qualifier" className="bg-white text-slate-900">Qualifier Stage</option>
                <option value="semi_final" className="bg-white text-slate-900">Semi-Finals Stage</option>
                <option value="grand_final" className="bg-white text-slate-900">Grand Finals (Terminal Finale)</option>
                <option value="custom" className="bg-white text-slate-900">Custom Stage</option>
              </select>
            </div>

            {/* Planned Incoming Teams (teams_in) */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${theme.mutedText}`}>
                Planned Incoming Teams
              </label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 128, 64, 16"
                value={activeRound.teams_in != null ? activeRound.teams_in : ''}
                onChange={(e) => handleUpdateActiveField('teams_in', e.target.value ? Number(e.target.value) : null)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm font-bold ${theme.inputBg}`}
              />
              <span className="text-[11px] text-slate-500 mt-1 block">Expected team capacity entering this round</span>
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

                {/* Target Next Round Selector */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider mb-1 text-slate-600">
                    Advancement Target Round
                  </label>
                  <select
                    value={activeRound.advancement_target_round_id || ''}
                    onChange={(e) => handleUpdateActiveField('advancement_target_round_id', e.target.value || null)}
                    className={`w-full px-3 py-2 rounded-xl text-xs font-semibold ${theme.inputBg}`}
                  >
                    <option value="" className="bg-white text-slate-900">
                      Next Sequential Round (Default)
                    </option>
                    {rounds
                      .filter((_, idx) => idx > selectedRoundIdx)
                      .map((target) => (
                        <option key={target.id} value={target.id} className="bg-white text-slate-900">
                          {target.name} (Round {target.round_number})
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
