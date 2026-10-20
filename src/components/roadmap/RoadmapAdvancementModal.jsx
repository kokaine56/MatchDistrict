import React, { useState, useEffect } from 'react';
import { Trophy, CheckCircle, Sparkles, X, Users, RefreshCw, Search, Filter } from 'lucide-react';
import { getAuthToken } from '../../utils/getAuthToken';

export default function RoadmapAdvancementModal({
  isOpen,
  onClose,
  sourceRound,
  rounds = [],
  tournamentId,
  onSuccess,
  onError,
}) {
  const [targetRoundId, setTargetRoundId] = useState('');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [standingsData, setStandingsData] = useState(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [preset, setPreset] = useState('round_total');
  const [customTopCount, setCustomTopCount] = useState(16);
  const [customPerDistrictCount, setCustomPerDistrictCount] = useState(2);

  useEffect(() => {
    if (!isOpen || !sourceRound || !tournamentId) return;

    let isMounted = true;
    setLoading(true);

    const nextRound =
      rounds.find((r) => r.id === sourceRound.advancement_target_round_id) ||
      rounds.find((r) => (r.round_number || 0) > (sourceRound.round_number || 0)) ||
      null;

    const initialTargetId = nextRound ? nextRound.id : '';
    setTargetRoundId(initialTargetId);

    let initialGroupId = '';
    if (nextRound && Array.isArray(nextRound.days)) {
      for (const d of nextRound.days) {
        if (Array.isArray(d.allocations) && d.allocations.length > 0) {
          initialGroupId = d.allocations[0].id || d.allocations[0].group_id || d.allocations[0].district_id;
          break;
        }
      }
    }
    setTargetGroupId(initialGroupId);

    (async () => {
      try {
        const token = await getAuthToken();
        const roundNum = sourceRound.round_number || 1;
        const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundNum}/standings`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();
        if (!isMounted) return;

        if (!data.success) {
          throw new Error(data.message || data.error || 'Failed to load round standings.');
        }

        setStandingsData(data);

        const advType = sourceRound.advancement_type || 'per_district';
        const preSelected = new Set();

        if (advType === 'per_district' && Array.isArray(data.districts)) {
          const perDist = Number(sourceRound.teams_advancing_per_district) || 2;
          data.districts.forEach((d) => {
            (d.teams || []).slice(0, perDist).forEach((t) => {
              if (t.team_id) preSelected.add(t.team_id);
            });
          });
          setPreset('per_district');
          setCustomPerDistrictCount(perDist);
        } else if (Array.isArray(data.standings) || Array.isArray(data.overallStandings)) {
          const standingsList = data.standings || data.overallStandings;
          const topCount = Number(sourceRound.teams_advancing) || 16;
          standingsList.slice(0, topCount).forEach((t) => {
            if (t.team_id) preSelected.add(t.team_id);
          });
          setPreset('round_total');
          setCustomTopCount(topCount);
        }

        setSelectedTeamIds(preSelected);

        if (!initialGroupId && Array.isArray(data.nextRoundGroups) && data.nextRoundGroups.length > 0) {
          setTargetGroupId(data.nextRoundGroups[0].id);
        }
      } catch (err) {
        if (isMounted && onError) onError(err.message || 'Failed to load standings.');
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isOpen, sourceRound, tournamentId, rounds, onError]);

  if (!isOpen) return null;

  const applyPresetOverall = (count) => {
    const standingsList = standingsData?.standings || standingsData?.overallStandings;
    if (!standingsList) return;
    const n = Math.max(1, Number(count) || 16);
    const set = new Set();
    standingsList.slice(0, n).forEach((t) => {
      if (t.team_id) set.add(t.team_id);
    });
    setSelectedTeamIds(set);
    setPreset('round_total');
  };

  const applyPresetPerDistrict = (count) => {
    if (!standingsData?.districts) return;
    const n = Math.max(1, Number(count) || 2);
    const set = new Set();
    standingsData.districts.forEach((d) => {
      (d.teams || []).slice(0, n).forEach((t) => {
        if (t.team_id) set.add(t.team_id);
      });
    });
    setSelectedTeamIds(set);
    setPreset('per_district');
  };

  const toggleSelectTeam = (teamId) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    setPreset('manual');
  };

  const handleExecuteAdvancement = async () => {
    if (selectedTeamIds.size === 0) {
      if (onError) onError('Please select at least 1 team to advance.');
      return;
    }
    if (!targetRoundId) {
      if (onError) onError('Please select a target round for the advancing teams.');
      return;
    }

    setExecuting(true);
    try {
      const token = await getAuthToken();
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/advance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          source_round_id: sourceRound?.id,
          target_round_id: targetRoundId,
          target_group_id: targetGroupId || undefined,
          team_ids: Array.from(selectedTeamIds),
          advancement_type: preset,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || data.error || 'Failed to advance teams.');
      }

      const targetRoundObj = rounds.find((r) => r.id === targetRoundId);
      const targetName = targetRoundObj ? targetRoundObj.name : 'Next Round';

      if (onSuccess) {
        onSuccess({
          message: `Successfully qualified and advanced ${data.advanced_count || selectedTeamIds.size} teams to "${targetName}"!`,
          count: data.advanced_count || selectedTeamIds.size,
        });
      }
      onClose();
    } catch (err) {
      if (onError) onError(err.message || 'Failed to advance teams.');
    } finally {
      setExecuting(false);
    }
  };

  const allTeamsList = standingsData?.standings || standingsData?.overallStandings || [];
  const filteredTeams = allTeamsList.filter((team) => {
    if (search) {
      const q = search.toLowerCase();
      const matchName = (team.team_name || team.name || '').toLowerCase().includes(q);
      const matchTag = (team.team_tag || '').toLowerCase().includes(q);
      if (!matchName && !matchTag) return false;
    }
    if (districtFilter !== 'all') {
      if (String(team.district_id || team.group_id) !== String(districtFilter)) {
        return false;
      }
    }
    return true;
  });

  const hasRecordedResults = allTeamsList.some(
    (t) => (t.matches_played || 0) > 0 || (t.total_points || 0) > 0
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={() => !executing && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full p-4 sm:p-6 shadow-2xl border border-[#E4E7EC] space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-[#E4E7EC] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-lg font-bold text-[#172033] flex items-center gap-2">
                Team Qualification & Stage Advancement
              </h3>
              <p className="text-xs text-[#667085]">
                Select and promote qualified teams from {sourceRound?.name || 'current round'} to the next round / Grand Finals.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={executing}
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#667085] hover:text-[#172033] hover:bg-[#F2F4F7] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Qualification Mode & Match Status Banner */}
        {hasRecordedResults ? (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-[#16A34A] shrink-0" />
            <span>
              <strong>Leaderboard Active:</strong> Standings reflect verified match scores from completed matches. Select qualifying teams below to populate the target round.
            </span>
          </div>
        ) : (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#2563EB] shrink-0" />
            <span>
              <strong>Roadmap Overview Mode:</strong> Matches have not taken place yet. All registered teams are listed below. Once matches are hosted and results are verified on the leaderboard, official standings and top qualifiers will be computed automatically.
            </span>
          </div>
        )}

        {/* Target Destination Selectors */}
        <div className="p-3.5 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-[#172033] font-bold mb-1">
              1. Target Next Round:
            </label>
            <select
              value={targetRoundId}
              onChange={(e) => {
                const newTargetId = e.target.value;
                setTargetRoundId(newTargetId);
                const tr = rounds.find((r) => r.id === newTargetId);
                let grpId = '';
                if (tr && Array.isArray(tr.days)) {
                  for (const d of tr.days) {
                    if (Array.isArray(d.allocations) && d.allocations.length > 0) {
                      grpId = d.allocations[0].id || d.allocations[0].group_id || d.allocations[0].district_id;
                      break;
                    }
                  }
                }
                setTargetGroupId(grpId);
              }}
              className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] font-bold focus:border-blue-500 focus:outline-none"
            >
              <option value="" disabled>-- Select Target Round --</option>
              {rounds
                .filter((r) => r.id !== sourceRound?.id)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (Round {r.round_number})
                  </option>
                ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[#172033] font-bold">
                2. Target Group / District:
              </label>
              <span className="text-[11px] text-[#667085]">
                Optional: assigns teams to a specific lobby
              </span>
            </div>
            <select
              value={targetGroupId}
              onChange={(e) => setTargetGroupId(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#E4E7EC] rounded-lg text-[#172033] font-bold focus:border-blue-500 focus:outline-none"
            >
              <option value="">Unassigned (Assign automatically or later)</option>
              {(() => {
                const tr = rounds.find((r) => r.id === targetRoundId);
                const options = [];
                if (tr && Array.isArray(tr.days)) {
                  tr.days.forEach((d) => {
                    (d.allocations || []).forEach((a) => {
                      const id = a.id || a.group_id || a.district_id;
                      const name = a.district_name || a.name || `District ${id}`;
                      options.push(
                        <option key={id} value={id}>
                          {name} (Day {d.day_number})
                        </option>
                      );
                    });
                  });
                }
                return options;
              })()}
            </select>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search team name or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl text-slate-800 placeholder-slate-400 text-xs focus:bg-white focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={districtFilter}
              onChange={(e) => setDistrictFilter(e.target.value)}
              className="w-full px-3 py-2 bg-[#F8FAFC] border border-[#E4E7EC] rounded-xl text-slate-800 text-xs font-bold focus:bg-white focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Districts</option>
              {standingsData?.districts?.map((d) => (
                <option key={d.district_id || d.id} value={d.district_id || d.id}>
                  {d.district_name || d.name || `District ${d.district_id || d.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Selection Presets */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="font-bold text-[#344054]">Quick Select:</span>
            <button
              type="button"
              onClick={() => applyPresetOverall(customTopCount)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-bold border transition ${
                preset === 'round_total'
                  ? 'bg-blue-50 border-blue-300 text-[#2563EB]'
                  : 'bg-white border-[#D0D5DD] text-[#344054] hover:bg-slate-50'
              }`}
            >
              Top {customTopCount} Overall
            </button>
            <button
              type="button"
              onClick={() => applyPresetPerDistrict(customPerDistrictCount)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-bold border transition ${
                preset === 'per_district'
                  ? 'bg-blue-50 border-blue-300 text-[#2563EB]'
                  : 'bg-white border-[#D0D5DD] text-[#344054] hover:bg-slate-50'
              }`}
            >
              Top {customPerDistrictCount} per District
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedTeamIds(new Set());
                setPreset('manual');
              }}
              className="px-2 py-1.5 rounded-lg font-semibold text-[#667085] hover:text-[#172033] hover:bg-slate-100 transition"
            >
              Clear
            </button>
          </div>

          <div className="font-bold text-[#172033] bg-blue-50/70 border border-blue-200 px-3 py-1.5 rounded-lg self-start sm:self-auto">
            Selected: <span className="text-[#2563EB]">{selectedTeamIds.size}</span> teams
          </div>
        </div>

        {/* Team List Table */}
        <div className="flex-1 overflow-y-auto border border-[#E4E7EC] rounded-xl max-h-[40vh]">
          {loading ? (
            <div className="p-8 text-center text-xs text-[#667085]">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#2563EB]" />
              Loading tournament standings...
            </div>
          ) : filteredTeams.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#667085]">
              No teams found matching search criteria.
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8FAFC] border-b border-[#E4E7EC] sticky top-0 text-[#667085] font-bold">
                <tr>
                  <th className="p-2.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredTeams.length > 0 && filteredTeams.every((t) => selectedTeamIds.has(t.team_id))}
                      onChange={(e) => {
                        const next = new Set(selectedTeamIds);
                        if (e.target.checked) {
                          filteredTeams.forEach((t) => next.add(t.team_id));
                        } else {
                          filteredTeams.forEach((t) => next.delete(t.team_id));
                        }
                        setSelectedTeamIds(next);
                        setPreset('manual');
                      }}
                      className="rounded text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="p-2.5 w-12 text-center">Rank</th>
                  <th className="p-2.5">Team Name</th>
                  <th className="p-2.5">District</th>
                  <th className="p-2.5 text-right">Pts</th>
                  <th className="p-2.5 text-right">Matches</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E7EC]">
                {filteredTeams.map((team, idx) => {
                  const isChecked = selectedTeamIds.has(team.team_id);
                  return (
                    <tr
                      key={team.team_id || idx}
                      onClick={() => toggleSelectTeam(team.team_id)}
                      className={`cursor-pointer transition ${
                        isChecked ? 'bg-blue-50/70 font-semibold text-[#172033]' : 'hover:bg-slate-50 text-[#344054]'
                      }`}
                    >
                      <td className="p-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by tr click
                          className="rounded text-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5 text-center font-mono text-slate-500">
                        {team.rank || idx + 1}
                      </td>
                      <td className="p-2.5 font-bold text-[#172033]">
                        {team.team_name || team.name || `Team ${idx + 1}`}
                      </td>
                      <td className="p-2.5 text-[#667085]">
                        {team.district_name || `District ${team.district_id || team.group_id || '—'}`}
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-[#2563EB]">
                        {team.total_points ?? 0}
                      </td>
                      <td className="p-2.5 text-right font-mono text-[#667085]">
                        {team.matches_played ?? 0}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 sm:gap-3 pt-3 border-t border-[#E4E7EC]">
          <button
            type="button"
            disabled={executing}
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-white hover:bg-slate-50 text-[#344054] font-semibold text-xs rounded-xl border border-[#D0D5DD] shadow-xs transition cursor-pointer min-h-[38px]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={executing || selectedTeamIds.size === 0 || !targetRoundId}
            onClick={handleExecuteAdvancement}
            className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-5 py-2.5 sm:py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold text-xs rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer min-h-[38px]"
          >
            {executing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
            <span>
              {executing
                ? 'Advancing Teams...'
                : `Qualify & Advance (${selectedTeamIds.size}) Teams`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
