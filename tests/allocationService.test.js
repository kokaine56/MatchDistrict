import test from 'node:test';
import assert from 'node:assert';
import {
  allocateTeam,
  AllocationError,
  ALLOCATED_STATUS,
  ALLOCATION_PENDING_STATUS,
  ALLOCATION_SOURCES,
  ALLOCATION_ERR,
  VERIFIED_STATUS,
  MEMBERS_COMPLETE_STATUS,
  AWAITING_MEMBERS_STATUS,
  allocationError,
  buildAutomaticAssignmentRows,
  buildPersistentGroupAssignmentRows,
  canTransitionFromStatus,
  firstRoundNumberOf,
  normalizeSource,
  selectRoomForTeam,
  validateManualTarget,
} from '../server/allocationService.js';

// Pure unit tests for the shared allocation service. These exercise the room
// selection rule, state gate, round-first rule, manual-target gate and payload
// builders with no database; the transactional integration and concurrency cases
// live in `allocationServiceDb.test.js`.

function room(id, { capacity, dayNumber = 1, groupSequence = 1, roomNumber = 1, round = 1 } = {}) {
  return {
    id,
    capacity,
    day_number: dayNumber,
    dayNumber,
    group_sequence: groupSequence,
    groupSequence,
    room_number: roomNumber,
    roomNumber,
    round_number: round,
    roundNumber: round,
  };
}

// --- 1/4/5/6/7/8/9/10/11/14/18: deterministic first-available Round 1 selection ---
test('allocation: single team takes the only free room (one-team success)', () => {
  const rooms = [room('R1', { capacity: 2 })];
  assert.strictEqual(selectRoomForTeam(rooms, {}).id, 'R1');
});

test('allocation: first valid position in deterministic order is chosen', () => {
  const rooms = [
    room('R1', { capacity: 2, dayNumber: 1, groupSequence: 1, roomNumber: 1 }),
    room('R2', { capacity: 2, dayNumber: 1, groupSequence: 1, roomNumber: 2 }),
  ];
  assert.strictEqual(selectRoomForTeam(rooms, {}).id, 'R1');
});

test('allocation: a full room is skipped, next room with space is chosen (full room → next)', () => {
  const rooms = [
    room('R1', { capacity: 2 }),
    room('R2', { capacity: 2 }),
  ];
  assert.strictEqual(selectRoomForTeam(rooms, { R1: 2 }).id, 'R2');
});

test('allocation: multi-room fill respects capacity before moving on', () => {
  const rooms = [
    room('R1', { capacity: 2 }),
    room('R2', { capacity: 2 }),
  ];
  let occupancy = {};
  const picks = [];
  for (let i = 0; i < 4; i++) {
    const r = selectRoomForTeam(rooms, occupancy);
    assert.ok(r, 'a room must be available');
    picks.push(r.id);
    occupancy[r.id] = (occupancy[r.id] || 0) + 1;
  }
  assert.deepStrictEqual(picks, ['R1', 'R1', 'R2', 'R2'], 'earliest room fills first, then the next');
  assert.strictEqual(selectRoomForTeam(rooms, occupancy), null, 'grid is full');
});

test('allocation: multi-group ordering (group sequence) is deterministic', () => {
  const rooms = [
    room('G1-R1', { capacity: 2, groupSequence: 1 }),
    room('G2-R1', { capacity: 1, groupSequence: 2 }),
  ];
  // G1 has space -> chosen even though G2 is "smaller position-wise" but later.
  assert.strictEqual(selectRoomForTeam(rooms, { 'G2-R1': 1 }).id, 'G1-R1');
  // G1 full -> G2 picked.
  assert.strictEqual(selectRoomForTeam(rooms, { 'G1-R1': 2, 'G2-R1': 0 }).id, 'G2-R1');
});

test('allocation: multi-day ordering (day_number) is deterministic', () => {
  const rooms = [
    room('D1', { capacity: 2, dayNumber: 1 }),
    room('D2', { capacity: 2, dayNumber: 2 }),
  ];
  assert.strictEqual(selectRoomForTeam(rooms, {}).id, 'D1');
  assert.strictEqual(selectRoomForTeam(rooms, { D1: 2 }).id, 'D2');
});

test('allocation: Round 1 only — later-round rooms are never offered (round-first rule)', () => {
  // A Round 2 room with space must not be picked while Round 1 is full: the picker
  // excludes >1 rounds entirely, surfacing "no available position" instead.
  const mixed = [
    room('R1-FULL', { capacity: 2, round: 1 }),
    room('R2-SPACE', { capacity: 2, round: 2 }),
  ];
  assert.strictEqual(selectRoomForTeam(mixed, { 'R1-FULL': 2 }), null, 'never allocate into later rounds');
  // But the empty case must still pick the first free Round 1 room.
  const r1Rooms = [room('R1A', { capacity: 2, round: 1 }), room('R2', { capacity: 2, round: 2 })];
  assert.strictEqual(selectRoomForTeam(r1Rooms, {}).id, 'R1A');
});

