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
// allocateTeam locks the team row FOR UPDATE first, then the tournament row FOR
// UPDATE as the serialization point (because team→tournament lock ordering is
// uniform across automatic and manual paths, concurrent allocations cannot deadlock
// and never exceed room capacity). Every verification of available capacity happens
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
});

export const ALLOCATED_STATUS = 'allocated';
export const ALLOCATION_PENDING_STATUS = 'allocation_pending';
export const VERIFIED_STATUS = 'verified';
export const MEMBERS_COMPLETE_STATUS = 'members_complete';
export const AWAITING_MEMBERS_STATUS = 'awaiting_members';

export const ALLOCATION_ERR = Object.freeze({
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  TOURNAMENT_NOT_FOUND: 'TOURNAMENT_NOT_FOUND',
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
  return source === ALLOCATION_SOURCES.ORGANIZER ? ALLOCATION_SOURCES.ORGANIZER : ALLOCATION_SOURCES.AUTOMATIC;
}

// Which team statuses may proceed to allocation, per source.
//   automatic: verified (first placement after members_complete) or
//              allocation_pending (release frees a position later)
//   organizer: additionally an already-allocated team (a move)
export function canTransitionFromStatus(status, source) {
  const src = normalizeSource(source);
  if (status === VERIFIED_STATUS || status === ALLOCATION_PENDING_STATUS) return true;
  if (src === ALLOCATION_SOURCES.ORGANIZER && status === ALLOCATED_STATUS) return true;
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
export function selectRoomForTeam(rooms = [], occupancy = {}) {
  for (const room of rooms) {
    const roundNumber = Number(room.round_number ?? room.roundNumber ?? 1) || 1;
    if (roundNumber > 1) continue;
    const used = Number(occupancy[room.id] ?? occupancy[room.roomId] ?? 0) || 0;
    if (used < Number(room.capacity)) return room;
  }
  return null;
}

// Builds the row descriptors for an automatic placement (one assignment per match
// in the chosen room). Never references room credentials.
export function buildAutomaticAssignmentRows({ tournamentId, teamId, room, matchIds = [], source = ALLOCATION_SOURCES.AUTOMATIC, idFn = null }) {
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
    source,
  }));
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
        `INSERT INTO tournament_match_assignments (id, tournament_id, tournament_team_id, match_id, room_id, group_id, day_id, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, row.tournament_id, row.tournament_team_id, row.match_id, row.room_id, row.group_id, row.day_id, row.source]
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
  const action = source === ALLOCATION_SOURCES.AUTOMATIC ? 'allocation_automatic' : 'allocation_move';
  await client.query(
    `INSERT INTO admin_action_log (id, admin_id, action, action_type, target_type, target_id, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [logId, actorId || 'SYSTEM', action, 'allocation', 'tournament_team', team.id, JSON.stringify(details)]
  );
}

// --- Automatic placement (participant VERIFIED, fills first available Round 1 slot) ---

