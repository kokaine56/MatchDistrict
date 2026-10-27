// server/allocationService.js
// Single source of truth for TOURNAMENT TEAM → ROADMAP allocation.
//
// The service places a verified tournament team into an available position in the
// tournament's EXISTING approved roadmap (Round → Day → Group → Room → Match). It
// never creates/edits days, groups, rooms, matches, match timings or rounds, and it
// never reshuffles existing assignments. The same code path is used for automatic
// placement (participant becomes VERIFIED) and organizer manual placement (move to
// a chosen room+match), so both flows share capacity, concurrency, idempotency,
// state and audit rules.
//
// Concurrency: the caller controls the transaction (no hidden COMMIT/ROLLBACK).
// allocateTeam locks the tournament row FOR UPDATE first, then the team row FOR
// UPDATE. Tournament-first ordering matches qualification and finalization and
// prevents a qualification batch from deadlocking against a concurrent move.
// Every verification of available capacity happens
// inside the same transaction that performs the insert.
//
// Idempotency: re-calling allocateTeam for an already-allocated team under the
// automatic flow returns { status: 'allocated', alreadyAllocated: true } without
// touching data. A manual move on an allocated team is a real move.
import { randomBytes } from 'node:crypto';
import { isEligibleRegistrationStatus } from './registrationTeamBridge.js';

export const ALLOCATION_SOURCES = Object.freeze({
  AUTOMATIC: 'automatic',
  ORGANIZER: 'organizer',
  ADVANCEMENT: 'advancement',
});

export const ALLOCATED_STATUS = 'allocated';
export const ALLOCATION_PENDING_STATUS = 'allocation_pending';
export const VERIFIED_STATUS = 'verified';
export const MEMBERS_COMPLETE_STATUS = 'members_complete';
export const AWAITING_MEMBERS_STATUS = 'awaiting_members';

export const ALLOCATION_ERR = Object.freeze({
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
  TOURNAMENT_FINALIZED: 'TOURNAMENT_FINALIZED',
  TOURNAMENT_MISMATCH: 'TOURNAMENT_MISMATCH',
  ROADMAP_NOT_APPROVED: 'ROADMAP_NOT_APPROVED',
  TEAM_NOT_COMPLETE: 'TEAM_NOT_COMPLETE',
  TEAM_NOT_VERIFIED: 'TEAM_NOT_VERIFIED',
  TEAM_NOT_ELIGIBLE: 'TEAM_NOT_ELIGIBLE',
  TEAM_ALREADY_ALLOCATED: 'TEAM_ALREADY_ALLOCATED',
  NO_AVAILABLE_POSITION: 'NO_AVAILABLE_POSITION',
  ALLOCATION_CONFLICT: 'ALLOCATION_CONFLICT',
});

export class AllocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AllocationError';
    this.code = code;
  }
}

export function allocationError(code, message) {
  return new AllocationError(code, message);
}

export function randomId(prefix = 'ASN-') {
  return prefix + randomBytes(6).toString('hex').toUpperCase();
}

// --- Pure helpers (unit-testable without a database) ---

export function normalizeSource(source) {
  if (source === ALLOCATION_SOURCES.ORGANIZER) return ALLOCATION_SOURCES.ORGANIZER;
  if (source === ALLOCATION_SOURCES.ADVANCEMENT) return ALLOCATION_SOURCES.ADVANCEMENT;
  return ALLOCATION_SOURCES.AUTOMATIC;
}

// Which team statuses may proceed to allocation, per source.
//   automatic:   verified (first placement after members_complete) or
//                allocation_pending (a release frees a position later)
//   organizer:   additionally an already-allocated team (a move)
//   advancement: additionally an already-allocated team that qualified out of a
//                completed round, placed into the next round's first free room
export function canTransitionFromStatus(status, source) {
  const src = normalizeSource(source);
  if (status === VERIFIED_STATUS || status === ALLOCATION_PENDING_STATUS) return true;
  if (src === ALLOCATION_SOURCES.ORGANIZER && status === ALLOCATED_STATUS) return true;
  if (src === ALLOCATION_SOURCES.ADVANCEMENT && status === ALLOCATED_STATUS) return true;
  return false;
}

