/**
 * roomSplitter.js — Dynamic Room Allocation with Overflow Balancing
 *
 * Hard ceilings per match type (absolute max bounds):
 *   Solo  → 100 slots/room
 *   Duo   → 50  slots/room
 *   Squad → 25  slots/room
 *
 * Organizer may set a custom maxSlotsPerRoom (M) ≤ the hard ceiling.
 * If unspecified, defaults to the hard ceiling.
 *
 * Phase 1 — Initial split:
 *   initialRooms  = floor(totalSlots / M)
 *   remainder     = totalSlots % M
 *   If remainder === 0 → every room has exactly M slots, done.
 *   If remainder  > 0 → a partial final room would be created.
 *
 * Phase 2 — Overflow balance check:
 *   newCapacity = ceil(totalSlots / initialRooms)
 *   If newCapacity ≤ gameCeiling → COLLAPSE the extra room.
 *     Redistribute totalSlots evenly across initialRooms rooms:
 *       base  = floor(totalSlots / initialRooms)
 *       extra = totalSlots % initialRooms
 *       First `extra` rooms get `base + 1` slots, rest get `base` slots.
 *   Otherwise → keep the partial room (no collapse).
 *
 * Every room reports its own slotStart / slotEnd so consumers
 * can slice the master slot array per-room without assuming uniform size.
 */

const HARD_CEILINGS = Object.freeze({
  solo: 100,
  duo: 50,
  squad: 25,
});

/**
 * Returns the absolute max slots allowed per room for a match type.
 * @param {string} matchType
 * @returns {number}
 */
function getHardCeiling(matchType) {
  return HARD_CEILINGS[(matchType || '').toLowerCase()] || HARD_CEILINGS.squad;
}

/**
 * Validates an organizer-supplied maxSlotsPerRoom value.
 * Returns { valid: true, value } or { valid: false, error }.
 * @param {string} matchType
 * @param {number|string|null|undefined} maxSlotsPerRoom
 * @returns {{ valid: boolean, value?: number, error?: string }}
 */
function validateMaxSlotsPerRoom(matchType, maxSlotsPerRoom) {
  const ceiling = getHardCeiling(matchType);
  const label = (matchType || 'Squad').charAt(0).toUpperCase() + (matchType || 'Squad').slice(1);

  if (maxSlotsPerRoom == null || maxSlotsPerRoom === '') {
    return { valid: true, value: ceiling };
  }

  const m = Number(maxSlotsPerRoom);
  if (!Number.isInteger(m) || m <= 0) {
    return { valid: false, error: 'Max slots per room must be a positive integer.' };
  }
  if (m > ceiling) {
    return {
      valid: false,
      error: `${label} tournaments allow at most ${ceiling} slots per room.`,
    };
  }
  return { valid: true, value: m };
}

/**
 * Compute room metadata from totalSlots, the effective maxSlotsPerRoom,
 * and the match type's hard ceiling (for overflow balancing).
 *
 * @param {number} totalSlots       — total tournament slots (e.g. 128)
 * @param {number} maxSlotsPerRoom  — organizer target per room (M, e.g. 18)
 * @param {number} [gameCeiling]    — absolute max per room (squad=25, duo=50, solo=100)
 * @returns {{
 *   totalRooms: number,
 *   maxSlotsPerRoom: number,
 *   gameCeiling: number,
 *   balanced: boolean,
 *   rooms: Array<{ roomNumber: number, slotStart: number, slotEnd: number, slotsInRoom: number }>
 * }}
 */
function computeRooms(totalSlots, maxSlotsPerRoom, gameCeiling) {
  const m = Math.max(1, Math.floor(Number(maxSlotsPerRoom) || 1));
  const total = Math.max(0, Math.floor(Number(totalSlots) || 0));
  const ceiling = gameCeiling || getHardCeiling('squad');

  if (total === 0) {
    return { totalRooms: 0, maxSlotsPerRoom: m, gameCeiling: ceiling, balanced: false, rooms: [] };
  }

  // Phase 1 — simple split
  const initialRooms = Math.floor(total / m);
  const remainder = total % m;

  // When total ≤ M or divides evenly, no balancing needed
  if (total <= m || remainder === 0) {
    const count = Math.ceil(total / m);
    const rooms = buildRooms(count, m, total);
    return { totalRooms: count, maxSlotsPerRoom: m, gameCeiling: ceiling, balanced: false, rooms };
  }

  // Phase 2 — overflow balance check
  const newCapacity = Math.ceil(total / initialRooms);

  if (newCapacity <= ceiling) {
    // COLLAPSE: redistribute evenly across initialRooms rooms
    const base = Math.floor(total / initialRooms);
    const extra = total % initialRooms;
    const slotSizes = [];
    for (let i = 0; i < initialRooms; i++) {
      slotSizes.push(i < extra ? base + 1 : base);
    }
    const rooms = buildRoomsFromSizes(slotSizes, total);
    return {
      totalRooms: initialRooms,
      maxSlotsPerRoom: m,
      gameCeiling: ceiling,
      balanced: true,
      rooms,
    };
  }

  // Cannot collapse — keep the partial final room
  const count = Math.ceil(total / m);
  const rooms = buildRooms(count, m, total);
  return { totalRooms: count, maxSlotsPerRoom: m, gameCeiling: ceiling, balanced: false, rooms };
}

