import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRoadmapSchedule } from '../src/components/roadmapViewModel.js'
import { buildParticipantRoadmap } from '../server/participantRoadmap.js'

// ---------------------------------------------------------------------------
// Roadmap view-model contract (district model).
//
// buildRoadmapSchedule() shapes raw roadmap rows into { rounds, matches,
// timelineByRound, matchById }. These tests assert that contract. The previous
// revision asserted a `{ groups, timeline, groupsByRound }` shape that no longer
// exists.
// ---------------------------------------------------------------------------

function fixture() {
  const rounds = [
    { id: 'R1', round_number: 1, name: 'District Qualifiers', teams_advancing: 32, map: 'Erangel', date: '2026-10-10' },
    { id: 'R2', round_number: 2, name: 'Semi-final', teams_advancing: 16, map: 'Miramar', date: '2026-10-15' },
    { id: 'R3', round_number: 3, name: 'Grand Final', teams_advancing: null, map: 'Sanhok', date: '2026-10-16' },
  ]
  const days = []
  const groups = []
  const rooms = []
  const matches = []
  const assignments = []

  for (let districtIndex = 0; districtIndex < 4; districtIndex += 1) {
    const groupId = `R1-G${districtIndex + 1}`
    const dayId = `R1-D${districtIndex + 1}`
    days.push({ id: dayId, round_id: 'R1', day_number: districtIndex + 1, date: `2026-10-0${districtIndex + 1}` })
    groups.push({ id: groupId, day_id: dayId, round_id: 'R1', group_name: `District ${districtIndex + 1}`, sequence: districtIndex + 1 })
    for (let matchNumber = 1; matchNumber <= 3; matchNumber += 1) {
      const matchId = `${groupId}-M${matchNumber}`
      const roomId = `${groupId}-ROOM${matchNumber}`
      rooms.push({ id: roomId, room_number: matchNumber, capacity: 16, round_id: 'R1', day_id: dayId, group_id: groupId })
      matches.push({ id: matchId, day_id: dayId, round_id: 'R1', group_id: groupId, room_id: roomId, match_number: matchNumber, start_time: `1${matchNumber}:00`, end_time: `1${matchNumber}:25`, status: 'SCHEDULED', group_name: `District ${districtIndex + 1}`, room_identifier: `secret-${matchId}`, room_password: 'private' })
      for (let teamNumber = 1; teamNumber <= 16; teamNumber += 1) {
        assignments.push({ id: `${matchId}-A${teamNumber}`, match_id: matchId, group_id: groupId, day_id: dayId, room_id: roomId, tournament_team_id: `G${districtIndex + 1}-T${teamNumber}` })
      }
    }
  }

  days.push({ id: 'R2-D1', round_id: 'R2', day_number: 1, date: '2026-10-15' })
  groups.push({ id: 'R2-G1', day_id: 'R2-D1', round_id: 'R2', group_name: 'Semi-final 1', sequence: 1 })
  for (let matchNumber = 1; matchNumber <= 2; matchNumber += 1) {
    const matchId = `R2-M${matchNumber}`
    const roomId = `R2-ROOM${matchNumber}`
    rooms.push({ id: roomId, room_number: matchNumber, capacity: 16, round_id: 'R2', day_id: 'R2-D1', group_id: 'R2-G1' })
    matches.push({ id: matchId, day_id: 'R2-D1', round_id: 'R2', group_id: 'R2-G1', room_id: roomId, match_number: matchNumber, start_time: matchNumber === 1 ? '10:00' : '12:00', end_time: matchNumber === 1 ? '10:25' : '12:25', group_name: 'Semi-final 1' })
  }

  return { rounds, days, groups, rooms, matches, assignments }
}

test('view-model shapes every match with its district label and round context', () => {
  const schedule = buildRoadmapSchedule(fixture())
  const r1Matches = schedule.matches.filter((m) => m.roundNumber === 1)

  assert.equal(r1Matches.length, 12)
  assert.deepEqual(
    [...new Set(r1Matches.map((m) => m.groupName))].sort(),
    ['District 1', 'District 2', 'District 3', 'District 4'],
  )
  for (const match of r1Matches) {
    assert.equal(match.roundId, 'R1')
    assert.equal(match.isGrandFinal, false)
    assert.ok(match.label.includes('District'))
    assert.ok(match.startTime && match.endTime)
  }
})

test('timelineByRound groups matches by round and preserves round order', () => {
  const schedule = buildRoadmapSchedule(fixture())

  assert.deepEqual(schedule.timelineByRound.map((s) => s.round.id), ['R1', 'R2'], 'empty rounds are omitted')
  const r1 = schedule.timelineByRound.find((s) => s.round.id === 'R1')
  assert.equal(r1.matches.length, 12)
  const r2 = schedule.timelineByRound.find((s) => s.round.id === 'R2')
  assert.deepEqual(r2.matches.map((m) => m.startTime), ['10:00', '12:00'])

  // Every match id is unique across the shaped match list.
  const ids = schedule.matches.map((m) => m.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(schedule.matchById.size, ids.length)
})

test('participant shaping suppresses room credentials and keeps only assigned matches', () => {
  const source = fixture()
  source.assignments = source.assignments.filter((a) => a.tournament_team_id === 'G1-T1')
  const participantRoadmap = buildParticipantRoadmap(source, 'G1-T1', { releaseMinutes: 15 })
  const schedule = buildRoadmapSchedule(participantRoadmap, { participant: true })

  // Only the G1-T1 district's three matches survive.
  assert.equal(schedule.matches.length, 3)
  assert.equal(schedule.matches.every((m) => m.id.startsWith('R1-G1-')), true)
  for (const match of schedule.matches) {
    assert.equal(match.roomIdentifier, null)
    assert.equal(match.roomPassword, null)
    assert.equal(match.assignedTeams, null)
  }
})
