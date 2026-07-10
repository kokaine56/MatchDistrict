import React, { useState, useMemo } from 'react';
import {
  computeRooms,
  getRoomSlots,
  getOccupiedRoomSlots,
  getHardCeiling,
  getFloorConstraint,
} from '../utils/roomSplitter';

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
      (s) => s.status === 'occupied' || s.status === 'confirmed'
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

  const { totalRooms, rooms, maxSlotsPerRoom, floorConstraint } = roomMeta;
  const currentRoomDef = rooms[currentRoom - 1];
  const isUnderFloor = currentRoomDef && currentRoomDef.slotsInRoom < floorConstraint;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm w-full">
      <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">
        Live Slot Occupancy Map
      </h3>

      {totalRooms > 1 && (
        <div className="max-sm:flex max-sm:overflow-x-auto max-sm:scrollbar-none max-sm:gap-2 max-sm:pb-2 sm:flex sm:flex-wrap sm:gap-2 mb-5">
          {rooms.map((r) => (
            <button
              key={r.roomNumber}
              onClick={() => setCurrentRoom(r.roomNumber)}
              className={`max-sm:shrink-0 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all tracking-wide ${
                currentRoom === r.roomNumber
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              Room {r.roomNumber}
            </button>
          ))}
        </div>
      )}

      {totalRooms > 1 ? (
        <div className="mb-4 text-xs text-slate-500 font-medium">
          Room {currentRoom} &middot; {currentRoomDef?.slotsInRoom || 0} slots &middot; {filledCount} filled &middot; {availableCount} available
        </div>
      ) : (
        <div className="mb-4 text-xs text-slate-500 font-medium">
          {filledCount} filled &middot; {availableCount} available
        </div>
      )}

      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 max-sm:gap-2 sm:gap-2.5 w-full">
        {currentRoomSlots.map((slot, idx) => {
          const slotNum = slot.number;
          const isOccupied = slot.status === 'occupied' || slot.status === 'confirmed';
          return (
            <div
              key={idx}
              className={`aspect-square max-sm:text-[10px] max-sm:rounded-lg sm:text-xs sm:rounded-xl font-black flex items-center justify-center ${
                isOccupied
                  ? 'bg-red-500 text-white border border-red-600'
                  : 'bg-green-500 text-white border border-green-600'
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

      <div className="flex items-center gap-4 mt-6 pt-4 border-t border-slate-100 text-xs font-bold text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span>Occupied</span>
        </div>
      </div>

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
          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
            <svg className="w-7 h-7 mb-3 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">Slot #</th>
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">Team Name</th>
                  <th className="text-left py-2.5 pr-4 font-bold text-slate-500 uppercase tracking-wider">Team Leader</th>
                  <th className="text-left py-2.5 font-bold text-slate-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {occupiedSlots.map((entry) => (
                  <tr key={entry.slotNumber} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 pr-4 font-bold text-slate-700 whitespace-nowrap">Slot {entry.slotNumber}</td>
                    <td className="py-2.5 pr-4 text-slate-800 font-semibold whitespace-nowrap">{entry.teamName}</td>
                    <td className="py-2.5 pr-4 text-slate-600 whitespace-nowrap">{entry.captain}</td>
                    <td className="py-2.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          entry.status === 'occupied'
                            ? 'bg-red-50 text-red-600 border border-red-200'
                            : entry.status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-600 border border-amber-200 animate-pulse'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            entry.status === 'occupied' ? 'bg-red-500' : entry.status === 'confirmed' ? 'bg-emerald-500' : 'bg-amber-500'
                          }`}
                        />
                        {entry.status === 'occupied' ? 'Approved' : entry.status === 'confirmed' ? 'Confirmed' : 'Pending'}
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
            Showing {occupiedSlots.length} of {currentRoomDef?.slotsInRoom || 0} slots occupied in this room.
          </div>
        )}

        {isUnderFloor && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
            <svg className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-xs font-bold text-amber-800">Room Below Minimum Density</p>
              <p className="text-[11px] text-amber-700 mt-0.5">
                This room has {currentRoomDef?.slotsInRoom} slots, which is below the {floorConstraint}-slot minimum for{' '}
                {(matchType || 'squad').charAt(0).toUpperCase() + (matchType || 'squad').slice(1)} matches.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
