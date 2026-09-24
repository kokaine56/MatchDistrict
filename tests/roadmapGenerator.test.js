import test from 'node:test';
import assert from 'node:assert';
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';
import { calculateTournamentPlan } from '../server/tournamentPlanner.js';

test('TEST 1: One-day tournament, 10 rooms, max 10 simultaneous', () => {
  const config = {
    daily_start_time: '10:00',
    daily_end_time: '22:00'
  };
  const planningResult = {
    max_simultaneous_rooms: 10,
    matches_per_team: 3,
    match_duration_minutes: 25,
    break_between_matches_minutes: 5,
    teams_per_room: 25,
    required_days: 1,
    required_rooms: 10,
    total_room_sessions: 30,
    daily_plan: [{
      dayNumber: 1,
      date: '2026-10-10',
      plannedRooms: 10,
      plannedRoomMatchSessions: 30
    }]
  };
  const tournament = { id: 'T-1' };

const res = generateTournamentRoadmap(config, planningResult, tournament);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.days.length, 1);
  assert.strictEqual(res.roadmap.groups.length, 1); // 10 rooms / max 10 simultaneous = 1 group (no fixed 5-per-group)
  assert.strictEqual(res.roadmap.rooms.length, 10);
  assert.strictEqual(res.roadmap.matches.length, 30);

  // Default Round/Stage materialized for legacy input (no rounds param)
  assert.ok(Array.isArray(res.roadmap.rounds) && res.roadmap.rounds.length === 1);
  assert.strictEqual(res.roadmap.rounds[0].round_number, 1);
  assert.strictEqual(res.roadmap.rounds[0].name, 'Round 1');
  assert.strictEqual(res.roadmap.days[0].round_id, res.roadmap.rounds[0].id);
});

test('TEST 2: Two-day tournament, 50 rooms, max 10 simultaneous', () => {
  const config = { daily_start_time: '10:00', daily_end_time: '22:00' };
  const planningResult = {
    max_simultaneous_rooms: 10,
    matches_per_team: 3,
    match_duration_minutes: 25,
    break_between_matches_minutes: 5,
    teams_per_room: 25,
    required_days: 2,
    required_rooms: 50,
    total_room_sessions: 150,
    daily_plan: [
      { dayNumber: 1, date: '2026-10-10', plannedRooms: 25, plannedRoomMatchSessions: 75 },
      { dayNumber: 2, date: '2026-10-11', plannedRooms: 25, plannedRoomMatchSessions: 75 }
    ]
  };
  const tournament = { id: 'T-2' };

const res = generateTournamentRoadmap(config, planningResult, tournament);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.days.length, 2);
  assert.strictEqual(res.roadmap.groups.length, 6); // 25/10 = 3 groups per day * 2 days
  assert.strictEqual(res.roadmap.rooms.length, 50);
  assert.strictEqual(res.roadmap.matches.length, 150);

  // Days are numbered per round (single default round here, so 1..2 chronologically)
  assert.deepStrictEqual(res.roadmap.days.map((d) => d.day_number), [1, 2]);

  // Check overlap for Room 1
  const rm1Matches = res.roadmap.matches.filter(m => m.room_id === res.roadmap.rooms[0].id).sort((a, b) => a.match_number - b.match_number);
  const m1End = rm1Matches[0].end_time;
  const m2Start = rm1Matches[1].start_time;
  const m1EndMins = parseInt(m1End.split(':')[0])*60 + parseInt(m1End.split(':')[1]);
  const m2StartMins = parseInt(m2Start.split(':')[0])*60 + parseInt(m2Start.split(':')[1]);
  assert.ok(m2StartMins >= m1EndMins, 'Matches must not overlap');
});

test('proposal materializes persistent groups with one BGMI room for each scheduled match', () => {
  const config = {
    teams_per_group: 16, max_simultaneous_rooms: 4, matches_per_team: 4,
    match_duration_minutes: 25, break_between_matches_minutes: 5,
    daily_start_time: '10:00', daily_end_time: '22:00',
  };
  const planning = calculateTournamentPlan(config, {
    id: 'T-GROUP', slotsTotal: 64, match_type: 'squad', startDate: '2026-10-10',
  });
  assert.equal(planning.ok, true, planning.errors?.join(', '));

  const materialized = generateTournamentRoadmap(
    config,
    {
      required_days: planning.plan.requiredDays,
      required_rooms: planning.plan.requiredRooms,
      total_room_sessions: planning.plan.totalRoomMatchSessions,
    },
    { id: 'T-GROUP' },
    planning.plan.round_plan.rounds,
    planning.plan.round_plan,
  );

  assert.equal(materialized.ok, true, materialized.error);
  assert.equal(materialized.roadmap.groups.length, 4);
  assert.equal(materialized.roadmap.rooms.length, 16);
  assert.equal(materialized.roadmap.matches.length, 16);
  for (const group of materialized.roadmap.groups) {
    const matches = materialized.roadmap.matches.filter((match) => match.group_id === group.id);
    assert.deepEqual(matches.map((match) => match.match_number).sort((a, b) => a - b), [1, 2, 3, 4]);
    assert.equal(new Set(matches.map((match) => match.room_id)).size, 4);
  }
});

