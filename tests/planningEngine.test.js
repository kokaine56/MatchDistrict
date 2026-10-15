import test from 'node:test';
import assert from 'node:assert';
import { calculateTournamentPlan } from '../server/tournamentPlanner.js';
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';

// server/tournamentPlanner.js + roadmapGenerator proposal path tests.
// Persistent competitive groups schedule several matches, each with a
// match-specific technical BGMI room.

const baseConfig = (overrides = {}) => ({
  expected_teams: 64,
  maximum_teams: 64,
  players_per_team: 4,
  teams_per_room: 16,
  max_simultaneous_rooms: 2,
  matches_per_team: 3,
  match_duration_minutes: 25,
  break_between_matches_minutes: 5,
  daily_start_time: '10:00',
  daily_end_time: '22:00',
  max_matches_per_day: null,
  ...overrides
});

const toMins = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

test('PLAN TEST 1: 1250 teams / 25 per group / 10 simultaneous -> 50 groups and 150 match rooms', () => {
  const config = baseConfig({
    maximum_teams: 1250, expected_teams: 1250, teams_per_room: 25, max_simultaneous_rooms: 10
  });
  const res = calculateTournamentPlan(config, null);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.requiredGroups, 50);
  assert.strictEqual(res.plan.requiredRooms, 150);
  assert.strictEqual(res.plan.simultaneousRooms, 10);
  assert.strictEqual(res.plan.requiredDays, 1);
  assert.strictEqual(res.plan.teamsPerGroup, 25);
  assert.strictEqual(res.plan.round_plan.rounds[0].required_groups, 50);
  assert.strictEqual(res.plan.round_plan.rounds[0].teams_entering, 1250);
  const day = res.plan.round_plan.days[0];
  assert.strictEqual(day.groups.length, 50);
  assert.strictEqual(day.planned_rooms, 150);
  assert.deepStrictEqual(day.rooms.filter((room) => room.group_sequence === 1).map((room) => room.matches[0].match_number), [1, 2, 3]);
});

test('PLAN TEST 2: 64 teams / 16 per group / 2 simultaneous -> 4 persistent groups', () => {
  const res = calculateTournamentPlan(baseConfig(), null);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.requiredGroups, 4);
  assert.strictEqual(res.plan.requiredRooms, 12);
  assert.strictEqual(res.plan.simultaneousRooms, 2);
  const day = res.plan.round_plan.days[0];
  assert.strictEqual(day.groups.length, 4);
  assert.strictEqual(day.groups[0].name, 'Group A');
  assert.strictEqual(day.groups[1].name, 'Group B');
  const roomsByNumber = new Map(day.rooms.map((r) => [r.room_number, r]));
  assert.strictEqual(roomsByNumber.get(1).matches[0].start_time, '10:00');
  assert.strictEqual(roomsByNumber.get(2).matches[0].start_time, '10:30');
  assert.strictEqual(roomsByNumber.get(3).matches[0].start_time, '11:00');
  assert.strictEqual(roomsByNumber.get(4).matches[0].start_time, '10:00');
  assert.strictEqual(roomsByNumber.get(1).group_sequence, 1);
  assert.strictEqual(roomsByNumber.get(4).group_sequence, 2);
});

test('PLAN TEST 3: 16 teams / 16 per group / 1 simultaneous -> one group and three match rooms', () => {
  const config = baseConfig({ maximum_teams: 16, expected_teams: 16, max_simultaneous_rooms: 1 });
  const res = calculateTournamentPlan(config, null);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.requiredGroups, 1);
  assert.strictEqual(res.plan.requiredRooms, 3);
  assert.strictEqual(res.plan.simultaneousRooms, 1);
  const day = res.plan.round_plan.days[0];
  assert.strictEqual(day.rooms.length, 3);
  assert.strictEqual(day.groups.length, 1);
  const starts = day.rooms.map((room) => room.matches[0].start_time);
  assert.deepStrictEqual(starts, ['10:00', '10:30', '11:00']);
  assert.strictEqual(day.rooms[2].matches[0].end_time, '11:25');
});

