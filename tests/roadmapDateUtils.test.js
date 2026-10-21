import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getWeekdayIST,
  formatDateWithWeekdayIST,
  formatDateRangeIST,
  formatToDDMMYYYY,
  parseFromDDMMYYYY,
} from '../src/utils/roadmapDateUtils.js';

test('roadmapDateUtils: format pure date YYYY-MM-DD with IST weekday', () => {
  // 2026-10-25 is Sunday
  assert.strictEqual(getWeekdayIST('2026-10-25'), 'Sun');
  assert.strictEqual(formatDateWithWeekdayIST('2026-10-25'), 'Sun, 25/10/2026');

  // 2026-10-24 is Saturday
  assert.strictEqual(getWeekdayIST('2026-10-24'), 'Sat');
  assert.strictEqual(formatDateWithWeekdayIST('2026-10-24'), 'Sat, 24/10/2026');

  // 2026-11-02 is Monday
  assert.strictEqual(getWeekdayIST('2026-11-02'), 'Mon');
  assert.strictEqual(formatDateWithWeekdayIST('2026-11-02'), 'Mon, 02/11/2026');
});

test('roadmapDateUtils: date range formatting', () => {
  assert.strictEqual(
    formatDateRangeIST('2026-10-24', '2026-11-02'),
    'Sat, 24/10/2026 to Mon, 02/11/2026'
  );
  assert.strictEqual(
    formatDateRangeIST('2026-10-25', '2026-10-25'),
    'Sun, 25/10/2026'
  );
  assert.strictEqual(formatDateRangeIST('2026-10-25', null), 'Sun, 25/10/2026');
  assert.strictEqual(formatDateRangeIST(null, '2026-10-25'), 'Sun, 25/10/2026');
  assert.strictEqual(formatDateRangeIST(null, null), '');
});

test('roadmapDateUtils: ISO timestamp edge cases and midnight crossing in IST', () => {
  // 2026-10-24T18:30:00Z is 00:00:00 IST on 25/10/2026 (exact midnight crossing)
  assert.strictEqual(formatDateWithWeekdayIST('2026-10-24T18:30:00Z'), 'Sun, 25/10/2026');
  assert.strictEqual(getWeekdayIST('2026-10-24T18:30:00Z'), 'Sun');

  // 2026-10-24T18:29:59Z is 23:59:59 IST on 24/10/2026 (1 second before midnight)
  assert.strictEqual(formatDateWithWeekdayIST('2026-10-24T18:29:59Z'), 'Sat, 24/10/2026');
  assert.strictEqual(getWeekdayIST('2026-10-24T18:29:59Z'), 'Sat');

  // 2026-10-25T18:29:59Z is 23:59:59 IST on 25/10/2026 (Sunday)
  assert.strictEqual(formatDateWithWeekdayIST('2026-10-25T18:29:59Z'), 'Sun, 25/10/2026');

  // 2026-10-25T18:30:00Z is 00:00:00 IST on 26/10/2026 (Monday)
  assert.strictEqual(formatDateWithWeekdayIST('2026-10-25T18:30:00Z'), 'Mon, 26/10/2026');
});

test('roadmapDateUtils: invalid inputs return empty string gracefully', () => {
  assert.strictEqual(formatDateWithWeekdayIST(''), '');
  assert.strictEqual(formatDateWithWeekdayIST(null), '');
  assert.strictEqual(formatDateWithWeekdayIST(undefined), '');
  assert.strictEqual(formatDateWithWeekdayIST('invalid-date'), '');
  assert.strictEqual(getWeekdayIST(''), '');
});

test('roadmapDateUtils: formatToDDMMYYYY and parseFromDDMMYYYY roundtrip', () => {
  assert.strictEqual(formatToDDMMYYYY('2026-10-25'), '25/10/2026');
  assert.strictEqual(parseFromDDMMYYYY('25/10/2026'), '2026-10-25');
  assert.strictEqual(parseFromDDMMYYYY('invalid'), null);
  assert.strictEqual(parseFromDDMMYYYY('32/10/2026'), null);
});
