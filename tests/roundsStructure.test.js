import test from 'node:test';
import assert from 'node:assert';
import { generateTournamentRoadmap } from '../server/roadmapGenerator.js';
import {
  assignDaysToRounds,
  parseTimelineRounds,
  extractTimelineRoundRows,
  defaultRound
} from '../server/roundsService.js';

// ---------------------------------------------------------------------------
// Round / stage structure — DISTRICT contract.
//
// The tournament roadmap is a district model: ceil(slots / teamsPerDistrict)
// districts in round 1, one qualifier match per district, then progression
// rounds and a 3-match Grand Final. The previous revision of this file asserted
// a "room lane" model driven by a legacy planning result (simultaneous rooms,
// matches_per_team, plannedRoomMatchSessions); those generation helpers were
// removed. Legacy extra arguments are still accepted but ignored.
// ---------------------------------------------------------------------------

const DISTRICTS_64 = { id: 'T', slotsTotal: 64, teams_per_group: 16, startDate: '2026-10-10' };

const roundBy = (roadmap, n) => roadmap.rounds.find((r) => r.round_number === n);
const grandFinal = (roadmap) => roadmap.rounds.find((r) => r.is_grand_final);

test('District rounds: 64 slots => 4 district matches in Round 1 then progression and a Grand Final', () => {
  const res = generateTournamentRoadmap(DISTRICTS_64);
  assert.strictEqual(res.ok, true, res.error);
  const rm = res.roadmap;

  assert.deepStrictEqual(rm.rounds.map((r) => r.round_number), [1, 2]);
  assert.strictEqual(grandFinal(rm).round_number, 2, 'the Grand Final is the last round');

  const r1 = rm.matches.filter((m) => m.round_id === roundBy(rm, 1).id);
  assert.strictEqual(r1.length, 4, 'one qualifier match per district');
  assert.strictEqual(grandFinal(rm) && rm.matches.filter((m) => m.round_id === grandFinal(rm).id).length, 3);
});

test('Days are assigned to their round and numbered globally from 1', () => {
  const res = generateTournamentRoadmap(DISTRICTS_64);
  const rm = res.roadmap;

  assert.deepStrictEqual(rm.days.map((d) => d.day_number), [1, 2, 3]);
  const r1 = roundBy(rm, 1).id;
  const gf = grandFinal(rm).id;

  assert.deepStrictEqual(rm.days.map((d) => d.round_id), [r1, r1, gf]);
  // Dates advance by one calendar day per global day number.
  assert.deepStrictEqual(rm.days.map((d) => d.date), ['2026-10-10', '2026-10-11', '2026-10-12']);
});

test('Districts (groups) belong to their round and to the day of their match', () => {
  const res = generateTournamentRoadmap(DISTRICTS_64);
  const { groups, days, rounds: outRounds } = res.roadmap;
  const r1 = roundBy(res.roadmap, 1);
  const dayById = Object.fromEntries(days.map((d) => [d.id, d]));

  const r1Groups = groups.filter((g) => g.round_id === r1.id);
  assert.strictEqual(r1Groups.length, 4);
  assert.deepStrictEqual(r1Groups.map((g) => g.group_name), ['District 1', 'District 2', 'District 3', 'District 4']);
  assert.deepStrictEqual(r1Groups.map((g) => g.sequence), [1, 2, 3, 4]);
  for (const g of r1Groups) {
    assert.strictEqual(g.round_id, r1.id, 'Round 1 district belongs to Round 1');
    assert.strictEqual(dayById[g.day_id].round_id, r1.id, 'district day belongs to Round 1');
  }
  // Rounds auto-create districts from teams_in: R1 (4), GF (1) = 5 total groups
  assert.strictEqual(groups.length, 5);
  assert.strictEqual(outRounds.filter((r) => !r.is_grand_final).length, 1);
});

test('Rooms mirror districts in Round 1 and carry the configured district size', () => {
  const res = generateTournamentRoadmap(DISTRICTS_64);
  const { rooms, groups } = res.roadmap;
  const r1 = roundBy(res.roadmap, 1).id;
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));

  const r1Rooms = rooms.filter((r) => r.round_id === r1);
  assert.strictEqual(r1Rooms.length, 4);
  for (const room of r1Rooms) {
    assert.strictEqual(room.round_id, r1);
    assert.strictEqual(room.capacity, 16);
    assert.ok(groupById[room.group_id], 'room is attached to a district');
  }
});