test('PLAN TEST 4: window too small -> spills to next days; every match inside the window', () => {
  // Four groups, one simultaneous, short window -> two groups/day over two days.
  const config = baseConfig({
    max_simultaneous_rooms: 1,
    daily_start_time: '10:00',
    daily_end_time: '13:40'
  });
  const res = calculateTournamentPlan(config, null);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.requiredGroups, 4);
  assert.strictEqual(res.plan.requiredRooms, 12);
  assert.strictEqual(res.plan.requiredDays, 2);
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.planned_groups), [2, 2]);
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.planned_rooms), [6, 6]);
  const dayTwoDate = res.plan.round_plan.days[1].date;
  const expected = new Date(new Date(res.plan.round_plan.days[0].date + 'T12:00:00'));
  expected.setUTCDate(expected.getUTCDate() + 1);
  const expectedStr = expected.toISOString().split('T')[0];
  assert.strictEqual(dayTwoDate, expectedStr);
  const endMins = toMins('13:40');
  for (const day of res.plan.round_plan.days) {
    for (const room of day.rooms) {
      for (const m of room.matches) {
        assert.ok(toMins(m.end_time) <= endMins, `Match ${m.start_time}-${m.end_time} exceeds window`);
      }
    }
  }
});

test('PLAN TEST 5: rounds 64 -> 32 -> 16 advancing yields 4/2/1 persistent groups', () => {
  const rounds = [
    { id: 'RND-R1', round_number: 1, name: 'Round 1', teams_advancing: 32, date: '2026-05-01' },
    { id: 'RND-R2', round_number: 2, name: 'Round 2', teams_advancing: 16, date: null },
    { id: 'RND-R3', round_number: 3, name: 'Round 3', teams_advancing: null, date: null }
  ];
  const tournament = { startDate: '2026-05-01' };
  const res = calculateTournamentPlan(baseConfig(), tournament, rounds);
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.plan.round_plan.rounds.map((r) => r.required_groups), [4, 2, 1]);
  assert.deepStrictEqual(res.plan.round_plan.rounds.map((r) => r.required_rooms), [12, 6, 3]);
  assert.deepStrictEqual(res.plan.round_plan.rounds.map((r) => r.teams_entering), [64, 32, 16]);
  assert.strictEqual(res.plan.requiredGroups, 7);
  assert.strictEqual(res.plan.requiredRooms, 21);
  assert.strictEqual(res.plan.requiredDays, 3);
  // Round ordering: round N starts the day after the previous round completes.
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.date), ['2026-05-01', '2026-05-02', '2026-05-03']);
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.round_number), [1, 2, 3]);
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.day_number), [1, 1, 1]);
  assert.strictEqual(res.plan.startDate, '2026-05-01');
  assert.strictEqual(res.plan.endDate, '2026-05-03');
});

test('PLAN TEST 6: missing teams_advancing carries teams forward with a warning', () => {
  const rounds = [
    { id: 'RND-R1', round_number: 1, name: 'Round 1', teams_advancing: null },
    { id: 'RND-R2', round_number: 2, name: 'Round 2', teams_advancing: null }
  ];
  const res = calculateTournamentPlan(baseConfig(), null, rounds);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.round_plan.rounds[1].carry_forward, true);
  assert.deepStrictEqual(res.plan.round_plan.rounds.map((r) => r.teams_entering), [64, 64]);
  assert.ok(res.plan.warnings.some((w) => /carrying 64 teams forward/i.test(w)));
});

test('PLAN TEST 7: capacity correction – a match can never finish past the window', () => {
  // Legacy session math would schedule 6 slots for one day (3 rooms x 2 sim);
  // the corrected group math caps a day at 2 rooms and spills the rest.
  const config = baseConfig({
    maximum_teams: 96, expected_teams: 96,
    max_simultaneous_rooms: 2,
    daily_start_time: '10:00',
    daily_end_time: '12:30'
  });
  const res = calculateTournamentPlan(config, null);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.requiredGroups, 6);
  assert.strictEqual(res.plan.requiredRooms, 18);
  assert.strictEqual(res.plan.requiredDays, 3); // 2 rooms/day
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.planned_groups), [2, 2, 2]);
  assert.deepStrictEqual(res.plan.round_plan.days.map((d) => d.planned_rooms), [6, 6, 6]);
  const endMins = toMins('12:30');
  for (const day of res.plan.round_plan.days) {
    for (const room of day.rooms) {
      for (const m of room.matches) {
        assert.ok(toMins(m.end_time) <= endMins, `Match ${m.start_time}-${m.end_time} exceeds window`);
      }
    }
  }
});

