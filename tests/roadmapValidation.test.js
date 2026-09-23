// tests/roadmapValidation.test.js
// Pure structural validation for the Phase 3 roadmap (approval gate + edit gates).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  toMins,
  minsToHHMM,
  isValidDateStr,
  computeMatchEndTime,
  validateSingleMatchEdit,
  validateDayDateEdit,
  validateRoadmapStructure
} from '../server/roadmapValidation.js'

const baseConfig = {
  daily_start_time: '10:00',
  daily_end_time: '22:00',
  teams_per_room: 25,
  max_simultaneous_rooms: 2,
  match_duration_minutes: 25,
  break_between_matches_minutes: 5
}

function day(id, round, num, date) {
  return { id, round_id: round, day_number: num, date }
}
function room(id, dayId, groupId, num, capacity = 25) {
  return { id, day_id: dayId, group_id: groupId, room_number: num, capacity }
}
function match(id, dayId, roomId, groupId, num, start, end) {
  return { id, day_id: dayId, room_id: roomId, group_id: groupId, match_number: num, start_time: start, end_time: end }
}

test('validateRoadmapStructure: healthy single-round roadmap has no errors', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01'), day('d2', 'r1', 2, '2026-05-02')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [
    match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25'),
    match('m2', 'd1', 'rm1', 'g1', 2, '10:30', '10:55'),
    match('m3', 'd2', 'rm1', 'g1', 3, '10:00', '10:25')
  ]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.equal(errors.length, 0)
  assert.equal(warnings.length, 0)
})

test('validateRoadmapStructure: match ending before it starts is blocking', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:30', '10:00')]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.ok(errors.some((e) => e.includes('ends before it starts')))
  assert.equal(warnings.length, 0)
})

test('validateRoadmapStructure: out-of-window match is blocking', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  // 09:00 start is before the 10:00 window
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '09:00', '09:25')]
  const { errors } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.ok(errors.some((e) => e.includes('before the operating window')))
})

test('validateRoadmapStructure: same-room overlap is blocking', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [
    match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25'),
    match('m2', 'd1', 'rm1', 'g1', 2, '10:15', '10:40')
  ]
  const { errors } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.ok(errors.some((e) => e.includes('overlaps')))
})

test('validateRoadmapStructure: break shorter than configured is a warning, not an error', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [
    match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25'),
    match('m2', 'd1', 'rm1', 'g1', 2, '10:27', '10:52')
  ]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.equal(errors.length, 0)
  assert.ok(warnings.some((w) => w.includes('less than 5 min break')))
})

test('validateRoadmapStructure: reversed day ordering within a round is blocking', () => {
  const days = [day('d1', 'r1', 1, '2026-05-02'), day('d2', 'r1', 2, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25')]
  const { errors } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.ok(errors.some((e) => e.includes('dated before')))
})

test('validateRoadmapStructure: round starting before previous round finishes is blocking', () => {
  const days = [day('d1', 'r1', 1, '2026-05-03'), day('d2', 'r2', 1, '2026-05-02')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25')]
  const { errors } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }] })
  assert.ok(errors.some((e) => e.includes('starts before Round')))
})

test('validateRoadmapStructure: concurrent matches exceed max_simultaneous_rooms (blocking)', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1), room('rm2', 'd1', 'g1', 2), room('rm3', 'd1', 'g1', 3)]
  const matches = [
    match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25'),
    match('m2', 'd1', 'rm2', 'g1', 2, '10:00', '10:25'),
    match('m3', 'd1', 'rm3', 'g1', 3, '10:00', '10:25')
  ]
  const { errors } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.ok(errors.some((e) => e.includes('peaks at 3 simultaneous')))
})

test('validateRoadmapStructure: capacity above teams_per_room is a warning', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1, 30)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25')]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.equal(errors.length, 0)
  assert.ok(warnings.some((w) => w.includes('exceeds the configured')))
})

test('validateRoadmapStructure: duration mismatch is a warning', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:30')]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.equal(errors.length, 0)
  assert.ok(warnings.some((w) => w.includes('differs from the configured')))
})

test('validateRoadmapStructure: identical day dates within a round is a warning', () => {
  const days = [day('d1', 'r1', 1, '2026-05-01'), day('d2', 'r1', 2, '2026-05-01')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25')]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }] })
  assert.equal(errors.length, 0)
  assert.ok(warnings.some((w) => w.includes('share the same date')))
})

test('round ordering: same-day boundary between rounds is a warning', () => {
  const days = [day('d1', 'r1', 1, '2026-05-02'), day('d2', 'r2', 1, '2026-05-02')]
  const groups = [{ id: 'g1', day_id: 'd1', group_name: 'Group A' }]
  const rooms = [room('rm1', 'd1', 'g1', 1)]
  const matches = [match('m1', 'd1', 'rm1', 'g1', 1, '10:00', '10:25')]
  const { errors, warnings } = validateRoadmapStructure({ days, groups, rooms, matches, config: baseConfig, rounds: [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }] })
  assert.equal(errors.length, 0)
  assert.ok(warnings.some((w) => w.includes('same day Round 1 finishes')))
})

