import test from 'node:test';
import assert from 'node:assert';
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';
import {
  assignDaysToRounds,
  parseTimelineRounds,
  extractTimelineRoundRows,
  defaultRound
} from '../server/roundsService.js';

const CONFIG = { daily_start_time: '10:00', daily_end_time: '22:00' };

function plan(days, roomsPerDay, sim, teamsPerRoom = 25) {
  const dailyPlan = days.map((date, i) => ({
    dayNumber: i + 1,
    date,
    plannedRooms: roomsPerDay,
    plannedRoomMatchSessions: roomsPerDay * 3
  }));
  return {
    max_simultaneous_rooms: sim,
    matches_per_team: 3,
    match_duration_minutes: 25,
    break_between_matches_minutes: 5,
    teams_per_room: teamsPerRoom,
    required_days: days.length,
    required_rooms: roomsPerDay * days.length,
    total_room_sessions: roomsPerDay * days.length * 3,
    daily_plan: dailyPlan
  };
}

const roundsFor = (defs) => defs.map((d, i) => ({
  id: `RND-${i + 1}`,
  round_number: d.round_number,
  name: d.name,
  date: d.date || null,
  time: d.time || null,
  map: d.map || null
}));

test('Round/Stage: days are assigned to their configured rounds (Round N != Day N)', () => {
  const rounds = roundsFor([
    { round_number: 1, name: 'Qualifier', date: '2026-10-10' },
    { round_number: 2, name: 'Final', date: '2026-10-11' }
  ]);
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10', '2026-10-11'], 4, 4), { id: 'T' }, rounds);

  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.days.length, 2);
  assert.strictEqual(res.roadmap.days[0].round_id, 'RND-1');
  assert.strictEqual(res.roadmap.days[1].round_id, 'RND-2');
  // 1-based day numbering WITHIN each round (each round has exactly one day here)
  assert.deepStrictEqual(res.roadmap.days.map((d) => d.day_number), [1, 1]);
  assert.deepStrictEqual(res.roadmap.rounds.map((r) => r.round_number), [1, 2]);
});

test('Round/Stage: a round can span multiple days', () => {
  const rounds = roundsFor([{ round_number: 1, name: 'Qualifier', date: '2026-10-11' }]);
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10', '2026-10-11'], 4, 4), { id: 'T' }, rounds);

  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.days.length, 2);
  assert.ok(res.roadmap.days.every((d) => d.round_id === 'RND-1'));
  // "Round 1 · Day 1 / Day 2" — multi-day round representation
  assert.deepStrictEqual(res.roadmap.days.map((d) => d.day_number), [1, 2]);
});

test('Round/Stage: groups belong to the correct round and day', () => {
  const rounds = roundsFor([
    { round_number: 1, name: 'Qualifier', date: '2026-10-10' },
    { round_number: 2, name: 'Final', date: '2026-10-11' }
  ]);
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10', '2026-10-11'], 4, 4), { id: 'T' }, rounds);
  const { days, groups, rounds: outRounds } = res.roadmap;
  const dayByRound = { 'RND-1': days[0].id, 'RND-2': days[1].id };

  for (const g of groups) {
    assert.strictEqual(g.round_id, days.find((d) => d.id === g.day_id).round_id, 'group round matches its day');
    assert.strictEqual(g.day_id, dayByRound[g.round_id], 'group day matches its round');
  }
  assert.ok(outRounds.length === 2);
});

test('Round/Stage: rooms belong to the correct group, day and round', () => {
  const rounds = roundsFor([
    { round_number: 1, name: 'Qualifier', date: '2026-10-10' },
    { round_number: 2, name: 'Final', date: '2026-10-11' }
  ]);
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10', '2026-10-11'], 4, 4), { id: 'T' }, rounds);
  const { days, groups, rooms } = res.roadmap;
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const dayById = Object.fromEntries(days.map((d) => [d.id, d]));

  for (const room of rooms) {
    const group = groupById[room.group_id];
    const day = dayById[group.day_id];
    assert.strictEqual(room.round_id, group.round_id, 'room round matches its group');
    assert.strictEqual(room.round_id, day.round_id, 'room round matches its day');
    assert.strictEqual(room.day_id, day.id, 'room day matches its group day');
  }
});