test('Matches stay consistent with their district/day/round in Round 1 and later rounds carry auto-created districts', () => {
  const res = generateTournamentRoadmap(DISTRICTS_64);
  const rm = res.roadmap;
  const groupById = Object.fromEntries(rm.groups.map((g) => [g.id, g]));
  const roomByGroup = Object.fromEntries(rm.rooms.map((r) => [r.group_id, r]));
  const r1 = roundBy(rm, 1).id;

  for (const m of rm.matches) {
    const group = groupById[m.group_id];
    assert.ok(group, `match ${m.id} in round ${m.round_id} is attached to a district`);
    assert.strictEqual(m.round_id, group.round_id);
    assert.strictEqual(m.day_id, group.day_id);
    assert.strictEqual(m.group_name, group.group_name);
    assert.ok(roomByGroup[m.group_id], 'each district has a room');
  }
});

test('District count scales with capacity, not a fixed group size', () => {
  const r1Groups = (res) => {
    const r1 = roundBy(res.roadmap, 1);
    return res.roadmap.groups.filter((g) => g.round_id === r1.id);
  };
  assert.strictEqual(r1Groups(generateTournamentRoadmap({ id: 'A', slotsTotal: 64, teams_per_group: 16 })).length, 4);
  assert.strictEqual(r1Groups(generateTournamentRoadmap({ id: 'B', slotsTotal: 128, teams_per_group: 16 })).length, 8);
  assert.strictEqual(r1Groups(generateTournamentRoadmap({ id: 'C', slotsTotal: 160, teams_per_group: 16 })).length, 10);
  // Custom district sizes also scale.
  assert.strictEqual(r1Groups(generateTournamentRoadmap({ id: 'D', slotsTotal: 120, teams_per_group: 24 })).length, 5);
});

test('Empty planned districts remain visible and non-divisible capacities distribute evenly', () => {
  // No registered teams supplied — districts derive from configured capacity.
  const res = generateTournamentRoadmap({ id: 'E', slotsTotal: 100, teams_per_group: 16 });
  const sizes = res.roadmap.meta.district_sizes;
  assert.strictEqual(sizes.length, 7);
  assert.strictEqual(sizes.reduce((a, b) => a + b, 0), 100);
  assert.strictEqual(Math.max(...sizes) - Math.min(...sizes) <= 1, true, 'district sizes differ by at most 1');
  const r1 = roundBy(res.roadmap, 1);
  const r1Groups = res.roadmap.groups.filter((g) => g.round_id === r1.id);
  assert.strictEqual(r1Groups.length, 7);
});

test('Legacy planning-result arguments are ignored; the district model still wins', () => {
  const legacyConfig = { daily_start_time: '10:00', daily_end_time: '22:00' };
  const legacyPlan = {
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
  const res = generateTournamentRoadmap(legacyConfig, legacyPlan, DISTRICTS_64);
  assert.strictEqual(res.ok, true, res.error);
  const r1 = roundBy(res.roadmap, 1);
  const r1Groups = res.roadmap.groups.filter((g) => g.round_id === r1.id);
  assert.strictEqual(r1Groups.length, 4, 'districts come from slot capacity, not planned rooms');
  assert.strictEqual(res.roadmap.rooms.filter((r) => r.round_id === r1.id).length, 4);
  assert.notStrictEqual(res.roadmap.rooms[0].capacity, 25);
});

test('Grand Final only: capacity equal to one district collapses to a 3-match Grand Final', () => {
  const res = generateTournamentRoadmap({ id: 'F', slotsTotal: 16, teams_per_group: 16, startDate: '2026-10-10' });
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.roadmap.rounds.length, 1);
  assert.strictEqual(res.roadmap.rounds[0].is_grand_final, true);
  assert.strictEqual(res.roadmap.matches.length, 3);
  assert.strictEqual(res.roadmap.groups.length, 1, 'Grand Final has 1 auto-created district');
  assert.strictEqual(res.roadmap.groups[0].group_name, 'Grand Final');
  assert.ok(res.roadmap.matches.every((m) => m.group_id === res.roadmap.groups[0].id));
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

test('extractTimelineRoundRows never throws on malformed timeline', () => {
  for (const bad of [{ timeline: 42 }, { timeline: 'not-json' }, { timeline: { weird: true } }, {}]) {
    const raw = extractTimelineRoundRows(bad);
    assert.ok(Array.isArray(raw));
  }
});