test('PLAN TEST 8: invalid durations are rejected', () => {
  const zeroDur = calculateTournamentPlan(baseConfig({ match_duration_minutes: 0 }), null);
  assert.strictEqual(zeroDur.ok, false);
  assert.match(zeroDur.errors[0], /Match duration must be greater than zero/);
  const negBreak = calculateTournamentPlan(baseConfig({ break_between_matches_minutes: -1 }), null);
  assert.strictEqual(negBreak.ok, false);
  assert.match(negBreak.errors[0], /Break duration cannot be negative/);
});

test('PLAN TEST 9: window too short for the configured matches per team', () => {
  const config = baseConfig({
    max_simultaneous_rooms: 1,
    daily_start_time: '10:00',
    daily_end_time: '10:55'
  });
  const res = calculateTournamentPlan(config, null);
  assert.strictEqual(res.ok, false);
  assert.match(res.errors[0], /too short to schedule the configured matches per team/);
});

test('PLAN TEST 10: 100% daily utilization surfaces a warning', () => {
  const config = baseConfig({
    maximum_teams: 32, expected_teams: 32,
    max_simultaneous_rooms: 1,
    daily_start_time: '10:00',
    daily_end_time: '11:55'
  });
  const res = calculateTournamentPlan(config, null);
  assert.strictEqual(res.ok, true);
  assert.ok(res.plan.warnings.some((w) => /100% of daily capacity/i.test(w)));
  assert.ok(res.plan.round_plan.days.every((d) => d.utilization_percent === 100));
});

test('PLAN TEST 11: regeneration is deterministic', () => {
  const rounds = [
    { id: 'RND-R1', round_number: 1, name: 'Round 1', teams_advancing: 32 },
    { id: 'RND-R2', round_number: 2, name: 'Round 2', teams_advancing: 16 },
    { id: 'RND-R3', round_number: 3, name: 'Round 3', teams_advancing: null }
  ];
  const tournament = { startDate: '2026-06-01' };
  const a = calculateTournamentPlan(baseConfig(), tournament, rounds);
  const b = calculateTournamentPlan(baseConfig(), tournament, rounds);
  assert.strictEqual(a.ok, true);
  assert.deepStrictEqual(a.plan, b.plan);
});

test('PLAN TEST 12: configured round date before previous completion is a hard error', () => {
  const rounds = [
    { id: 'RND-R1', round_number: 1, name: 'Round 1', teams_advancing: 16, date: '2026-05-01' },
    { id: 'RND-R2', round_number: 2, name: 'Round 2', teams_advancing: null, date: '2026-05-01' }
  ];
  const tournament = { startDate: '2026-05-01' };
  const res = calculateTournamentPlan(baseConfig(), tournament, rounds);
  assert.strictEqual(res.ok, false);
  assert.match(res.errors[0], /Round 2/);
  assert.match(res.errors[0], /before the previous round completes/);
});

test('PLAN TEST 13: configured round date later than earliest is allowed with a gap warning', () => {
  const rounds = [
    { id: 'RND-R1', round_number: 1, name: 'Round 1', teams_advancing: 32, date: '2026-05-01' },
    { id: 'RND-R2', round_number: 2, name: 'Round 2', teams_advancing: 16, date: '2026-05-10' }
  ];
  const tournament = { startDate: '2026-05-01' };
  const res = calculateTournamentPlan(baseConfig(), tournament, rounds);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.plan.round_plan.rounds[1].start_date, '2026-05-10');
  assert.ok(res.plan.warnings.some((w) => /Round 2 starts 8 days after/i.test(w)));
});