// Deterministic round-number pick: the smallest configured round_number, or 1 when
// no rounds exist (legacy roadmaps are Round 1). Rounds with NULL/blank numbers fall
// back to 1 (COALESCE rule mirrors the service SQL).
export function firstRoundNumberOf(roundRows = []) {
  let min = null;
  for (const r of roundRows) {
    const n = Number(r == null ? NaN : (r.round_number ?? r.roundNumber));
    if (Number.isFinite(n) && n >= 1 && (min === null || n < min)) min = n;
  }
  return min === null ? 1 : min;
}

// Pure room-selection rule. Rooms must already be sorted in deterministic order
// (round_number → day_number → group_sequence → room_number). The picker skips any
// room whose round_number exceeds 1 (later rounds are populated only by results /
// qualification), returning the first Round 1 room with remaining capacity, or null
// (no available position). `occupancy` maps room id → allocated-team count.
// Picks the first room with spare capacity that belongs to the requested round.
//   automatic placement targets Round 1 (default); advancement allocation targets
//   the next round's first free room, so later rounds are only populated by
//   results-driven qualification, never by the initial (verify-time) placement.
export function selectRoomForTeam(rooms = [], occupancy = {}, roundNumber = 1) {
  const targetRound = Number(roundNumber) || 1;
  for (const room of rooms) {
    const rn = Number(room.round_number ?? room.roundNumber ?? 1) || 1;
    if (rn !== targetRound) continue;
    const used = Number(occupancy[room.id] ?? occupancy[room.roomId] ?? 0) || 0;
    if (used < Number(room.capacity)) return room;
  }
  return null;
}

// Builds the row descriptors for an automatic placement (one assignment per match
// in the chosen room). Never references room credentials.
export function buildAutomaticAssignmentRows({ tournamentId, teamId, room, matchIds = [], slotNumber = null, source = ALLOCATION_SOURCES.AUTOMATIC, idFn = null }) {
  const roomId = room.id ?? room.roomId;
  const groupId = room.group_id ?? room.groupId;
  const dayId = room.day_id ?? room.dayId;
  return matchIds.map((matchId) => ({
    id: idFn ? idFn() : randomId('ASN-'),
    tournament_id: tournamentId,
    tournament_team_id: teamId,
    match_id: matchId,
    room_id: roomId,
    group_id: groupId,
    day_id: dayId,
    slot_number: slotNumber,
    source,
  }));
}

// New roadmaps keep team membership at group scope, with every match linked to
// its own technical room. Each scheduled match gets one assignment row for the
// same team/group membership.
export function buildPersistentGroupAssignmentRows({ tournamentId, teamId, groupId, matches = [], slotNumber = null, source = ALLOCATION_SOURCES.AUTOMATIC, idFn = null }) {
  return matches.map((match) => ({
    id: idFn ? idFn() : randomId('ASN-'),
    tournament_id: tournamentId,
    tournament_team_id: teamId,
    match_id: match.id ?? match.match_id,
    room_id: match.room_id,
    group_id: groupId,
    day_id: match.day_id,
    slot_number: slotNumber,
    source,
  }));
}

async function findAvailableSlotNumber(client, { tournamentId, scopeColumn, scopeId, capacity }) {
  if (!['group_id', 'room_id'].includes(scopeColumn)) {
    throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'Invalid allocation scope.');
  }
  const slotsRes = await client.query(
    `SELECT DISTINCT slot_number
     FROM tournament_match_assignments
     WHERE tournament_id = $1::varchar AND ${scopeColumn} = $2::varchar
       AND status = 'allocated' AND slot_number IS NOT NULL`,
    [tournamentId, scopeId]
  );
  const usedSlots = new Set(slotsRes.rows.map((row) => Number(row.slot_number)).filter((slot) => Number.isInteger(slot) && slot > 0));
  const maxCapacity = Math.max(0, Number(capacity) || 0);
  for (let slot = 1; slot <= maxCapacity; slot += 1) {
    if (!usedSlots.has(slot)) return slot;
  }
  throw allocationError(ALLOCATION_ERR.NO_AVAILABLE_POSITION, 'No available slot exists in the selected roadmap allocation.');
}

