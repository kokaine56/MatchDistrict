import React, { useState } from 'react';
import { Calendar, Plus, Trash2, Sliders, ChevronUp, ChevronDown, Clock, Map as MapIcon, Users, AlertCircle } from 'lucide-react';
import { getRoadmapTheme } from './RoadmapTheme';
import { getDayOfWeek } from '../TournamentRoadmapBuilder';
import RoadmapDistrictSettingsModal from './RoadmapDistrictSettingsModal';

export default function RoadmapDaysDistricts({
  round,
  roundIdx,
  allDistricts = [],
  minSelectableDate = '',
  game = 'bgmi',
  onUpdateDays,
  cardColor = 'white',
  validationErrors = [],
}) {
  const theme = getRoadmapTheme(cardColor);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [editingDistrictAlloc, setEditingDistrictAlloc] = useState(null);

  const days = Array.isArray(round?.days) ? round.days : [];
  const activeDay = days[selectedDayIdx] || days[0] || null;

  // Determine which districts are allocated in this round
  const allocatedDistrictIdsInRound = new Set();
  days.forEach((d) => {
    (d.allocations || []).forEach((a) => {
      const id = a.district_id || a.id;
      if (id) allocatedDistrictIdsInRound.add(id);
    });
  });

  // Available districts not yet scheduled in this round
  const availableDistricts = allDistricts.filter(
    (dist) => !allocatedDistrictIdsInRound.has(dist.id)
  );

  // Handlers
  const handleAddDay = () => {
    const nextDayNum = days.length + 1;
    let nextDate = '';
    if (days.length > 0 && days[days.length - 1].date) {
      // Calculate next day date
      try {
        const last = new Date(days[days.length - 1].date);
        last.setDate(last.getDate() + 1);
        nextDate = last.toISOString().slice(0, 10);
      } catch {
        nextDate = minSelectableDate;
      }
    } else {
      nextDate = minSelectableDate;
    }

    const newDay = {
      id: `DAY-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      day_number: nextDayNum,
      date: nextDate,
      allocations: [],
    };

    const updated = [...days, newDay];
    onUpdateDays(updated);
    setSelectedDayIdx(updated.length - 1);
  };

  const handleDeleteDay = (idx) => {
    if (days.length <= 1) return;
    const updated = days.filter((_, i) => i !== idx).map((d, i) => ({
      ...d,
      day_number: i + 1,
    }));
    onUpdateDays(updated);
    setSelectedDayIdx(Math.max(0, idx - 1));
  };

  const handleDayDateChange = (idx, newDate) => {
    const updated = days.map((d, i) => (i === idx ? { ...d, date: newDate } : d));
    onUpdateDays(updated);
  };

  const handleAssignDistrictToActiveDay = (district) => {
    if (!activeDay) return;
    const defaultStartTime = '13:00';
    const newAlloc = {
      id: district.id || `GRP-${Date.now()}`,
      group_id: district.id,
      district_id: district.id,
      district_name: district.name || `District ${activeDay.allocations.length + 1}`,
      match_count: 1,
      capacity: district.capacity || 16,
      sequence: activeDay.allocations.length + 1,
      display_order: activeDay.allocations.length + 1,
      matches: [
        {
          id: `MAT-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          district_match_number: 1,
          start_time: defaultStartTime,
          end_time: '13:30',
          map: 'Erangel',
          status: 'PENDING',
        },
      ],
    };

    const updatedAllocations = [...(activeDay.allocations || []), newAlloc];
    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: updatedAllocations } : d
    );
    onUpdateDays(updatedDays);
  };

  const handleRemoveDistrictFromDay = (allocIdx) => {
    if (!activeDay) return;
    const updatedAllocations = activeDay.allocations
      .filter((_, i) => i !== allocIdx)
      .map((a, i) => ({ ...a, sequence: i + 1, display_order: i + 1 }));

    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: updatedAllocations } : d
    );
    onUpdateDays(updatedDays);
  };

  const handleMoveAllocation = (allocIdx, direction) => {
    if (!activeDay) return;
    const allocs = [...activeDay.allocations];
    const targetIdx = allocIdx + direction;
    if (targetIdx < 0 || targetIdx >= allocs.length) return;

    const temp = allocs[allocIdx];
    allocs[allocIdx] = allocs[targetIdx];
    allocs[targetIdx] = temp;

    const resequenced = allocs.map((a, i) => ({
      ...a,
      sequence: i + 1,
      display_order: i + 1,
    }));

    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: resequenced } : d
    );
    onUpdateDays(updatedDays);
  };

  const handleSaveDistrictSettings = (newSettings) => {
    if (!activeDay || !editingDistrictAlloc) return;
    const allocIdx = activeDay.allocations.findIndex(
      (a) => (a.district_id || a.id) === (editingDistrictAlloc.district_id || editingDistrictAlloc.id)
    );
    if (allocIdx === -1) return;

    // Generate matches array for this district based on match count, start time and gap
    const matchCount = newSettings.matchCount;
    const duration = newSettings.durationMinutes || 30;
    const gap = newSettings.gapMinutes || 60;
    const [startH, startM] = (newSettings.startTime || '13:00').split(':').map(Number);
    let curMins = startH * 60 + startM;

    const newMatches = [];
    for (let m = 0; m < matchCount; m++) {
      const hStr = String(Math.floor(curMins / 60) % 24).padStart(2, '0');
      const mStr = String(curMins % 60).padStart(2, '0');
      const startTimeStr = `${hStr}:${mStr}`;

      const endMins = curMins + duration;
      const endHStr = String(Math.floor(endMins / 60) % 24).padStart(2, '0');
      const endMStr = String(endMins % 60).padStart(2, '0');
      const endTimeStr = `${endHStr}:${endMStr}`;

      newMatches.push({
        id: `MAT-${Date.now()}-${m}-${Math.random().toString(36).substr(2, 4)}`,
        district_match_number: m + 1,
        start_time: startTimeStr,
        end_time: endTimeStr,
        map: newSettings.map,
        status: 'PENDING',
        notes: newSettings.notes || '',
      });

      curMins += gap;
    }

    const updatedAlloc = {
      ...activeDay.allocations[allocIdx],
      match_count: matchCount,
      matches: newMatches,
    };

    const updatedAllocs = [...activeDay.allocations];
    updatedAllocs[allocIdx] = updatedAlloc;

    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: updatedAllocs } : d
    );
    onUpdateDays(updatedDays);
  };

  const handleApplySettingsToAllDistrictsOnDay = (newSettings) => {
    if (!activeDay) return;
    const duration = newSettings.durationMinutes || 30;
    const gap = newSettings.gapMinutes || 60;
    const [startH, startM] = (newSettings.startTime || '13:00').split(':').map(Number);

    const updatedAllocs = activeDay.allocations.map((alloc) => {
      let curMins = startH * 60 + startM;
      const matchCount = newSettings.matchCount;
      const newMatches = [];

      for (let m = 0; m < matchCount; m++) {
        const hStr = String(Math.floor(curMins / 60) % 24).padStart(2, '0');
        const mStr = String(curMins % 60).padStart(2, '0');
        const startTimeStr = `${hStr}:${mStr}`;

        const endMins = curMins + duration;
        const endHStr = String(Math.floor(endMins / 60) % 24).padStart(2, '0');
        const endMStr = String(endMins % 60).padStart(2, '0');
        const endTimeStr = `${endHStr}:${endMStr}`;

        newMatches.push({
          id: `MAT-${Date.now()}-${m}-${Math.random().toString(36).substr(2, 4)}`,
          district_match_number: m + 1,
          start_time: startTimeStr,
          end_time: endTimeStr,
          map: newSettings.map,
          status: 'PENDING',
          notes: newSettings.notes || '',
        });

        curMins += gap;
      }

      return {
        ...alloc,
        match_count: matchCount,
        matches: newMatches,
      };
    });

    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: updatedAllocs } : d
    );
    onUpdateDays(updatedDays);
  };

  return (
    <div className="space-y-4">
      {/* Day Selector Tabs & Add Day */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/50 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {days.map((day, idx) => {
            const isSelected = idx === selectedDayIdx;
            const allocCount = (day.allocations || []).length;
            return (
              <button
                key={day.id || idx}
                type="button"
                onClick={() => setSelectedDayIdx(idx)}
                className={`px-3.5 py-1.5 rounded-xl font-bold text-xs flex items-center gap-2 transition cursor-pointer ${
                  isSelected ? theme.activeTabBg : theme.inactiveTabBg
                }`}
              >
                <span>Day {day.day_number || idx + 1}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${isSelected ? 'bg-black/30 text-white' : 'bg-slate-700/60 text-slate-300'}`}>
                  {allocCount} {allocCount === 1 ? 'dist' : 'dists'}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddDay}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${theme.secondaryBtn}`}
        >
          <Plus className="w-3.5 h-3.5" />
          Add Match Day
        </button>
      </div>

      {/* Active Day Detail Card */}
      {activeDay && (
        <div className={`p-4 sm:p-5 rounded-2xl ${theme.innerCardBg} space-y-4`}>
          {/* Day Date & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-700/40">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Calendar className={`w-4 h-4 ${theme.accentText}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${theme.mutedText}`}>
                  Day {activeDay.day_number || selectedDayIdx + 1} Date:
                </span>
              </div>
              <input
                type="date"
                value={activeDay.date || ''}
                min={minSelectableDate}
                onChange={(e) => handleDayDateChange(selectedDayIdx, e.target.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${theme.inputBg}`}
              />
              {activeDay.date && (
                <span className={`text-xs font-semibold ${theme.mutedText}`}>
                  ({getDayOfWeek(activeDay.date)})
                </span>
              )}
            </div>

            {days.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteDay(selectedDayIdx)}
                className="px-2.5 py-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                title="Remove this day"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Day
              </button>
            )}
          </div>

          {/* Assigned Districts in this Day */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${theme.mutedText}`}>
                Districts Playing on Day {activeDay.day_number || selectedDayIdx + 1}
              </span>
              <span className="text-[11px] text-slate-400">
                {(activeDay.allocations || []).length} district(s) assigned
              </span>
            </div>

            {(!activeDay.allocations || activeDay.allocations.length === 0) ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-700 text-center space-y-1">
                <p className="text-xs font-semibold text-slate-300">
                  No districts scheduled for this day yet.
                </p>
                <p className="text-[11px] text-slate-500">
                  Select available districts below to schedule them on Day {activeDay.day_number || selectedDayIdx + 1}.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeDay.allocations.map((alloc, aIdx) => {
                  const firstMatch = alloc.matches?.[0] || {};
                  return (
                    <div
                      key={alloc.id || aIdx}
                      className={`p-3 rounded-xl border bg-black/20 flex flex-wrap items-center justify-between gap-3 ${theme.divider}`}
                    >
                      <div className="flex items-center gap-3 min-w-[180px]">
                        <span className={`w-6 h-6 rounded-md font-mono text-xs flex items-center justify-center font-bold bg-slate-800 text-slate-300`}>
                          {aIdx + 1}
                        </span>
                        <div>
                          <div className={`font-bold text-sm ${theme.headingText}`}>
                            {alloc.district_name || alloc.name || `District ${aIdx + 1}`}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>Capacity: {alloc.capacity || 16} teams</span>
                          </div>
                        </div>
                      </div>

                      {/* Match Details Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded font-bold ${theme.badgeNeutral}`}>
                          {alloc.match_count || (alloc.matches ? alloc.matches.length : 1)} {alloc.match_count === 1 ? 'match' : 'matches'}
                        </span>
                        <span className="px-2 py-0.5 rounded font-mono font-semibold bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          {firstMatch.start_time || '13:00'} IST
                        </span>
                        <span className="px-2 py-0.5 rounded font-semibold bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1">
                          <MapIcon className="w-3 h-3 text-emerald-400" />
                          {firstMatch.map || 'Erangel'}
                        </span>
                      </div>

                      {/* District Actions */}
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button
                          type="button"
                          onClick={() => setEditingDistrictAlloc(alloc)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 ${theme.secondaryBtn}`}
                        >
                          <Sliders className="w-3.5 h-3.5" />
                          Settings
                        </button>

                        <button
                          type="button"
                          disabled={aIdx === 0}
                          onClick={() => handleMoveAllocation(aIdx, -1)}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          title="Move up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={aIdx === activeDay.allocations.length - 1}
                          onClick={() => handleMoveAllocation(aIdx, 1)}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 disabled:opacity-20 cursor-pointer"
                          title="Move down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveDistrictFromDay(aIdx)}
                          className="p-1 rounded-md text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer"
                          title="Remove district from this day"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available Districts to Add */}
          {availableDistricts.length > 0 && (
            <div className="pt-3 border-t border-slate-700/40">
              <span className={`text-xs font-bold uppercase tracking-wider mb-2 block ${theme.mutedText}`}>
                Unassigned Districts (Click to Assign to Day {activeDay.day_number || selectedDayIdx + 1})
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {availableDistricts.map((dist) => (
                  <button
                    key={dist.id}
                    type="button"
                    onClick={() => handleAssignDistrictToActiveDay(dist)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                      theme.isGold
                        ? 'bg-amber-950/30 border-amber-500/30 text-amber-300 hover:bg-amber-950/60'
                        : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-750'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{dist.name}</span>
                    <span className="text-[10px] text-slate-400 font-normal">({dist.capacity || 16})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* District Settings Modal */}
      {editingDistrictAlloc && (
        <RoadmapDistrictSettingsModal
          isOpen={Boolean(editingDistrictAlloc)}
          onClose={() => setEditingDistrictAlloc(null)}
          allocation={editingDistrictAlloc}
          dayNumber={activeDay?.day_number || selectedDayIdx + 1}
          game={game}
          cardColor={cardColor}
          onSave={handleSaveDistrictSettings}
          onApplyToAllOnDay={handleApplySettingsToAllDistrictsOnDay}
        />
      )}
    </div>
  );
}
