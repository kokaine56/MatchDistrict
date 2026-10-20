import test from 'node:test';
import assert from 'node:assert';
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';

// ---------------------------------------------------------------------------
// District roadmap generator contract.
//
// NOTE: an earlier revision of this file asserted a "room lane" model
// (groups = simultaneous-room lanes, one room per match session). That model
// was superseded by the district model required by the platform: a tournament
// is divided into ceil(slots / teamsPerDistrict) districts, each fielding one
// qualifier match. These tests assert the district contract.
// ---------------------------------------------------------------------------

const round1Matches = (roadmap) => {
  const r1 = roadmap.rounds.find((r) => r.round_number === 1);
  return roadmap.matches.filter((m) => m.round_id === r1.id);
};

test('TEST 1: 64 slots / 16 per district => 4 districts with one qualifier match each', () => {
  const res = generateTournamentRoadmap({ id: 'T-1', slotsTotal: 64, teams_per_group: 16, startDate: '2026-10-10' });
  assert.strictEqual(res.ok, true, res.error);
  const rm = res.roadmap;

  const r1Groups = rm.groups.filter((g) => g.round_id === rm.rounds[0].id);
  assert.strictEqual(r1Groups.length, 4);
  assert.deepStrictEqual(r1Groups.map((g) => g.group_name), ['District 1', 'District 2', 'District 3', 'District 4']);
  assert.strictEqual(rm.groups.length, 7, 'all rounds auto-create districts: R1(4) + R2(2) + GF(1)');

  const r1 = round1Matches(rm);
  assert.strictEqual(r1.length, 4);
  assert.strictEqual(new Set(r1.map((m) => m.group_id)).size, 4, 'each district has exactly one qualifier match');
  assert.strictEqual(new Set(r1.map((m) => m.id)).size, 4, 'match ids are unique');

  // A Grand Final is always materialized.
  const gf = rm.rounds.find((r) => r.is_grand_final);
  assert.ok(gf, 'a Grand Final round exists');
  const gfMatches = rm.matches.filter((m) => m.round_id === gf.id);
  assert.strictEqual(gfMatches.length, 3, 'the Grand Final is a 3-match series');

  assert.ok(rm.days.length >= 1);
});

test('TEST 2: 128 slots / 16 per district => 8 districts and a coherent multi-day schedule', () => {
  const res = generateTournamentRoadmap({ id: 'T-2', slotsTotal: 128, teams_per_group: 16, startDate: '2026-10-10' });
  assert.strictEqual(res.ok, true, res.error);
  const rm = res.roadmap;

  const r1Groups = rm.groups.filter((g) => g.round_id === rm.rounds[0].id);
  assert.strictEqual(r1Groups.length, 8);
  assert.strictEqual(rm.groups.length, 15, 'all rounds auto-create districts: R1(8) + R2(4) + R3(2) + GF(1)');
  const r1 = round1Matches(rm);
  assert.strictEqual(r1.length, 8);

  // Every scheduled match starts and ends within the same calendar day group
  // and the start time precedes the end time.
  for (const m of rm.matches) {
    assert.ok(m.start_time && m.end_time, 'every match has start/end times');
    const toMins = (t) => Number(t.split(':')[0]) * 60 + Number(t.split(':')[1]);
    assert.ok(toMins(m.end_time) >= toMins(m.start_time), `match ${m.id} ends before it starts`);
  }

  // Days are numbered consecutively from 1 with no gaps.
  const dayNumbers = [...new Set(rm.days.map((d) => d.day_number))].sort((a, b) => a - b);
  assert.deepStrictEqual(dayNumbers, Array.from({ length: dayNumbers.length }, (_, i) => i + 1));
});

test('legacy extra arguments (config/plan/rounds) are tolerated without breaking the district model', () => {
  // Older callers passed (config, planningResult, tournament, rounds, round_plan).
  // The generator must continue to produce the district structure.
  const config = { teams_per_group: 16, daily_start_time: '10:00', daily_end_time: '22:00' };
  const planningResult = {
    required_days: 1,
    required_rooms: 4,
    total_room_sessions: 16,
    daily_plan: [{ dayNumber: 1, date: '2026-10-10', plannedRooms: 4, plannedRoomMatchSessions: 16 }],
  };
  const tournament = { id: 'T-LEGACY', slotsTotal: 64, teams_per_group: 16, startDate: '2026-10-10' };

  const res = generateTournamentRoadmap(config, planningResult, tournament, [], { rounds: [] });
  assert.strictEqual(res.ok, true, res.error);
  const r1Groups = res.roadmap.groups.filter((g) => g.round_id === res.roadmap.rounds[0].id);
  assert.strictEqual(r1Groups.length, 4, 'district count derives from slot capacity, not the legacy plan');
  assert.strictEqual(round1Matches(res.roadmap).length, 4);
});
