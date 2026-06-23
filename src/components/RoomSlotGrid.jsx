import React, { useState, useMemo } from 'react';
import {
  computeRooms,
  getRoomSlots,
  getOccupiedRoomSlots,
  getHardCeiling,
} from '../utils/roomSplitter';

/**
 * RoomSlotGrid — Interactive multi-room slot occupancy map
 *                  with room‑wise team roster table.
 *
 * Props:
 *   slotsData   — { slotsTotal, slotsFilled, slotsAvailable, slots[], roomMeta? }
 *   matchType   — 'solo' | 'duo' | 'squad' (used for hard‑ceiling default)
 *   maxSlotsPerRoom — optional override; falls back to roomMeta or hard ceiling
 */
export default function RoomSlotGrid({ slotsData, matchType, maxSlotsPerRoom: customMax }) {
  const [currentRoom, setCurrentRoom] = useState(1);

  const roomMeta = useMemo(() => {
    if (!slotsData) return null;
    const total = slotsData.slotsTotal || 0;
    const ceiling = getHardCeiling(matchType);
    const m = customMax
      || slotsData?.roomMeta?.maxSlotsPerRoom
      || ceiling;
    return computeRooms(total, m, ceiling);
  }, [slotsData, matchType, customMax]);

  const currentRoomSlots = useMemo(() => {
    if (!slotsData?.slots || !roomMeta) return [];
    return getRoomSlots(slotsData.slots, currentRoom, roomMeta.rooms);
  }, [slotsData, currentRoom, roomMeta]);

  const occupiedSlots = useMemo(() => {
    if (!slotsData?.slots || !roomMeta) return [];
    return getOccupiedRoomSlots(slotsData.slots, currentRoom, roomMeta.rooms);
  }, [slotsData, currentRoom, roomMeta]);

  const availableCount = useMemo(() => {
    return currentRoomSlots.filter((s) => s.status === 'available').length;
  }, [currentRoomSlots]);

  const filledCount = useMemo(() => {
    return currentRoomSlots.filter(
      (s) => s.status === 'occupied' || s.status === 'pending'
    ).length;
  }, [currentRoomSlots]);

  if (!slotsData || !roomMeta || roomMeta.totalRooms === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm w-full">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">
          Live Slot Occupancy Map
        </h3>
        <p className="text-sm text-slate-500">No slot data available.</p>
      </div>
    );
  }

  const { totalRooms, rooms, balanced, maxSlotsPerRoom } = roomMeta;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm w-full">
      {/* Title row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">
          Live Slot Occupancy Map
        </h3>
        {balanced && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Balanced
          </span>
        )}
      </div>

      {/* Room selector tabs */}
      {totalRooms > 1 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {rooms.map((r) => (
            <button
              key={r.roomNumber}
              onClick={() => setCurrentRoom(r.roomNumber)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all tracking-wide ${
                currentRoom === r.roomNumber
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              Room {r.roomNumber}
              <span className="ml-1.5 opacity-70 font-normal">
                ({r.slotStart}–{r.slotEnd})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Room header info */}
      {totalRooms > 1 && (
        <div className="mb-4 flex items-center gap-2 text-xs text-slate-500 font-medium">
          <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          </svg>
          <span>
            Viewing <strong className="text-slate-700">Room {currentRoom}</strong>
            {' '}— slots {rooms[currentRoom - 1]?.slotStart} to {rooms[currentRoom - 1]?.slotEnd}
            {' '}({rooms[currentRoom - 1]?.slotsInRoom} total, {filledCount} filled, {availableCount} available)
          </span>
        </div>
      )}

      {/* Single-room header (no tabs) */}
      {totalRooms <= 1 && (
        <div className="mb-4 flex items-center gap-2 text-xs text-slate-500 font-medium">
          <span>
            {filledCount} filled &middot; {availableCount} available
          </span>
        </div>
      )}

      {/* Slot grid */}
      <div className="grid grid-cols-4 sm:grid-cols-8 md:grid-cols-10 gap-2.5 w-full">
        {currentRoomSlots.map((slot, idx) => {
          const slotNum = slot.number;
          if (slot.status === 'occupied') {
            return (
              <div
                key={idx}
                className="aspect-square bg-red-50 border border-red-200 text-red-600 text-xs font-black rounded-xl flex items-center justify-center shadow-xs"
                title={`Occupied by ${slot.teamName || 'Unknown'}`}
              >
                {slotNum}
              </div>
            );
          }
          if (slot.status === 'pending') {
            return (
              <div
                key={idx}
                className="aspect-square bg-amber-50 border border-amber-200 text-amber-600 text-xs font-black rounded-xl flex items-center justify-center shadow-xs animate-pulse"
                title={`Pending: ${slot.teamName || 'Unknown'}`}
              >
                {slotNum}
              </div>
            );
          }
          return (
            <div
              key={idx}
              className="aspect-square bg-green-50 border border-green-200 text-green-600 text-xs font-black rounded-xl flex items-center justify-center shadow-xs"
              title="Available"
            >
              {slotNum}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span>Occupied</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          <span>Pending</span>
        </div>
        {totalRooms > 1 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v4H4z" /><path d="M4 10h16v4H4z" /><path d="M4 16h16v4H4z" />
            </svg>
            <span className="font-normal text-[11px] text-slate-400">
              {rooms.length} room{rooms.length > 1 ? 's' : ''} &middot; {maxSlotsPerRoom} target/room
              {balanced && <> &middot; balanced</>}
            </span>
          </div>
        )}
      </div>

      {/* ===== Room Registration Details ===== */}
      <div className="mt-8 pt-6 border-t border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">
            Room Registration Details
          </h4>
          {totalRooms > 1 && (
            <span className="text-[11px] font-semibold text-slate-400">
              Room {currentRoom}
            </span>
          )}
        </div>

        {occupiedSlots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400">
            <svg className="w-8 h-8 mb-2 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <p className="text-xs font-medium">No teams registered in this room yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">
                    Slot #
                  </th>
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">
                    Team Name
                  </th>
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">
                    Team Leader
                  </th>
                  <th className="text-left py-2.5 font-bold text-slate-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {occupiedSlots.map((entry) => (
                  <tr
                    key={entry.slotNumber}
                    className="hover:bg-slate-50 transition-colors"
                  >
                    <td className="py-2.5 pr-4 font-bold text-slate-700 whitespace-nowrap">
                      Slot {entry.slotNumber}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-800 font-semibold whitespace-nowrap">
                      {entry.teamName}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">
                      {entry.captain}
                    </td>
                    <td className="py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          entry.status === 'occupied'
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : 'bg-amber-50 text-amber-600 border border-amber-200 animate-pulse'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            entry.status === 'occupied' ? 'bg-red-500' : 'bg-amber-500'
                          }`}
                        />
                        {entry.status === 'occupied' ? 'Approved' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {occupiedSlots.length > 0 && (
          <div className="mt-3 text-[11px] text-slate-400 font-medium">
            Showing {occupiedSlots.length} of {rooms[currentRoom - 1]?.slotsInRoom || 0} slots occupied in this room.
          </div>
        )}
      </div>
    </div>
  );
}