/**
 * Build rooms array where every room holds `m` slots (last may be smaller).
 * @param {number} roomCount
 * @param {number} m       — uniform slots per room
 * @param {number} total   — total slots
 * @returns {Array<{ roomNumber: number, slotStart: number, slotEnd: number, slotsInRoom: number }>}
 */
function buildRooms(roomCount, m, total) {
  const rooms = [];
  for (let r = 0; r < roomCount; r++) {
    const start = r * m + 1;
    const end = Math.min((r + 1) * m, total);
    rooms.push({
      roomNumber: r + 1,
      slotStart: start,
      slotEnd: end,
      slotsInRoom: end - start + 1,
    });
  }
  return rooms;
}

/**
 * Build rooms from an explicit array of per-room slot counts.
 * @param {number[]} slotSizes  — e.g. [19, 19, 18, 18, 18, 18, 18]
 * @param {number} total        — total slots (sum of slotSizes)
 * @returns {Array<{ roomNumber: number, slotStart: number, slotEnd: number, slotsInRoom: number }>}
 */
function buildRoomsFromSizes(slotSizes, total) {
  const rooms = [];
  let cursor = 1;
  for (let i = 0; i < slotSizes.length; i++) {
    const size = slotSizes[i];
    const start = cursor;
    const end = cursor + size - 1;
    rooms.push({
      roomNumber: i + 1,
      slotStart: start,
      slotEnd: end,
      slotsInRoom: size,
    });
    cursor += size;
  }
  return rooms;
}

/**
 * Given a flat array of all slots (0-indexed, full length = totalSlots),
 * return only the slice corresponding to the requested room.
 * Slot numbers within the slice are re-based to start at 1.
 *
 * @param {Array<any>} allSlots     — full-length slot array
 * @param {number} roomNumber       — 1-indexed room number
 * @param {Array<{ slotStart: number, slotEnd: number }>} rooms — rooms array from computeRooms
 * @returns {Array<any>}
 */
function getRoomSlots(allSlots, roomNumber, rooms) {
  if (!Array.isArray(allSlots)) return [];
  if (!Array.isArray(rooms) || rooms.length === 0) return [];

  const roomIdx = Math.max(0, Math.floor(Number(roomNumber) - 1));
  const roomDef = rooms[roomIdx];
  if (!roomDef) return [];

  const startIdx = roomDef.slotStart - 1; // 0-indexed
  const endIdx = roomDef.slotEnd;          // exclusive
  const slice = allSlots.slice(startIdx, endIdx);

  return slice.map((slot, i) => ({
    ...slot,
    number: i + 1,
    absoluteNumber: startIdx + i + 1,
  }));
}

/**
 * Return only the occupied slots for a given room.
 * Each entry includes the re-based slot number, team name, and captain.
 * @param {Array<any>} allSlots
 * @param {number} roomNumber
 * @param {Array<{ slotStart: number, slotEnd: number }>} rooms
 * @returns {Array<{ slotNumber: number, teamName: string, captain: string, status: string }>}
 */
function getOccupiedRoomSlots(allSlots, roomNumber, rooms) {
  const roomSlots = getRoomSlots(allSlots, roomNumber, rooms);
  return roomSlots
    .filter((s) => s.status === 'occupied' || s.status === 'pending')
    .map((s) => ({
      slotNumber: s.number,
      teamName: s.teamName || '—',
      captain: s.captain || '—',
      status: s.status,
    }));
}

export {
  HARD_CEILINGS,
  getHardCeiling,
  validateMaxSlotsPerRoom,
  computeRooms,
  getRoomSlots,
  getOccupiedRoomSlots,
};
