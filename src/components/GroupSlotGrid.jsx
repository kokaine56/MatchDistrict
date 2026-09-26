import React, { useState, useMemo } from 'react';
import {
  buildGroups,
  normalizeGroupsFromServer,
  DEFAULT_TEAMS_PER_GROUP,
} from '../utils/groupUtils';

export default function GroupSlotGrid({ slotsData, matchType }) {
  const [currentGroup, setCurrentGroup] = useState(1);

  // Server-authoritative group layout (groupMeta), with a defensive client
  // fallback so the grid still renders for stale payloads.
  const groups = useMemo(() => {
    if (!slotsData) return [];
    if (Array.isArray(slotsData?.groupMeta?.groups) && slotsData.groupMeta.groups.length > 0) {
      return normalizeGroupsFromServer(slotsData.groupMeta.groups);
    }
    const teamsPerGroup =
      slotsData?.teamsPerGroup ||
      slotsData?.groupMeta?.teamsPerGroup ||
      DEFAULT_TEAMS_PER_GROUP;
    const total = slotsData?.slotsTotal || 0;
    return buildGroups(total, teamsPerGroup);
  }, [slotsData]);

  const currentGroupDef = groups[Math.min(Math.max(1, currentGroup), Math.max(1, groups.length)) - 1];

  const currentGroupSlots = useMemo(() => {
    if (!slotsData?.slots || !currentGroupDef) return [];
    return slotsData.slots.filter((s) => {
      const slotGroup = s.groupName || (s.groupLabel ? s.groupLabel.replace(/[0-9]+$/, '') : null);
      return slotGroup === currentGroupDef.name;
    });
  }, [slotsData, currentGroupDef]);

  const occupiedSlots = useMemo(() => {
    return currentGroupSlots.filter(
      (s) => s.status === 'occupied' || s.status === 'confirmed'
    );
  }, [currentGroupSlots]);

  // Only a confirmed registration occupies a slot. Registrations that are still
  // awaiting payment verification stay visible in the table below but their slot
  // remains available (green) on the map.
  const availableCount = useMemo(() => {
    return currentGroupSlots.filter(
      (s) => s.status === 'available' || s.status === 'pending'
    ).length;
  }, [currentGroupSlots]);

  const filledCount = useMemo(() => {
    return currentGroupSlots.filter(
      (s) => s.status === 'occupied' || s.status === 'confirmed'
    ).length;
  }, [currentGroupSlots]);

  const confirmedCount = useMemo(() => {
    return occupiedSlots.filter((slot) => slot.paymentVerified === true).length;
  }, [occupiedSlots]);

  if (!slotsData || !currentGroupDef || groups.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm w-full">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">
          Live Slot Occupancy Map
        </h3>
        <p className="text-sm text-slate-500">No slot data available.</p>
      </div>
    );
  }

  const totalGroups = groups.length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm w-full">
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">
        Live Slot Occupancy Map
      </h3>

      {totalGroups > 1 && (
        <div className="max-sm:flex max-sm:overflow-x-auto max-sm:scrollbar-none max-sm:gap-2 max-sm:pb-2 sm:flex sm:flex-wrap sm:gap-2 mb-5">
          {groups.map((g) => (
            <button
              key={g.name || g.group_index}
              onClick={() => setCurrentGroup(g.group_index)}
              className={`max-sm:shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all tracking-wide ${
                currentGroup === g.group_index
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              District {g.group_index || g.name}
            </button>
          ))}
        </div>
      )}

      {totalGroups > 1 ? (
        <div className="mb-4 text-xs text-slate-500 font-medium">
          District {currentGroupDef.group_index || currentGroupDef.name} &middot; {currentGroupDef.capacity} slots &middot; {filledCount} filled &middot; {availableCount} available
        </div>
      ) : (
        <div className="mb-4 text-xs text-slate-500 font-medium">
          {filledCount} filled &middot; {availableCount} available
        </div>
      )}

      <div className="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2 sm:gap-2.5 w-full">
        {currentGroupSlots.map((slot) => {
          const rawLabel = slot.groupLabel || String(slot.number);
          const slotNum = rawLabel.startsWith('D') ? rawLabel : `D${currentGroupDef.group_index || 1}-${String(slot.number || 1).padStart(2, '0')}`;
          const isOccupied = slot.status === 'occupied' || slot.status === 'confirmed';
          return (
            <div
              key={slot.groupLabel || slot.number}
              className={`aspect-square rounded-md flex items-center justify-center font-bold text-white text-[10px] sm:text-[11px] shadow-sm ${
                isOccupied ? 'bg-rose-500' : 'bg-emerald-500'
              }`}
              title={
                isOccupied
                  ? (slot.teamName ? `Occupied by ${slot.teamName}` : 'Occupied')
                  : 'Available'
              }
            >
              {slotNum}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-200 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] bg-emerald-500 shadow-sm" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[4px] bg-rose-500 shadow-sm" />
          <span>Occupied</span>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">
            District Registration Details
          </h4>
          {totalGroups > 1 && (
            <span className="text-[11px] font-semibold text-slate-400">
              District {currentGroupDef.group_index || currentGroupDef.name}
            </span>
          )}
        </div>

        {occupiedSlots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <svg className="w-7 h-7 mb-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-xs font-medium">No teams registered in this district yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">Slots</th>
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">Team Name</th>
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">Team Leader</th>
                  <th className="text-left py-2.5 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {occupiedSlots.map((slot) => {
                  const rawLabel = slot.groupLabel || String(slot.number);
                  const slotNum = rawLabel.startsWith('D') ? rawLabel : `D${currentGroupDef.group_index || 1}-${String(slot.number || 1).padStart(2, '0')}`;
                  return (
                    <tr key={slot.groupLabel || slot.number} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 pr-4 font-bold text-slate-700 whitespace-nowrap">
                        {slotNum}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-800 font-semibold whitespace-nowrap">{slot.teamName}</td>
                      <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{slot.captain}</td>
                      <td className={`py-2.5 font-semibold whitespace-nowrap ${slot.paymentVerified ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {slot.paymentVerified ? 'Confirmed' : 'Not confirmed'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {occupiedSlots.length > 0 && (
          <div className="mt-3 text-[11px] text-slate-400 font-medium">
            Showing {confirmedCount} of {currentGroupDef.capacity} slots occupied in this district.
          </div>
        )}
      </div>
    </div>
  );
}