test('allocation: NULL/blank room round_number is treated as Round 1 (legacy roadmaps)', () => {
  const legacy = [{ id: 'LEGACY', capacity: 4, day_number: 1, group_sequence: 1, room_number: 1, round_number: null }];
  assert.strictEqual(selectRoomForTeam(legacy, {}).id, 'LEGACY');
});

test('allocation: firstRoundNumberOf resolves the smallest round or 1 for legacy', () => {
  assert.strictEqual(firstRoundNumberOf([]), 1);
  assert.strictEqual(firstRoundNumberOf([{ round_number: 3 }, { round_number: 1 }]), 1);
  assert.strictEqual(firstRoundNumberOf([{ round_number: 2 }, { round_number: 4 }]), 2);
  assert.strictEqual(firstRoundNumberOf([{ round_number: null }]), 1);
});

// --- 14/15: no position trimming ---
test('allocation: every room at capacity yields no available position', () => {
  const rooms = [room('R1', { capacity: 1 }), room('R2', { capacity: 1 })];
  assert.strictEqual(selectRoomForTeam(rooms, { R1: 1, R2: 1 }), null);
});

// --- 18/17: manual and automatic share the same capacity semantics ---
test('allocation: automatic and manual share the same capacity boundary', () => {
  const target = room('RM', { capacity: 2 });
  // Automatic: at cap-1 the room is chosen; at cap it is not.
  assert.strictEqual(selectRoomForTeam([target], { RM: 1 }).id, 'RM');
  assert.strictEqual(selectRoomForTeam([target], { RM: 2 }), null);
  // Manual: other-team count at cap-1 passes the gate; at cap it fails.
  assert.ok(validateManualTarget(target, { id: 'M1', match_number: 1 }, 1).ok);
  const gate = validateManualTarget(target, { id: 'M1', match_number: 1 }, 2);
  assert.strictEqual(gate.ok, false);
  assert.strictEqual(gate.code, ALLOCATION_ERR.ALLOCATION_CONFLICT);
  assert.match(gate.message, /full capacity/);
});

test('allocation: manual target requires the room and a match belonging to it', () => {
  const roomRow = room('RM', { capacity: 4 });
  const noRoom = validateManualTarget(null, { id: 'M1', match_number: 2 }, 0);
  assert.strictEqual(noRoom.ok, false);
  assert.strictEqual(noRoom.code, ALLOCATION_ERR.ALLOCATION_CONFLICT);
  const noMatch = validateManualTarget(roomRow, null, 0);
  assert.strictEqual(noMatch.ok, false);
  assert.match(noMatch.message, /does not belong/);
  // A missing match for an existing room is never confirmed.
  assert.strictEqual(validateManualTarget(roomRow, null, 0).ok, false);
});

// --- 23/24: state gate ---
test('allocation: state gate — verified/allocation_pending proceed; incomplete/unverified do not', () => {
  for (const src of [ALLOCATION_SOURCES.AUTOMATIC, ALLOCATION_SOURCES.ORGANIZER]) {
    assert.strictEqual(canTransitionFromStatus(VERIFIED_STATUS, src), true);
    assert.strictEqual(canTransitionFromStatus(ALLOCATION_PENDING_STATUS, src), true);
    assert.strictEqual(canTransitionFromStatus(MEMBERS_COMPLETE_STATUS, src), false, 'incomplete cannot allocate');
    assert.strictEqual(canTransitionFromStatus(AWAITING_MEMBERS_STATUS, src), false, 'unverified cannot allocate');
  }
  // Only organizer (manual move) can transition an allocated team.
  assert.strictEqual(canTransitionFromStatus(ALLOCATED_STATUS, ALLOCATION_SOURCES.AUTOMATIC), false);
  assert.strictEqual(canTransitionFromStatus(ALLOCATED_STATUS, ALLOCATION_SOURCES.ORGANIZER), true);
});

test('allocation: normalizeSource maps only organizer explicitly', () => {
  assert.strictEqual(normalizeSource('organizer'), ALLOCATION_SOURCES.ORGANIZER);
  assert.strictEqual(normalizeSource('automatic'), ALLOCATION_SOURCES.AUTOMATIC);
  assert.strictEqual(normalizeSource(null), ALLOCATION_SOURCES.AUTOMATIC);
  assert.strictEqual(normalizeSource(undefined), ALLOCATION_SOURCES.AUTOMATIC);
  assert.strictEqual(normalizeSource('manual'), ALLOCATION_SOURCES.AUTOMATIC);
});

// --- 12 (shape): automatic payload builder ---
test('allocation: automatic assignment rows cover every match in the room with a unique id + source', () => {
  const rows = buildAutomaticAssignmentRows({
    tournamentId: 'T1',
    teamId: 'TEAM1',
    room: { id: 'R1', group_id: 'G1', day_id: 'D1' },
    matchIds: ['M1', 'M2'],
  });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].tournament_id, 'T1');
  assert.strictEqual(rows[0].tournament_team_id, 'TEAM1');
  assert.strictEqual(rows[0].room_id, 'R1');
  assert.strictEqual(rows[0].group_id, 'G1');
  assert.strictEqual(rows[0].day_id, 'D1');
  assert.strictEqual(rows[0].source, ALLOCATION_SOURCES.AUTOMATIC);
  assert.notStrictEqual(rows[0].id, rows[1].id, 'ids are unique within a placement');
});