test('PLAN TEST 14: planner still produces a proposal while the generator emits an independent district roadmap', () => {
  const rounds = [
    { id: 'RND-R1', round_number: 1, name: 'Round 1', teams_advancing: 32, date: '2026-05-01' },
    { id: 'RND-R2', round_number: 2, name: 'Round 2', teams_advancing: 16, date: null },
    { id: 'RND-R3', round_number: 3, name: 'Round 3', teams_advancing: null, date: null }
  ];
  const tournament = { id: 'TRN-PLAN-TEST', startDate: '2026-05-01', slotsTotal: 64, teams_per_group: 16 };
  const config = baseConfig();
  const res = calculateTournamentPlan(config, tournament, rounds);
  assert.strictEqual(res.ok, true);
  const plan = res.plan;
  assert.ok(plan.round_plan, 'the planner still assembles a proposal');

  const planningResult = {
    required_days: plan.requiredDays,
    required_rooms: plan.requiredRooms,
    total_room_sessions: plan.totalRoomMatchSessions,
    max_simultaneous_rooms: plan.maxSimultaneousRooms,
    teams_per_room: plan.teamsPerRoom,
    matches_per_team: plan.matchesPerTeam,
    match_duration_minutes: plan.matchDurationMinutes,
    break_between_matches_minutes: plan.breakBetweenMatchesMinutes,
    daily_plan: plan.dailyPlan
  };

  // The generator now derives structure from slot capacity + district config.
  // Legacy proposal arguments remain accepted for compatibility but no longer
  // dictate the roadmap shape.
  const gen = generateTournamentRoadmap(config, planningResult, tournament, [], plan.round_plan);
  assert.strictEqual(gen.ok, true, gen.error);

  const roadmap = gen.roadmap;
  assert.strictEqual(roadmap.groups.length, 4, '64 slots / 16 per district = 4 districts');
  assert.strictEqual(roadmap.rooms.length, 4);
  assert.strictEqual(roadmap.matches.length, 9, '4 district matches + 2 progression matches + 3 Grand Final matches');
  assert.deepStrictEqual(roadmap.groups.map((g) => g.group_name), ['District 1', 'District 2', 'District 3', 'District 4']);
  assert.deepStrictEqual(roadmap.rounds.map((r) => r.round_number), [1, 2, 3]);
  assert.strictEqual(roadmap.rounds.filter((r) => r.is_grand_final).length, 1, 'exactly one Grand Final');
  assert.ok(roadmap.rooms.every((r) => r.capacity === 16), 'every room carries its district capacity');
  // Round 1 is spread across days; the Grand Final is scheduled last.
  const gf = roadmap.rounds.find((r) => r.is_grand_final);
  const gfDay = roadmap.days.find((d) => d.round_id === gf.id);
  assert.ok(gfDay, 'the Grand Final has a scheduled day');
  assert.strictEqual(Math.max(...roadmap.days.map((d) => d.day_number)), gfDay.day_number);
});

test('PLAN TEST 15: legacy planning results without round_plan no longer drive the roadmap (district model wins)', () => {
  const planningResult = {
    max_simultaneous_rooms: 10,
    matches_per_team: 3,
    match_duration_minutes: 25,
    break_between_matches_minutes: 5,
    teams_per_room: 25,
    required_days: 1,
    required_rooms: 10,
    total_room_sessions: 30,
    daily_plan: [{ dayNumber: 1, date: '2026-10-10', plannedRooms: 10, plannedRoomMatchSessions: 30 }]
  };
  const config = { daily_start_time: '10:00', daily_end_time: '22:00' };
  const res = generateTournamentRoadmap(config, planningResult, { id: 'T-LEGACY', slotsTotal: 64, teams_per_group: 16 });
  assert.strictEqual(res.ok, true, res.error);
  // District structure (4 districts, 3 rounds, 4 days, 9 matches) — NOT the
  // legacy 10 rooms / 30 sessions from the planning result.
  assert.strictEqual(res.roadmap.groups.length, 4);
  assert.strictEqual(res.roadmap.rooms.length, 4);
  assert.strictEqual(res.roadmap.matches.length, 9);
  assert.strictEqual(res.roadmap.days.length, 4);
});
