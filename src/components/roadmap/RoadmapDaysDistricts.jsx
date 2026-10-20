import React, { useState } from 'react';
import { Calendar, Plus, Trash2, Sliders, ChevronUp, ChevronDown, Clock, Map as MapIcon } from 'lucide-react';
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
          notes: '',
        },
      ],
    };

    const updatedAllocs = [...(activeDay.allocations || []), newAlloc];
    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: updatedAllocs } : d
    );
    onUpdateDays(updatedDays);
  };

  const handleRemoveDistrictFromDay = (allocIdx) => {
    if (!activeDay) return;
    const updatedAllocs = activeDay.allocations
      .filter((_, i) => i !== allocIdx)
      .map((a, i) => ({
        ...a,
        sequence: i + 1,
        display_order: i + 1,
      }));

    const updatedDays = days.map((d, i) =>
      i === selectedDayIdx ? { ...d, allocations: updatedAllocs } : d
    );
    onUpdateDays(updatedDays);
  };

  const handleMoveAllocation = (allocIdx, direction) => {
    if (!activeDay) return;
    const targetIdx = allocIdx + direction;
    if (targetIdx < 0 || targetIdx >= activeDay.allocations.length) return;

    const list = [...activeDay.allocations];
    const [moved] = list.splice(allocIdx, 1);
    list.splice(targetIdx, 0, moved);

    const resequenced = list.map((a, i) => ({
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
    if (!activeDay || editingDistrictAlloc == null) return;
    const allocIdx = activeDay.allocations.findIndex(
      (a) => (a.id || a.district_id) === (editingDistrictAlloc.id || editingDistrictAlloc.district_id)
    );
    if (allocIdx === -1) return;

    const duration = newSettings.durationMinutes || 30;
    const gap = newSettings.gapMinutes || 60;
    const [startH, startM] = (newSettings.startTime || '13:00').split(':').map(Number);
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
      <div className="flex items-center justify-between gap-2.5 border-b border-slate-200 pb-3 flex-wrap sm:flex-nowrap">
        {/* Scrollable Day Tabs for Mobile */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto pb-1 sm:pb-0">
          {days.map((day, idx) => {
            const isSelected = idx === selectedDayIdx;
            const allocCount = (day.allocations || []).length;
            return (
              <button
                key={day.id || idx}
                type="button"
                onClick={() => setSelectedDayIdx(idx)}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer min-h-[36px] ${
                  isSelected ? theme.activeTabBg : theme.inactiveTabBg
                }`}
              >
                <span>Day {day.day_number || idx + 1}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${isSelected ? 'bg-black/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {allocCount} {allocCount === 1 ? 'dist' : 'dists'}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleAddDay}
          className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shrink-0 min-h-[36px] w-full sm:w-auto ${theme.secondaryBtn}`}
        >
          <Plus className="w-3.5 h-3.5 text-blue-600" />
          <span>Add Match Day</span>
        </button>
      </div>

      {/* Active Day Detail Card */}
      {activeDay && (
        <div className={`p-3.5 sm:p-5 rounded-2xl ${theme.innerCardBg} space-y-4`}>
          {/* Day Date & Actions Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap w-full sm:w-auto">
              <div className="flex items-center gap-1.5">
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
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${theme.inputBg}`}
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
                className="px-2.5 py-1.5 rounded-lg text-rose-600 hover:text-rose-800 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1 transition cursor-pointer self-end sm:self-auto"
                title="Remove this day"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Day</span>
              </button>
            )}
          </div>

          {/* Assigned Districts in this Day */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${theme.mutedText}`}>
                Districts on Day {activeDay.day_number || selectedDayIdx + 1}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                {(activeDay.allocations || []).length} district(s) assigned
              </span>
            </div>

            {(!activeDay.allocations || activeDay.allocations.length === 0) ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-300 bg-white text-center space-y-1">
                <p className="text-xs font-semibold text-slate-700">
                  No districts scheduled for this day yet.
                </p>
                <p className="text-[11px] text-slate-500">
                  Select available districts below to schedule them on Day {activeDay.day_number || selectedDayIdx + 1}.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeDay.allocations.map((alloc, aIdx) => {
                  const firstMatch = alloc.matches?.[0] || {};
                  return (
                    <div
                      key={alloc.id || aIdx}
                      className="p-3 sm:p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition"
                    >
                      <div className="flex items-center gap-3 w-full sm:w-auto min-w-[180px]">
                        <span className="w-6 h-6 rounded-md font-mono text-xs flex items-center justify-center font-bold bg-slate-100 text-slate-700 shrink-0">
                          {aIdx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className={`font-bold text-xs sm:text-sm ${theme.headingText} truncate`}>
                            {alloc.district_name || alloc.name || `District ${aIdx + 1}`}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-2">
                            <span>Capacity: {alloc.capacity || 16} teams</span>
                          </div>
                        </div>
                      </div>

                      {/* Match Details Badges */}
                      <div className="flex flex-wrap items-center gap-2 text-xs w-full sm:w-auto">
                        <span className={`px-2 py-0.5 rounded font-bold ${theme.badgeNeutral}`}>
                          {alloc.match_count || (alloc.matches ? alloc.matches.length : 1)} {alloc.match_count === 1 ? 'match' : 'matches'}
                        </span>
                        <span className="px-2 py-0.5 rounded font-mono font-semibold bg-slate-50 text-slate-700 border border-slate-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-600" />
                          {firstMatch.start_time || '13:00'} IST
                        </span>
                        <span className="px-2 py-0.5 rounded font-semibold bg-slate-50 text-slate-700 border border-slate-200 flex items-center gap-1">
                          <MapIcon className="w-3 h-3 text-emerald-600" />
                          {firstMatch.map || 'Erangel'}
                        </span>
                      </div>

                      {/* District Actions */}
                      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <button
                          type="button"
                          onClick={() => setEditingDistrictAlloc(alloc)}
                          className={`px-2.5 py-1.5 sm:py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 min-h-[32px] ${theme.secondaryBtn}`}
                        >
                          <Sliders className="w-3.5 h-3.5 text-blue-600" />
                          <span>Settings</span>
                        </button>

                        <button
                          type="button"
                          disabled={aIdx === 0}
                          onClick={() => handleMoveAllocation(aIdx, -1)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-20 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                          title="Move up"
                        >
                          <ChevronUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          disabled={aIdx === activeDay.allocations.length - 1}
                          onClick={() => handleMoveAllocation(aIdx, 1)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-20 cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
                          title="Move down"
                        >
                          <ChevronDown className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRemoveDistrictFromDay(aIdx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
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
            <div className="pt-3 border-t border-slate-200">
              <span className={`text-xs font-bold uppercase tracking-wider mb-2 block ${theme.mutedText}`}>
                Unassigned Districts (Tap to Assign to Day {activeDay.day_number || selectedDayIdx + 1})
              </span>
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
                {availableDistricts.map((dist) => (
                  <button
                    key={dist.id}
                    type="button"
                    onClick={() => handleAssignDistrictToActiveDay(dist)}
                    className="px-3 py-2 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-slate-800 text-xs font-bold flex items-center justify-between sm:justify-start gap-1.5 transition cursor-pointer shadow-2xs min-h-[38px]"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Plus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">{dist.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium shrink-0">({dist.capacity || 16})</span>
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