test('allocation: persistent group membership assigns the team to every match-specific BGMI room', () => {
  const rows = buildPersistentGroupAssignmentRows({
    tournamentId: 'T-1', teamId: 'TEAM-1', groupId: 'GROUP-A',
    matches: [
      { id: 'MATCH-1', room_id: 'BGMI-1', day_id: 'DAY-1' },
      { id: 'MATCH-2', room_id: 'BGMI-2', day_id: 'DAY-1' },
      { id: 'MATCH-3', room_id: 'BGMI-3', day_id: 'DAY-1' },
      { id: 'MATCH-4', room_id: 'BGMI-4', day_id: 'DAY-1' },
    ],
    idFn: (() => { let id = 0; return () => `A-${++id}`; })(),
  });

  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map((row) => row.match_id), ['MATCH-1', 'MATCH-2', 'MATCH-3', 'MATCH-4']);
  assert.deepEqual(rows.map((row) => row.room_id), ['BGMI-1', 'BGMI-2', 'BGMI-3', 'BGMI-4']);
  assert.ok(rows.every((row) => row.group_id === 'GROUP-A' && row.tournament_team_id === 'TEAM-1'));
});

// --- 28/29 (pure scaling model): configured fleet fills exactly, no new rooms ---
test('allocation: 64 teams fill 4 rooms of 16 exactly (nil spill, no new rooms)', () => {
  const rooms = [1, 2, 3, 4].map((n) => room(`R${n}`, { capacity: 16, roomNumber: n }));
  const occupied = {};
  let assigned = 0;
  for (let i = 0; i < 64; i++) {
    const r = selectRoomForTeam(rooms, occupied);
    assert.ok(r, `team ${i + 1} must always find a room`);
    occupied[r.id] = (occupied[r.id] || 0) + 1;
    assigned++;
  }
  assert.strictEqual(assigned, 64);
  assert.strictEqual(rooms.length, 4, 'no new rooms created');
  for (const r of rooms) {
    assert.ok(occupied[r.id] <= r.capacity, `room ${r.id} never exceeds capacity`);
  }
  assert.strictEqual(selectRoomForTeam(rooms, occupied), null, 'grid full at 64');
});

test('allocation: 1250 teams fill 50 rooms of 25 exactly (nil spill, no new rooms)', () => {
  const rooms = Array.from({ length: 50 }, (_, i) => room(`B${i + 1}`, { capacity: 25, roomNumber: i + 1 }));
  const occupied = {};
  let spares = 0;
  for (let i = 0; i < 1250; i++) {
    const r = selectRoomForTeam(rooms, occupied);
    if (!r) {
      spares = 1250 - i;
      break;
    }
    occupied[r.id] = (occupied[r.id] || 0) + 1;
  }
  assert.strictEqual(spares, 0, 'all 1250 teams placed');
  assert.strictEqual(rooms.length, 50, 'no new rooms created');
  for (const r of rooms) {
    assert.ok(occupied[r.id] <= r.capacity, 'capacity never exceeded');
  }
  assert.strictEqual(selectRoomForTeam(rooms, occupied), null);
});

// --- error surface ---
test('allocation: AllocationError carries stable machine codes', () => {
  const err = allocationError(ALLOCATION_ERR.ROADMAP_NOT_APPROVED, 'nope');
  assert.ok(err instanceof AllocationError);
  assert.strictEqual(err.code, ALLOCATION_ERR.ROADMAP_NOT_APPROVED);
  assert.strictEqual(err.message, 'nope');
  assert.ok(err instanceof Error);
});

test('allocation: allocateTeam requires a client and ids (guards misuse)', async () => {
  await assert.rejects(allocateTeam(null, { teamId: 'X', tournamentId: 'T' }), (err) => {
    assert.ok(err instanceof AllocationError);
    assert.strictEqual(err.code, ALLOCATION_ERR.TEAM_NOT_FOUND);
    return true;
  });
  await assert.rejects(allocateTeam({}, { teamId: '', tournamentId: 'T' }), (err) => {
    assert.ok(err instanceof AllocationError);
    return true;
  });
});

test('allocation: locks tournament before team to match qualification and finalization ordering', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('FROM tournaments')) {
        return { rows: [{ roadmap_status: 'approved', finalized_at: null }] };
      }
      if (sql.includes('FROM tournament_teams')) {
        return { rows: [{ id: 'TEAM', tournament_id: 'TOURN', status: 'awaiting_members' }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  await assert.rejects(
    allocateTeam(client, { teamId: 'TEAM', tournamentId: 'TOURN' }),
    (err) => err instanceof AllocationError && err.code === ALLOCATION_ERR.TEAM_NOT_COMPLETE
  );
  assert.match(calls[0], /FROM tournaments[\s\S]*FOR UPDATE/);
  assert.match(calls[1], /FROM tournament_teams[\s\S]*FOR UPDATE/);
});