test('toMins / minsToHHMM round-trip and invalid handling', () => {
  assert.equal(toMins('10:00'), 600)
  assert.equal(toMins('22:35'), 1355)
  assert.equal(toMins('24:00'), null)
  assert.equal(toMins('10:60'), null)
  assert.equal(minsToHHMM(600), '10:00')
  assert.equal(minsToHHMM(90), '01:30')
  assert.equal(minsToHHMM(-10), '23:50')
})

test('isValidDateStr rejects garbage and impossible dates', () => {
  assert.equal(isValidDateStr('2026-05-01'), true)
  assert.equal(isValidDateStr('2026-05-31'), true)
  assert.equal(isValidDateStr('2026-02-29'), false)
  assert.equal(isValidDateStr('2026-13-01'), false)
  assert.equal(isValidDateStr('hello'), false)
})

test('computeMatchEndTime adds duration and rejects midnight crossing', () => {
  assert.equal(computeMatchEndTime('10:00', 25), '10:25')
  assert.equal(computeMatchEndTime('23:50', 25), null)
  assert.equal(computeMatchEndTime('10:00', 0), null)
  assert.equal(computeMatchEndTime('10:00', null), null)
})

test('validateSingleMatchEdit: rejects out-of-window start', () => {
  const matchRow = { match_number: 1, start_time: '09:00' }
  const gate = validateSingleMatchEdit({ match: matchRow, siblings: [], config: baseConfig })
  assert.equal(gate.ok, false)
  assert.ok(gate.error.includes('operating window'))
})

test('validateSingleMatchEdit: rejects overlap with a committed sibling', () => {
  const matchRow = { match_number: 2, start_time: '10:10' }
  const siblings = [{ match_number: 1, start_time: '10:00', end_time: '10:25' }]
  const gate = validateSingleMatchEdit({ match: matchRow, siblings, config: baseConfig })
  assert.equal(gate.ok, false)
  assert.ok(gate.error.includes('overlaps'))
})

test('validateSingleMatchEdit: rejects break shorter than configured', () => {
  const matchRow = { match_number: 2, start_time: '10:27' }
  const siblings = [{ match_number: 1, start_time: '10:00', end_time: '10:25' }]
  const gate = validateSingleMatchEdit({ match: matchRow, siblings, config: baseConfig })
  assert.equal(gate.ok, false)
  assert.ok(gate.error.includes('less than 5 min after'))
})

test('validateSingleMatchEdit: accepts a clean slot', () => {
  const matchRow = { match_number: 2, start_time: '10:30' }
  const siblings = [{ match_number: 1, start_time: '10:00', end_time: '10:25' }]
  const gate = validateSingleMatchEdit({ match: matchRow, siblings, config: baseConfig })
  assert.equal(gate.ok, true)
})

test('validateDayDateEdit: rejects out-of-order same-round day', () => {
  const dayRow = { id: 'd2', round_id: 'r1', day_number: 2, date: '2026-05-01' }
  const allDays = [
    day('d1', 'r1', 1, '2026-05-02'),
    day('d2', 'r1', 2, '2026-05-01')
  ]
  const rounds = [{ id: 'r1', round_number: 1 }]
  const gate = validateDayDateEdit({ day: dayRow, editedDate: '2026-05-01', allDays, rounds })
  assert.equal(gate.ok, false)
  assert.ok(gate.error.includes('must be after'))
})

test('validateDayDateEdit: rejects round-start-before-previous-finishes', () => {
  const dayRow = { id: 'd2', round_id: 'r2', day_number: 1, date: '2026-05-01' }
  const allDays = [
    day('d1', 'r1', 1, '2026-05-03'),
    day('d2', 'r2', 1, '2026-05-01')
  ]
  const rounds = [{ id: 'r1', round_number: 1 }, { id: 'r2', round_number: 2 }]
  const gate = validateDayDateEdit({ day: dayRow, editedDate: '2026-05-01', allDays, rounds })
  assert.equal(gate.ok, false)
  assert.ok(gate.error.includes('Round 2 must start after'))
})

test('validateDayDateEdit: accepts a valid date', () => {
  const dayRow = { id: 'd2', round_id: 'r1', day_number: 2, date: '2026-05-01' }
  const allDays = [
    day('d1', 'r1', 1, '2026-05-01'),
    day('d2', 'r1', 2, '2026-05-01')
  ]
  const rounds = [{ id: 'r1', round_number: 1 }]
  const gate = validateDayDateEdit({ day: dayRow, editedDate: '2026-05-03', allDays, rounds })
  assert.equal(gate.ok, true)
})