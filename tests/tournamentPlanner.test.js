import test from 'node:test';
import assert from 'node:assert';
import { calculateTournamentPlan } from '../server/tournamentPlanner.js';

test('TEST 1: 100 teams, 25 teams/room -> 4 required rooms', () => {
  const config = {
    expected_teams: 100, maximum_teams: 100, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.requiredRooms, 4);
});

test('TEST 2: 101 teams, 25 teams/room -> 5 required rooms', () => {
  const config = {
    expected_teams: 101, maximum_teams: 101, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.requiredRooms, 5);
});

test('TEST 3: 1250 teams, 25 teams/room -> 50 required rooms', () => {
  const config = {
    expected_teams: 1250, maximum_teams: 1250, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.requiredRooms, 50);
});

test('TEST 4: 50 required rooms, 10 simultaneous limit', () => {
  const config = {
    expected_teams: 1250, maximum_teams: 1250, players_per_team: 4, teams_per_room: 25,
    max_simultaneous_rooms: 10, matches_per_team: 3, match_duration_minutes: 25,
    break_between_matches_minutes: 5, daily_start_time: '10:00', daily_end_time: '22:00',
    max_matches_per_day: null
  };
  const result = calculateTournamentPlan(config, null);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.plan.requiredRooms, 50);
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
  assert.match(result.errors[0], /Teams per room must be greater than zero/);
});

