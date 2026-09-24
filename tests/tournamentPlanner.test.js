import test from 'node:test';
import assert from 'node:assert';
import { calculateTournamentPlan } from '../server/tournamentPlanner.js';

test('100 teams, 25 teams/group and 3 matches -> 4 persistent groups and 12 match rooms', () => {
  const config = {
    expected_teams: 100, maximum_teams: 100, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.equal(result.plan.requiredGroups, 4);
  assert.equal(result.plan.requiredRooms, 12);
  assert.equal(result.plan.round_plan.days[0].groups.length, 4);
  assert.equal(result.plan.round_plan.days[0].rooms.length, 12);
});

test('101 teams, 25 teams/group -> 5 persistent groups', () => {
  const config = {
    expected_teams: 101, maximum_teams: 101, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.equal(result.plan.requiredGroups, 5);
  assert.equal(result.plan.requiredRooms, 15);
});

test('tournament Slots & Entry capacity overrides legacy duplicate planning team counts', () => {
  const config = {
    expected_teams: 12, maximum_teams: 20, teams_per_room: 16,
    max_simultaneous_rooms: 2, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
  };
  const result = calculateTournamentPlan(config, { slotsTotal: 64, match_type: 'duo' });
  assert.equal(result.ok, true);
  assert.equal(result.plan.planningTeamCount, 64);
  assert.equal(result.plan.expectedTeams, 64);
  assert.equal(result.plan.requiredGroups, 4);
  assert.equal(result.plan.requiredRooms, 12);
  assert.equal(result.plan.configSnapshot.expected_teams, 64);
  assert.equal(result.plan.configSnapshot.players_per_team, 2);
});

test('1250 teams, 25 teams/group -> 50 groups and 150 match rooms', () => {
  const config = {
    expected_teams: 1250, maximum_teams: 1250, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.requiredGroups, 50);
  assert.strictEqual(result.plan.requiredRooms, 150);
});

test('50 groups, 10 simultaneous groups limit', () => {
  const config = {
    expected_teams: 1250, maximum_teams: 1250, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.requiredGroups, 50);
  assert.strictEqual(result.plan.simultaneousRooms, 10);
});

test('TEST 5: Match duration + break scheduling now fails because daily capacity < matches_per_team', () => {
  const config = {
    expected_teams: 100, maximum_teams: 100, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 1, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '10:55',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, false);
});

test('TEST 8: Maximum matches/day overrides calculated capacity when lower', () => {
  const config = {
    expected_teams: 100, maximum_teams: 100, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: 5
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.effectiveDailyCapacity, 5);
});

test('TEST 15: Invalid configuration', () => {
  const config = {
    expected_teams: 100, maximum_teams: 100, players_per_team: 4, teams_per_room: -5,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, false);
  assert.match(result.errors[0], /Teams per group must be greater than zero/);
});

test('64 teams form four 16-team groups; every group has four ordered match-specific rooms', () => {
  const result = calculateTournamentPlan({
    expected_teams: 64, maximum_teams: 64, teams_per_group: 16,
    max_simultaneous_rooms: 4, matches_per_team: 4, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
  }, { slotsTotal: 64, match_type: 'squad', startDate: '2026-10-10' });

  assert.equal(result.ok, true, result.errors?.join(', '));
  assert.equal(result.plan.requiredGroups, 4);
  assert.equal(result.plan.requiredRooms, 16);
  assert.deepEqual(result.plan.round_plan.days[0].groups.map((group) => group.name), ['Group A', 'Group B', 'Group C', 'Group D']);
  for (const group of result.plan.round_plan.days[0].groups) {
    const groupRooms = result.plan.round_plan.days[0].rooms.filter((room) => room.group_sequence === group.sequence);
    assert.deepEqual(groupRooms.map((room) => room.matches[0].match_number), [1, 2, 3, 4]);
    assert.equal(new Set(groupRooms.map((room) => room.room_number)).size, 4);
  }
});

test('round progression recalculates group count from advancing teams and keeps round order', () => {
  const result = calculateTournamentPlan({
    expected_teams: 64, maximum_teams: 64, teams_per_group: 16,
    max_simultaneous_rooms: 4, matches_per_team: 4, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
  }, { slotsTotal: 64, match_type: 'squad', startDate: '2026-10-10' }, [
    { id: 'ROUND-1', round_number: 1, name: 'Round 1', teams_advancing: 16 },
    { id: 'ROUND-2', round_number: 2, name: 'Round 2' },
  ]);

  assert.equal(result.ok, true, result.errors?.join(', '));
  assert.deepEqual(result.plan.round_plan.rounds.map((round) => round.teams_entering), [64, 16]);
  assert.deepEqual(result.plan.round_plan.rounds.map((round) => round.required_groups), [4, 1]);
  assert.deepEqual(result.plan.round_plan.days.map((day) => day.round_id), ['ROUND-1', 'ROUND-2']);
  assert.ok(result.plan.round_plan.days[1].date > result.plan.round_plan.days[0].date);
});