// Pure manual-target gate. room = destination room row, match = the room's match
// row (or null), occupancyInRoomExcludingTeam = distinct teams already in the room
// (excluding the moving team). Returns { ok:true } or { ok:false, code, message }.
export function validateManualTarget(room, match, occupancyInRoomExcludingTeam) {
  if (!room) {
    return { ok: false, code: ALLOCATION_ERR.ALLOCATION_CONFLICT, message: 'Destination room not found.' };
  }
  if (!match) {
    return { ok: false, code: ALLOCATION_ERR.ALLOCATION_CONFLICT, message: 'Target match does not belong to the destination room.' };
  }
  const used = Number(occupancyInRoomExcludingTeam) || 0;
  if (used >= Number(room.capacity)) {
    return { ok: false, code: ALLOCATION_ERR.ALLOCATION_CONFLICT, message: 'Destination room is at full capacity.' };
  }
  return { ok: true };
}

// --- Insert + audit primitives ---

async function insertAssignments(client, rows) {
  for (const row of rows) {
    try {
      await client.query(
        `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, room_id, group_id, day_id, slot_number, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [row.id, row.tournament_id, row.tournament_team_id, row.match_id, row.room_id, row.group_id, row.day_id, row.slot_number, row.source]
      );
    } catch (err) {
      if (err && err.code === '23505') {
        throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'A conflicting allocation already exists. Please refresh and retry.');
      }
      throw err;
    }
  }
}

async function writeAudit(client, { actorId, source, tournamentId, team, room, matchIds, reason, assignmentCount, oldSnapshot = null }) {
  const logId = 'LOG-' + randomBytes(6).toString('hex').toUpperCase();
  const details = {
    source,
    tournament_id: tournamentId,
    team_id: team.id,
    team_name: team.team_name,
    room_id: room ? (room.id ?? room.room_id) : null,
    room_number: room ? (room.room_number ?? null) : null,
    group_id: room ? (room.group_id ?? null) : null,
    day_id: room ? (room.day_id ?? null) : null,
    match_ids: matchIds || [],
    assignment_count: assignmentCount,
    reason: reason || null,
    allocated_at: new Date().toISOString(),
  };
  if (oldSnapshot) details.old_assignments = oldSnapshot;
  const action = source === ALLOCATION_SOURCES.AUTOMATIC ? 'allocation_automatic'
    : source === ALLOCATION_SOURCES.ADVANCEMENT ? 'allocation_advancement'
    : 'allocation_move';
  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [logId, actorId || 'SYSTEM', action, 'allocation', 'tournament_team', team.id, JSON.stringify(details)]
  );
}

// --- Automatic placement (participant VERIFIED, fills first available slot in the
//     target round — Round 1 for the initial placement, or the next round for an
//     advancement placement) ---

async function allocateAutomatic(client, { team, tournamentId, actorId, source = ALLOCATION_SOURCES.AUTOMATIC, targetRoundNumber = null }) {
  const teamId = team.id;
  const src = normalizeSource(source);

  let targetRound;
  let targetRoundId;

  if (src === ALLOCATION_SOURCES.ADVANCEMENT) {
    const parsed = parseInt(targetRoundNumber, 10);
    if (!(parsed >= 1)) {
      throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'A valid target round number is required for advancement allocation.');
    }
    targetRound = parsed;
    const tRoundRes = await client.query(
      'SELECT id FROM tournament_rounds WHERE tournament_id = $1 AND round_number = $2',
      [tournamentId, targetRound]
    );
    if (tRoundRes.rows.length === 0) {
      throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, `Round ${targetRound} does not exist for this tournament.`);
    }
    targetRoundId = tRoundRes.rows[0].id;

    // Advancement idempotency: a team already placed inside the target round is
    // left untouched (re-running qualification must never double-place).
    const inRoundRes = await client.query(
      `SELECT 1
       FROM tournament_match_assignments a
       JOIN tournament_matches m ON m.id = a.match_id AND m.tournament_id = $1
       WHERE a.tournament_team_id = $2 AND a.tournament_id = $1 AND m.round_id = $3
       LIMIT 1`,
      [tournamentId, teamId, targetRoundId]
    );
    if (inRoundRes.rows.length > 0) {
      return {
        status: ALLOCATED_STATUS,
        source: src,
        code: ALLOCATION_ERR.TEAM_ALREADY_ALLOCATED,
        alreadyAllocated: true,
        message: `Team is already allocated in Round ${targetRound}.`,
        room: null,
        matchIds: [],
        assignmentCount: 0,
      };
    }
  } else {
    // The initial placement only ever populates the earliest round; later rounds
    // are filled by results-driven qualification.
    const firstRoundRes = await client.query(
      'SELECT COALESCE(MIN(round_number), 1)::int AS first_round FROM tournament_rounds WHERE tournament_id = $1',
      [tournamentId]
    );
    targetRound = firstRoundRes.rows[0].first_round;
  }

  // Deterministic pick inside the target round only: earliest day → group → room
  // with free capacity and at least one scheduled match. The occupancy subquery
  // counts distinct teams per room, so one team = one occupied position regardless
  // of per-match rows (a team is placed against every match in its room).
  const roomRes = await client.query(`
    WITH group_shape AS (
      SELECT group_id, COUNT(*) AS match_count,
             COUNT(DISTINCT match_number) AS distinct_match_count
      FROM tournament_matches
      WHERE tournament_id = $1
      GROUP BY group_id
    ),
    group_occupancy AS (
      SELECT group_id, COUNT(DISTINCT tournament_team_id) AS allocated_teams
      FROM tournament_match_assignments
      WHERE tournament_id = $1
      GROUP BY group_id
    ),
    room_occupancy AS (
      SELECT group_id, room_id, COUNT(DISTINCT tournament_team_id) AS allocated_teams
      FROM tournament_match_assignments
      WHERE tournament_id = $1
      GROUP BY group_id, room_id
    )
    SELECT r.id, r.group_id, r.day_id, r.capacity, r.room_number,
           d.day_number,
           g.sequence AS group_sequence,
           COALESCE(rnd.round_number, 1)::int AS round_number,
           (gs.match_count = gs.distinct_match_count) AS persistent_group,
           COALESCE(CASE WHEN gs.match_count = gs.distinct_match_count
             THEN go.allocated_teams ELSE ro.allocated_teams END, 0)::int AS allocated_teams
    FROM tournament_rooms r
    JOIN tournament_days d ON d.id = r.day_id
    JOIN tournament_groups g ON g.id = r.group_id
    JOIN group_shape gs ON gs.group_id = g.id
    LEFT JOIN tournament_rounds rnd ON rnd.id = r.round_id
    LEFT JOIN group_occupancy go ON go.group_id = r.group_id
    LEFT JOIN room_occupancy ro ON ro.group_id = r.group_id AND ro.room_id = r.id
    WHERE r.tournament_id = $1
      AND COALESCE(rnd.round_number, 1)::int = $2
      AND COALESCE(CASE WHEN gs.match_count = gs.distinct_match_count
        THEN go.allocated_teams ELSE ro.allocated_teams END, 0)::int < r.capacity
      AND EXISTS (SELECT 1 FROM tournament_matches mq WHERE mq.room_id = r.id)
    ORDER BY COALESCE(rnd.round_number, 1)::int ASC, d.day_number ASC, g.sequence ASC, r.room_number ASC
    LIMIT 1
  `, [tournamentId, targetRound]);

  if (roomRes.rows.length === 0) {
    await client.query(
      "UPDATE tournament_teams SET status = 'allocation_pending', updated_at = NOW() WHERE id = $1",
      [teamId]
    );
    return {
      status: ALLOCATION_PENDING_STATUS,
      source: src,
      code: ALLOCATION_ERR.NO_AVAILABLE_POSITION,
      message: 'No available position exists in the approved roadmap for this round.',
      room: null,
      matchIds: [],
      assignmentCount: 0,
    };
  }

  const room = roomRes.rows[0];
  const matchesRes = await client.query(
    room.persistent_group
      ? 'SELECT id, room_id, day_id, match_number FROM tournament_matches WHERE group_id = $1 AND tournament_id = $2 ORDER BY match_number ASC'
      : 'SELECT id, room_id, day_id, match_number FROM tournament_matches WHERE room_id = $1 AND tournament_id = $2 ORDER BY match_number ASC',
    [room.persistent_group ? room.group_id : room.id, tournamentId]
  );
  const matchIds = matchesRes.rows.map((m) => m.id);

  if (matchIds.length === 0) {
    throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'The selected roadmap room has no scheduled matches.');
  }

  const slotNumber = await findAvailableSlotNumber(client, {
    tournamentId,
    scopeColumn: room.persistent_group ? 'group_id' : 'room_id',
    scopeId: room.persistent_group ? room.group_id : room.id,
    capacity: room.capacity,
  });
  const rows = room.persistent_group
    ? buildPersistentGroupAssignmentRows({ tournamentId, teamId, groupId: room.group_id, matches: matchesRes.rows, slotNumber, source: src })
    : buildAutomaticAssignmentRows({ tournamentId, teamId, room, matchIds, slotNumber, source: src });
  await insertAssignments(client, rows);

  await client.query("UPDATE tournament_teams SET status = 'allocated', updated_at = NOW() WHERE id = $1", [teamId]);
  await writeAudit(client, {
    actorId,
    source: src,
    tournamentId,
    team,
    room,
    matchIds,
    reason: null,
    assignmentCount: rows.length,
  });

  return {
    status: ALLOCATED_STATUS,
    source: src,
    code: ALLOCATED_STATUS,
    message: src === ALLOCATION_SOURCES.ADVANCEMENT
      ? 'Team advanced to the next round and was allocated to the first available roadmap slot.'
      : 'Team verified and automatically allocated to the first available tournament roadmap slot.',
    room: { id: room.id, room_number: room.room_number, day_number: room.day_number, group_sequence: room.group_sequence, capacity: room.capacity },
    matchIds,
    assignmentCount: rows.length,
  };
}

// --- Manual placement (organizer move to an explicit room + match) ---

async function allocateManual(client, { team, tournamentId, opts, actorId }) {
  const teamId = team.id;
  const roomId = opts.roomId || opts.room_id;
  const matchId = opts.matchId || opts.match_id;
  const reason = opts.reason || null;
  if (!roomId || !matchId) {
    throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'Destination room and match are required for a manual allocation.');
  }

  const roomRes = await client.query(
    'SELECT id, group_id, day_id, capacity, tournament_id, room_number FROM tournament_rooms WHERE id = $1',
    [roomId]
  );
  const room = roomRes.rows[0] || null;
  if (!room) {
    throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'Destination room not found.');
  }
  if (room.tournament_id !== tournamentId) {
    throw allocationError(ALLOCATION_ERR.TOURNAMENT_MISMATCH, 'Destination room belongs to another tournament.');
  }

  const matchRes = await client.query(
    'SELECT id, group_id, match_number FROM tournament_matches WHERE id = $1 AND room_id = $2 AND tournament_id = $3',
    [matchId, roomId, tournamentId]
  );
  const match = matchRes.rows[0] || null;

  const shapeRes = match ? await client.query(
    `SELECT COUNT(*) AS match_count, COUNT(DISTINCT match_number) AS distinct_match_count
     FROM tournament_matches WHERE group_id = $1 AND tournament_id = $2`,
    [match.group_id, tournamentId]
  ) : { rows: [{ match_count: 0, distinct_match_count: 0 }] };
  const persistentGroup = Number(shapeRes.rows[0].match_count) === Number(shapeRes.rows[0].distinct_match_count);
  const capacityRes = await client.query(
    `SELECT COUNT(DISTINCT tournament_team_id)::int AS n
     FROM tournament_match_assignments
     WHERE ${persistentGroup ? 'group_id' : 'room_id'} = $1 AND tournament_id = $2 AND tournament_team_id != $3`,
    [persistentGroup ? match.group_id : roomId, tournamentId, teamId]
  );
  const gate = validateManualTarget(room, match, capacityRes.rows[0].n);
  if (!gate.ok) {
    throw allocationError(gate.code, gate.message);
  }

  const oldRes = await client.query(
    'SELECT id, match_id, room_id, group_id, day_id FROM tournament_match_assignments WHERE tournament_team_id = $1',
    [teamId]
  );
  const oldAssignments = oldRes.rows;

  await client.query('DELETE FROM tournament_match_assignments WHERE tournament_team_id = $1', [teamId]);

  const targetMatchesRes = await client.query(
    persistentGroup
      ? 'SELECT id, room_id, day_id FROM tournament_matches WHERE group_id = $1 AND tournament_id = $2 ORDER BY match_number ASC'
      : 'SELECT id, room_id, day_id FROM tournament_matches WHERE id = $1 AND tournament_id = $2',
    [persistentGroup ? match.group_id : matchId, tournamentId]
  );
  const slotNumber = await findAvailableSlotNumber(client, {
    tournamentId,
    scopeColumn: persistentGroup ? 'group_id' : 'room_id',
    scopeId: persistentGroup ? match.group_id : roomId,
    capacity: room.capacity,
  });
  const rows = buildPersistentGroupAssignmentRows({
    tournamentId,
    teamId,
    groupId: match.group_id,
    matches: targetMatchesRes.rows,
    slotNumber,
    source: ALLOCATION_SOURCES.ORGANIZER,
  });
  await insertAssignments(client, rows);

  await client.query("UPDATE tournament_teams SET status = 'allocated', updated_at = NOW() WHERE id = $1", [teamId]);

  await writeAudit(client, {
    actorId,
    source: ALLOCATION_SOURCES.ORGANIZER,
    tournamentId,
    team,
    room,
    matchIds: rows.map((r) => r.match_id),
    reason,
    assignmentCount: rows.length,
    oldSnapshot: oldAssignments,
  });

  return {
    status: ALLOCATED_STATUS,
    source: ALLOCATION_SOURCES.ORGANIZER,
    code: ALLOCATED_STATUS,
    message: 'Allocation moved successfully',
    room: { id: room.id, room_number: room.room_number, capacity: room.capacity },
    matchIds: rows.map((r) => r.match_id),
    assignmentCount: rows.length,
  };
}

// --- Public entry point ---
//
// Parameters:
//   teamId, tournamentId  — required
//   source                — 'automatic' | 'organizer' | 'advancement' (defaults to 'automatic')
//   options               — { roomId, matchId, reason } for organizer moves;
//                           { targetRoundNumber (or targetRound) } for advancement
//   actorId               — acting user id; 'SYSTEM' when null (automatic audit)
//   ensureEligibleRegistration — revalidate the linked registration (default true)
//
// Returns (resolves):
//   { status: 'allocated', source, code, message, room, matchIds, assignmentCount }
//   { status: 'allocation_pending', source, code: NO_AVAILABLE_POSITION, message, ... } (automatic only)
//   { status: 'allocated', alreadyAllocated: true, ... } (idempotent automatic re-call)
//
// Throws AllocationError (code in ALLOCATION_ERR) for hard failures. The caller
// owns the transaction: on throw it must ROLLBACK.
export async function allocateTeam(client, {
  teamId,
  tournamentId,
  source = ALLOCATION_SOURCES.AUTOMATIC,
  options = {},
  actorId = null,
  ensureEligibleRegistration = true,
} = {}) {
  if (!client || !teamId || !tournamentId) {
    throw allocationError(ALLOCATION_ERR.TEAM_NOT_FOUND, 'teamId and tournamentId are required.');
  }
  const src = normalizeSource(source);
  const opts = options || {};

  // 1. Lock the tournament first. This is the shared serialization point for
  // allocation, qualification, result mutation, and finalization.
  const tournRes = await client.query(
    'SELECT "orgId", roadmap_status, finalized_at, status FROM tournaments WHERE id = $1 FOR UPDATE',
    [tournamentId]
  );
  if (tournRes.rows.length === 0) {
    throw allocationError(ALLOCATION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].finalized_at) {
    throw allocationError(ALLOCATION_ERR.TOURNAMENT_FINALIZED, 'This tournament is finalized; team allocations are locked.');
  }
  if (tournRes.rows[0].roadmap_status !== 'approved') {
    throw allocationError(ALLOCATION_ERR.ROADMAP_NOT_APPROVED, 'The tournament roadmap is not approved. Approve the roadmap before allocating teams.');
  }

  // 2. Lock the team row (serialization point for concurrent verify/move).
  const teamRes = await client.query(
    'SELECT id, tournament_id, status, team_name, registration_id FROM tournament_teams WHERE id = $1 FOR UPDATE',
    [teamId]
  );
  if (teamRes.rows.length === 0) {
    throw allocationError(ALLOCATION_ERR.TEAM_NOT_FOUND, 'Team not found.');
  }
  const team = teamRes.rows[0];
  if (team.tournament_id !== tournamentId) {
    throw allocationError(ALLOCATION_ERR.TOURNAMENT_MISMATCH, 'Team does not belong to this tournament.');
  }

  // 3. Idempotent short-circuit: an already-allocated team under the automatic
  //    flow is left untouched. Manual moves on allocated teams still proceed.
  if (team.status === ALLOCATED_STATUS && src === ALLOCATION_SOURCES.AUTOMATIC) {
    const existing = await client.query(
      'SELECT match_id FROM tournament_match_assignments WHERE tournament_team_id = $1 AND tournament_id = $2 LIMIT 1',
      [teamId, tournamentId]
    );
    if (existing.rows.length > 0) {
      return {
        status: ALLOCATED_STATUS,
        source: src,
        code: ALLOCATION_ERR.TEAM_ALREADY_ALLOCATED,
        alreadyAllocated: true,
        message: 'Team is already allocated.',
        room: null,
        matchIds: [],
        assignmentCount: existing.rows.length,
      };
    }
  }

  // 4. State gate.
  if (!canTransitionFromStatus(team.status, src)) {
    if (team.status === AWAITING_MEMBERS_STATUS || team.status === MEMBERS_COMPLETE_STATUS) {
      throw allocationError(ALLOCATION_ERR.TEAM_NOT_COMPLETE, 'Team has not completed its roster yet. All members must join before allocation.');
    }
    throw allocationError(ALLOCATION_ERR.TEAM_NOT_VERIFIED, 'Team must be verified before allocation.');
  }

  // 5. Registration-bridge eligibility (defense in depth; the verify handler also
  //    checks, but every allocation path revalidates the linked registration).
  if (team.registration_id && ensureEligibleRegistration) {
    const regRes = await client.query(
      'SELECT status FROM tournament_registrations WHERE id = $1 AND tournament_id = $2',
      [team.registration_id, tournamentId]
    );
    const linkedStatus = regRes.rows[0] ? regRes.rows[0].status : null;
    if (linkedStatus === null || !isEligibleRegistrationStatus(linkedStatus)) {
      throw allocationError(ALLOCATION_ERR.TEAM_NOT_ELIGIBLE, 'The registration linked to this team is no longer eligible for allocation. Please contact the organizer.');
    }
  }

  if (src === ALLOCATION_SOURCES.ORGANIZER) {
    return allocateManual(client, { team, tournamentId, opts, actorId });
  }
  return allocateAutomatic(client, {
    team,
    tournamentId,
    actorId,
    source: src,
    targetRoundNumber: opts.targetRoundNumber ?? opts.targetRound ?? null,
  });
}