test('Round/Stage: matches belong to the correct room, group, day and round', () => {
  const rounds = roundsFor([
    { round_number: 1, name: 'Qualifier', date: '2026-10-10' },
    { round_number: 2, name: 'Final', date: '2026-10-11' }
  ]);
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10', '2026-10-11'], 4, 4), { id: 'T' }, rounds);
  const { rooms } = res.roadmap;
  const roomById = Object.fromEntries(rooms.map((r) => [r.id, r]));

  for (const m of res.roadmap.matches) {
    const room = roomById[m.room_id];
    assert.strictEqual(m.round_id, room.round_id);
    assert.strictEqual(m.group_id, room.group_id);
    assert.strictEqual(m.day_id, room.day_id);
    assert.strictEqual(m.room_id, room.id);
  }
});

test('Grouping: derived from max_simultaneous_rooms, never a fixed 5 per group', () => {
  // 10 rooms, 10 simultaneous -> 1 group
  const one = generateTournamentRoadmap(CONFIG, plan(['2026-10-10'], 10, 10), { id: 'T' });
  assert.strictEqual(one.roadmap.groups.length, 1);
  assert.strictEqual(one.roadmap.groups[0].group_name, 'Group A');
  assert.strictEqual(one.roadmap.groups[0].sequence, 1);

  // 10 rooms, 2 simultaneous -> 5 groups of 2 (matches the "Group A/B" constraint example)
  const five = generateTournamentRoadmap(CONFIG, plan(['2026-10-10'], 10, 2), { id: 'T' });
  assert.strictEqual(five.roadmap.groups.length, 5);
  // Room 1-2 land in Group A, Room 3-4 in Group B, etc.
  const rooms = five.roadmap.rooms;
  assert.strictEqual(rooms.find((r) => r.room_number === 1).group_id, rooms.find((r) => r.room_number === 2).group_id);
  assert.notStrictEqual(rooms.find((r) => r.room_number === 1).group_id, rooms.find((r) => r.room_number === 3).group_id);
});

test('Room capacity: tournament-configured teams_per_room, distinct from game roster max', () => {
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10'], 2, 2, 16), { id: 'T' });
  assert.strictEqual(res.roadmap.rooms[0].capacity, 16);
  assert.notStrictEqual(res.roadmap.rooms[0].capacity, 25); // 16 != the BGMI squad theoretical max
});

test('Legacy behaviour: no rounds input yields a single default Round 1 and every entity is attached', () => {
  const res = generateTournamentRoadmap(CONFIG, plan(['2026-10-10', '2026-10-11'], 4, 4), { id: 'T' });
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.rounds.length, 1);
  assert.strictEqual(res.roadmap.rounds[0].round_number, 1);
  assert.strictEqual(res.roadmap.rounds[0].name, 'Round 1');
  const roundId = res.roadmap.rounds[0].id;
  assert.ok(res.roadmap.days.every((d) => d.round_id === roundId));
  assert.ok(res.roadmap.groups.every((g) => g.round_id === roundId));
  assert.ok(res.roadmap.rooms.every((r) => r.round_id === roundId));
  assert.ok(res.roadmap.matches.every((m) => m.round_id === roundId));
  // All days belong to one round -> day numbers stay global 1..N
  assert.deepStrictEqual(res.roadmap.days.map((d) => d.day_number), [1, 2]);
});

test('No duplicate rounds: Timeline parsing collapses duplicate round numbers', () => {
  const tournament = {
    timeline: [
      { round_number: 2, name: 'Dupe A' },
      { round_number: 2, name: 'Dupe B' },
      { name: 'Third' }
    ]
  };
  const rounds = parseTimelineRounds(tournament);
  assert.deepStrictEqual(rounds.map((r) => r.round_number), [2, 3]);
  assert.strictEqual(rounds[0].name, 'Dupe A');
});

