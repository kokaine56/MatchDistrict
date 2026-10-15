import test from 'node:test';
import assert from 'node:assert';
import {
  computeDistrictCount,
  distributeDistrictSizes,
  defaultTeamsAdvancing,
  normalizeRoadmapConfig,
  validateRoadmapConfig,
  scheduleMatches,
  daysRequired,
  parseTimeToMinutes,
  minutesToHHMM,
  minutesTo12h,
  releaseTimeFor,
  isValidTime,
} from '../server/roadmapConfig.js';

test('computeDistrictCount uses ceil(total / teamsPerGroup)', () => {
  assert.strictEqual(computeDistrictCount(64, 16), 4);
  assert.strictEqual(computeDistrictCount(128, 16), 8);
  assert.strictEqual(computeDistrictCount(256, 16), 16);
  assert.strictEqual(computeDistrictCount(100, 16), 7);
  assert.strictEqual(computeDistrictCount(0, 16), 0);
  assert.strictEqual(computeDistrictCount(128, 0), 0);
  assert.strictEqual(computeDistrictCount('nope', 16), 0);
});

test('distributeDistrictSizes preserves the total and minimises imbalance', () => {
  const s = distributeDistrictSizes(100, 16);
  assert.strictEqual(s.length, 7);
  assert.strictEqual(s.reduce((a, b) => a + b, 0), 100);
  assert.ok(Math.max(...s) - Math.min(...s) <= 1);
  assert.deepStrictEqual(distributeDistrictSizes(48, 16), [16, 16, 16]);
});

test('defaultTeamsAdvancing is half the field, rounded up', () => {
  assert.strictEqual(defaultTeamsAdvancing(16), 8);
  assert.strictEqual(defaultTeamsAdvancing(15), 8);
  assert.strictEqual(defaultTeamsAdvancing(1), 1);
  assert.strictEqual(defaultTeamsAdvancing(0), 0);
});

test('normalizeRoadmapConfig applies defaults and reports invalid input', () => {
  const d = normalizeRoadmapConfig({});
  assert.strictEqual(d.matchesPerDay, 2);
  assert.strictEqual(d.matchesPerDayProvided, false);
  assert.strictEqual(d.firstMatchTime, '13:00');
  assert.strictEqual(d.matchGapMinutes, 60);
  assert.strictEqual(d.matchDurationMinutes, 30);
  assert.strictEqual(d.releaseOffsetMinutes, 15);
  assert.strictEqual(d.teamsAdvancingPerDistrict, null);
  assert.strictEqual(d.enableSemiFinals, false);
  assert.strictEqual(d.enableSemiFinalsProvided, false);

  const bad = normalizeRoadmapConfig({ matches_per_day: 0, first_match_time: '99:99', teams_advancing_per_district: -1 });
  assert.ok(bad.errors.length >= 3);
  assert.strictEqual(bad.matchesPerDay, 2); // fell back
  assert.strictEqual(bad.firstMatchTime, '13:00');

  const good = normalizeRoadmapConfig({ matches_per_day: 4, first_match_time: '15:30', teams_advancing_per_district: 4, enable_semi_finals: true });
  assert.strictEqual(good.matchesPerDay, 4);
  assert.strictEqual(good.matchesPerDayProvided, true);
  assert.strictEqual(good.firstMatchTime, '15:30');
  assert.strictEqual(good.teamsAdvancingPerDistrict, 4);
  assert.strictEqual(good.enableSemiFinals, true);
  assert.strictEqual(good.enableSemiFinalsProvided, true);
  assert.deepStrictEqual(good.errors, []);
});

test('validateRoadmapConfig rejects impossible capacities and over-advancement', () => {
  assert.strictEqual(validateRoadmapConfig(normalizeRoadmapConfig({}), { slotsTotal: 0, teamsPerGroup: 16 }).ok, false);
  assert.strictEqual(validateRoadmapConfig(normalizeRoadmapConfig({}), { slotsTotal: 128, teamsPerGroup: 0 }).ok, false);
  assert.strictEqual(validateRoadmapConfig(normalizeRoadmapConfig({ teams_advancing_per_district: 20 }), { slotsTotal: 128, teamsPerGroup: 16 }).ok, false);
  assert.strictEqual(validateRoadmapConfig(normalizeRoadmapConfig({ teams_advancing_per_district: 4 }), { slotsTotal: 128, teamsPerGroup: 16 }).ok, true);
});

test('scheduleMatches lays out matches per day starting at the first time', () => {
  const s = scheduleMatches({ count: 8, matchesPerDay: 2, firstMatchTime: '13:00', matchGapMinutes: 60, matchDurationMinutes: 30 });
  assert.strictEqual(s.length, 8);
  assert.deepStrictEqual(s.map((m) => m.dayOffset), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.strictEqual(s[0].startTime, '13:00');
  assert.strictEqual(s[0].endTime, '13:30');
  assert.strictEqual(s[1].startTime, '14:00');
  assert.strictEqual(s[2].startTime, '13:00', 'a new day restarts at the first-match time');
  assert.strictEqual(s[3].startTime, '14:00');
  assert.strictEqual(s[0].releaseTime, '12:45 PM');
  assert.strictEqual(daysRequired(8, 2), 4);
  assert.strictEqual(daysRequired(8, 3), 3);
  assert.strictEqual(daysRequired(8, 4), 2);
});

test('time helpers are consistent and handle midnight wrap', () => {
  assert.strictEqual(isValidTime('13:00'), true);
  assert.strictEqual(isValidTime('24:00'), false);
  assert.strictEqual(parseTimeToMinutes('13:00'), 780);
  assert.strictEqual(parseTimeToMinutes('bad'), null);
  assert.strictEqual(minutesToHHMM(780), '13:00');
  assert.strictEqual(minutesTo12h(780), '01:00 PM');
  assert.strictEqual(minutesTo12h(0), '12:00 AM');
  assert.strictEqual(releaseTimeFor('00:05', 15), '11:50 PM');
});