async function allocateAutomatic(client, { team, tournamentId, actorId }) {
  const teamId = team.id;

  const firstRoundRes = await client.query(
    'SELECT COALESCE(MIN(round_number), 1)::int AS first_round FROM tournament_rounds WHERE tournament_id = $1',
    [tournamentId]
  );
  const firstRound = firstRoundRes.rows[0].first_round;

  // Deterministic pick: first round only, earliest day → group → room with free
  // capacity and at least one scheduled match. The occupancy subquery counts
  // distinct teams per room, so one team = one occupied position regardless of
  // per-match rows (a team is placed against every match in its room).
  const roomRes = await client.query(`
    SELECT r.id, r.group_id, r.day_id, r.capacity, r.room_number,
           d.day_number,
           g.sequence AS group_sequence,
           COALESCE(rnd.round_number, 1)::int AS round_number,
           COALESCE(occ.allocated_teams, 0)::int AS allocated_teams
    FROM tournament_rooms r
    JOIN tournament_days d ON d.id = r.day_id
    JOIN tournament_groups g ON g.id = r.group_id
    LEFT JOIN tournament_rounds rnd ON rnd.id = r.round_id
    LEFT JOIN (
      SELECT room_id, COUNT(DISTINCT tournament_team_id) AS allocated_teams
      FROM tournament_match_assignments
      WHERE tournament_id = $1
      GROUP BY room_id
    ) occ ON occ.room_id = r.id
    WHERE r.tournament_id = $1
      AND COALESCE(rnd.round_number, 1)::int = $2
      AND COALESCE(occ.allocated_teams, 0)::int < r.capacity
      AND EXISTS (SELECT 1 FROM tournament_matches mq WHERE mq.room_id = r.id)
    ORDER BY COALESCE(rnd.round_number, 1)::int ASC, d.day_number ASC, g.sequence ASC, r.room_number ASC
    LIMIT 1
  `, [tournamentId, firstRound]);

  if (roomRes.rows.length === 0) {
    await client.query(
      "UPDATE tournament_teams SET status = 'allocation_pending', updated_at = NOW() WHERE id = $1",
      [teamId]
    );
    return {
      status: ALLOCATION_PENDING_STATUS,
      source: ALLOCATION_SOURCES.AUTOMATIC,
      code: ALLOCATION_ERR.NO_AVAILABLE_POSITION,
      message: 'No available position exists in the approved roadmap.',
      room: null,
      matchIds: [],
      assignmentCount: 0,
    };
  }

  const room = roomRes.rows[0];
  const matchesRes = await client.query(
    'SELECT id, match_number FROM tournament_matches WHERE room_id = $1 AND tournament_id = $2 ORDER BY match_number ASC',
    [room.id, tournamentId]
  );
  const matchIds = matchesRes.rows.map((m) => m.id);

  if (matchIds.length === 0) {
    throw allocationError(ALLOCATION_ERR.ALLOCATION_CONFLICT, 'The selected roadmap room has no scheduled matches.');
  }

  const rows = buildAutomaticAssignmentRows({
    tournamentId,
    teamId,
    room,
    matchIds,
    source: ALLOCATION_SOURCES.AUTOMATIC,
  });
  await insertAssignments(client, rows);

  await client.query("UPDATE tournament_teams SET status = 'allocated', updated_at = NOW() WHERE id = $1", [teamId]);
  await writeAudit(client, {
    actorId,
    source: ALLOCATION_SOURCES.AUTOMATIC,
    tournamentId,
    team,
    room,
    matchIds,
    reason: null,
    assignmentCount: rows.length,
  });

  return {
    status: ALLOCATED_STATUS,
    source: ALLOCATION_SOURCES.AUTOMATIC,
    code: ALLOCATED_STATUS,
    message: 'Team verified and automatically allocated to the first available tournament roadmap slot.',
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
    'SELECT id, match_number FROM tournament_matches WHERE id = $1 AND room_id = $2 AND tournament_id = $3',
    [matchId, roomId, tournamentId]
  );
  const match = matchRes.rows[0] || null;

  const capacityRes = await client.query(
    `SELECT COUNT(DISTINCT tournament_team_id)::int AS n
     FROM tournament_match_assignments
     WHERE room_id = $1 AND tournament_id = $2 AND tournament_team_id != $3`,
    [roomId, tournamentId, teamId]
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

  const row = {
    id: randomId('ASN-'),
    tournament_id: tournamentId,
    tournament_team_id: teamId,
    match_id: matchId,
    room_id: roomId,
    group_id: room.group_id,
    day_id: room.day_id,
    source: ALLOCATION_SOURCES.ORGANIZER,
  };
  await insertAssignments(client, [row]);

  await client.query("UPDATE tournament_teams SET status = 'allocated', updated_at = NOW() WHERE id = $1", [teamId]);

  await writeAudit(client, {
    actorId,
    source: ALLOCATION_SOURCES.ORGANIZER,
    tournamentId,
    team,
    room,
    matchIds: [matchId],
    reason,
    assignmentCount: 1,
    oldSnapshot: oldAssignments,
  });

  return {
    status: ALLOCATED_STATUS,
    source: ALLOCATION_SOURCES.ORGANIZER,
    code: ALLOCATED_STATUS,
    message: 'Allocation moved successfully',
    room: { id: room.id, room_number: room.room_number, capacity: room.capacity },
    matchIds: [matchId],
    assignmentCount: 1,
  };
}

// --- Public entry point ---
//
// Parameters:
//   teamId, tournamentId  — required
//   source                — 'automatic' | 'organizer' (defaults to 'automatic')
//   options               — { roomId, matchId, reason } for organizer moves
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

  // 1. Lock the team row (serialization point for concurrent verify/move).
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

  // 2. Idempotent short-circuit: an already-allocated team under the automatic
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

  // 3. State gate.
  if (!canTransitionFromStatus(team.status, src)) {
    if (team.status === AWAITING_MEMBERS_STATUS || team.status === MEMBERS_COMPLETE_STATUS) {
      throw allocationError(ALLOCATION_ERR.TEAM_NOT_COMPLETE, 'Team has not completed its roster yet. All members must join before allocation.');
    }
    throw allocationError(ALLOCATION_ERR.TEAM_NOT_VERIFIED, 'Team must be verified before allocation.');
  }

  // 4. Lock the tournament as the allocation serialization point and enforce the
  //    approved-roadmap gate. No roadmap row is ever written.
  const tournRes = await client.query(
    'SELECT "orgId", roadmap_status FROM tournaments WHERE id = $1 FOR UPDATE',
    [tournamentId]
  );
  if (tournRes.rows.length === 0) {
    throw allocationError(ALLOCATION_ERR.TOURNAMENT_NOT_FOUND, 'Tournament not found.');
  }
  if (tournRes.rows[0].roadmap_status !== 'approved') {
    throw allocationError(ALLOCATION_ERR.ROADMAP_NOT_APPROVED, 'The tournament roadmap is not approved. Approve the roadmap before allocating teams.');
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

  if (src === ALLOCATION_SOURCES.AUTOMATIC) {
    return allocateAutomatic(client, { team, tournamentId, actorId });
  }
  return allocateManual(client, { team, tournamentId, opts, actorId });
}