test('Timeline parsing handles array, {rounds}, {roadmap} and string shapes', () => {
  const withRound = [
    { timeline: [{ name: 'Semi', qualified: '16', date: '2026-10-10', time: '20:00', map: 'Erangel' }] },
    { timeline: { rounds: [{ name: 'Semi', qualified: '16' }] } },
    { timeline: { roadmap: [{ name: 'Semi', qualified: '16' }] } },
    { timeline: JSON.stringify([{ name: 'Semi', qualified: '16' }]) }
  ];
  for (const c of withRound) {
    const rounds = parseTimelineRounds(c);
    assert.ok(Array.isArray(rounds) && rounds.length >= 1, JSON.stringify(c).slice(0, 60));
    assert.strictEqual(rounds[0].teams_advancing, 16);
    assert.ok(rounds[0].name);
  }
  // Empty/malformed timelines fall back to a default round with no advancement info
  assert.deepStrictEqual(parseTimelineRounds({}), [defaultRound()]);
  assert.strictEqual(parseTimelineRounds({ timeline: null })[0].teams_advancing, null);
  assert.strictEqual(parseTimelineRounds({ timeline: '[]' })[0].teams_advancing, null);
  assert.strictEqual(parseTimelineRounds({ timeline: { weird: true } })[0].teams_advancing, null);
});

test('assignDaysToRounds is pure and does not mutate its inputs', () => {
  const days = Object.freeze([{ id: 'd1', date: '2026-10-12' }, { id: 'd2', date: '2026-10-13' }]);
  const rounds = Object.freeze([
    Object.freeze({ id: 'r1', round_number: 1, date: '2026-10-12' }),
    Object.freeze({ id: 'r2', round_number: 2, date: '2026-10-14' })
  ]);
  const out = assignDaysToRounds(days, rounds);
  // d1 exact -> r1 ; d2 no match and before r2 -> first round r1 (transitional rule)
  assert.strictEqual(out[0].round.id, 'r1');
  assert.strictEqual(out[1].round.id, 'r1');
  assert.strictEqual(days[0].date, '2026-10-12');
  assert.strictEqual(rounds[1].round_number, 2);
});

test('Deterministic ordering: rounds always come back sorted by round_number', () => {
  const res = generateTournamentRoadmap(
    CONFIG,
    plan(['2026-10-10', '2026-10-11', '2026-10-12'], 4, 4),
    { id: 'T' },
    roundsFor([
      { round_number: 3, name: 'Final', date: '2026-10-12' },
      { round_number: 1, name: 'Qualifier', date: '2026-10-10' },
      { round_number: 2, name: 'Semi', date: '2026-10-11' }
    ])
  );
  assert.deepStrictEqual(res.roadmap.rounds.map((r) => r.round_number), [1, 2, 3]);
  const byRound = {};
  for (const d of res.roadmap.days) (byRound[d.round_id] = byRound[d.round_id] || []).push(d.day_number);
  // Each round has a single configured day, numbered 1 within its round
  assert.deepStrictEqual(Object.keys(byRound).map((k) => byRound[k]), [[1], [1], [1]]);
});

test('Legacy fallback division: day without plannedRooms derives rooms from plannedRoomMatchSessions', () => {
  const planningResult = {
    max_simultaneous_rooms: 3,
    matches_per_team: 3,
    match_duration_minutes: 25,
    break_between_matches_minutes: 5,
    teams_per_room: 25,
    required_days: 1,
    required_rooms: 6,
    total_room_sessions: 18,
    daily_plan: [{ dayNumber: 1, date: '2026-10-10', plannedRoomMatchSessions: 18 }]
  };
  const res = generateTournamentRoadmap(CONFIG, planningResult, { id: 'T' });
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.rooms.length, 6);
  assert.strictEqual(res.roadmap.groups.length, 2); // ceil(6/3)
});

test('extractTimelineRoundRows never throws on malformed timeline', () => {
  for (const bad of [{ timeline: 42 }, { timeline: 'not-json' }, { timeline: { weird: true } }, {}]) {
    const raw = extractTimelineRoundRows(bad);
    assert.ok(Array.isArray(raw));
  }
});